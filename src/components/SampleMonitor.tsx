import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Lightning } from '@phosphor-icons/react';
import { SampleList } from './SampleList';
import { MonitorChainFlowWrapper } from './MonitorChainFlow';
import { ContextViewer } from './ContextViewer';
import { 
    WorkflowContext, 
    ChainContext,
    RulesEngineService 
} from '../services/RulesEngineService';
import { ChainData } from '../App';

interface SampleMonitorProps {
    rulesEngineUrl: string;
    dataServicesUrl: string;
    chainData?: ChainData | null;
    onLoadRule?: (ruleId: string) => void;
}

export function SampleMonitor({ 
    rulesEngineUrl, 
    dataServicesUrl,
    chainData,
    onLoadRule 
}: SampleMonitorProps) {
    const [selectedContext, setSelectedContext] = useState<WorkflowContext | null>(null);
    const [chainExecution, setChainExecution] = useState<ChainContext | null>(null);
    const [isLoadingChain, setIsLoadingChain] = useState(false);
    const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
    
    const rulesEngineService = React.useMemo(
        () => new RulesEngineService(rulesEngineUrl),
        [rulesEngineUrl]
    );

    // Fetch chain execution details
    const fetchChainExecution = useCallback(async (context: WorkflowContext) => {
        setIsLoadingChain(true);
        try {
            // Check if we already have the chainId from the context
            if ((context as any).chainId) {
                // We already have the chain ID, fetch the full chain details
                const chainContext = await rulesEngineService.getRuleChain((context as any).chainId);
                if (chainContext) {
                    setChainExecution(chainContext);
                    toast.success(`Loaded execution chain`);
                } else {
                    setChainExecution(null);
                    toast.error('Chain details not found');
                }
            } else {
                // Fallback to searching by contextId
                const chainContext = await rulesEngineService.getChainForContext(context.contextId);
                
                if (chainContext) {
                    setChainExecution(chainContext);
                    toast.success(`Found execution chain`);
                } else {
                    setChainExecution(null);
                    toast.info('No execution chain found for this sample.');
                }
            }
        } catch (error) {
            console.error('Failed to fetch chain execution:', error);
            setChainExecution(null);
            toast.error('Failed to load execution chain. Please try again.');
        } finally {
            setIsLoadingChain(false);
        }
    }, [rulesEngineService]);

    // Handle sample selection
    const handleSampleSelect = useCallback(async (context: WorkflowContext) => {
        setSelectedContext(context);
        await fetchChainExecution(context);
    }, [fetchChainExecution]);

    // Handle node click in the chain visualization
    const handleNodeClick = useCallback((nodeId: string) => {
        if (onLoadRule) {
            onLoadRule(nodeId);
            toast.info(`Opening ${nodeId} in editor...`);
        }
    }, [onLoadRule]);

    // Set up polling for active samples
    useEffect(() => {
        // Clear existing interval
        if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
        }

        if (!selectedContext || !chainExecution) return;

        // Check if we should poll
        const shouldPoll = !chainExecution.isComplete && chainExecution.isActive;

        if (shouldPoll) {
            const interval = setInterval(async () => {
                try {
                    // Fetch updated chain execution directly
                    await fetchChainExecution(selectedContext);
                } catch (error) {
                    console.error('Polling error:', error);
                }
            }, 2000); // Poll every 2 seconds

            setPollingInterval(interval);
        }

        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, [selectedContext, chainExecution?.isActive, chainExecution?.isComplete, fetchChainExecution]);

    return (
        <div className="fixed inset-0 top-14 bg-background">
            <div className="flex h-full">
                {/* Sample List - Fixed width */}
                <div className="w-96 border-r flex-shrink-0 h-full flex flex-col">
                    <SampleList
                        rulesEngineUrl={rulesEngineUrl}
                        selectedSampleId={selectedContext?.sampleId}
                        onSampleSelect={handleSampleSelect}
                    />
                </div>

                {/* Chain Visualization - Flexible center */}
                <div className="flex-1 min-w-[600px] bg-muted/5 h-full relative overflow-hidden">
                {isLoadingChain && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
                        <div className="text-center bg-card p-6 rounded-lg shadow-lg border max-w-sm">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
                            <p className="text-sm font-medium">Searching for execution chain...</p>
                            {selectedContext && (
                                <div className="mt-2 space-y-1">
                                    <p className="text-xs text-muted-foreground">
                                        Looking for chain associated with {rulesEngineService.getContextDisplayName(selectedContext)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        This may take a moment as we search through recent chains...
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                
                {!selectedContext ? (
                    <div className="h-full flex items-center justify-center p-8">
                        <div className="text-center max-w-md">
                            <div className="mb-4">
                                <svg className="w-16 h-16 mx-auto text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold mb-2">No Sample Selected</h3>
                            <p className="text-sm text-muted-foreground">
                                Select a sample from the list to view its rule execution flow and monitor progress in real-time.
                            </p>
                        </div>
                    </div>
                ) : !chainExecution ? (
                    <div className="h-full flex items-center justify-center p-8">
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
                            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                                <p className="font-medium mb-1">💡 Tip:</p>
                                <p>For better performance, consider asking your admin to add a context-to-chain lookup endpoint.</p>
                            </div>
                        </div>
                    </div>
                ) : chainData ? (
                    <div className="h-full">
                        <MonitorChainFlowWrapper
                            chainData={chainData}
                            executionHistory={chainExecution.history}
                            currentRuleName={chainExecution.currentRuleName}
                            onNodeClick={handleNodeClick}
                        />
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center p-8">
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
        </div>
    );
}