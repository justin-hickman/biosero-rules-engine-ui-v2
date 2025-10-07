import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue 
} from "@/components/ui/select";
import { 
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle 
} from "@/components/ui/card";
import { 
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
    FilePlus, 
    FloppyDisk, 
    CloudArrowUp, 
    Trash, 
    Plus, 
    Network, 
    CheckCircle, 
    XCircle,
    Heartbeat,
    SpinnerGap,
    Flask,
    CaretDown,
    CaretRight,
    Download,
    Sun,
    Moon
} from "@phosphor-icons/react";
import N8nIntegrationPanel from './components/N8nIntegrationPanel';
import { useKV } from '@github/spark/hooks';
import { toast } from 'sonner';
import SimpleRuleSelector from './SimpleRuleSelector';
import { isSupportedAction, getSchema, isTemplateDrivenAction } from './action-schemas';
import { useTheme } from './hooks/use-theme';

import {
    ReactFlow,
    Node,
    Edge,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Position,
    MarkerType,
    NodeTypes,
    BackgroundVariant,
    Handle,
    Connection,
    addEdge,
    useReactFlow,
    Panel,
    EdgeTypes,
    ConnectionMode,
    ConnectionLineType,
    applyNodeChanges,
    applyEdgeChanges,
    NodeChange,
    EdgeChange,
    ReactFlowProvider,
    ReactFlowInstance,
    XYPosition,
    getConnectedEdges,
    getIncomers,
    getOutgoers
} from '@xyflow/react';


// ==========================================================================
// Types and Interfaces
// ==========================================================================

type ActionType = {
    label: string;
    value: string;
    defaults: Record<string, any>;
};

type RuleProperty = {
    name: string;
    value: any;
    valueType: string;
};

type Rule = {
    id: string | null;
    name: string;
    description: string;
    typeIdentifier: string;
    properties: RuleProperty[];
};

type Action = {
    _uid: string;
    ActionType: string;
    [key: string]: any;
};

type HealthStatus = 'idle' | 'loading' | 'success' | 'error';

type ApiResponseResult = {
    status: number;
    statusText: string;
    data: any;
    rawResponse: string;
};

type ChainNode = {
    id: string;
    label: string;
    expression?: string;
    successActions?: string[];
    failureActions?: string[];
    isInitiating?: boolean;
    isError?: boolean;
    isLoopEnd?: boolean;
    // New fields for action nodes
    actionType?: string;
    templateName?: string;
    inputParameters?: Record<string, any>;
    outputParameters?: Record<string, any>;
};

type ChainData = {
    nodes: Record<string, ChainNode>;
    edges: Array<{
        from: string;
        to: string;
        type: 'success' | 'failure' | 'connection';
        label?: string;
    }>;
};

// ==========================================================================
// Constants
// ==========================================================================

const ACTION_OPTIONS: ActionType[] = [
    { 
        label: "Rule Evaluation", 
        value: "RuleEvaluationAction", 
        defaults: { 
            ActionType: "RuleEvaluationAction", 
            EvaluationType: "", 
            Topic: "", 
            RuleName: "RuleEval1", 
            Status: "Success", 
            Timestamp: new Date().toISOString(), 
            VariableMappings: {}, 
            RuleAction: "use", 
            TargetRuleId: "" 
        } 
    },
    { 
        label: "Execute Orchestrator Workflow", 
        value: "ExecuteOrchestratorWorkflowAction", 
        defaults: { 
            ActionType: "ExecuteOrchestratorWorkflowAction", 
            TemplateName: "", 
            RuleName: "Rule1", 
            Status: "Success", 
            Timestamp: "2023-05-15T10:30:00Z", 
            InputParameters: {}, 
            OutputParameters: {} 
        } 
    },
    { 
        label: "Execute GBG Scheduler Process", 
        value: "ExecuteGbgSchedulerProcessAction", 
        defaults: { 
            ActionType: "ExecuteGbgSchedulerProcessAction", 
            TemplateName: "", 
            RuleName: "Rule1", 
            Status: "Success", 
            Timestamp: "2023-05-15T10:30:00Z", 
            InputParameters: {}, 
            OutputParameters: {} 
        } 
    }
].sort((a, b) => a.label.localeCompare(b.label));

const OMITTED_ACTION_FIELDS = new Set([
    "_uid",
    "ActionType", 
    "RuleName",
    "Status",
    "Timestamp"
]);

const DEFAULT_RULE_TEMPLATE: Rule = {
    id: null,
    name: "",
    description: "",
    typeIdentifier: "Business Rule",
    properties: [
        {
            name: "RuleExpressionType",
            value: "LambdaExpression",
            valueType: "String"
        },
        {
            name: "Expression",
            value: "",
            valueType: "String"
        },
        {
            name: "ErrorMessage",
            value: "",
            valueType: "String"
        },
        {
            name: "OnSuccess",
            value: { Actions: [] },
            valueType: "String"
        },
        {
            name: "OnFailure",
            value: { Actions: [] },
            valueType: "String"
        }
    ]
};

const RULES_ENGINE_DEFAULT_URL = "http://localhost:9999";
const DATA_SERVICES_DEFAULT_URL = "http://localhost:8105";

// API Constants - Correct Data Services endpoints
const API_BASE = "/api/v3.0/identities";
const API_ORDER_TEMPLATES = "/api/v3.0/order-templates";
const DS_HEALTH_CHECK_PATH = "/api/v3.0/application-configurations/host-environment";
const RULES_ENGINE_HEALTH_CHECK_PATH = "/diagnostics/health";
const RULES_ENGINE_VALIDATE_PATH = "/rules/evaluations/validate";

// Enhanced CORS Testing Utility with multiple fallback strategies
const testCorsConnection = async (url: string, method = 'GET'): Promise<{ 
    success: boolean; 
    message: string; 
    details?: any;
    suggestions?: string[];
}> => {
    const testResults: string[] = [];
    let finalSuccess = false;
    let finalMessage = '';
    
    // Test different endpoints and approaches
    const testEndpoints = [
        `${url}/api/health`,
        `${url}/api/v3.0/application-configurations/host-environment`,
        `${url}/api/v3.0/identities`,
        url // Base URL
    ];

    for (const testEndpoint of testEndpoints) {
        try {
            testResults.push(`Testing: ${testEndpoint}`);
            
            // Try basic connectivity first
            const response = await fetch(testEndpoint, {
                method: 'HEAD', // Less intrusive than GET
                mode: 'no-cors', // Bypass CORS for connectivity test
                signal: AbortSignal.timeout(3000)
            });
            
            testResults.push(`✓ Basic connectivity: OK (no-cors mode)`);
            
            // Now try with CORS
            const corsResponse = await fetch(testEndpoint, {
                method,
                headers: { 'Accept': 'application/json' },
                mode: 'cors',
                signal: AbortSignal.timeout(5000)
            });

            if (corsResponse.ok) {
                finalSuccess = true;
                finalMessage = `CORS test successful on ${testEndpoint}: ${corsResponse.status} ${corsResponse.statusText}`;
                testResults.push(`✓ CORS test: SUCCESS ${corsResponse.status}`);
                break;
            } else {
                testResults.push(`⚠ CORS test: ${corsResponse.status} ${corsResponse.statusText}`);
            }
        } catch (error: any) {
            testResults.push(`✗ ${testEndpoint}: ${error.message}`);
            continue; // Try next endpoint
        }
    }

    if (!finalSuccess) {
        finalMessage = 'All CORS tests failed. Service may not be running or CORS is not configured.';
        
        const suggestions = [
            'Check if the Data Services API is running on port 8105',
            'Verify the URL is correct and accessible',
            'Test with curl: curl -v ' + url + '/api/health',
            'Check server logs for incoming requests',
            'For development: Consider using a CORS proxy like cors-anywhere',
            'Add these CORS headers to your server response:'
        ];

        return {
            success: false,
            message: finalMessage,
            details: { testLog: testResults },
            suggestions
        };
    }

    return {
        success: true,
        message: finalMessage,
        details: { testLog: testResults }
    };
};

// Simple CORS proxy for development (client-side workaround)
const tryWithCorsProxy = async (url: string, originalFetch: () => Promise<Response>): Promise<Response> => {
    // List of public CORS proxies (use with caution in production)
    const corsProxies = [
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
    ];
    
    // First try the original request
    try {
        return await originalFetch();
    } catch (originalError: any) {
        // If it's a CORS error, try with proxy
        if (originalError.message?.includes('CORS') || originalError.message?.includes('Failed to fetch')) {
            for (const proxy of corsProxies) {
                try {
                    const proxyUrl = proxy + encodeURIComponent(url);
                    const response = await fetch(proxyUrl, {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(10000)
                    });
                    
                    if (response.ok) {
                        console.log(`Successfully used CORS proxy: ${proxy}`);
                        return response;
                    }
                } catch (proxyError) {
                    console.log(`CORS proxy failed: ${proxy}`, proxyError);
                    continue;
                }
            }
        }
        
        // If all proxies fail, throw original error
        throw originalError;
    }
};

// ==========================================================================
// API Service Functions
// ==========================================================================

const handleApiResponse = async (response: Response, operationDesc: string): Promise<ApiResponseResult> => {
    const responseText = await response.text();
    let responseData: any = null;
    
    try {
        responseData = responseText ? JSON.parse(responseText) : null;
    } catch {
        // Ignore JSON parse errors
    }
    
    if (!response.ok) {
        let errorMessage = `${operationDesc} failed (${response.status} ${response.statusText})`;
        if (responseData?.message) errorMessage += `: ${responseData.message}`;
        else if (responseData?.title) errorMessage += `: ${responseData.title}`;
        else if (responseText && response.headers.get('content-type')?.includes('text')) {
            errorMessage += `: ${responseText.substring(0, 200)}`;
        }
        
        const error = new Error(errorMessage) as any;
        error.status = response.status;
        error.responseText = responseText;
        error.responseData = responseData;
        throw error;
    }
    
    return {
        status: response.status,
        statusText: response.statusText,
        data: responseData,
        rawResponse: responseText
    };
};

export const apiFetchRules = async (dataServicesRootURI: string, useProxy = false): Promise<any[]> => {
    if (!dataServicesRootURI) throw new Error("Data Services Root URI required.");
    
    const typeIdentifier = encodeURIComponent("Business Rule");
    const endpoint = `${dataServicesRootURI}${API_BASE}?typeIdentifier=${typeIdentifier}`;
    
    const makeRequest = async (): Promise<Response> => {
        // Try with different CORS configurations
        try {
            return await fetch(endpoint, {
                method: 'GET',
                headers: { 
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                mode: 'cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(15000)
            });
        } catch (corsError: any) {
            // If CORS fails, try without Content-Type header (for simple requests)
            if (corsError.message?.includes('CORS') || corsError.message?.includes('Failed to fetch')) {
                return await fetch(endpoint, {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json'
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(15000)
                });
            } else {
                throw corsError;
            }
        }
    };
    
    try {
        let response: Response;
        
        if (useProxy) {
            response = await tryWithCorsProxy(endpoint, makeRequest);
        } else {
            response = await makeRequest();
        }
        
        const result = await handleApiResponse(response, 'Fetch rules list');
        const rulesArray = Array.isArray(result.data) ? result.data : (result.data?.items || result.data?.results || []);
        
        // Debug logging to help troubleshoot rule loading issues
        console.log(`API returned ${rulesArray.length} rules total`);
        const businessRules = rulesArray.filter(r => r?.typeIdentifier === "Business Rule");
        console.log(`Found ${businessRules.length} Business Rule type rules`);
        if (rulesArray.length > 0 && businessRules.length === 0) {
            console.warn("No Business Rule templates found. Available rule types:", 
                [...new Set(rulesArray.map(r => r?.typeIdentifier).filter(Boolean))]);
        }
        
        return rulesArray;
    } catch (error: any) {
        // Enhanced error messages for common issues
        if (error.name === 'TimeoutError') {
            error.message = `Request timeout: ${endpoint} did not respond within 15 seconds.

This could indicate:
• Service is not running on port 8105
• Network connectivity issues
• Server is overloaded

Quick tests to run:
1. Check if service is running: netstat -an | grep :8105
2. Test connectivity: telnet localhost 8105
3. Test endpoint: curl -v "${endpoint}"
4. Check firewall settings`;
            
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            error.message = `Network error: Could not connect to ${dataServicesRootURI}. Check URL/port/service/CORS.

Troubleshooting steps:
• Verify Data Services is running on port 8105: lsof -i :8105
• Test basic connectivity: curl -v "${dataServicesRootURI}/api/health" 
• Check if the service process is active: ps aux | grep data-services
• Verify firewall/network settings allow port 8105
• Test the exact endpoint: curl -v "${endpoint}"

Required CORS headers for Data Services API:
  Access-Control-Allow-Origin: * (or your domain)
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Accept, Authorization

Server configuration examples:

Express.js:
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

ASP.NET Core:
  services.AddCors(options => {
    options.AddDefaultPolicy(builder => {
      builder.AllowAnyOrigin()
             .AllowAnyMethod()
             .AllowAnyHeader();
    });
  });

🔍 Troubleshooting Steps:
1. Verify service is running: curl -I ${dataServicesRootURI}/api/health
2. Check server logs for incoming requests
3. Test from server: curl localhost:8105/api/health
4. Verify port is accessible: nc -zv localhost 8105
5. Check if process is listening: lsof -i :8105

💡 Development Workarounds:
• Use browser with disabled security: --disable-web-security --user-data-dir=/tmp/chrome
• Use CORS browser extension (temporary solution)
• Set up a local proxy server
• Use tools like nginx or Apache as a reverse proxy`;
            
        } else if (error.message?.includes('CORS policy')) {
            error.message = `CORS Policy Error: ${dataServicesRootURI} is blocking requests.

The server is receiving your request but rejecting it due to CORS policy.

✅ Server is running and accessible
❌ CORS headers are missing or misconfigured

Required server configuration:
1. Handle OPTIONS preflight requests
2. Return proper CORS headers for GET method
3. Allow Content-Type: application/json header

Test with curl to verify server response:
curl -v -H "Accept: application/json" \\
     -H "Origin: ${window.location.origin}" \\
     "${endpoint}"

Look for these headers in response:
- Access-Control-Allow-Origin: *
- Access-Control-Allow-Methods: GET, ...
- Access-Control-Allow-Headers: Content-Type, Accept`;
        }
        
        // Add retry suggestion for CORS errors
        if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
            error.retryWithProxy = true;
        }
        
        throw error;
    }
};

export const apiFetchRuleDetails = async (dataServicesRootURI: string, ruleId: string): Promise<any> => {
    if (!dataServicesRootURI || !ruleId) throw new Error("Data Services Root URI and Rule ID required.");
    
    const endpoint = `${dataServicesRootURI}${API_BASE}/${ruleId}`;
    
    try {
        // Try with different CORS configurations
        let response: Response;
        
        try {
            response = await fetch(endpoint, {
                method: 'GET',
                headers: { 
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                mode: 'cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(15000)
            });
        } catch (corsError: any) {
            // Retry without Content-Type for simple requests
            if (corsError.message?.includes('CORS') || corsError.message?.includes('Failed to fetch')) {
                response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json'
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(15000)
                });
            } else {
                throw corsError;
            }
        }
        
        const result = await handleApiResponse(response, `Fetch rule details for ${ruleId}`);
        return result.data;
    } catch (error: any) {
        // Enhance error messages
        if (error.name === 'TimeoutError') {
            error.message = `Request timeout: Could not fetch rule ${ruleId} within 15 seconds.`;
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            error.message = `Network error: Could not connect to ${dataServicesRootURI}. Check URL/port/service/CORS.

Endpoint attempted: ${endpoint}

Troubleshooting:
• Verify Data Services is running on the specified port
• Test connectivity: curl -v "${dataServicesRootURI}/api/health"
• Check CORS configuration allows GET requests  
• Test the exact endpoint: curl -v "${endpoint}"`;
        }
        throw error;
    }
};

const apiUploadRule = async (dataServicesRootURI: string, ruleData: Rule): Promise<ApiResponseResult & { uploadedRuleId: string; endpoint: string }> => {
    if (!dataServicesRootURI) throw new Error("Data Services Root URI required.");
    
    const preparedRule = prepareRuleForApi(ruleData);
    if (!preparedRule) throw new Error("Failed to prepare rule data.");
    if (!preparedRule.id) throw new Error("Rule ID missing after preparation.");
    
    const endpoint = `${dataServicesRootURI}${API_BASE}/${preparedRule.id}`;
    const payload = safeStringifyJSON(preparedRule);
    
    try {
        let response: Response;
        
        // Try with full headers first
        try {
            response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: payload,
                mode: 'cors',
                signal: AbortSignal.timeout(30000)
            });
        } catch (corsError: any) {
            // If CORS preflight fails, the issue might be server-side CORS config
            if (corsError.message?.includes('CORS') || corsError.message?.includes('Failed to fetch')) {
                // For PUT requests, we usually need proper CORS, but try without Accept header
                response = await fetch(endpoint, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: payload,
                    mode: 'cors',
                    signal: AbortSignal.timeout(30000)
                });
            } else {
                throw corsError;
            }
        }
        
        const result = await handleApiResponse(response, `Upload rule ${preparedRule.id}`);
        return {
            ...result,
            endpoint,
            uploadedRuleId: preparedRule.id
        };
    } catch (error: any) {
        // Enhanced error handling for uploads
        if (error.name === 'TimeoutError') {
            error.message = `Upload timeout: Rule upload to ${endpoint} took longer than 30 seconds.`;
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            error.message = `Network error: Could not connect to ${dataServicesRootURI}. Check URL/port/service/CORS.

Endpoint attempted: ${endpoint}

Required CORS configuration for uploads:
• Access-Control-Allow-Origin: * (or your domain)
• Access-Control-Allow-Methods: PUT, OPTIONS  
• Access-Control-Allow-Headers: Content-Type, Accept
• Handle OPTIONS preflight requests

Troubleshooting:
• Test basic connectivity: curl -v "${dataServicesRootURI}/api/health"
• Test PUT endpoint: curl -X PUT -H "Content-Type: application/json" -d '{"test":true}' "${endpoint}"
• Verify server handles PUT requests and logs for CORS errors`;
        } else if (error.message?.includes('CORS policy')) {
            error.message = `CORS Policy Error: ${dataServicesRootURI} is blocking PUT requests.\n\nThe server needs to:\n1. Handle OPTIONS preflight requests\n2. Return proper CORS headers for PUT method\n3. Allow Content-Type: application/json header`;
        }
        error.endpoint = endpoint;
        throw error;
    }
};

const apiPerformDsHealthCheck = async (dataServicesRootURI: string): Promise<{ success: boolean; data: any; message: string }> => {
    if (!dataServicesRootURI) throw new Error("Data Services Root URI required.");
    
    const endpoint = `${dataServicesRootURI}${DS_HEALTH_CHECK_PATH}`;
    
    try {
        let response: Response;
        
        // First try: Full CORS request with headers
        try {
            response = await fetch(endpoint, {
                method: 'GET',
                headers: { 
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                mode: 'cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(10000)
            });
        } catch (corsError: any) {
            console.log('First CORS attempt failed, trying simpler request:', corsError.message);
            
            // Second try: Simple request without Content-Type (avoids preflight)
            try {
                response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json'
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(10000)
                });
            } catch (secondError: any) {
                console.log('Second CORS attempt failed, trying no-cors mode:', secondError.message);
                
                // Third try: No-CORS mode (only for connectivity test)
                try {
                    const testResponse = await fetch(endpoint, {
                        method: 'GET',
                        mode: 'no-cors',
                        cache: 'no-cache',
                        signal: AbortSignal.timeout(5000)
                    });
                    
                    // If we get here, server is reachable but CORS is not configured
                    throw new Error(`CORS_NOT_CONFIGURED: Server at ${dataServicesRootURI} is reachable but doesn't allow cross-origin requests. Please configure CORS headers on your Data Services API.`);
                } catch (noCorsError: any) {
                    // If even no-cors fails, likely a network/server issue
                    if (noCorsError.message?.includes('CORS_NOT_CONFIGURED')) {
                        throw noCorsError;
                    }
                    throw new Error(`NETWORK_ERROR: Cannot connect to ${dataServicesRootURI}. Please check if the Data Services API is running on port 8105.`);
                }
            }
        }
        
        const result = await handleApiResponse(response, 'Perform DS health check');
        
        // Updated to handle both Production and other environments properly (not just Production)
        if (result.data && result.data.environmentName) {
            return {
                success: true,
                data: result.data,
                message: `DS Connected: ${result.data.environmentName} Environment`
            };
        } else if (result.data && result.data.status) {
            return {
                success: true,
                data: result.data,
                message: `DS Connected: ${result.data.status}`
            };
        } else {
            throw new Error(`Unexpected DS Response: ${safeStringifyJSON(result.data)}`);
        }
    } catch (error: any) {
        if (!error.endpoint) error.endpoint = endpoint;
        
        // Enhanced error messages based on error type
        if (error.name === 'TimeoutError') {
            error.message = `⏰ Connection timeout: ${endpoint} did not respond within 10 seconds.\n\n🔍 Troubleshooting:\n• Check if Data Services is running: lsof -i :8105\n• Test basic connectivity: curl -v ${endpoint}\n• Verify the service is not overloaded`;
            
        } else if (error.message?.includes('CORS_NOT_CONFIGURED')) {
            error.message = `🚫 CORS Configuration Required\n\nYour Data Services API at ${dataServicesRootURI} is running but not configured for cross-origin requests.\n\n🔧 Quick Fix - Add these headers to your server:\n• Access-Control-Allow-Origin: *\n• Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\n• Access-Control-Allow-Headers: Content-Type, Accept, Authorization\n\n📋 For testing, you can use our CORS-enabled test server:\nnode cors-test-server.js 8105`;
            
        } else if (error.message?.includes('NETWORK_ERROR')) {
            error.message = `🌐 Network Connection Failed\n\nCannot connect to Data Services at ${dataServicesRootURI}\n\n🔍 Common causes:\n• Service not running on port 8105\n• Wrong URL or port number\n• Firewall blocking the connection\n• Service crashed or not started\n\n🚀 Quick start for testing:\nnode cors-test-server.js 8105\n\n🛠️  Verify service is running:\nlsof -i :8105 || netstat -an | grep :8105`;
            
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            error.message = `Network error: Could not connect to ${dataServicesRootURI}. Check URL/port/service/CORS.

Endpoint attempted: ${endpoint}

Common causes:
• Data Services API not running on port 8105
• CORS not configured properly  
• Network or firewall blocking the request

Quick solutions:
1. Start test server: node cors-test-server.js 8105
2. Check service: lsof -i :8105 
3. Test connectivity: curl -v "${endpoint}"

CORS headers needed:
• Access-Control-Allow-Origin: *
• Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS  
• Access-Control-Allow-Headers: Content-Type, Accept`;
            
        } else if (error.message?.includes('CORS policy') || error.message?.includes('CORS')) {
            error.message = `🚫 CORS Policy Violation\n\n${dataServicesRootURI} is rejecting cross-origin requests from this domain.\n\n✅ Server is running and reachable\n❌ CORS headers are missing or misconfigured\n\n🔧 Required server configuration:\n1. Handle OPTIONS preflight requests\n2. Add response headers:\n   • Access-Control-Allow-Origin: *\n   • Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\n   • Access-Control-Allow-Headers: Content-Type, Accept, Authorization\n\n🧪 Test CORS with curl:\ncurl -v -H "Origin: ${window.location.origin}" \\\n     -H "Accept: application/json" \\\n     "${endpoint}"\n\nLook for Access-Control-Allow-Origin header in response.`;
            
        } else if (!error.message) {
            error.message = `❌ Data Services request failed: ${endpoint}`;
        }
        
        throw error;
    }
};

const apiPerformRulesEngineHealthCheck = async (rulesEngineRootURI: string): Promise<{ success: boolean; data: any; message: string }> => {
    if (!rulesEngineRootURI || typeof rulesEngineRootURI !== 'string') throw new Error("Rules Engine URL is invalid or missing.");
    if (!RULES_ENGINE_HEALTH_CHECK_PATH || typeof RULES_ENGINE_HEALTH_CHECK_PATH !== 'string') throw new Error("Internal configuration error: Health check path is invalid.");
    
    const endpoint = `${rulesEngineRootURI}${RULES_ENGINE_HEALTH_CHECK_PATH}`;
    let response: Response;
    
    try {
        response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            mode: 'cors',
            cache: 'no-cache',
            signal: AbortSignal.timeout(10000)
        });
        
        const result = await handleApiResponse(response, 'Perform Rules Engine health check');
        
        // The /diagnostics/health endpoint returns 200 OK when healthy
        // The response format may vary, so we check for success indicators
        if (response.status === 200) {
            const statusMessage = result.data?.status || result.data?.message || 'Healthy';
            return {
                success: true,
                data: result.data,
                message: `Rules Engine Connected: ${statusMessage}`
            };
        } else {
            throw new Error(`Unexpected Rules Engine Response: ${safeStringifyJSON(result.data)}`);
        }
    } catch (error: any) {
        console.error("Full API Error object in apiPerformRulesEngineHealthCheck:", error);
        
        let detailedMessage = error.message || `Rules Engine Request failed`;
        
        if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
            detailedMessage = `Network error: Could not connect to Rules Engine at ${rulesEngineRootURI}. Check URL/server/CORS.`;
        } else if (error.status) {
            detailedMessage = `(${error.status}) ${error.message}`;
        }
        
        const enhancedError = new Error(detailedMessage) as any;
        enhancedError.endpoint = endpoint;
        enhancedError.originalError = error;
        if (error.status) enhancedError.status = error.status;
        throw enhancedError;
    }
};

const apiValidateExpression = async (rulesEngineRootURI: string, payload: any): Promise<any> => {
    if (!rulesEngineRootURI) throw new Error("Rules Engine URL required.");
    if (!payload || typeof payload !== 'object' || !payload.expression) throw new Error("Invalid payload: Expression is required.");
    
    const endpoint = `${rulesEngineRootURI}${RULES_ENGINE_VALIDATE_PATH}`;
    
    // Format the payload according to ValidationRequest schema
    const validationRequest = {
        expression: payload.expression,
        inputs: payload.inputParameters || payload.inputs || {}
    };
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            cache: 'no-cache',
            body: safeStringifyJSON(validationRequest),
            signal: AbortSignal.timeout(30000)
        });
        
        const result = await handleApiResponse(response, 'Validate expression');
        return result.data;
    } catch (error: any) {
        console.error("API Error in apiValidateExpression:", error);
        
        if (!error.endpoint) error.endpoint = endpoint;
        if (!error.message) error.message = `Validation Request failed`;
        
        if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
            error.message = `Network error: Could not connect to Rules Engine at ${rulesEngineRootURI}.`;
        } else if (error.status) {
            error.message = `(${error.status}) ${error.message}`;
        }
        
        const responseText = error.responseText || error.originalError?.responseText;
        if (responseText) {
            try {
                const errData = JSON.parse(responseText);
                error.message += `: ${errData.title || errData.message || responseText.substring(0, 100)}`;
            } catch {
                error.message += ` Response: ${responseText.substring(0, 100)}`;
            }
        }
        
        throw error;
    }
};

const apiFetchOrderTemplates = async (dataServicesRootURI: string): Promise<any[]> => {
    if (!dataServicesRootURI) throw new Error("Data Services Root URI required.");
    
    const endpoint = `${dataServicesRootURI}${API_ORDER_TEMPLATES}`;
    
    try {
        let response: Response;
        
        try {
            response = await fetch(endpoint, {
                method: 'GET',
                headers: { 
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                mode: 'cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(15000)
            });
        } catch (corsError: any) {
            if (corsError.message?.includes('CORS') || corsError.message?.includes('Failed to fetch')) {
                response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json'
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(15000)
                });
            } else {
                throw corsError;
            }
        }
        
        const result = await handleApiResponse(response, 'Fetch order templates list');
        const templatesArray = Array.isArray(result.data) ? result.data : (result.data?.items || result.data?.results || []);
        return templatesArray;
    } catch (error: any) {
        if (error.name === 'TimeoutError') {
            error.message = `Request timeout: ${endpoint} did not respond within 15 seconds.`;
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            error.message = `Network error: Could not connect to ${dataServicesRootURI}. Check URL/port/service/CORS.

Endpoint attempted: ${endpoint}

Troubleshooting:
• Verify Data Services is running on port 8105: lsof -i :8105
• Test connectivity: curl -v "${dataServicesRootURI}/api/health"
• Test the exact endpoint: curl -v "${endpoint}"`;
        }
        throw error;
    }
};

const apiFetchOrderTemplateDetails = async (dataServicesRootURI: string, templateName: string): Promise<any> => {
    if (!dataServicesRootURI || !templateName) throw new Error("Data Services Root URI and Template Name required.");
    
    const encodedTemplateName = encodeURIComponent(templateName);
    const endpoint = `${dataServicesRootURI}${API_ORDER_TEMPLATES}/${encodedTemplateName}`;
    
    try {
        let response: Response;
        
        try {
            response = await fetch(endpoint, {
                method: 'GET',
                headers: { 
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                mode: 'cors',
                cache: 'no-cache',
                signal: AbortSignal.timeout(15000)
            });
        } catch (corsError: any) {
            if (corsError.message?.includes('CORS') || corsError.message?.includes('Failed to fetch')) {
                response = await fetch(endpoint, {
                    method: 'GET',
                    headers: { 
                        'Accept': 'application/json'
                    },
                    mode: 'cors',
                    cache: 'no-cache',
                    signal: AbortSignal.timeout(15000)
                });
            } else {
                throw corsError;
            }
        }
        
        const result = await handleApiResponse(response, `Fetch order template details for ${templateName}`);
        return result.data;
    } catch (error: any) {
        if (error.name === 'TimeoutError') {
            error.message = `Request timeout: Could not fetch template ${templateName} within 15 seconds.`;
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            error.message = `Network error: Could not connect to ${dataServicesRootURI}. Check URL/port/service/CORS.

Endpoint attempted: ${endpoint}

Troubleshooting:
• Verify Data Services is running on the specified port
• Test connectivity: curl -v "${dataServicesRootURI}/api/health"
• Test the exact endpoint: curl -v "${endpoint}"`;
        }
        throw error;
    }
};

// ==========================================================================
// Helper Utilities
// ==========================================================================

const generateUid = (): string => `uid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const generateRuleId = (): string => {
    const prefix = "RULE";
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let suffix = "";
    for (let i = 0; i < 5; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix + suffix;
};

const safeStringifyJSON = (obj: any, indent = 0): string => {
    try {
        const cache = new Set();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) return '[Circular]';
                cache.add(value);
            }
            return value;
        }, indent);
    } catch (e) {
        console.error("safeStringifyJSON error:", e);
        return String(obj);
    }
};

export const safeParseJSON = (str: any, defaultValue: any = null): any => {
    if (typeof str !== 'string') {
        if (typeof str === 'object' && str !== null) return str;
        return defaultValue;
    }
    try {
        if (str.trim() === "") return defaultValue;
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
};

const convertInputValue = (value: any): any => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (trimmed === "") return "";
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
    if (trimmed !== "" && !isNaN(Number(trimmed)) && isFinite(Number(trimmed))) {
        const num = Number(trimmed);
        if (!isNaN(num) && isFinite(num)) return num;
    }
    return trimmed;
};

const setDeepValue = (obj: any, path: (string | number)[], value: any): any => {
    if (!path || path.length === 0) return value;
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }
    
    let newObj;
    try {
        newObj = structuredClone(obj);
    } catch(cloneError) {
        console.error("structuredClone failed:", cloneError);
        return obj;
    }
    
    let current = newObj;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (typeof current !== 'object' || current === null) {
            return obj;
        }
        
        const nextKeyType = typeof path[i + 1];
        if (current[key] === undefined || current[key] === null) {
            current[key] = nextKeyType === 'number' ? [] : {};
        } else if (typeof current[key] !== 'object') {
            return obj;
        } else if (nextKeyType === 'number' && !Array.isArray(current[key])) {
            current[key] = [];
        } else if (nextKeyType !== 'number' && Array.isArray(current[key])) {
            current[key] = {};
        }
        current = current[key];
    }
    
    const finalKey = path[path.length - 1];
    if (typeof current !== 'object' || current === null) {
        return obj;
    }
    
    if (Array.isArray(current) && (typeof finalKey !== 'number' || finalKey < 0)) {
        return obj;
    }
    
    current[finalKey] = value;
    return newObj;
};

// ==========================================================================
// Data Transformation Utilities
// ==========================================================================

export const parseRuleFromApi = (apiRule: any, existingRuleId?: string): Rule => {
    const uiRule = structuredClone(DEFAULT_RULE_TEMPLATE);
    uiRule.id = apiRule?.identifier || apiRule?.id || existingRuleId || null;
    uiRule.name = apiRule?.name || "";
    uiRule.description = apiRule?.description || "";
    uiRule.typeIdentifier = apiRule?.typeIdentifier || "Business Rule";
    
    const apiPropertiesMap = new Map((apiRule?.properties || []).map((p: any) => [p.name, p]));
    
    uiRule.properties.forEach(uiProp => {
        // Try to find a matching property from the API using the UI template's property name
        let apiProp: any = apiPropertiesMap.get(uiProp.name);
        
        // Handle potential old name from API for backward compatibility
        if (uiProp.name === "Expression" && !apiProp) {
            apiProp = apiPropertiesMap.get("Evaluation Lambda Expression");
        }
        
        if (apiProp) {
            if (uiProp.name === "OnSuccess" || uiProp.name === "OnFailure") {
                let parsedActions: Action[] = [];
                const parsedValue = safeParseJSON(apiProp.value, { Actions: [] });
                
                if (parsedValue && typeof parsedValue === 'object' && Array.isArray(parsedValue.Actions)) {
                    parsedActions = parsedValue.Actions.map((action: any) => {
                        if (typeof action !== 'object' || action === null) return null;
                        
                        const baseAction: Action = {
                            ...action,
                            _uid: generateUid()
                        };
                        
                        return baseAction;
                    }).filter(Boolean);
                }
                
                uiProp.value = { Actions: parsedActions };
                uiProp.valueType = apiProp.valueType || "String";
            } else {
                uiProp.value = apiProp.value !== undefined ? apiProp.value : "";
                uiProp.valueType = apiProp.valueType || "String";
            }
        }
    });
    
    return uiRule;
};

const prepareRuleForApi = (uiRule: Rule): Rule => {
    if (!uiRule || typeof uiRule !== 'object') throw new Error("Invalid rule data");
    
    const outputRule = structuredClone(uiRule);
    if (!outputRule.id) outputRule.id = generateRuleId();
    
    outputRule.typeIdentifier = "Business Rule";
    outputRule.properties = Array.isArray(outputRule.properties) ? outputRule.properties : [];
    
    outputRule.properties.forEach(prop => {
        if (!prop || typeof prop !== 'object') return;
        
        if (prop.name === "OnSuccess" || prop.name === "OnFailure") {
            let actionsToSerialize: Action[] = [];
            const currentVal = safeParseJSON(prop.value, { Actions: [] });
            
            if (currentVal && typeof currentVal === 'object' && Array.isArray(currentVal.Actions)) {
                actionsToSerialize = currentVal.Actions.filter((a: any) => 
                    a && typeof a === 'object' && a.ActionType
                ).map((action: Action) => {
                    const { _uid, ...rest } = action;
                    return rest;
                });
            }
            
            prop.value = safeStringifyJSON({ Actions: actionsToSerialize });
            prop.valueType = "String";
        } else {
            prop.valueType = prop.valueType || "String";
        }
    });
    
    return outputRule;
};

// ==========================================================================
// React Flow Chain Map Functionality
// ==========================================================================

// Enhanced Custom Node Components with template-matching colors and symbols
// FINAL FIX: RuleNode with handles as siblings (handles first, content separate)
const RuleNode = ({ data, selected }: { data: any; selected?: boolean }) => {
    const { label, ruleId, expression, isInitiating, onEdit, onDelete } = data;
    
    return (
        <div style={{ position: 'relative', width: '180px', height: 'auto' }}>
            {/* HANDLES FIRST - SIBLINGS TO CONTENT, NOT CHILDREN */}
            <Handle
                id="in-left"
                type="target"
                position={Position.Left}
                style={{
                    top: '50%',
                    left: '-6px',
                    width: '12px',
                    height: '12px',
                    background: '#9ca3af',
                    border: '1px solid #6b7280',
                    borderRadius: '50%'
                }}
            />
            
            <Handle
                id="success"
                type="source"
                position={Position.Right}
                style={{
                    top: '33.33%',
                    right: '-6px',
                    width: '12px',
                    height: '12px',
                    background: '#4ade80',
                    border: '1px solid #16a34a',
                    borderRadius: '50%'
                }}
            />
            
            <Handle
                id="failure"
                type="source"
                position={Position.Right}
                style={{
                    top: '66.66%',
                    right: '-6px',
                    width: '12px',
                    height: '12px',
                    background: '#f87171',
                    border: '1px solid #dc2626',
                    borderRadius: '50%'
                }}
            />
            
            {/* CONTENT DIV - NO HANDLES INSIDE HERE */}
            <div 
                onClick={onEdit}
                className="px-3 py-2 bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-500 rounded-md cursor-pointer shadow-md hover:shadow-lg min-w-[140px] max-w-[180px]"
            >
                <div className="text-white">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">⚖️</span>
                        <div className="font-medium text-xs truncate flex-1">{label}</div>
                    </div>
                    <div className="text-xs text-blue-200 font-mono truncate">({ruleId})</div>
                </div>
            </div>
            
            {/* DELETE BUTTON */}
            <button
                onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                style={{ 
                    position: 'absolute', 
                    right: '2px', 
                    top: '2px',
                    fontSize: '9px',
                    padding: '1px 3px',
                    backgroundColor: 'rgba(127, 29, 29, 0.8)',
                    color: '#fca5a5',
                    border: 'none',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    lineHeight: '1'
                }}
            >×</button>
        </div>
    );
};

            

// CORRECTED ActionNode Component
const ActionNode = ({ data, selected }: { data: any; selected?: boolean }) => {
    const { label, actionType, isSuccess, onEdit, onDelete } = data;
    
    // Determine colors based on action type
    let bgGradient, borderColor, textColor, icon;
    
    if (actionType?.includes('RuleEvaluation')) {
        bgGradient = 'from-teal-600 to-teal-700';
        borderColor = 'border-teal-500';
        textColor = 'text-teal-100';
        icon = '⚖️';
    } else if (actionType?.includes('OrchestratorWorkflow')) {
        bgGradient = 'from-purple-600 to-purple-700';
        borderColor = 'border-purple-500';
        textColor = 'text-purple-100';
        icon = '🔧';
    } else if (actionType?.includes('GbgScheduler')) {
        bgGradient = 'from-emerald-600 to-emerald-700';
        borderColor = 'border-emerald-500';
        textColor = 'text-emerald-100';
        icon = '📅';
    } else {
        bgGradient = isSuccess ? 'from-green-600 to-green-700' : 'from-red-600 to-red-700';
        borderColor = isSuccess ? 'border-green-500' : 'border-red-500';
        textColor = isSuccess ? 'text-green-100' : 'text-red-100';
        icon = isSuccess ? '✅' : '❌';
    }
    
    return (
        <div style={{ position: 'relative' }}>
            {/* LEFT INPUT HANDLE ONLY - at 50% height */}
            <Handle
                id="in-left"
                type="target"
                position={Position.Left}
                isConnectable={true}
                style={{
                    top: '50%',
                    left: '-6px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: '#9ca3af',
                    border: '1px solid #6b7280',
                    transform: 'translateY(-50%)',
                    zIndex: 20
                }}
            />
            
            {/* NODE CONTENT */}
            <div 
                onClick={onEdit}
                className={`
                    px-3 py-2 bg-gradient-to-br ${bgGradient} border ${borderColor} 
                    rounded-md shadow-md min-w-[120px] max-w-[160px]
                    ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800' : ''}
                    hover:shadow-lg transition-all duration-150 cursor-pointer
                    relative
                `}
            >
                <div className="text-white">
                    <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-sm">{icon}</span>
                        <div className="font-medium text-xs leading-tight truncate flex-1">{label}</div>
                    </div>
                    <div className={`text-xs ${textColor} truncate`}>
                        {actionType?.replace('Action', '') || 'Action'}
                    </div>
                </div>
            </div>
            
            {/* Delete button */}
            <div style={{ position: 'absolute', right: 3, top: 3 }}>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.();
                    }}
                    title="Delete node"
                    className="text-[10px] bg-red-500/10 px-0.5 py-0 rounded hover:bg-red-500/30 opacity-40 hover:opacity-100 transition-opacity"
                    style={{ lineHeight: '1' }}
                >
                    ×
                </button>
            </div>
        </div>
    );
};

// Add a Draggable Rule Template component (restores missing function header)
const DraggableRuleTemplate = ({ type, label, icon, onDragStart }: { 
    type: string; 
    label: string; 
    icon: string; 
    onDragStart: (event: React.DragEvent, nodeType: string) => void; 
}) => {
    // determine colors based on template type
    let bgGradient: string = '';
    let borderColor: string = '';

    if (type === 'rule') {
        bgGradient = 'from-blue-600 to-blue-700';
        borderColor = 'border-blue-500';
    } else if (type === 'action-workflow') {
        bgGradient = 'from-purple-600 to-purple-700';
        borderColor = 'border-purple-500';
    } else if (type === 'action-scheduler') {
        bgGradient = 'from-emerald-600 to-emerald-700';
        borderColor = 'border-emerald-500';
    } else {
        // Fallback
        bgGradient = 'from-gray-600 to-gray-700';
        borderColor = 'border-gray-500';
    }

    return (
        <div
            className={`px-3 py-2 bg-gradient-to-br ${bgGradient} border ${borderColor}
                       rounded-md shadow-md cursor-grab hover:shadow-lg
                       transition-all duration-150 min-w-[120px] text-white text-center
                       active:cursor-grabbing select-none`}
            draggable
            onDragStart={(event) => onDragStart(event, type)}
            title={`Drag to create a new ${label}`}
        >
            <div className="flex items-center justify-center gap-1.5">
                <span className="text-sm">{icon}</span>
                <span className="text-xs font-medium">{label}</span>
            </div>
        </div>
    );
};

// ErrorNode component (restored)
const ErrorNode = ({ data, selected }: { data: any; selected?: boolean }) => {
    const { label, message, onDelete } = data || {};
    return (
        <div style={{ position: 'relative' }}>
            <Handle
                id="in-green"
                type="target"
                position={Position.Left}
                isConnectable={true}
                style={{
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '1px solid #16a34a',
                    left: -6,
                    zIndex: 20
                }}
            />

            <div className={`px-3 py-2 bg-gradient-to-br from-red-800 to-red-900 border-2 border-red-600 rounded-lg shadow-lg min-w-[140px] max-w-[200px] ${selected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-gray-900' : ''}`}>
                <div className="text-white flex items-center gap-2">
                    <span>⚠️</span>
                    <div className="font-medium text-sm leading-tight flex-1">{label || 'Error'}</div>
                </div>
                {message && <div className="text-xs text-red-300 mt-1 truncate" title={message}>{message}</div>}
            </div>

            <div style={{ position: 'absolute', right: -6, top: -6, zIndex: 40 }}>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                    title="Delete node"
                    className="w-6 h-6 flex items-center justify-center text-[12px] text-white bg-red-700 hover:bg-red-800 rounded-full shadow-md"
                    style={{ lineHeight: '1' }}
                >
                    ×
                </button>
            </div>
        </div>
    );
};

// Add a Rule Palette Component
const RulePalette = ({ onDragStart }: { onDragStart: (event: React.DragEvent, nodeType: string) => void }) => {
    const ruleTemplates = [
        { type: 'rule', label: 'Business Rule', icon: '⚖️' },
        { type: 'action-workflow', label: 'Workflow', icon: '🔧' },
        { type: 'action-scheduler', label: 'Scheduler', icon: '📅' }
    ];

    return (
        <div className="bg-card/90 border border-border rounded-lg p-3">
            <h4 className="text-foreground font-medium text-sm mb-2">Rule Templates</h4>
            <p className="text-muted-foreground text-xs mb-3">Drag to add to chain map</p>
            <div className="grid grid-cols-1 gap-2">
                {ruleTemplates.map((template) => (
                    <DraggableRuleTemplate
                        key={template.type}
                        type={template.type}
                        label={template.label}
                        icon={template.icon}
                        onDragStart={onDragStart}
                    />
                ))}
            </div>
        </div>
    );
};

// Custom Edge Components - with success/failure styling
const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, sourceHandle, data }: any) => {
    const edgePath = `M${sourceX},${sourceY} C${sourceX + 50},${sourceY} ${targetX - 50},${targetY} ${targetX},${targetY}`;
    const isSuccess = sourceHandle === 'success' || data?.type === 'success';
    const isFailure = sourceHandle === 'failure' || data?.type === 'failure';
    
    // Determine color based on connection type
    let strokeColor = '#6366f1'; // Default blue
    if (isSuccess) {
        strokeColor = '#22c55e'; // Green for success
    } else if (isFailure) {
        strokeColor = '#ef4444'; // Red for failure
    }
    
    return (
        <path
            id={id}
            style={{
                stroke: strokeColor,
                strokeWidth: 2,
                fill: 'none'
            }}
            className="react-flow__edge-path"
            d={edgePath}
        />
    );
};

const nodeTypes: NodeTypes = {
    ruleNode: RuleNode,
    actionNode: ActionNode,
    errorNode: ErrorNode
};

const edgeTypes: EdgeTypes = {
    custom: CustomEdge
};

// Enhanced Convert ChainData to React Flow format without connection suggestions
function convertToReactFlowFormat(
    chainData: ChainData, 
    onNodeClick: (ruleId: string) => void,
    onNodeEdit?: (nodeId: string, nodeType: 'rule' | 'action', data?: any) => void,
    onNodeDelete?: (nodeId: string) => void
): { nodes: Node[]; edges: Edge[] } {
    if (!chainData || !chainData.nodes) {
        return { nodes: [], edges: [] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodeWidth = 160;
    const nodeHeight = 80;
    const horizontalSpacing = 250;
    const verticalSpacing = 120;

    // Group nodes by level for better layout
    const nodesByLevel = new Map<number, ChainNode[]>();
    const processedNodes = new Set<string>();
    
    // Find root nodes (initiating rules)
    const rootNodes = Object.values(chainData.nodes).filter(node => node.isInitiating);
    if (rootNodes.length === 0) {
        const firstNode = Object.values(chainData.nodes)[0];
        if (firstNode) rootNodes.push(firstNode);
    }

    // Assign levels using BFS
    const assignLevels = (startNodes: ChainNode[], startLevel = 0) => {
        const queue = startNodes.map(node => ({ node, level: startLevel }));
        
        while (queue.length > 0) {
            const { node, level } = queue.shift()!;
            
            if (processedNodes.has(node.id)) continue;
            processedNodes.add(node.id);
            
            if (!nodesByLevel.has(level)) {
                nodesByLevel.set(level, []);
            }
            nodesByLevel.get(level)!.push(node);
            
            // Find children through edges
            const childEdges = chainData.edges?.filter(edge => edge.from === node.id) || [];
            for (const edge of childEdges) {
                const childNode = chainData.nodes[edge.to];
                if (childNode && !processedNodes.has(childNode.id)) {
                    queue.push({ node: childNode, level: level + 1 });
                }
            }
        }
    };

    assignLevels(rootNodes);
    
    // Add any remaining unprocessed nodes
    const remainingNodes = Object.values(chainData.nodes).filter(node => !processedNodes.has(node.id));
    if (remainingNodes.length > 0) {
        const maxLevel = Math.max(...Array.from(nodesByLevel.keys())) + 1;
        assignLevels(remainingNodes, maxLevel);
    }

    // Create React Flow nodes with positions
    Array.from(nodesByLevel.entries())
        .sort(([a], [b]) => a - b)
        .forEach(([level, levelNodes]) => {
            levelNodes.forEach((chainNode, indexInLevel) => {
                const x = level * horizontalSpacing;
                const y = (indexInLevel - (levelNodes.length - 1) / 2) * verticalSpacing;
                
                // Determine node type based on whether it's an action node or rule node
                let nodeType: string;
                let nodeData: any;
                
                if (chainNode.actionType) {
                    // This is an action node (workflow/scheduler)
                    nodeType = 'actionNode';
                    nodeData = {
                        label: chainNode.label || chainNode.id,
                        actionType: chainNode.actionType,
                        templateName: chainNode.templateName,
                        inputParameters: chainNode.inputParameters,
                        outputParameters: chainNode.outputParameters,
                        isSuccess: true, // Actions are generally on success paths unless specified
                        onEdit: () => onNodeEdit?.(chainNode.id, 'action', chainNode),
                        onDelete: () => onNodeDelete?.(chainNode.id)
                    };
                } else {
                    // This is a rule node (Business Rule)
                    nodeType = 'ruleNode';
                    nodeData = {
                        label: chainNode.label || chainNode.id,
                        ruleId: chainNode.id,
                        expression: chainNode.expression,
                        isInitiating: chainNode.isInitiating,
                        onClick: () => onNodeClick(chainNode.id),
                        onEdit: () => onNodeEdit?.(chainNode.id, 'rule', chainNode),
                        onDelete: () => onNodeDelete?.(chainNode.id)
                    };
                }

                const reactFlowNode: Node = {
                    id: chainNode.id,
                    type: nodeType,
                    position: { x, y },
                    data: nodeData,
                    draggable: true,
                    selectable: true,
                    deletable: true
                };

                nodes.push(reactFlowNode);
            });
        });

    // Create edges with enhanced styling
    chainData.edges?.forEach((chainEdge, index) => {
        // Determine color based on edge type
        let strokeColor = '#6366f1'; // Default blue
        if (chainEdge.type === 'success') {
            strokeColor = '#22c55e'; // Green
        } else if (chainEdge.type === 'failure') {
            strokeColor = '#ef4444'; // Red
        }

        const edge: Edge = {
            id: `edge-${index}`,
            source: chainEdge.from,
            target: chainEdge.to,
            sourceHandle: chainEdge.type === 'success' ? 'success' : 
                          chainEdge.type === 'failure' ? 'failure' : undefined,
            type: 'custom',
            animated: false,
            style: { 
                stroke: strokeColor,
                strokeWidth: 2
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: strokeColor
            },
            data: {
                type: chainEdge.type
            },
            deletable: true
        };

        edges.push(edge);
    });

    return { nodes, edges };
}

// Smart Connection Suggestions System
interface ConnectionSuggestion {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    type: 'success' | 'failure';
    score: number;
    reason: string;
    position: XYPosition;
}

// Calculate connection suggestions based on node proximity and logic
const calculateConnectionSuggestions = (
    nodes: Node[],
    edges: Edge[],
    draggedNodeId?: string
): ConnectionSuggestion[] => {
    if (nodes.length < 2) return [];

    const suggestions: ConnectionSuggestion[] = [];
    const existingConnections = new Set(
        edges.map(e => `${e.source}-${e.sourceHandle || 'default'}-${e.target}`)
    );

    // Define logical connection rules
    const connectionRules = {
        ruleToAction: { score: 100, reason: "Rules typically connect to actions" },
        actionToRule: { score: 80, reason: "Actions can chain to other rules" },
        ruleToRule: { score: 60, reason: "Rules can chain to other rules" },
        actionToAction: { score: 40, reason: "Actions can be chained together" }
    };

    for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < nodes.length; j++) {
            if (i === j) continue;

            const sourceNode = nodes[i];
            const targetNode = nodes[j];

            // Skip if connection already exists
            if (existingConnections.has(`${sourceNode.id}-success-${targetNode.id}`) ||
                existingConnections.has(`${sourceNode.id}-failure-${targetNode.id}`)) {
                continue;
            }

            // Calculate distance between nodes
            const distance = Math.sqrt(
                Math.pow(targetNode.position.x - sourceNode.position.x, 2) +
                Math.pow(targetNode.position.y - sourceNode.position.y, 2)
            );

            // Only suggest connections for nearby nodes (within 300px)
            if (distance > 300) continue;

            // Determine connection type and score
            let baseScore = 0;
            let reason = "";

            if (sourceNode.type === 'ruleNode' && targetNode.type === 'actionNode') {
                baseScore = connectionRules.ruleToAction.score;
                reason = connectionRules.ruleToAction.reason;
            } else if (sourceNode.type === 'actionNode' && targetNode.type === 'ruleNode') {
                baseScore = connectionRules.actionToRule.score;
                reason = connectionRules.actionToRule.reason;
            } else if (sourceNode.type === 'ruleNode' && targetNode.type === 'ruleNode') {
                baseScore = connectionRules.ruleToRule.score;
                reason = connectionRules.ruleToRule.reason;
            } else if (sourceNode.type === 'actionNode' && targetNode.type === 'actionNode') {
                baseScore = connectionRules.actionToAction.score;
                reason = connectionRules.actionToAction.reason;
            }

            if (baseScore === 0) continue;

            // Distance penalty (closer nodes get higher scores)
            const distancePenalty = Math.min(distance / 300, 1) * 30;
            const finalScore = baseScore - distancePenalty;

            // Position bonus if nodes are horizontally aligned (suggesting flow)
            const horizontalAlignment = Math.abs(targetNode.position.y - sourceNode.position.y);
            const alignmentBonus = horizontalAlignment < 50 ? 10 : 0;

            // Skip very low scoring suggestions
            if (finalScore + alignmentBonus < 30) continue;

            // Prioritize connections when a node is being dragged
            const dragBonus = (draggedNodeId === sourceNode.id || draggedNodeId === targetNode.id) ? 20 : 0;

            // Calculate midpoint for suggestion indicator
            const midX = (sourceNode.position.x + targetNode.position.x) / 2;
            const midY = (sourceNode.position.y + targetNode.position.y) / 2;

            // Generate suggestions for both success and failure paths (for rule nodes)
            if (sourceNode.type === 'ruleNode') {
                // Success connection
                suggestions.push({
                    id: `suggest-${sourceNode.id}-success-${targetNode.id}`,
                    source: sourceNode.id,
                    target: targetNode.id,
                    sourceHandle: 'success',
                    targetHandle: undefined,
                    type: 'success',
                    score: finalScore + alignmentBonus + dragBonus,
                    reason: `${reason} (Success path)`,
                    position: { x: midX, y: midY - 10 }
                });

                // Failure connection (slightly lower score)
                suggestions.push({
                    id: `suggest-${sourceNode.id}-failure-${targetNode.id}`,
                    source: sourceNode.id,
                    target: targetNode.id,
                    sourceHandle: 'failure',
                    targetHandle: undefined,
                    type: 'failure',
                    score: finalScore + alignmentBonus + dragBonus - 10,
                    reason: `${reason} (Failure path)`,
                    position: { x: midX, y: midY + 10 }
                });
            } else {
                // For action nodes, single connection
                suggestions.push({
                    id: `suggest-${sourceNode.id}-${targetNode.id}`,
                    source: sourceNode.id,
                    target: targetNode.id,
                    sourceHandle: undefined,
                    targetHandle: undefined,
                    type: 'success',
                    score: finalScore + alignmentBonus + dragBonus,
                    reason: reason,
                    position: { x: midX, y: midY }
                });
            }
        }
    }

    // Sort by score (highest first) and return top suggestions
    return suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, 8); // Limit to prevent UI clutter
};

// Connection Suggestion Indicator Component
const ConnectionSuggestionIndicator = ({ 
    suggestion, 
    onClick, 
    onHover 
}: { 
    suggestion: ConnectionSuggestion; 
    onClick: () => void;
    onHover: (hovering: boolean) => void;
}) => {
    const isSuccess = suggestion.type === 'success';
    const color = isSuccess ? '#22c55e' : '#ef4444';
    const bgColor = isSuccess ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const borderColor = isSuccess ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)';

    return (
        <div
            className="absolute pointer-events-auto cursor-pointer z-50"
            style={{
                left: suggestion.position.x - 20,
                top: suggestion.position.y - 10,
                transform: 'translate(-50%, -50%)'
            }}
            onClick={onClick}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            title={`Click to connect: ${suggestion.reason}\nScore: ${Math.round(suggestion.score)}`}
        >
            <div
                className="w-8 h-8 rounded-full border-2 border-dashed flex items-center justify-center
                           hover:scale-110 transition-all duration-200 animate-pulse"
                style={{
                    backgroundColor: bgColor,
                    borderColor: borderColor,
                    color: color
                }}
            >
                <div className="text-xs font-bold">+</div>
            </div>
            
            {/* Connection preview line */}
            <svg
                className="absolute pointer-events-none"
                style={{
                    left: -100,
                    top: -50,
                    width: 200,
                    height: 100,
                    zIndex: -1
                }}
            >
                <defs>
                    <marker
                        id={`arrow-${suggestion.id}`}
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="3"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto"
                    >
                        <path d="M0,0 L0,6 L9,3 z" fill={color} opacity="0.6" />
                    </marker>
                </defs>
                <path
                    d="M 20 50 Q 100 30 180 50"
                    stroke={color}
                    strokeWidth="2"
                    strokeDasharray="4,4"
                    fill="none"
                    opacity="0.6"
                    markerEnd={`url(#arrow-${suggestion.id})`}
                />
            </svg>
        </div>
    );
};

// Edit Action Node Dialog Component with Template Support
interface EditActionNodeDialogProps {
    open: boolean;
    onClose: () => void;
    editingNodeType: 'rule' | 'action';
    editingNodeData: any;
    setEditingNodeData: (data: any) => void;
    onSave: (data: any) => void;
    dataServicesRootURI: string;
}

const EditActionNodeDialog: React.FC<EditActionNodeDialogProps> = ({
    open,
    onClose,
    editingNodeType,
    editingNodeData,
    setEditingNodeData,
    onSave,
    dataServicesRootURI
}) => {
    // Template-driven action detection
    const isTemplateDriven =
        editingNodeData?.actionType === "ExecuteOrchestratorWorkflowAction" ||
        editingNodeData?.actionType === "ExecuteGbgSchedulerProcessAction";

    // Template state
    const [templateList, setTemplateList] = React.useState<Array<{name: string; category?: string}>>([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = React.useState(false);
    const [templatesError, setTemplatesError] = React.useState<string>("");

    const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
    const [detailsError, setDetailsError] = React.useState<string>("");
    const [selectedTemplateDetails, setSelectedTemplateDetails] = React.useState<any>(null);

    // Fetch template list when modal opens AND action is template-driven
    React.useEffect(() => {
        if (!open) return; // only when dialog is shown
        if (!isTemplateDriven) return; // only for workflow/scheduler actions
        if (!dataServicesRootURI) {
            setTemplatesError("Data Services URL not set.");
            return;
        }
        let cancelled = false;
        
        (async () => {
            setIsLoadingTemplates(true);
            setTemplatesError("");
            try {
                const items = await apiFetchOrderTemplates(dataServicesRootURI);
                if (!cancelled) {
                    const list = Array.isArray(items) ? [...items].sort((a, b) => (a?.name || "").localeCompare(b?.name || "")) : [];
                    setTemplateList(list);
                }
            } catch (e: any) {
                if (!cancelled) setTemplatesError(`Templates Error: ${e.message || e}`);
            } finally {
                if (!cancelled) setIsLoadingTemplates(false);
            }
        })();
        
        return () => { cancelled = true; };
    }, [open, isTemplateDriven, dataServicesRootURI]);

    // Fetch template details when TemplateName changes
    React.useEffect(() => {
        if (!open || !isTemplateDriven) return;
        if (!editingNodeData?.templateName) {
            setSelectedTemplateDetails(null);
            setDetailsError("");
            return;
        }
        if (!dataServicesRootURI) {
            setDetailsError("Data Services URL not set.");
            return;
        }

        let cancelled = false;
        
        (async () => {
            setIsLoadingDetails(true);
            setDetailsError("");
            try {
                const details = await apiFetchOrderTemplateDetails(dataServicesRootURI, editingNodeData.templateName);
                if (!cancelled) setSelectedTemplateDetails(details || null);
            } catch (e: any) {
                if (!cancelled) setDetailsError(`Details Error: ${e.message || e}`);
            } finally {
                if (!cancelled) setIsLoadingDetails(false);
            }
        })();

        return () => { cancelled = true; };
    }, [open, isTemplateDriven, editingNodeData?.templateName, dataServicesRootURI]);

    // When details arrive, seed Input/Output with defaults (but preserve user edits)
    React.useEffect(() => {
        if (!isTemplateDriven || !selectedTemplateDetails) return;
        
        const seed = (list: any[] | undefined, current: Record<string, any> = {}) => {
            const defaults: Record<string, any> = {};
            (list || []).forEach(p => {
                if (p?.defaultValue !== undefined) defaults[p.name] = p.defaultValue;
            });
            return { ...defaults, ...current };
        };
        
        const currentInputParams = typeof editingNodeData?.inputParameters === 'string' 
            ? safeParseJSON(editingNodeData.inputParameters, {}) 
            : editingNodeData?.inputParameters || {};
            
        const currentOutputParams = typeof editingNodeData?.outputParameters === 'string' 
            ? safeParseJSON(editingNodeData.outputParameters, {}) 
            : editingNodeData?.outputParameters || {};

        const newInput = seed(selectedTemplateDetails.inputParameters, currentInputParams);
        const newOutput = seed(selectedTemplateDetails.outputParameters, currentOutputParams);

        setEditingNodeData({
            ...editingNodeData,
            inputParameters: newInput,
            outputParameters: newOutput,
        });
    }, [isTemplateDriven, selectedTemplateDetails]); // Removed editingNodeData and setEditingNodeData from deps to avoid loops

    return (
        <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        Edit {editingNodeType === 'rule' ? 'Rule' : 'Action'} Node
                    </DialogTitle>
                    <DialogDescription>
                        Configure the {editingNodeType} properties and parameters below.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Label</label>
                        <Input
                            value={editingNodeData?.label || ''}
                            onChange={(e) => setEditingNodeData({ 
                                ...editingNodeData, 
                                label: e.target.value 
                            })}
                            placeholder="Enter node label"
                        />
                    </div>
                    
                    {editingNodeType === 'rule' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-2">Rule ID</label>
                                <Input
                                    value={editingNodeData?.ruleId || editingNodeData?.id || ''}
                                    onChange={(e) => setEditingNodeData({ 
                                        ...editingNodeData, 
                                        ruleId: e.target.value,
                                        id: e.target.value
                                    })}
                                    placeholder="Enter rule ID"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Expression</label>
                                <Textarea
                                    value={editingNodeData?.expression || ''}
                                    onChange={(e) => setEditingNodeData({ 
                                        ...editingNodeData, 
                                        expression: e.target.value 
                                    })}
                                    placeholder="Enter rule expression"
                                    rows={3}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Description</label>
                                <Textarea
                                    value={editingNodeData?.description || ''}
                                    onChange={(e) => setEditingNodeData({ 
                                        ...editingNodeData, 
                                        description: e.target.value 
                                    })}
                                    placeholder="Enter rule description"
                                    rows={2}
                                />
                            </div>
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="isInitiating"
                                    checked={editingNodeData?.isInitiating || false}
                                    onChange={(e) => setEditingNodeData({ 
                                        ...editingNodeData, 
                                        isInitiating: e.target.checked 
                                    })}
                                />
                                <label htmlFor="isInitiating" className="text-sm font-medium">
                                    Starting rule (initiating rule for chain)
                                </label>
                            </div>
                        </>
                    )}
                    
                    {editingNodeType === 'action' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-2">Action Type</label>
                                <Select 
                                    value={editingNodeData?.actionType || '__none__'} 
                                    onValueChange={(value) => setEditingNodeData({ 
                                        ...editingNodeData, 
                                        actionType: value === '__none__' ? '' : value,
                                        // Clear template-specific data when changing action type
                                        templateName: '',
                                        inputParameters: {},
                                        outputParameters: {}
                                    })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select Action Type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">-- Select Action Type --</SelectItem>
                                        {ACTION_OPTIONS.map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* TEMPLATE NAME (SELECT) — only show for template-driven actions */}
                            {isTemplateDriven && (
                                <div className="space-y-1">
                                    <label className="block text-sm font-medium">Template Name</label>

                                    {isLoadingTemplates && <p className="text-xs text-gray-400 italic">Loading templates…</p>}
                                    {!!templatesError && <p className="text-xs text-red-400">{templatesError}</p>}

                                    <Select
                                        value={editingNodeData?.templateName || "__none__"}
                                        onValueChange={(value) => setEditingNodeData({
                                            ...editingNodeData,
                                            templateName: value === "__none__" ? "" : value,
                                            // Clear params so the details effect can reseed with defaults
                                            inputParameters: {},
                                            outputParameters: {}
                                        })}
                                        disabled={isLoadingTemplates || !templateList.length}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="-- Select Template --" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">-- Select Template --</SelectItem>
                                            {templateList.map(t => (
                                                <SelectItem key={t.name} value={t.name}>
                                                    {t.name}{t.category ? ` (${t.category})` : ""}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {isLoadingDetails && <p className="text-xs text-gray-400 italic mt-1">Loading template details…</p>}
                                    {!!detailsError && <p className="text-xs text-red-400">{detailsError}</p>}
                                </div>
                            )}

                            {/* Template-driven Parameter Editors */}
                            {isTemplateDriven && selectedTemplateDetails?.inputParameters?.length > 0 && (
                                <div className="mt-3">
                                    <label className="block text-sm font-medium mb-2">Input Parameters</label>
                                    <div className="mt-2 space-y-2 p-3 border rounded-md bg-muted/50">
                                        {selectedTemplateDetails.inputParameters.map((p: any) => (
                                            <ParameterInput
                                                key={p.name}
                                                parameter={p}
                                                value={editingNodeData?.inputParameters?.[p.name]}
                                                onChange={(v: any) =>
                                                    setEditingNodeData({
                                                        ...editingNodeData,
                                                        inputParameters: { ...(editingNodeData?.inputParameters || {}), [p.name]: v }
                                                    })
                                                }
                                                paramType="InputParameters"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isTemplateDriven && selectedTemplateDetails?.outputParameters?.length > 0 && (
                                <div className="mt-3">
                                    <label className="block text-sm font-medium mb-2">Output Parameters</label>
                                    <div className="mt-2 space-y-2 p-3 border rounded-md bg-muted/50">
                                        {selectedTemplateDetails.outputParameters.map((p: any) => (
                                            <ParameterInput
                                                key={p.name}
                                                parameter={p}
                                                value={editingNodeData?.outputParameters?.[p.name]}
                                                onChange={(v: any) =>
                                                    setEditingNodeData({
                                                        ...editingNodeData,
                                                        outputParameters: { ...(editingNodeData?.outputParameters || {}), [p.name]: v }
                                                    })
                                                }
                                                paramType="OutputParameters"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Non-template-driven action fields */}
                            {editingNodeData?.actionType === 'RuleEvaluationAction' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Evaluation Type</label>
                                        <Select 
                                            value={editingNodeData?.evaluationType || '__none__'} 
                                            onValueChange={(value) => setEditingNodeData({ 
                                                ...editingNodeData, 
                                                evaluationType: value === '__none__' ? '' : value 
                                            })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Evaluation Type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__none__">-- Select Evaluation Type --</SelectItem>
                                                <SelectItem value="Single">Single</SelectItem>
                                                <SelectItem value="Competitive">Competitive</SelectItem>
                                                <SelectItem value="Parallel">Parallel</SelectItem>
                                                <SelectItem value="Hierarchical">Hierarchical</SelectItem>
                                                <SelectItem value="Composite">Composite</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Target Rule ID</label>
                                        <Input
                                            value={editingNodeData?.targetRuleId || ''}
                                            onChange={(e) => setEditingNodeData({ 
                                                ...editingNodeData, 
                                                targetRuleId: e.target.value 
                                            })}
                                            placeholder="Enter target rule ID"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Topic</label>
                                        <Input
                                            value={editingNodeData?.topic || ''}
                                            onChange={(e) => setEditingNodeData({ 
                                                ...editingNodeData, 
                                                topic: e.target.value 
                                            })}
                                            placeholder="Enter topic"
                                        />
                                    </div>
                                </>
                            )}
                            
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="isSuccess"
                                    checked={editingNodeData?.isSuccess !== false}
                                    onChange={(e) => setEditingNodeData({ 
                                        ...editingNodeData, 
                                        isSuccess: e.target.checked 
                                    })}
                                />
                                <label htmlFor="isSuccess" className="text-sm font-medium">
                                    Success action (unchecked = failure action)
                                </label>
                            </div>
                        </>
                    )}
                </div>
                
                <DialogFooter>
                    <Button 
                        variant="secondary" 
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button onClick={() => onSave(editingNodeData)}>
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// Enhanced Interactive Chain Flow Component with editing dialogs and smart connections
interface ChainFlowDiagramProps {
    chainData: ChainData | null;
    onNodeClick: (ruleId: string) => void;
    onChainUpdate?: (chainData: ChainData) => void;
    isLoading: boolean;
    isEditable?: boolean;
    dataServicesRootURI?: string;
}

function ChainFlowDiagramInner({ 
    chainData, 
    onNodeClick, 
    onChainUpdate,
    isLoading, 
    isEditable = true,
    dataServicesRootURI
}: ChainFlowDiagramProps) {
    const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
    const [selectedNode, setSelectedNode] = React.useState<string | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
    const [editingNodeData, setEditingNodeData] = React.useState<any>(null);
    const [editingNodeType, setEditingNodeType] = React.useState<'rule' | 'action'>('rule');
    const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);
    const { fitView, screenToFlowPosition } = useReactFlow();

    // Handle node editing
    const handleNodeEdit = React.useCallback((nodeId: string, nodeType: 'rule' | 'action', data?: any) => {
        setEditingNodeData(data || { id: nodeId });
        setEditingNodeType(nodeType);
        setSelectedNode(nodeId);
        setIsEditDialogOpen(true);
    }, []);

    // Handle node deletion
    const handleNodeDelete = React.useCallback((nodeId: string) => {
        if (window.confirm('Are you sure you want to delete this node?')) {
            setNodes(prevNodes => prevNodes.filter(n => n.id !== nodeId));
            setEdges(prevEdges => prevEdges.filter(e => e.source !== nodeId && e.target !== nodeId));
            
            if (onChainUpdate) {
                const newChainData = chainData ? { ...chainData } : { nodes: {}, edges: [] };
                delete newChainData.nodes[nodeId];
                newChainData.edges = newChainData.edges?.filter(e => 
                    e.from !== nodeId && e.to !== nodeId
                ) || [];
                onChainUpdate(newChainData);
            }
            
            toast.success('Node deleted from chain');
        }
    }, [setNodes, setEdges, onChainUpdate, chainData]);

    // Create stable callback references so the effect that converts chainData -> nodes
    // doesn't re-run due to changing handler references. We keep a ref to the
    // incoming onNodeClick prop and expose a stable function.
    const onNodeClickRef = React.useRef(onNodeClick);
    React.useEffect(() => { onNodeClickRef.current = onNodeClick; }, [onNodeClick]);

    const stableOnNodeClick = React.useCallback((ruleId: string) => {
        onNodeClickRef.current?.(ruleId);
    }, []);

    // The internal handlers are already memoized; expose stable aliases for clarity
    const stableHandleNodeEdit = handleNodeEdit;
    const stableHandleNodeDelete = React.useCallback((nodeId: string) => {
        handleNodeDelete(nodeId);
    }, [handleNodeDelete]);

    // Handle drag start - store the dragged node type
    const handleDragStart = React.useCallback((event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    }, []);

    // Handle drag over - allow drop
    const handleDragOver = React.useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    // Handle drop - create new node at dropped position
    const handleDrop = React.useCallback((event: React.DragEvent) => {
        event.preventDefault();

        if (!reactFlowInstance) return;

        const type = event.dataTransfer.getData('application/reactflow');
        if (!type) return;

        // Get the position where the node was dropped
        const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        const newNodeId = `${type}-${Date.now()}`;
        let newNode: Node;

        // Create different types of nodes based on what was dragged
        if (type === 'rule') {
            const newRuleId = generateRuleId();
            newNode = {
                id: newNodeId,
                type: 'ruleNode',
                position,
                data: {
                    label: `New Rule ${newRuleId}`,
                    ruleId: newRuleId,
                    expression: '',
                    isInitiating: false,
                    onClick: () => onNodeClick(newRuleId),
                    onEdit: () => handleNodeEdit(newNodeId, 'rule', {
                        id: newRuleId,
                        ruleId: newRuleId,
                        label: `New Rule ${newRuleId}`,
                        expression: '',
                        isInitiating: false
                    })
                },
                draggable: true,
                selectable: true,
                deletable: true
            };

            // Create the corresponding rule in jsonData when dropped
            const newRule = {
                ...DEFAULT_RULE_TEMPLATE,
                id: newRuleId,
                name: `New Rule ${newRuleId}`,
                description: "Business rule created from chain map template",
                typeIdentifier: "Business Rule" // Ensure consistent type identifier
            };
            
            // Set this as the current editing rule
            onNodeClick(newRuleId);
        } else if (type.startsWith('action-')) {
            // Extract action type from the dragged type
            const actionTypeMap: Record<string, string> = {
                'action-workflow': 'ExecuteOrchestratorWorkflowAction',
                'action-scheduler': 'ExecuteGbgSchedulerProcessAction'
            };

            const actionType = actionTypeMap[type] || 'UnknownAction';
            const actionLabel = type.replace('action-', '').replace(/^\w/, c => c.toUpperCase());

            newNode = {
                id: newNodeId,
                type: 'actionNode',
                position,
                data: {
                    label: `New ${actionLabel}`,
                    actionType: actionType,
                    isSuccess: true, // Default to success action
                    onEdit: () => handleNodeEdit(newNodeId, 'action', {
                        id: newNodeId,
                        label: `New ${actionLabel}`,
                        actionType: actionType
                    }),
                    onDelete: () => handleNodeDelete(newNodeId)
                },
                draggable: true,
                selectable: true,
                deletable: true
            };
        } else {
            // Fallback for unknown types
            newNode = {
                id: newNodeId,
                type: 'errorNode',
                position,
                data: {
                    label: `Unknown: ${type}`,
                    message: 'Unsupported node type',
                    onDelete: () => handleNodeDelete(newNodeId)
                },
                draggable: true,
                selectable: true,
                deletable: true
            };
        }

        // Add the new node to the flow
        setNodes((nds) => [...nds, newNode]);

        // Update chain data if callback is provided
        if (onChainUpdate) {
            const newChainData = chainData ? { ...chainData } : { nodes: {}, edges: [] };
            if (!newChainData.nodes) newChainData.nodes = {};
            
            // Add the new node to chain data with proper business rule structure
            const chainNode: ChainNode = {
                id: newNode.type === 'ruleNode' ? (newNode.data.ruleId as string) : newNodeId,
                label: (newNode.data.label as string) || 'Unknown',
                expression: typeof newNode.data.expression === 'string' ? newNode.data.expression : '',
                isInitiating: false,
                isError: false // Never show error nodes
            };

            // For action nodes, store the action type in a way that can be used later
            if (newNode.type === 'actionNode' && newNode.data.actionType) {
                // Store action type for action nodes (these are separate from rule nodes)
                chainNode.actionType = String(newNode.data.actionType);
                chainNode.templateName = String(newNode.data.templateName || '');
                chainNode.inputParameters = (newNode.data.inputParameters && typeof newNode.data.inputParameters === 'object') ? newNode.data.inputParameters : {};
                chainNode.outputParameters = (newNode.data.outputParameters && typeof newNode.data.outputParameters === 'object') ? newNode.data.outputParameters : {};
            }
            
            // Use the correct node ID (rule ID for rule nodes, node ID for others)
            const nodeKey = newNode.type === 'ruleNode' ? (newNode.data.ruleId as string) : newNodeId;
            newChainData.nodes[nodeKey] = chainNode;
            onChainUpdate(newChainData);
        }

        toast.success(`${newNode.data.label} added to chain map`);
    }, [reactFlowInstance, screenToFlowPosition, onNodeClick, handleNodeEdit, handleNodeDelete, onChainUpdate, chainData]);

    // Handle connection creation with canonical approach
    const onConnect = React.useCallback((connection: Connection) => {
        // Detailed debug logging for connections and handle ids
        console.log('CONNECTION OBJECT:', {
            source: connection.source,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetHandle: connection.targetHandle,
            raw: connection
        });

        if (!isEditable || !connection.source || !connection.target) return;

        if (!connection.sourceHandle || !connection.targetHandle) {
            console.error('MISSING HANDLE IDS in connection. sourceHandle or targetHandle is null/undefined');
        }

        // Determine connection type based on source handle
        let connectionType: 'success' | 'failure' | 'connection' = 'connection';
        let connectionColor = '#6366f1'; // Default blue
        
        if (connection.sourceHandle === 'success') {
            connectionType = 'success';
            connectionColor = '#22c55e'; // Green
        } else if (connection.sourceHandle === 'failure') {
            connectionType = 'failure';
            connectionColor = '#ef4444'; // Red
        }
        
        // Use addEdge to properly create the edge
        const newEdge: Edge = {
            id: `edge-${Date.now()}`,
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle,
            targetHandle: connection.targetHandle,
            type: 'custom',
            animated: false,
            style: {
                stroke: connectionColor,
                strokeWidth: 2
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: connectionColor
            },
            data: {
                type: connectionType
            },
            deletable: true
        };

        setEdges((eds) => addEdge(newEdge, eds));
        
        // Update chain data
        if (onChainUpdate) {
            const newChainData = chainData ? { ...chainData } : { nodes: {}, edges: [] };
            if (!newChainData.edges) newChainData.edges = [];
            newChainData.edges.push({
                from: connection.source,
                to: connection.target,
                type: connectionType,
                label: connectionType === 'success' ? 'Success' : connectionType === 'failure' ? 'Failure' : 'Connected'
            });
            onChainUpdate(newChainData);
        }
        
        const connectionLabel = connectionType === 'success' ? 'Success connection' : 
                              connectionType === 'failure' ? 'Failure connection' : 
                              'Connection';
        toast.success(`${connectionLabel} created successfully`);
    }, [isEditable, setEdges, onChainUpdate, chainData]);

    const handleNodesChange = React.useCallback((changes: NodeChange[]) => {
        setNodes((nds) => applyNodeChanges(changes, nds));
    }, [setNodes]);

    const handleEdgesChange = React.useCallback((changes: EdgeChange[]) => {
        setEdges((eds) => applyEdgeChanges(changes, eds));
        
        const removedEdges = changes.filter(change => change.type === 'remove');
        if (removedEdges.length > 0 && onChainUpdate) {
            const newChainData = chainData ? { ...chainData } : { nodes: {}, edges: [] };
            removedEdges.forEach(change => {
                if ('id' in change) {
                    newChainData.edges = newChainData.edges?.filter(edge => 
                        `edge-${newChainData.edges!.indexOf(edge)}` !== change.id
                    ) || [];
                }
            });
            onChainUpdate(newChainData);
        }
    }, [setEdges, onChainUpdate, chainData]);

    React.useEffect(() => {
        if (chainData && Object.keys(chainData.nodes).length > 0) {
            const { nodes: newNodes, edges: newEdges } = convertToReactFlowFormat(
                chainData, 
                stableOnNodeClick, 
                stableHandleNodeEdit, 
                stableHandleNodeDelete
            );

            // Preserve manually adjusted positions
            setNodes((currentNodes) => {
                const positionMap = new Map(currentNodes.map(n => [n.id, n.position]));
                return newNodes.map(node => ({
                    ...node,
                    position: positionMap.get(node.id) || node.position
                }));
            });

            setEdges(newEdges);
        } else {
            // Always start with blank canvas
            setNodes([]);
            setEdges([]);
        }
        // Intentionally depend only on chainData to avoid re-running on UI interactions
    }, [chainData]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-foreground">
                    <SpinnerGap size={32} className="animate-spin mx-auto mb-2" />
                    <div>Loading chain map...</div>
                </div>
            </div>
        );
    }

    // Always show blank canvas - no "no data" message
    // if (!chainData || Object.keys(chainData.nodes).length === 0) {
    //     return (
    //         <div className="flex items-center justify-center h-full">
    //             <div className="text-center text-gray-400">
    //                 <Network size={48} className="mx-auto mb-4 opacity-50" />
    //                 <p>No chain data available</p>
    //                 <p className="text-sm mt-2">Select a starting rule to generate the interactive chain map</p>
    //             </div>
    //         </div>
    //     );
    // }

    return (
        <div className="w-full h-full bg-background relative">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesConnectable={true}
                elementsSelectable={true}
                connectionMode={ConnectionMode.Strict}
                connectionLineType={ConnectionLineType.SmoothStep}
                connectionRadius={36}
                connectionLineStyle={{
                    strokeWidth: 4,
                    stroke: '#6366f1',
                    strokeDasharray: '8,4',
                    filter: 'drop-shadow(0 0 8px #6366f1)'
                }}
                snapToGrid={true}
                snapGrid={[15, 15]}
                fitView
                fitViewOptions={{
                    padding: 0.1,
                    includeHiddenNodes: false
                }}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                minZoom={0.2}
                maxZoom={1.5}
                attributionPosition="bottom-left"
                selectNodesOnDrag={false}
                multiSelectionKeyCode="Shift"
                deleteKeyCode="Delete"
                onNodeClick={(_, node) => setSelectedNode(node.id)}
                onInit={setReactFlowInstance}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    animated: false,
                    style: { strokeWidth: 2 }
                }}
            >
                <Background 
                    className="bg-background"
                    color="hsl(var(--border))" 
                    gap={16} 
                    size={0.5}
                    variant={BackgroundVariant.Dots}
                />
                <Controls 
                    className="bg-card border-border text-foreground"
                    showInteractive={true}
                />
                <MiniMap 
                    className="bg-card border border-border"
                    maskColor="hsl(var(--background) / 0.1)"
                    nodeColor={(node) => {
                        if (node.type === 'errorNode') return '#dc2626';
                        if (node.type === 'actionNode') {
                            const actionType = (node.data?.actionType || '') as string;
                            if (actionType.includes('RuleEvaluation')) return '#14b8a6'; // teal
                            if (actionType.includes('OrchestratorWorkflow')) return '#a855f7'; // purple
                            if (actionType.includes('GbgScheduler')) return '#10b981'; // emerald
                            return node.data?.isSuccess ? '#16a34a' : '#dc2626';
                        }
                        return '#2563eb'; // Rule nodes are blue
                    }}
                    nodeStrokeWidth={1}
                />

                {isEditable && (
                    <Panel position="top-right" className="bg-card/90 border border-border rounded p-3">
                        <div className="text-foreground space-y-2">
                            <h3 className="font-medium text-xs">Chain Editor</h3>
                            <div className="text-xs space-y-1 text-muted-foreground">
                                <div>• <span className="text-blue-300">Click nodes</span> to edit properties</div>
                                <div>• <span className="text-green-400">Small green circles</span> = Success paths</div>
                                <div>• <span className="text-red-400">Small red circles</span> = Failure paths</div>
                                <div>• <span className="text-gray-300">Small gray circles</span> = Input connections</div>
                                <div>• <span className="text-yellow-300">Drag from circles</span> to connect nodes</div>
                                <div>• <span className="text-red-300">Del key</span> to remove selection</div>
                                <div>• <span className="text-purple-300">Hover handles</span> to see connection points</div>
                            </div>
                        </div>
                    </Panel>
                )}

                {isEditable && (
                    <Panel position="top-left">
                        <RulePalette onDragStart={handleDragStart} />
                    </Panel>
                )}
            </ReactFlow>

            {/* Enhanced Edit Dialog with Template Support */}
            {isEditDialogOpen && editingNodeData && (
                <EditActionNodeDialog
                    open={isEditDialogOpen}
                    onClose={() => setIsEditDialogOpen(false)}
                    editingNodeType={editingNodeType}
                    editingNodeData={editingNodeData}
                    setEditingNodeData={setEditingNodeData}
                    onSave={(updatedData) => {
                        // Update the node in the chain
                        if (onChainUpdate && selectedNode) {
                            const newChainData = chainData ? { ...chainData } : { nodes: {}, edges: [] };
                            if (newChainData.nodes[selectedNode]) {
                                newChainData.nodes[selectedNode] = {
                                    ...newChainData.nodes[selectedNode],
                                    ...updatedData
                                };
                                onChainUpdate(newChainData);
                            }
                        }
                        
                        setIsEditDialogOpen(false);
                        toast.success('Node updated successfully');
                    }}
                    dataServicesRootURI={dataServicesRootURI || ""}
                />
            )}
        </div>
    );
}

// Wrapper component with ReactFlowProvider
const ChainFlowDiagram = React.memo(function ChainFlowDiagram(props: ChainFlowDiagramProps) {
    return (
        <ReactFlowProvider>
            <ChainFlowDiagramInner {...props} />
        </ReactFlowProvider>
    );
});

// --------------------------------------------------------------------------
// n8n Workflow Editor (iframe embed) - Option 1 quick integration
// --------------------------------------------------------------------------
const N8nWorkflowEditor: React.FC<{
    workflowData?: any;
    isLoading: boolean;
}> = ({ workflowData, isLoading }) => {
    const [n8nUrl] = React.useState('http://localhost:5678');
    const [isN8nReady, setIsN8nReady] = React.useState(false);

    React.useEffect(() => {
        let mounted = true;

        const tryImagePing = (url: string) => new Promise<boolean>((resolve) => {
            try {
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                // Append a cache buster
                img.src = `${url.replace(/\/$/, '')}/favicon.ico?cb=${Date.now()}`;
                // Fallback timeout
                setTimeout(() => resolve(false), 3000);
            } catch {
                resolve(false);
            }
        });

        const checkN8n = async () => {
            try {
                const response = await fetch(`${n8nUrl}/healthz`, { mode: 'cors' });
                if (!mounted) return;
                if (response.ok) {
                    setIsN8nReady(true);
                    return;
                }
            } catch (e) {
                // CORS or network error - fallback to image ping
            }

            // Try an image ping to detect a running n8n instance even if CORS blocks /healthz
            try {
                const ok = await tryImagePing(n8nUrl);
                if (!mounted) return;
                setIsN8nReady(ok);
            } catch {
                if (!mounted) return;
                setIsN8nReady(false);
            }
        };

        checkN8n();
        const iv = setInterval(checkN8n, 5000);
        return () => { mounted = false; clearInterval(iv); };
    }, [n8nUrl]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <SpinnerGap size={32} className="animate-spin" />
                <div>Loading workflow...</div>
            </div>
        );
    }

    if (!isN8nReady) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
                <h3 className="text-xl font-semibold">n8n Not Running</h3>
                <p className="text-muted-foreground text-center max-w-md">
                    Start n8n to use the workflow editor:
                </p>
                <code className="bg-muted px-4 py-2 rounded font-mono text-sm">
                    n8n start
                </code>
                <p className="text-xs text-muted-foreground">Then refresh this page</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative">
            <iframe
                src={`${n8nUrl}/workflow/new`}
                className="w-full h-full border-0"
                title="n8n Workflow Editor"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
        </div>
    );
};

// ==========================================================================
// React Components
// ==========================================================================

// Template Parameter Input Component (from old code)
interface ParameterInputProps {
    parameter: {
        name: string;
        valueType?: string;
        valueOptions?: string[];
        defaultValue?: any;
        description?: string;
        tags?: string[];
    };
    value: any;
    onChange: (value: any) => void;
    paramType: string;
}

const ParameterInput: React.FC<ParameterInputProps> = ({ parameter, value, onChange, paramType }) => {
    if (!parameter || typeof parameter !== 'object' || !parameter.name) return null;
    
    const { name, valueType, valueOptions, defaultValue, description, tags } = parameter;
    const id = `${paramType}-${name.replace(/[^a-zA-Z0-9]/g, '_')}`;

    if (Array.isArray(valueOptions) && valueOptions.length > 0) {
        return (
            <div>
                <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1" title={description || name}>
                    {name} {tags && <span className="text-muted-foreground text-xs">({tags.join(', ')})</span>}
                </label>
                <Select value={value ?? defaultValue ?? "__none__"} onValueChange={(newValue) => onChange(newValue === "__none__" ? "" : newValue)}>
                    <SelectTrigger id={id} className="text-sm">
                        <SelectValue placeholder={`-- Select ${name} --`} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__">-- Select {name} --</SelectItem>
                        {valueOptions.map(opt => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        );
    } else {
        return (
            <div>
                <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1" title={description || name}>
                    {name} {tags && <span className="text-muted-foreground text-xs">({tags.join(', ')})</span>}
                </label>
                <Input
                    id={id}
                    value={value ?? defaultValue ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={defaultValue ? `Default: ${defaultValue}` : `Enter ${name}`}
                    className="text-sm"
                />
            </div>
        );
    }
};

// Rule Selector Component
interface RuleSelectorProps {
    dataServicesRootURI: string;
    onRuleSelect: (ruleId: string) => void;
    value: string;
    className?: string;
    placeholder?: string;
    title?: string;
    filterFn?: ((rule: any) => boolean) | null;
    rulesList?: any[] | null;
}

const RuleSelector: React.FC<RuleSelectorProps> = ({ 
    dataServicesRootURI, 
    onRuleSelect, 
    value, 
    className = "w-full text-sm", 
    placeholder = "-- Select Rule --", 
    title = "Select a rule", 
    filterFn = null, 
    rulesList = null 
}) => {
    const [availableRules, setAvailableRules] = React.useState<any[]>([]);
    const [filteredRules, setFilteredRules] = React.useState<any[]>([]);
    const [searchTerm, setSearchTerm] = React.useState("");
    const [isLoading, setIsLoading] = React.useState(false);
    const [errorMessage, setErrorMessage] = React.useState("");
    
    const sortRulesByName = (rules: any[]) => [...rules].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
    
    const fetchAndSetRules = React.useCallback(async () => {
        if (!dataServicesRootURI) {
            setErrorMessage("Data Services URL not set.");
            setAvailableRules([]);
            setFilteredRules([]);
            return;
        }
        
        setIsLoading(true);
        setErrorMessage("");
        
        try {
            const rules = await apiFetchRules(dataServicesRootURI);
            const validRules = Array.isArray(rules) ? rules : [];
            const sortedRules = sortRulesByName(validRules);
            setAvailableRules(sortedRules);
            
            const initialFiltered = filterFn ? sortedRules.filter(filterFn) : sortedRules;
            setFilteredRules(initialFiltered);
            
            // Log for debugging
            console.log(`RuleSelector: Found ${validRules.length} Business Rule type rules from API`);
            if (validRules.length > 0) {
                console.log('Sample rules:', validRules.slice(0, 3).map(r => ({
                    id: r.id || r.identifier,
                    name: r.name,
                    typeIdentifier: r.typeIdentifier
                })));
            }
        } catch (error: any) {
            let displayMessage = error.message;
            
            // Truncate very long error messages for UI
            if (displayMessage.length > 200) {
                displayMessage = displayMessage.substring(0, 200) + '... (See browser console for full details)';
            }
            
            setErrorMessage(`Connection failed: ${displayMessage}`);
            setAvailableRules([]);
            setFilteredRules([]);
            
            // Also log full error to console for debugging
            console.error('Full error details:', error);
            
            // Show toast with retry option if CORS proxy is available
            if (error.retryWithProxy) {
                toast.error('CORS Error - Check console for details', {
                    action: {
                        label: 'Try with proxy',
                        onClick: async () => {
                            try {
                                setIsLoading(true);
                                const rules = await apiFetchRules(dataServicesRootURI, true);
                                const validRules = Array.isArray(rules) ? rules : [];
                                const sortedRules = sortRulesByName(validRules);
                                setAvailableRules(sortedRules);
                                setFilteredRules(filterFn ? sortedRules.filter(filterFn) : sortedRules);
                                setErrorMessage("");
                                toast.success('Connected via CORS proxy');
                            } catch (proxyError: any) {
                                toast.error('Proxy connection also failed');
                                console.error('Proxy error:', proxyError);
                            } finally {
                                setIsLoading(false);
                            }
                        }
                    }
                });
            }
        } finally {
            setIsLoading(false);
        }
    }, [dataServicesRootURI, filterFn]);
    
    React.useEffect(() => {
        if (rulesList && Array.isArray(rulesList)) {
            const sortedRules = sortRulesByName(rulesList);
            setAvailableRules(sortedRules);
            setFilteredRules(filterFn ? sortedRules.filter(filterFn) : sortedRules);
            setErrorMessage("");
        } else if (dataServicesRootURI) {
            fetchAndSetRules();
        } else {
            setAvailableRules([]);
            setFilteredRules([]);
            setErrorMessage("Data Services URL not set.");
        }
    }, [rulesList, dataServicesRootURI, fetchAndSetRules, filterFn]);
    
    React.useEffect(() => {
        const term = searchTerm.toLowerCase().trim();
        const baseList = filterFn ? availableRules.filter(filterFn) : availableRules;
        
        if (!term) {
            setFilteredRules(baseList);
        } else {
            const searchFiltered = baseList.filter(rule => 
                rule?.name?.toLowerCase().includes(term) || 
                rule?.id?.toLowerCase().includes(term) || 
                rule?.identifier?.toLowerCase().includes(term)
            );
            setFilteredRules(searchFiltered);
        }
    }, [searchTerm, availableRules, filterFn]);
    
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <Input
                    className="flex-grow text-sm"
                    placeholder="Search rules..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    disabled={isLoading || (!dataServicesRootURI && !rulesList)}
                />
                {!rulesList && dataServicesRootURI && (
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={fetchAndSetRules}
                        disabled={isLoading || !dataServicesRootURI}
                        title="Refresh rule list"
                        className="gap-1"
                    >
                        {isLoading ? <SpinnerGap size={14} className="animate-spin" /> : "↻"}
                    </Button>
                )}
            </div>
            
            {errorMessage && (
                <p className="text-red-400 text-xs px-1">{errorMessage}</p>
            )}
            
            <Select
                value={value || "__empty__"}
                onValueChange={(newValue) => {
                    const actualValue = newValue === "__empty__" ? "" : newValue;
                    onRuleSelect(actualValue);
                }}
                disabled={isLoading || (!dataServicesRootURI && !rulesList) || filteredRules.length === 0}
            >
                <SelectTrigger className={className} title={isLoading ? "Loading..." : title}>
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__empty__">{placeholder}</SelectItem>
                    {filteredRules.map(rule => {
                        if (!rule || !(rule.identifier || rule.id)) return null;
                        const ruleId = rule.identifier || rule.id;
                        const ruleName = rule.name || "Unnamed Rule";
                        const key = `${ruleId}-${ruleName}`;
                        return (
                            <SelectItem key={key} value={ruleId}>
                                {ruleName} ({ruleId})
                            </SelectItem>
                        );
                    })}
                    {filteredRules.length === 0 && !isLoading && !errorMessage && (
                        <SelectItem disabled value="__no_match__">No Business Rule templates found</SelectItem>
                    )}
                    {filteredRules.length === 0 && !isLoading && errorMessage && (
                        <SelectItem disabled value="__error__">Connection error - check Data Services</SelectItem>
                    )}
                    {isLoading && (
                        <SelectItem disabled value="__loading__">Loading...</SelectItem>
                    )}
                </SelectContent>
            </Select>
        </div>
    );
};

// Chain Map Selection Dialog Component
interface ChainMapDialogProps {
    isOpen: boolean;
    onClose: () => void;
    dataServicesRootURI: string;
    onStartRuleSelect: (ruleId: string) => void;
    currentRuleId?: string;
    onCreateNewRule: (newRule: Rule) => void; // Add this prop
}

const ChainMapDialog: React.FC<ChainMapDialogProps> = ({ 
    isOpen, 
    onClose, 
    dataServicesRootURI, 
    onStartRuleSelect,
    currentRuleId,
    onCreateNewRule // Add this prop
}) => {
    const [selectedRuleId, setSelectedRuleId] = React.useState("");
    
    React.useEffect(() => {
        if (isOpen) {
            // Pre-select current rule if available
            setSelectedRuleId(currentRuleId || "");
        }
    }, [isOpen, currentRuleId]);
    
    const handleRuleSelect = React.useCallback((ruleId: string) => {
        setSelectedRuleId(ruleId);
    }, []);
    
    const handleConfirm = React.useCallback(() => {
        if (selectedRuleId) {
            onStartRuleSelect(selectedRuleId);
            onClose();
        }
    }, [selectedRuleId, onStartRuleSelect, onClose]);

    const handleUseCurrentRule = React.useCallback(() => {
        if (currentRuleId) {
            onStartRuleSelect(currentRuleId);
            onClose();
        }
    }, [currentRuleId, onStartRuleSelect, onClose]);
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Generate Rule Chain Map</DialogTitle>
                    <DialogDescription>
                        Select the starting rule for the chain map visualization. Only Business Rule templates are shown.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4 space-y-4">
                    {/* Create New Rule Option */}
                    <div className="p-3 bg-green-900/20 border border-green-600/30 rounded">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-medium text-sm text-green-400">Create New Rule</h4>
                                <p className="text-xs text-green-200">
                                    Start by creating a new rule as the beginning of your chain
                                </p>
                            </div>
                            <Button 
                                onClick={() => {
                                    const newRuleId = generateRuleId();
                                    const newRule = {
                                        ...DEFAULT_RULE_TEMPLATE,
                                        id: newRuleId,
                                        name: `New Chain Rule ${newRuleId}`,
                                        description: "Starting rule for new rule chain",
                                        typeIdentifier: "Business Rule" // Ensure consistent type identifier
                                    };
                                    onCreateNewRule(newRule);
                                    onStartRuleSelect(newRuleId);
                                    onClose();
                                    toast.success(`New rule created: ${newRuleId}`);
                                }}
                                size="sm"
                                className="gap-2 bg-green-600 hover:bg-green-700"
                            >
                                <FilePlus size={14} />
                                Create & Start
                            </Button>
                        </div>
                    </div>

                    {/* Current Rule Option */}
                    {currentRuleId && (
                        <div className="p-3 bg-muted/50 border rounded">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium text-sm">Use Current Rule</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Start from the rule currently being edited
                                    </p>
                                    <p className="text-xs font-mono text-primary mt-1">
                                        {currentRuleId}
                                    </p>
                                </div>
                                <Button 
                                    onClick={handleUseCurrentRule}
                                    size="sm"
                                    className="gap-2"
                                >
                                    <Network size={14} />
                                    Use This Rule
                                </Button>
                            </div>
                        </div>
                    )}
                    
                    {/* Rule Selector */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Or select an existing rule:</label>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                    if (!dataServicesRootURI) {
                                        toast.error("Data Services URL not configured");
                                        return;
                                    }
                                    
                                    try {
                                        toast.info("Testing Business Rule API...");
                                        const rules = await apiFetchRules(dataServicesRootURI);
                                        const businessRules = rules.filter(r => r.typeIdentifier === "Business Rule");
                                        toast.success(`Found ${businessRules.length} Business Rule templates (${rules.length} total rules)`);
                                        console.log("Business Rules found:", businessRules.map(r => ({
                                            id: r.id || r.identifier,
                                            name: r.name,
                                            typeIdentifier: r.typeIdentifier
                                        })));
                                    } catch (error: any) {
                                        toast.error(`API test failed: ${error.message}`);
                                        console.error("API test error:", error);
                                    }
                                }}
                                className="text-xs"
                            >
                                Test API
                            </Button>
                        </div>
                        <RuleSelector
                            dataServicesRootURI={dataServicesRootURI}
                            onRuleSelect={handleRuleSelect}
                            value={selectedRuleId}
                            placeholder="-- Select starting rule --"
                            title="Select rule to start chain map from"
                            filterFn={(rule) => rule?.typeIdentifier === "Business Rule"}
                        />
                    </div>
                </div>
                
                <DialogFooter>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!selectedRuleId}>
                        Generate Chain Map
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
interface ImportRuleDialogProps {
    isOpen: boolean;
    onClose: () => void;
    dataServicesRootURI: string;
    onRuleImport: (ruleId: string) => void;
}

const ImportRuleDialog: React.FC<ImportRuleDialogProps> = ({ 
    isOpen, 
    onClose, 
    dataServicesRootURI, 
    onRuleImport 
}) => {
    const [selectedRuleId, setSelectedRuleId] = React.useState("");
    
    React.useEffect(() => {
        if (isOpen) setSelectedRuleId("");
    }, [isOpen]);
    
    const handleRuleSelect = React.useCallback((ruleId: string) => {
        setSelectedRuleId(ruleId);
    }, []);
    
    const handleConfirm = React.useCallback(() => {
        if (selectedRuleId) {
            onRuleImport(selectedRuleId);
            onClose();
        }
    }, [selectedRuleId, onRuleImport, onClose]);
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Import Rule from Data Services</DialogTitle>
                    <DialogDescription>
                        Select an existing rule to load into the editor.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                    <RuleSelector
                        dataServicesRootURI={dataServicesRootURI}
                        onRuleSelect={handleRuleSelect}
                        value={selectedRuleId}
                        placeholder="-- Select rule to import --"
                        title="Select rule to import"
                    />
                </div>
                
                <DialogFooter>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirm} disabled={!selectedRuleId}>
                        Import Rule
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// Response Dialog Component
interface ResponseDialogProps {
    isOpen: boolean;
    onClose: () => void;
    details: {
        success: boolean;
        title?: string;
        message?: string;
        endpoint?: string;
        status?: string;
        rawResponse?: string;
    } | null;
}

const ResponseDialog: React.FC<ResponseDialogProps> = ({ 
    isOpen, 
    onClose, 
    details 
}) => {
    if (!details) return null;
    
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast.success('Copied to clipboard');
        }).catch(() => {
            toast.error('Failed to copy to clipboard');
        });
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader className="pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        {details.success ? (
                            <CheckCircle size={20} className="text-green-400" />
                        ) : (
                            <XCircle size={20} className="text-red-400" />
                        )}
                        {details.title || (details.success ? "Success" : "Error")}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        API Response Details
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-3 text-sm py-3 max-h-96 overflow-y-auto">
                    {details.message && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="font-medium text-muted-foreground">Message</h3>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => copyToClipboard(details.message || '')}
                                    className="h-6 px-2 text-xs"
                                >
                                    Copy
                                </Button>
                            </div>
                            <p className="whitespace-pre-wrap text-foreground bg-muted p-3 rounded text-xs">
                                {details.message}
                            </p>
                        </div>
                    )}
                    
                    {details.endpoint && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="font-medium text-muted-foreground">Endpoint</h3>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => copyToClipboard(details.endpoint || '')}
                                    className="h-6 px-2 text-xs"
                                >
                                    Copy
                                </Button>
                            </div>
                            <p className="text-foreground text-xs break-all bg-muted p-2 rounded font-mono">
                                {details.endpoint}
                            </p>
                        </div>
                    )}
                    
                    {details.status && (
                        <div>
                            <h3 className="font-medium text-muted-foreground">Status</h3>
                            <p className="text-foreground text-xs bg-muted p-2 rounded">{details.status}</p>
                        </div>
                    )}
                    
                    {details.rawResponse && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="font-medium text-muted-foreground">Raw Response</h3>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => copyToClipboard(details.rawResponse || '')}
                                    className="h-6 px-2 text-xs"
                                >
                                    Copy
                                </Button>
                            </div>
                            <pre className="whitespace-pre-wrap bg-muted p-3 rounded text-xs text-muted-foreground max-h-40 overflow-y-auto">
                                {details.rawResponse}
                            </pre>
                        </div>
                    )}
                    
                    {!details.success && (
                        <div className="mt-4 space-y-4">
                            <div className="p-3 bg-yellow-900/20 border border-yellow-600/30 rounded">
                                <h3 className="font-medium text-yellow-400 mb-2">🔧 Quick Fixes</h3>
                                <ul className="text-xs text-yellow-200 space-y-1 list-disc list-inside">
                                    <li>Verify the Data Services API is running on the correct port</li>
                                    <li>Check if the URL is correct and accessible</li>
                                    <li>Ensure CORS is configured to allow requests from this origin</li>
                                    <li>Test the endpoint manually with curl or Postman</li>
                                    <li>Check browser console Network tab for detailed error information</li>
                                </ul>
                            </div>
                            
                            <div className="p-3 bg-blue-900/20 border border-blue-600/30 rounded">
                                <h3 className="font-medium text-blue-400 mb-2">🏠 Local Development</h3>
                                <div className="text-xs text-blue-200 space-y-2">
                                    <p><strong>Quick Test Server:</strong> If Data Services isn't running, use the included test server:</p>
                                    <p className="font-mono bg-blue-950/50 p-2 rounded">
                                        # Start CORS-enabled test server<br/>
                                        node cors-test-server.js 8105
                                    </p>
                                    <p><strong>Check if service is running:</strong></p>
                                    <p className="font-mono bg-blue-950/50 p-2 rounded">
                                        lsof -i :8105 || netstat -an | grep :8105
                                    </p>
                                    <p><strong>Test basic connectivity:</strong></p>
                                    <p className="font-mono bg-blue-950/50 p-2 rounded">
                                        curl -v http://localhost:8105/api/health
                                    </p>
                                </div>
                            </div>

                            <div className="p-3 bg-purple-900/20 border border-purple-600/30 rounded">
                                <h3 className="font-medium text-purple-400 mb-2">☁️ AWS/Cloud Deployment</h3>
                                <ul className="text-xs text-purple-200 space-y-1 list-disc list-inside">
                                    <li>Verify security groups allow inbound traffic on the correct port</li>
                                    <li>Check load balancer health checks and target group configuration</li>
                                    <li>Ensure API Gateway CORS settings are configured properly</li>
                                    <li>Verify Lambda function CORS response headers if using serverless</li>
                                    <li>Test from within the same VPC to isolate network issues</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
                
                <DialogFooter>
                    <Button onClick={onClose}>
                        OK
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// Action Editor Component with template support
interface ActionEditorProps {
    action: Action;
    onChange: (action: Action) => void;
    dataServicesRootURI?: string;
}

const ActionEditor: React.FC<ActionEditorProps> = ({ action, onChange, dataServicesRootURI }) => {
    const currentAction: Action = (action && typeof action === 'object' && 'ActionType' in action) ? action : { 
        _uid: (action as any)?._uid || generateUid(),
        ActionType: ""
    };
    
    const { _uid } = currentAction;
    const currentActionType = currentAction.ActionType || "none";
    const supported = isSupportedAction(currentActionType);
    const isTemplateDriven = isTemplateDrivenAction(currentActionType);

    // Template state
    const [templateList, setTemplateList] = React.useState<any[]>([]);
    const [selectedTemplateDetails, setSelectedTemplateDetails] = React.useState<any>(null);
    const [isLoadingTemplates, setIsLoadingTemplates] = React.useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = React.useState(false);
    const [errorTemplates, setErrorTemplates] = React.useState('');
    const [errorDetails, setErrorDetails] = React.useState('');

    const stableOnChange = React.useCallback(onChange, []);

    // Fetch templates when action type changes to template-driven
    React.useEffect(() => {
        if (isTemplateDriven && dataServicesRootURI) {
            const fetchTemplates = async () => {
                setIsLoadingTemplates(true);
                setErrorTemplates('');
                setTemplateList([]);
                
                try {
                    const templates = await apiFetchOrderTemplates(dataServicesRootURI);
                    const validTemplates = Array.isArray(templates) ? templates : [];
                    const sortedTemplates = [...validTemplates].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
                    setTemplateList(sortedTemplates);
                } catch (err: any) {
                    setErrorTemplates(`Templates Error: ${err.message}`);
                } finally {
                    setIsLoadingTemplates(false);
                }
            };
            
            fetchTemplates();
        } else if (!isTemplateDriven) {
            setTemplateList([]);
        }
    }, [isTemplateDriven, dataServicesRootURI]);

    // Fetch template details when template name changes
    React.useEffect(() => {
        let isMounted = true;
        const templateName = (currentAction as any).TemplateName;
        
        if (isTemplateDriven && templateName && dataServicesRootURI) {
            const fetchDetails = async () => {
                setIsLoadingDetails(true);
                setErrorDetails('');
                setSelectedTemplateDetails(null);
                
                try {
                    const details = await apiFetchOrderTemplateDetails(dataServicesRootURI, templateName);
                    if (isMounted) setSelectedTemplateDetails(details || null);
                } catch (err: any) {
                    if (isMounted) setErrorDetails(`Details Error: ${err.message}`);
                } finally {
                    if (isMounted) setIsLoadingDetails(false);
                }
            };
            
            fetchDetails();
        } else {
            setSelectedTemplateDetails(null);
            setErrorDetails('');
            setIsLoadingDetails(false);
        }
        
        return () => { isMounted = false; };
    }, [isTemplateDriven, (currentAction as any).TemplateName, dataServicesRootURI]);

    // Auto-populate template parameters with defaults
    React.useEffect(() => {
        if (selectedTemplateDetails && isTemplateDriven) {
            let paramsChanged = false;
            
            const processParams = (paramList: any[], paramKey: string) => {
                const defaults: Record<string, any> = {};
                if (paramList?.length) {
                    paramList.forEach(p => {
                        if (p.defaultValue !== undefined && p.defaultValue !== null) {
                            defaults[p.name] = p.defaultValue;
                        }
                    });
                }
                
                const currentParams = (currentAction as any)[paramKey] || {};
                const newParams = { ...defaults, ...currentParams };
                
                if (safeStringifyJSON(newParams) !== safeStringifyJSON(currentParams)) {
                    paramsChanged = true;
                    return newParams;
                }
                return currentParams;
            };

            const newInputs = processParams(selectedTemplateDetails.inputParameters, 'InputParameters');
            const newOutputs = processParams(selectedTemplateDetails.outputParameters, 'OutputParameters');

            if (paramsChanged) {
                stableOnChange({
                    ...currentAction,
                    InputParameters: newInputs,
                    OutputParameters: newOutputs
                } as Action);
            }
        }
    }, [selectedTemplateDetails, isTemplateDriven, stableOnChange, currentAction]);

    const handleActionTypeChange = (value: string) => {
        if (value === "none") {
            stableOnChange({ _uid, ActionType: "" } as Action);
            return;
        }

        const option = ACTION_OPTIONS.find(opt => opt.value === value);
        if (option) {
            const newActionBase = { ...(option.defaults || {}) };
            const newAction: Action = {
                ...newActionBase,
                ActionType: value,
                _uid
            };

            if (isTemplateDrivenAction(value)) {
                (newAction as any).InputParameters = (newAction as any).InputParameters ?? {};
                (newAction as any).OutputParameters = (newAction as any).OutputParameters ?? {};
            }

            stableOnChange(newAction);
        }
    };

    const handleTemplateNameChange = (value: string) => {
        stableOnChange({
            ...currentAction,
            TemplateName: value,
            InputParameters: {},
            OutputParameters: {}
        } as Action);
    };

    const handleParameterChange = React.useCallback((paramType: string, paramName: string, value: any) => {
        const convertedValue = typeof value === 'string' ? convertInputValue(value) : value;
        const path = [paramType, paramName];
        const updatedAction = setDeepValue(currentAction, path, convertedValue);
        stableOnChange(updatedAction);
    }, [currentAction, stableOnChange]);

    const handleFieldChange = (field: string, value: any) => {
        const convertedValue = typeof value === 'string' ? convertInputValue(value) : value;
        stableOnChange({ ...currentAction, [field]: convertedValue } as Action);
    };

    const getGenericFields = (): string[] => {
        return Object.keys(currentAction).filter(key => 
            !OMITTED_ACTION_FIELDS.has(key) && 
            key !== '_uid' && 
            currentActionType !== 'none' &&
            key !== 'TemplateName' &&
            key !== 'InputParameters' &&
            key !== 'OutputParameters'
        );
    };

    return (
        <div className="space-y-3 p-3 border rounded bg-card/50">
            <Select value={currentActionType} onValueChange={handleActionTypeChange}>
                <SelectTrigger>
                    <SelectValue placeholder="Select Action Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">-- Select Action Type --</SelectItem>
                    {ACTION_OPTIONS.map(option => {
                        const label = isSupportedAction(option.value) 
                            ? option.label 
                            : `${option.label} (Not Implemented)`;
                        return (
                            <SelectItem key={option.value} value={option.value}>
                                {label}
                            </SelectItem>
                        );
                    })}
                </SelectContent>
            </Select>

            {!supported && currentActionType !== "none" && (
                <Card className="p-3 mt-2 bg-destructive/10 border border-destructive/30">
                    <p className="text-sm text-destructive">
                        ⚠️ This action type is not implemented. Choose RuleEvaluationAction, ExecuteOrchestratorWorkflowAction, or ExecuteGbgSchedulerProcessAction.
                    </p>
                </Card>
            )}

            {/* Template-driven action configuration */}
            {supported && isTemplateDriven && (
                <>
                    <div className="space-y-1 mt-2">
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Template Name</label>
                        {isLoadingTemplates && <p className="text-xs text-muted-foreground italic">Loading templates...</p>}
                        {errorTemplates && <p className="text-xs text-destructive">{errorTemplates}</p>}
                        <Select 
                            value={(currentAction as any).TemplateName || "__none__"} 
                            onValueChange={(value) => handleTemplateNameChange(value === "__none__" ? "" : value)}
                            disabled={isLoadingTemplates || !templateList.length}
                        >
                            <SelectTrigger className="text-sm">
                                <SelectValue placeholder="-- Select Template --" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">-- Select Template --</SelectItem>
                                {templateList.map(t => (
                                    <SelectItem key={t.name} value={t.name}>
                                        {t.name} ({t.category || '?'})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {isLoadingDetails && <p className="text-xs text-muted-foreground italic">Loading template details...</p>}
                    {errorDetails && <p className="text-xs text-destructive">{errorDetails}</p>}

                    {/* Input Parameters */}
                    {selectedTemplateDetails?.inputParameters?.length > 0 && (
                        <Card className="p-2 space-y-2 mt-2 bg-muted/50">
                            <h4 className="text-xs font-semibold text-foreground">Input Parameters</h4>
                            {selectedTemplateDetails.inputParameters.map((p: any) => (
                                <ParameterInput
                                    key={p.name}
                                    parameter={p}
                                    value={(currentAction as any).InputParameters?.[p.name]}
                                    onChange={(v) => handleParameterChange('InputParameters', p.name, v)}
                                    paramType="InputParameters"
                                />
                            ))}
                        </Card>
                    )}

                    {/* Output Parameters */}
                    {selectedTemplateDetails?.outputParameters?.length > 0 && (
                        <Card className="p-2 space-y-2 mt-2 bg-muted/50">
                            <h4 className="text-xs font-semibold text-foreground">Output Parameters</h4>
                            {selectedTemplateDetails.outputParameters.map((p: any) => (
                                <ParameterInput
                                    key={p.name}
                                    parameter={p}
                                    value={(currentAction as any).OutputParameters?.[p.name]}
                                    onChange={(v) => handleParameterChange('OutputParameters', p.name, v)}
                                    paramType="OutputParameters"
                                />
                            ))}
                        </Card>
                    )}
                </>
            )}

            {/* Rule Evaluation Action specific config would go here */}
            
            {/* Generic fields for other actions */}
            {supported && currentActionType !== "none" && getGenericFields().length > 0 && (
                <Card className="p-2 space-y-2 mt-2 bg-muted/50">
                    <h4 className="text-xs font-semibold text-foreground">Other Properties</h4>
                    {getGenericFields().map((key) => (
                        <div key={key}>
                            <label htmlFor={`generic-input-${_uid}-${key}`} className="block text-xs font-medium text-muted-foreground mb-1">
                                {key}
                            </label>
                            <Input
                                id={`generic-input-${_uid}-${key}`}
                                value={(currentAction as any)[key] ?? ''}
                                onChange={(e) => handleFieldChange(key, e.target.value)}
                                className="text-sm"
                            />
                        </div>
                    ))}
                </Card>
            )}
        </div>
    );
};

// Multi Action Editor Component
interface MultiActionEditorProps {
    actions: Action[];
    onChange: (actions: Action[]) => void;
    dataServicesRootURI?: string;
}

const MultiActionEditor: React.FC<MultiActionEditorProps> = ({ actions = [], onChange, dataServicesRootURI }) => {
    const handleActionChange = (uid: string, updatedAction: Action) => {
        const newActions = actions.map(a => (a._uid === uid ? updatedAction : a));
        onChange(newActions);
    };

    const handleRemoveAction = (uid: string) => {
        const newActions = actions.filter(a => a._uid !== uid);
        onChange(newActions);
    };

    const handleAddAction = () => {
        const newAction: Action = {
            _uid: generateUid(),
            ActionType: ""
        };
        onChange([...actions, newAction]);
    };

    return (
        <div className="space-y-3">
            {actions.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 border rounded bg-muted/50 text-center">
                    No actions configured. Click "Add Action" to get started.
                </div>
            ) : (
                actions.map((action, index) => (
                    <div key={action._uid} className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-muted-foreground">
                                Action {index + 1}
                            </span>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleRemoveAction(action._uid)}
                                className="gap-1"
                            >
                                <Trash size={14} />
                                Remove
                            </Button>
                        </div>
                        <ActionEditor
                            action={action}
                            onChange={(updatedAction) => handleActionChange(action._uid, updatedAction)}
                            dataServicesRootURI={dataServicesRootURI}
                        />
                    </div>
                ))
            )}
            
            <Button onClick={handleAddAction} className="gap-2 w-full">
                <Plus size={16} />
                Add Action
            </Button>
        </div>
    );
};

// Health Status Component
interface HealthStatusProps {
    status: HealthStatus;
    message: string;
    onCheck: () => void;
    disabled?: boolean;
}

const HealthStatusButton: React.FC<HealthStatusProps> = ({ status, message, onCheck, disabled = false }) => {
    const getIcon = () => {
        switch (status) {
            case 'loading':
                return <SpinnerGap size={16} className="animate-spin" />;
            case 'success':
                return <CheckCircle size={16} className="text-green-500" />;
            case 'error':
                return <XCircle size={16} className="text-red-500" />;
            default:
                return <Heartbeat size={16} />;
        }
    };

    const getTooltip = () => {
        if (status === 'loading') return "Checking connection...";
        if (message) return message;
        if (status === 'idle') return "Click to check connection";
        return "Status unknown";
    };

    return (
        <Button
            size="sm"
            onClick={onCheck}
            disabled={disabled || status === 'loading'}
            title={getTooltip()}
            className="p-2"
        >
            {getIcon()}
        </Button>
    );
};

// ==========================================================================
// Main Application Component
// ==========================================================================

function App() {
    // Theme hook
    const { theme, toggleTheme } = useTheme();
    
    // Persistent state using useKV for data that should survive page refreshes
    const [jsonData, setJsonData] = useKV<Rule>("current-rule", DEFAULT_RULE_TEMPLATE);
    const [rulesEngineRootURI, setRulesEngineRootURI] = useKV("rules-engine-uri", RULES_ENGINE_DEFAULT_URL);
    const [dataServicesRootURI, setDataServicesRootURI] = useKV("data-services-uri", DATA_SERVICES_DEFAULT_URL);

    // Session state using useState for temporary UI state
    const [rulesEngineHealthStatus, setRulesEngineHealthStatus] = React.useState<HealthStatus>('idle');
    const [rulesEngineHealthMessage, setRulesEngineHealthMessage] = React.useState('');
    const [dataServicesHealthStatus, setDataServicesHealthStatus] = React.useState<HealthStatus>('idle');
    const [dataServicesHealthMessage, setDataServicesHealthMessage] = React.useState('');
    const [isJsonCollapsed, setIsJsonCollapsed] = React.useState(true);
    
    // Import dialog state
    const [showImportDialog, setShowImportDialog] = React.useState(false);
    const [showResponseDialog, setShowResponseDialog] = React.useState(false);
    const [showChainMapDialog, setShowChainMapDialog] = React.useState(false);
    const [responseDetails, setResponseDetails] = React.useState<{
        success: boolean;
        title?: string;
        message?: string;
        endpoint?: string;
        status?: string;
        rawResponse?: string;
    } | null>(null);
    
    // Chain map state - start with blank canvas
    const [isChainViewVisible, setIsChainViewVisible] = React.useState(false);
    const [ruleChainData, setRuleChainData] = React.useState<ChainData | null>({ nodes: {}, edges: [] });
    const [chainStartRuleId, setChainStartRuleId] = useKV("chain-start-rule-id", "");
    const [chainError, setChainError] = React.useState('');
    const [isLoading, setIsLoading] = React.useState({
        chainData: false,
        rule: false,
        upload: false,
        import: false
    });

    // Health check handlers
    const handleRulesEngineHealthCheck = async () => {
        if (!rulesEngineRootURI) {
            setRulesEngineHealthStatus('error');
            setRulesEngineHealthMessage('Rules Engine URL is not set.');
            return;
        }

        setRulesEngineHealthStatus('loading');
        setRulesEngineHealthMessage('');

        try {
            const result = await apiPerformRulesEngineHealthCheck(rulesEngineRootURI);
            setRulesEngineHealthStatus('success');
            setRulesEngineHealthMessage(result.message);
            toast.success('Rules Engine Connected');
        } catch (error: any) {
            let message = 'Connection failed';
            
            if (error.name === 'TimeoutError') {
                message = 'Connection timeout - check if service is running';
            } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                message = `Network error: Could not connect to ${rulesEngineRootURI}. Check URL and CORS configuration.`;
            } else if (error.message?.includes('CORS')) {
                message = 'CORS error: Server needs to allow cross-origin requests from this domain.';
            } else if (error.message) {
                message = error.message;
            }

            setRulesEngineHealthStatus('error');
            setRulesEngineHealthMessage(`Rules Engine Error: ${message}`);
            toast.error(message);
        }
    };

    const handleDataServicesHealthCheck = async () => {
        if (!dataServicesRootURI) {
            setDataServicesHealthStatus('error');
            setDataServicesHealthMessage('Data Services URL is not set.');
            return;
        }

        setDataServicesHealthStatus('loading');
        setDataServicesHealthMessage('');

        try {
            const result = await apiPerformDsHealthCheck(dataServicesRootURI);
            setDataServicesHealthStatus('success');
            setDataServicesHealthMessage(result.message);
            toast.success('Data Services Connected');
        } catch (error: any) {
            let message = 'Connection failed';
            
            if (error.name === 'TimeoutError') {
                message = 'Connection timeout - check if service is running';
            } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
                message = `Network error: Could not connect to ${dataServicesRootURI}. Check URL and CORS configuration.`;
            } else if (error.message?.includes('CORS')) {
                message = 'CORS error: Server needs to allow cross-origin requests from this domain.';
            } else if (error.message) {
                message = error.message;
            }

            setDataServicesHealthStatus('error');
            setDataServicesHealthMessage(`Data Services Error: ${message}`);
            
            // Show detailed error information
            handleShowResponse({
                success: false,
                title: "Data Services Connection Failed",
                message: message,
                endpoint: error.endpoint || `${dataServicesRootURI}${DS_HEALTH_CHECK_PATH}`,
                status: error.status ? `${error.status}` : 'Network Error',
                rawResponse: error.responseText || ""
            });
            
            toast.error(message);
        }
    };

    // Response handler
    const handleShowResponse = React.useCallback((details: {
        success: boolean;
        title?: string;
        message?: string;
        endpoint?: string;
        status?: string;
        rawResponse?: string;
    }) => {
        setResponseDetails(details);
        setShowResponseDialog(true);
    }, []);

    // Rule management handlers
    const handleNewRule = () => {
        setJsonData({ ...DEFAULT_RULE_TEMPLATE });
        toast.success("New rule created");
    };

    const handleSaveToFile = () => {
        if (!jsonData) return;

        try {
            const outputJson = safeStringifyJSON(jsonData, 2);
            const idPart = jsonData.id ? `${jsonData.id}_` : '';
            const sanitizedName = (jsonData.name || "Unnamed").replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = `${idPart}${sanitizedName}.json`;

            const blob = new Blob([outputJson], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success(`Rule saved as ${filename}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Save failed';
            toast.error(`Save error: ${message}`);
        }
    };

    // Upload validation helper
    const collectActions = (prop: any): Action[] => {
        const parsed = safeParseJSON(prop?.value, { Actions: [] });
        return Array.isArray(parsed.Actions) ? parsed.Actions : [];
    };

    const handleUploadToApi = async () => {
        if (!jsonData || !dataServicesRootURI) {
            toast.error("Rule data or Data Services URL is missing");
            return;
        }

        // Validate actions
        const errors: string[] = [];
        const onSuccessProperty = jsonData.properties?.find(p => p.name === "OnSuccess");
        const onFailureProperty = jsonData.properties?.find(p => p.name === "OnFailure");
        const onSuccess = collectActions(onSuccessProperty);
        const onFailure = collectActions(onFailureProperty);
        const allActions = [...onSuccess, ...onFailure];
        
        allActions.forEach((action, idx) => {
            const actionType = action?.ActionType;
            if (!actionType || !isSupportedAction(actionType)) {
                errors.push(`Action[${idx}] type '${actionType || "unknown"}' is not implemented`);
                return;
            }
            const schema = getSchema(actionType);
            const validationErrors = schema?.validate(action);
            if (Array.isArray(validationErrors) && validationErrors.length > 0) {
                validationErrors.forEach(error => errors.push(`Action[${idx}]: ${error}`));
            }
        });
        
        if (errors.length > 0) {
            handleShowResponse({
                success: false,
                title: "Validation Failed",
                message: "Cannot upload rule with unsupported or invalid actions:\n\n" + errors.join("\n"),
                endpoint: `${dataServicesRootURI}${API_BASE}/${jsonData.id || '?'}`,
                status: "Invalid",
                rawResponse: ""
            });
            return;
        }

        setIsLoading(prev => ({ ...prev, upload: true }));

        try {
            const result = await apiUploadRule(dataServicesRootURI, jsonData);
            handleShowResponse({
                success: true,
                title: "Upload Successful",
                message: `Rule '${jsonData.name}' (${result.uploadedRuleId}) uploaded successfully.`,
                endpoint: result.endpoint,
                status: `${result.status} ${result.statusText}`,
                rawResponse: result.rawResponse,
            });
            toast.success(`Rule uploaded: ${result.uploadedRuleId}`);
        } catch (error: any) {
            handleShowResponse({
                success: false,
                title: "Upload Failed",
                message: error.message,
                endpoint: error.endpoint || `${dataServicesRootURI}${API_BASE}/${jsonData.id || '?'}`,
                status: `${error.status || 'Err'}`,
                rawResponse: error.responseText || "",
            });
            toast.error(`Upload failed: ${error.message}`);
        } finally {
            setIsLoading(prev => ({ ...prev, upload: false }));
        }
    };

    const handleLoadRule = React.useCallback(async (ruleId: string) => {
        if (!ruleId || !dataServicesRootURI) return;

        setIsLoading(prev => ({ ...prev, import: true }));

        try {
            const apiRuleData = await apiFetchRuleDetails(dataServicesRootURI, ruleId);
            const uiRuleData = parseRuleFromApi(apiRuleData, ruleId);
            setJsonData(uiRuleData);
            toast.success(`Rule loaded: ${ruleId}`);
        } catch (error: any) {
            handleShowResponse({
                success: false,
                title: "Import Failed",
                message: error.message,
                endpoint: `${dataServicesRootURI}${API_BASE}/${ruleId}`,
                status: error.status ? `${error.status}` : 'Error',
                rawResponse: error.responseText || "",
            });
            toast.error(`Import failed: ${error.message}`);
        } finally {
            setIsLoading(prev => ({ ...prev, import: false }));
        }
    }, [dataServicesRootURI, setJsonData, handleShowResponse]);

    // Handle input changes
    const handleInputChange = (field: string, value: any) => {
        setJsonData((current = DEFAULT_RULE_TEMPLATE) => ({ ...current, [field]: value }));
    };

    const handlePropertyChange = (propertyName: string, value: any) => {
        setJsonData((current = DEFAULT_RULE_TEMPLATE) => {
            if (!current.properties) return current;
            
            const updatedProperties = current.properties.map(prop => 
                prop.name === propertyName ? { ...prop, value } : prop
            );
            
            return { ...current, properties: updatedProperties };
        });
    };

    // Handle action changes
    const handleActionsChange = (propertyName: 'OnSuccess' | 'OnFailure', actions: Action[]) => {
        handlePropertyChange(propertyName, { Actions: actions });
    };

    // Get property values for rendering
    const getPropertyValue = (propertyName: string): any => {
        const prop = jsonData?.properties?.find(p => p.name === propertyName);
        return prop?.value || "";
    };

    const getActions = (propertyName: 'OnSuccess' | 'OnFailure'): Action[] => {
        const propValue = getPropertyValue(propertyName);
        return safeParseJSON(propValue, { Actions: [] }).Actions || [];
    };

    // === Recursive chain builder ===
    const RULE_EVALUATION_ACTION_TYPE = "RuleEvaluationAction";
    const TEMPLATE_DRIVEN = new Set(["ExecuteOrchestratorWorkflowAction", "ExecuteGbgSchedulerProcessAction"]);

    // Parse DS property value (OnSuccess/OnFailure) safely
    const parseActionsProp = (prop?: { value: any }) => {
        const parsed = (() => {
            if (!prop) return null;
            if (typeof prop.value === "string") {
                try { return JSON.parse(prop.value); } catch { return null; }
            }
            if (typeof prop.value === "object" && prop.value) return prop.value;
            return null;
        })();
        return (parsed && Array.isArray(parsed.Actions)) ? parsed.Actions : [];
    };

    const buildRuleChainRecursively = async (startRuleId: string, dataServicesRootURI: string, currentRule?: Rule) => {
        if (!startRuleId || !dataServicesRootURI) throw new Error("startRuleId and dataServicesRootURI required.");

        // graph
        const nodes: Record<string, ChainNode> = {};
        const edges: Array<{ from: string; to: string; type: 'success' | 'failure'; label?: string }> = [];

        // caches
        const fetchCache = new Map<string, Promise<any>>();
        const processed = new Set<string>();
        let actionCounter = 0; // For generating unique action node IDs

        const fetchRule = async (ruleId: string) => {
            // If this is the current rule being edited locally, use local data instead of API
            if (ruleId === currentRule?.id && currentRule) {
                return currentRule;
            }
            
            if (!fetchCache.has(ruleId)) {
                fetchCache.set(ruleId, apiFetchRuleDetails(dataServicesRootURI, ruleId));
            }
            return fetchCache.get(ruleId)!;
        };

        const addNode = (nodeId: string, data: Partial<ChainNode>) => {
            const existingNode = nodes[nodeId] || {};
            nodes[nodeId] = { 
                ...existingNode,
                id: nodeId, 
                label: data.label || existingNode.label || nodeId,
                ...data 
            };
        };

        // Create action nodes for workflow and scheduler actions
        const createActionNodes = async (actions: any[], sourceRuleId: string, connectionType: 'success' | 'failure', path: Set<string>) => {
            const ruleTargets: string[] = [];
            
            for (const action of actions) {
                if (!action || typeof action !== "object") continue;
                
                const type = action.Type || action.ActionType;
                const params = action.Parameters || action;
                
                if (type === RULE_EVALUATION_ACTION_TYPE && params?.TargetRuleId) {
                    // Handle rule evaluation actions (existing behavior)
                    ruleTargets.push(params.TargetRuleId);
                } else if (TEMPLATE_DRIVEN.has(type)) {
                    // Create actual nodes for workflow and scheduler actions
                    actionCounter++;
                    const actionNodeId = `action-${actionCounter}-${type.replace('Action', '')}`;
                    
                    // Determine action label based on type and parameters
                    let actionLabel = type.replace('Action', '');
                    if (params.TemplateName) {
                        actionLabel = `${actionLabel}: ${params.TemplateName}`;
                    } else {
                        actionLabel = `${actionLabel} Action`;
                    }
                    
                    // Add the action node
                    addNode(actionNodeId, {
                        label: actionLabel,
                        expression: undefined,
                        isInitiating: false,
                        isError: false,
                        // Store action-specific data for rendering
                        actionType: type,
                        templateName: params.TemplateName,
                        inputParameters: params.InputParameters,
                        outputParameters: params.OutputParameters
                    });
                    
                    // Connect the source rule to this action
                    edges.push({ 
                        from: sourceRuleId, 
                        to: actionNodeId, 
                        type: connectionType, 
                        label: connectionType === 'success' ? 'Success' : 'Failure' 
                    });
                    
                    // For workflow and scheduler actions, they might have follow-up rules
                    // Check if there are any nested rule evaluations or chaining
                    if (params.OutputParameters && typeof params.OutputParameters === 'object') {
                        // Look for any rule references in output parameters that might indicate chaining
                        for (const [key, value] of Object.entries(params.OutputParameters)) {
                            if (typeof value === 'string' && value.match(/^RULE[A-Z0-9]+$/)) {
                                // This looks like a rule ID reference
                                ruleTargets.push(value);
                                // Connect the action to the next rule
                                edges.push({ 
                                    from: actionNodeId, 
                                    to: value, 
                                    type: 'success', 
                                    label: `Output: ${key}` 
                                });
                            }
                        }
                    }
                }
            }
            
            // Process rule evaluation targets
            for (const target of ruleTargets) {
                if (!edges.some(e => e.from === sourceRuleId && e.to === target && e.type === connectionType)) {
                    edges.push({ from: sourceRuleId, to: target, type: connectionType, label: connectionType === 'success' ? 'Success' : 'Failure' });
                }
                await visit(target, path);
            }
        };

        // DFS with loop detection
        const visit = async (ruleId: string, path: Set<string>) => {
            if (path.has(ruleId)) {
                // loop detected
                addNode(ruleId, { isLoopEnd: true, label: `Loop: ${ruleId}` });
                return;
            }
            if (processed.has(ruleId)) return;

            let details: any | null = null;
            try {
                details = await fetchRule(ruleId);
            } catch (e: any) {
                // Skip error nodes - don't add them to the graph
                processed.add(ruleId);
                return;
            }

            // identity + expression
            const exprProp =
                details?.properties?.find((p: any) => p?.name === "Expression") ||
                details?.properties?.find((p: any) => p?.name === "Evaluation Lambda Expression");
            const expr = typeof exprProp?.value === "string" ? exprProp.value : "";
            const exprShort = expr.length > 60 ? expr.slice(0, 57) + "..." : expr;

            addNode(ruleId, {
                label: details?.name || ruleId,
                expression: exprShort || undefined,
                isInitiating: ruleId === startRuleId,
                isError: false
            });

            processed.add(ruleId);

            const onSuccess = parseActionsProp(details?.properties?.find((p: any) => p?.name === "OnSuccess"));
            const onFailure = parseActionsProp(details?.properties?.find((p: any) => p?.name === "OnFailure"));

            const nextPath = new Set(path);
            nextPath.add(ruleId);

            // Process success and failure actions, creating nodes for workflow/scheduler actions
            await createActionNodes(onSuccess, ruleId, 'success', nextPath);
            await createActionNodes(onFailure, ruleId, 'failure', nextPath);
        };

        await visit(startRuleId, new Set());
        return { nodes, edges };
    };

    const handleGenerateChain = React.useCallback(async (startRuleId: string) => {
        if (!startRuleId) {
            toast.error("Please specify a start rule ID");
            return;
        }

        if (!dataServicesRootURI) {
            toast.error("Data Services URL is required to generate chain map");
            return;
        }

        console.log('Generating recursive chain for rule:', startRuleId);
        setChainStartRuleId(startRuleId);
        setIsLoading(prev => ({ ...prev, chainData: true }));
        setChainError('');

        try {
            const graph = await buildRuleChainRecursively(startRuleId, dataServicesRootURI, jsonData || undefined);
            console.log('Generated recursive chain with', Object.keys(graph.nodes).length, 'nodes and', graph.edges.length, 'edges');
            setRuleChainData(graph);
            setIsChainViewVisible(true);
            toast.success(`Recursive chain map generated: ${Object.keys(graph.nodes).length} rules found`);
        } catch (error: any) {
            const message = error.message || 'Failed to generate chain';
            console.error('Chain generation error:', error);
            setChainError(message);
            toast.error(message);
            
            // Show detailed error for debugging
            handleShowResponse({
                success: false,
                title: "Chain Generation Failed",
                message: message,
                endpoint: `${dataServicesRootURI}${API_BASE}/${startRuleId}`,
                status: error.status ? `${error.status}` : 'Error',
                rawResponse: error.responseText || ""
            });
        } finally {
            setIsLoading(prev => ({ ...prev, chainData: false }));
        }
    }, [dataServicesRootURI, setChainStartRuleId, handleShowResponse, jsonData]);

    // Handle chain updates with a stable callback
    const handleChainUpdate = React.useCallback((updatedChainData: ChainData) => {
        setRuleChainData(updatedChainData);
        toast.success('Chain updated');
    }, []);

    // Handle clicking a node in the chain map
    const handleRuleNodeClick = React.useCallback((ruleId: string) => {
        if (!ruleId) return;
        
        // Load the clicked rule into the editor
        handleLoadRule(ruleId);
        
        // Scroll to the editor
        setTimeout(() => {
            const el = document.getElementById('rule-name');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();
            }
        }, 100);
    }, [handleLoadRule]);

    // Add create rule handler
    const handleCreateRule = React.useCallback(() => {
        // Generate a new rule with default values
        const newRuleId = generateRuleId();
        const newRule = {
            ...DEFAULT_RULE_TEMPLATE,
            id: newRuleId,
            name: `New Rule ${newRuleId}`,
            description: "Auto-generated rule from chain map",
            typeIdentifier: "Business Rule" // Ensure consistent type identifier
        };
        
        // Set it as the current rule for editing
        setJsonData(newRule);
        toast.success(`New rule created: ${newRuleId}`);
        
        // Scroll to the rule editor
        setTimeout(() => {
            const el = document.getElementById('rule-name');
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.focus();
            }
        }, 100);
    }, [setJsonData]);

    // We no longer need Mermaid definition since we're using React Flow
    // Generate Mermaid definition (removed, using React Flow now)
    // const { definition: mermaidDefinitionString, idMap: mermaidIdMap } = React.useMemo(() => {
    //     if (!ruleChainData) return { definition: "", idMap: {} };
    //     return generateMermaidDefinition(ruleChainData);
    // }, [ruleChainData]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className={`container mx-auto p-6 ${isChainViewVisible ? 'space-y-3' : 'space-y-6'}`}>
                {/* Header */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">
                                Biosero Rules Engine - Rule Editor
                            </h1>
                            <p className="text-muted-foreground">
                                Create and manage business rules with action workflows
                            </p>
                        </div>
                        <Button
                            onClick={toggleTheme}
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        >
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            {theme === 'dark' ? 'Light' : 'Dark'}
                        </Button>
                    </div>
                </div>

                {/* Toolbar */}
                <Card>
                    <CardHeader className={isChainViewVisible ? 'pb-2' : 'pb-4'}>
                        <div className="flex flex-wrap gap-4 items-center justify-between">
                            {/* Main Actions */}
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={handleNewRule} className="gap-2">
                                    <FilePlus size={16} />
                                    New Rule
                                </Button>
                                <Button onClick={handleSaveToFile} className="gap-2">
                                    <FloppyDisk size={16} />
                                    Save to File
                                </Button>
                                <Button onClick={handleUploadToApi} className="gap-2" disabled={isLoading.upload}>
                                    {isLoading.upload ? <SpinnerGap size={16} className="animate-spin" /> : <CloudArrowUp size={16} />}
                                    {isLoading.upload ? "Uploading..." : "Upload"}
                                </Button>
                                <Button 
                                    onClick={() => setShowImportDialog(true)} 
                                    className="gap-2"
                                    disabled={isLoading.import}
                                >
                                    {isLoading.import ? <SpinnerGap size={16} className="animate-spin" /> : <Download size={16} />}
                                    {isLoading.import ? "Importing..." : "Import"}
                                </Button>
                                <Button 
                                    onClick={() => setShowChainMapDialog(true)}
                                    className="gap-2"
                                    disabled={isLoading.chainData}
                                >
                                    <Network size={16} />
                                    {isLoading.chainData ? 'Generating...' : 'Chain Map'}
                                </Button>
                            </div>

                         {/* URL Configuration with Enhanced Status */}
                         <div className="flex flex-wrap gap-4 items-center">
                             <div className="flex items-center gap-2">
                                 <label htmlFor="ds-url" className="text-sm text-muted-foreground whitespace-nowrap">
                                     Data Services:
                                 </label>
                                 <Input
                                     id="ds-url"
                                     value={dataServicesRootURI}
                                     onChange={(e) => setDataServicesRootURI(e.target.value?.trim() || "")}
                                     placeholder={DATA_SERVICES_DEFAULT_URL}
                                     className="w-64 text-sm"
                                 />
                                 <HealthStatusButton
                                     status={dataServicesHealthStatus}
                                     message={dataServicesHealthMessage}
                                     onCheck={handleDataServicesHealthCheck}
                                     disabled={!dataServicesRootURI}
                                 />
                                 {dataServicesHealthStatus === 'error' && (
                                     <div className="flex gap-1">
                                         <Button
                                             size="sm"
                                             variant="outline"
                                         onClick={async () => {
                                             const testResult = await testCorsConnection(dataServicesRootURI || '');
                                             
                                             const corsHelp = `CORS Configuration Help for Data Services:

🔍 Connection Test Result: ${testResult.success ? '✅ SUCCESS' : '❌ FAILED'}
📝 Message: ${testResult.message}

${testResult.details?.testLog ? '📊 Test Log:\n' + testResult.details.testLog.join('\n') : ''}

${testResult.suggestions ? '\n💡 Suggestions:\n' + testResult.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n') : ''}

🔧 Required CORS Headers for your Data Services API:
• Access-Control-Allow-Origin: * (or your domain)
• Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
• Access-Control-Allow-Headers: Content-Type, Accept, Authorization

📋 For localhost development (port 8105):
1. Ensure your Data Services API includes CORS middleware
2. Handle OPTIONS preflight requests
3. Example server configurations:

Express.js:
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

ASP.NET Core:
services.AddCors(options => {
  options.AddDefaultPolicy(builder => {
    builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
  });
});
app.UseCors();

🌐 For AWS/Cloud deployments:
• Configure API Gateway CORS settings
• Enable CORS in your Lambda functions  
• For ALB/NLB, ensure proper target group configuration
• Check security groups allow port 8105

🧪 Test Endpoints:
• Health: ${dataServicesRootURI}${DS_HEALTH_CHECK_PATH}
• Rules List: ${dataServicesRootURI}${API_BASE}

🔍 Manual Testing Commands:
# Test basic connectivity
curl -v "${dataServicesRootURI}/api/health"

# Test with CORS headers
curl -v -H "Accept: application/json" \\
     -H "Origin: ${window.location.origin}" \\
     "${dataServicesRootURI}${DS_HEALTH_CHECK_PATH}"

# Test OPTIONS preflight
curl -v -X OPTIONS \\
     -H "Origin: ${window.location.origin}" \\
     -H "Access-Control-Request-Method: GET" \\
     -H "Access-Control-Request-Headers: Content-Type" \\
     "${dataServicesRootURI}${DS_HEALTH_CHECK_PATH}"

🐛 Troubleshooting Steps:
1. Service running? → lsof -i :8105 || netstat -an | grep :8105
2. Port accessible? → nc -zv localhost 8105
3. Process listening? → ps aux | grep data-services
4. Firewall blocking? → Check iptables/Windows Firewall
5. Server logs? → Check application logs for incoming requests
6. Network issues? → ping/traceroute to the server
7. Browser console? → Check Network tab for detailed error info

⚠️  Security Note:
The wildcard origin (*) should only be used in development.
For production, specify your exact domain in Access-Control-Allow-Origin.`;
                                             
                                             navigator.clipboard.writeText(corsHelp).then(() => {
                                                 toast.success('Enhanced CORS troubleshooting guide copied');
                                             });

                                             // Additional port connectivity test
                                             try {
                                                 const portTest = await fetch(`http://localhost:8105`, { 
                                                     method: 'HEAD', 
                                                     mode: 'no-cors',
                                                     signal: AbortSignal.timeout(2000) 
                                                 });
                                                 console.log('Port connectivity test: OK');
                                             } catch (portError) {
                                                 console.log('Port 8105 connectivity failed:', portError);
                                                 toast.info('Port 8105 may be closed. Check if Data Services is running.', {
                                                     duration: 5000
                                                 });
                                             }
                                         }}
                                         title="Test CORS connection and copy troubleshooting info"
                                     >
                                         Diagnose
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                            const quickStart = `🚀 Quick Start Guide for Data Services Connection

📋 Option 1: Use the included CORS-enabled test server
In your terminal, run:
   node cors-test-server.js 8105

This will start a fully functional test server with:
✅ CORS enabled for all origins
✅ Sample business rules for testing
✅ All required API endpoints
✅ Proper error handling

📋 Option 2: Configure your existing Data Services API
Add these headers to ALL responses:
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
   Access-Control-Allow-Headers: Content-Type, Accept, Authorization

And handle OPTIONS preflight requests by returning 200 status.

📋 Option 3: Verify your service is running
   lsof -i :8105    # Check if port 8105 is in use
   curl -v http://localhost:8105/api/health    # Test connectivity

📋 Option 4: Test with different port
If port 8105 is busy, try:
   node cors-test-server.js 8106
   Then update the Data Services URL to http://localhost:8106

🎯 After starting the test server:
1. Refresh this page or click the health check button
2. You should see a green checkmark indicating connection success
3. You can then import rules, upload rules, and generate chain maps

💡 The test server includes sample rules and responds to all the API calls your Rules Editor needs.`;
                                            
                                            navigator.clipboard.writeText(quickStart).then(() => {
                                                toast.success('Quick start guide copied - check your clipboard!', {
                                                    duration: 4000
                                                });
                                            });
                                        }}
                                        title="Copy quick start instructions to clipboard"
                                    >
                                        Start Guide
                                     </Button>
                                     </div>
                                 )}
                             </div>
                             
                             <div className="flex items-center gap-2">
                                 <label htmlFor="re-url" className="text-sm text-muted-foreground whitespace-nowrap">
                                     Rules Engine:
                                 </label>
                                 <Input
                                     id="re-url"
                                     value={rulesEngineRootURI}
                                     onChange={(e) => setRulesEngineRootURI(e.target.value?.trim() || "")}
                                     placeholder={RULES_ENGINE_DEFAULT_URL}
                                     className="w-64 text-sm"
                                 />
                                 <HealthStatusButton
                                     status={rulesEngineHealthStatus}
                                     message={rulesEngineHealthMessage}
                                     onCheck={handleRulesEngineHealthCheck}
                                     disabled={!rulesEngineRootURI}
                                 />
                                 {rulesEngineHealthStatus === 'error' && (
                                     <Button
                                         size="sm"
                                         variant="outline"
                                         onClick={() => {
                                             const reHelp = `Rules Engine Connection Help:

Expected health endpoint: ${rulesEngineRootURI}/diagnostics/health
Expected validation endpoint: ${rulesEngineRootURI}/rules/evaluations/validate

CORS Requirements:
• Access-Control-Allow-Origin: *
• Access-Control-Allow-Methods: GET, POST, OPTIONS
• Access-Control-Allow-Headers: Content-Type, Accept

API Endpoints:
• Health Check: GET /diagnostics/health (returns 200 for healthy, 503 for unhealthy)
• Expression Validation: POST /rules/evaluations/validate
• Rule Evaluation: POST /rules/evaluations (single/batch/chain modes)

Troubleshooting:
1. Verify service is running on ${rulesEngineRootURI}
2. Test health check: curl ${rulesEngineRootURI}/diagnostics/health
3. Test validation: curl -X POST -H "Content-Type: application/json" \\
   -d '{"expression":"1 == 1","inputs":{}}' \\
   ${rulesEngineRootURI}/rules/evaluations/validate
4. Check CORS configuration
5. Verify port accessibility
6. Check network/firewall settings

Expected Health Response:
HTTP 200 OK with JSON containing health status information

Expected Validation Response:
HTTP 200 OK with JSON like {"isValid": true, "message": "Expression is valid"}`;
                                             
                                             navigator.clipboard.writeText(reHelp).then(() => {
                                                 toast.success('Rules Engine help copied to clipboard');
                                             });
                                         }}
                                         title="Copy Rules Engine troubleshooting info"
                                     >
                                         Help
                                     </Button>
                                 )}
                             </div>
                         </div>
                        </div>
                    </CardHeader>
                </Card>

                {/* Main Content - Full chain map when visible, otherwise rule editor */}
                {isChainViewVisible ? (
                    /* Full-width Interactive Chain Map */
                    <div className="h-[calc(100vh-200px)]">
                        <div className="flex flex-col h-full overflow-hidden bg-background border border-border rounded-lg">
                            {/* Streamlined Chain Map Header */}
                            <div className="p-2 border-b border-border bg-card/50 flex-shrink-0">
                                <div className="flex items-center justify-center">
                                    <div className="flex-1">
                                        <h3 className="text-sm font-semibold text-foreground">Interactive Rule Chain Map</h3>
                                        <p className="text-muted-foreground text-xs">
                                            Click nodes to edit • Drag to rearrange • Connect via handles
                                        </p>
                                    </div>
                                    
                                    {/* Centered Rule Selector */}
                                    <div className="flex items-center gap-2 flex-1 justify-center">
                                        <label className="text-xs text-muted-foreground whitespace-nowrap">
                                            Initiating Rule:
                                        </label>
                                        <div className="w-52">
                                            <SimpleRuleSelector
                                                dataServicesRootURI={dataServicesRootURI || ""}
                                                onRuleSelect={(ruleId) => {
                                                    if (ruleId && ruleId !== chainStartRuleId) {
                                                        setChainStartRuleId(ruleId);
                                                        handleGenerateChain(ruleId);
                                                    }
                                                }}
                                                value={chainStartRuleId || ""}
                                                className="bg-card border-border text-foreground text-sm"
                                                placeholder="Select rule"
                                                disabled={isLoading.chainData}
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Right-aligned control buttons */}
                                    <div className="flex gap-1 flex-1 justify-end">
                                        <Button 
                                            onClick={() => {
                                                setRuleChainData({ nodes: {}, edges: [] });
                                                setChainStartRuleId("");
                                                setChainError("");
                                                toast.success("New chain canvas cleared");
                                            }}
                                            size="sm"
                                            className="text-foreground bg-green-600 hover:bg-green-700 px-2 h-6 text-xs"
                                            title="Clear canvas and start a new rule chain"
                                        >
                                            New Chain
                                        </Button>
                                        <Button 
                                            onClick={() => {
                                                if (ruleChainData) {
                                                    const exportData = JSON.stringify(ruleChainData, null, 2);
                                                    const blob = new Blob([exportData], { type: 'application/json' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `chain-map-${Date.now()}.json`;
                                                    a.click();
                                                    URL.revokeObjectURL(url);
                                                    toast.success('Chain map exported as JSON');
                                                } else {
                                                    toast.error('No chain map to export');
                                                }
                                            }}
                                            size="sm"
                                            className="text-muted-foreground border-border hover:bg-primary/80 h-6 px-2 text-xs"
                                        >
                                            Export
                                        </Button>
                                        <Button 
                                            onClick={() => setIsChainViewVisible(false)}
                                            size="sm"
                                            className="text-muted-foreground border-border hover:bg-red-600/80 h-6 px-2 text-xs"
                                            title="Close chain map and return to rule editor"
                                        >
                                            Close
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Interactive Chain Map Content */}
                            <div className="flex-grow overflow-hidden relative">
                                {chainError && (
                                    <div className="absolute inset-0 flex items-center justify-center p-4 bg-destructive/80 z-10">
                                        <p className="text-destructive-foreground text-center">{chainError}</p>
                                    </div>
                                )}
                                <div className="h-full flex flex-col">
                                    <div className="flex-1">
                                        <N8nWorkflowEditor
                                            workflowData={ruleChainData}
                                            isLoading={isLoading.chainData}
                                        />
                                    </div>
                                    <div className="p-4">
                                        <N8nIntegrationPanel chain={ruleChainData} onWorkflowCreated={(id) => console.log('n8n workflow id', id)} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Rule Editor Layout */
                    <div className="flex flex-col space-y-6">
                        {/* Compact Rule Editor Grid with tighter spacing */}
                        <div className={`${isChainViewVisible ? 'grid grid-cols-1 gap-1 flex-1 overflow-auto' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'}`}>
                            {/* Rule Identity - More compact when chain view is visible */}
                            <Card className={isChainViewVisible ? 'flex-shrink-0' : 'lg:col-span-1'}>
                                <CardHeader className={isChainViewVisible ? 'pb-1 px-3 py-2' : ''}>
                                    <CardTitle className={isChainViewVisible ? 'text-sm' : 'text-lg'}>Rule Identity</CardTitle>
                                    {!isChainViewVisible && <CardDescription>Basic rule information</CardDescription>}
                                </CardHeader>
                                <CardContent className={`space-y-${isChainViewVisible ? '2' : '4'} ${isChainViewVisible ? 'px-3 py-2' : ''}`}>
                                    {jsonData?.id && (
                                        <div>
                                            <label className="block text-xs font-medium text-muted-foreground mb-1">
                                                ID
                                            </label>
                                            <div className={`text-sm bg-muted px-2 py-1 rounded font-mono ${isChainViewVisible ? 'text-xs' : ''}`}>
                                                {jsonData.id}
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div>
                                        <label htmlFor="rule-name" className="block text-xs font-medium text-muted-foreground mb-1">
                                            Name *
                                        </label>
                                        <Input
                                            id="rule-name"
                                            value={jsonData?.name || ""}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            placeholder="Enter rule name"
                                            className={isChainViewVisible ? 'h-7 text-xs' : ''}
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="rule-description" className="block text-xs font-medium text-muted-foreground mb-1">
                                            Description
                                        </label>
                                        <Textarea
                                            id="rule-description"
                                            value={jsonData?.description || ""}
                                            onChange={(e) => handleInputChange('description', e.target.value)}
                                            placeholder="Enter rule description"
                                            rows={isChainViewVisible ? 2 : 3}
                                            className={isChainViewVisible ? 'text-xs min-h-[3rem]' : ''}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Rule Properties - Responsive layout with tighter spacing */}
                            <Card className={isChainViewVisible ? 'flex-shrink-0' : 'lg:col-span-2'}>
                                <CardHeader className={isChainViewVisible ? 'pb-1 px-3 py-2' : ''}>
                                    <CardTitle className={isChainViewVisible ? 'text-sm' : 'text-lg'}>Rule Properties</CardTitle>
                                    {!isChainViewVisible && <CardDescription>Configure rule logic and behavior</CardDescription>}
                                </CardHeader>
                                <CardContent className={`space-y-${isChainViewVisible ? '2' : '6'} ${isChainViewVisible ? 'px-3 py-2' : ''}`}>
                                    {/* Expression */}
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <label htmlFor="expression" className={`block text-xs font-medium text-muted-foreground`}>
                                                Lambda Expression *
                                            </label>
                                            <Button
                                                onClick={async () => {
                                                    if (rulesEngineHealthStatus !== 'success') {
                                                        toast.error('Rules Engine must be connected to test expressions');
                                                        return;
                                                    }
                                                    
                                                    const expression = getPropertyValue("Expression");
                                                    if (!expression?.trim()) {
                                                        toast.error('Please enter an expression to test');
                                                        return;
                                                    }
                                                    
                                                    if (!rulesEngineRootURI) {
                                                        toast.error('Rules Engine URL not configured');
                                                        return;
                                                    }
                                                    
                                                    try {
                                                        toast.info('Testing expression...', { duration: 2000 });
                                                        
                                                        const payload = {
                                                            expression: expression.trim(),
                                                            inputParameters: {}
                                                        };
                                                        
                                                        const result = await apiValidateExpression(rulesEngineRootURI, payload);
                                                        
                                                        if (result && result.isValid) {
                                                            toast.success(`Expression is valid: ${result.message || 'Syntax OK'}`);
                                                        } else {
                                                            toast.error(`Expression validation failed: ${result?.message || 'Unknown error'}`);
                                                        }
                                                    } catch (error: any) {
                                                        console.error('Expression validation error:', error);
                                                        toast.error(`Validation error: ${error.message || 'Failed to validate expression'}`);
                                                    }
                                                }}
                                                disabled={rulesEngineHealthStatus !== 'success'}
                                                size="sm"
                                                className={`gap-1 ${isChainViewVisible ? 'h-6 px-2 text-xs' : ''}`}
                                            >
                                                <Flask size={isChainViewVisible ? 10 : 14} />
                                                Test
                                            </Button>
                                        </div>
                                        <Input
                                            id="expression"
                                            value={getPropertyValue("Expression")}
                                            onChange={(e) => handlePropertyChange("Expression", e.target.value)}
                                            placeholder="e.g., key == 'Ready' AND Convert.ToDouble(value) > 0.5"
                                            className={`font-mono text-sm ${isChainViewVisible ? 'h-7 text-xs' : ''}`}
                                        />
                                        {!isChainViewVisible && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Use C#-like syntax. Variables will be automatically detected.
                                            </p>
                                        )}
                                    </div>

                                    {/* Error Message */}
                                    <div>
                                        <label htmlFor="error-message" className="block text-xs font-medium text-muted-foreground mb-1">
                                            Error Message
                                        </label>
                                        <Input
                                            id="error-message"
                                            value={getPropertyValue("ErrorMessage")}
                                            onChange={(e) => handlePropertyChange("ErrorMessage", e.target.value)}
                                            placeholder="Message to display when rule evaluation fails"
                                            className={isChainViewVisible ? 'h-7 text-xs' : ''}
                                        />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Compact Actions Section when chain view is visible */}
                        {!isChainViewVisible ? (
                            /* Full Actions Layout */
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* On Success Actions */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <CheckCircle size={20} className="text-green-500" />
                                            On Success Actions
                                        </CardTitle>
                                        <CardDescription>
                                            Actions to execute when the rule evaluation succeeds
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <MultiActionEditor
                                            actions={getActions("OnSuccess")}
                                            onChange={(actions) => handleActionsChange("OnSuccess", actions)}
                                            dataServicesRootURI={dataServicesRootURI}
                                        />
                                    </CardContent>
                                </Card>

                                {/* On Failure Actions */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <XCircle size={20} className="text-red-500" />
                                            On Failure Actions
                                        </CardTitle>
                                        <CardDescription>
                                            Actions to execute when the rule evaluation fails
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <MultiActionEditor
                                            actions={getActions("OnFailure")}
                                            onChange={(actions) => handleActionsChange("OnFailure", actions)}
                                            dataServicesRootURI={dataServicesRootURI}
                                        />
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            /* Compact Actions Layout - Single row with counts */
                            <div className="grid grid-cols-2 gap-1 flex-shrink-0">
                                {/* Compact Success Actions */}
                                <Card>
                                    <CardHeader className="pb-1 px-3 py-1">
                                        <CardTitle className="text-xs flex items-center gap-1">
                                            <CheckCircle size={12} className="text-green-500" />
                                            Success ({getActions("OnSuccess").length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-3 py-1">
                                        <div className="text-xs space-y-0.5 max-h-12 overflow-y-auto">
                                            {getActions("OnSuccess").length === 0 ? (
                                                <div className="text-muted-foreground">None</div>
                                            ) : (
                                                getActions("OnSuccess").slice(0, 2).map((action, index) => (
                                                    <div key={action._uid} className="text-green-400 truncate">
                                                        {action.ActionType?.replace('Action', '') || 'Action'}
                                                    </div>
                                                ))
                                            )}
                                            {getActions("OnSuccess").length > 2 && (
                                                <div className="text-muted-foreground">+{getActions("OnSuccess").length - 2} more</div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Compact Failure Actions */}
                                <Card>
                                    <CardHeader className="pb-1 px-3 py-1">
                                        <CardTitle className="text-xs flex items-center gap-1">
                                            <XCircle size={12} className="text-red-500" />
                                            Failure ({getActions("OnFailure").length})
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-3 py-1">
                                        <div className="text-xs space-y-0.5 max-h-12 overflow-y-auto">
                                            {getActions("OnFailure").length === 0 ? (
                                                <div className="text-muted-foreground">None</div>
                                            ) : (
                                                getActions("OnFailure").slice(0, 2).map((action, index) => (
                                                    <div key={action._uid} className="text-red-400 truncate">
                                                        {action.ActionType?.replace('Action', '') || 'Action'}
                                                    </div>
                                                ))
                                            )}
                                            {getActions("OnFailure").length > 2 && (
                                                <div className="text-muted-foreground">+{getActions("OnFailure").length - 2} more</div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* JSON Preview - Always collapsed when chain view is visible */}
                        <Card className="flex-shrink-0">
                            <CardHeader className={isChainViewVisible ? 'pb-1 px-4 py-2' : ''}>
                                <div 
                                    className="flex items-center justify-between cursor-pointer"
                                    onClick={() => setIsJsonCollapsed(!isJsonCollapsed)}
                                >
                                    <div>
                                        <CardTitle className={isChainViewVisible ? 'text-sm' : 'text-lg'}>Rule JSON</CardTitle>
                                        {!isChainViewVisible && <CardDescription>Current rule structure in JSON format</CardDescription>}
                                    </div>
                                    <Button variant="ghost" size="sm" className="p-1">
                                        {isJsonCollapsed ? <CaretRight size={16} /> : <CaretDown size={16} />}
                                    </Button>
                                </div>
                            </CardHeader>
                            {!isJsonCollapsed && (
                                <CardContent className={isChainViewVisible ? 'px-4 py-1' : ''}>
                                    <pre className={`text-xs bg-muted ${isChainViewVisible ? 'p-2' : 'p-4'} rounded overflow-auto ${isChainViewVisible ? 'max-h-32' : 'max-h-96'} font-mono`}>
                                        {safeStringifyJSON(jsonData, 2)}
                                    </pre>
                                </CardContent>
                            )}
                        </Card>
                    </div>
                )}
            </div>
            
            {/* Dialogs */}
            <ImportRuleDialog 
                isOpen={showImportDialog} 
                onClose={() => setShowImportDialog(false)} 
                dataServicesRootURI={dataServicesRootURI || ""} 
                onRuleImport={handleLoadRule} 
            />

            <ChainMapDialog
                isOpen={showChainMapDialog}
                onClose={() => setShowChainMapDialog(false)}
                dataServicesRootURI={dataServicesRootURI || ""}
                onStartRuleSelect={handleGenerateChain}
                currentRuleId={jsonData?.id || ""}
                onCreateNewRule={(newRule) => setJsonData(newRule)}
            />
            
            <ResponseDialog 
                isOpen={showResponseDialog} 
                onClose={() => setShowResponseDialog(false)} 
                details={responseDetails} 
            />
        </div>
    );
}

export default App;