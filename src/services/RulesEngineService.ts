// RulesEngineService.ts - Service layer for Rules Engine API integration

// Chain data types
export interface ChainData {
    nodes: Record<string, ChainNode>;
    edges: Array<{ from: string; to: string; type: string }>;
}

export interface ChainNode {
    id: string;
    label: string;
    ruleId?: string;
    status?: string;
    isCurrent?: boolean;
    position?: { x: number; y: number };
    [key: string]: any;
}

// Core context structure from API
export interface WorkflowContext {
    contextId: string;
    orderId?: string;
    batchId?: string;
    sampleId?: string;
    status: ContextStatus;
    createdAt: string;
    lastUpdatedAt: string;
    // Variables are stored at root level in API response
    [key: string]: any;
}

export enum ContextStatus {
    Active = 0,
    Running = 1,
    Complete = 2,
    Failed = 3,
    Paused = 4
}

export interface ContextListResponse {
    total: number;
    contexts: WorkflowContext[];
}

// Enhanced ChainContext with new API structure
export interface ChainContext {
    chainId: string;
    workflowContextId?: string;
    orderId?: string | null;
    batchId?: string | null;
    sampleId?: string | null;
    initialRuleName: string;
    currentRuleName: string;
    currentDepth: number;
    maxDepth: number;
    status: string; // Pending, Running, Completed, Failed
    isActive: boolean;
    isComplete: boolean;
    errorMessage?: string;
    startTimestamp: string;
    endTimestamp?: string;
    variables: Record<string, any>;
    ruleStatusHistory: RuleStatusEntry[]; // Last 10 entries
    rules: RuleStatus[]; // All rules in chain
    ruleStatusMap: Record<string, string>; // Quick lookup
    chainStructure?: ChainStructure;
    performanceMetrics?: PerformanceMetrics;
    progress?: Progress;
    rulesetVersionId?: string;
    actionExecutionRecords?: ActionExecutionRecord[];
}

export interface RuleStatusEntry {
    ruleName: string;
    isSuccess: boolean;
    evaluatedAt: string;
    errorMessage?: string;
    usedVariables: Record<string, any>;
}

export interface RuleStatus {
    identifier: string;
    name: string;
    status: string; // Success, Failed, NotRun
    lastEvaluatedAt: string | null;
}

export interface ChainStructure {
    edges: Array<{
        from: string;
        to: string;
        type: string; // success, failure
    }>;
    actions: Array<{
        ruleId: string;
        ruleName: string;
        actionType: string;
        templateName: string | null;
        evaluationExpression: string | null;
    }>;
}

export interface PerformanceMetrics {
    totalExecutionTime: string; // ISO 8601 duration
    averageRuleTime: string; // ISO 8601 duration
    slowestRule: string;
    retryCount: number;
}

export interface Progress {
    completedRules: number;
    totalRules: number;
    percentage: number;
    estimatedCompletion: string; // ISO 8601 timestamp
}

export interface ActionExecutionRecord {
    actionInstanceId: string;
    executedAt: string;
    succeeded: boolean;
    errorMessage?: string;
}

// Legacy interface for backward compatibility
export interface RuleResult {
    ruleName: string;
    isSuccess: boolean;
    errorMessage?: string;
    inputs?: Record<string, any>;
    outputs?: Record<string, any>;
    actionsToExecute?: any[];
    evaluatedAt: string;
    childResults?: RuleResult[];
}

// Context request structure
export interface ContextRequest {
    explicitContextId?: string;
    orderId?: string;
    batchId?: string;
    sampleId?: string;
    workflowName?: string;
    workflowVariables?: Record<string, any>;
    gbgSchedulerActionVariables?: Record<string, any>;
    orchestratorWorkflowActionVariables?: Record<string, any>;
}

export class RulesEngineService {
    private baseUrl: string;
    private abortController: AbortController | null = null;
    private chainCache: Map<string, ChainContext> = new Map();
    private contextToChainMap: Map<string, string> = new Map();

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    }

    // Extract variables from context, filtering out system fields
    extractVariables(context: any): Record<string, any> {
        const systemFields = [
            'contextId', 'orderId', 'batchId', 'sampleId', 
            'status', 'createdAt', 'lastUpdatedAt', 'workflowVariables'
        ];
        
        const variables: Record<string, any> = {};
        
        // Extract all fields that aren't system fields
        for (const [key, value] of Object.entries(context)) {
            if (!systemFields.includes(key)) {
                variables[key] = value;
            }
        }
        
        // Also check if there's a nested workflowVariables object
        if (context.workflowVariables && typeof context.workflowVariables === 'object') {
            Object.assign(variables, context.workflowVariables);
        }
        
        return variables;
    }
    
    // Get a display name for the context
    getContextDisplayName(context: WorkflowContext): string {
        if (context.sampleId) {
            // If sampleId already contains descriptive text, use it as-is
            return context.sampleId;
        }
        if (context.batchId) {
            return `Batch ${context.batchId}`;
        }
        if (context.orderId) {
            return `Order ${context.orderId}`;
        }
        // Shorten context ID for display
        return `Context-${context.contextId.substring(0, 8)}`;
    }
    
    // Get status info with label, color, and icon
    getStatusInfo(status: ContextStatus): { label: string; color: string; icon: string } {
        switch (status) {
            case ContextStatus.Active:
                return { label: 'Active', color: 'bg-blue-500', icon: 'Circle' };
            case ContextStatus.Running:
                return { label: 'Running', color: 'bg-green-500', icon: 'SpinnerGap' };
            case ContextStatus.Complete:
                return { label: 'Complete', color: 'bg-gray-500', icon: 'CheckCircle' };
            case ContextStatus.Failed:
                return { label: 'Failed', color: 'bg-red-500', icon: 'XCircle' };
            case ContextStatus.Paused:
                return { label: 'Paused', color: 'bg-yellow-500', icon: 'Pause' };
            default:
                return { label: 'Unknown', color: 'bg-gray-400', icon: 'Circle' };
        }
    }
    
    // Format duration for display
    formatDuration(start: string, end?: string): string {
        const startTime = new Date(start).getTime();
        const endTime = end ? new Date(end).getTime() : Date.now();
        const duration = endTime - startTime;
        
        if (duration < 1000) return `${duration}ms`;
        if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
        if (duration < 3600000) return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
        return `${Math.floor(duration / 3600000)}h ${Math.floor((duration % 3600000) / 60000)}m`;
    }


    // Get context by ID
    async getContextById(contextId: string): Promise<WorkflowContext | null> {
        try {
            const response = await fetch(`${this.baseUrl}/contexts/${contextId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch context: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching context:', error);
            throw error;
        }
    }

    // Search contexts by criteria
    async searchContexts(params: {
        orderId?: string;
        batchId?: string;
        sampleId?: string;
    }): Promise<WorkflowContext[]> {
        try {
            const queryParams = new URLSearchParams();
            if (params.orderId) queryParams.append('orderId', params.orderId);
            if (params.batchId) queryParams.append('batchId', params.batchId);
            if (params.sampleId) queryParams.append('sampleId', params.sampleId);

            const response = await fetch(`${this.baseUrl}/contexts/search?${queryParams}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to search contexts: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error searching contexts:', error);
            throw error;
        }
    }

    // Get paginated rule chains with filtering (matches specification)
    async getRuleChains(params?: {
        startTimestamp?: string;
        endTimestamp?: string;
        isActive?: boolean;
        isComplete?: boolean;
        contextId?: string;
        page?: number;
        pageSize?: number;
    }): Promise<{
        success: boolean;
        total: number;
        page: number;
        pageSize: number;
        count: number;
        items: ChainContext[];
    }> {
        try {
            const queryParams = new URLSearchParams();
            if (params?.startTimestamp) queryParams.append('startTimestamp', params.startTimestamp);
            if (params?.endTimestamp) queryParams.append('endTimestamp', params.endTimestamp);
            if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
            if (params?.isComplete !== undefined) queryParams.append('isComplete', params.isComplete.toString());
            if (params?.contextId) queryParams.append('contextId', params.contextId);
            queryParams.append('page', (params?.page || 1).toString());
            queryParams.append('pageSize', (params?.pageSize || 100).toString());
            
            const url = `${this.baseUrl}/api/UiMonitor/contexts?${queryParams}`;
            
            console.log('🌐 BRE API: Making request to:', {
                url,
                baseUrl: this.baseUrl,
                params: Object.fromEntries(queryParams.entries())
            });
            
            // First, let's test if the base BRE API is accessible
            try {
                const healthCheck = await fetch(`${this.baseUrl}/diagnostics/health`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log('🏥 BRE API Health Check:', {
                    status: healthCheck.status,
                    ok: healthCheck.ok,
                    url: `${this.baseUrl}/diagnostics/health`
                });
            } catch (healthError) {
                console.log('⚠️ BRE API Health Check failed:', healthError);
            }
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('📡 BRE API: Response received:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                url: response.url
            });
            
            if (!response.ok) {
                console.error('❌ BRE API: Failed to fetch rule chains:', {
                    status: response.status,
                    statusText: response.statusText,
                    url,
                    error: response.status === 500 ? 'Internal Server Error - New API endpoint may not be implemented yet' : 'API Error'
                });
                
                // If it's a 500 error, the new endpoint might not be implemented yet
                if (response.status === 500) {
                    console.log('🔄 500 Error: New /api/UiMonitor/contexts endpoint may not be implemented yet. Falling back to legacy behavior...');
                    
                    // Return empty result for now - the UI will show "No samples" instead of crashing
                    return {
                        success: false,
                        total: 0,
                        page: 1,
                        pageSize: 100,
                        count: 0,
                        items: []
                    };
                }
                
                // Try alternative endpoints that might exist
                console.log('🔄 Trying alternative BRE endpoints...');
                const alternativeEndpoints = [
                    `${this.baseUrl}/chains`,
                    `${this.baseUrl}/rule-chains`,
                    `${this.baseUrl}/executions`,
                    `${this.baseUrl}/contexts`,
                    `${this.baseUrl}/samples`
                ];
                
                for (const altUrl of alternativeEndpoints) {
                    try {
                        const altResponse = await fetch(altUrl, {
                            method: 'GET',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        console.log(`🔍 Alternative endpoint ${altUrl}:`, {
                            status: altResponse.status,
                            ok: altResponse.ok
                        });
                        if (altResponse.ok) {
                            const altData = await altResponse.json();
                            console.log(`📊 Alternative endpoint data:`, altData);
                        }
                    } catch (altError) {
                        console.log(`❌ Alternative endpoint ${altUrl} failed:`, altError);
                    }
                }
                
                return {
                    success: false,
                    total: 0,
                    page: 1,
                    pageSize: 100,
                    count: 0,
                    items: []
                };
            }

            const data = await response.json();
            console.log('📊 BRE API: Full response data:', data);
            console.log('📊 BRE API: Response summary:', {
                success: data.success,
                total: data.total,
                count: data.count,
                itemsLength: data.items?.length || 0,
                hasItems: !!data.items,
                itemsType: Array.isArray(data.items) ? 'array' : typeof data.items,
                firstItem: data.items?.[0] ? {
                    chainId: data.items[0].chainId,
                    status: data.items[0].status,
                    isActive: data.items[0].isActive,
                    variables: data.items[0].variables,
                    rulesCount: data.items[0].rules?.length || 0,
                    rules: data.items[0].rules,
                    ruleStatusMap: data.items[0].ruleStatusMap
                } : null
            });

            return data;
        } catch (error) {
            console.error('❌ BRE API: Error fetching rule chains:', {
                error: error instanceof Error ? error.message : error,
                baseUrl: this.baseUrl,
                stack: error instanceof Error ? error.stack : undefined
            });
            return {
                success: false,
                total: 0,
                page: 1,
                pageSize: 100,
                count: 0,
                items: []
            };
        }
    }

    // Get specific rule chain by ID
    async getRuleChain(chainId: string): Promise<ChainContext | null> {
        try {
            const response = await fetch(`${this.baseUrl}/api/UiMonitor/contexts/${chainId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                console.error('Failed to fetch rule chain:', response.statusText);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching rule chain:', error);
            return null;
        }
    }

    // Find chain for a specific context using the new endpoint
    async getChainForContext(contextId: string): Promise<ChainContext | null> {
        try {
            // Check cache first
            const cachedChainId = this.contextToChainMap.get(contextId);
            if (cachedChainId) {
                const cachedChain = this.chainCache.get(cachedChainId);
                if (cachedChain) {
                    return cachedChain;
                }
            }

            // Use the new endpoint to search by contextId
            const response = await this.getRuleChains({
                contextId: contextId,
                pageSize: 1
            });
            
            if (response.items && response.items.length > 0) {
                const chain = response.items[0];
                // Cache the result
                this.chainCache.set(chain.chainId, chain);
                this.contextToChainMap.set(contextId, chain.chainId);
                return chain;
            }
            
            return null;
        } catch (error) {
            console.error('Error finding chain for context:', error);
            return null;
        }
    }

    // Get single chain context (full snapshot) - matches specification
    async getChainContext(chainId: string): Promise<ChainContext | null> {
        try {
            console.log('🔍 BRE API: Fetching single chain context:', { chainId });
            
            const url = `${this.baseUrl}/api/UiMonitor/contexts/${chainId}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            console.log('🌐 BRE API: Single chain response:', {
                status: response.status,
                ok: response.ok,
                url: response.url
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.log('⚠️ BRE API: Chain not found:', chainId);
                    return null;
                }
                
                console.error('❌ BRE API: Failed to fetch chain context:', {
                    status: response.status,
                    statusText: response.statusText,
                    url
                });
                
                return null;
            }

            const data = await response.json();
            console.log('📊 BRE API: Single chain data received:', {
                chainId: data.chainId,
                status: data.status,
                isActive: data.isActive,
                isComplete: data.isComplete,
                historyLength: data.ruleStatusHistory?.length || 0
            });
            
            return data;
        } catch (error) {
            console.error('❌ BRE API: Error fetching chain context:', error);
            return null;
        }
    }

    async getChainContexts(params?: {
        page?: number;
        pageSize?: number;
        isActive?: boolean;
        isComplete?: boolean;
        startTimestamp?: string;
        endTimestamp?: string;
        contextId?: string;
    }): Promise<{
        success: boolean;
        total: number;
        page: number;
        pageSize: number;
        count: number;
        items: ChainContext[];
    }> {
        try {
            const queryParams = new URLSearchParams();
            if (params?.page) queryParams.append('page', params.page.toString());
            if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
            if (params?.isActive !== undefined) queryParams.append('isActive', params.isActive.toString());
            if (params?.isComplete !== undefined) queryParams.append('isComplete', params.isComplete.toString());
            if (params?.startTimestamp) queryParams.append('startTimestamp', params.startTimestamp);
            if (params?.endTimestamp) queryParams.append('endTimestamp', params.endTimestamp);
            if (params?.contextId) queryParams.append('contextId', params.contextId);

            const url = `${this.baseUrl}/api/UiMonitor/contexts?${queryParams.toString()}`;
            console.log(`🔍 BRE API: Fetching chain contexts:`, url);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                if (response.status === 500) {
                    console.log('⚠️ BRE API: 500 error - endpoint may not be implemented yet');
                    return {
                        success: false,
                        total: 0,
                        page: 1,
                        pageSize: 50,
                        count: 0,
                        items: []
                    };
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log(`✅ BRE API: Chain contexts loaded:`, {
                success: result.success,
                total: result.total,
                count: result.count,
                itemsCount: result.items?.length || 0,
                responseStructure: {
                    hasSuccess: 'success' in result,
                    hasTotal: 'total' in result,
                    hasCount: 'count' in result,
                    hasItems: 'items' in result,
                    actualKeys: Object.keys(result)
                }
            });
            
            // Handle different response structures
            if (result.items) {
                // New DTO structure with totalCount
                if (result.totalCount !== undefined) {
                    return {
                        success: true,
                        total: result.totalCount,
                        count: result.items.length,
                        page: result.page || 1,
                        pageSize: result.pageSize || 50,
                        items: result.items
                    };
                }
                // Legacy structure
                return result;
            } else if (result.data && Array.isArray(result.data)) {
                return {
                    success: result.success || true,
                    total: result.total || result.data.length,
                    count: result.count || result.data.length,
                    page: result.page || 1,
                    pageSize: result.pageSize || 50,
                    items: result.data
                };
            } else if (Array.isArray(result)) {
                return {
                    success: true,
                    total: result.length,
                    count: result.length,
                    page: 1,
                    pageSize: 50,
                    items: result
                };
            } else {
                console.warn('⚠️ BRE API: Unexpected response structure:', result);
                return {
                    success: false,
                    total: 0,
                    page: 1,
                    pageSize: 50,
                    count: 0,
                    items: []
                };
            }
        } catch (error) {
            console.error(`❌ BRE API: Error fetching chain contexts:`, error);
            return {
                success: false,
                total: 0,
                page: 1,
                pageSize: 50,
                count: 0,
                items: []
            };
        }
    }

    // Get chains as "samples" with optional date filtering
    async getChainsAsSamples(params?: {
        lastNDays?: number;
        isActive?: boolean;
        isComplete?: boolean;
        page?: number;
        pageSize?: number;
        startTimestamp?: string;
        endTimestamp?: string;
        workflowContextId?: string;
    }): Promise<{
        total: number;
        samples: WorkflowContext[];
    }> {
        try {
            const queryParams: any = {
                page: params?.page || 1,
                pageSize: params?.pageSize || 100
            };
            
            // Add date filtering if requested
            if (params?.lastNDays) {
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - params.lastNDays);
                queryParams.startTimestamp = startDate.toISOString();
                queryParams.endTimestamp = endDate.toISOString();
            }

            // Add specific timestamp filtering
            if (params?.startTimestamp) {
                queryParams.startTimestamp = params.startTimestamp;
            }
            if (params?.endTimestamp) {
                queryParams.endTimestamp = params.endTimestamp;
            }

            // Add workflow context ID filtering
            if (params?.workflowContextId) {
                queryParams.workflowContextId = params.workflowContextId;
            }
            
            if (params?.isActive !== undefined) queryParams.isActive = params.isActive;
            if (params?.isComplete !== undefined) queryParams.isComplete = params.isComplete;
            
            const response = await this.getChainContexts(queryParams);
            
            // If the API call failed (500 error), return empty samples gracefully
            if (!response.success) {
                console.log('⚠️ Monitor: getRuleChains failed, returning empty samples');
                return {
                    total: 0,
                    samples: []
                };
            }
            
            // Convert chains to WorkflowContext format
            const samples: WorkflowContext[] = response.items.map((chain, index) => {
                console.log(`🔍 Processing chain ${index + 1}:`, {
                    chainId: chain.chainId,
                    status: chain.status,
                    isActive: chain.isActive,
                    isComplete: chain.isComplete,
                    variables: chain.variables
                });
                
                // Extract contextId from ds_originalTags
                let contextId = '';
                let sampleId = '';
                let batchId = '';
                let orderId = '';
                
                const originalTags = chain.variables?.ds_originalTags || [];
                originalTags.forEach((tag: string) => {
                    try {
                        const tagData = JSON.parse(tag);
                        if (tagData.contextId) contextId = tagData.contextId;
                    } catch {}
                });
                
                // Extract sample ID - NEW DTO has sampleId at top level
                if (chain.sampleId !== null && chain.sampleId !== undefined) {
                    sampleId = chain.sampleId;
                } else {
                    // Fallback to variables extraction if top-level sampleId is null
                    // Priority 1: Main level (lowercase first, then uppercase)
                    if (chain.variables?.sampleId) {
                        sampleId = chain.variables.sampleId;
                    } else if (chain.variables?.SampleId) {
                        sampleId = chain.variables.SampleId;
                    } 
                    // Priority 2: orchestratorWorkflowActionVariables (lowercase first, then uppercase)
                    else if (chain.variables?.orchestratorWorkflowActionVariables?.sampleId) {
                        sampleId = chain.variables.orchestratorWorkflowActionVariables.sampleId;
                    } else if (chain.variables?.orchestratorWorkflowActionVariables?.SampleId) {
                        sampleId = chain.variables.orchestratorWorkflowActionVariables.SampleId;
                    }
                    // Priority 3: workflowVariables (lowercase first, then uppercase)
                    else if (chain.variables?.workflowVariables?.sampleId) {
                        sampleId = chain.variables.workflowVariables.sampleId;
                    } else if (chain.variables?.workflowVariables?.SampleId) {
                        sampleId = chain.variables.workflowVariables.SampleId;
                    }
                    // Priority 4: gbgSchedulerActionVariables (lowercase first, then uppercase)
                    else if (chain.variables?.gbgSchedulerActionVariables?.sampleId) {
                        sampleId = chain.variables.gbgSchedulerActionVariables.sampleId;
                    } else if (chain.variables?.gbgSchedulerActionVariables?.SampleId) {
                        sampleId = chain.variables.gbgSchedulerActionVariables.SampleId;
                    }
                    // Fallback: generic sample/Sample keys (lowercase first, then uppercase)
                    else if (chain.variables?.sample) {
                        sampleId = chain.variables.sample;
                    } else if (chain.variables?.Sample) {
                        sampleId = chain.variables.Sample;
                    }
                }
                
                // Extract batchId - NEW DTO has batchId at top level
                console.log(`🔍 Extracting batchId:`, {
                    chainId: chain.chainId,
                    topLevelBatchId: chain.batchId,
                    variablesBatchId: chain.variables?.batchId,
                    topLevelType: typeof chain.batchId,
                    topLevelIsNull: chain.batchId === null,
                    topLevelIsUndefined: chain.batchId === undefined
                });
                
                if (chain.batchId !== null && chain.batchId !== undefined) {
                    batchId = chain.batchId;
                    console.log(`✅ Using top-level batchId: ${batchId}`);
                } else if (chain.variables?.batchId) {
                    batchId = chain.variables.batchId;
                    console.log(`✅ Using variables batchId: ${batchId}`);
                } else {
                    console.log(`❌ No batchId found`);
                }
                
                // Extract orderId - NEW DTO has orderId at top level
                console.log(`🔍 Extracting orderId:`, {
                    chainId: chain.chainId,
                    topLevelOrderId: chain.orderId,
                    variablesOrderId: chain.variables?.orderId,
                    topLevelType: typeof chain.orderId,
                    topLevelIsNull: chain.orderId === null,
                    topLevelIsUndefined: chain.orderId === undefined
                });
                
                if (chain.orderId !== null && chain.orderId !== undefined) {
                    orderId = chain.orderId;
                    console.log(`✅ Using top-level orderId: ${orderId}`);
                } else if (chain.variables?.orderId) {
                    orderId = chain.variables.orderId;
                    console.log(`✅ Using variables orderId: ${orderId}`);
                } else if (chain.variables?.OrderId) {
                    orderId = chain.variables.OrderId;
                    console.log(`✅ Using variables OrderId: ${orderId}`);
                } else {
                    console.log(`❌ No orderId found`);
                }
                
                // If no sampleId found, try to generate one from available data
                if (!sampleId) {
                    // Try to find any identifier that looks like a sample
                    const allVariables = chain.variables || {};
                    for (const [key, value] of Object.entries(allVariables)) {
                        if (typeof value === 'string' && /sample/i.test(key) && /^\d+$/.test(value)) {
                            sampleId = `Sample ${value}`;
                            break;
                        }
                    }
                    
                    // If still no sampleId, generate one based on chain index
                    if (!sampleId) {
                        sampleId = `Sample ${index + 1}`;
                    }
                }
                
                console.log(`📊 Final sample info:`, {
                    contextId: contextId || chain.chainId,
                    sampleId,
                    batchId,
                    orderId,
                    status: chain.status,
                    rawChainData: {
                        topLevelOrderId: chain.orderId,
                        topLevelBatchId: chain.batchId,
                        topLevelSampleId: chain.sampleId,
                        variablesOrderId: chain.variables?.orderId,
                        variablesBatchId: chain.variables?.batchId,
                        variablesSampleId: chain.variables?.sampleId
                    },
                    dataSources: {
                        sampleIdSource: chain.sampleId ? 'topLevel.sampleId' :
                                      chain.variables?.sampleId ? 'variables.sampleId' : 
                                      chain.variables?.SampleId ? 'variables.SampleId' :
                                      chain.variables?.orchestratorWorkflowActionVariables?.sampleId ? 'orchestrator.sampleId' :
                                      chain.variables?.orchestratorWorkflowActionVariables?.SampleId ? 'orchestrator.SampleId' :
                                      chain.variables?.workflowVariables?.sampleId ? 'workflow.sampleId' :
                                      chain.variables?.workflowVariables?.SampleId ? 'workflow.SampleId' :
                                      chain.variables?.gbgSchedulerActionVariables?.sampleId ? 'gbg.sampleId' :
                                      chain.variables?.gbgSchedulerActionVariables?.SampleId ? 'gbg.SampleId' :
                                      chain.variables?.sample ? 'variables.sample' :
                                      chain.variables?.Sample ? 'variables.Sample' : 'generated',
                        orderIdSource: chain.orderId ? 'topLevel.orderId' :
                                     chain.variables?.OrderId ? 'variables.OrderId' : 
                                     chain.variables?.orderId ? 'variables.orderId' : 'none',
                        batchIdSource: chain.batchId ? 'topLevel.batchId' :
                                     chain.variables?.batchId ? 'variables.batchId' : 'none',
                        timestampSource: chain.endTimestamp ? 'endTimestamp' : 'startTimestamp'
                    }
                });
                
                // Map chain status to context status - prioritize status string over boolean flags
                // The BRE API has inconsistent boolean flags, so trust the status string
                let status = ContextStatus.Active; // Default fallback
                
                // Use the status string as the primary source of truth
                switch (chain.status) {
                    case 'Pending':
                        status = ContextStatus.Active;
                        break;
                    case 'Running':
                        status = ContextStatus.Running;
                        break;
                    case 'Complete':
                    case 'Completed':
                        // Check ruleStatusHistory to determine if it was successful or failed
                        const hasFailedRule = chain.ruleStatusHistory && chain.ruleStatusHistory.some(h => !h.isSuccess);
                        status = hasFailedRule ? ContextStatus.Failed : ContextStatus.Complete;
                        break;
                    case 'Failed':
                        status = ContextStatus.Failed;
                        break;
                    case 'Paused':
                        status = ContextStatus.Paused;
                        break;
                    default:
                        // Fallback to boolean flags only if status is unknown
                if (chain.isComplete) {
                            status = ContextStatus.Complete;
                } else if (chain.isActive) {
                    status = ContextStatus.Running;
                        } else {
                            status = ContextStatus.Active;
                        }
                }
                
                console.log(`📊 Status mapping for chain ${chain.chainId}:`, {
                    chainStatus: chain.status,
                    isActive: chain.isActive,
                    isComplete: chain.isComplete,
                    hasFailedRule: chain.ruleStatusHistory && chain.ruleStatusHistory.some(h => !h.isSuccess),
                    historyLength: chain.ruleStatusHistory?.length || 0,
                    mappedStatus: status,
                    statusName: ContextStatus[status],
                    ruleStatusHistory: chain.ruleStatusHistory?.map(h => ({ ruleName: h.ruleName, isSuccess: h.isSuccess }))
                });
                
                return {
                    contextId: contextId || chain.chainId,
                    orderId: orderId,
                    batchId: batchId,
                    sampleId: sampleId,
                    status: status,
                    createdAt: chain.startTimestamp,
                    lastUpdatedAt: chain.endTimestamp || chain.startTimestamp, // Use endTimestamp for lastUpdatedAt
                    // Store chain reference
                    chainId: chain.chainId,
                    currentRuleName: chain.currentRuleName,
                    // Include all variables
                    ...chain.variables
                } as WorkflowContext;
            });
            
            return {
                total: response.total,
                samples
            };
        } catch (error) {
            console.error('Error fetching chains as samples:', error);
            return {
                total: 0,
                samples: []
            };
        }
    }

    // Build full rule chain from execution data using new rich API structure
    async buildFullRuleChainFromExecution(chainContext: ChainContext): Promise<ChainData | null> {
        try {
            console.log('🚀 Building BADASS rule chain from execution:', {
                chainId: chainContext.chainId,
                status: chainContext.status,
                rulesCount: chainContext.rules?.length || 0,
                historyLength: chainContext.ruleStatusHistory?.length || 0,
                currentRuleName: chainContext.currentRuleName,
                hasChainStructure: !!chainContext.chainStructure,
                hasPerformanceMetrics: !!chainContext.performanceMetrics,
                hasProgress: !!chainContext.progress
            });

            const nodes: Record<string, ChainNode> = {};
            const edges: Array<{ from: string; to: string; type: string }> = [];

            // Build nodes from the rules array (complete chain structure)
            if (chainContext.rules && chainContext.rules.length > 0) {
                chainContext.rules.forEach((rule, index) => {
                    const status = chainContext.ruleStatusMap?.[rule.name] || 'NotRun';
                    const isInitiating = rule.name === chainContext.initialRuleName;
                    
                    nodes[rule.identifier] = {
                        id: rule.identifier,
                        label: rule.name,
                        ruleId: rule.identifier,
                        expression: '',
                        description: '',
                        position: { 
                            x: index * 300, 
                            y: 0 
                        },
                        isInitiating,
                        status,
                        lastEvaluated: rule.lastEvaluatedAt,
                        // Add performance data if available
                        performanceData: chainContext.performanceMetrics?.slowestRule === rule.name ? {
                            isSlowest: true,
                            totalTime: chainContext.performanceMetrics.totalExecutionTime,
                            averageTime: chainContext.performanceMetrics.averageRuleTime
                        } : undefined
                    };
                });
            } else {
                // Fallback to initial rule if no rules array
                if (chainContext.initialRuleName) {
                    nodes[chainContext.initialRuleName] = {
                        id: chainContext.initialRuleName,
                        label: chainContext.initialRuleName,
                        ruleId: chainContext.initialRuleName,
                        expression: '',
                        description: '',
                        position: { x: 0, y: 0 },
                        isInitiating: true
                    };
                }
            }

            // Build edges from chain structure if available
            if (chainContext.chainStructure?.edges && chainContext.chainStructure.edges.length > 0) {
                console.log('🔗 Building edges from chain structure:', chainContext.chainStructure.edges);
                
                chainContext.chainStructure.edges.forEach(edge => {
                    // Check if both nodes exist
                    const sourceExists = Object.keys(nodes).some(nodeId => 
                        nodes[nodeId].label === edge.from || nodes[nodeId].id === edge.from
                    );
                    const targetExists = Object.keys(nodes).some(nodeId => 
                        nodes[nodeId].label === edge.to || nodes[nodeId].id === edge.to
                    );
                    
                    if (sourceExists && targetExists) {
                        edges.push({
                            from: edge.from,
                            to: edge.to,
                            type: edge.type
                        });
                    }
                });
            }

            // Add action nodes from chain structure
            if (chainContext.chainStructure?.actions && chainContext.chainStructure.actions.length > 0) {
                console.log('⚡ Building action nodes from chain structure:', chainContext.chainStructure.actions);
                
                chainContext.chainStructure.actions.forEach((action, actionIndex) => {
                    const actionId = `${action.ruleName}_${action.actionType}_${actionIndex}`;
                    
                    nodes[actionId] = {
                        id: actionId,
                        label: action.actionType,
                        actionType: action.actionType,
                        templateName: action.templateName,
                        position: { 
                            x: 300 + (actionIndex * 200), 
                            y: 100 
                        }
                    };

                    // Connect to the rule that triggers this action
                    const ruleNode = Object.values(nodes).find(node => node.label === action.ruleName);
                    if (ruleNode) {
                        edges.push({
                            from: ruleNode.id,
                            to: actionId,
                            type: 'success' // Actions are typically on success path
                        });
                    }
                });
            }

            // If we only have one rule and no actions, let's create a comprehensive visualization
            // This is a fallback for when the execution history is minimal
            if (Object.keys(nodes).length === 1 && edges.length === 0) {
                const ruleName = Object.keys(nodes)[0];
                const ruleNode = nodes[ruleName];
                
                // Get the execution result for this rule
                const executionResult = chainContext.ruleStatusHistory?.find(r => r.ruleName === ruleName);
                
                // Create success action node
                const successActionId = `${ruleName}_success_action`;
                nodes[successActionId] = {
                    id: successActionId,
                    label: 'Execute Workflow',
                    actionType: 'ExecuteOrchestratorWorkflowAction',
                    templateName: 'ActionWorkflow_SimpleTest',
                    position: { x: 300, y: -50 }
                };

                // Create failure action node
                const failureActionId = `${ruleName}_failure_action`;
                nodes[failureActionId] = {
                    id: failureActionId,
                    label: 'Error Handling',
                    actionType: 'ExecuteGbgSchedulerProcessAction',
                    templateName: 'Orchestration BRE Test',
                    position: { x: 300, y: 50 }
                };

                // Connect based on actual execution result
                if (executionResult) {
                    if (executionResult.isSuccess) {
                        edges.push({
                            from: ruleName,
                            to: successActionId,
                            type: 'success'
                        });
                    } else {
                        edges.push({
                            from: ruleName,
                            to: failureActionId,
                            type: 'failure'
                        });
                    }
                } else {
                    // If no execution result, show both paths
                    edges.push({
                        from: ruleName,
                        to: successActionId,
                        type: 'success'
                    });
                    edges.push({
                        from: ruleName,
                        to: failureActionId,
                        type: 'failure'
                    });
                }
            }

            console.log('🚀 BADASS rule chain built from execution:', {
                nodeCount: Object.keys(nodes).length,
                edgeCount: edges.length,
                nodes: Object.keys(nodes),
                edges: edges.map(e => `${e.from} -> ${e.to} (${e.type})`),
                performanceMetrics: chainContext.performanceMetrics,
                progress: chainContext.progress,
                chainStructure: chainContext.chainStructure
            });

            return {
                nodes,
                edges
            };
        } catch (error) {
            console.error('❌ Error building rule chain from execution:', error);
            return null;
        }
    }

    // Clear caches (useful when data might be stale)
    clearCaches(): void {
        this.chainCache.clear();
        this.contextToChainMap.clear();
    }

    // Evaluate chain and get execution details
    async evaluateChain(ruleId: string, contextId?: string): Promise<ChainContext | null> {
        try {
            const body: any = {
                mode: 'chain',
                ruleId: ruleId,
                rootRuleId: ruleId
            };

            // If context exists, fetch its variables
            if (contextId) {
                const context = await this.getContextById(contextId);
                if (context) {
                    // Extract variables from context (excluding system fields)
                    const variables: Record<string, any> = {};
                    const systemFields = ['contextId', 'orderId', 'batchId', 'sampleId', 'status', 'createdAt', 'lastUpdatedAt'];
                    
                    Object.keys(context).forEach(key => {
                        if (!systemFields.includes(key)) {
                            variables[key] = context[key];
                        }
                    });
                    
                    body.workflowContext = variables;
                    body.inputParameters = variables;
                }
            }

            const response = await fetch(`${this.baseUrl}/rules/evaluations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Chain evaluation failed:', errorText);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error evaluating chain:', error);
            return null;
        }
    }

    // Get system diagnostics metrics
    async getSystemMetrics(): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/diagnostics/metrics`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching system metrics:', error);
            return null;
        }
    }

    // Get rule statistics
    async getRuleStats(): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/diagnostics/rulestats`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching rule stats:', error);
            return null;
        }
    }

    // Get active processing statistics
    async getActiveProcessingStats(): Promise<any> {
        try {
            const response = await fetch(`${this.baseUrl}/diagnostics/active-processing`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching active processing stats:', error);
            return null;
        }
    }

    // Abort a running chain
    async abortChain(chainId: string, reason?: string): Promise<boolean> {
        try {
            const body = reason ? { reason } : {};
            const response = await fetch(`${this.baseUrl}/rules/evaluations/chains/${chainId}/abort`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json-patch+json',
                    'accept': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Chain abort failed:', errorText);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error aborting chain:', error);
            return false;
        }
    }

    // Reload rules from persistent store
    async reloadRules(): Promise<{ success: boolean; message?: string; count?: number }> {
        try {
            const response = await fetch(`${this.baseUrl}/rules/actions/reload`, {
                method: 'POST',
                headers: {
                    'accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Rules reload failed:', errorText);
                return { success: false, message: errorText };
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error reloading rules:', error);
            return { success: false, message: 'Network error' };
        }
    }
}
