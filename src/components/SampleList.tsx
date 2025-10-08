import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { cn } from '../lib/utils';
import { 
    MagnifyingGlass, 
    Circle, 
    CheckCircle, 
    XCircle, 
    Pause,
    Clock,
    SpinnerGap,
    CaretDown,
    CaretRight,
    Flask,
    Package,
    Hash,
    GitBranch,
    ArrowClockwise,
    WarningCircle
} from '@phosphor-icons/react';
import { WorkflowContext, ContextStatus, RulesEngineService } from '../services/RulesEngineService';

interface SampleListProps {
    rulesEngineUrl: string;
    selectedSampleId?: string;
    onSampleSelect: (sample: WorkflowContext) => void;
    refreshInterval?: number;
}

export function SampleList({
    rulesEngineUrl,
    selectedSampleId,
    onSampleSelect,
    refreshInterval = 2000
}: SampleListProps) {
    const [samples, setSamples] = useState<WorkflowContext[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'complete' | 'failed'>('all');
    const [dateFilter, setDateFilter] = useState<number | null>(null); // null = all time, or number of days
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAutoRefresh, setIsAutoRefresh] = useState(false); // Default to off for better performance
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['active']));

    const rulesEngineService = React.useMemo(
        () => new RulesEngineService(rulesEngineUrl),
        [rulesEngineUrl]
    );

    // Fetch samples
    const fetchSamples = useCallback(async () => {
        try {
            const response = await rulesEngineService.getChainsAsSamples({
                lastNDays: dateFilter || undefined,
                pageSize: 500 // Get more samples
            });
            
            if (response.samples && Array.isArray(response.samples)) {
                setSamples(response.samples);
            } else {
                setSamples([]);
            }
            setError(null);
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to fetch samples';
            setError(errorMessage);
            
            // Don't stop auto-refresh on error - it might recover
            if (errorMessage.includes('Failed to fetch')) {
                setError('Cannot connect to Rules Engine. Please check the URL and ensure the service is running.');
            }
        } finally {
            setIsLoading(false);
        }
    }, [rulesEngineService, dateFilter]);

    // Initial fetch and polling setup
    useEffect(() => {
        // Initial fetch
        fetchSamples();

        // Set up interval if auto-refresh is enabled
        let interval: NodeJS.Timeout | null = null;
        if (isAutoRefresh) {
            interval = setInterval(fetchSamples, refreshInterval);
        }

        // Cleanup
        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [isAutoRefresh, refreshInterval, dateFilter]); // Remove fetchSamples from deps to prevent loops

    // Group samples by status
    const groupedSamples = useMemo(() => {
        let filtered = samples;

        // Apply status filter
        if (filterStatus !== 'all') {
            filtered = filtered.filter(sample => {
                switch (filterStatus) {
                    case 'active':
                        return sample.status === ContextStatus.Active || 
                               sample.status === ContextStatus.Running;
                    case 'complete':
                        return sample.status === ContextStatus.Complete;
                    case 'failed':
                        return sample.status === ContextStatus.Failed;
                    default:
                        return true;
                }
            });
        }

        // Apply search filter
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(sample => 
                sample.sampleId?.toLowerCase().includes(searchLower) ||
                sample.orderId?.toLowerCase().includes(searchLower) ||
                sample.batchId?.toLowerCase().includes(searchLower) ||
                sample.contextId.toLowerCase().includes(searchLower)
            );
        }

        // Group by status
        const groups = {
            active: [] as WorkflowContext[],
            complete: [] as WorkflowContext[],
            failed: [] as WorkflowContext[]
        };

        filtered.forEach(sample => {
            // Convert status to number if it's a string
            const status = typeof sample.status === 'string' ? parseInt(sample.status) : sample.status;
            
            if (status === ContextStatus.Active || status === ContextStatus.Running) {
                groups.active.push(sample);
            } else if (status === ContextStatus.Complete) {
                groups.complete.push(sample);
            } else if (status === ContextStatus.Failed) {
                groups.failed.push(sample);
            } else {
                // Handle unknown status - add to active for visibility
                groups.active.push(sample);
            }
        });

        // Sort each group by last updated
        Object.values(groups).forEach(group => {
            group.sort((a, b) => 
                new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
            );
        });

        return groups;
    }, [samples, searchTerm, filterStatus]);

    const getStatusIcon = (status: ContextStatus) => {
        const info = rulesEngineService.getStatusInfo(status);
        switch (info.icon) {
            case 'SpinnerGap':
                return <SpinnerGap className="w-4 h-4 animate-spin" />;
            case 'CheckCircle':
                return <CheckCircle className="w-4 h-4" weight="fill" />;
            case 'XCircle':
                return <XCircle className="w-4 h-4" weight="fill" />;
            case 'Pause':
                return <Pause className="w-4 h-4" weight="fill" />;
            case 'Circle':
            default:
                return <Circle className="w-4 h-4" />;
        }
    };

    const toggleGroup = (group: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(group)) {
            newExpanded.delete(group);
        } else {
            newExpanded.add(group);
        }
        setExpandedGroups(newExpanded);
    };

    const renderSampleCard = (sample: WorkflowContext) => {
        const variables = rulesEngineService.extractVariables(sample);
        
        // Convert status to number if it's a string
        const status = typeof sample.status === 'string' ? parseInt(sample.status) : sample.status;
        const statusInfo = rulesEngineService.getStatusInfo(status);
        
        // Extract key information
        const workflowName = variables.workflowName || variables.WorkflowName;
        const currentRule = variables.currentRule || variables.CurrentRule || variables.currentRuleName;
        
        return (
            <Card
                key={sample.contextId}
                onClick={() => onSampleSelect(sample)}
                className={cn(
                    "p-3 cursor-pointer transition-all hover:shadow-md",
                    selectedSampleId === sample.contextId && "border-primary bg-accent/50",
                    status === ContextStatus.Running && "border-yellow-500/50"
                )}
            >
                <div className="space-y-2">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            {getStatusIcon(status)}
                            <span className="font-medium text-sm truncate">
                                {rulesEngineService.getContextDisplayName(sample)}
                            </span>
                        </div>
                        <Badge 
                            variant={
                                status === ContextStatus.Complete ? "secondary" :
                                status === ContextStatus.Failed ? "destructive" :
                                status === ContextStatus.Running ? "default" :
                                "outline"
                            }
                            className="text-xs flex-shrink-0"
                        >
                            {statusInfo.label}
                        </Badge>
                    </div>

                    {/* Workflow & Rule Info */}
                    {(workflowName || currentRule) && (
                        <div className="space-y-1">
                            {workflowName && (
                                <div className="text-xs text-muted-foreground truncate">
                                    {workflowName}
                                </div>
                            )}
                            {currentRule && (
                                <div className="flex items-center gap-1">
                                    <GitBranch className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                    <span className="text-xs font-medium truncate">{currentRule}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Metadata & Timing */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-3">
                            {sample.orderId && (
                                <div className="flex items-center gap-1">
                                    <Hash className="w-3 h-3" />
                                    <span className="truncate max-w-[80px]">{sample.orderId}</span>
                                </div>
                            )}
                            {sample.batchId && (
                                <div className="flex items-center gap-1">
                                    <Package className="w-3 h-3" />
                                    <span className="truncate max-w-[80px]">{sample.batchId}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{rulesEngineService.formatDuration(sample.createdAt, sample.lastUpdatedAt)}</span>
                        </div>
                    </div>
                </div>
            </Card>
        );
    };

    const totalCount = groupedSamples.active.length + groupedSamples.complete.length + groupedSamples.failed.length;

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
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
                            <ArrowClockwise className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </Button>
                        <Button
                            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "gap-2",
                                isAutoRefresh && "text-primary"
                            )}
                        >
                            <SpinnerGap className={cn("w-4 h-4", isAutoRefresh && "animate-pulse")} />
                            {isAutoRefresh ? "Live" : "Paused"}
                        </Button>
                    </div>
                </div>

                {/* Search */}
                <div className="relative">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                        placeholder="Search samples..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>

                {/* Quick Filters */}
                <div className="space-y-2">
                    {/* Status Filters */}
                    <div className="flex gap-1">
                        <Button
                            variant={filterStatus === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('all')}
                            className="flex-1 text-xs"
                        >
                            All ({samples.length})
                        </Button>
                        <Button
                            variant={filterStatus === 'active' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('active')}
                            className="flex-1 text-xs"
                        >
                            Active
                        </Button>
                        <Button
                            variant={filterStatus === 'complete' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('complete')}
                            className="flex-1 text-xs"
                        >
                            Complete
                        </Button>
                        <Button
                            variant={filterStatus === 'failed' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => setFilterStatus('failed')}
                            className="flex-1 text-xs"
                        >
                            Failed
                        </Button>
                    </div>
                    
                    {/* Date Filters */}
                    <div className="flex gap-1">
                        <Button
                            variant={dateFilter === null ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateFilter(null)}
                            className="flex-1 text-xs"
                        >
                            All Time
                        </Button>
                        <Button
                            variant={dateFilter === 1 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateFilter(1)}
                            className="flex-1 text-xs"
                        >
                            Today
                        </Button>
                        <Button
                            variant={dateFilter === 7 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateFilter(7)}
                            className="flex-1 text-xs"
                        >
                            7 Days
                        </Button>
                        <Button
                            variant={dateFilter === 30 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setDateFilter(30)}
                            className="flex-1 text-xs"
                        >
                            30 Days
                        </Button>
                    </div>
                </div>
            </div>

            {/* Sample List */}
            <ScrollArea className="flex-1">
                {isLoading && !error && samples.length === 0 && (
                    <div className="px-8 py-8 text-center">
                        <SpinnerGap className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading samples...</p>
                    </div>
                )}

                {error && (
                    <div className="pl-8 pr-6 py-4">
                        <Card className="border-destructive/50 bg-destructive/10">
                            <div className="p-4 space-y-2">
                                <div className="flex items-center gap-2 text-destructive">
                                    <WarningCircle className="w-5 h-5" />
                                    <p className="font-medium text-sm">Connection Error</p>
                                </div>
                                <p className="text-xs text-muted-foreground">{error}</p>
                                <Button
                                    onClick={fetchSamples}
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                >
                                    Retry Connection
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}

                {!isLoading && !error && totalCount === 0 && (
                    <div className="px-8 py-8 text-center">
                        <div className="mb-4">
                            <Flask className="w-12 h-12 mx-auto text-muted-foreground/50" />
                        </div>
                        <p className="font-medium mb-1">No samples found</p>
                        <p className="text-sm text-muted-foreground">
                            {searchTerm ? 'Try adjusting your search criteria' : 
                             dateFilter ? `No samples in the last ${dateFilter} day${dateFilter > 1 ? 's' : ''}` : 
                             'No samples are currently running'}
                        </p>
                        {dateFilter && (
                            <Button
                                variant="link"
                                size="sm"
                                onClick={() => setDateFilter(null)}
                                className="mt-2"
                            >
                                Show all time
                            </Button>
                        )}
                    </div>
                )}

                {!isLoading && !error && totalCount > 0 && (
                    <div className="pl-8 pr-6 py-4 space-y-4">
                        {/* Active/Running Group */}
                        {groupedSamples.active.length > 0 && (
                            <div>
                                <div
                                    className="flex items-center gap-2 mb-2 cursor-pointer select-none"
                                    onClick={() => toggleGroup('active')}
                                >
                                    {expandedGroups.has('active') ? (
                                        <CaretDown className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <CaretRight className="w-4 h-4 text-muted-foreground" />
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
                                        <CaretDown className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <CaretRight className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <h3 className="font-medium text-sm text-green-600 dark:text-green-400">
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
                                        <CaretDown className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                        <CaretRight className="w-4 h-4 text-muted-foreground" />
                                    )}
                                    <h3 className="font-medium text-sm text-red-600 dark:text-red-400">
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
                )}
            </ScrollArea>
        </div>
    );
}
