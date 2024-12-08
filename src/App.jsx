// src/App.jsx
import React, { useState, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';

const App = () => {
  const [elements, setElements] = useState([
    {
      data: { id: 'node-1', label: 'new topic' },
      position: { x: 400, y: 300 },
    },
  ]);

  const cyRef = useRef(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [newLabel, setNewLabel] = useState('');

  // Handle node selection
  const handleNodeSelect = (event) => {
    const nodeId = event.target.data('id');
    setSelectedNodeId(nodeId);
    setNewLabel(event.target.data('label'));
  };

  // Handle node unselection
  const handleNodeUnselect = () => {
    setSelectedNodeId(null);
    setNewLabel('');
  };

  // Add a new node connected to the selected node
  const addNode = () => {
    if (selectedNodeId && cyRef.current) {
      const selectedNode = cyRef.current.$id(selectedNodeId);
      const newId = `node-${elements.length + 1}`;
      const newNode = {
        data: { id: newId, label: `Node ${elements.length + 1}` },
        position: {
          x: selectedNode.position('x') + 100,
          y: selectedNode.position('y'),
        },
      };
      const newEdge = {
        data: { source: selectedNodeId, target: newId },
      };
      setElements([...elements, newNode, newEdge]);
    } else {
      alert('Please select a node to connect the new node to.');
    }
  };

  // Delete the selected node and its descendants
  const deleteNode = () => {
    if (selectedNodeId && cyRef.current) {
      const nodesToRemove = cyRef.current.collection();
      const startingNode = cyRef.current.$id(selectedNodeId);
      nodesToRemove.merge(startingNode.descendants().union(startingNode));
      setElements((els) =>
        els.filter((el) => !nodesToRemove.ids().includes(el.data.id))
      );
      setSelectedNodeId(null);
    } else {
      alert('Please select a node to delete.');
    }
  };

  // Edit the label of the selected node
  const editNodeLabel = () => {
    if (selectedNodeId) {
      setElements((els) =>
        els.map((el) => {
          if (el.data.id === selectedNodeId) {
            return {
              ...el,
              data: { ...el.data, label: newLabel },
            };
          }
          return el;
        })
      );
    } else {
      alert('Please select a node to edit.');
    }
  };

  // Cytoscape event handlers
  const cyEvents = (cy) => {
    cyRef.current = cy;
    cy.on('select', 'node', handleNodeSelect);
    cy.on('unselect', 'node', handleNodeUnselect);
  };

  return (
    <div>
      <h1 style={{ margin: 0 }}>Knowledge and Skill Map</h1>
      <div style={{ display: 'flex', marginBottom: '10px', gap: '10px' }}>
        <button onClick={addNode}>Add Node</button>
        <button onClick={deleteNode}>Delete Node</button>
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Edit label"
        />
        <button onClick={editNodeLabel}>Update Label</button>
      </div>
      <CytoscapeComponent
        elements={elements}
        style={{ width: '100%', height: '600px' }}
        cy={cyEvents}
        layout={{ name: 'preset' }}
        stylesheet={[
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'background-color': '#888',
              width: 80,
              height: 80,
              'font-size': 12,
              color: '#fff',
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
            selector: 'node:selected',
            style: {
              'border-width': 4,
              'border-color': '#f00',
            },
          },
        ]}
        zoom={1}
        minZoom={0.5}
        maxZoom={2}
      />
    </div>
  );
};

export default App;
