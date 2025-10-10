import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { cn } from '../lib/utils';
import { 
    Search, 
    RotateCcw, 
    Loader2, 
    ChevronDown, 
    ChevronRight,
    Clock,
    CheckCircle, 
    XCircle, 
    AlertCircle
} from 'lucide-react';
import { RulesEngineService, WorkflowContext, ContextStatus } from '../services/RulesEngineService';

interface SampleListProps {
    rulesEngineUrl: string;
    selectedSampleId?: string;
    onSampleSelect: (sample: WorkflowContext) => void;
    refreshInterval?: number;
    onAutoRefreshChange?: (isAutoRefresh: boolean) => void;
    isAutoRefresh?: boolean;
}

export function SampleList({
    rulesEngineUrl,
    selectedSampleId,
    onSampleSelect,
    refreshInterval = 3000,
    onAutoRefreshChange,
    isAutoRefresh: externalAutoRefresh = false
}: SampleListProps) {
    
    const [samples, setSamples] = useState<WorkflowContext[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'complete' | 'failed'>('all');
    const [dateFilter, setDateFilter] = useState<number | null>(null);
    const [isAutoRefresh, setIsAutoRefresh] = useState(externalAutoRefresh);
    
    // Sync with external auto refresh state
    useEffect(() => {
        setIsAutoRefresh(externalAutoRefresh);
    }, [externalAutoRefresh]);
    
    // Notify parent of auto-refresh state changes
    useEffect(() => {
        onAutoRefreshChange?.(isAutoRefresh);
    }, [isAutoRefresh, onAutoRefreshChange]);
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['active', 'complete', 'failed']));
    const lastFetchTime = useRef<number>(0);
    const isFetching = useRef<boolean>(false);

    const rulesEngineService = React.useMemo(
        () => new RulesEngineService(rulesEngineUrl),
        [rulesEngineUrl]
    );

    // Fetch samples with proper state management
    const fetchSamples = useCallback(async () => {
        // Prevent rapid successive calls
        const now = Date.now();
        if (isFetching.current || (now - lastFetchTime.current < 1000)) {
            console.log('📊 Monitor: Skipping fetch - too soon or already fetching');
            return;
        }
        
        isFetching.current = true;
        lastFetchTime.current = now;
        
        try {
            console.log('🔍 Monitor: Fetching samples from BRE API...', {
                rulesEngineUrl,
                dateFilter,
                filterStatus,
                timestamp: new Date().toISOString()
            });
            
            setIsLoading(true);
            setError(null);
            
            // Use the new rich payload structure from /contexts/rulechains
            let apiParams: any = {
                page: 1,
                pageSize: 50,
                isActive: true
            };
            
            if (dateFilter) {
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - dateFilter);
                apiParams.startTimestamp = startDate.toISOString();
                apiParams.endTimestamp = endDate.toISOString();
            }
            
            console.log('📊 Monitor: Using new rich payload API call:', apiParams);
            
            // Get the rich payload structure
            let response = await rulesEngineService.getChainContexts(apiParams);
            
            // Fallback if no active chains
            if (!response.success || !response.items || response.items.length === 0) {
                console.log('📊 Monitor: No active chains found, trying all chains...');
                const fallbackParams = { ...apiParams };
                delete fallbackParams.isActive;
                response = await rulesEngineService.getChainContexts(fallbackParams);
                console.log('📊 Monitor: Fallback query result:', {
                    success: response.success,
                    total: response.total,
                    itemCount: response.items?.length || 0
                });
            }
            
            if (response.success && response.items && response.items.length > 0) {
                // Convert rich payload to samples
                const newSamples = response.items.map(chain => {
                    // Extract sample info from the rich payload
                    const sampleId = chain.variables?.SampleId || chain.variables?.OrderId || `Sample ${chain.chainId.slice(-4)}`;
                    const status = chain.isComplete ? 
                        (chain.status === 'Failed' ? 3 : 2) : // Failed or Complete
                        (chain.isActive ? 1 : 0); // Active or Ready
                    
                    return {
                        contextId: chain.chainId,
                        sampleId: sampleId,
                        status: status as ContextStatus,
                        lastUpdatedAt: chain.startTimestamp,
                        createdAt: chain.startTimestamp, // Add required createdAt property
                        chainId: chain.chainId,
                        // Add rich metadata
                        chainStatus: chain.status,
                        isActive: chain.isActive,
                        isComplete: chain.isComplete,
                        progress: chain.progress,
                        performanceMetrics: chain.performanceMetrics,
                        variables: chain.variables
                    } as WorkflowContext & {
                        chainStatus: string;
                        isActive: boolean;
                        isComplete: boolean;
                        progress?: any;
                        performanceMetrics?: any;
                        variables?: Record<string, any>;
                    };
                });
                
                console.log('✅ Monitor: Converted rich payload to samples:', {
                    count: newSamples.length,
                    sampleIds: newSamples.map(s => s.sampleId)
                });
                
                // Create a stable comparison key for each sample
                const createSampleKey = (sample: WorkflowContext) => 
                    `${sample.sampleId}-${sample.status}-${sample.lastUpdatedAt}-${sample.chainId || 'no-chain'}`;
                
                setSamples(prevSamples => {
                    // Quick length check first
                    if (prevSamples.length !== newSamples.length) {
                        console.log('✅ Monitor: Sample count changed:', {
                            prev: prevSamples.length,
                            new: newSamples.length
                        });
                        return newSamples;
                    }
                    
                    // Create comparison keys
                    const prevKeys = prevSamples.map(createSampleKey).sort();
                    const newKeys = newSamples.map(createSampleKey).sort();
                    
                    // Check if any keys are different
                    const hasChanged = prevKeys.some((key, index) => key !== newKeys[index]);
                    
                    if (hasChanged) {
                        console.log('✅ Monitor: Sample data changed');
                        return newSamples;
                    } else {
                        console.log('📊 Monitor: No changes detected, keeping existing samples');
                        return prevSamples;
                    }
                });
            } else {
                setSamples([]);
                console.log('⚠️ Monitor: No samples found in database');
            }
            setError(null);
        } catch (err: any) {
            console.error('❌ Monitor: Failed to fetch samples:', {
                error: err.message,
                rulesEngineUrl,
                stack: err.stack
            });
            
            const errorMessage = err.message || 'Failed to fetch samples';
            
            if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
                setError('Backend error: The /contexts/rulechains endpoint may not be fully implemented yet. Please contact your administrator to implement the monitoring API endpoints.');
            } else if (errorMessage.includes('Failed to fetch')) {
                setError('Cannot connect to Rules Engine. Please check the URL and ensure the service is running.');
            } else if (errorMessage.includes('400')) {
                setError('Invalid request parameters. Please check your filter settings.');
            } else {
                setError(`API Error: ${errorMessage}`);
            }
        } finally {
            setIsLoading(false);
            isFetching.current = false;
        }
    }, [rulesEngineService, dateFilter, filterStatus, rulesEngineUrl]);

    // Auto-refresh setup
    useEffect(() => {
        // Only fetch samples initially, not on every effect run
        if (isAutoRefresh) {
        fetchSamples();
        }

        let interval: number | null = null;
        if (isAutoRefresh) {
            interval = setInterval(() => {
                fetchSamples();
            }, refreshInterval);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [isAutoRefresh, refreshInterval, dateFilter]);

    // Group samples by status with proper filtering and stable references
    const groupedSamples = useMemo(() => {
        // Create a stable key for the current filter state
        const filterKey = `${filterStatus}-${searchTerm}-${samples.length}`;

        const filtered = samples.filter(sample => {
            // Status filter
        if (filterStatus !== 'all') {
                if (filterStatus === 'active' && sample.status !== ContextStatus.Active && sample.status !== ContextStatus.Running) {
                    return false;
                }
                if (filterStatus === 'complete' && sample.status !== ContextStatus.Complete) {
                    return false;
                }
                if (filterStatus === 'failed' && sample.status !== ContextStatus.Failed) {
                    return false;
                }
            }

            // Search filter
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
                return (
                sample.sampleId?.toLowerCase().includes(searchLower) ||
                    sample.workflowContextId?.toLowerCase().includes(searchLower) ||
                    sample.chainId?.toLowerCase().includes(searchLower)
                );
            }

            return true;
        });

        const result = {
            active: filtered.filter(s => s.status === ContextStatus.Active || s.status === ContextStatus.Running),
            complete: filtered.filter(s => s.status === ContextStatus.Complete),
            failed: filtered.filter(s => s.status === ContextStatus.Failed)
        };

        // Only log when there are actual changes
        if (filtered.length > 0) {
            console.log('📊 Monitor: Grouped samples:', {
                filterKey,
                total: samples.length,
                filtered: filtered.length,
                groups: {
                    active: result.active.length,
                    complete: result.complete.length,
                    failed: result.failed.length
                }
            });
        }

        return result;
    }, [samples, filterStatus, searchTerm]);

    // Toggle group expansion
    const toggleGroup = useCallback((group: string) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(group)) {
                newSet.delete(group);
        } else {
                newSet.add(group);
            }
            return newSet;
        });
    }, []);

    // Render sample card with stable key and memoization
    const renderSampleCard = useCallback((sample: WorkflowContext) => {
        const isSelected = selectedSampleId === sample.sampleId;
        
        // Better status icons
        const statusIcon = sample.status === ContextStatus.Complete ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
        ) : sample.status === ContextStatus.Failed ? (
            <XCircle className="w-4 h-4 text-red-500" />
        ) : sample.status === ContextStatus.Active ? (
            <Clock className="w-4 h-4 text-blue-500" />
        ) : sample.status === ContextStatus.Running ? (
            <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
        ) : (
            <Clock className="w-4 h-4 text-gray-500" />
        );

        // Create a stable key that won't change unless the sample actually changes
        const stableKey = `${sample.sampleId}-${sample.status}-${sample.chainId || 'no-chain'}`;
        
        return (
            <Card
                key={stableKey}
                className={cn(
                    "p-3 cursor-pointer transition-all duration-200 hover:shadow-md mb-2",
                    isSelected ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
                onClick={() => onSampleSelect(sample)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {statusIcon}
                        <div>
                            <div className="font-medium text-sm">{sample.sampleId}</div>
                            <div className="text-xs text-muted-foreground">
                                {sample.workflowContextId}
                        </div>
                    </div>
                                </div>
                    <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                            <span>{rulesEngineService.formatDuration(sample.createdAt, sample.lastUpdatedAt)}</span>
                        </div>
                    </div>
                </div>
            </Card>
        );
    }, [selectedSampleId, onSampleSelect, rulesEngineService]);

    const totalCount = groupedSamples.active.length + groupedSamples.complete.length + groupedSamples.failed.length;

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="pl-8 pr-6 py-4 border-b space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">Samples</h2>
                        <Badge variant="secondary" className="text-xs">
                            {samples.length} of {samples.length >= 500 ? '500+' : samples.length}
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={fetchSamples}
                            variant="ghost"
                            size="icon"
                            disabled={isLoading}
                            title="Refresh samples"
                        >
                            <RotateCcw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </Button>
                        <Button
                            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "gap-2",
                                isAutoRefresh && "text-primary"
                            )}
                            title={isAutoRefresh ? "Auto-refresh is enabled" : "Auto-refresh is disabled"}
                        >
                            <Loader2 className={cn("w-4 h-4", isAutoRefresh && "animate-pulse")} />
                            {isAutoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                        </Button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                        placeholder="Search samples..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Button
                            variant={filterStatus === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('all')}
                            className="text-xs"
                        >
                            All
                        </Button>
                        <Button
                            variant={filterStatus === 'active' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('active')}
                            className="text-xs"
                        >
                            Active
                        </Button>
                        <Button
                            variant={filterStatus === 'complete' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('complete')}
                            className="text-xs"
                        >
                            Complete
                        </Button>
                        <Button
                            variant={filterStatus === 'failed' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('failed')}
                            className="text-xs"
                        >
                            Failed
                        </Button>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        <Button
                            variant={dateFilter === 1 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateFilter(1)}
                            className="text-xs"
                        >
                            Last 24h
                        </Button>
                        <Button
                            variant={dateFilter === 7 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateFilter(7)}
                            className="text-xs"
                        >
                            Last 7d
                        </Button>
                        <Button
                            variant={dateFilter === 30 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateFilter(30)}
                            className="text-xs"
                        >
                            Last 30d
                                </Button>
                        {dateFilter && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDateFilter(null)}
                                className="text-xs"
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content with ScrollArea */}
                {!isLoading && !error && totalCount > 0 && (
                <ScrollArea className="flex-1">
                    <div className="pl-8 pr-6 py-4 space-y-4">
                        {/* Active/Running Group */}
                        {groupedSamples.active.length > 0 && (
                            <div>
                                <div
                                    className="flex items-center gap-2 mb-2 cursor-pointer select-none"
                                    onClick={() => toggleGroup('active')}
                                >
                                    {expandedGroups.has('active') ? (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <h3 className="font-medium text-sm">
                                        Active & Running
                                    </h3>
                                    <Badge variant="default" className="text-xs">
                                        {groupedSamples.active.length}
                                    </Badge>
                                </div>
                                {expandedGroups.has('active') && (
                                    <div className="space-y-2">
                                        {groupedSamples.active.map(renderSampleCard)}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Complete Group */}
                        {groupedSamples.complete.length > 0 && (
                            <div>
                                <div
                                    className="flex items-center gap-2 mb-2 cursor-pointer select-none"
                                    onClick={() => toggleGroup('complete')}
                                >
                                    {expandedGroups.has('complete') ? (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <h3 className="font-medium text-sm">
                                        Complete
                                    </h3>
                                    <Badge variant="secondary" className="text-xs">
                                        {groupedSamples.complete.length}
                                    </Badge>
                                </div>
                                {expandedGroups.has('complete') && (
                                    <div className="space-y-2">
                                        {groupedSamples.complete.map(renderSampleCard)}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Failed Group */}
                        {groupedSamples.failed.length > 0 && (
                            <div>
                                <div
                                    className="flex items-center gap-2 mb-2 cursor-pointer select-none"
                                    onClick={() => toggleGroup('failed')}
                                >
                                    {expandedGroups.has('failed') ? (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <h3 className="font-medium text-sm">
                                        Failed
                                    </h3>
                                    <Badge variant="destructive" className="text-xs">
                                        {groupedSamples.failed.length}
                                    </Badge>
                                </div>
                                {expandedGroups.has('failed') && (
                                    <div className="space-y-2">
                                        {groupedSamples.failed.map(renderSampleCard)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading samples...
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                        <div className="text-red-500 mb-2">Error</div>
                        <div className="text-sm text-muted-foreground max-w-md">{error}</div>
                        <Button 
                            onClick={fetchSamples} 
                            variant="outline" 
                            size="sm" 
                            className="mt-2"
                        >
                            Try Again
                        </Button>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && totalCount === 0 && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-muted-foreground mb-2">No samples found</div>
                        <div className="text-sm text-muted-foreground">
                            {searchTerm ? 'Try adjusting your search terms' : 'No samples match your current filters'}
                        </div>
                    </div>
                    </div>
                )}
        </div>
    );
}