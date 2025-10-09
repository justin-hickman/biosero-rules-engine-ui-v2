import React, { useState } from 'react';
import { ScrollArea } from '../components/ui/scroll-area';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import { cn } from '../lib/utils';
import {
    CaretDown,
    CaretRight,
    CheckCircle,
    XCircle,
    Clock,
    Download,
    Copy,
    Pulse,
    Info,
    Warning
} from '@phosphor-icons/react';
import { WorkflowContext, ChainContext, RulesEngineService } from '../services/RulesEngineService';
import { toast } from 'sonner';

interface ContextViewerProps {
    context: WorkflowContext | null;
    chainExecution?: ChainContext | null;
    rulesEngineService: RulesEngineService;
}

interface TreeNodeProps {
    label: string;
    value: any;
    depth?: number;
}

function TreeNode({ label, value, depth = 0 }: TreeNodeProps) {
    const [isExpanded, setIsExpanded] = useState(depth < 2);
    const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
    const isArray = Array.isArray(value);
    const hasChildren = isObject || isArray;

    const renderValue = () => {
        if (value === null) return <span className="text-muted-foreground">null</span>;
        if (value === undefined) return <span className="text-muted-foreground">undefined</span>;
        if (typeof value === 'boolean') return <span className="text-blue-500">{String(value)}</span>;
        if (typeof value === 'number') return <span className="text-green-500">{value}</span>;
        if (typeof value === 'string') return <span className="text-orange-500 break-all">"{value}"</span>;
        if (isArray) return <span className="text-muted-foreground">[{value.length} items]</span>;
        if (isObject) return <span className="text-muted-foreground">{Object.keys(value).length} properties</span>;
        return String(value);
    };

    return (
        <div className="text-xs w-full">
            <div
                className={cn(
                    "flex items-start gap-1 py-1 hover:bg-accent/50 rounded px-2 cursor-pointer",
                    depth > 0 && "ml-4"
                )}
                onClick={() => hasChildren && setIsExpanded(!isExpanded)}
            >
                {hasChildren ? (
                    isExpanded ? (
                        <CaretDown className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                    ) : (
                        <CaretRight className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                    )
                ) : (
                    <span className="w-3 flex-shrink-0" />
                )}
                <span className="text-primary flex-shrink-0">{label}:</span>
                {!hasChildren && <span className="ml-2 break-all">{renderValue()}</span>}
            </div>

            {hasChildren && isExpanded && (
                <div>
                    {isArray
                        ? value.map((item: any, index: number) => (
                            <TreeNode
                                key={index}
                                label={`[${index}]`}
                                value={item}
                                depth={depth + 1}
                            />
                        ))
                        : Object.entries(value).map(([key, val]) => (
                            <TreeNode
                                key={key}
                                label={key}
                                value={val}
                                depth={depth + 1}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}

export function ContextViewer({ context, chainExecution, rulesEngineService }: ContextViewerProps) {
    const [activeTab, setActiveTab] = useState('overview');

    if (!context) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center p-6">
                    <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">No sample selected</p>
                    <p className="text-sm mt-1">Select a sample to view details</p>
                </div>
            </div>
        );
    }

    const variables = rulesEngineService.extractVariables(context);
    const statusInfo = rulesEngineService.getStatusInfo(context.status);

    const handleExportContext = () => {
        const exportData = {
            context: {
                contextId: context.contextId,
                sampleId: context.sampleId,
                orderId: context.orderId,
                batchId: context.batchId,
                status: statusInfo.label,
                createdAt: context.createdAt,
                lastUpdatedAt: context.lastUpdatedAt
            },
            variables: variables,
            chainExecution: chainExecution || null
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${rulesEngineService.getContextDisplayName(context)}-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast.success('Context exported successfully');
    };

    const handleCopyJson = () => {
        const data = {
            context: context,
            variables: variables,
            chainExecution: chainExecution || null
        };
        
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        toast.success('Copied to clipboard');
    };

    // Calculate execution progress using enriched payload data
    const executionProgress = chainExecution ? {
        total: chainExecution.progress?.totalRules || chainExecution.rules?.length || 0,
        completed: chainExecution.progress?.completedRules || 0,
        success: Object.values(chainExecution.ruleStatusMap || {}).filter(status => status === 'Success').length,
        failed: Object.values(chainExecution.ruleStatusMap || {}).filter(status => status === 'Failed').length,
        percentage: chainExecution.progress?.percentage || 0,
        estimatedCompletion: chainExecution.progress?.estimatedCompletion
    } : null;

    // Calculate running time
    const runningTime = chainExecution ? (() => {
        const startTime = new Date(chainExecution.startTimestamp).getTime();
        const endTime = chainExecution.endTimestamp ? 
            new Date(chainExecution.endTimestamp).getTime() : 
            Date.now();
        return endTime - startTime;
    })() : 0;

    return (
        <div className="h-full w-full flex flex-col bg-background overflow-hidden">
            {/* Header */}
            <div className="px-4 py-4 border-b flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Context Details</h2>
                    <div className="flex gap-2">
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleCopyJson}
                            title="Copy JSON"
                        >
                            <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleExportContext}
                            title="Export context"
                        >
                            <Download className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Sample Info */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="font-medium">
                            {rulesEngineService.getContextDisplayName(context)}
                        </span>
                        <Badge 
                            variant={
                                context.status === 2 ? "secondary" :
                                context.status === 3 ? "destructive" :
                                context.status === 1 ? "default" :
                                "outline"
                            }
                            className="gap-1"
                        >
                            {statusInfo.icon === 'spinner' && <Pulse className="w-3 h-3 animate-pulse" />}
                            {statusInfo.label}
                        </Badge>
                    </div>

                    {chainExecution && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Current Rule:</span>
                                <span className="font-medium">{chainExecution.currentRuleName}</span>
                            </div>
                            
                            {executionProgress && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Progress</span>
                                        <span className="font-medium">{executionProgress.percentage.toFixed(1)}%</span>
                                    </div>
                                    <Progress value={executionProgress.percentage} className="h-2" />
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{executionProgress.completed} / {executionProgress.total} rules</span>
                                        {executionProgress.estimatedCompletion && (
                                            <span>ETA: {new Date(executionProgress.estimatedCompletion).toLocaleTimeString()}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>
                            Running for {chainExecution ? 
                                rulesEngineService.formatDuration(chainExecution.startTimestamp, chainExecution.endTimestamp || new Date().toISOString()) :
                                rulesEngineService.formatDuration(context.createdAt, context.lastUpdatedAt)
                            }
                        </span>
                    </div>
                </div>
            </div>

            {/* Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="mx-4 flex-shrink-0">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="variables">
                        Variables {Object.keys(variables).length > 0 && `(${Object.keys(variables).length})`}
                    </TabsTrigger>
                    <TabsTrigger value="execution">
                        Execution {chainExecution && `(${(chainExecution.history || chainExecution.ruleStatusHistory || []).length})`}
                    </TabsTrigger>
                    <TabsTrigger value="raw">Raw</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 overflow-y-auto">
                    <TabsContent value="overview" className="px-4 py-4 space-y-4">
                        {/* Context Info Card */}
                        <Card className="overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-sm">Context Information</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="space-y-2 text-sm">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-muted-foreground text-xs">Context ID:</span>
                                        <span className="font-mono text-xs break-all">{context.contextId}</span>
                                    </div>
                                    
                                    {context.orderId && (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-muted-foreground text-xs">Order ID:</span>
                                            <span className="text-sm break-all">{context.orderId}</span>
                                        </div>
                                    )}
                                    
                                    {context.batchId && (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-muted-foreground text-xs">Batch ID:</span>
                                            <span className="text-sm break-all">{context.batchId}</span>
                                        </div>
                                    )}
                                    
                                    {context.sampleId && (
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-muted-foreground text-xs">Sample ID:</span>
                                            <span className="text-sm break-all">{context.sampleId}</span>
                                        </div>
                                    )}
                                    
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-muted-foreground text-xs">Created:</span>
                                        <span className="text-xs">{new Date(context.createdAt).toLocaleString()}</span>
                                    </div>
                                    
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-muted-foreground text-xs">Updated:</span>
                                        <span className="text-xs">{new Date(context.lastUpdatedAt).toLocaleString()}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Execution Summary */}
                        {chainExecution && (
                            <Card className="overflow-hidden">
                                <CardHeader>
                                    <CardTitle className="text-sm">Execution Summary</CardTitle>
                                    <CardDescription className="break-all text-xs">
                                        Chain ID: {chainExecution.chainId}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                        <div className="space-y-1">
                                            <p className="text-2xl font-bold">{executionProgress!.total}</p>
                                            <p className="text-xs text-muted-foreground">Total Rules</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-2xl font-bold text-blue-600">{executionProgress!.completed}</p>
                                            <p className="text-xs text-muted-foreground">Completed</p>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 text-center">
                                        <div className="space-y-1">
                                            <p className="text-xl font-bold text-green-600">{executionProgress!.success}</p>
                                            <p className="text-xs text-muted-foreground">Succeeded</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-xl font-bold text-red-600">{executionProgress!.failed}</p>
                                            <p className="text-xs text-muted-foreground">Failed</p>
                                        </div>
                                    </div>
                                    
                                    {chainExecution.performanceMetrics && (
                                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                                            <div className="text-xs font-medium text-muted-foreground mb-2">Performance</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <span className="text-muted-foreground">Total Time:</span>
                                                    <span className="ml-1 font-mono">{chainExecution.performanceMetrics.totalExecutionTime}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Avg Rule:</span>
                                                    <span className="ml-1 font-mono">{chainExecution.performanceMetrics.averageRuleTime}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Slowest:</span>
                                                    <span className="ml-1">{chainExecution.performanceMetrics.slowestRule}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Retries:</span>
                                                    <span className="ml-1">{chainExecution.performanceMetrics.retryCount}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {chainExecution.errorMessage && (
                                        <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                                            <div className="flex items-start gap-2">
                                                <Warning className="w-4 h-4 text-red-600 mt-0.5" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-red-900 dark:text-red-200">
                                                        Chain Error
                                                    </p>
                                                    <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                                                        {chainExecution.errorMessage}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Key Variables Preview */}
                        {Object.keys(variables).length > 0 && (
                            <Card className="overflow-hidden">
                                <CardHeader>
                                    <CardTitle className="text-sm">Key Variables</CardTitle>
                                    <CardDescription>
                                        {Object.keys(variables).length} variable{Object.keys(variables).length !== 1 ? 's' : ''}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4">
                                    <div className="space-y-2 w-full overflow-hidden">
                                        {/* Show first 3 variables always */}
                                        {Object.entries(variables)
                                            .slice(0, 3)
                                            .map(([key, value]) => (
                                                <div key={key} className="text-sm w-full overflow-hidden">
                                                    <TreeNode label={key} value={value} depth={0} />
                                                </div>
                                            ))}
                                        
                                        {/* Show rest as collapsible if more than 3 */}
                                        {Object.keys(variables).length > 3 && (
                                            <Collapsible>
                                                <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                                    <CaretRight className="w-3 h-3 transition-transform data-[state=open]:rotate-90" />
                                                    Show {Object.keys(variables).length - 3} more variable{Object.keys(variables).length - 3 !== 1 ? 's' : ''}
                                                </CollapsibleTrigger>
                                                <CollapsibleContent className="mt-2 space-y-2">
                                                    {Object.entries(variables)
                                                        .slice(3)
                                                        .map(([key, value]) => (
                                                            <div key={key} className="text-sm w-full overflow-hidden">
                                                                <TreeNode label={key} value={value} depth={0} />
                                                            </div>
                                                        ))}
                                                </CollapsibleContent>
                                            </Collapsible>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="variables" className="px-4 py-4">
                        <Card className="overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-sm">All Variables</CardTitle>
                                <CardDescription>
                                    Complete list of context variables
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {Object.keys(variables).length > 0 ? (
                                    <div className="bg-muted/30 p-3 rounded overflow-x-auto">
                                        {Object.entries(variables).map(([key, value]) => (
                                            <div key={key} className="w-full">
                                                <TreeNode key={key} label={key} value={value} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-6 text-muted-foreground">
                                        <p>No variables defined</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="execution" className="px-4 py-4">
                        {chainExecution ? (
                            <Card className="overflow-hidden">
                                <CardHeader>
                                    <CardTitle className="text-sm">Rule Execution History</CardTitle>
                                    <CardDescription>
                                        {chainExecution.isComplete ? 'Execution complete' : 'Execution in progress'}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {(chainExecution.history || chainExecution.ruleStatusHistory || []).map((result, index) => {
                                            const duration = result.evaluatedAt ? 
                                                new Date(result.evaluatedAt).getTime() - 
                                                new Date(chainExecution.startTimestamp).getTime() : 0;
                                            
                                            return (
                                                <div
                                                    key={index}
                                                    className={cn(
                                                        "border rounded-lg p-3 space-y-2",
                                                        result.ruleName === chainExecution.currentRuleName && 
                                                        "border-primary bg-primary/5"
                                                    )}
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex items-center gap-2">
                                                            {result.isSuccess ? (
                                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                                            ) : (
                                                                <XCircle className="w-4 h-4 text-red-500" />
                                                            )}
                                                            <span className="font-medium text-sm">
                                                                {result.ruleName}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">
                                                            +{(duration / 1000).toFixed(2)}s
                                                        </span>
                                                    </div>
                                                    
                                                    {result.errorMessage && (
                                                        <div className="text-xs text-red-600 dark:text-red-400 pl-6">
                                                            {result.errorMessage}
                                                        </div>
                                                    )}
                                                    
                                                    {result.outputs && Object.keys(result.outputs).length > 0 && (
                                                        <div className="pl-6 text-xs">
                                                            <span className="text-muted-foreground">Outputs: </span>
                                                            <span className="font-mono">
                                                                {JSON.stringify(result.outputs)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <Pulse className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p className="font-medium">No execution data</p>
                                <p className="text-sm mt-1">Execution history will appear here when available</p>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="raw" className="px-4 py-4">
                        <Card className="overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-sm">Raw JSON Data</CardTitle>
                                <CardDescription>Complete context and execution data</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <pre className="bg-muted/30 p-3 rounded text-xs overflow-x-auto max-w-full">
                                    {JSON.stringify({
                                        context: context,
                                        variables: variables,
                                        chainExecution: chainExecution
                                    }, null, 2)}
                                </pre>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </ScrollArea>
            </Tabs>
        </div>
    );
}