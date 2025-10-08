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
import { ChainData, ChainNode } from '../App';
import { RuleResult } from '../services/RulesEngineService';

interface MonitorChainFlowProps {
    chainData: ChainData | null;
    executionHistory?: RuleResult[];
    currentRuleName?: string;
    onNodeClick?: (nodeId: string) => void;
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
}

// Custom node component for monitoring
const MonitorNode = ({ data }: { data: MonitorNodeData }) => {
    const isRule = !data.isAction;
    
    const getStatusIcon = () => {
        switch (data.status) {
            case 'processing':
                return <SpinnerGap className="w-4 h-4 animate-spin" />;
            case 'success':
                return <CheckCircle className="w-4 h-4" weight="fill" />;
            case 'failed':
                return <XCircle className="w-4 h-4" weight="fill" />;
            case 'skipped':
                return <Pause className="w-4 h-4" weight="fill" />;
            default:
                return <Circle className="w-4 h-4" />;
        }
    };

    const getNodeStyle = () => {
        let baseClasses = "bg-white dark:bg-slate-800 border-2 rounded-lg shadow-md transition-all duration-200 min-w-[250px]";
        
        // Base border color
        let borderColor = isRule ? "border-blue-500" : "border-slate-300 dark:border-slate-600";
        
        // Override border color based on status
        switch (data.status) {
            case 'processing':
                borderColor = "border-yellow-500 shadow-lg";
                break;
            case 'success':
                borderColor = "border-green-500";
                break;
            case 'failed':
                borderColor = "border-red-500";
                break;
        }
        
        return `${baseClasses} ${borderColor} ${data.status === 'processing' ? 'scale-105' : ''}`;
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
        <div className={getNodeStyle()}>
            <Handle
                type="target"
                position={Position.Left}
                className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
            />
            
            <div className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                        {isRule ? (
                            <GitBranch className={`w-4 h-4 ${getIconColor()} flex-shrink-0`} />
                        ) : (
                            <Lightning className={`w-4 h-4 ${getIconColor()} flex-shrink-0`} />
                        )}
                        <span className="font-medium text-sm text-slate-900 dark:text-slate-100">
                            {data.label}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {getStatusIcon()}
                    </div>
                </div>
                
                {data.isAction && data.actionType && (
                    <div className={`text-xs ${getIconColor()} mt-1`}>
                        {data.actionType.replace(/([A-Z])/g, ' $1').trim()}
                        {data.templateName && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Template: {data.templateName}
                            </div>
                        )}
                    </div>
                )}
                
                {data.duration && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {data.duration}
                    </div>
                )}
                
                {data.errorMessage && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-2 line-clamp-2">
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
                        className="!bg-green-500 !w-3 !h-3 !border-2 !border-white !top-[35%]"
                    />
                    <div className="absolute right-[-35px] top-[30%] text-[10px] text-green-600 font-medium">
                        ✓
                    </div>
                    
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="failure"
                        className="!bg-red-500 !w-3 !h-3 !border-2 !border-white !top-[65%]"
                    />
                    <div className="absolute right-[-35px] top-[60%] text-[10px] text-red-600 font-medium">
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

function MonitorChainFlowInner({
    chainData,
    executionHistory = [],
    currentRuleName,
    onNodeClick
}: MonitorChainFlowProps) {
    // Calculate nodes and edges from chain data or execution history
    const { nodes, edges } = useMemo(() => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        
        // Calculate node statuses
        const nodeStatuses: Record<string, NodeStatus> = {};
        
        // Process execution history to determine node statuses
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

                const nodeData: MonitorNodeData = {
                    label: node.label || nodeId,
                    status: node.actionType ? actionStatus : status,
                    duration: undefined, // Duration calculation would need to be done from timestamps
                    errorMessage: executionResult?.errorMessage,
                    isAction: !!node.actionType,
                    actionType: node.actionType,
                    templateName: node.templateName
                };

                newNodes.push({
                    id: nodeId,
                    type: 'monitor',
                    position: node.position || { x: 0, y: 0 },
                    data: nodeData,
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
                ) && (targetStatus !== 'pending');

                // For action nodes, inherit status from their source rule if executed
                if (targetNode?.actionType && isActivePath) {
                    nodeStatuses[edge.to] = 'success';
                }

                newEdges.push({
                    id: `edge-${index}`,
                    source: edge.from,
                    target: edge.to,
                    sourceHandle: edge.type,
                    targetHandle: undefined,
                    type: 'smoothstep',
                    animated: targetStatus === 'processing',
                    style: {
                        stroke: isActivePath 
                            ? (edge.type === 'success' ? '#16a34a' : '#dc2626')
                            : '#94a3b8',
                        strokeWidth: isActivePath ? 3 : 2,
                        opacity: isExecuted ? 1 : 0.4,
                        strokeDasharray: targetNode?.actionType ? '5,5' : undefined
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        color: isActivePath 
                            ? (edge.type === 'success' ? '#16a34a' : '#dc2626')
                            : '#94a3b8',
                        width: 20,
                        height: 20,
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
                
                // Create rule node
                const ruleNode = {
                    id: ruleNodeId,
                    type: 'monitor',
                    position: { x: 200, y: yPos },
                    data: {
                        label: result.ruleName,
                        status: status,
                        errorMessage: result.errorMessage,
                        isAction: false,
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
                        type: 'smoothstep',
                        style: {
                            stroke: prevResult.isSuccess ? '#16a34a' : '#dc2626',
                            strokeWidth: 3,
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: prevResult.isSuccess ? '#16a34a' : '#dc2626',
                            width: 20,
                            height: 20,
                        },
                    });
                }
                
                yPos += 120;
                
                // Add action nodes if available
                if (result.actionsToExecute && result.actionsToExecute.length > 0) {
                    let xPos = 400;
                    result.actionsToExecute.forEach((action: any, actionIndex: number) => {
                        const actionNodeId = `${ruleNodeId}_action_${actionIndex}`;
                        const actionNode = {
                            id: actionNodeId,
                            type: 'monitor',
                            position: { x: xPos, y: yPos - 100 },
                            data: {
                                label: action.actionType || 'Action',
                                status: result.isSuccess ? 'success' : 'failed',
                                isAction: true,
                                actionType: action.actionType,
                                templateName: action.templateName,
                            } as MonitorNodeData,
                        };
                        newNodes.push(actionNode);
                        
                        // Create edge from rule to action
                        newEdges.push({
                            id: `edge-action-${index}-${actionIndex}`,
                            source: ruleNodeId,
                            target: actionNodeId,
                            sourceHandle: result.isSuccess ? 'success' : 'failure',
                            type: 'smoothstep',
                            style: {
                                stroke: result.isSuccess ? '#16a34a' : '#dc2626',
                                strokeWidth: 2,
                                strokeDasharray: '5,5',
                            },
                            markerEnd: {
                                type: MarkerType.ArrowClosed,
                                color: result.isSuccess ? '#16a34a' : '#dc2626',
                                width: 15,
                                height: 15,
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
                const currentNode = {
                    id: currentRuleName,
                    type: 'monitor',
                    position: { x: 200, y: yPos },
                    data: {
                        label: currentRuleName,
                        status: 'processing' as NodeStatus,
                        isAction: false,
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
                        type: 'smoothstep',
                        animated: true,
                        style: {
                            stroke: lastResult.isSuccess ? '#16a34a' : '#dc2626',
                            strokeWidth: 3,
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: lastResult.isSuccess ? '#16a34a' : '#dc2626',
                            width: 20,
                            height: 20,
                        },
                    });
                }
            }
        }

        return { nodes: newNodes, edges: newEdges };
    }, [chainData, executionHistory, currentRuleName]);

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
        <div className="h-full w-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ 
                    padding: 0.3,
                    includeHiddenNodes: false,
                    minZoom: 0.1,
                    maxZoom: 1.5
                }}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                }}
                minZoom={0.1}
                maxZoom={2}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={true}
            >
                <Background variant={BackgroundVariant.Dots} />
                <Controls />
                <MiniMap />
                
                <Panel position="top-right" className="m-4">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-lg border-2 border-slate-300 dark:border-slate-600">
                        <div className="text-sm font-semibold mb-3 text-slate-900 dark:text-slate-100">Legend</div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <GitBranch className="w-4 h-4 text-blue-500" />
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Rule</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Lightning className="w-4 h-4 text-purple-500" />
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Action</span>
                                </div>
                            </div>
                            <div className="border-t pt-2 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <Circle className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs text-slate-600 dark:text-slate-400">Pending</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <SpinnerGap className="w-4 h-4 text-yellow-500 animate-spin" />
                                    <span className="text-xs text-slate-600 dark:text-slate-400">Processing</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500" weight="fill" />
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
