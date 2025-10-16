import React from 'react';
import {
    ReactFlow,
    Node,
    Edge,
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
import SimpleRuleSelector from './SimpleRuleSelector';
import { apiFetchRuleDetails } from './App';

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
    // RuleEvaluationAction fields
    targetRuleId?: string;
    evaluationType?: string;
    topic?: string;
    variableMappings?: Record<string, any>;
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
    autoArrangeOnLoad?: boolean;
    onLoadRuleWithChildren?: (ruleId: string) => Promise<void>;
    shouldAutoArrange?: boolean; // New prop to control when to auto-arrange
}

// Custom Rule Node Component
const RuleNode: React.FC<NodeProps> = ({ data, isConnectable, selected, id }) => {
    const nodeData = data as RuleNodeData;
    const isInitiating = nodeData.isInitiating;
    const { onEdit, onDelete } = React.useContext(NodeHandlersContext);
    
    // Check for validation issues
    const hasValidationIssues = !nodeData.label || nodeData.label.trim() === '' || 
                               !nodeData.expression || nodeData.expression.trim() === '';
    
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
                ${hasValidationIssues ? 'ring-2 ring-yellow-500 ring-offset-1' : ''}
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
                        <div className="flex flex-col gap-1">
                            <span className="font-bold text-base text-slate-900 dark:text-slate-100">
                                {nodeData.label || 'Rule'}
                            </span>
                            {nodeData.ruleId && (
                                <span className="text-xs italic text-slate-600 dark:text-slate-400">
                                    {nodeData.ruleId}
                                </span>
                            )}
                        </div>
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
                    <div className="text-xs mt-1 font-medium" style={{ color: '#00D437' }}>
                        Starting Rule
                    </div>
                )}
                
                {hasValidationIssues && (
                    <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Missing required fields
                    </div>
                )}
            </div>
            
            {!nodeData.readonly && (
                <>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="success"
                        className="!w-3 !h-3 !border-2 !border-white !top-[35%]"
                        style={{ backgroundColor: '#00D437' }}
                        isConnectable={isConnectable}
                    />
                    <div className="absolute right-[-35px] top-[30%] text-[10px] font-medium" style={{ color: '#00D437' }}>
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
                transition-all duration-200 min-w-[300px] cursor-pointer
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
                    stroke: isSuccess ? '#00D437' : isFailure ? '#ef4444' : '#94a3b8',
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

// Snap position to grid
const snapToGrid = (position: { x: number; y: number }, gridSize: number = 20): { x: number; y: number } => {
    return {
        x: Math.round(position.x / gridSize) * gridSize,
        y: Math.round(position.y / gridSize) * gridSize,
    };
};

// Auto-layout function using dagre with success/failure path prioritization
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    const nodeWidth = 320; // Increased to match wider action nodes
    const nodeHeight = 100;
    
    // Configure for better hierarchical layout with branching
    dagreGraph.setGraph({ 
        rankdir: direction, 
        nodesep: 150, // Increased horizontal spacing between nodes
        ranksep: 250, // Increased vertical spacing between ranks
        edgesep: 80,  // Increased spacing between edges
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
            position: snapToGrid({
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            }),
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
    dataServicesRootURI,
    autoArrangeOnLoad = false,
    onLoadRuleWithChildren,
    shouldAutoArrange = false
}) => {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { screenToFlowPosition, fitView } = useReactFlow();
    
    // Track if we've auto-arranged for current chainData
    const [hasAutoArranged, setHasAutoArranged] = React.useState(false);
    // Track if we need to center view on new chain data
    const [shouldCenterView, setShouldCenterView] = React.useState(false);
    
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
    
    // Rule selection dialog state
    const [isRuleSelectDialogOpen, setIsRuleSelectDialogOpen] = React.useState(false);
    const [pendingRuleDropPosition, setPendingRuleDropPosition] = React.useState<{ x: number; y: number } | null>(null);
    const [selectedRuleId, setSelectedRuleId] = React.useState<string>("");
    
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
        
        // Batch position updates and only update chainData after dragging is complete
        const positionChanges = changes.filter((c: any) => c.type === 'position' && c.dragging === false);
        
        if (positionChanges.length > 0 && onChainUpdate && chainData) {
            // Get all current node positions from React Flow
            const currentNodes = nodes;
            const updatedNodes = { ...chainData.nodes };
            
            // Update positions for all nodes that were moved
            positionChanges.forEach((change: any) => {
                const node = currentNodes.find(n => n.id === change.id);
                if (node && updatedNodes[node.id]) {
                    updatedNodes[node.id] = {
                        ...updatedNodes[node.id],
                        position: node.position
                    };
                }
            });
            
            const updatedChainData = {
                ...chainData,
                nodes: updatedNodes
            };
            
            onChainUpdate(updatedChainData);
        }
    }, [onNodesChange, nodes, chainData, onChainUpdate]);
    
    // Handle edge changes (especially deletions)
    const handleEdgesChange = React.useCallback((changes: any) => {
        onEdgesChange(changes);
        
        // Update chainData when edges are removed
        if (onChainUpdate && chainData) {
            const removeChanges = changes.filter((c: any) => c.type === 'remove');
            if (removeChanges.length > 0) {
                let updatedEdges = [...chainData.edges];
                
                removeChanges.forEach((change: any) => {
                    const edge = edges.find(e => e.id === change.id);
                    if (edge) {
                        // Remove the edge from chainData
                        updatedEdges = updatedEdges.filter(e => 
                            !(e.from === edge.source && e.to === edge.target && 
                              e.type === (edge.sourceHandle as 'success' | 'failure' || 'connection'))
                        );
                    }
                });
                
                const updatedChainData = {
                    ...chainData,
                    edges: updatedEdges
                };
                onChainUpdate(updatedChainData);
            }
        }
    }, [edges, chainData, onChainUpdate, onEdgesChange]);
    
    // Track previous node count to detect when a new chain is loaded
    const prevNodeCountRef = React.useRef(0);
    const prevChainDataRef = React.useRef<ChainData | null>(null);
    
    // Convert chainData to React Flow format
    React.useEffect(() => {
        if (!chainData || Object.keys(chainData.nodes).length === 0) {
            setNodes([]);
            setEdges([]);
            prevNodeCountRef.current = 0;
            prevChainDataRef.current = null;
            return;
        }
        
        const nodeList = Object.values(chainData.nodes);
        const currentNodeCount = nodeList.length;
        
        // Check if this is just a position update by comparing non-position properties
        let isJustPositionUpdate = false;
        
        if (prevChainDataRef.current) {
            const prevNodes = prevChainDataRef.current.nodes;
            const currNodes = chainData.nodes;
            
            // Must have the same number of nodes
            const sameNodeCount = Object.keys(prevNodes).length === Object.keys(currNodes).length;
            
            // All node IDs must be the same
            const sameNodeIds = sameNodeCount && 
                Object.keys(prevNodes).every(id => currNodes[id]) &&
                Object.keys(currNodes).every(id => prevNodes[id]);
            
            // Check if non-position properties are identical
            const sameNodeProperties = sameNodeIds && Object.keys(currNodes).every(nodeId => {
                const prev = prevNodes[nodeId];
                const curr = currNodes[nodeId];
                return prev.label === curr.label &&
                       prev.actionType === curr.actionType &&
                       prev.ruleId === curr.ruleId &&
                       prev.expression === curr.expression &&
                       prev.templateName === curr.templateName &&
                       prev.isInitiating === curr.isInitiating;
            });
            
            // Must have the same edges
            const sameEdges = chainData.edges.length === prevChainDataRef.current.edges.length;
            
            isJustPositionUpdate = sameNodeCount && sameNodeIds && sameNodeProperties && sameEdges;
        }
        
        // If it's just a position update, don't recreate nodes
        if (isJustPositionUpdate) {
            prevChainDataRef.current = chainData;
            return;
        }
        
        // Only auto-arrange when explicitly requested via shouldAutoArrange prop
        // This prevents auto-arrange on manual node additions
        if (shouldAutoArrange && autoArrangeOnLoad) {
            // Reset auto-arrange flag when explicitly requested
            setHasAutoArranged(false);
        }
        
        // Disable fallback auto-arrange logic to prevent unwanted triggering
        // Only use shouldAutoArrange prop for control
        
        // Only center view when explicitly requested via shouldAutoArrange prop
        if (shouldAutoArrange && currentNodeCount > 0) {
            setShouldCenterView(true);
        }
        
        prevNodeCountRef.current = currentNodeCount;
        prevChainDataRef.current = chainData;
        
        const baseX = 200;
        const baseY = 200;
        const spacing = 350; // Increased spacing for wider nodes
        
        // Convert nodes to React Flow format
        const reactFlowNodes: Node[] = nodeList.map((node, index) => {
            const isAction = !!node.actionType;
            
            // Calculate position in a grid layout if not provided
            let position = node.position;
            if (!position) {
                // Create a more structured layout for new nodes
                const row = Math.floor(index / 3); // 3 nodes per row
                const col = index % 3;
                position = {
                    x: baseX + (col * spacing),
                    y: baseY + (row * 150) + (col % 2 === 0 ? 0 : 50) // Slight offset for visual appeal
                };
            }
            
            return {
                id: node.id,
                type: isAction ? 'actionNode' : 'ruleNode',
                position: position,
                data: {
                    ...node,
                    label: node.label,
                    ruleId: node.ruleId || (!isAction ? node.id : undefined), // Ensure ruleId is set for rule nodes
                    actionType: node.actionType,
                    expression: node.expression,
                    description: node.description,
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
                color: edge.type === 'success' ? '#00D437' : edge.type === 'failure' ? '#ef4444' : '#94a3b8'
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
                color: connection.sourceHandle === 'success' ? '#00D437' : 
                       connection.sourceHandle === 'failure' ? '#ef4444' : '#94a3b8'
            }
        };
        
        setEdges((eds) => addEdge(newEdge, eds));
        
        // Update chain data
        if (onChainUpdate && chainData) {
            // Check if this edge already exists to prevent duplicates
            const edgeExists = chainData.edges.some(edge => 
                edge.from === connection.source && 
                edge.to === connection.target &&
                edge.type === ((connection.sourceHandle as 'success' | 'failure') || 'connection')
            );
            
            if (!edgeExists) {
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
        
        const rawPosition = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });
        
        // Snap to grid for cleaner placement
        const position = snapToGrid(rawPosition);
        
        const newNodeId = `${type}-${Date.now()}`;
        let newNode: Node;
        
        if (type === 'rule') {
            // Show rule selection dialog instead of creating empty rule
            setPendingRuleDropPosition(position);
            setIsRuleSelectDialogOpen(true);
            setSelectedRuleId("");
            return;
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
            
            // Don't auto-arrange - let user position manually
        }
    }, [onNodeClick, handleNodeDelete, handleNodeEdit, chainData, onChainUpdate, screenToFlowPosition]);
    
    // Handle rule selection from dialog
    const handleRuleSelect = React.useCallback(async () => {
        if (!selectedRuleId) {
            toast.error("Please select a rule");
            return;
        }
        
        try {
            // If we have the onLoadRuleWithChildren prop, use it to load the entire rule hierarchy
            if (onLoadRuleWithChildren) {
                // Close dialog first
                setIsRuleSelectDialogOpen(false);
                setPendingRuleDropPosition(null);
                setSelectedRuleId("");
                
                // Load the rule with all its children
                await onLoadRuleWithChildren(selectedRuleId);
                
                // Center view after loading new rule chain
                setShouldCenterView(true);
                
                toast.success(`Loaded rule chain for: ${selectedRuleId}`);
            } else {
                // Fallback to single rule loading if onLoadRuleWithChildren is not provided
                if (!pendingRuleDropPosition || !dataServicesRootURI) {
                    toast.error("Missing required information");
                    return;
                }
                
                // Fetch rule details
                const ruleDetails = await apiFetchRuleDetails(dataServicesRootURI, selectedRuleId);
                if (!ruleDetails) {
                    toast.error("Failed to fetch rule details");
                    return;
                }
                
                // Extract rule expression
                const exprProp = ruleDetails.properties?.find((p: any) => 
                    p?.name === "Expression" || p?.name === "Evaluation Lambda Expression"
                );
                const expression = exprProp?.value || "";
                
                // Create new node with fetched rule data
                const newNodeId = selectedRuleId; // Use the ruleId as the nodeId for consistency
                const newNode: Node = {
                    id: newNodeId,
                    type: 'ruleNode',
                    position: pendingRuleDropPosition,
                    data: {
                        label: ruleDetails.name || selectedRuleId,
                        ruleId: selectedRuleId,
                        expression: expression,
                        isInitiating: false,
                        readonly: false,
                        onClick: onNodeClick
                    }
                };
                
                setNodes((nds) => [...nds, newNode]);
                
                // Update chain data
                if (onChainUpdate && chainData) {
                    const newChainNode: ChainNode = {
                        id: selectedRuleId, // Use actual rule ID as node ID
                        label: ruleDetails.name || selectedRuleId,
                        ruleId: selectedRuleId,
                        expression: expression,
                        position: pendingRuleDropPosition
                    };
                    
                    const updatedChainData = {
                        ...chainData,
                        nodes: {
                            ...chainData.nodes,
                            [selectedRuleId]: newChainNode
                        }
                    };
                    onChainUpdate(updatedChainData);
                }
                
                toast.success(`Added rule: ${ruleDetails.name || selectedRuleId}`);
                
                // Close dialog and reset state
                setIsRuleSelectDialogOpen(false);
                setPendingRuleDropPosition(null);
                setSelectedRuleId("");
            }
        } catch (error: any) {
            console.error("Failed to add rule:", error);
            toast.error("Failed to add rule: " + (error.message || "Unknown error"));
        }
    }, [selectedRuleId, pendingRuleDropPosition, dataServicesRootURI, onNodeClick, chainData, onChainUpdate, onLoadRuleWithChildren]);
    
    // Auto-arrange nodes
    const handleAutoLayout = React.useCallback(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            nodes,
            edges,
            'LR' // Left to Right direction
        );
        
        setNodes([...layoutedNodes]);
        setEdges([...layoutedEdges]);
        
        // Save all the new positions to chainData
        if (onChainUpdate && chainData) {
            const updatedNodes: Record<string, ChainNode> = {};
            
            // Update positions for all nodes
            layoutedNodes.forEach(node => {
                if (chainData.nodes[node.id]) {
                    updatedNodes[node.id] = {
                        ...chainData.nodes[node.id],
                        position: node.position
                    };
                }
            });
            
            const updatedChainData = {
                ...chainData,
                nodes: updatedNodes
            };
            
            onChainUpdate(updatedChainData);
        }
        
        // Fit view after a short delay to ensure layout is applied
        window.requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: 400 });
        });
        
        toast.success('Layout arranged!');
    }, [nodes, edges, fitView, chainData, onChainUpdate]);
    
    // Auto-arrange ONLY when explicitly requested via shouldAutoArrange prop
    React.useEffect(() => {
        if (shouldAutoArrange && autoArrangeOnLoad && nodes.length > 0 && !hasAutoArranged) {
            // Small delay to ensure nodes are rendered
            setTimeout(() => {
                handleAutoLayout();
                setHasAutoArranged(true);
            }, 100);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shouldAutoArrange, autoArrangeOnLoad, nodes.length, hasAutoArranged]); // handleAutoLayout excluded to prevent circular deps
    
    // Center view when new chain data is loaded
    React.useEffect(() => {
        if (shouldCenterView && nodes.length > 0) {
            // Small delay to ensure nodes are rendered
            setTimeout(() => {
                fitView({ padding: 0.2, duration: 400 });
                setShouldCenterView(false);
            }, 200);
        }
    }, [shouldCenterView, nodes.length, fitView]);
    
    // Listen for external center view events
    React.useEffect(() => {
        const handleCenterView = () => {
            if (nodes.length > 0) {
                fitView({ padding: 0.2, duration: 400 });
            }
        };
        
        window.addEventListener('centerView', handleCenterView);
        return () => window.removeEventListener('centerView', handleCenterView);
    }, [fitView, nodes.length]);
    
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
                onEdgesChange={isEditable ? handleEdgesChange : undefined}
                onConnect={onConnect}
                onDragOver={onDragOver}
                onDrop={onDrop}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView={false} // Don't auto-fit on load to preserve positions
                snapToGrid={true}
                snapGrid={[20, 20]} // 20px grid for cleaner alignment
                nodesDraggable={isEditable}
                nodesConnectable={isEditable}
                elementsSelectable={isEditable}
                fitViewOptions={{ padding: 0.2 }}
                deleteKeyCode={isEditable ? ['Delete', 'Backspace'] : undefined}
                selectionOnDrag={false}
                panOnDrag={true}
                panOnScroll={false} // Disable pan on scroll to allow zoom
                zoomOnScroll={true} // Scroll wheel to zoom
                zoomOnPinch={true}
                zoomOnDoubleClick={false}
                preventScrolling={true} // Prevent page scroll
                selectNodesOnDrag={false}
                nodeDragThreshold={1} // Make nodes less sticky
                panActivationKeyCode="Space" // Space + left click also pans
                minZoom={0.1}
                maxZoom={4}
                defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
                className="bg-slate-50 dark:bg-slate-900"
                style={{ width: '100%', height: '100%' }}
            >
                <Background color="#1f2937" gap={16} />
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
                                <p>• Left-Click + drag to pan</p>
                                <p>• Scroll to zoom</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Action Edit Dialog */}
            {isEditDialogOpen && editingNode && editingNodeType === 'action' && (
                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                    <DialogContent className="!w-[728px] max-h-[85vh] overflow-y-auto" style={{ width: '728px', maxWidth: '728px' }}>
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
                                <Select
                                    value={editingNode.actionType || "none"}
                                    onValueChange={(value) => {
                                        if (value === "none") return;
                                        
                                        // Reset template-related fields when changing action type
                                        setEditingNode({
                                            ...editingNode,
                                            actionType: value,
                                            templateName: "",
                                            inputParameters: {},
                                            outputParameters: {}
                                        });
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Action Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">-- Select Action Type --</SelectItem>
                                        <SelectItem value="RuleEvaluationAction">Rule Evaluation</SelectItem>
                                        <SelectItem value="ExecuteOrchestratorWorkflowAction">Execute Orchestrator Workflow</SelectItem>
                                        <SelectItem value="ExecuteGbgSchedulerProcessAction">Execute GBG Scheduler Process</SelectItem>
                                    </SelectContent>
                                </Select>
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
                                    <SimpleRuleSelector
                                        dataServicesRootURI={dataServicesRootURI || ""}
                                        onRuleSelect={(ruleId) => setEditingNode({
                                            ...editingNode,
                                            targetRuleId: ruleId
                                        })}
                                        value={editingNode.targetRuleId || ''}
                                        placeholder="-- Select target rule --"
                                        disabled={false}
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
                                    <div className="text-xs text-muted-foreground mb-2">
                                        Map variables from current context to target rule variables
                                    </div>

                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-muted-foreground">
                                            Define how variables are passed to the target rule
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const currentMappings = Array.isArray(editingNode.variableMappings) 
                                                    ? editingNode.variableMappings 
                                                    : [];
                                                setEditingNode({
                                                    ...editingNode,
                                                    variableMappings: [...currentMappings, { from: '', to: '' }]
                                                });
                                            }}
                                        >
                                            + Add Mapping
                                        </Button>
                                    </div>

                                    <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                                        {(Array.isArray(editingNode.variableMappings) ? editingNode.variableMappings : []).map((mapping: any, index: number) => (
                                            <div key={index} className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                                                <div className="flex-1">
                                                    <Label className="text-xs text-muted-foreground">Source Variable</Label>
                                                    <Input
                                                        value={mapping.from || ''}
                                                        onChange={(e) => {
                                                            const newMappings = [...(Array.isArray(editingNode.variableMappings) ? editingNode.variableMappings : [])];
                                                            newMappings[index] = { ...mapping, from: e.target.value };
                                                            setEditingNode({
                                                                ...editingNode,
                                                                variableMappings: newMappings
                                                            });
                                                        }}
                                                        placeholder="e.g., currentValue"
                                                        className="text-sm"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <Label className="text-xs text-muted-foreground">Target Variable</Label>
                                                    <Input
                                                        value={mapping.to || ''}
                                                        onChange={(e) => {
                                                            const newMappings = [...(Array.isArray(editingNode.variableMappings) ? editingNode.variableMappings : [])];
                                                            newMappings[index] = { ...mapping, to: e.target.value };
                                                            setEditingNode({
                                                                ...editingNode,
                                                                variableMappings: newMappings
                                                            });
                                                        }}
                                                        placeholder="e.g., inputValue"
                                                        className="text-sm"
                                                    />
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        const newMappings = (Array.isArray(editingNode.variableMappings) ? editingNode.variableMappings : []).filter((_: any, i: number) => i !== index);
                                                        setEditingNode({
                                                            ...editingNode,
                                                            variableMappings: newMappings
                                                        });
                                                    }}
                                                    className="text-red-600 hover:text-red-700 mt-5"
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        ))}
                                        
                                        {(!Array.isArray(editingNode.variableMappings) || editingNode.variableMappings.length === 0) && (
                                            <div className="text-center py-4 text-muted-foreground text-sm">
                                                No variable mappings defined. Click "Add Mapping" to create one.
                                            </div>
                                        )}
                                    </div>
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
                                                variableMappings: Array.isArray(editingNode.variableMappings) 
                                                    ? editingNode.variableMappings 
                                                    : []
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
                                                    outputParameters: editingNode.outputParameters || {},
                                                    targetRuleId: editingNode.targetRuleId || '',
                                                    evaluationType: editingNode.evaluationType || '',
                                                    variableMappings: Array.isArray(editingNode.variableMappings) 
                                                        ? editingNode.variableMappings 
                                                        : []
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
                    <DialogContent className="!w-[637px]" style={{ width: '637px', maxWidth: '637px' }}>
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
                            
                            {/* Variable Mappings Section */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-base font-medium">Variable Mappings</Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const currentMappings = editingNode.variableMappings || [];
                                            setEditingNode({
                                                ...editingNode,
                                                variableMappings: [...currentMappings, { from: '', to: '' }]
                                            });
                                        }}
                                    >
                                        + Add Mapping
                                    </Button>
                                </div>
                                
                                <div className="text-sm text-muted-foreground">
                                    Map variables from this rule to child rules. Variables will be passed to connected rules.
                                </div>
                                
                                <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {(editingNode.variableMappings || []).map((mapping: any, index: number) => (
                                        <div key={index} className="flex items-center gap-2 p-2 border rounded-md">
                                            <div className="flex-1">
                                                <Label className="text-xs text-muted-foreground">From Variable</Label>
                                                <Input
                                                    value={mapping.from || ''}
                                                    onChange={(e) => {
                                                        const newMappings = [...(editingNode.variableMappings || [])];
                                                        newMappings[index] = { ...mapping, from: e.target.value };
                                                        setEditingNode({
                                                            ...editingNode,
                                                            variableMappings: newMappings
                                                        });
                                                    }}
                                                    placeholder="e.g., RuleEval"
                                                    className="text-sm"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <Label className="text-xs text-muted-foreground">To Variable</Label>
                                                <Input
                                                    value={mapping.to || ''}
                                                    onChange={(e) => {
                                                        const newMappings = [...(editingNode.variableMappings || [])];
                                                        newMappings[index] = { ...mapping, to: e.target.value };
                                                        setEditingNode({
                                                            ...editingNode,
                                                            variableMappings: newMappings
                                                        });
                                                    }}
                                                    placeholder="e.g., ParentResult"
                                                    className="text-sm"
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    const newMappings = (editingNode.variableMappings || []).filter((_: any, i: number) => i !== index);
                                                    setEditingNode({
                                                        ...editingNode,
                                                        variableMappings: newMappings
                                                    });
                                                }}
                                                className="text-red-600 hover:text-red-700"
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    ))}
                                    
                                    {(!editingNode.variableMappings || editingNode.variableMappings.length === 0) && (
                                        <div className="text-center py-4 text-muted-foreground text-sm">
                                            No variable mappings configured. Click "Add Mapping" to create one.
                                        </div>
                                    )}
                                </div>
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
                                    const updatedNodes = { ...chainData.nodes };
                                    
                                    // If marking as initiating, unmark all other nodes
                                    if (editingNode.isInitiating) {
                                        Object.keys(updatedNodes).forEach(nodeId => {
                                            if (updatedNodes[nodeId].isInitiating) {
                                                updatedNodes[nodeId].isInitiating = false;
                                            }
                                        });
                                    }
                                    
                                    // Ensure the node ID matches the ruleId for rule nodes
                                    const nodeKey = editingNode.ruleId || editingNode.id;
                                    
                                    // If the node ID changed, remove the old node
                                    if (nodeKey !== editingNode.id && updatedNodes[editingNode.id]) {
                                        delete updatedNodes[editingNode.id];
                                    }
                                    
                                    // Update the edited node with the correct ID
                                    updatedNodes[nodeKey] = {
                                        ...chainData.nodes[editingNode.id],
                                        id: nodeKey, // Ensure ID matches ruleId
                                        label: editingNode.label,
                                        ruleId: editingNode.ruleId || nodeKey, // Ensure ruleId is set
                                        expression: editingNode.expression,
                                        description: editingNode.description,
                                        isInitiating: editingNode.isInitiating,
                                        variableMappings: editingNode.variableMappings || []
                                    };
                                    
                                    // Update edges if the node ID changed
                                    let updatedEdges = chainData.edges;
                                    if (nodeKey !== editingNode.id) {
                                        updatedEdges = chainData.edges.map(edge => ({
                                            ...edge,
                                            from: edge.from === editingNode.id ? nodeKey : edge.from,
                                            to: edge.to === editingNode.id ? nodeKey : edge.to
                                        }));
                                    }
                                    
                                    const updatedChainData = {
                                        ...chainData,
                                        nodes: updatedNodes,
                                        edges: updatedEdges
                                    };
                                    onChainUpdate(updatedChainData);
                                    
                                    // Update React Flow nodes
                                    setNodes((nds) => nds.map((node) => {
                                        // If this is the edited node
                                        if (node.id === editingNode.id) {
                                            return { 
                                                ...node, 
                                                id: nodeKey, // Update the node ID to match ruleId
                                                data: { 
                                                    ...node.data, 
                                                    label: editingNode.label,
                                                    ruleId: editingNode.ruleId || nodeKey,
                                                    expression: editingNode.expression,
                                                    description: editingNode.description,
                                                    isInitiating: editingNode.isInitiating
                                                } 
                                            };
                                        }
                                        // If marking as initiating, unmark all other rule nodes
                                        else if (editingNode.isInitiating && node.type === 'ruleNode') {
                                            return {
                                                ...node,
                                                data: {
                                                    ...node.data,
                                                    isInitiating: false
                                                }
                                            };
                                        }
                                        return node;
                                    }));
                                    
                                    // Update React Flow edges if the node ID changed
                                    if (nodeKey !== editingNode.id) {
                                        setEdges((eds) => eds.map((edge) => ({
                                            ...edge,
                                            source: edge.source === editingNode.id ? nodeKey : edge.source,
                                            target: edge.target === editingNode.id ? nodeKey : edge.target
                                        })));
                                    }
                                    
                                    // Show message if marked as initiating
                                    if (editingNode.isInitiating) {
                                        toast.success(`${editingNode.label} is now the starting rule`);
                                    }
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
            
            {/* Rule Selection Dialog */}
            <Dialog open={isRuleSelectDialogOpen} onOpenChange={setIsRuleSelectDialogOpen}>
                <DialogContent className="w-[600px]">
                    <DialogHeader>
                        <DialogTitle>Select Existing Rule</DialogTitle>
                        <DialogDescription>
                            Choose an existing rule to add to the chain map. You can either create a new empty rule or select an existing rule with its current configuration.
                        </DialogDescription>
                        <div className="mt-2 text-xs text-muted-foreground">
                            Note: Selecting a rule will load it with all its child rules and actions.
                        </div>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Select Rule</Label>
                            <SimpleRuleSelector
                                dataServicesRootURI={dataServicesRootURI || ""}
                                onRuleSelect={setSelectedRuleId}
                                value={selectedRuleId}
                                placeholder="-- Select a rule --"
                                disabled={false}
                            />
                            <p className="text-sm text-muted-foreground">
                                Select a rule to add it to the chain map at the dropped position.
                            </p>
                        </div>
                    </div>
                    
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                // Create empty rule instead
                                if (pendingRuleDropPosition) {
                                    const newRuleId = generateRuleId();
                                    const newNodeId = newRuleId; // Use the ruleId as the nodeId for consistency
                                    const newNode: Node = {
                                        id: newNodeId,
                                        type: 'ruleNode',
                                        position: pendingRuleDropPosition,
                                        data: {
                                            label: `New Rule ${newRuleId}`,
                                            ruleId: newRuleId,
                                            expression: '',
                                            isInitiating: false,
                                            readonly: false,
                                            onClick: onNodeClick
                                        }
                                    };
                                    
                                    setNodes((nds) => [...nds, newNode]);
                                    
                                    // Update chain data
                                    if (onChainUpdate && chainData) {
                                        const newChainNode: ChainNode = {
                                            id: newNodeId,
                                            label: `New Rule ${newRuleId}`,
                                            ruleId: newRuleId,
                                            expression: '',
                                            position: pendingRuleDropPosition
                                        };
                                        
                                        const updatedChainData = {
                                            ...chainData,
                                            nodes: {
                                                ...chainData.nodes,
                                                [newNodeId]: newChainNode
                                            }
                                        };
                                        onChainUpdate(updatedChainData);
                                    }
                                    
                                    toast.success("Added new empty rule");
                                }
                                
                                setIsRuleSelectDialogOpen(false);
                                setPendingRuleDropPosition(null);
                                setSelectedRuleId("");
                            }}
                        >
                            Create Empty Rule
                        </Button>
                        <Button
                            onClick={handleRuleSelect}
                            disabled={!selectedRuleId}
                        >
                            Add Selected Rule
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
