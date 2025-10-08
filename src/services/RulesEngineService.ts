// RulesEngineService.ts - Service layer for Rules Engine API integration

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

// From ChainContext in API
export interface ChainContext {
    chainId: string;
    workflowContextId?: string;
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
    history: RuleResult[];
    rulesetVersionId?: string;
}

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
            return `Sample ${context.sampleId}`;
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

    // Get paginated rule chains with filtering
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
            
            const url = `${this.baseUrl}/contexts/rulechains?${queryParams}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.error('Failed to fetch rule chains:', response.statusText);
                return {
                    success: false,
                    total: 0,
                    page: 1,
                    pageSize: 100,
                    count: 0,
                    items: []
                };
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching rule chains:', error);
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
            const response = await fetch(`${this.baseUrl}/contexts/rulechains/${chainId}`, {
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

    // Get chains as "samples" with optional date filtering
    async getChainsAsSamples(params?: {
        lastNDays?: number;
        isActive?: boolean;
        isComplete?: boolean;
        page?: number;
        pageSize?: number;
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
            
            if (params?.isActive !== undefined) queryParams.isActive = params.isActive;
            if (params?.isComplete !== undefined) queryParams.isComplete = params.isComplete;
            
            const response = await this.getRuleChains(queryParams);
            
            // Convert chains to WorkflowContext format
            const samples: WorkflowContext[] = response.items.map(chain => {
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
                
                // Extract sample info from variables
                if (chain.variables?.orchestratorWorkflowActionVariables?.sampleId) {
                    sampleId = chain.variables.orchestratorWorkflowActionVariables.sampleId;
                }
                if (chain.variables?.batchId) batchId = chain.variables.batchId;
                if (chain.variables?.OrderId || chain.variables?.orderId) {
                    orderId = chain.variables.OrderId || chain.variables.orderId;
                }
                
                // Map chain status to context status
                let status = ContextStatus.Active;
                if (chain.isComplete) {
                    status = chain.status === 'Failed' ? ContextStatus.Failed : ContextStatus.Complete;
                } else if (chain.isActive) {
                    status = ContextStatus.Running;
                }
                
                return {
                    contextId: contextId || chain.chainId,
                    orderId: orderId,
                    batchId: batchId,
                    sampleId: sampleId,
                    status: status,
                    createdAt: chain.startTimestamp,
                    lastUpdatedAt: chain.endTimestamp || chain.startTimestamp,
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

    // Extract meaningful variables from context
    extractVariables(context: WorkflowContext): Record<string, any> {
        const systemFields = ['contextId', 'orderId', 'batchId', 'sampleId', 'status', 'createdAt', 'lastUpdatedAt'];
        const variables: Record<string, any> = {};
        
        Object.keys(context).forEach(key => {
            if (!systemFields.includes(key)) {
                variables[key] = context[key];
            }
        });
        
        return variables;
    }

    // Get display name for context
    getContextDisplayName(context: WorkflowContext): string {
        if (context.sampleId) return `Sample ${context.sampleId}`;
        if (context.batchId) return `Batch ${context.batchId}`;
        if (context.orderId) return `Order ${context.orderId}`;
        return `Context ${context.contextId.substring(0, 8)}`;
    }

    // Format status with color
    getStatusInfo(status: ContextStatus): { label: string; color: string; icon: string } {
        switch (status) {
            case ContextStatus.Active:
                return { label: 'Active', color: 'text-blue-500', icon: 'circle' };
            case ContextStatus.Running:
                return { label: 'Running', color: 'text-yellow-500', icon: 'spinner' };
            case ContextStatus.Complete:
                return { label: 'Complete', color: 'text-green-500', icon: 'check' };
            case ContextStatus.Failed:
                return { label: 'Failed', color: 'text-red-500', icon: 'x' };
            case ContextStatus.Paused:
                return { label: 'Paused', color: 'text-gray-500', icon: 'pause' };
            default:
                return { label: 'Unknown', color: 'text-gray-400', icon: 'question' };
        }
    }

    // Format duration
    formatDuration(startTime: string, endTime?: string): string {
        const start = new Date(startTime).getTime();
        const end = endTime ? new Date(endTime).getTime() : Date.now();
        const duration = (end - start) / 1000;
        
        if (duration < 1) {
            return `${Math.round(duration * 1000)}ms`;
        } else if (duration < 60) {
            return `${duration.toFixed(1)}s`;
        } else if (duration < 3600) {
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            return `${minutes}m ${seconds}s`;
        } else {
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    // Polling support
    startPolling(callback: () => void, interval: number = 2000): void {
        this.stopPolling();
        
        const poll = async () => {
            if (this.abortController?.signal.aborted) return;
            
            try {
                await callback();
            } catch (error) {
                console.error('Polling error:', error);
            }
            
            if (!this.abortController?.signal.aborted) {
                setTimeout(poll, interval);
            }
        };
        
        this.abortController = new AbortController();
        poll();
    }

    stopPolling(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
