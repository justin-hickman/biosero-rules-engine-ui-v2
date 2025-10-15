import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Node,
    Edge,
    Controls,
    Background,
    BackgroundVariant,
    MiniMap,
    ReactFlowProvider,
    Position,
    MarkerType,
    Panel,
    Handle
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { cn } from '../lib/utils';
import { Badge } from '../components/ui/badge';
import { Tooltip } from '../components/ui/tooltip';
import {
    CheckCircle,
    XCircle,
    Clock,
    Circle,
    Pause,
    SpinnerGap,
    Eye,
    GitBranch,
    Lightning
} from '@phosphor-icons/react';
// Import types from App.tsx
type ChainData = {
    nodes: Record<string, ChainNode>;
    edges: Array<{
        from: string;
        to: string;
        type: 'success' | 'failure' | 'connection';
        label?: string;
        style?: any;
        animated?: boolean;
    }>;
};

type ChainNode = {
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
    targetRuleId?: string;
    evaluationType?: string;
    topic?: string;
    variableMappings?: Record<string, any>;
    position?: { x: number; y: number };
    [key: string]: any;
};
import { RuleResult } from '../services/RulesEngineService';

interface MonitorChainFlowProps {
    chainData: ChainData | null;
    executionHistory?: RuleResult[];
    currentRuleName?: string;
    onNodeClick?: (nodeId: string) => void;
    chainContext?: any; // New ChainContext data
}

type NodeStatus = 'pending' | 'processing' | 'success' | 'failed' | 'skipped';

interface MonitorNodeData {
    label: string;
    status: NodeStatus;
    duration?: string;
    errorMessage?: string;
    isAction?: boolean;
    actionType?: string;
    templateName?: string;
    expression?: string;
    variables?: Record<string, any>;
    [key: string]: any; // Add index signature
}

// Custom node component for monitoring
const MonitorNode = ({ data }: { data: MonitorNodeData }) => {
    const isRule = !data.isAction;
    
    
    const getStatusIcon = () => {
        switch (data.status) {
            case 'success':
                return <CheckCircle className="w-4 h-4" weight="fill" style={{ color: '#00FF41' }} />;
            case 'failed':
                return <XCircle className="w-4 h-4 text-red-500" weight="fill" />;
            case 'pending': // NotRun state
                return <Circle className="w-4 h-4 text-gray-400" />;
            default:
                return <Circle className="w-4 h-4 text-gray-400" />;
        }
    };

    const getNodeStyle = () => {
        let baseClasses = "bg-slate-800 rounded-lg shadow-lg transition-all duration-200 min-w-[250px]";
        
        // Base border color
        let borderColor = isRule ? "border-2 border-blue-500" : "border-2 border-slate-600";
        
        // Override border color based on status
        switch (data.status) {
            case 'success':
                borderColor = "border-2 border-emerald-500";
                break;
            case 'failed':
                borderColor = "border-2 border-red-500";
                break;
            case 'pending': // NotRun state
                borderColor = "border-2 border-gray-500";
                break;
        }
        
        return `${baseClasses} ${borderColor}`;
    };

    const getIconColor = () => {
        if (data.isAction) {
            switch (data.actionType) {
                case 'ExecuteOrchestratorWorkflowAction':
                    return 'text-purple-500';
                case 'ExecuteGbgSchedulerProcessAction':
                    return 'text-orange-500';
                case 'RuleEvaluationAction':
                    return 'text-blue-500';
                default:
                    return 'text-gray-500';
            }
        }
        return 'text-blue-500';
    };

    return (
        <div className={getNodeStyle()} data-status={data.status}>
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-slate-500 !w-3 !h-3 !border-2 !border-slate-800"
            />
            
            <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                        {isRule ? (
                            <GitBranch className={`w-4 h-4 ${getIconColor()} flex-shrink-0`} />
                        ) : (
                            <Lightning className={`w-4 h-4 ${getIconColor()} flex-shrink-0`} />
                        )}
                        <div className="flex flex-col gap-1">
                            <span className="font-bold text-base text-white">
                                {data.isAction ? (data.label || data.actionType || 'Action') : (data.ruleName || data.label)}
                            </span>
                            {data.ruleId && (
                                <span className="text-xs italic text-slate-400">
                                    {data.ruleId}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {getStatusIcon()}
                    </div>
                </div>
                
                {data.isAction && data.actionType && (
                    <div className={`text-xs ${getIconColor()} mt-1`}>
                        {data.actionType.replace(/([A-Z])/g, ' $1').trim()}
                        {data.templateName && (
                            <div className="text-xs text-slate-300 mt-0.5">
                                Template: {data.templateName}
                            </div>
                        )}
                    </div>
                )}
                
                
                {data.duration && (
                    <div className="text-xs text-slate-300 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {data.duration}
                    </div>
                )}
                
                {data.errorMessage && (
                    <div className="text-xs text-red-400 mt-2 line-clamp-2">
                        {data.errorMessage}
                    </div>
                )}
            </div>
            
            {isRule && (
                <>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="success"
                        className="!w-3 !h-3 !border-2 !border-slate-800 !top-[35%]"
                        style={{ backgroundColor: '#00FF41' }}
                    />
                    <div className="absolute right-[-35px] top-[30%] text-[10px] font-medium" style={{ color: '#00FF41' }}>
                        ✓
                    </div>
                    
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="failure"
                        className="!bg-red-500 !w-3 !h-3 !border-2 !border-slate-800 !top-[65%]"
                    />
                    <div className="absolute right-[-35px] top-[60%] text-[10px] text-red-400 font-medium">
                        ✗
                    </div>
                </>
            )}
        </div>
    );
};

const nodeTypes = {
    monitor: MonitorNode,
};

// Grid snapping utility
const snapToGrid = (position: { x: number; y: number }, gridSize = 15) => ({
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize,
});

// Auto-layout function using dagre with success/failure path prioritization
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    const nodeWidth = 250; // Matches MonitorNode min-width
    const nodeHeight = 100;
    
    // Configure for dramatically tighter layout
    dagreGraph.setGraph({ 
        rankdir: direction, 
        nodesep: 3, // REDUCED vertical spacing between nodes in same rank by 4x (was 12, now 3)
        ranksep: 200, // REDUCED horizontal spacing between ranks (was 1250, now 200)
        edgesep: 80,  // Restored original spacing between edges
        ranker: 'network-simplex', // Better algorithm for complex graphs
        align: 'DL'   // Align nodes down-left for cleaner look
    });
    
    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });
    
    edges.forEach((edge) => {
        // Give different weights to success/failure paths for better visual separation
        const weight = edge.sourceHandle === 'failure' ? 2 : 1;
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
        
        // Calculate new Y positions with EXTREMELY decreased spacing
        const totalNodes = successNodes.length + neutralNodes.length + failureNodes.length;
        const totalHeight = (totalNodes - 1) * (nodeHeight + 1); // EXTREMELY decreased to 1px spacing between nodes
        const startY = -totalHeight / 2;
        
        let currentY = startY;
        
        // Position success nodes at the top
        successNodes.forEach(node => {
            node.position.y = currentY;
            currentY += nodeHeight + 1; // EXTREMELY decreased spacing
        });
        
        // Position neutral nodes in the middle
        neutralNodes.forEach(node => {
            node.position.y = currentY;
            currentY += nodeHeight + 1; // EXTREMELY decreased spacing
        });
        
        // Position failure nodes at the bottom
        failureNodes.forEach(node => {
            node.position.y = currentY;
            currentY += nodeHeight + 1; // EXTREMELY decreased spacing
        });
    });
    
    return { nodes: newNodes, edges };
};

function MonitorChainFlowInner({
    chainData,
    executionHistory = [],
    currentRuleName,
    onNodeClick,
    chainContext
}: MonitorChainFlowProps) {
    // Force re-render every second while chain is active
    const [, setForceUpdate] = useState(0);

    useEffect(() => {
        if (chainContext?.isActive && !chainContext?.isComplete) {
            const timer = setInterval(() => {
                setForceUpdate(v => v + 1);
            }, 1000); // Update every 1 second for real-time animations (only for selected sample)
            return () => clearInterval(timer);
        }
    }, [chainContext?.isActive, chainContext?.isComplete]);
    // Calculate nodes and edges from chain data or execution history
    const { nodes, edges } = useMemo(() => {
        
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        
        // Calculate node statuses using new ChainContext data
        const nodeStatuses: Record<string, NodeStatus> = {};
        
        // Use new ChainContext data if available
        if (chainContext?.rules && chainContext.rules.length > 0) {
            
            // Use the rules array from BRE endpoint DTO
            chainContext.rules.forEach((rule: any) => {
                switch (rule.status) {
                    case 'Success':
                        nodeStatuses[rule.identifier] = 'success';
                        break;
                    case 'Failed':
                    case 'Error':
                        nodeStatuses[rule.identifier] = 'failed';
                        break;
                    case 'NotRun':
                        nodeStatuses[rule.identifier] = 'pending';
                        break;
                    default:
                        nodeStatuses[rule.identifier] = 'pending';
                }
            });
            
        } else {
            // Fallback to legacy execution history
            executionHistory.forEach((result) => {
                nodeStatuses[result.ruleName] = result.isSuccess ? 'success' : 'failed';
                
                // Also track action statuses if available
                if (result.actionsToExecute) {
                    result.actionsToExecute.forEach((action: any) => {
                        if (action.actionType) {
                            const actionId = `${result.ruleName}_${action.actionType}`;
                            nodeStatuses[actionId] = result.isSuccess ? 'success' : 'failed';
                        }
                    });
                }
            });

            // Set current rule as processing only if it hasn't been executed yet
            if (currentRuleName && !nodeStatuses[currentRuleName]) {
                nodeStatuses[currentRuleName] = 'processing';
            }
        }

        // If we have chainData, use it
        if (chainData && Object.keys(chainData.nodes).length > 0) {
            // Mark unexecuted nodes as pending
            Object.keys(chainData.nodes).forEach(nodeId => {
                if (!nodeStatuses[nodeId]) {
                    nodeStatuses[nodeId] = 'pending';
                }
            });

            // Create nodes
            Object.entries(chainData.nodes).forEach(([nodeId, node]) => {
                const executionResult = executionHistory.find(r => r.ruleName === nodeId);
                const status = nodeStatuses[nodeId] || 'pending';
                
                // For action nodes, check if they're connected to an executed rule
                let actionStatus = status;
                if (node.actionType) {
                    // Find the rule that connects to this action
                    const connectionEdge = chainData.edges.find(edge => edge.to === nodeId);
                    if (connectionEdge) {
                        const sourceRuleStatus = nodeStatuses[connectionEdge.from];
                        if (sourceRuleStatus === 'success' && connectionEdge.type === 'success') {
                            actionStatus = 'success';
                        } else if (sourceRuleStatus === 'failed' && connectionEdge.type === 'failure') {
                            actionStatus = 'success'; // Action was executed on failure path
                        } else if (sourceRuleStatus === 'processing') {
                            actionStatus = 'processing';
                        }
                    }
                }

                // Look up rule name from chainContext actions array
                let displayName = node.label || nodeId;
                let ruleIdentifier = node.ruleId || nodeId;

                if (!node.actionType && chainContext?.chainStructure?.actions) {
                    const ruleAction = chainContext.chainStructure.actions.find((a: any) => a.ruleId === nodeId);
                    if (ruleAction) {
                        displayName = ruleAction.ruleName;
                        ruleIdentifier = ruleAction.ruleId;
                    } else {
                    }
                }

                const nodeData: MonitorNodeData = {
                    label: displayName,  // Use looked-up name
                    ruleName: displayName,  // Add ruleName field for MonitorNode component
                    status: node.actionType ? actionStatus : status,
                    duration: undefined, // Duration calculation would need to be done from timestamps
                    errorMessage: executionResult?.errorMessage,
                    isAction: !!node.actionType,
                    actionType: node.actionType,
                    templateName: node.templateName,
                    ruleId: ruleIdentifier  // Use looked-up identifier
                };

                console.log(`📊 Creating node ${nodeId}:`, {
                    nodeData,
                    executionResult: executionResult ? {
                        ruleName: executionResult.ruleName,
                        isSuccess: executionResult.isSuccess,
                        errorMessage: executionResult.errorMessage
                    } : null
                });

                newNodes.push({
                    id: nodeId,
                    type: 'monitor',
                    position: node.position || { x: 0, y: 0 },
                    data: { ...nodeData, status: nodeData.status }
                });
            });

            // Create edges with path highlighting
            chainData.edges.forEach((edge, index) => {
                const sourceNode = chainData.nodes[edge.from];
                const targetNode = chainData.nodes[edge.to];
                const sourceStatus = nodeStatuses[edge.from];
                const targetStatus = nodeStatuses[edge.to];
                const isExecuted = sourceStatus === 'success' || sourceStatus === 'failed';
                const isActivePath = isExecuted && (
                    (edge.type === 'success' && sourceStatus === 'success') ||
                    (edge.type === 'failure' && sourceStatus === 'failed')
                );
                
                // Animate edges that are actively being processed or completed on active path
                const shouldAnimate = isActivePath || (
                    isExecuted && targetStatus === 'pending' && (
                        (edge.type === 'success' && sourceStatus === 'success') ||
                        (edge.type === 'failure' && sourceStatus === 'failed')
                    )
                );

                // For action nodes, inherit status from their source rule if executed
                if (targetNode?.actionType && isActivePath) {
                    nodeStatuses[edge.to] = 'success';
                }

                // Use the edge styling that was already set in SampleMonitor.tsx
                const edgeStyle = edge.style || {};
                const edgeAnimated = edge.animated || false;
                
                
                newEdges.push({
                    id: `edge-${index}`,
                    source: edge.from,
                    target: edge.to,
                    sourceHandle: edge.type,
                    targetHandle: undefined,
                    type: 'default', // Bezier curves instead of smoothstep
                    animated: shouldAnimate, // Animate executed paths and active processing
                    data: { success: edge.type === 'success' }, // Add data attribute for CSS targeting
                    style: {
                        stroke: (edge.type === 'success' ? '#00FF41' : edge.type === 'failure' ? '#ef4444' : '#00FF41'), // Bright neon green #00FF41
                        strokeWidth: 4, // More reasonable stroke width
                        opacity: 1, // Always visible for testing
                        strokeDasharray: isActivePath ? '8,4' : undefined, // Add dashed lines for executed paths
                        filter: undefined // NO haze/glow effect
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: (edge.type === 'success' ? '#00FF41' : edge.type === 'failure' ? '#ef4444' : '#00FF41'), // Bright neon green #00FF41
                        width: 8, // More proportional arrow size
                        height: 8,
                    },
                });
            });
        } else if (executionHistory.length > 0) {
            // If no chainData, build a simple flow from execution history
            let yPos = 100;
            let prevNodeId: string | null = null;
            
            executionHistory.forEach((result, index) => {
                const ruleNodeId = result.ruleName;
                const status = nodeStatuses[ruleNodeId] || 'pending';
                
                // Try to find rule name from actions array
                const ruleAction = chainContext?.chainStructure?.actions?.find((a: any) => a.ruleId === result.ruleName);
                // Use rule name from actions if found, otherwise use a formatted version
                const ruleDisplayName = ruleAction?.ruleName || `Rule: ${result.ruleName}`;
                const ruleId = ruleAction?.ruleId || result.ruleName;
                
                // Create rule node with BRE data
                const ruleNode = {
                    id: ruleNodeId,
                    type: 'monitor',
                    position: { x: 200, y: yPos },
                    data: {
                        label: ruleDisplayName, // Rule display name from BRE
                        ruleName: ruleDisplayName, // Rule display name for MonitorNode component
                        status: status,
                        errorMessage: result.errorMessage,
                        isAction: false,
                        ruleId: ruleId, // Rule ID from BRE
                    } as MonitorNodeData,
                };
                newNodes.push(ruleNode);
                
                // Create edge from previous node
                if (prevNodeId) {
                    const prevResult = executionHistory[index - 1];
                    newEdges.push({
                        id: `edge-${index}`,
                        source: prevNodeId,
                        target: ruleNodeId,
                        sourceHandle: prevResult.isSuccess ? 'success' : 'failure',
                        type: 'default', // Bezier curves
                        animated: true, // Animate executed paths
                        data: { success: prevResult.isSuccess }, // Add data attribute for CSS targeting
                        style: {
                            stroke: prevResult.isSuccess ? '#00FF41' : '#ef4444', // Bright neon green #00FF41
                            strokeWidth: 4, // Match width from chainData
                            strokeDasharray: '8,4', // Consistent dash pattern
                            filter: undefined // Remove glow
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: prevResult.isSuccess ? '#00FF41' : '#ef4444', // Bright neon green #00FF41
                            width: 8, // Consistent arrow size
                            height: 8,
                        },
                    });
                }
                
                yPos += 120;
                
                // Add action nodes from BRE chainStructure.actions if available
                if (chainContext?.chainStructure?.actions) {
                    const ruleActions = chainContext.chainStructure.actions.filter((action: any) => action.ruleName === result.ruleName);
                    let xPos = 400;
                    ruleActions.forEach((action: any, actionIndex: number) => {
                        const actionNodeId = `${ruleNodeId}_action_${actionIndex}`;
                        
                        // Get rule info for action node display
                        const ruleInfo = chainContext?.rules?.find((r: any) => r.identifier === action.ruleName);
                        const ruleId = ruleInfo?.identifier || action.ruleName;
                        
                        const actionNode = {
                            id: actionNodeId,
                            type: 'monitor',
                            position: { x: xPos, y: yPos - 100 },
                            data: {
                                label: action.actionType || 'Action', // Action name from BRE
                                status: result.isSuccess ? 'success' : 'failed',
                                isAction: true,
                                actionType: action.actionType,
                                templateName: action.templateName,
                                ruleId: ruleId, // Rule ID from BRE
                            } as MonitorNodeData,
                        };
                        newNodes.push(actionNode);
                        
                        // Create edge from rule to action
                        newEdges.push({
                            id: `edge-action-${index}-${actionIndex}`,
                            source: ruleNodeId,
                            target: actionNodeId,
                            sourceHandle: result.isSuccess ? 'success' : 'failure',
                            type: 'default', // Bezier curves
                            animated: true, // Animate executed paths
                            data: { success: result.isSuccess }, // Add data attribute for CSS targeting
                            style: {
                                stroke: result.isSuccess ? '#00FF41' : '#ef4444', // Bright neon green #00FF41
                                strokeWidth: 4, // Match width from chainData
                                strokeDasharray: '8,4', // Consistent dash pattern
                                filter: undefined // Remove glow
                            },
                            markerEnd: {
                                type: MarkerType.ArrowClosed,
                                color: result.isSuccess ? '#00FF41' : '#ef4444', // Bright neon green #00FF41
                                width: 8, // Consistent arrow size
                                height: 8,
                            },
                        });
                        
                        xPos += 250;
                    });
                    
                    yPos += 80;
                }
                
                prevNodeId = ruleNodeId;
            });
            
            // Add current rule if not in history
            if (currentRuleName && !executionHistory.find(r => r.ruleName === currentRuleName)) {
                // Try to find rule name from actions array
                const ruleAction = chainContext?.chainStructure?.actions?.find((a: any) => a.ruleId === currentRuleName);
                
                // Use rule name from actions if found, otherwise use a formatted version
                const ruleDisplayName = ruleAction?.ruleName || `Rule: ${currentRuleName}`;
                const ruleId = ruleAction?.ruleId || currentRuleName;
                
                const currentNode = {
                    id: currentRuleName,
                    type: 'monitor',
                    position: { x: 200, y: yPos },
                    data: {
                        label: ruleDisplayName, // Rule display name from BRE
                        ruleName: ruleDisplayName, // Rule display name for MonitorNode component
                        status: 'processing' as NodeStatus,
                        isAction: false,
                        ruleId: ruleId, // Rule ID from BRE
                    } as MonitorNodeData,
                };
                newNodes.push(currentNode);
                
                // Add edge from last executed rule
                if (prevNodeId) {
                    const lastResult = executionHistory[executionHistory.length - 1];
                    newEdges.push({
                        id: `edge-current`,
                        source: prevNodeId,
                        target: currentRuleName,
                        sourceHandle: lastResult.isSuccess ? 'success' : 'failure',
                        type: 'default', // Bezier curves
                        animated: true,
                        data: { success: lastResult.isSuccess }, // Add data attribute for CSS targeting
                        style: {
                            stroke: lastResult.isSuccess ? '#00FF41' : '#ef4444', // Bright neon green #00FF41
                            strokeWidth: 4, // Match width from chainData
                            strokeDasharray: '8,4', // Consistent dash pattern
                            filter: undefined // Remove glow
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: lastResult.isSuccess ? '#00FF41' : '#ef4444', // Bright neon green #00FF41
                            width: 8, // Consistent arrow size
                            height: 8,
                        },
                    });
                }
            }
        }

        console.log('📊 MonitorChainFlow: Final result:', {
            nodeCount: newNodes.length,
            edgeCount: newEdges.length,
            nodes: newNodes.map(n => ({ id: n.id, label: n.data.label, status: n.data.status })),
            edges: newEdges.map(e => ({ from: e.source, to: e.target, type: e.type }))
        });

        // Apply dagre layout algorithm for proper hierarchical arrangement
        if (newNodes.length > 0) {
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges, 'LR');
            return { nodes: layoutedNodes, edges: layoutedEdges };
        }

        return { nodes: newNodes, edges: newEdges };
    }, [chainData, executionHistory, currentRuleName, chainContext, chainContext?.rules]);

    const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (onNodeClick) {
            onNodeClick(node.id);
        }
    }, [onNodeClick]);

    if (!chainData) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                    <Lightning className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No chain data available</p>
                    <p className="text-sm mt-1">Select a sample to view its execution flow</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full pb-20"> {/* Add bottom padding to avoid overlapping with controls */}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ 
                    padding: 0.2,
                    includeHiddenNodes: false,
                    minZoom: 0.1,
                    maxZoom: 1.5,
                    nodes: nodes.filter(n => !n.data.isAction) // Only fit view to rule nodes, not action nodes
                }}
                defaultEdgeOptions={{
                    type: 'default', // Changed from smoothstep to default (Bezier)
                    style: { 
                        strokeWidth: 2, // Default stroke width for inactive edges
                        opacity: 1 // Full opacity for all edges
                    },
                    animated: false // Individual edges will override this
                }}
                minZoom={0.1}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={true}
            >
                <Background variant={BackgroundVariant.Dots} />
                {/* Removed Controls and MiniMap to eliminate white squares at bottom */}
                
                <Panel position="top-right" className="m-4">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg border-2 border-slate-300 dark:border-slate-600">
                        <div className="text-sm font-semibold mb-3 text-slate-900 dark:text-slate-100">Rule Evaluation States</div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <GitBranch className="w-4 h-4 text-blue-500" />
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Rule</span>
                            </div>
                            <div className="border-t pt-2 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <Circle className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs text-slate-600 dark:text-slate-400">NotRun</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" weight="fill" style={{ color: '#00FF41' }} />
                                    <span className="text-xs text-slate-600 dark:text-slate-400">Success</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <XCircle className="w-4 h-4 text-red-500" weight="fill" />
                                    <span className="text-xs text-slate-600 dark:text-slate-400">Failed</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </Panel>
            </ReactFlow>
        </div>
    );
}

// Wrap with ReactFlowProvider
export function MonitorChainFlowWrapper(props: MonitorChainFlowProps) {
    return (
        <ReactFlowProvider>
            <MonitorChainFlowInner {...props} />
        </ReactFlowProvider>
    );
}
