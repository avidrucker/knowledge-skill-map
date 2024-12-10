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

//
// ===== Utility Functions =====
//

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

  // Try increasing line counts from 1 up to number of words
  for (let lineCount = 1; lineCount <= words.length; lineCount++) {
    const candidate = breakTextIntoLines(words, lineCount);
    node.data("label", candidate);
    node.data("fontSize", fontSize);
    cy.forceRender();

    const labelBB = node.boundingBox({ label: true });
    // Check if both width and height of the label fit within targetSize
    if (labelBB.w <= targetSize && labelBB.h <= targetSize) {
      return { label: candidate, fontSize };
    }
  }

  return null;
}

/**
 * Attempt to fit text in the node's circle, using multiple lines and adjusting fontSize.
 * This tries from large to smaller font sizes until it finds the largest that fits.
 */
function fitTextInCircle(cy, nodeId, setElements) {
  const node = cy.getElementById(nodeId);
  if (!node || node.empty()) return;

  const nodeBB = node.boundingBox({});
  const nodeDiameter = Math.min(nodeBB.w, nodeBB.h);

  // We'll fill about 90% of the node's diameter
  const targetSize = Math.round(nodeDiameter * 1.0);

  // Extract the current label (without line breaks, we'll re-add them)
  const originalLabel = node.data("label").replace(/\n/g, " ");

  let bestFit = null;
  let maxFontSize = 100; // start large
  let minFontSize = 6;

  // We'll try from largest to smaller until we find a fitting layout
  for (let size = maxFontSize; size >= minFontSize; size--) {
    const layout = findLayoutThatFits(
      originalLabel,
      size,
      targetSize,
      node,
      cy
    );
    if (layout) {
      bestFit = layout;
      // Since we are going top-down, the first fit is the largest font size that works
      break;
    }
  }

  // If we found a best fit, update the node data in our elements
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
    // If no fit found, just leave as is or use a default small font
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
  const [elements, setElements] = useState(initialElements);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamePosition, setRenamePosition] = useState({ x: 0, y: 0 });

  const tempNodesRef = useRef([]);
  const cyRef = useRef(null);

  const lastClickTimeRef = useRef(0);
  const lastClickedNodeRef = useRef(null);

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

  /**
   * Add a new child node connected to the given parent node.
   */
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

  /**
   * Show color selection action-nodes for a single-clicked node.
   */
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

  /**
   * Show rename/delete/add action-nodes for a double-clicked node.
   */
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

  /**
   * Start the renaming process for a given node.
   */
  const startRenaming = useCallback((node) => {
    let labelText = node.data("label").replace(/\n/g, " ");
    setIsRenaming(true);
    setRenameValue(labelText);

    const containerRect = cyRef.current.container().getBoundingClientRect();
    const pos = node.position();
    setRenamePosition({
      x: containerRect.left + pos.x,
      y: containerRect.top + pos.y,
    });
  }, []);

  /**
   * Commit a rename action.
   */
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

      // After label update, fit text using our new method
      setTimeout(() => {
        fitTextInCircle(cy, selectedNodeId, setElements);
      }, 0);
    }
    setIsRenaming(false);
    setRenameValue("");
    clearActionNodes();
  }, [selectedNodeId, renameValue, setElements, clearActionNodes]);

  /**
   * Cancel renaming.
   */
  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
    clearActionNodes();
  }, [clearActionNodes]);

  /**
   * Delete a node and all its descendants.
   */
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

  /**
   * Change a node's type/color.
   */
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
    },
    [clearActionNodes, setElements]
  );

  /**
   * Handle clicks on action nodes (color, rename, add new, delete).
   */
  const handleActionNodeClick = useCallback(
    (node) => {
      const label = node.data("label");
      const parentNodeId = node.data("nodeParent") || node.data("parentNode");
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
        // label is a node type (color)
        changeNodeColorType(parentNodeId, label);
      }
    },
    [changeNodeColorType, deleteNodeAndDescendants, startRenaming, addNode]
  );

  //
  // ===== Cytoscape Initialization & Event Handling =====
  //

  // Handle keyboard shortcuts for renaming
  const handleKeyDown = (e) => {
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") cancelRename();
  };

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const onReady = () => {
      const onTapNode = (evt) => {
        const node = evt.target;

        // If it's an action-node (button), handle action
        if (node.hasClass("action-node")) {
          handleActionNodeClick(node);
          clearActionNodes();
          return;
        }

        // Clear any existing action nodes
        clearActionNodes();

        const currentTime = Date.now();
        // Check for double-click
        if (
          lastClickedNodeRef.current &&
          lastClickedNodeRef.current.id() === node.id() &&
          currentTime - lastClickTimeRef.current < 300
        ) {
          // Double click event
          setSelectedNodeId(node.id());
          displayNodeActions(node);
          lastClickedNodeRef.current = null;
          lastClickTimeRef.current = 0;
        } else {
          // Single click event
          lastClickedNodeRef.current = node;
          lastClickTimeRef.current = currentTime;
          setSelectedNodeId(node.id());
          displayColorOptions(node);
        }
      };

      const onTapBackground = (evt) => {
        if (evt.target === cy) {
          setSelectedNodeId(null);
          clearActionNodes();
        }
      };

      // Attach event handlers once
      if (!cy.scratch("_handlersAttached")) {
        console.log("attaching handlers");
        cy.on("tap", "node", onTapNode);
        cy.on("tap", onTapBackground);
        cy.scratch("_handlersAttached", true);
      } else {
        console.log("Handlers already attached, not reattaching.");
      }

      return () => {
        cy.off("tap", "node", onTapNode);
        cy.off("tap", onTapBackground);
      };
    };
    cy.ready(onReady);
  }, []);

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
        "border-color": "#000",
      },
    },
  ];

  //
  // ===== Render =====
  //

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
            top: renamePosition.y - 40,
            left: renamePosition.x - 40,
            width: "80px",
            fontSize: "12px",
            padding: "2px",
          }}
          autoFocus
        />
      )}
    </div>
  );
};

export default App;
