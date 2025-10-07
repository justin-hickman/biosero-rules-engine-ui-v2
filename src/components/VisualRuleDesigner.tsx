import React from 'react';
import ReactFlow, { addEdge, Background, Controls, MiniMap, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges, useNodesState, useEdgesState, ReactFlowProvider } from '@xyflow/react';
import sampleChain from '../mockData';
import { ChainData } from '../types';

const Palette = ({ onDragStart }: { onDragStart: (e: React.DragEvent, type: string) => void }) => (
  <div className="p-2">
    <div draggable onDragStart={(e) => onDragStart(e, 'rule')} className="mb-2 p-2 bg-blue-600 text-white rounded">Rule</div>
    <div draggable onDragStart={(e) => onDragStart(e, 'action')} className="mb-2 p-2 bg-green-600 text-white rounded">Action</div>
    <div draggable onDragStart={(e) => onDragStart(e, 'transformation')} className="mb-2 p-2 bg-purple-600 text-white rounded">Transformation</div>
  </div>
);

export const VisualRuleDesigner: React.FC<{ initialChain?: ChainData }> = ({ initialChain }) => {
  const initialNodes: any[] = Object.values((initialChain || sampleChain).nodes).map((n, i) => ({
    id: n.id,
    data: { label: n.label },
    position: { x: i * 220, y: 80 }
  }));

  const initialEdges: Edge[] = (initialChain || sampleChain).edges.map((e, i) => ({ id: `e-${i}`, source: e.from, target: e.to }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = React.useState<any>(null);

  const onConnect = React.useCallback((connection) => setEdges((eds) => addEdge(connection, eds)), [setEdges]);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent, reactFlowInstance: any) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    const id = `${type}-${Date.now()}`;
    const position = reactFlowInstance.project({ x: event.clientX, y: event.clientY });
  const newNode: any = { id, type: 'default', position, data: { label: `${type} ${id}` } };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodesChangeHandler = (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds));
  const onEdgesChangeHandler = (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds));

  // ReactFlow's exported component may not have perfect TSX typings in this workspace; cast to any for JSX usage
  const RF: any = ReactFlow as any;

  return (
    <div className="flex h-full">
      <div className="w-48 bg-card border-r p-2">
        <Palette onDragStart={onDragStart} />
      </div>
      <div className="flex-1 h-[600px]">
        <ReactFlowProvider>
          <RF
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChangeHandler}
            onEdgesChange={onEdgesChangeHandler}
            onInit={() => {}}
            onConnect={onConnect}
            onDrop={(event) => onDrop(event, { project: (pos: any) => ({ x: pos.x - 100, y: pos.y - 80 }) })}
            onDragOver={(e) => e.preventDefault()}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </RF>
        </ReactFlowProvider>
      </div>
      <div className="w-64 border-l p-2">
        <h4 className="text-sm font-medium mb-2">Properties</h4>
        {selectedNode ? (
          <div>
            <div className="text-xs font-medium">{selectedNode.data?.label}</div>
            <button className="mt-2 px-2 py-1 bg-red-600 text-white rounded">Delete</button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Select a node to see properties</div>
        )}
      </div>
    </div>
  );
};

export default VisualRuleDesigner;
