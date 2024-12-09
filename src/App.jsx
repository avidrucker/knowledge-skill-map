import { useState, useRef, useEffect, useCallback } from "react";
import CytoscapeComponent from "react-cytoscapejs";

const START_NODE_ID = "node-1";

const nodeTypes = {
  topic: { color: "purple", text: "white" },
  assertion: { color: "blue", text: "white" },
  actionable: { color: "green", text: "white" },
  question: { color: "yellow", text: "black" },
  blocker: { color: "red", text: "white" },
};

const App = () => {
  const [elements, setElements] = useState([
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
      locked: true, // cannot move the start node
    },
  ]);

  const cyRef = useRef(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renamePosition, setRenamePosition] = useState({ x: 0, y: 0 });

  const tempNodesRef = useRef([]);
  const lastClickTimeRef = useRef(0);
  const lastClickedNodeRef = useRef(null);

  // Add a new node connected to the selected node
  const addNode = (parentNodeId) => {
    // console.log("selectedNodeId: ", parentNodeId);
    // console.log("cyRef: ", cyRef.current);
    if (parentNodeId && cyRef.current) {
      const selectedNode = cyRef.current.getElementById(parentNodeId);
      let nextId = 1;
      while (cyRef.current.getElementById(`node-${nextId}`).length > 0) {
        nextId += 1;
      }
      // console.log("nextId: ", nextId);
      const newId = `node-${nextId}`;
      const newNode = {
        data: { id: newId, label: `Node ${nextId}`, type: "topic", fontSize: 12 },
        classes: ["basic-node"],
        group: "nodes",
        position: {
          x: selectedNode.position("x") + 100,
          y: selectedNode.position("y"),
        },
      };
      const newEdge = {
        group: "edges",
        data: { source: parentNodeId, target: newId },
      };
      // console.log("newNode: ", newNode);
      // console.log("newEdge: ", newEdge);
      setElements((prevElements) => [...prevElements, newNode, newEdge]);
      return newId;
    } else {
      alert("Please select a node to connect the new node to.");
      return;
    }
  };

  const removeTempNodes = useCallback(() => {
    // console.log("removing temp nodes: ", elements);
    setElements((els) =>
      els.filter((el) => {
        const isActionNode = el.classes && el.classes.includes("action-node");
        return !isActionNode;
      })
    );
    tempNodesRef.current = [];
  }, [setElements]);

  const createActionNode = (id, label, position, extraClasses = "") => {
    return {
      data: { id, label },
      position,
      selectable: false,
      grabbable: false,
      classes: `action-node ${extraClasses}`,
    };
  };

  const showColorButtons = useCallback(
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
            {
              x: pos.x + (i - 2) * spacing,
              y: pos.y - offsetY,
            },
            "color-btn"
          ),
          classes: ["action-node", "color-btn"],
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

      // console.log("newTempNodes: ", newTempNodes);

      setElements((els) => [...els, ...newTempNodes]);
      tempNodesRef.current.push(...newTempNodes.map((n) => n.data.id));
    },
    [setElements]
  );

  const showRenameDeleteButtons = useCallback(
    (node) => {
      const nodeId = node.id();
      // console.log("showRenameDeleteButtons: ", nodeId);
      const pos = node.position();
      const offsetY = 60;

      setSelectedNodeId(nodeId);

      const actionButtons = [];
      const renameId = `btn-rename-${nodeId}`; ////
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

  const startRenaming = useCallback((node) => {
    let labelText = node.data("label");
    // Replace any \n with a space
    labelText = labelText.replace(/\n/g, " ");

    setIsRenaming(true);
    setRenameValue(labelText);
    const containerRect = cyRef.current.container().getBoundingClientRect();
    const pos = node.position(); // use node.position() instead of renderedPosition to avoid offsets
    setRenamePosition({
      x: containerRect.left + pos.x,
      y: containerRect.top + pos.y,
    });
  }, []);

  const commitRename = useCallback(() => {
    if (selectedNodeId && cyRef.current) {
      const cy = cyRef.current;

      let newLabel = renameValue.trim();

      // Try to balance lines if it's too long
      if (newLabel.length > 20) {
        newLabel = balanceTextLines(newLabel, 20);
      }

      setElements((els) =>
        els.map((el) => {
          if (el.data.id === selectedNodeId) {
            return { ...el, data: { ...el.data, label: newLabel } };
          }
          return el;
        })
      );

      // After updating elements, wait for them to apply, then fit text:
      setTimeout(() => {
        fitTextToNode(cy, selectedNodeId);
      }, 0);
    }
    setIsRenaming(false);
    setRenameValue("");
    removeTempNodes();
  }, [selectedNodeId, renameValue, setElements, removeTempNodes]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
    removeTempNodes();
  }, [removeTempNodes]);

  const deleteNodeAndDescendants = useCallback(
    (nodeId) => {
      if (nodeId === START_NODE_ID) return;
      const cy = cyRef.current;
      if (!cy) return;

      const startingNode = cy.getElementById(nodeId);
      // Use successors() to get all reachable nodes (descendants) instead of descendants()
      const descendants = startingNode.successors().nodes().union(startingNode);

      const idsToRemove = descendants.map((n) => n.id());
      setElements((els) =>
        els.filter((el) => {
          const elId = el.data.id;
          if (idsToRemove.includes(elId)) return false;
          if (el.data.source && idsToRemove.includes(el.data.source))
            return false;
          if (el.data.target && idsToRemove.includes(el.data.target))
            return false;
          return true;
        })
      );
      removeTempNodes();
    },
    [removeTempNodes, setElements]
  );

  const changeNodeColorType = useCallback(
    (nodeId, newType) => {
      // console.log("changing node color: ", nodeId, newType);
      if (!newType) {
        setElements((els) =>
          els.map((el) => {
            if (el.data.id === nodeId) {
              return { ...el, data: { ...el.data } };
            }
            return el;
          })
        );
      } else {
        setElements((els) =>
          els.map((el) => {
            if (el.data.id === nodeId) {
              return { ...el, data: { ...el.data, type: newType } };
            }
            return el;
          })
        );
      }

      removeTempNodes();
    },
    [removeTempNodes, setElements]
  );

  const handleActionNodeClick = useCallback(
    (node) => {
      const label = node.data("label");
      const clickedNodeId = node.id();
      const parentNodeId = node.data("nodeParent") || node.data("parentNode");
      console.log("parentNodeId: ", parentNodeId);
      console.log("clickedNodeId: ", clickedNodeId);

      if (!parentNodeId) {
        console.error("Parent node ID is missing!");
        return;
      }

      if (label === "Delete") {
        deleteNodeAndDescendants(parentNodeId);
        // deleteNode(parentNodeId);
      } else if (label === "Rename") {
        const parentNode = cyRef.current.getElementById(parentNodeId);
        startRenaming(parentNode);
      } else if (label === "Add New") {
        const newId = addNode(parentNodeId);
        setTimeout(() => {
          fitTextToNode(cyRef.current, newId);
        }, 0);
      } else {
        // color button
        changeNodeColorType(parentNodeId, label);
      }
    },
    [changeNodeColorType, deleteNodeAndDescendants, startRenaming]
  );

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const onReady = () => { 

      const onTapNode = (evt) => {
        const node = evt.target;

        if (node.hasClass("action-node")) {
          handleActionNodeClick(node);
          removeTempNodes();
          return;
        }

        removeTempNodes();

        const currentTime = Date.now();
        if (
          lastClickedNodeRef.current &&
          lastClickedNodeRef.current.id() === node.id() &&
          currentTime - lastClickTimeRef.current < 300
        ) {
          // Double click
          // console.log("Double click detected on node: ", node.id());
          setSelectedNodeId(node.id()); // ensure state is updated
          showRenameDeleteButtons(node);
          if (node.hasClass("basic-node")) {
            lastClickedNodeRef.current = null;
            lastClickTimeRef.current = 0;
          }
        } else {
          // Single click
          // console.log("Single click detected on node: ", node.id());
          if (!node.hasClass("action-node")) {
            lastClickedNodeRef.current = node;
            lastClickTimeRef.current = currentTime;
            setSelectedNodeId(node.id());
          }
          showColorButtons(node);
        }
      };

      const onTapBackground = (evt) => {
        if (evt.target === cy) {
          // console.log("Tap background detected. Resetting selected node ID");
          setSelectedNodeId(null);
          removeTempNodes();
        }
      };

      // prevent handlers from being reattached on hot-reload
      if (!cy.scratch('_handlersAttached')) { 
        cy.on("tap", "node", onTapNode);
        cy.on("tap", onTapBackground);
        // Mark that handlers are now attached
        cy.scratch('_handlersAttached', true);
      } else {
        // console.log("handlers already attached, not reattaching");
      }

      return () => {
        cy.off("tap", "node", onTapNode);
        cy.off("tap", onTapBackground);
      };
    };

    cy.ready(onReady);

  }, []); // Empty dependency array ensures this runs once on mount

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
  
    // Only after the graph has been drawn (rendered)
    cy.once('render', () => {
      const initialNode = cy.getElementById('node-1');
      if (initialNode && initialNode.length > 0) {
        fitTextToNode(cy, 'node-1');
      }
    });
  }, []);  

  const handleKeyDown = (e) => {
    if (e.key === "Enter") commitRename();
    else if (e.key === "Escape") cancelRename();
  };

  function balanceTextLines(text, maxCharsPerLine = 20) {
    // Simple heuristic: break the text into chunks of ~maxCharsPerLine
    const words = text.split(" ");
    let lines = [];
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

  function fitTextToNode(cy, nodeId, minSize = 6, maxSize = 40) {
    const node = cy.getElementById(nodeId);

    let size = minSize;
    let fits = true;

    // Increase size until it doesn't fit
    while (size <= maxSize) {
      node.data("fontSize", size);
      cy.forceRender();

      const labelBB = node.boundingBox({ label: true });
      const nodeBB = node.boundingBox({});
      const nodeDiameter = Math.min(nodeBB.w, nodeBB.h);

      // If it doesn't fit, break out
      if ((labelBB.w > (nodeDiameter * 1)) || (labelBB.h > (nodeDiameter * 1))) {
        fits = false;
        break;
      }

      size++;
    }

    // If the last increment didn't fit, step back to the previous size
    if (!fits) {
      size = size - 1;
      node.data("fontSize", size);
    }
    
    cy.forceRender();

    // update fontSize data inside of the elements array
    setElements((els) =>
      els.map((el) => {
        if (el.data.id === nodeId) {
          return { ...el, data: { ...el.data, fontSize: size } };
        }
        return el;
      })
    );
  }

  return (
    <div style={{ width: "100%", height: "100vh", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          padding: "10px",
          backgroundColor: "rgba(0, 0, 0, 0.5)",
        }}
      >
        <div>current selected node: {selectedNodeId} </div>
      </div>
      <CytoscapeComponent
        elements={elements}
        style={{ width: "100%", height: "100%" }}
        cy={(cy) => (cyRef.current = cy)}
        layout={{ name: "preset" }}
        stylesheet={[
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
              shape: "ellipse", // ensure always ellipse
              label: "data(label)",
              "text-valign": "center",
              "text-halign": "center",
              "text-wrap": "wrap",
              // "text-max-width": "80px", // TODO: make this dynamic?
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
              "border-width": 1, // (ele) => ele.data('id') === START_NODE_ID ? 2 : 0,
              "border-color": (ele) => {
                const t = ele.data("type");
                return nodeTypes[t] ? nodeTypes[t].text : "#fff";
              },
            },
          },
          // **New Selector: Styles for Parent Basic Nodes**
          {
            selector: "node.basic-node:parent",
            style: {
              shape: "ellipse", // Maintain ellipse shape for parent nodes
              "background-color": (ele) => {
                const t = ele.data("type");
                return nodeTypes[t] ? nodeTypes[t].color : "#888";
              },
              color: (ele) => {
                const t = ele.data("type");
                return nodeTypes[t] ? nodeTypes[t].text : "#fff";
              },
              "border-width": (ele) =>
                ele.data("id") === START_NODE_ID ? 2 : 0,
              "border-color": (ele) => {
                const t = ele.data("type");
                return nodeTypes[t] ? nodeTypes[t].text : "#fff";
              },
              padding: "10px", // Adjust padding as needed
              width: "80px",
              height: "80px",
            },
          },
          // **New Selector: Styles for Selected Parent Basic Nodes**
          {
            selector: "node.basic-node:parent:selected",
            style: {
              shape: "ellipse", // Maintain ellipse shape when selected
              "border-width": 3, // Optional: Highlight border
              "border-color": "#000", // Optional: Change border color on selection
              "background-color": (ele) => {
                const t = ele.data("type");
                return nodeTypes[t] ? nodeTypes[t].color : "#888";
              },
              color: (ele) => {
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
              "background-color": "data(color)", // Use dynamic color from data
              label: "",
              "border-width": 1,
              "border-color": "pink", // 'data(text)' ||
            },
          },
        ]}
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
