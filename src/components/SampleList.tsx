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

export const SampleList = React.memo(function SampleList({
    rulesEngineUrl,
    selectedSampleId,
    onSampleSelect,
    refreshInterval = 3000,
    onAutoRefreshChange,
    isAutoRefresh: externalAutoRefresh = false
}: SampleListProps) {
    
    const [samples, setSamples] = useState<WorkflowContext[]>([]);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'complete' | 'failed'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const samplesPerPage = 10;
    const [visibleSamples, setVisibleSamples] = useState<WorkflowContext[]>([]);

    // Debounce search term to prevent excessive filtering
    useEffect(() => {
        setIsSearching(true);
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setIsSearching(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Reset to page 1 when search term or filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearchTerm, filterStatus]);
    const [dateFilter, setDateFilter] = useState<number | null>(null);
    const [groupingType, setGroupingType] = useState<'order' | 'batch' | 'sample'>('sample');
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
    
    // Use refs for filter values to prevent fetchSamples from changing
    const filterStatusRef = useRef(filterStatus);
    const dateFilterRef = useRef(dateFilter);
    const searchTermRef = useRef(debouncedSearchTerm);
    const groupingTypeRef = useRef(groupingType);
    
    const lastSamplesRef = useRef<WorkflowContext[]>([]);
    
    // Update refs when values change - consolidated for efficiency
    useEffect(() => {
        filterStatusRef.current = filterStatus;
        dateFilterRef.current = dateFilter;
        searchTermRef.current = debouncedSearchTerm;
        groupingTypeRef.current = groupingType;
    }, [filterStatus, dateFilter, debouncedSearchTerm, groupingType]);

    const rulesEngineService = React.useMemo(
        () => new RulesEngineService(rulesEngineUrl),
        [rulesEngineUrl]
    );

    // Stabilize fetchSamples with useRef to prevent recreation
    const fetchSamplesRef = useRef<() => Promise<void>>(() => Promise.resolve());

    // Fetch samples with proper state management
    const fetchSamples = useCallback(async () => {
        // Prevent rapid successive calls
        const now = Date.now();
        if (isFetching.current || (now - lastFetchTime.current < 1000)) {
            return;
        }
        
        isFetching.current = true;
        lastFetchTime.current = now;
        
        try {
            // Only show loading on initial load, not during auto-refresh
            if (isInitialLoad) {
                setIsLoading(true);
            } else {
                // Completely silent update during auto-refresh - no state changes
                // Don't set any loading states to prevent flashing
            }
            // Don't reset error during auto-refresh to prevent re-renders
            if (isInitialLoad) {
            setError(null);
            }
            
            // Use the new rich payload structure from /contexts/rulechains
            let apiParams: any = {
                page: 1,
                pageSize: 10000, // Increased to pull in all samples
                // isActive: true - REMOVED to show both active and completed samples
            };
            
            if (dateFilterRef.current) {
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - dateFilterRef.current);
                apiParams.startTimestamp = startDate.toISOString();
                apiParams.endTimestamp = endDate.toISOString();
            }
            
            
            // Get the rich payload structure
            let response = await rulesEngineService.getChainContexts(apiParams);
            
            // Fallback if no active chains
            if (!response.success || !response.items || response.items.length === 0) {
                const fallbackParams = { ...apiParams };
                delete fallbackParams.isActive;
                response = await rulesEngineService.getChainContexts(fallbackParams);
            }
            
            if (response.success && response.items && response.items.length > 0) {
                // Convert rich payload to samples
                const newSamples = response.items.map(chain => {
                    
                    // Extract sample info from the rich payload
                    const chainId = chain.chainId || 'unknown';
                    // Handle both uppercase and lowercase variable names
                    const sampleId = chain.variables?.SampleId || chain.variables?.sampleId || 
                                   chain.variables?.OrderId || chain.variables?.orderId || 
                                   `Sample ${chainId.slice(-4)}`;
                    const status = chain.isComplete ? 
                        (chain.status === 'Failed' ? 3 : 2) : // Failed or Complete
                        (chain.isActive ? 1 : 0); // Active or Ready
                    
                    // Extract orderId and batchId from top-level fields
                    const orderId = chain.orderId || undefined;
                    const batchId = chain.batchId || undefined;
                    
                    
                    return {
                        contextId: chainId,
                        orderId: orderId,
                        batchId: batchId,
                        sampleId: sampleId,
                        status: status as ContextStatus,
                        lastUpdatedAt: chain.endTimestamp || chain.startTimestamp,
                        createdAt: chain.startTimestamp, // Add required createdAt property
                        chainId: chainId,
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
                
                
                // Build map of old samples by ID for O(1) lookup
                const oldSamplesMap = new Map(
                    lastSamplesRef.current.map(s => [s.sampleId, s])
                );

                let hasChanges = false;
                const updatedSamples = newSamples.map(newSample => {
                    const oldSample = oldSamplesMap.get(newSample.sampleId);
                    
                    // Check if this specific sample changed
                    if (!oldSample || 
                        oldSample.status !== newSample.status || 
                        oldSample.lastUpdatedAt !== newSample.lastUpdatedAt) {
                        hasChanges = true;
                        return newSample;
                    }
                    
                    // Return old reference to prevent re-render
                    return oldSample;
                });

                // Only update if something changed
                if (hasChanges || updatedSamples.length !== lastSamplesRef.current.length) {
                    lastSamplesRef.current = updatedSamples;
                    setSamples(updatedSamples);
                }
            } else {
                setSamples([]);
            }
            setError(null);
        } catch (err: any) {
            
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
            // Only reset states on initial load, not during auto-refresh
            if (isInitialLoad) {
            setIsLoading(false);
            setIsInitialLoad(false);
            }
            // Don't reset isUpdating during auto-refresh to prevent flashing
            isFetching.current = false;
        }
    }, [rulesEngineService]);

    // Update fetchSamples ref when function changes
    useEffect(() => {
        fetchSamplesRef.current = fetchSamples;
    }, [fetchSamples]);

    // Streaming-style auto-refresh with intelligent polling
    useEffect(() => {
        // Only fetch on mount or when auto-refresh toggles
        if (isInitialLoad) {
        fetchSamples();
            setIsInitialLoad(false);
        }

        // Remove global polling to prevent flashing
        // Only poll selected sample in SampleMonitor for real-time canvas updates
        // Users can manually refresh the sample list when needed

        return () => {
            // No cleanup needed since we removed global polling
        };
    }, []); // No dependencies needed since we removed global polling

    // Group samples by status with proper filtering and stable references
    const groupedSamples = useMemo(() => {
        const filtered = samples.filter(sample => {
            // Grouping type filter - filter to only show items with the selected field populated
            if (groupingTypeRef.current === 'order' && !sample.orderId) {
                return false;
            }
            if (groupingTypeRef.current === 'batch' && !sample.batchId) {
                return false;
            }
            if (groupingTypeRef.current === 'sample' && !sample.sampleId) {
                return false;
            }

            // Status filter
        if (filterStatusRef.current !== 'all') {
                if (filterStatusRef.current === 'active' && sample.status !== ContextStatus.Active && sample.status !== ContextStatus.Running) {
                    return false;
                }
                if (filterStatusRef.current === 'complete' && sample.status !== ContextStatus.Complete) {
                    return false;
                }
                if (filterStatusRef.current === 'failed' && sample.status !== ContextStatus.Failed) {
                    return false;
                }
            }

            // Search filter - context-aware based on grouping type
        if (searchTermRef.current) {
            const searchLower = searchTermRef.current.toLowerCase();
            
            // Search based on selected grouping type
            if (groupingTypeRef.current === 'order') {
                // When grouping by orders, search primarily by orderId
                return sample.orderId?.toLowerCase().includes(searchLower) || false;
            } else if (groupingTypeRef.current === 'batch') {
                // When grouping by batches, search primarily by batchId
                return sample.batchId?.toLowerCase().includes(searchLower) || false;
            } else {
                // When grouping by samples, search across all sample-related fields
                return (
                    sample.sampleId?.toLowerCase().includes(searchLower) ||
                    sample.workflowContextId?.toLowerCase().includes(searchLower) ||
                    sample.chainId?.toLowerCase().includes(searchLower) ||
                    sample.orderId?.toLowerCase().includes(searchLower) ||
                    sample.batchId?.toLowerCase().includes(searchLower)
                );
            }
        }

            return true;
        });

        // Group by the selected type
        let grouped: Record<string, WorkflowContext[]> = {};
        
        if (groupingTypeRef.current === 'order') {
            // Group by orderId
            filtered.forEach(sample => {
                const key = sample.orderId || 'unknown';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(sample);
            });
        } else if (groupingTypeRef.current === 'batch') {
            // Group by batchId
            filtered.forEach(sample => {
                const key = sample.batchId || 'unknown';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(sample);
            });
        } else {
            // Group by status (default 'sample' behavior)
            grouped = {
                active: filtered.filter(s => s.status === ContextStatus.Active || s.status === ContextStatus.Running),
                complete: filtered.filter(s => s.status === ContextStatus.Complete),
                failed: filtered.filter(s => s.status === ContextStatus.Failed)
            };
        }

        // Removed console.log to prevent re-renders during auto-refresh

        return grouped;
    }, [samples]);

    // Pagination logic
    const paginatedSamples = useMemo(() => {
        if (filterStatus === 'all') {
            // For "all" view, paginate within each group
            const paginated: Record<string, WorkflowContext[]> = {};
            Object.entries(groupedSamples).forEach(([groupKey, groupSamples]) => {
                const startIndex = (currentPage - 1) * samplesPerPage;
                const endIndex = startIndex + samplesPerPage;
                paginated[groupKey] = groupSamples.slice(startIndex, endIndex);
            });
            return paginated;
        } else {
            // For specific status filter, paginate the flat list
            const flatSamples = Object.values(groupedSamples).flat();
            const startIndex = (currentPage - 1) * samplesPerPage;
            const endIndex = startIndex + samplesPerPage;
            return { [filterStatus]: flatSamples.slice(startIndex, endIndex) };
        }
    }, [groupedSamples, filterStatus, currentPage, samplesPerPage]);

    // Calculate total pages
    const totalSamples = useMemo(() => {
        if (filterStatus === 'all') {
            return Object.values(groupedSamples).reduce((sum, group) => sum + group.length, 0);
        } else {
            return Object.values(groupedSamples).flat().length;
        }
    }, [groupedSamples, filterStatus]);

    const totalPages = Math.ceil(totalSamples / samplesPerPage);

    // Track visible samples for targeted polling
    useEffect(() => {
        const visible = Object.values(paginatedSamples).flat();
        setVisibleSamples(visible);
    }, [paginatedSamples]);

    // Poll only visible active/running samples
    useEffect(() => {
        if (!isAutoRefresh) return;

        const activeVisibleSamples = visibleSamples.filter(sample => 
            sample.status === ContextStatus.Active || sample.status === ContextStatus.Running
        );

        if (activeVisibleSamples.length === 0) return;

        const interval = setInterval(async () => {
            // Only fetch if we have active samples visible
            if (activeVisibleSamples.length > 0) {
                try {
                    await fetchSamplesRef.current?.();
                } catch (error) {
                    console.error('Polling error for visible samples:', error);
                }
            }
        }, 2000); // Poll every 2 seconds for visible active samples

        return () => clearInterval(interval);
    }, [visibleSamples, isAutoRefresh]); // Removed fetchSamples to fix infinite loop

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

    // Memoized sample card component to prevent unnecessary re-renders
    const SampleCard = React.memo(({ sample, autoRefresh, isSelected, onSelect, rulesEngineService }: {
        sample: WorkflowContext;
        autoRefresh: boolean;
        isSelected: boolean;
        onSelect: (sample: WorkflowContext) => void;
        rulesEngineService: RulesEngineService;
    }) => {
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
                onClick={() => onSelect(sample)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {statusIcon}
                        <div>
                            <div className="font-medium text-sm">{sample.sampleId}</div>
                            {sample.orderId && (
                                <div className="text-xs text-muted-foreground">Order: {sample.orderId}</div>
                            )}
                            {sample.batchId && (
                                <div className="text-xs text-muted-foreground">Batch: {sample.batchId}</div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant={
                            sample.status === ContextStatus.Complete ? "default" :
                            sample.status === ContextStatus.Failed ? "destructive" :
                            sample.status === ContextStatus.Active ? "secondary" :
                            "outline"
                        }>
                            {ContextStatus[sample.status]}
                        </Badge>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <span>
                                {sample.status === ContextStatus.Active || sample.status === ContextStatus.Running ? 
                                    rulesEngineService.formatDuration(sample.createdAt, new Date().toISOString()) :
                                    rulesEngineService.formatDuration(sample.createdAt, sample.lastUpdatedAt)
                                }
                            </span>
                            {autoRefresh && (sample.status === ContextStatus.Active || sample.status === ContextStatus.Running) && (
                                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" title="Live updates enabled" />
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        );
    });

    // Render sample card using memoized component
    const renderSampleCard = useCallback((sample: WorkflowContext, autoRefresh: boolean) => {
        const isSelected = selectedSampleId === sample.sampleId;
        
        return (
            <SampleCard
                key={`${sample.sampleId}-${sample.status}`}
                sample={sample}
                autoRefresh={autoRefresh}
                isSelected={isSelected}
                onSelect={onSampleSelect}
                rulesEngineService={rulesEngineService}
            />
        );
    }, [selectedSampleId, onSampleSelect, rulesEngineService]);

    const totalCount = useMemo(() => {
        if (groupingType === 'sample') {
            return groupedSamples.active?.length + groupedSamples.complete?.length + groupedSamples.failed?.length || 0;
        } else {
            return Object.values(groupedSamples).reduce((sum, group) => sum + (Array.isArray(group) ? group.length : 0), 0);
        }
    }, [groupedSamples, groupingType]);

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Sample List Pane */}
            <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="pl-8 pr-6 py-4 border-b space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold">Samples</h2>
                        <Badge variant="secondary" className="text-xs">
                            {totalSamples} samples
                        </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={fetchSamples}
                            variant="outline"
                            size="sm"
                            disabled={isLoading}
                            title="Refresh sample list (no auto-refresh to prevent flashing)"
                            className="gap-2"
                        >
                            <RotateCcw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button
                            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "gap-2",
                                isAutoRefresh && "text-primary"
                            )}
                            title={isAutoRefresh ? "Auto-refresh enabled (canvas only)" : "Auto-refresh disabled (canvas only)"}
                        >
                            <Loader2 className={cn("w-4 h-4", isAutoRefresh && "animate-pulse")} />
                            {isAutoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                        </Button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    {isSearching ? (
                        <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 animate-spin" />
                    ) : (
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    )}
                    <Input
                        placeholder={
                            groupingType === 'order' ? "Search orders..." :
                            groupingType === 'batch' ? "Search batches..." :
                            "Search samples..."
                        }
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                        <Button
                            variant={groupingType === 'sample' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setGroupingType('sample')}
                            className="text-xs"
                        >
                            Samples
                        </Button>
                        <Button
                            variant={groupingType === 'order' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setGroupingType('order')}
                            className="text-xs"
                        >
                            Orders
                        </Button>
                        <Button
                            variant={groupingType === 'batch' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setGroupingType('batch')}
                            className="text-xs"
                        >
                            Batches
                        </Button>
                    </div>
                    
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
                <ScrollArea className="flex-1 min-h-0">
                    <div className="pl-8 pr-6 py-4 space-y-4">
                        {/* When a specific status filter is selected, show flat list */}
                        {filterStatus !== 'all' ? (
                            <div className="space-y-2">
                                {Object.values(paginatedSamples).flat().map(s => renderSampleCard(s, isAutoRefresh))}
                            </div>
                        ) : (
                            /* When "All" is selected, show grouped view */
                            Object.entries(paginatedSamples).map(([groupKey, groupSamples]) => (
                                <div key={groupKey}>
                                    <div
                                        className="flex items-center gap-2 mb-2 cursor-pointer select-none"
                                        onClick={() => toggleGroup(groupKey)}
                                    >
                                        {expandedGroups.has(groupKey) ? (
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        )}
                                        <h3 className="font-medium text-sm">
                                            {groupingType === 'sample' 
                                                ? (groupKey === 'active' ? 'Active & Running' : 
                                                   groupKey === 'complete' ? 'Complete' : 'Failed')
                                                : groupKey}
                                        </h3>
                                        <Badge variant="default" className="text-xs">
                                            {Array.isArray(groupSamples) ? groupSamples.length : 0}
                                        </Badge>
                                    </div>
                                    {expandedGroups.has(groupKey) && (
                                        <div className="ml-6 space-y-2">
                                            {Array.isArray(groupSamples) && groupSamples.map(s => renderSampleCard(s, isAutoRefresh))}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            )}

            {/* Subtle updating indicator for streaming effect - only show on manual refresh */}
            {isUpdating && !isAutoRefresh && (
                <div className="absolute top-2 right-2 z-10">
                    <div className="bg-primary/10 text-primary px-2 py-1 rounded-full text-xs flex items-center gap-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                        Updating...
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

            {/* Pagination Pane - Compact navigator */}
            {!isLoading && !error && totalCount > 0 && totalPages > 1 && (
                <div className="border-t bg-muted/20 px-4 py-2">
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                            Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="h-6 px-2 text-xs"
                            >
                                ‹
                            </Button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                                    const pageNum = i + 1;
                                    return (
                                        <Button
                                            key={pageNum}
                                            variant={currentPage === pageNum ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => setCurrentPage(pageNum)}
                                            className="w-6 h-6 p-0 text-xs"
                                        >
                                            {pageNum}
                                        </Button>
                                    );
                                })}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="h-6 px-2 text-xs"
                            >
                                ›
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});