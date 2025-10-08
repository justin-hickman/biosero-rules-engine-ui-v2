# Rules Engine Monitor API Requirements

## Recommended New Endpoint

To properly support the Sample Monitor feature, we need an endpoint that returns the active ChainContext for a given WorkflowContext:

### GET /contexts/{contextId}/chain

**Purpose**: Retrieve the active or most recent chain execution for a workflow context.

**Response**: ChainContext object
```json
{
  "chainId": "string",
  "workflowContextId": "string", 
  "workflowContext": { /* WorkflowContext object */ },
  "initialRuleName": "string",
  "currentRuleName": "string",
  "currentRuleInputs": { /* object */ },
  "currentDepth": 0,
  "maxDepth": 100,
  "status": "Running", // Pending, Running, Completed, Failed
  "isActive": true,
  "isComplete": false,
  "errorMessage": null,
  "startTimestamp": "2024-01-01T00:00:00Z",
  "endTimestamp": null,
  "variables": { /* object */ },
  "history": [
    {
      "ruleName": "string",
      "isSuccess": true,
      "errorMessage": null,
      "inputs": { /* object */ },
      "outputs": { /* object */ },
      "evaluatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "rulesetVersionId": "string"
}
```

**Status Codes**:
- 200: Chain found and returned
- 404: No chain found for this context
- 500: Server error

## Alternative Approach

If you can't add a new endpoint, we can work with existing endpoints by:

1. Storing the chainId in the WorkflowContext variables
2. Adding a GET /chains/{chainId} endpoint
3. Or enhancing the context response to include chain information

## Benefits

With this endpoint, the monitor can:
- Show real-time rule execution progress
- Display which rule is currently being evaluated
- Show the complete execution history
- Track variables as they change through the chain
- Identify failures and bottlenecks

This would make the monitoring experience much more valuable for debugging and operations.
