import React, { useState, useEffect, useCallback } from 'react';
import { Lightning, CheckCircle, XCircle, Clock, Code } from '@phosphor-icons/react';
import { Loader2 } from 'lucide-react';
import { SampleList } from './SampleList';
import { MonitorChainFlowWrapper } from './MonitorChainFlow';
import { ContextViewer } from './ContextViewer';
import { 
    WorkflowContext, 
    ChainContext,
    RulesEngineService 
} from '../services/RulesEngineService';
// Define ChainData locally to avoid import issues
interface ChainData {
    nodes: Record<string, any>;
    edges: Array<{ from: string; to: string; type: 'success' | 'failure' | 'connection'; label?: string }>;
}
import { apiFetchRuleDetails } from '../App';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface SampleMonitorProps {
    rulesEngineUrl: string;
    dataServicesUrl: string;
    chainData?: ChainData | null;
    onLoadRule?: (ruleId: string) => void;
    isAutoRefresh?: boolean;
}

export const SampleMonitor = React.memo(function SampleMonitor({ 
    rulesEngineUrl, 
    dataServicesUrl,
    chainData,
    onLoadRule,
    isAutoRefresh = false
}: SampleMonitorProps) {
    const [selectedContext, setSelectedContext] = useState<WorkflowContext | null>(null);
    const [chainExecution, setChainExecution] = useState<ChainContext | null>(null);
    const [dynamicChainData, setDynamicChainData] = useState<ChainData | null>(null);
    const [isLoadingChain, setIsLoadingChain] = useState(false);
    const [isInitialChainLoad, setIsInitialChainLoad] = useState(true);
    const [pollingInterval, setPollingInterval] = useState<number | null>(null);
    const lastChainUpdate = React.useRef<number>(0);
    const [selectedNodeDetails, setSelectedNodeDetails] = useState<{
        nodeId: string;
        executionResult?: any;
        variables?: Record<string, any>;
        usedVariables?: Record<string, any>;
        actionStatus?: any;
        performanceMetrics?: any;
        progress?: any;
        ruleStatusMap?: Record<string, string>;
        chainStructure?: any;
    } | null>(null);
    const [fullChainData, setFullChainData] = useState<ChainData | null>(null);
    const [ruleExpressions, setRuleExpressions] = useState<Record<string, string>>({});
    const [currentAutoRefresh, setCurrentAutoRefresh] = useState(isAutoRefresh);
    const lastStableDataRef = React.useRef<string | null>(null);
    const lastChainDataRef = React.useRef<ChainData | null>(null);
    
    // Handle auto-refresh state changes from SampleList
    const handleAutoRefreshChange = useCallback((isAutoRefresh: boolean) => {
        setCurrentAutoRefresh(isAutoRefresh);
    }, []);
    
    // Sync currentAutoRefresh with the prop
    useEffect(() => {
        setCurrentAutoRefresh(isAutoRefresh);
    }, [isAutoRefresh]);
    
    // Memoize chain data to prevent unnecessary re-renders with deep comparison
    const stableChainData = React.useMemo(() => {
        const currentData = dynamicChainData || fullChainData || chainData;
        
        console.log('🔧 Monitor: stableChainData calculation:', {
            dynamicChainData: dynamicChainData ? 'exists' : 'null',
            fullChainData: fullChainData ? 'exists' : 'null', 
            chainData: chainData ? 'exists' : 'null',
            currentData: currentData ? 'exists' : 'null',
            nodeCount: currentData ? Object.keys(currentData.nodes || {}).length : 0
        });
        
        // Create a stable reference that only changes when the actual content changes
        if (!currentData) return null;
        
        // Create a deep comparison key to prevent unnecessary updates
        const dataKey = JSON.stringify({
            nodeCount: Object.keys(currentData.nodes || {}).length,
            edgeCount: (currentData.edges || []).length,
            nodeIds: Object.keys(currentData.nodes || {}).sort(),
            edgeKeys: (currentData.edges || []).map(e => `${e.from}-${e.to}-${e.type}`).sort()
        });
        
        // Return the current data with a stable key
        return {
            ...currentData,
            _stableKey: dataKey
        };
    }, [fullChainData, dynamicChainData, chainData]);
    
    const rulesEngineService = React.useMemo(
        () => new RulesEngineService(rulesEngineUrl),
        [rulesEngineUrl]
    );

    // Build full chain from enriched payload data (much more efficient!)
    const buildFullChain = useCallback(async (startingRuleId: string, chainContext: any) => {
        try {
            console.log('🔍 Monitor: Building full chain from enriched payload data:', startingRuleId);
            console.log('🔍 Monitor: Chain structure from payload:', {
                edges: chainContext.chainStructure?.edges || [],
                actions: chainContext.chainStructure?.actions || [],
                rules: chainContext.rules?.length || 0,
                ruleNames: chainContext.rules?.map(r => r.identifier) || [],
                edgeDetails: chainContext.chainStructure?.edges || []
            });
            
            const nodes: Record<string, any> = {};
            const edges: Array<{ from: string; to: string; type: 'success' | 'failure' | 'connection'; label?: string }> = [];
            const ruleExpressions: Record<string, string> = {};
            
            // Create nodes from the rules array in the payload
            if (chainContext.rules && chainContext.rules.length > 0) {
                chainContext.rules.forEach((rule: any, index: number) => {
                    const status = chainContext.ruleStatusMap?.[rule.identifier] || rule.status;
                    const nodeStatus = status === 'Success' ? 'success' : 
                                      status === 'Failed' ? 'failed' : 
                                      status === 'NotRun' ? 'pending' : 'pending';
                    
                    // Find variables used for this rule from ruleStatusHistory
                    const ruleHistory = chainContext.ruleStatusHistory?.find((entry: any) => entry.ruleName === rule.identifier);
                    const variables = ruleHistory?.usedVariables || {};
                    
                    nodes[rule.identifier] = {
                        id: rule.identifier,
                        label: rule.name,
                        ruleId: rule.identifier,
                        expression: `Expression for ${rule.name}`, // Placeholder since we don't have expressions in payload
                        description: rule.description || '',
                        status: nodeStatus,
                        isInitiating: rule.identifier === startingRuleId,
                        isCurrent: rule.identifier === chainContext.currentRuleName,
                        lastEvaluatedAt: rule.lastEvaluatedAt,
                        variables: variables,
                        position: { x: 0, y: 0 } // Will be calculated by layout algorithm
                    };
                    
                    ruleExpressions[rule.identifier] = `Expression for ${rule.name}`;
                });
            }
            
            // Create edges from chainStructure.edges
            if (chainContext.chainStructure?.edges) {
                chainContext.chainStructure.edges.forEach((edge: any) => {
                    // Get source node status to determine edge color
                    const sourceStatus = chainContext.ruleStatusMap?.[edge.from] || 'NotRun';
                    const targetStatus = chainContext.ruleStatusMap?.[edge.to] || 'NotRun';
                    
                    // Determine edge color and style based on edge type and source status
                    let edgeColor = '#6b7280'; // Default gray
                    let strokeWidth = 3;
                    let animated = false;
                    let strokeDasharray = undefined;
                    
                    if (edge.type === 'success') {
                        edgeColor = '#00D437'; // Bright green for success paths
                        animated = sourceStatus === 'Success'; // Animate only from completed rules
                    } else if (edge.type === 'failure') {
                        edgeColor = '#ef4444'; // Red for failure paths
                        strokeDasharray = '5,5'; // Dashed line for failure paths
                        animated = sourceStatus === 'Failed'; // Animate only from failed rules
                    } else {
                        // Connection type - use source status color
                        if (sourceStatus === 'Success') {
                            edgeColor = '#00D437'; // Bright green
                            animated = true;
                        } else if (sourceStatus === 'Failed') {
                            edgeColor = '#ef4444'; // Red
                            strokeDasharray = '5,5'; // Dashed for failed connections
                        }
                    }
                    
                    edges.push({
                        from: edge.from,
                        to: edge.to,
                        type: edge.type as 'success' | 'failure' | 'connection',
                        style: { 
                            stroke: edgeColor, 
                            strokeWidth: strokeWidth,
                            strokeDasharray: strokeDasharray
                        },
                        animated: animated
                    });
                    console.log(`🔗 Monitor: Added edge ${edge.from} -> ${edge.to} (${edge.type}) with color ${edgeColor}, animated: ${animated}`);
                });
            }
            
            // Create action nodes from chainStructure.actions
            if (chainContext.chainStructure?.actions) {
                chainContext.chainStructure.actions.forEach((action: any, index: number) => {
                    const actionId = `${action.ruleName}_action_${index}`;
                    const actionNode = {
                        id: actionId,
                        label: action.actionType || 'Action',
                        ruleId: actionId,
                        expression: '',
                        description: action.templateName || action.actionType,
                        actionType: action.actionType,
                        templateName: action.templateName,
                        isAction: true,
                        position: { x: 300, y: (index * 200) + 100 } // Position actions to the right of rules
                    };
                    nodes[actionId] = actionNode;
                    
                    // Connect action to its rule
                    const sourceStatus = chainContext.ruleStatusMap?.[action.ruleName] || 'NotRun';
                    let edgeColor = '#00D437'; // Actions are typically on success path
                    let strokeWidth = 3;
                    let animated = sourceStatus === 'Success';
                    let strokeDasharray = undefined;
                    
                    edges.push({
                        from: action.ruleName,
                        to: actionId,
                        type: 'success', // Actions are typically on success path
                        style: { 
                            stroke: edgeColor, 
                            strokeWidth: strokeWidth,
                            strokeDasharray: strokeDasharray
                        },
                        animated: animated
                    });
                    console.log(`🔗 Monitor: Added action ${action.ruleName} -> ${actionId}`);
                });
            }
            
            const chainData: ChainData = { nodes, edges };
            setFullChainData(chainData);
            setRuleExpressions(ruleExpressions);
            
            console.log('✅ Monitor: Full chain built from enriched payload:', {
                nodeCount: Object.keys(nodes).length,
                edgeCount: edges.length,
                expressions: Object.keys(ruleExpressions).length,
                startingRule: startingRuleId,
                currentRule: chainContext.currentRuleName
            });
            
        } catch (error) {
            console.error('❌ Monitor: Error building full chain from enriched payload:', error);
        }
    }, []);

    // Build chain data from the new rich payload structure
    const buildChainDataFromPayload = useCallback((chainContext: any): ChainData => {
        const nodes: Record<string, any> = {};
        const edges: Array<{ from: string; to: string; type: 'success' | 'failure' | 'connection'; label?: string }> = [];
        
        console.log('🔧 Monitor: Building chain data from rich payload:', {
            rulesCount: chainContext.rules?.length || 0,
            edgesCount: chainContext.chainStructure?.edges?.length || 0,
            statusMap: chainContext.ruleStatusMap,
            rules: chainContext.rules,
            chainStructure: chainContext.chainStructure,
            currentRuleName: chainContext.currentRuleName,
            initialRuleName: chainContext.initialRuleName,
            fullContext: chainContext
        });
        
        // Add ALL nodes from rules with their status from ruleStatusMap
        if (chainContext.rules && chainContext.rules.length > 0) {
            // First, let's add missing rules from action execution records
            const allRuleNames = new Set<string>();
            
            // Add current rules
            chainContext.rules.forEach(rule => allRuleNames.add(rule.identifier));
            
            // Add missing rules from action execution records
            if (chainContext.actionExecutionRecords) {
                chainContext.actionExecutionRecords.forEach((record: any) => {
                    // Extract rule names from action instance IDs
                    const actionId = record.actionInstanceId;
                    console.log('🔧 Monitor: Processing action record:', actionId);
                    
                    // Pattern: 000_AutomatedBRETest2_action_0_ExecuteOrchestratorWorkflowAction_RULENUZ18_...
                    if (actionId.includes('_action_')) {
                        const parts = actionId.split('_action_');
                        if (parts.length >= 1) {
                            const ruleName = parts[0]; // Everything before '_action_' is the rule name
                            console.log('🔧 Monitor: Extracted rule name from action:', ruleName);
                            if (ruleName && ruleName.length > 0) {
                                allRuleNames.add(ruleName);
                            }
                        }
                    }
                    // Pattern: 000_AutomatedBRETest_RULENUZ18_ExecuteOrchestratorWorkflowAction
                    else if (actionId.includes('_RULENUZ18_')) {
                        const parts = actionId.split('_RULENUZ18_');
                        if (parts.length >= 1) {
                            const ruleName = parts[0]; // Everything before '_RULENUZ18_' is the rule name
                            console.log('🔧 Monitor: Extracted rule name from action (pattern 2):', ruleName);
                            if (ruleName && ruleName.length > 0) {
                                allRuleNames.add(ruleName);
                            }
                        }
                    }
                });
            }
            
            // Use chainStructure from API payload to get complete rule set
            if (chainContext.chainStructure?.edges) {
                chainContext.chainStructure.edges.forEach((edge: any) => {
                    allRuleNames.add(edge.from);
                    allRuleNames.add(edge.to);
                });
            }
            
            // Create a complete rules array including missing rules
            const completeRules = [...chainContext.rules];
            
            // Add missing rules from action execution records
            Array.from(allRuleNames).forEach(ruleName => {
                if (!chainContext.rules.find(r => r.identifier === ruleName)) {
                    // Create a rule entry for missing rules
                    // Default status for missing rules
                    let status = 'NotRun';
                    
                    completeRules.push({
                        identifier: ruleName,
                        name: ruleName,
                        status: status,
                        lastEvaluatedAt: null
                    });
                }
            });
            
            // Sort rules by execution order - initial rule first, then by chain structure
            const sortedRules = completeRules.sort((a, b) => {
                // Initial rule should be first
                if (a.identifier === chainContext.initialRuleName) return -1;
                if (b.identifier === chainContext.initialRuleName) return 1;
                
                // Then sort by current rule
                if (a.identifier === chainContext.currentRuleName) return -1;
                if (b.identifier === chainContext.currentRuleName) return 1;
                
                // Finally sort by name to maintain consistent order
                return a.name.localeCompare(b.name);
            });
            
            sortedRules.forEach((rule: any, index: number) => {
                // Use ruleStatusMap for status, fallback to rule.status
                // Handle case sensitivity - ruleStatusMap uses lowercase keys
                const status = chainContext.ruleStatusMap?.[rule.identifier.toLowerCase()] || 
                              chainContext.ruleStatusMap?.[rule.identifier] || 
                              rule.status;
                const nodeStatus = status === 'Success' ? 'success' : 
                                  status === 'Failed' ? 'failed' : 
                                  status === 'NotRun' ? 'pending' : 'pending';
                
                console.log('🔧 Monitor: Rule status mapping:', {
                    ruleId: rule.identifier,
                    ruleName: rule.name,
                    ruleStatus: rule.status,
                    ruleStatusMapValue: chainContext.ruleStatusMap?.[rule.identifier.toLowerCase()],
                    finalStatus: status,
                    nodeStatus: nodeStatus
                });
                
                nodes[rule.identifier] = {
                    id: rule.identifier,
                    label: rule.name,
                    ruleName: rule.name,
                    ruleId: rule.identifier,
                    status: nodeStatus,
                    isCurrent: rule.identifier === chainContext.currentRuleName,
                    lastEvaluatedAt: rule.lastEvaluatedAt,
                    // Add position for visualization
                    position: { x: 0, y: 0 } // Will be calculated by layout algorithm
                };
            });
        } else {
            // Fallback: create nodes from ruleStatusMap if no rules array or empty rules array
            console.log('⚠️ Monitor: No rules array or empty rules array, using ruleStatusMap fallback');
            if (chainContext.ruleStatusMap && Object.keys(chainContext.ruleStatusMap).length > 0) {
                Object.entries(chainContext.ruleStatusMap).forEach(([ruleName, status], index) => {
                    const nodeStatus = status === 'Success' ? 'success' : 
                                      status === 'Failed' ? 'failed' : 
                                      status === 'NotRun' ? 'pending' : 'pending';
                    
                    nodes[ruleName] = {
                        id: ruleName,
                        label: ruleName,
                        ruleName: ruleName,
                        ruleId: ruleName,
                        status: nodeStatus,
                        isCurrent: ruleName === chainContext.currentRuleName,
                        // Add position for visualization - will be calculated by layout algorithm
                        position: { x: 0, y: 0 }
                    };
                });
            } else {
                // Final fallback: create nodes from chainStructure edges
                console.log('⚠️ Monitor: No ruleStatusMap found, using chainStructure fallback');
                if (chainContext.chainStructure?.edges && chainContext.chainStructure.edges.length > 0) {
                    const allRuleNames = new Set<string>();
                    chainContext.chainStructure.edges.forEach((edge: any) => {
                        allRuleNames.add(edge.from);
                        allRuleNames.add(edge.to);
                    });
                    
                    Array.from(allRuleNames).forEach((ruleName, index) => {
                        nodes[ruleName] = {
                            id: ruleName,
                            label: ruleName,
                            ruleName: ruleName,
                            ruleId: ruleName,
                            status: ruleName === chainContext.currentRuleName ? 'processing' : 'pending',
                            isCurrent: ruleName === chainContext.currentRuleName,
                            position: { x: 0, y: 0 } // Will be calculated by layout algorithm
                        };
                    });
                } else {
                    // Ultimate fallback: create nodes from currentRuleName and initialRuleName
                    console.log('⚠️ Monitor: No chainStructure edges, using currentRuleName/initialRuleName fallback');
                    const ruleNames = new Set<string>();
                    if (chainContext.currentRuleName) ruleNames.add(chainContext.currentRuleName);
                    if (chainContext.initialRuleName) ruleNames.add(chainContext.initialRuleName);
                    
                    Array.from(ruleNames).forEach((ruleName, index) => {
                        nodes[ruleName] = {
                            id: ruleName,
                            label: ruleName,
                            ruleId: ruleName,
                            status: ruleName === chainContext.currentRuleName ? 'processing' : 'pending',
                            isCurrent: ruleName === chainContext.currentRuleName,
                            position: { x: 0, y: 0 } // Will be calculated by layout algorithm
                        };
                    });
                }
            }
        }
        
        
        // Use chainStructure edges from API payload instead of hardcoded edges
        if (chainContext.chainStructure?.edges) {
            chainContext.chainStructure.edges.forEach((edge: any) => {
                // Only add edge if both nodes exist
                if (nodes[edge.from] && nodes[edge.to]) {
                    const sourceStatus = nodes[edge.from].status;
                    
                    // Determine if this edge is on the executed path
                    const isExecutedPath = (
                        (edge.type === 'success' && sourceStatus === 'success') ||
                        (edge.type === 'failure' && sourceStatus === 'failed')
                    );
                    
                    // Edge styling based on execution path
                    let edgeColor = '#374151'; // Muted gray for non-executed paths
                    let strokeWidth = 2;
                let animated = false;
                    
                    if (isExecutedPath) {
                        // Executed path - use vibrant colors
                        edgeColor = edge.type === 'success' ? '#00D437' : '#ef4444';
                        strokeWidth = 3;
                    }
                    
                    // Animate ONLY for running actions (pending target after executed source)
                    const targetStatus = nodes[edge.to]?.status;
                    if (isExecutedPath && targetStatus === 'pending') {
                        animated = true;
                }
                
                edges.push({
                    from: edge.from,
                    to: edge.to,
                        type: edge.type,
                    style: { 
                        stroke: edgeColor, 
                        strokeWidth: strokeWidth,
                            strokeDasharray: undefined // Always solid lines
                    },
                    animated: animated
                });
                }
            });
        }
        
        console.log('🔧 Monitor: Built chain data from payload:', {
            nodesCount: Object.keys(nodes).length,
            edgesCount: edges.length,
            nodeNames: Object.keys(nodes),
            nodeStatuses: Object.keys(nodes).map(id => ({ id, status: nodes[id].status })),
            rulesProcessed: chainContext.rules?.length || 0,
            ruleStatusMapKeys: Object.keys(chainContext.ruleStatusMap || {}).length
        });
        
        return { nodes, edges };
    }, []);

    // Fetch chain execution details using the new rich payload structure
    const fetchChainExecution = useCallback(async (context: WorkflowContext) => {
        console.log('🚀 Monitor: fetchChainExecution called for context:', context.contextId);
        // Only show loading on initial load, not during auto-refresh
        if (isInitialChainLoad) {
        setIsLoadingChain(true);
        }
        try {
            console.log('🔍 Monitor: Fetching chain execution for context:', {
                contextId: context.contextId,
                chainId: (context as any).chainId,
                sampleId: context.sampleId
            });

            // Use the new /contexts/rulechains endpoint with the rich payload structure
            const response = await rulesEngineService.getChainContexts({
                page: 1,
                pageSize: 50
            });
            
            if (response.success && response.items.length > 0) {
                // Find the chain that matches our context
                let chainContext = response.items.find(chain => 
                    chain.variables?.SampleId === context.sampleId ||
                    chain.variables?.OrderId === context.contextId ||
                    chain.chainId === (context as any).chainId
                );
                
                if (!chainContext) {
                    // Fallback: use the first active chain
                    chainContext = response.items[0];
                }
                
                console.log('📊 Monitor: Found chain context:', {
                    chainId: chainContext.chainId,
                    status: chainContext.status,
                    isActive: chainContext.isActive,
                    isComplete: chainContext.isComplete,
                    rulesCount: chainContext.rules?.length || 0,
                    historyLength: chainContext.ruleStatusHistory?.length || 0
                });
                
                // Only update chainExecution if it has actually changed
                setChainExecution(prevExecution => {
                    if (!prevExecution || 
                        prevExecution.chainId !== chainContext.chainId ||
                        prevExecution.status !== chainContext.status ||
                        prevExecution.isActive !== chainContext.isActive ||
                        prevExecution.isComplete !== chainContext.isComplete) {
                        return chainContext;
                    }
                    return prevExecution;
                });
                
                // Build full chain from starting rule using payload data
                if (chainContext.initialRuleName) {
                    console.log('🔍 Monitor: Building full chain from starting rule:', chainContext.initialRuleName);
                    await buildFullChain(chainContext.initialRuleName, chainContext);
                }
                
                // Build chain data from the rich payload structure
                const chainData = buildChainDataFromPayload(chainContext);
                
                // Update chainExecution with complete rules count
                if (chainData.nodes && Object.keys(chainData.nodes).length > 0) {
                    const completeRulesCount = Object.keys(chainData.nodes).length;
                    setChainExecution(prevExecution => {
                        if (prevExecution) {
                            return {
                                ...prevExecution,
                                progress: {
                                    ...prevExecution.progress,
                                    totalRules: completeRulesCount
                                }
                            };
                        }
                        return prevExecution;
                    });
                }
                
                console.log('🔧 Monitor: Built chain data:', {
                    nodeCount: Object.keys(chainData.nodes || {}).length,
                    edgeCount: (chainData.edges || []).length,
                    nodes: Object.keys(chainData.nodes || {}),
                    edges: (chainData.edges || []).map(e => `${e.from}->${e.to}(${e.type})`),
                    chainData
                });
                
                // Create a stable key for the chain data
                const chainDataKey = JSON.stringify({
                    nodeCount: Object.keys(chainData.nodes || {}).length,
                    edgeCount: (chainData.edges || []).length,
                    nodeIds: Object.keys(chainData.nodes || {}).sort(),
                    edgeKeys: (chainData.edges || []).map(e => `${e.from}-${e.to}-${e.type}`).sort()
                });
                
                // Only update if data has actually changed
                if (lastStableDataRef.current !== chainDataKey) {
                    // Debounce chain data updates to prevent flickering
                    const now = Date.now();
                    if (now - lastChainUpdate.current > 5000) { // 5 second debounce for responsive streaming
                        lastChainUpdate.current = now;
                        lastStableDataRef.current = chainDataKey;
                        
                        console.log('🔄 Monitor: Updating dynamic chain data with new content');
                        console.log('🔄 Monitor: Setting dynamicChainData to:', chainData);
                        // Additional deep comparison to prevent flickering
                        const chainDataString = JSON.stringify(chainData);
                        const lastDataString = lastChainDataRef.current ? JSON.stringify(lastChainDataRef.current) : null;
                        
                        if (chainDataString !== lastDataString) {
                            lastChainDataRef.current = chainData;
                            console.log('🔄 Monitor: Calling setDynamicChainData with:', chainData);
                        setDynamicChainData(chainData);
                        } else {
                            console.log('⏸️ Monitor: Chain data identical, skipping update');
                        }
                } else {
                        console.log('⏸️ Monitor: Skipping chain data update (debounced)');
                }
            } else {
                    console.log('⏸️ Monitor: Skipping chain data update (no content changes)');
                }
                
                console.log('✅ Monitor: Chain execution loaded with rich data:', {
                    chainId: chainContext.chainId,
                    status: chainContext.status,
                    isActive: chainContext.isActive,
                    isComplete: chainContext.isComplete,
                    progress: chainContext.progress,
                    performanceMetrics: chainContext.performanceMetrics
                });
                console.log(`✅ Monitor: Loaded execution chain: ${chainContext.status}`);
                } else {
                    setChainExecution(null);
                setDynamicChainData(null);
                console.log('❌ Monitor: No chain execution found');
                console.log('❌ Monitor: Chain details not found');
            }
        } catch (error) {
            console.error('❌ Monitor: Failed to fetch chain execution:', error);
            setChainExecution(null);
            console.log('❌ Monitor: Failed to load execution chain. Please try again.');
        } finally {
            setIsLoadingChain(false);
            setIsInitialChainLoad(false);
        }
    }, [rulesEngineService, buildFullChain, buildChainDataFromPayload]);

    // Handle sample selection
    const handleSampleSelect = useCallback(async (context: WorkflowContext) => {
        setSelectedContext(context);
        await fetchChainExecution(context);
    }, [fetchChainExecution]);

    // Handle node click in the chain visualization - show execution details instead of navigating
    const handleNodeClick = useCallback(async (nodeId: string) => {
        console.log('🚀 Monitor: Node clicked:', nodeId);
        
        // Find execution details for this node using the new rich data structure
        let executionResult: any = null;
        let variables = chainExecution?.variables || {};
        let usedVariables: Record<string, any> = {};
        let actionStatus: any = null;
        
        // Use the new ruleStatusHistory (last 10 entries) - this has usedVariables!
        if (chainExecution?.ruleStatusHistory) {
            const foundResult = chainExecution.ruleStatusHistory.find(r => r.ruleName === nodeId);
            if (foundResult) {
                executionResult = foundResult;
                usedVariables = (foundResult as any).usedVariables || {};
                console.log('📊 Monitor: Found execution result with used variables:', {
                    ruleName: foundResult.ruleName,
                    isSuccess: foundResult.isSuccess,
                    usedVariables: Object.keys(usedVariables),
                    evaluatedAt: foundResult.evaluatedAt
                });
            }
        }
        
        // Also check if this rule has been evaluated and get its status
        const ruleStatus = chainExecution?.ruleStatusMap?.[nodeId];
        const ruleInfo = chainExecution?.rules?.find(r => r.identifier === nodeId);
        
        console.log('🔍 Monitor: Rule info for clicked node:', {
            nodeId,
            ruleStatus,
            ruleInfo,
            hasExecutionResult: !!executionResult
        });
        
        // Check if this rule has actions in progress using chainStructure
        if (chainExecution?.chainStructure?.actions) {
            const ruleActions = chainExecution.chainStructure.actions.filter(a => a.ruleName === nodeId);
            if (ruleActions.length > 0) {
                actionStatus = {
                    actions: ruleActions,
                    inProgress: chainExecution.isActive && chainExecution.currentRuleName === nodeId
                };
                console.log('⚡ Monitor: Found actions for rule:', {
                    ruleName: nodeId,
                    actions: ruleActions,
                    inProgress: actionStatus?.inProgress
                });
            }
        }
        
        // Fallback to legacy history if available (for backward compatibility)
        if (!executionResult && (chainExecution as any)?.history) {
            executionResult = (chainExecution as any).history.find((r: any) => r.ruleName === nodeId);
        }
        
        // If no execution result found, create a basic one with available status information
        if (!executionResult) {
            const isSuccess = ruleStatus === 'Success';
            const isFailed = ruleStatus === 'Failed';
            const isPending = !ruleStatus || ruleStatus === 'Pending' || ruleStatus === 'NotRun';
            
            executionResult = {
                ruleName: nodeId,
                isSuccess: isSuccess,
                isFailed: isFailed,
                isPending: isPending,
                evaluatedAt: isSuccess || isFailed ? new Date().toISOString() : null,
                errorMessage: isFailed ? 'Rule evaluation failed' : null,
                // Add rule expression if available
                expression: ruleExpressions[nodeId] || 'Expression not available'
            };
            
            console.log('📊 Monitor: Created fallback execution result:', {
                ruleName: nodeId,
                ruleStatus,
                isSuccess,
                isFailed,
                isPending,
                hasExpression: !!ruleExpressions[nodeId]
            });
        }
        
        setSelectedNodeDetails({
            nodeId,
            executionResult,
            variables,
            usedVariables,
            actionStatus,
            // Add rich metadata
            performanceMetrics: chainExecution?.performanceMetrics,
            progress: chainExecution?.progress,
            ruleStatusMap: chainExecution?.ruleStatusMap,
            chainStructure: chainExecution?.chainStructure
        });
        
        // Get rule expression from full chain data
        const ruleExpression = ruleExpressions[nodeId] || 'Expression not available';
        console.log('🔍 Monitor: Rule expression for node:', {
            nodeId,
            expression: ruleExpression,
            hasExpression: !!ruleExpressions[nodeId]
        });
        
        console.log(`📊 Monitor: Showing execution details for ${nodeId}`);
    }, [chainExecution, ruleExpressions]);

    // Set up polling for active samples with optimized change detection
    useEffect(() => {
        // Clear existing interval
        if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
        }

        if (!selectedContext || !chainExecution) return;

        // Check if we should poll (only if auto-refresh is enabled and chain is active)
        const shouldPoll = currentAutoRefresh && !chainExecution.isComplete && chainExecution.isActive;

        if (shouldPoll) {
            const interval = setInterval(async () => {
                try {
                    // Only fetch if we haven't updated recently to prevent excessive API calls
                    const now = Date.now();
                    if (now - lastChainUpdate.current > 3000) { // 3 second minimum between updates
                    await fetchChainExecution(selectedContext);
                    }
                } catch (error) {
                    console.error('Polling error:', error);
                }
            }, 8000); // Poll every 8 seconds for responsive streaming

            setPollingInterval(interval);
        }

        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, [selectedContext, chainExecution?.isActive, chainExecution?.isComplete, currentAutoRefresh, fetchChainExecution]);

    return (
        <div className="fixed inset-0 top-14 bg-background">
            <div className="flex h-full">
                {/* Sample List - Fixed width */}
                <div className="w-96 border-r flex-shrink-0 h-full flex flex-col">
                    <SampleList
                        rulesEngineUrl={rulesEngineUrl}
                        selectedSampleId={selectedContext?.sampleId}
                        onSampleSelect={handleSampleSelect}
                        onAutoRefreshChange={handleAutoRefreshChange}
                        isAutoRefresh={currentAutoRefresh}
                    />
                </div>

                {/* Chain Visualization - Flexible center */}
                <div className="flex-1 min-w-[600px] bg-muted/5 h-full relative overflow-hidden flex flex-col">
                {/* Loading indicator removed to prevent flickering */}
                
                {!selectedContext ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="text-center max-w-md">
                            <div className="mb-4">
                                <svg className="w-16 h-16 mx-auto text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">No Sample Selected</h3>
                             <p className="text-sm text-muted-foreground mb-4">
                                Select a sample from the list to view its rule execution flow and monitor progress in real-time.
                            </p>
                        </div>
                    </div>
                ) : !chainExecution ? (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="text-center max-w-md space-y-4">
                            <div className="mb-4">
                                <svg className="w-16 h-16 mx-auto text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold mb-2">No Execution Chain Found</h3>
                                <p className="text-sm text-muted-foreground mb-3">
                                    {selectedContext?.status === 0 
                                        ? "This sample hasn't started rule execution yet. The chain will appear once processing begins."
                                        : selectedContext?.status === 2 || selectedContext?.status === 3
                                        ? "The execution chain for this sample may be outside our search window. We check the 100 most recent chains."
                                        : "No rule chain execution data is available for this sample."}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : stableChainData ? (
                    <div className="h-full">
                        <MonitorChainFlowWrapper
                            key={stableChainData?._stableKey || 'no-data'}
                            chainData={stableChainData}
                            executionHistory={chainExecution.ruleStatusHistory}
                            currentRuleName={chainExecution.currentRuleName}
                            onNodeClick={handleNodeClick}
                            chainContext={chainExecution}
                        />
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="text-center max-w-md">
                            <Lightning className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                            <h3 className="text-lg font-semibold mb-2">No Chain Map Available</h3>
                            <p className="text-sm text-muted-foreground mb-3">
                                No rule chain map data is available. You need to first create and save a rule chain in the editor mode.
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Go to Editor mode → Create a rule chain → Save it → Then return to Monitor mode
                            </p>
                        </div>
                    </div>
                )}
            </div>

                {/* Context Details - Fixed width with buffer */}
                <div className="w-[480px] border-l flex-shrink-0 h-full flex flex-col pr-10 pl-4 overflow-hidden">
                    <ContextViewer
                        context={selectedContext}
                        chainExecution={chainExecution}
                        rulesEngineService={rulesEngineService}
                    />
                </div>
            </div>

            {/* Execution Details Popup */}
            <Dialog open={!!selectedNodeDetails} onOpenChange={() => setSelectedNodeDetails(null)}>
                <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Code className="w-5 h-5" />
                            <div className="flex flex-col">
                                <span className="font-bold">{selectedNodeDetails?.ruleName || selectedNodeDetails?.nodeId}</span>
                                <span className="text-sm italic text-muted-foreground">{selectedNodeDetails?.ruleId || selectedNodeDetails?.nodeId}</span>
                            </div>
                        </DialogTitle>
                    </DialogHeader>
                    
                    {selectedNodeDetails && (
                        <div className="space-y-4">
                            {/* Enhanced Execution Result with Rich Data */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                        {selectedNodeDetails.executionResult?.isSuccess ? (
                                                <CheckCircle className="w-5 h-5 text-green-500" />
                                        ) : selectedNodeDetails.executionResult?.isFailed ? (
                                                <XCircle className="w-5 h-5 text-red-500" />
                                        ) : (
                                            <Clock className="w-5 h-5 text-yellow-500" />
                                            )}
                                            Rule Execution Result
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-muted-foreground">Rule Identifier</label>
                                            <div className="mt-1">
                                                <code className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                                                    {selectedNodeDetails.nodeId}
                                                </code>
                                            </div>
                                        </div>
                                            <div>
                                                <label className="text-sm font-medium text-muted-foreground">Status</label>
                                                <div className="mt-1">
                                                {selectedNodeDetails.executionResult ? (
                                                    selectedNodeDetails.executionResult.isSuccess ? (
                                                        <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">Success</Badge>
                                                    ) : selectedNodeDetails.executionResult.isFailed ? (
                                                        <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">Failed</Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">Not Evaluated</Badge>
                                                    )
                                                ) : (
                                                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">Not Evaluated</Badge>
                                                )}
                                                </div>
                                            </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className="text-sm font-medium text-muted-foreground">Evaluated At</label>
                                                <div className="mt-1 text-sm">
                                                {selectedNodeDetails.executionResult?.evaluatedAt ? 
                                                    new Date(selectedNodeDetails.executionResult.evaluatedAt).toLocaleString() :
                                                    'Not yet evaluated'
                                                }
                                                </div>
                                            </div>
                                        </div>
                                        
                                    {selectedNodeDetails.executionResult?.errorMessage && (
                                            <div>
                                                <label className="text-sm font-medium text-muted-foreground">Error Message</label>
                                                <div className="mt-1 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                                                    <code className="text-sm text-red-800 dark:text-red-200">
                                                        {selectedNodeDetails.executionResult.errorMessage}
                                                    </code>
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Rule Expression and Variables Used */}
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-sm font-medium text-muted-foreground">Rule Expression</label>
                                                <div className="mt-1 p-3 bg-muted/50 rounded-md">
                                                    <code className="text-sm font-mono">
                                                        {ruleExpressions[selectedNodeDetails.nodeId] || 'Expression not available'}
                                                    </code>
                                                </div>
                                            </div>
                                            
                                            <div>
                                                <label className="text-sm font-medium text-muted-foreground">Variables Used in Evaluation</label>
                                            {selectedNodeDetails.executionResult?.isPending || !selectedNodeDetails.executionResult ? (
                                                    <div className="mt-1 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                                                        <div className="text-sm text-yellow-800 dark:text-yellow-200 italic">
                                                            Rule is pending evaluation - no variables have been used yet
                                                        </div>
                                                    </div>
                                                ) : selectedNodeDetails.usedVariables && Object.keys(selectedNodeDetails.usedVariables).length > 0 ? (
                                                    <div className="mt-1 space-y-1">
                                                        {Object.entries(selectedNodeDetails.usedVariables).map(([varName, varValue]) => (
                                                            <div key={varName} className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                                                                <span className="font-medium text-green-800 dark:text-green-200">{varName}</span>
                                                                <span className="text-green-600 dark:text-green-400">{String(varValue)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-md">
                                                        <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                                                            No variables were used in this rule evaluation
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>




                            {/* Action Status and Progress */}
                            {selectedNodeDetails.actionStatus && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <Lightning className="w-5 h-5" />
                                            Action Status
                                            {selectedNodeDetails.actionStatus.inProgress && (
                                                <Badge variant="default" className="ml-2">
                                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                                    In Progress
                                                </Badge>
                                            )}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-3">
                                            {selectedNodeDetails.actionStatus.actions.map((action: any, index: number) => (
                                                <div key={index} className="p-3 border rounded-md">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="font-medium">{action.actionType || 'Unknown Action'}</div>
                                                            {action.templateName && (
                                                                <div className="text-sm text-muted-foreground">
                                                                    Template: {action.templateName}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {selectedNodeDetails.actionStatus.inProgress ? (
                                                                <div className="flex items-center gap-1 text-blue-600">
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    <span className="text-sm">Running</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-1" style={{ color: '#00D437' }}>
                                                                    <CheckCircle className="w-4 h-4" />
                                                                    <span className="text-sm">Completed</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Actions Executed (Legacy) */}
                            {selectedNodeDetails.executionResult?.actionsToExecute && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-lg">
                                            <Clock className="w-5 h-5" />
                                            Actions Executed
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-2">
                                            {selectedNodeDetails.executionResult.actionsToExecute.map((action: any, index: number) => (
                                                <div key={index} className="p-3 border rounded-md">
                                                    <div className="font-medium">{action.actionType || 'Unknown Action'}</div>
                                                    {action.templateName && (
                                                        <div className="text-sm text-muted-foreground">
                                                            Template: {action.templateName}
                                                        </div>
                                                    )}
                                                    {action.parameters && (
                                                        <div className="mt-2">
                                                            <div className="text-sm font-medium">Parameters:</div>
                                                            <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                                                                {JSON.stringify(action.parameters, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
});