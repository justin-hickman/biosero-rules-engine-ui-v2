#!/usr/bin/env node

/**
 * CORS-Enabled Test Server for Data Services API
 * 
 * This server provides all the endpoints that the Rules Editor expects,
 * with proper CORS configuration for local development.
 * 
 * Usage: node cors-test-server.js [port]
 * Default port: 8105
 */

const http = require('http');
const url = require('url');

const port = process.argv[2] || 8105;

// Sample data
const sampleRules = [
    {
        identifier: "RULE12345",
        id: "RULE12345", 
        name: "Sample Business Rule",
        description: "A sample rule for testing",
        typeIdentifier: "Business Rule",
        properties: [
            {
                name: "RuleExpressionType",
                value: "LambdaExpression",
                valueType: "String"
            },
            {
                name: "Expression", 
                value: "key == 'Ready' AND Convert.ToDouble(value) > 0.5",
                valueType: "String"
            },
            {
                name: "ErrorMessage",
                value: "Rule evaluation failed",
                valueType: "String"
            },
            {
                name: "OnSuccess",
                value: JSON.stringify({
                    Actions: [{
                        ActionType: "ExecuteOrchestratorWorkflowAction",
                        TemplateName: "ProcessSample",
                        RuleName: "Rule1",
                        Status: "Success",
                        Timestamp: "2023-05-15T10:30:00Z"
                    }]
                }),
                valueType: "String"
            },
            {
                name: "OnFailure", 
                value: JSON.stringify({
                    Actions: [{
                        ActionType: "SendEmailNotificationAction",
                        Recipient: "admin@example.com",
                        Subject: "Rule Failed",
                        RuleName: "Rule1", 
                        Status: "Success",
                        Timestamp: "2023-05-15T10:35:00Z"
                    }]
                }),
                valueType: "String"
            }
        ]
    },
    {
        identifier: "RULE67890",
        id: "RULE67890",
        name: "Another Test Rule", 
        description: "Another sample rule",
        typeIdentifier: "Business Rule",
        properties: [
            {
                name: "RuleExpressionType",
                value: "LambdaExpression", 
                valueType: "String"
            },
            {
                name: "Expression",
                value: "status == 'Complete'",
                valueType: "String"
            },
            {
                name: "ErrorMessage",
                value: "Status check failed",
                valueType: "String"
            },
            {
                name: "OnSuccess",
                value: JSON.stringify({ Actions: [] }),
                valueType: "String"
            },
            {
                name: "OnFailure",
                value: JSON.stringify({ Actions: [] }),
                valueType: "String"
            }
        ]
    }
];

const sampleOrderTemplates = [
    {
        name: "ProcessSample",
        description: "Sample processing workflow",
        parameters: ["sampleId", "priority"]
    },
    {
        name: "QualityCheck", 
        description: "Quality assurance workflow",
        parameters: ["batchId", "checkType"]
    }
];

// CORS middleware
const addCorsHeaders = (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
};

// JSON response helper
const sendJSON = (res, data, status = 200) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data, null, 2));
};

// Error response helper  
const sendError = (res, message, status = 400) => {
    sendJSON(res, { error: message, status }, status);
};

// Request body parser
const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
    });
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const { pathname, query } = parsedUrl;
    const method = req.method;

    // Add CORS headers to all responses
    addCorsHeaders(res);

    // Handle preflight requests
    if (method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    console.log(`${method} ${pathname}${Object.keys(query).length ? '?' + new URLSearchParams(query) : ''}`);

    try {
        // Health check endpoint
        if (pathname === '/api/v3.0/application-configurations/host-environment' && method === 'GET') {
            sendJSON(res, {
                environmentName: "Development",
                version: "3.0",
                status: "healthy",
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Basic health endpoint
        if (pathname === '/api/health' && method === 'GET') {
            sendJSON(res, { status: "ok", message: "CORS test server is running" });
            return;
        }

        // List rules (with optional typeIdentifier filter)
        if (pathname === '/api/v3.0/identities' && method === 'GET') {
            let rules = sampleRules;
            
            if (query.typeIdentifier) {
                const typeFilter = decodeURIComponent(query.typeIdentifier);
                rules = sampleRules.filter(rule => rule.typeIdentifier === typeFilter);
            }
            
            sendJSON(res, rules);
            return;
        }

        // Get specific rule
        if (pathname.startsWith('/api/v3.0/identities/') && method === 'GET') {
            const ruleId = pathname.split('/').pop();
            const rule = sampleRules.find(r => r.identifier === ruleId || r.id === ruleId);
            
            if (!rule) {
                sendError(res, `Rule not found: ${ruleId}`, 404);
                return;
            }
            
            sendJSON(res, rule);
            return;
        }

        // Create/Update rule
        if (pathname.startsWith('/api/v3.0/identities/') && method === 'PUT') {
            const ruleId = pathname.split('/').pop();
            const ruleData = await parseBody(req);
            
            console.log(`Updating rule ${ruleId}:`, JSON.stringify(ruleData, null, 2));
            
            // In a real implementation, you would save to database
            sendJSON(res, {
                message: "Rule updated successfully",
                id: ruleId,
                timestamp: new Date().toISOString()
            });
            return;
        }

        // List order templates
        if (pathname === '/api/v3.0/order-templates' && method === 'GET') {
            sendJSON(res, sampleOrderTemplates);
            return;
        }

        // Get specific order template
        if (pathname.startsWith('/api/v3.0/order-templates/') && method === 'GET') {
            const templateName = decodeURIComponent(pathname.split('/').pop());
            const template = sampleOrderTemplates.find(t => t.name === templateName);
            
            if (!template) {
                sendError(res, `Template not found: ${templateName}`, 404);
                return;
            }
            
            sendJSON(res, template);
            return;
        }

        // 404 for unhandled routes
        sendError(res, `Not found: ${method} ${pathname}`, 404);
        
    } catch (error) {
        console.error('Server error:', error);
        sendError(res, 'Internal server error', 500);
    }
});

server.listen(port, () => {
    console.log(`🚀 CORS-enabled Data Services test server running on port ${port}`);
    console.log(`📍 Health check: http://localhost:${port}/api/v3.0/application-configurations/host-environment`);
    console.log(`📋 Rules list: http://localhost:${port}/api/v3.0/identities?typeIdentifier=Business%20Rule`);
    console.log(`📋 Order templates: http://localhost:${port}/api/v3.0/order-templates`);
    console.log(`\n✅ CORS is configured for all origins`);
    console.log(`✅ All Data Services API endpoints are available`);
    console.log(`✅ Sample business rules and templates included`);
    console.log(`\n🔧 Configure your Rules Editor to use: http://localhost:${port}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use. Try a different port:`);
        console.error(`   node cors-test-server.js ${port + 1}`);
    } else {
        console.error('❌ Server error:', err);
    }
});