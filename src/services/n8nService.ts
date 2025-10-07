import n8nConverter from '../utils/n8nConverter';
import { ChainData } from '../types';

const DEFAULT_API_URL = (import.meta.env.VITE_N8N_API_URL as string) || 'http://localhost:5678/api/v1';

type N8nWorkflow = any;

const getHeaders = (apiKey?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
};

export const n8nService = (config?: { apiUrl?: string; apiKey?: string }) => {
    const apiUrl = config?.apiUrl || DEFAULT_API_URL;
    const apiKey = config?.apiKey || (import.meta.env.VITE_N8N_API_KEY as string) || undefined;

    return {
        async createWorkflow(workflowOrName: string | { name?: string } | ChainData, nodes?: any[], connections?: any) {
            // If a ChainData object was passed, convert it
            let payload: any;
            if ((workflowOrName as ChainData)?.nodes) {
                payload = n8nConverter.convertChainToWorkflow(workflowOrName as ChainData, 'Converted Workflow');
            } else if (typeof workflowOrName === 'string' && Array.isArray(nodes)) {
                payload = { name: workflowOrName, nodes: nodes || [], connections: connections || {} };
            } else if (typeof workflowOrName === 'object') {
                payload = workflowOrName;
            } else {
                throw new Error('Invalid parameters to createWorkflow');
            }

            const res = await fetch(`${apiUrl}/workflows`, {
                method: 'POST',
                headers: getHeaders(apiKey),
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`n8n createWorkflow failed: ${res.status} ${res.statusText}`);
            return res.json();
        },

        async getWorkflow(id: string) {
            const res = await fetch(`${apiUrl}/workflows/${id}`, {
                method: 'GET',
                headers: getHeaders(apiKey)
            });
            if (!res.ok) throw new Error(`n8n getWorkflow failed: ${res.status} ${res.statusText}`);
            return res.json();
        },

        async updateWorkflow(id: string, workflow: N8nWorkflow) {
            const res = await fetch(`${apiUrl}/workflows/${id}`, {
                method: 'PATCH',
                headers: getHeaders(apiKey),
                body: JSON.stringify(workflow)
            });
            if (!res.ok) throw new Error(`n8n updateWorkflow failed: ${res.status} ${res.statusText}`);
            return res.json();
        },

        async deleteWorkflow(id: string) {
            const res = await fetch(`${apiUrl}/workflows/${id}`, {
                method: 'DELETE',
                headers: getHeaders(apiKey)
            });
            if (!res.ok) throw new Error(`n8n deleteWorkflow failed: ${res.status} ${res.statusText}`);
            return res.json();
        },

        async executeWorkflow(id: string, input?: any) {
            // Execute workflow via workfows/run (n8n v2/v3 endpoints differ)
            const res = await fetch(`${apiUrl}/workflows/${id}/run`, {
                method: 'POST',
                headers: getHeaders(apiKey),
                body: JSON.stringify({ runData: input || {} })
            });
            if (!res.ok) throw new Error(`n8n executeWorkflow failed: ${res.status} ${res.statusText}`);
            return res.json();
        }
    };
};

export default n8nService();
