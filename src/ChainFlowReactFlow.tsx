import React from 'react';
import {
    ReactFlow,
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    useReactFlow,
    ReactFlowProvider,
    Connection,
    addEdge,
    Handle,
    Position,
    NodeProps,
    EdgeProps,
    MarkerType,
    getBezierPath,
    BaseEdge,
    getStraightPath
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toast } from 'sonner';
import { AlertCircle, Edit, Trash2, GitBranch, Workflow, GripVertical, Sparkles } from 'lucide-react';
import { Button } from './components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from './components/ui/dialog';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Textarea } from './components/ui/textarea';
import { Checkbox } from './components/ui/checkbox';
import dagre from 'dagre';
import { apiFetchOrderTemplates, apiFetchOrderTemplateDetails } from './App';

// Context for sharing handlers with node components
const NodeHandlersContext = React.createContext<{
    onEdit?: (nodeId: string) => void;
    onDelete?: (nodeId: string) => void;
}>({});

// Node data types
interface RuleNodeData {
    label?: string;
    ruleId?: string;
    expression?: string;
    description?: string;
    isInitiating?: boolean;
    readonly?: boolean;
    onClick?: (ruleId: string) => void;
    nodeId?: string;
}

interface ActionNodeData {
    label?: string;
    actionType?: string;
    templateName?: string;
    inputParameters?: Record<string, any>;
    outputParameters?: Record<string, any>;
    readonly?: boolean;
    nodeId?: string;
}

// Types matching your existing chain data structure
interface ChainNode {
    id: string;
    label: string;
    ruleId?: string;
    actionType?: string;
    isInitiating?: boolean;
    expression?: string;
    description?: string;
    successActions?: string[];
    failureActions?: string[];
    isError?: boolean;
    isLoopEnd?: boolean;
    templateName?: string;
    inputParameters?: Record<string, any>;
    outputParameters?: Record<string, any>;
    position?: { x: number; y: number }; // Store node position
    [key: string]: any;
}

interface ChainData {
    nodes: Record<string, ChainNode>;
    edges: Array<{ from: string; to: string; type: 'success' | 'failure' | 'connection'; label?: string }>;
}

interface ChainFlowProps {
    chainData: ChainData | null;
    onNodeClick?: (nodeId: string) => void;
    onChainUpdate?: (chainData: ChainData) => void;
    isLoading?: boolean;
    isEditable?: boolean;
    dataServicesRootURI?: string;
}

// Custom Rule Node Component
const RuleNode: React.FC<NodeProps> = ({ data, isConnectable, selected, id }) => {
    const nodeData = data as RuleNodeData;
    const isInitiating = nodeData.isInitiating;
    const { onEdit, onDelete } = React.useContext(NodeHandlersContext);
    
    const handleEdit = React.useCallback(() => {
        if (onEdit) onEdit(id);
    }, [onEdit, id]);
    
    const handleDelete = React.useCallback(() => {
        if (onDelete) onDelete(id);
    }, [onDelete, id]);
    
    return (
        <div 
            className={`
                relative bg-white dark:bg-slate-800 border-2 rounded-lg shadow-md
                ${selected ? 'border-blue-500 shadow-lg' : 'border-slate-300 dark:border-slate-600'}
                ${isInitiating ? 'ring-2 ring-green-500 ring-offset-2' : ''}
                transition-all duration-200 min-w-[200px] ${nodeData.onClick ? 'cursor-pointer' : ''}
            `}
            onClick={() => {
                if (nodeData.onClick && nodeData.ruleId) {
                    nodeData.onClick(nodeData.ruleId);
                }
            }}
        >
            {!nodeData.readonly && (
                <Handle
                    type="target"
                    position={Position.Left}
                    id="input"
                    className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
                    isConnectable={isConnectable}
                />
            )}
            
            <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
                            {nodeData.label || 'Rule'}
                        </span>
                    </div>
                    {!nodeData.readonly && (
                        <div className="flex gap-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit();
                                }}
                                className="w-6 h-6 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors shadow-sm"
                                title="Edit"
                            >
                                <Edit className="w-3 h-3" />
                            </button>
                            {onDelete && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete();
                                    }}
                                    className="w-6 h-6 rounded bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
                                    title="Delete"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                
                {nodeData.expression && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-1 rounded truncate">
                        {nodeData.expression}
                    </div>
                )}
                
                {nodeData.description && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic truncate">
                        {nodeData.description}
                    </div>
                )}
                
                {isInitiating && (
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
                        Starting Rule
                    </div>
                )}
            </div>
            
            {!nodeData.readonly && (
                <>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="success"
                        className="!bg-green-500 !w-3 !h-3 !border-2 !border-white !top-[35%]"
                        isConnectable={isConnectable}
                    />
                    <div className="absolute right-[-35px] top-[30%] text-[10px] text-green-600 font-medium">
                        ✓
                    </div>
                    
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="failure"
                        className="!bg-red-500 !w-3 !h-3 !border-2 !border-white !top-[65%]"
                        isConnectable={isConnectable}
                    />
                    <div className="absolute right-[-35px] top-[60%] text-[10px] text-red-600 font-medium">
                        ✗
                    </div>
                </>
            )}
        </div>
    );
};

// Custom Action Node Component
const ActionNode: React.FC<NodeProps> = ({ data, isConnectable, selected, id }) => {
    const nodeData = data as ActionNodeData;
    const { onEdit, onDelete } = React.useContext(NodeHandlersContext);
    
    const handleEdit = React.useCallback(() => {
        if (onEdit) onEdit(id);
    }, [onEdit, id]);
    
    const handleDelete = React.useCallback(() => {
        if (onDelete) onDelete(id);
    }, [onDelete, id]);
    
    const actionTypeColors: Record<string, string> = {
        'ExecuteOrchestratorWorkflowAction': 'text-purple-500',
        'ExecuteGbgSchedulerProcessAction': 'text-orange-500',
        'RuleEvaluationAction': 'text-blue-500'
    };
    
    const color = actionTypeColors[nodeData.actionType || ''] || 'text-gray-500';
    
    return (
        <div 
            className={`
                relative bg-white dark:bg-slate-800 border-2 rounded-lg shadow-md
                ${selected ? 'border-purple-500 shadow-lg' : 'border-slate-300 dark:border-slate-600'}
                transition-all duration-200 min-w-[180px] cursor-pointer
            `}
        >
            <Handle
                type="target"
                position={Position.Left}
                id="input"
                className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
                isConnectable={isConnectable}
            />
            
            <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Workflow className={`w-4 h-4 ${color} flex-shrink-0`} />
                        <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
                            {nodeData.label || 'Action'}
                        </span>
                    </div>
                    {!nodeData.readonly && (
                        <div className="flex gap-1">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleEdit();
                                }}
                                className="w-6 h-6 rounded bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-colors shadow-sm"
                                title="Edit"
                            >
                                <Edit className="w-3 h-3" />
                            </button>
                            {onDelete && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete();
                                    }}
                                    className="w-6 h-6 rounded bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors shadow-sm"
                                    title="Delete"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
                
                <div className={`text-xs ${color} mt-1`}>
                    {nodeData.actionType?.replace(/([A-Z])/g, ' $1').trim()}
                    {nodeData.templateName && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Template: {nodeData.templateName}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Custom Edge Component with Success/Failure styling
const CustomEdge: React.FC<EdgeProps> = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    markerEnd,
    selected
}) => {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });
    
    const isSuccess = data?.sourceHandle === 'success';
    const isFailure = data?.sourceHandle === 'failure';
    
    return (
        <>
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    stroke: isSuccess ? '#22c55e' : isFailure ? '#ef4444' : '#94a3b8',
                    strokeWidth: selected ? 3 : 2,
                    strokeDasharray: isFailure ? '5,5' : 'none'
                }}
            />
            {data?.label && (
                <text
                    x={(sourceX + targetX) / 2}
                    y={(sourceY + targetY) / 2}
                    className="fill-slate-600 dark:fill-slate-400 text-xs"
                    textAnchor="middle"
                    dy={-10}
                >
                    {String(data.label)}
                </text>
            )}
        </>
    );
};

// Node types mapping
const nodeTypes = {
    ruleNode: RuleNode,
    actionNode: ActionNode,
};

// Edge types mapping
const edgeTypes = {
    custom: CustomEdge,
};

// Helper to generate unique rule IDs
const generateRuleId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'RULE';
    for (let i = 0; i < 5; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Auto-layout function using dagre with success/failure path prioritization
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    const nodeWidth = 220;
    const nodeHeight = 100;
    
    // Configure for better hierarchical layout with branching
    dagreGraph.setGraph({ 
        rankdir: direction, 
        nodesep: 120, // Horizontal spacing between nodes
        ranksep: 200, // Vertical spacing between ranks
        edgesep: 50,  // Spacing between edges
        ranker: 'network-simplex', // Better algorithm for complex graphs
        align: 'DL'   // Align nodes down-left for cleaner look
    });
    
    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });
    
    edges.forEach((edge) => {
        // Give different weights to success/failure paths for better visual separation
        const weight = edge.data?.sourceHandle === 'failure' ? 2 : 1;
        dagreGraph.setEdge(edge.source, edge.target, { weight });
    });
    
    dagre.layout(dagreGraph);
    
    // First, get the basic dagre layout
    const newNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const newNode = {
            ...node,
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            },
        };
        
        return newNode;
    });
    
    // Now adjust Y positions to ensure success paths are on top and failure paths are on bottom
    // Group nodes by their X position (rank/column)
    const nodesByRank = new Map<number, Node[]>();
    newNodes.forEach(node => {
        const x = Math.round(node.position.x / 50) * 50; // Group by approximate X position
        if (!nodesByRank.has(x)) {
            nodesByRank.set(x, []);
        }
        nodesByRank.get(x)!.push(node);
    });
    
    // For each rank, separate nodes into success-path and failure-path groups
    nodesByRank.forEach((nodesInRank, x) => {
        if (nodesInRank.length <= 1) return; // Skip if only one node in this rank
        
        const successNodes: Node[] = [];
        const failureNodes: Node[] = [];
        const neutralNodes: Node[] = [];
        
        // Categorize nodes based on their incoming edges
        nodesInRank.forEach(node => {
            const incomingEdges = edges.filter(e => e.target === node.id);
            
            if (incomingEdges.length === 0) {
                // No incoming edges - likely a root node
                neutralNodes.push(node);
            } else {
                // Check if this node is reached primarily through success or failure paths
                const hasSuccessPath = incomingEdges.some(e => e.sourceHandle === 'success');
                const hasFailurePath = incomingEdges.some(e => e.sourceHandle === 'failure');
                
                if (hasSuccessPath && !hasFailurePath) {
                    successNodes.push(node);
                } else if (hasFailurePath && !hasSuccessPath) {
                    failureNodes.push(node);
                } else {
                    // Mixed or neutral paths
                    neutralNodes.push(node);
                }
            }
        });
        
        // Sort each group by their current Y position to maintain relative order
        successNodes.sort((a, b) => a.position.y - b.position.y);
        neutralNodes.sort((a, b) => a.position.y - b.position.y);
        failureNodes.sort((a, b) => a.position.y - b.position.y);
        
        // Calculate new Y positions
        const totalNodes = successNodes.length + neutralNodes.length + failureNodes.length;
        const totalHeight = (totalNodes - 1) * (nodeHeight + 40); // 40px spacing between nodes
        const startY = -totalHeight / 2;
        
        let currentY = startY;
        
        // Position success nodes at the top
        successNodes.forEach(node => {
            node.position.y = currentY;
            currentY += nodeHeight + 40;
        });
        
        // Position neutral nodes in the middle
        neutralNodes.forEach(node => {
            node.position.y = currentY;
            currentY += nodeHeight + 40;
        });
        
        // Position failure nodes at the bottom
        failureNodes.forEach(node => {
            node.position.y = currentY;
            currentY += nodeHeight + 40;
        });
    });
    
    return { nodes: newNodes, edges };
};

// Main ChainFlowReactFlow component
const ChainFlowReactFlowInner: React.FC<ChainFlowProps> = ({
    chainData,
    onNodeClick,
    onChainUpdate,
    isLoading,
    isEditable = true,
    dataServicesRootURI
}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { screenToFlowPosition, fitView } = useReactFlow();
    
    // Edit dialog state
    const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
    const [editingNode, setEditingNode] = React.useState<any>(null);
    const [editingNodeType, setEditingNodeType] = React.useState<'rule' | 'action'>('rule');
    
    // Template state for action editing
    const [templateList, setTemplateList] = React.useState<Array<{name: string; category?: string}>>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = React.useState(false);
    const [templatesError, setTemplatesError] = React.useState<string>("");
    
    // Template details state
    const [selectedTemplateDetails, setSelectedTemplateDetails] = React.useState<any>(null);
    const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
    const [detailsError, setDetailsError] = React.useState<string>("");
    
    // Fetch templates when action dialog opens for template-driven actions
    React.useEffect(() => {
        if (!isEditDialogOpen || editingNodeType !== 'action' || !editingNode) return;
        
        const isTemplateDriven = 
            editingNode.actionType === "ExecuteOrchestratorWorkflowAction" ||
            editingNode.actionType === "ExecuteGbgSchedulerProcessAction";
            
        if (!isTemplateDriven || !dataServicesRootURI) return;
        
        let cancelled = false;
        
        (async () => {
            setIsLoadingTemplates(true);
            setTemplatesError("");
            try {
                const items = await apiFetchOrderTemplates(dataServicesRootURI);
                if (!cancelled) {
                    const list = Array.isArray(items) ? [...items].sort((a, b) => (a?.name || "").localeCompare(b?.name || "")) : [];
                    setTemplateList(list);
                }
            } catch (e: any) {
                if (!cancelled) setTemplatesError(`Templates Error: ${e.message || e}`);
            } finally {
                if (!cancelled) setIsLoadingTemplates(false);
            }
        })();
        
        return () => { cancelled = true; };
    }, [isEditDialogOpen, editingNodeType, editingNode?.actionType, dataServicesRootURI]);
    
    // Fetch template details when template changes
    React.useEffect(() => {
        if (!isEditDialogOpen || editingNodeType !== 'action' || !editingNode?.templateName || !dataServicesRootURI) {
            setSelectedTemplateDetails(null);
            setDetailsError("");
            return;
        }
        
        let cancelled = false;
        
        (async () => {
            setIsLoadingDetails(true);
            setDetailsError("");
            try {
                const details = await apiFetchOrderTemplateDetails(dataServicesRootURI, editingNode.templateName);
                if (!cancelled) {
                    setSelectedTemplateDetails(details || null);
                }
            } catch (e: any) {
                if (!cancelled) setDetailsError(`Details Error: ${e.message || e}`);
            } finally {
                if (!cancelled) setIsLoadingDetails(false);
            }
        })();
        
        return () => { cancelled = true; };
    }, [isEditDialogOpen, editingNodeType, editingNode?.templateName, dataServicesRootURI]);
    
    // Handle node deletion
    const handleNodeDelete = React.useCallback((nodeId: string) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        
        if (onChainUpdate && chainData) {
            const { [nodeId]: deletedNode, ...remainingNodes } = chainData.nodes;
            const remainingEdges = chainData.edges.filter(
                (e) => e.from !== nodeId && e.to !== nodeId
            );
            
            onChainUpdate({
                nodes: remainingNodes,
                edges: remainingEdges
            });
        }
        
        toast.success('Node deleted');
    }, [chainData, onChainUpdate]);
    
    // Handle node edit
    const handleNodeEdit = React.useCallback((nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        const chainNode = chainData?.nodes[nodeId];
        if (!chainNode) return;
        
        if (chainNode.actionType) {
            // Open action edit dialog
            setEditingNode({
                ...chainNode,
                id: nodeId,
                label: node.data.label,
                actionType: chainNode.actionType,
                templateName: chainNode.templateName || '',
                inputParameters: chainNode.inputParameters || {},
                outputParameters: chainNode.outputParameters || {},
                targetRuleId: chainNode.targetRuleId || '',
                evaluationType: chainNode.evaluationType || 'Single',
                variableMappings: chainNode.variableMappings || {},
                isSuccess: true // Default, can be updated
            });
            setEditingNodeType('action');
            setIsEditDialogOpen(true);
        } else {
            // Open rule edit dialog
            setEditingNode({
                ...chainNode,
                id: nodeId,
                ruleId: chainNode.ruleId || chainNode.id,
                label: node.data.label || chainNode.label,
                expression: chainNode.expression || '',
                description: chainNode.description || '',
                isInitiating: chainNode.isInitiating || false
            });
            setEditingNodeType('rule');
            setIsEditDialogOpen(true);
        }
    }, [nodes, chainData, onNodeClick]);
    
    // Handle node position changes
    const handleNodesChange = React.useCallback((changes: any) => {
        onNodesChange(changes);
        
        // Update chainData when nodes are moved
        if (onChainUpdate && chainData) {
            const positionChange = changes.find((c: any) => c.type === 'position' && c.dragging === false);
            if (positionChange) {
                const node = nodes.find(n => n.id === positionChange.id);
                if (node) {
                    const updatedChainData = {
                        ...chainData,
                        nodes: {
                            ...chainData.nodes,
                            [node.id]: {
                                ...chainData.nodes[node.id],
                                position: node.position
                            }
                        }
                    };
                    onChainUpdate(updatedChainData);
                }
            }
        }
    }, [onNodesChange, nodes, chainData, onChainUpdate]);
    
    // Convert chainData to React Flow format
    React.useEffect(() => {
        if (!chainData || Object.keys(chainData.nodes).length === 0) {
            setNodes([]);
            setEdges([]);
            return;
        }
        
        const nodeList = Object.values(chainData.nodes);
        const baseX = 200;
        const baseY = 200;
        const spacing = 300;
        
        // Convert nodes to React Flow format
        const reactFlowNodes: Node[] = nodeList.map((node, index) => {
            const isAction = !!node.actionType;
            
            // Use existing position if available, otherwise create initial position
            const position = node.position || {
                x: baseX + (index * spacing),
                y: baseY + (Math.random() * 100 - 50) // Add some vertical variation
            };
            
            return {
                id: node.id,
                type: isAction ? 'actionNode' : 'ruleNode',
                position: position,
                data: {
                    ...node,
                    label: node.label,
                    ruleId: node.ruleId,
                    actionType: node.actionType,
                    expression: node.expression,
                    isInitiating: node.isInitiating,
                    readonly: !isEditable,
                    onClick: isEditable && onNodeClick ? onNodeClick : undefined,
                    nodeId: node.id // Pass node ID to use in event handlers
                }
            };
        });
        
        // Convert edges to React Flow format
        const reactFlowEdges: Edge[] = chainData.edges?.map((edge, index) => ({
            id: `edge-${edge.from}-${edge.to}-${index}`,
            source: edge.from,
            target: edge.to,
            sourceHandle: edge.type === 'connection' ? undefined : edge.type,
            targetHandle: 'input',
            type: 'custom',
            data: {
                sourceHandle: edge.type === 'connection' ? undefined : edge.type,
                label: edge.label
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
                color: edge.type === 'success' ? '#22c55e' : edge.type === 'failure' ? '#ef4444' : '#94a3b8'
            }
        })) || [];
        
        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
    }, [chainData, isEditable, onNodeClick]);
    
    // Handle new connections
    const onConnect = React.useCallback((connection: Connection) => {
        if (!isEditable || !connection.source || !connection.target) return;
        
        const newEdge: Edge = {
            ...connection,
            id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
            type: 'custom',
            data: {
                sourceHandle: connection.sourceHandle,
                label: connection.sourceHandle === 'success' ? 'Success' : connection.sourceHandle === 'failure' ? 'Failure' : ''
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 20,
                height: 20,
                color: connection.sourceHandle === 'success' ? '#22c55e' : 
                       connection.sourceHandle === 'failure' ? '#ef4444' : '#94a3b8'
            }
        };
        
        setEdges((eds) => addEdge(newEdge, eds));
        
        // Update chain data
        if (onChainUpdate && chainData) {
            const updatedChainData = {
                ...chainData,
                edges: [
                    ...chainData.edges,
                    {
                        from: connection.source,
                        to: connection.target,
                        type: (connection.sourceHandle as 'success' | 'failure') || 'connection'
                    }
                ]
            };
            onChainUpdate(updatedChainData);
        }
        
        toast.success('Connection created!');
    }, [isEditable, chainData, onChainUpdate]);
    
    // Handle drag over
    const onDragOver = React.useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);
    
    // Handle drop
    const onDrop = React.useCallback((event: React.DragEvent) => {
        event.preventDefault();
        
        const type = event.dataTransfer.getData('application/reactflow');
        if (!type) return;
        
        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        
        const newNodeId = `${type}-${Date.now()}`;
        let newNode: Node;
        
        if (type === 'rule') {
            const newRuleId = generateRuleId();
            newNode = {
                id: newNodeId,
                type: 'ruleNode',
                position,
                data: {
                    label: `New Rule ${newRuleId}`,
                    ruleId: newRuleId,
                    expression: '',
                    isInitiating: false,
                    readonly: false,
                    onClick: onNodeClick
                }
            };
        } else if (type.startsWith('action-')) {
            const actionTypeMap: Record<string, string> = {
                'action-workflow': 'ExecuteOrchestratorWorkflowAction',
                'action-scheduler': 'ExecuteGbgSchedulerProcessAction'
            };
            
            const actionType = actionTypeMap[type] || 'UnknownAction';
            const actionLabel = type.replace('action-', '').replace(/^\w/, c => c.toUpperCase());
            
            newNode = {
                id: newNodeId,
                type: 'actionNode',
                position,
                data: {
                    label: `New ${actionLabel}`,
                    actionType: actionType,
                    readonly: false
                }
            };
        } else {
            return;
        }
        
        setNodes((nds) => [...nds, newNode]);
        
        // Update chain data with position
        if (onChainUpdate && chainData) {
            const nodeData = newNode.data as (RuleNodeData | ActionNodeData);
            const newChainNode: ChainNode = {
                id: newNodeId,
                label: nodeData.label || '',
                position: newNode.position // Save the exact drop position
            };
            
            if (type === 'rule') {
                const ruleData = nodeData as RuleNodeData;
                newChainNode.ruleId = ruleData.ruleId;
                newChainNode.expression = ruleData.expression;
                newChainNode.description = ruleData.description;
                newChainNode.isInitiating = ruleData.isInitiating;
            } else if (type.startsWith('action-')) {
                const actionData = nodeData as ActionNodeData;
                newChainNode.actionType = actionData.actionType;
            }
            
            const updatedChainData = {
                ...chainData,
                nodes: {
                    ...chainData.nodes,
                    [newNodeId]: newChainNode
                }
            };
            onChainUpdate(updatedChainData);
        }
    }, [onNodeClick, handleNodeDelete, handleNodeEdit, chainData, onChainUpdate, screenToFlowPosition]);
    
    // Auto-arrange nodes
    const handleAutoLayout = React.useCallback(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            nodes,
            edges,
            'LR' // Left to Right direction
        );
        
        setNodes([...layoutedNodes]);
        setEdges([...layoutedEdges]);
        
        // Fit view after a short delay to ensure layout is applied
        window.requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: 400 });
        });
        
        toast.success('Layout arranged!');
    }, [nodes, edges, fitView]);
    
    return (
        <NodeHandlersContext.Provider value={{ onEdit: handleNodeEdit, onDelete: handleNodeDelete }}>
            <div 
                className="w-full h-full relative focus:outline-none"
                tabIndex={0}
                onWheel={(e) => {
                    // Ensure wheel events are captured for zoom
                    e.stopPropagation();
                }}>
                {isLoading && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-muted-foreground">Loading chain map...</p>
                        </div>
                    </div>
                )}
                
                <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={isEditable ? handleNodesChange : undefined}
                onEdgesChange={isEditable ? onEdgesChange : undefined}
                onConnect={onConnect}
                onDragOver={onDragOver}
                onDrop={onDrop}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView={false} // Don't auto-fit on load to preserve positions
                fitViewOptions={{ padding: 0.2 }}
                deleteKeyCode={isEditable ? ['Delete', 'Backspace'] : undefined}
                selectionOnDrag={false}
                panOnDrag={true}
                panOnScroll={false} // Disable pan on scroll to allow zoom
                zoomOnScroll={true} // Scroll wheel to zoom
                zoomOnPinch={true}
                zoomOnDoubleClick={false}
                preventScrolling={true} // Prevent page scroll
                nodesDraggable={isEditable}
                nodesConnectable={isEditable}
                elementsSelectable={isEditable}
                selectNodesOnDrag={false}
                nodeDragThreshold={1} // Make nodes less sticky
                panActivationKeyCode="Space" // Space + left click also pans
                minZoom={0.1}
                maxZoom={4}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                className="bg-slate-50 dark:bg-slate-900"
                style={{ width: '100%', height: '100%' }}
            >
                <Background color="#94a3b8" gap={16} />
                <Controls 
                    showInteractive={false}
                    className="!bg-white dark:!bg-slate-800 !border-slate-200 dark:!border-slate-700 !shadow-sm"
                />
            </ReactFlow>
            
            {/* Instructions when empty */}
            {nodes.length === 0 && !isLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center text-slate-400 dark:text-slate-500">
                        <div className="text-2xl mb-2">🎨</div>
                        <div className="text-sm font-medium">
                            {isEditable 
                                ? "Drag templates here to build your workflow" 
                                : "No chain data to display"}
                        </div>
                        {isEditable && (
                            <div className="text-xs mt-1">Connect nodes by dragging from colored ports</div>
                        )}
                    </div>
                </div>
            )}
            
            {/* Control Buttons */}
            {nodes.length > 0 && (
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                    <Button
                        onClick={() => fitView({ padding: 0.2, duration: 400 })}
                        size="sm"
                        variant="outline"
                        className="gap-2 bg-white dark:bg-slate-800"
                        title="Center view on all nodes"
                    >
                        Center View
                    </Button>
                    <Button
                        onClick={handleAutoLayout}
                        size="sm"
                        variant="outline"
                        className="gap-2 bg-white dark:bg-slate-800"
                        title="Arrange nodes in a clean layout"
                    >
                        <Sparkles className="w-4 h-4" />
                        Auto Arrange
                    </Button>
                </div>
            )}
            
            {/* Drag Template Sidebar (only when editable) */}
            {isEditable && (
                <div className="absolute top-4 left-4 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm rounded-lg p-3 w-48">
                    <h3 className="text-sm font-medium mb-3 text-slate-700 dark:text-slate-300">
                        Drag to Canvas
                    </h3>
                    <div className="space-y-2">
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'rule');
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded cursor-move hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700"
                        >
                            <GripVertical className="w-3 h-3 text-slate-400" />
                            <GitBranch className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-medium">Business Rule</span>
                        </div>
                        
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'action-workflow');
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded cursor-move hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700"
                        >
                            <GripVertical className="w-3 h-3 text-slate-400" />
                            <Workflow className="w-4 h-4 text-purple-500" />
                            <span className="text-xs font-medium">Workflow Action</span>
                        </div>
                        
                        <div
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/reactflow', 'action-scheduler');
                                e.dataTransfer.effectAllowed = 'move';
                            }}
                            className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded cursor-move hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700"
                        >
                            <GripVertical className="w-3 h-3 text-slate-400" />
                            <Workflow className="w-4 h-4 text-orange-500" />
                            <span className="text-xs font-medium">Scheduler Action</span>
                        </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                                <span>Success path</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                                <span>Failure path</span>
                            </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                <p className="font-medium">Navigation:</p>
                                <p>• Left-click drag nodes</p>
                                <p>• Right-click drag to pan</p>
                                <p>• Space + drag to pan</p>
                                <p>• Scroll to zoom</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Action Edit Dialog */}
            {isEditDialogOpen && editingNode && editingNodeType === 'action' && (
                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogContent className={`${(selectedTemplateDetails?.inputParameters?.length > 0 || selectedTemplateDetails?.outputParameters?.length > 0 || editingNode?.actionType === 'RuleEvaluationAction') ? 'max-w-2xl' : 'max-w-md'} max-h-[85vh] overflow-y-auto`}>
                        <DialogHeader>
                            <DialogTitle>Edit Action Node</DialogTitle>
                            <DialogDescription>
                                Configure the action properties below.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                            <div>
                                <Label htmlFor="label">Label</Label>
                                <Input
                                    id="label"
                                    value={editingNode.label || ''}
                                    onChange={(e) => setEditingNode({ 
                                        ...editingNode, 
                                        label: e.target.value 
                                    })}
                                    placeholder="Enter action label"
                                />
                            </div>
                            
                            <div>
                                <Label>Action Type</Label>
                                <div className="p-2 bg-muted rounded-md text-sm">
                                    {editingNode.actionType === "ExecuteOrchestratorWorkflowAction" 
                                        ? "Execute Workflow" 
                                        : editingNode.actionType === "ExecuteGbgSchedulerProcessAction"
                                        ? "Execute Scheduler Process"
                                        : editingNode.actionType || "Unknown Action"}
                                </div>
                            </div>
                            
                            {/* Template Selection for Workflow and Scheduler Actions */}
                            {(editingNode.actionType === "ExecuteOrchestratorWorkflowAction" || 
                              editingNode.actionType === "ExecuteGbgSchedulerProcessAction") && (
                                <div>
                                    <Label>Template Name</Label>
                                    {isLoadingTemplates && <p className="text-xs text-muted-foreground italic">Loading templates...</p>}
                                    {templatesError && <p className="text-xs text-destructive">{templatesError}</p>}
                                    <Select
                                        value={editingNode.templateName || "__none__"}
                                        onValueChange={(value) => setEditingNode({
                                            ...editingNode,
                                            templateName: value === "__none__" ? "" : value
                                        })}
                                        disabled={isLoadingTemplates || !templateList.length}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="-- Select Template --" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">-- Select Template --</SelectItem>
                                            {templateList.map(t => (
                                                <SelectItem key={t.name} value={t.name}>
                                                    {t.name}{t.category ? ` (${t.category})` : ""}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            
                            {/* Template Parameters */}
                            {isLoadingDetails && <p className="text-xs text-muted-foreground italic">Loading template details...</p>}
                            {detailsError && <p className="text-xs text-destructive">{detailsError}</p>}
                            
                            {/* Input Parameters */}
                            {selectedTemplateDetails?.inputParameters?.length > 0 && (
                                <div>
                                    <Label className="text-sm mb-2">Input Parameters</Label>
                                    <div className="space-y-2 p-3 border rounded-md bg-muted/50">
                                        {selectedTemplateDetails.inputParameters.map((param: any) => (
                                            <div key={param.name}>
                                                <Label htmlFor={`input-${param.name}`} className="text-xs">
                                                    {param.name}
                                                    {param.description && (
                                                        <span className="text-muted-foreground ml-1">({param.description})</span>
                                                    )}
                                                </Label>
                                                <Input
                                                    id={`input-${param.name}`}
                                                    value={editingNode.inputParameters?.[param.name] || param.defaultValue || ''}
                                                    onChange={(e) => setEditingNode({
                                                        ...editingNode,
                                                        inputParameters: {
                                                            ...(editingNode.inputParameters || {}),
                                                            [param.name]: e.target.value
                                                        }
                                                    })}
                                                    placeholder={param.defaultValue ? `Default: ${param.defaultValue}` : `Enter ${param.name}`}
                                                    className="text-sm"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Output Parameters */}
                            {selectedTemplateDetails?.outputParameters?.length > 0 && (
                                <div>
                                    <Label className="text-sm mb-2">Output Parameters</Label>
                                    <div className="space-y-2 p-3 border rounded-md bg-muted/50">
                                        {selectedTemplateDetails.outputParameters.map((param: any) => (
                                            <div key={param.name}>
                                                <Label htmlFor={`output-${param.name}`} className="text-xs">
                                                    {param.name}
                                                    {param.description && (
                                                        <span className="text-muted-foreground ml-1">({param.description})</span>
                                                    )}
                                                </Label>
                                                <Input
                                                    id={`output-${param.name}`}
                                                    value={editingNode.outputParameters?.[param.name] || param.defaultValue || ''}
                                                    onChange={(e) => setEditingNode({
                                                        ...editingNode,
                                                        outputParameters: {
                                                            ...(editingNode.outputParameters || {}),
                                                            [param.name]: e.target.value
                                                        }
                                                    })}
                                                    placeholder={param.defaultValue ? `Default: ${param.defaultValue}` : `Enter ${param.name}`}
                                                    className="text-sm"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Variable Mappings for Rule Evaluation Action */}
                            {editingNode.actionType === "RuleEvaluationAction" && (
                                <div>
                                    <Label htmlFor="targetRuleId" className="text-sm">Target Rule ID</Label>
                                    <Input
                                        id="targetRuleId"
                                        value={editingNode.targetRuleId || ''}
                                        onChange={(e) => setEditingNode({
                                            ...editingNode,
                                            targetRuleId: e.target.value
                                        })}
                                        placeholder="Enter target rule ID"
                                        className="mb-3"
                                    />
                                    
                                    <Label htmlFor="evaluationType" className="text-sm">Evaluation Type</Label>
                                    <Select
                                        value={editingNode.evaluationType || 'Single'}
                                        onValueChange={(value) => setEditingNode({
                                            ...editingNode,
                                            evaluationType: value
                                        })}
                                    >
                                        <SelectTrigger className="mb-3">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Single">Single</SelectItem>
                                            <SelectItem value="Competitive">Competitive</SelectItem>
                                            <SelectItem value="Parallel">Parallel</SelectItem>
                                            <SelectItem value="Hierarchical">Hierarchical</SelectItem>
                                            <SelectItem value="Composite">Composite</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    
                                    <Label className="text-sm">Variable Mappings</Label>
                                    <div className="text-xs text-muted-foreground mb-2">Map variables from current rule to target rule</div>
                                    <Textarea
                                        value={editingNode.variableMappings ? JSON.stringify(editingNode.variableMappings, null, 2) : '{}'}
                                        onChange={(e) => {
                                            try {
                                                const mappings = JSON.parse(e.target.value);
                                                setEditingNode({
                                                    ...editingNode,
                                                    variableMappings: mappings
                                                });
                                            } catch (error) {
                                                // Invalid JSON, just store as is for user to fix
                                            }
                                        }}
                                        placeholder='{\n  "sourceVar": "targetVar"\n}'
                                        className="font-mono text-xs min-h-[100px]"
                                        rows={4}
                                    />
                                </div>
                            )}
                            
                            <div className="text-sm text-muted-foreground">
                                <p>Note: For advanced configuration, use the main rule editor.</p>
                            </div>
                        </div>
                        
                        <DialogFooter>
                            <Button 
                                variant="outline" 
                                onClick={() => setIsEditDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button onClick={() => {
                                // Update the node
                                if (onChainUpdate && chainData && editingNode) {
                                    const updatedChainData = {
                                        ...chainData,
                                        nodes: {
                                            ...chainData.nodes,
                                            [editingNode.id]: {
                                                ...chainData.nodes[editingNode.id],
                                                label: editingNode.label,
                                                actionType: editingNode.actionType,
                                                templateName: editingNode.templateName || '',
                                                inputParameters: editingNode.inputParameters || {},
                                                outputParameters: editingNode.outputParameters || {},
                                                targetRuleId: editingNode.targetRuleId || '',
                                                evaluationType: editingNode.evaluationType || '',
                                                variableMappings: editingNode.variableMappings || {}
                                            }
                                        }
                                    };
                                    onChainUpdate(updatedChainData);
                                    
                                    // Update React Flow node
                                    setNodes((nds) => nds.map((node) => 
                                        node.id === editingNode.id 
                                            ? { 
                                                ...node, 
                                                data: { 
                                                    ...node.data, 
                                                    label: editingNode.label,
                                                    actionType: editingNode.actionType,
                                                    templateName: editingNode.templateName || '',
                                                    inputParameters: editingNode.inputParameters || {},
                                                    outputParameters: editingNode.outputParameters || {}
                                                } 
                                            }
                                            : node
                                    ));
                                }
                                
                                setIsEditDialogOpen(false);
                                toast.success('Action updated successfully');
                            }}>
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            
            {/* Rule Edit Dialog */}
            {isEditDialogOpen && editingNode && editingNodeType === 'rule' && (
                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Edit Rule Node</DialogTitle>
                            <DialogDescription>
                                Configure the rule properties below.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                            <div>
                                <Label htmlFor="rule-label">Label</Label>
                                <Input
                                    id="rule-label"
                                    value={editingNode.label || ''}
                                    onChange={(e) => setEditingNode({ 
                                        ...editingNode, 
                                        label: e.target.value 
                                    })}
                                    placeholder="Enter rule label"
                                />
                            </div>
                            
                            <div>
                                <Label htmlFor="rule-id">Rule ID</Label>
                                <Input
                                    id="rule-id"
                                    value={editingNode.ruleId || ''}
                                    onChange={(e) => setEditingNode({ 
                                        ...editingNode, 
                                        ruleId: e.target.value 
                                    })}
                                    placeholder="Enter rule ID"
                                />
                            </div>
                            
                            <div>
                                <Label htmlFor="rule-expression">Expression</Label>
                                <Textarea
                                    id="rule-expression"
                                    value={editingNode.expression || ''}
                                    onChange={(e) => setEditingNode({ 
                                        ...editingNode, 
                                        expression: e.target.value 
                                    })}
                                    placeholder="Enter rule expression (e.g., key == 'Ready' AND value > 0.5)"
                                    className="font-mono min-h-[80px]"
                                    rows={3}
                                />
                            </div>
                            
                            <div>
                                <Label htmlFor="rule-description">Description</Label>
                                <Textarea
                                    id="rule-description"
                                    value={editingNode.description || ''}
                                    onChange={(e) => setEditingNode({ 
                                        ...editingNode, 
                                        description: e.target.value 
                                    })}
                                    placeholder="Enter rule description"
                                    rows={2}
                                />
                            </div>
                            
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="isInitiating"
                                    checked={editingNode.isInitiating || false}
                                    onCheckedChange={(checked) => setEditingNode({ 
                                        ...editingNode, 
                                        isInitiating: !!checked
                                    })}
                                />
                                <Label htmlFor="isInitiating" className="text-sm font-normal cursor-pointer">
                                    Starting rule (initiating rule for chain)
                                </Label>
                            </div>
                            
                            <div className="text-sm text-muted-foreground">
                                <p>Note: For advanced configuration and actions, use the main rule editor.</p>
                            </div>
                        </div>
                        
                        <DialogFooter>
                            <Button 
                                variant="outline" 
                                onClick={() => setIsEditDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button onClick={() => {
                                // Update the node
                                if (onChainUpdate && chainData && editingNode) {
                                    const updatedChainData = {
                                        ...chainData,
                                        nodes: {
                                            ...chainData.nodes,
                                            [editingNode.id]: {
                                                ...chainData.nodes[editingNode.id],
                                                label: editingNode.label,
                                                ruleId: editingNode.ruleId,
                                                expression: editingNode.expression,
                                                description: editingNode.description,
                                                isInitiating: editingNode.isInitiating
                                            }
                                        }
                                    };
                                    onChainUpdate(updatedChainData);
                                    
                                    // Update React Flow node
                                    setNodes((nds) => nds.map((node) => 
                                        node.id === editingNode.id 
                                            ? { 
                                                ...node, 
                                                data: { 
                                                    ...node.data, 
                                                    label: editingNode.label,
                                                    ruleId: editingNode.ruleId,
                                                    expression: editingNode.expression,
                                                    isInitiating: editingNode.isInitiating
                                                } 
                                            }
                                            : node
                                    ));
                                }
                                
                                setIsEditDialogOpen(false);
                                toast.success('Rule updated successfully');
                            }}>
                                Save Changes
                            </Button>
                            <Button 
                                variant="default"
                                onClick={() => {
                                    // Load in main editor for advanced editing
                                    if (onNodeClick && editingNode.ruleId) {
                                        onNodeClick(editingNode.ruleId);
                                        setIsEditDialogOpen(false);
                                    }
                                }}
                            >
                                Open in Editor
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
            </div>
        </NodeHandlersContext.Provider>
    );
};

// Export wrapped in ReactFlowProvider
export const ChainFlowReactFlow: React.FC<ChainFlowProps> = (props) => {
    return (
        <ReactFlowProvider>
            <ChainFlowReactFlowInner {...props} />
        </ReactFlowProvider>
    );
};
