import { useState, useRef, useEffect, useCallback } from "react";
import CytoscapeComponent from "react-cytoscapejs";

//
// ===== Constants and Types =====
//

const START_NODE_ID = "node-1";

const nodeTypes = {
  topic: { color: "purple", text: "white" },
  assertion: { color: "blue", text: "white" },
  actionable: { color: "green", text: "white" },
  question: { color: "yellow", text: "black" },
  blocker: { color: "red", text: "white" },
};

const initialElements = [
  {
    group: "nodes",
    classes: ["basic-node"],
    data: {
      id: START_NODE_ID,
      label: "Node 1",
      type: "topic",
      fontSize: 12,
    },
    position: { x: 400, y: 300 },
    locked: true, // the start node is immovable and non-deletable
  },
];

const initialPanZoom = { x: 0, y: 0, zoom: 1 };

//
// ===== Utility Functions =====
//

/**
 * Map a zoom level to a certain range of output values.
 * This function clamps output between outMin and outMax.
 */
function mapZoomToVal(zoom, { zoomMin, zoomMax, outMin, outMax }) {
  const out =
    outMin + ((zoom - zoomMin) / (zoomMax - zoomMin)) * (outMax - outMin);
  return Math.min(Math.max(out, outMin), outMax);
}

/**
 * Break long text into multiple lines to fit better within a node (simple heuristic).
 */
function balanceTextLines(text, maxCharsPerLine = 20) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = [];
  let currentCount = 0;

  words.forEach((word) => {
    if (currentCount + word.length <= maxCharsPerLine) {
      currentLine.push(word);
      currentCount += word.length + 1;
    } else {
      lines.push(currentLine.join(" "));
      currentLine = [word];
      currentCount = word.length + 1;
    }
  });

  if (currentLine.length > 0) lines.push(currentLine.join(" "));

  return lines.join("\n");
}

/**
 * Break text into a given number of lines as evenly as possible.
 */
function breakTextIntoLines(words, lineCount) {
  const lines = [];
  const wordsPerLine = Math.ceil(words.length / lineCount);

  for (let i = 0; i < words.length; i += wordsPerLine) {
    lines.push(words.slice(i, i + wordsPerLine).join(" "));
  }

  return lines.join("\n");
}

/**
 * Try to find a layout (with a certain number of lines) that fits within the target size at a given fontSize.
 */
function findLayoutThatFits(text, fontSize, targetSize, node, cy) {
  const words = text.split(" ");

  for (let lineCount = 1; lineCount <= words.length; lineCount++) {
    const candidate = breakTextIntoLines(words, lineCount);
    node.data("label", candidate);
    node.data("fontSize", fontSize);
    cy.forceRender();

    const labelBB = node.boundingBox({ label: true });
    if (labelBB.w <= targetSize && labelBB.h <= targetSize) {
      return { label: candidate, fontSize: fontSize * 0.8 };
    }
  }

  return null;
}

/**
 * Attempt to fit text in the node's circle, using multiple lines and adjusting fontSize.
 */
function fitTextInCircle(cy, nodeId, setElements) {
  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return;

  const nodeBB = node.boundingBox({});
  const nodeDiameter = Math.min(nodeBB.w, nodeBB.h);
  const targetSize = Math.round(nodeDiameter * 1.0);

  const originalLabel = node.data("label").replace(/\n/g, " ");

  let bestFit = null;
  let maxFontSize = 100;
  let minFontSize = 6;

  for (let size = maxFontSize; size >= minFontSize; size--) {
    const layout = findLayoutThatFits(originalLabel, size, targetSize, node, cy);
    if (layout) {
      bestFit = layout;
      break;
    }
  }

  if (bestFit) {
    setElements((els) =>
      els.map((el) =>
        el.data.id === nodeId
          ? {
              ...el,
              data: {
                ...el.data,
                label: bestFit.label,
                fontSize: bestFit.fontSize,
              },
            }
          : el
      )
    );
  } else {
    setElements((els) =>
      els.map((el) =>
        el.data.id === nodeId
          ? { ...el, data: { ...el.data, fontSize: minFontSize } }
          : el
      )
    );
  }
}

/**
 * Create a small "action node" (button node) near another node.
 */
function createActionNode(id, label, position, extraClasses = "") {
  return {
    data: { id, label },
    position,
    selectable: false,
    grabbable: false,
    classes: `action-node ${extraClasses}`,
  };
}

//
// ===== Main Component =====
//

const App = () => {
  //
  // ===== State Variables =====
  //
  const [elements, setElements] = useState(() => {
    const savedState = localStorage.getItem("graphState");
    if (savedState) {
      const state = JSON.parse(savedState);
      return state.elements || initialElements;
    }
    return initialElements;
  });
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamePosition, setRenamePosition] = useState({ x: 0, y: 0 });

  const cyRef = useRef(null);
  const tempNodesRef = useRef([]);

  const lastClickTimeRef = useRef(0);
  const lastClickedNodeRef = useRef(null);

  const lastBackgroundClickTimeRef = useRef(0);

  // For dynamically sizing the rename input
  const [currentZoom, setCurrentZoom] = useState(() => {
    const savedState = localStorage.getItem("graphState");
    if (savedState) {
      const state = JSON.parse(savedState);
      return state.zoom || initialPanZoom.zoom;
    }
    return initialPanZoom.zoom;
  });
  const [currentPan, setCurrentPan] = useState(() => {
    const savedState = localStorage.getItem("graphState");
    if (savedState) {
      const state = JSON.parse(savedState);
      return state.pan || initialPanZoom.pan;
    }
    return initialPanZoom.pan;
  });

  // Track whether the state has been loaded from local storage
  const [isLoadedFromLocalStorage, setIsLoadedFromLocalStorage] = useState(false);

  //
  // ===== Local Storage Load on Mount =====
  //

  useEffect(() => {
    // console.log("attempting to load from local storage...");
    const savedState = localStorage.getItem("graphState");
    if (savedState) {
      // console.log("loading from local storage: ", savedState);
      const state = JSON.parse(savedState);
      setElements(state.elements);
      // We'll set zoom/pan after cy is ready
      if (cyRef.current) {
        cyRef.current.one("render", () => {
          cyRef.current.zoom(state.zoom || initialPanZoom.zoom);
          cyRef.current.pan(state.pan || initialPanZoom.pan);
        });
      }
      setIsLoadedFromLocalStorage(true);
    } else {
      // console.log("no saved state found in local storage");
      setIsLoadedFromLocalStorage(true);
    }
  }, []);

  //
  // ===== Save to Local Storage on changes =====
  //

  useEffect(() => {
    if (isLoadedFromLocalStorage && cyRef.current) {
      const currentState = {
        elements,
        zoom: cyRef.current.zoom(),
        pan: cyRef.current.pan(),
      };
      // console.log("saving to local storage: ", currentState);
      localStorage.setItem("graphState", JSON.stringify(currentState));
    }
  }, [elements, isLoadedFromLocalStorage, currentZoom, currentPan]);

  //
  // ===== Action Node Cleanup =====
  //

  const clearActionNodes = useCallback(() => {
    setElements((els) =>
      els.filter((el) => !(el.classes && el.classes.includes("action-node")))
    );
    tempNodesRef.current = [];
  }, [setElements]);

  //
  // ===== Node Manipulation Helpers =====
  //

  const addNode = useCallback(
    (parentNodeId) => {
      if (!parentNodeId || !cyRef.current) {
        alert("Please select a node to connect the new node to.");
        return null;
      }

      const cy = cyRef.current;
      const parentNode = cy.getElementById(parentNodeId);
      let nextId = 1;
      while (cy.getElementById(`node-${nextId}`).length > 0) {
        nextId += 1;
      }

      const newId = `node-${nextId}`;
      const newNode = {
        data: {
          id: newId,
          label: `Node ${nextId}`,
          type: "topic",
          fontSize: 12,
        },
        classes: ["basic-node"],
        group: "nodes",
        position: {
          x: parentNode.position("x") + 100,
          y: parentNode.position("y"),
        },
      };
      const newEdge = {
        group: "edges",
        data: { source: parentNodeId, target: newId },
      };

      setElements((prev) => [...prev, newNode, newEdge]);
      return newId;
    },
    [setElements]
  );

  const displayColorOptions = useCallback(
    (node) => {
      const nodeId = node.id();
      const pos = node.position();
      const offsetY = 60;
      const spacing = 40;

      const colors = [
        { type: "topic", color: "purple" },
        { type: "assertion", color: "blue" },
        { type: "actionable", color: "green" },
        { type: "question", color: "yellow" },
        { type: "blocker", color: "red" },
      ];

      const newTempNodes = colors.map((c, i) => {
        const actionId = `color-btn-${c.type}-${nodeId}`;
        return {
          ...createActionNode(
            actionId,
            c.type,
            { x: pos.x + (i - 2) * spacing, y: pos.y - offsetY },
            "color-btn"
          ),
          data: {
            id: actionId,
            label: c.type,
            nodeParent: nodeId,
            type: c.type,
            color: c.color,
            textColor: nodeTypes[c.type].text,
          },
        };
      });

      setElements((els) => [...els, ...newTempNodes]);
      tempNodesRef.current.push(...newTempNodes.map((n) => n.data.id));
    },
    [setElements]
  );

  const displayNodeActions = useCallback(
    (node) => {
      const nodeId = node.id();
      const pos = node.position();
      const offsetY = 60;
      setSelectedNodeId(nodeId);

      const actionButtons = [];

      const renameId = `btn-rename-${nodeId}`;
      actionButtons.push({
        ...createActionNode(renameId, "Rename", {
          x: pos.x - 70,
          y: pos.y - offsetY,
        }),
        data: { id: renameId, label: "Rename", parentNode: nodeId },
      });

      const addNewId = `btn-add-new-${nodeId}`;
      actionButtons.push({
        ...createActionNode(addNewId, "Add New", {
          x: pos.x,
          y: pos.y - offsetY,
        }),
        data: { id: addNewId, label: "Add New", parentNode: nodeId },
      });

      if (nodeId !== START_NODE_ID) {
        const deleteId = `btn-delete-${nodeId}`;
        actionButtons.push({
          ...createActionNode(deleteId, "Delete", {
            x: pos.x + 70,
            y: pos.y - offsetY,
          }),
          data: { id: deleteId, label: "Delete", parentNode: nodeId },
        });
      }

      setElements((els) => [...els, ...actionButtons]);
      tempNodesRef.current.push(...actionButtons.map((a) => a.data.id));
    },
    [setElements]
  );

  //
  // ===== Context Menu for Background Double-Click =====
  //

  const displayBackgroundActions = useCallback((pos) => {
    // Create four action nodes: 'Fit Map', 'Reset', 'Export', 'Import'
    const offsetY = 30;
    const spacing = 70;
    const labels = ["Fit Map", "Reset", "Export", "Import"];
    const actionNodes = labels.map((label, i) => {
      const actionId = `btn-bg-${label.replace(" ", "-").toLowerCase()}`;
      return {
        ...createActionNode(
          actionId,
          label,
          { x: pos.x + (i - 1.5) * spacing, y: pos.y - offsetY }
        ),
        data: { id: actionId, label: label, parentNode: null }
      };
    });

    setElements((els) => [...els, ...actionNodes]);
    tempNodesRef.current.push(...actionNodes.map((n) => n.data.id));
  }, [setElements]);

  //
  // ===== Rename Handling =====
  //

  const startRenaming = useCallback((node) => {
    let labelText = node.data("label").replace(/\n/g, " ");
    setIsRenaming(true);
    setRenameValue(labelText);

    // Use renderedPosition to get correct on-screen coordinates
    const nodePos = node.renderedPosition();
    setRenamePosition({ x: nodePos.x, y: nodePos.y });
  }, []);

  const commitRename = useCallback(() => {
    if (selectedNodeId && cyRef.current) {
      const cy = cyRef.current;
      let newLabel = renameValue.trim();
      if (newLabel.length > 20) {
        newLabel = balanceTextLines(newLabel, 20);
      }

      setElements((els) =>
        els.map((el) =>
          el.data.id === selectedNodeId
            ? { ...el, data: { ...el.data, label: newLabel } }
            : el
        )
      );

      setTimeout(() => {
        fitTextInCircle(cy, selectedNodeId, setElements);
      }, 0);
    }
    setIsRenaming(false);
    setRenameValue("");
    clearActionNodes();
  }, [selectedNodeId, renameValue, setElements, clearActionNodes]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
    clearActionNodes();
  }, [clearActionNodes]);

  //
  // ===== Node Deletion and Color Change =====
  //

  const deleteNodeAndDescendants = useCallback(
    (nodeId) => {
      if (nodeId === START_NODE_ID) return;
      const cy = cyRef.current;
      if (!cy) return;
      const startNode = cy.getElementById(nodeId);
      const descendants = startNode.successors().nodes().union(startNode);
      const idsToRemove = descendants.map((n) => n.id());

      setElements((els) =>
        els.filter((el) => {
          const elId = el.data?.id;
          const source = el.data?.source;
          const target = el.data?.target;
          if (idsToRemove.includes(elId)) return false;
          if (source && idsToRemove.includes(source)) return false;
          if (target && idsToRemove.includes(target)) return false;
          return true;
        })
      );
      clearActionNodes();
    },
    [clearActionNodes, setElements]
  );

  const changeNodeColorType = useCallback(
    (nodeId, newType) => {
      setElements((els) =>
        els.map((el) =>
          el.data.id === nodeId
            ? { ...el, data: { ...el.data, type: newType || el.data.type } }
            : el
        )
      );
      clearActionNodes();
      console.log("color updated for node");
    },
    [clearActionNodes, setElements]
  );

  //
  // ===== Export/Import Functions =====
  //

  const exportToJson = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      const data = {
        elements: elements,
        zoom: cy.zoom(),
        pan: cy.pan(),
      };
      // console.log("exporting data: ", data);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "graph.json";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  const importFromJson = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ee) => {
        const data = JSON.parse(ee.target.result);
        setElements(data.elements || initialElements);
        if (cyRef.current) {
          cyRef.current.one("render", () => {
            cyRef.current.zoom(data.zoom || 1); ////
            cyRef.current.pan(data.pan || { x: 0, y: 0 });
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const resetGraph = useCallback(() => {
    setElements(initialElements);
    //// resize node text for the initial node
    if (cyRef.current) {
      cyRef.current.one("render", () => {
        fitTextInCircle(cyRef.current, START_NODE_ID, setElements);
      });
    }
  }, []);

  //
  // ===== Handle Action Node Click =====
  //

  const handleActionNodeClick = useCallback(
    (node) => {
      const label = node.data("label");
      const parentNodeId = node.data("nodeParent") || node.data("parentNode");

      // Background actions have no parentNode, handle them first
      if (!parentNodeId && label) {
        if (label === "Fit Map") {
          cyRef.current.fit();
        } else if (label === "Reset") {
          resetGraph();
        } else if (label === "Export") {
          exportToJson();
        } else if (label === "Import") {
          importFromJson();
        }
        clearActionNodes();
        return;
      }

      if (!parentNodeId) return;

      if (label === "Delete") {
        deleteNodeAndDescendants(parentNodeId);
      } else if (label === "Rename") {
        const parentNode = cyRef.current.getElementById(parentNodeId);
        startRenaming(parentNode);
      } else if (label === "Add New") {
        const newId = addNode(parentNodeId);
        if (newId) {
          setTimeout(() => {
            fitTextInCircle(cyRef.current, newId, setElements);
          }, 0);
        }
      } else {
        // This is a color/type label
        changeNodeColorType(parentNodeId, label);
      }
    },
    [
      deleteNodeAndDescendants,
      startRenaming,
      addNode,
      changeNodeColorType,
      resetGraph,
      exportToJson,
      importFromJson,
      clearActionNodes,
    ]
  );

  //
  // ===== Keyboard Shortcuts for Renaming =====
  //

  const handleKeyDown = (e) => {
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") cancelRename();
  };

  //
  // ===== Cytoscape Initialization & Event Handling =====
  //

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Update currentZoom state whenever cy zooms or pans
    const updateZoomPan = () => {
      // console.log("updating zoom pan");
      setCurrentZoom(cy.zoom());
      setCurrentPan({...cy.pan()});
      // console.log("zoom: ", cy.zoom());
      // console.log("pan: ", cy.pan());
    };
    cy.on("zoom pan", updateZoomPan);

    const onReady = () => {
      const onTapNode = (evt) => {
        const node = evt.target;

        // If it's an action-node, handle action
        if (node.hasClass("action-node")) {
          handleActionNodeClick(node);
          clearActionNodes();
          return;
        }

        // Clear any existing action nodes
        clearActionNodes();

        const currentTime = Date.now();
        // Check for double-click on node
        if (
          lastClickedNodeRef.current &&
          lastClickedNodeRef.current.id() === node.id() &&
          currentTime - lastClickTimeRef.current < 300
        ) {
          // Double click on node
          setSelectedNodeId(node.id());
          displayNodeActions(node);
          lastClickedNodeRef.current = null;
          lastClickTimeRef.current = 0;
        } else {
          // Single click on node
          lastClickedNodeRef.current = node;
          lastClickTimeRef.current = currentTime;
          setSelectedNodeId(node.id());
          displayColorOptions(node);
        }
      };

      const onTapBackground = (evt) => {
        if (evt.target === cy) {
          const currentTime = Date.now();
          // Check double-click on background
          if (currentTime - lastBackgroundClickTimeRef.current < 300) {
            // Double click on background
            // Create context action nodes at the clicked position
            const evtPos = evt.position;
            displayBackgroundActions(evtPos);
            lastBackgroundClickTimeRef.current = 0;
          } else {
            lastBackgroundClickTimeRef.current = currentTime;
            setSelectedNodeId(null);
            clearActionNodes();
          }
        }
      };

      if (!cy.scratch("_handlersAttached")) {
        cy.on("tap", "node", onTapNode);
        cy.on("tap", onTapBackground);
        cy.scratch("_handlersAttached", true);
      }

      return () => {
        cy.off("tap", "node", onTapNode);
        cy.off("tap", onTapBackground);
      };
    };
    cy.ready(onReady);

    return () => {
      cy.off("zoom pan", updateZoomPan);
    };
  }, [
    displayNodeActions,
    displayColorOptions,
    displayBackgroundActions,
    handleActionNodeClick,
    clearActionNodes,
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Fit text on initial node after render
    cy.once("render", () => {
      const initialNode = cy.getElementById(START_NODE_ID);
      if (initialNode && initialNode.length > 0) {
        fitTextInCircle(cy, START_NODE_ID, setElements);
      }
    });
  }, [setElements]);

  //
  // ===== Cytoscape Stylesheet & Layout =====
  //

  const cyStylesheet = [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "background-color": "#888",
      },
    },
    {
      selector: "node.basic-node",
      style: {
        shape: "ellipse",
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "font-size": "data(fontSize)",
        width: 80,
        height: 80,
        color: (ele) => {
          const t = ele.data("type");
          return nodeTypes[t] ? nodeTypes[t].text : "#fff";
        },
        "background-color": (ele) => {
          const t = ele.data("type");
          return nodeTypes[t] ? nodeTypes[t].color : "#888";
        },
        "border-width": 1,
        "border-color": (ele) => {
          const t = ele.data("type");
          return nodeTypes[t] ? nodeTypes[t].text : "#fff";
        },
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#ccc",
        "target-arrow-color": "#ccc",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    {
      selector: ".action-node",
      style: {
        shape: "round-rectangle",
        "background-color": "#333",
        "text-valign": "center",
        "text-halign": "center",
        color: "#fff",
        "font-size": 10,
        width: 60,
        height: 25,
      },
    },
    {
      selector: ".color-btn",
      style: {
        shape: "ellipse",
        width: 20,
        height: 20,
        "background-color": "data(color)",
        label: "",
        "border-width": 1,
        "border-color": "#fff",
      },
    },
    {
      selector: "node:selected",
      style: {
        "border-width": 3,
      },
    },
  ];

  //
  // ===== Render =====
  //

  // Use a mapping for the rename input size
  // Example mapping: when zoom=1, font=12px, width=80px; scale linearly
  const zoomMappingFont = { zoomMin: 0.5, zoomMax: 2, outMin: 12, outMax: 24 };
  const zoomMappingWidth = { zoomMin: 0.5, zoomMax: 2, outMin: 40, outMax: 160 };

  const scaledFontSize = mapZoomToVal(currentZoom, zoomMappingFont);
  const scaledWidth = mapZoomToVal(currentZoom, zoomMappingWidth);

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          padding: "10px",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "#fff",
        }}
      >
        <div>Current selected node: {selectedNodeId || "None"}</div>
        <div>Current zoom: {currentZoom}</div>
        <div>Current pan: {currentPan.x} {currentPan.y}</div>
      </div>

      <CytoscapeComponent
        elements={elements}
        style={{ width: "100%", height: "100%" }}
        cy={(cy) => (cyRef.current = cy)}
        layout={{ name: "preset" }}
        stylesheet={cyStylesheet}
        zoom={1}
        minZoom={0.5}
        maxZoom={2}
      />

      {isRenaming && (
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={cancelRename}
          style={{
            position: "absolute",
            top: renamePosition.y - scaledWidth / 8,
            left: renamePosition.x - scaledWidth / 2,
            width: scaledWidth + "px",
            fontSize: scaledFontSize + "px",
            padding: "2px",
            background: "white",
            color: "black"
          }}
          autoFocus
        />
      )}
    </div>
  );
};

export default App;
