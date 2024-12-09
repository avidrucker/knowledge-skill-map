import { useState, useRef, useEffect, useCallback } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';

const START_NODE_ID = 'node-1';

const nodeTypes = {
  topic: { color: 'purple', text: 'white' },
  assertion: { color: 'blue', text: 'white' },
  actionable: { color: 'green', text: 'white'},
  question: { color: 'yellow', text: 'black'},
  blocker: { color: 'red', text: 'white'},
};

const App = () => {
  const [elements, setElements] = useState([
    {
      group: 'nodes',
      classes: ['basic-node'],
      data: { id: START_NODE_ID, label: 'new topic', type: 'topic' },
      position: { x: 400, y: 300 },
      locked: true, // cannot move the start node
    },
  ]);

  const cyRef = useRef(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  // const [newLabel, setNewLabel] = useState('');

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
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
      while(cyRef.current.getElementById(`node-${nextId}`).length > 0) {
        nextId += 1; 
      }
      // console.log("nextId: ", nextId);
      const newId = `node-${nextId}`;
      const newNode = {
        data: { id: newId, label: `Node ${nextId}`, type: 'topic' },
        classes: ['basic-node'],
        group: 'nodes',
        position: {
          x: selectedNode.position('x') + 100,
          y: selectedNode.position('y'),
        },
      };
      const newEdge = {
        group: 'edges',
        data: { source: parentNodeId, target: newId },
      };
      // console.log("newNode: ", newNode);
      // console.log("newEdge: ", newEdge);
      setElements((prevElements) => [...prevElements, newNode, newEdge]);
    } else {
      alert('Please select a node to connect the new node to.');
    }
  };

  // Delete the selected node and its descendants
  const deleteNode = (currentNodeId) => {
    if (currentNodeId && cyRef.current) {
      const nodesToRemove = cyRef.current.collection();
      const startingNode = cyRef.current.$id(currentNodeId);
      nodesToRemove.merge(startingNode.descendants().union(startingNode));
      const idsToRemove = nodesToRemove.map((n) => n.id());
      setElements((els) =>
        els.filter((el) => {
          const elId = el.data.id;
          if (idsToRemove.includes(elId)) return false;
          if (el.data.source && idsToRemove.includes(el.data.source)) return false;
          if (el.data.target && idsToRemove.includes(el.data.target)) return false;
          return true;
        })
      );
      setSelectedNodeId(null);
    } else {
      alert('Please select a node to delete.');
    }
  };

  const removeTempNodes = useCallback(() => {
    // console.log("removing temp nodes: ", elements);
    setElements((els) =>
      els.filter((el) => {
        const isActionNode = el.classes && el.classes.includes('action-node');
        return !isActionNode;
      })
    );
    tempNodesRef.current = [];
  }, [setElements]);

  const createActionNode = (id, label, position, extraClasses = '') => {
    return {
      data: { id, label },
      position,
      selectable: false,
      grabbable: false,
      classes: `action-node ${extraClasses}`,
    };
  };

  const showColorButtons = useCallback((node) => {
    const nodeId = node.id();
    const pos = node.position();
    const offsetY = 60;
    const spacing = 40;
    const colors = [
      { type: 'topic', color: 'purple' },
      { type: 'assertion', color: 'blue' },
      { type: 'actionable', color: 'green' },
      { type: 'question', color: 'yellow' },
      { type: 'blocker', color: 'red' },
    ];

    const newTempNodes = colors.map((c, i) => {
      const actionId = `color-btn-${c.type}-${nodeId}`;
      return {
        ...createActionNode(actionId, c.type, {
          x: pos.x + (i - 2) * spacing,
          y: pos.y - offsetY,
        }, 'color-btn'),
        classes: ['action-node', 'color-btn'],
        data: { 
          id: actionId, 
          label: c.type, 
          nodeParent: nodeId, 
          type: c.type, 
          color: c.color, 
          textColor: nodeTypes[c.type].text 
        },
      };
    });

    // console.log("newTempNodes: ", newTempNodes);

    setElements((els) => [...els, ...newTempNodes]);
    tempNodesRef.current.push(...newTempNodes.map(n => n.data.id));
  }, [setElements]);

  const showRenameDeleteButtons = useCallback((node) => {
    const nodeId = node.id();
    // console.log("showRenameDeleteButtons: ", nodeId);
    const pos = node.position();
    const offsetY = 60;

    setSelectedNodeId(nodeId);

    const actionButtons = [];
    const renameId = `btn-rename-${nodeId}`; ////
    actionButtons.push({
      ...createActionNode(renameId, 'Rename', { x: pos.x - 70, y: pos.y - offsetY }),
      data: { id: renameId, label: 'Rename', parentNode: nodeId }});

    const addNewId = `btn-add-new-${nodeId}`;
    actionButtons.push({
      ...createActionNode(addNewId, 'Add New', { x: pos.x, y: pos.y - offsetY }),
      data: { id: addNewId, label: 'Add New', parentNode: nodeId}});

    if (nodeId !== START_NODE_ID) {
      const deleteId = `btn-delete-${nodeId}`;
      actionButtons.push(
        {...createActionNode(deleteId, 'Delete', { x: pos.x + 70, y: pos.y - offsetY }),
        data: { id: deleteId, label: 'Delete', parentNode: nodeId }});
    }

    setElements((els) => [...els, ...actionButtons]);
    tempNodesRef.current.push(...actionButtons.map(a => a.data.id));
  }, [setElements]);

  const startRenaming = useCallback((node) => {
    setIsRenaming(true);
    setRenameValue(node.data('label'));
    const containerRect = cyRef.current.container().getBoundingClientRect();
    const pos = node.position(); // use node.position() instead of renderedPosition to avoid offsets
    setRenamePosition({
      x: containerRect.left + pos.x,
      y: containerRect.top + pos.y,
    });
  }, []);

  const commitRename = useCallback(() => {
    if (selectedNodeId) {
      setElements((els) => els.map((el) => {
        if (el.data.id === selectedNodeId) {
          return { ...el, data: { ...el.data, label: renameValue } };
        }
        return el;
      }));
    }
    setIsRenaming(false);
    setRenameValue('');
    removeTempNodes();
  }, [selectedNodeId, renameValue, setElements, removeTempNodes]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue('');
    removeTempNodes();
  }, [removeTempNodes]);

  const deleteNodeAndDescendants = useCallback((nodeId) => {
    if (nodeId === START_NODE_ID) return;
    const cy = cyRef.current;
    if (!cy) return;
  
    const startingNode = cy.getElementById(nodeId);
    // Use successors() to get all reachable nodes (descendants) instead of descendants()
    const descendants = startingNode.successors().nodes().union(startingNode);
  
    const idsToRemove = descendants.map((n) => n.id());
    setElements((els) => els.filter((el) => {
      const elId = el.data.id;
      if (idsToRemove.includes(elId)) return false;
      if (el.data.source && idsToRemove.includes(el.data.source)) return false;
      if (el.data.target && idsToRemove.includes(el.data.target)) return false;
      return true;
    }));
    removeTempNodes();
  }, [removeTempNodes, setElements]);  

  const changeNodeColorType = useCallback((nodeId, newType) => {
    // console.log("changing node color: ", nodeId, newType);
    if(!newType) {
      setElements((els) => els.map((el) => {
        if (el.data.id === nodeId) {
          return { ...el, data: { ...el.data } };
        }
        return el;
      }));
    } else {
      setElements((els) => els.map((el) => {
        if (el.data.id === nodeId) {
          return { ...el, data: { ...el.data, type: newType } };
        }
        return el;
      }));
    }
    
    removeTempNodes();
  }, [removeTempNodes, setElements]);

  const handleActionNodeClick = useCallback((node) => {
    const label = node.data('label');
    const parentNodeId = node.data('nodeParent') || node.data('parentNode');
    // console.log("node data: ", node.data());

    if (!parentNodeId) {
      console.error("Parent node ID is missing!");
      return;
    }

    if (label === 'Delete') {
      deleteNodeAndDescendants(parentNodeId);
      // deleteNode(parentNodeId);
    } else if (label === 'Rename') {
      const parentNode = cyRef.current.getElementById(parentNodeId);
      startRenaming(parentNode);
    } else if (label === 'Add New') {
      //// TODO: add new node
      addNode(parentNodeId);
      // removeTempNodes();
    }
    else {
      // color button
       ////
      changeNodeColorType(parentNodeId, label);
    }
  }, [changeNodeColorType]); // deleteNodeAndDescendants, startRenaming

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
  
    const onReady = () => {
      // console.log("Cytoscape is ready. Applying event handlers.");
      const onTapNode = (evt) => {
        const node = evt.target;
  
        // console.log("Tap node: ", node.id());
  
        if (node.hasClass('action-node')) {
          handleActionNodeClick(node);
          // console.log("Handling button press...");
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
          if (node.hasClass('basic-node')) {
            lastClickedNodeRef.current = null;
            lastClickTimeRef.current = 0;
          }
        } else {
          // Single click
          // console.log("Single click detected on node: ", node.id());
          if (!node.hasClass('action-node')) {
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
  
      cy.on('tap', 'node', onTapNode);
      cy.on('tap', onTapBackground);
  
      return () => {
        cy.off('tap', 'node', onTapNode);
        cy.off('tap', onTapBackground);
      };
    };
  
    cy.ready(onReady);
  }, []); // Empty dependency array ensures this runs once on mount
  
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
  
    cy.ready(() => {
      // console.log("Initial Cytoscape graph: ", cy.json());
      const initialNode = cy.getElementById('node-1');
      if (initialNode) {
        // console.log("Initial node found: ", initialNode.data());
      } else {
        // console.error("Initial node is missing!");
      }
    });
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitRename();
    else if (e.key === 'Escape') cancelRename();
  };

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={{
        position: 'absolute', 
        top: 0, 
        left: 0, 
        padding: '10px', 
        backgroundColor: 'rgba(0, 0, 0, 0.5)'
      }}>
        <div>current selected node: {selectedNodeId} </div>
      </div>
      <CytoscapeComponent
        elements={elements}
        style={{ width: '100%', height: '100%' }}
        cy={(cy) => (cyRef.current = cy)}
        layout={{ name: 'preset' }}
        stylesheet={[
          {
            selector: 'node',
            style: {
              'label': 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'background-color': '#888',
            },
          },
          {
            selector: 'node.basic-node',
            style: {
              shape: 'ellipse', // ensure always ellipse
              label: 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              width: 80,
              height: 80,
              'font-size': 12,
              'color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].text : '#fff';
              },
              'background-color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].color : '#888';
              },
              'border-width': (ele) => ele.data('id') === START_NODE_ID ? 2 : 0,
              'border-color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].text : '#fff';
              }
            },
          },
          // **New Selector: Styles for Parent Basic Nodes**
          {
            selector: 'node.basic-node:parent',
            style: {
              shape: 'ellipse', // Maintain ellipse shape for parent nodes
              'background-color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].color : '#888';
              },
              'color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].text : '#fff';
              },
              'border-width': (ele) => ele.data('id') === START_NODE_ID ? 2 : 0,
              'border-color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].text : '#fff';
              },
              'padding': '10px', // Adjust padding as needed
              'width': '80px',
              'height': '80px',
            },
          },
          // **New Selector: Styles for Selected Parent Basic Nodes**
          {
            selector: 'node.basic-node:parent:selected',
            style: {
              shape: 'ellipse', // Maintain ellipse shape when selected
              'border-width': 3, // Optional: Highlight border
              'border-color': '#000', // Optional: Change border color on selection
              'background-color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].color : '#888';
              },
              'color': (ele) => {
                const t = ele.data('type');
                return nodeTypes[t] ? nodeTypes[t].text : '#fff';
              },
            },
          },
          {
            selector: 'edge',
            style: {
              width: 2,
              'line-color': '#ccc',
              'target-arrow-color': '#ccc',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
            },
          },
          {
            selector: '.action-node',
            style: {
              shape: 'round-rectangle',
              'background-color': '#333',
              'text-valign': 'center',
              'text-halign': 'center',
              color: '#fff',
              'font-size': 10,
              width: 60,
              height: 25,
            },
          },
          {
            selector: '.color-btn',
            style: {
              shape: 'ellipse',
              width: 20,
              height: 20,
              'background-color': 'data(color)', // Use dynamic color from data
              label: '',
              'border-width': 1,
              'border-color': 'pink', // 'data(text)' || 
            }
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
            position: 'absolute',
            top: renamePosition.y - 40,
            left: renamePosition.x - 40,
            width: '80px',
            fontSize: '12px',
            padding: '2px'
          }}
          autoFocus
        />
      )}
    </div>
  );
};

export default App;
