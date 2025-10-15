# Fix Monitor Dialog Display Issues

## Issues Identified

### Issue 1: All Actions Show "Failed" Status
**Problem**: Line 732 in `SampleMonitor.tsx`:
```typescript
status: executionRecord?.succeeded ? 'Completed' : 'Failed',
```

When `executionRecord` is `null` (action not executed), it defaults to 'Failed'. Should be "Not Executed".

**Solution**: Check if execution record exists first:
```typescript
status: executionRecord ? (executionRecord.succeeded ? 'Completed' : 'Failed') : 'Not Executed',
```

### Issue 2: Only One Action Showing Per Rule
**Problem**: The `chainStructure.actions` array shows ALL actions in the chain, not just actions within a specific rule.

Looking at the DTO, actions are represented as:
- `chainStructure.actions` - One entry per **RULE** with `RuleEvaluationAction` type (child rules called by parent)
- Actual actions executed within a rule are NOT in this array

**Real Issue**: `RuleEvaluationAction` in `chainStructure.actions` represents child rule evaluations, not actual actions within the rule. The actual actions (like `ExecuteOrchestratorWorkflowAction`) are in `actionExecutionRecords` but not linked to `chainStructure.actions`.

**Solution**: Need to:
1. Show ALL execution records for the rule, not just ones matching `chainStructure.actions`
2. Parse `actionInstanceId` to extract action information
3. Match by rule display name in the `actionInstanceId`

### Issue 3: Variables Used in Evaluation Showing Full JSON Object
**Problem**: When `usedVariables` is an object (not array), it can contain nested objects that display as `[object Object]`.

**Solution**: Make the variables collapsible with JSON viewer:
1. Add collapse/expand functionality
2. Use proper JSON formatting for complex values
3. Show simple values inline, complex values in collapsible section

## Implementation Plan

### Step 1: Fix Action Status Default (Issue 1)
**File**: `src/components/SampleMonitor.tsx` (line 732)

```typescript
// BEFORE
status: executionRecord?.succeeded ? 'Completed' : 'Failed',

// AFTER
status: executionRecord ? (executionRecord.succeeded ? 'Completed' : 'Failed') : 'Not Executed',
```

### Step 2: Show All Action Executions for Rule (Issue 2)
**File**: `src/components/SampleMonitor.tsx` (lines 703-740)

Instead of filtering `chainStructure.actions` then finding execution records, we should:
1. Filter `actionExecutionRecords` by rule display name
2. Extract action info from `actionInstanceId`
3. Create enhanced action objects

```typescript
// New approach: Start with execution records, not chainStructure.actions
if (chainExecution?.actionExecutionRecords) {
    // Find rule display name for this rule ID
    const ruleDisplayName = chainExecution.chainStructure?.actions?.find(a => a.ruleId === nodeId)?.ruleName || nodeId;
    
    // Filter execution records by rule display name
    const ruleExecutionRecords = chainExecution.actionExecutionRecords.filter(record => 
        record.actionInstanceId?.includes(ruleDisplayName)
    );
    
    // Create enhanced actions from execution records
    const enhancedActions = ruleExecutionRecords.map(executionRecord => {
        // Parse actionInstanceId to extract action type
        // Format: "RuleName_action_N_ActionType_..."
        const parts = executionRecord.actionInstanceId.split('_');
        const actionTypeIndex = parts.findIndex(p => p === 'action') + 2;
        const actionType = parts[actionTypeIndex] || 'Unknown';
        
        return {
            ruleId: nodeId,
            ruleName: ruleDisplayName,
            actionType: actionType,
            templateName: null,
            executionRecord: executionRecord,
            inputParameters: executionRecord.inputParameters || {},
            outputParameters: executionRecord.outputParameters || {},
            status: executionRecord.succeeded ? 'Completed' : 'Failed',
            startTime: executionRecord.executedAt,
            endTime: executionRecord.executedAt,
            errorMessage: executionRecord.errorMessage
        };
    });
    
    if (enhancedActions.length > 0) {
        actionStatus = {
            actions: enhancedActions,
            inProgress: chainExecution.isActive && chainExecution.currentRuleName === nodeId
        };
    }
}
```

### Step 3: Make Variables Collapsible (Issue 3)
**File**: `src/components/SampleMonitor.tsx` (lines 1061-1099)

Add collapsible JSON viewer for variables:

```typescript
// Import Collapsible component at top
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Update Variables section
<div>
    <Collapsible defaultOpen={false}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full">
            <label className="text-sm font-medium text-muted-foreground">
                Variables Used in Evaluation
            </label>
            <ChevronDown className="w-4 h-4" />
        </CollapsibleTrigger>
        <CollapsibleContent>
            <div className="mt-1 p-3 bg-muted/50 rounded-md">
                <pre className="text-xs font-mono overflow-auto max-h-96">
                    {JSON.stringify(selectedNodeDetails.usedVariables, null, 2)}
                </pre>
            </div>
        </CollapsibleContent>
    </Collapsible>
</div>
```

### Step 4: Update Action Status Display
**File**: `src/components/SampleMonitor.tsx` (lines 1141-1156)

Add "Not Executed" case:

```typescript
) : action.status === 'Not Executed' ? (
    <div className="flex items-center gap-1 text-gray-400">
        <MinusCircle className="w-4 h-4" />
        <span className="text-sm">Not Executed</span>
    </div>
```

## Files to Modify

1. **`src/components/SampleMonitor.tsx`**
   - Lines 703-740: Rewrite action extraction logic
   - Line 732: Fix status default value
   - Lines 1061-1099: Add collapsible variables viewer
   - Lines 1141-1156: Add "Not Executed" status display

## Expected Outcomes

1. **Action Status**: Shows "Not Executed" for actions without execution records, "Completed" for successful, "Failed" for failed
2. **Multiple Actions**: Shows ALL actions executed within a rule, not just one
3. **Variables**: Collapsible JSON viewer for all variables, properly formatted

## To-dos

- [ ] Fix action status to show "Not Executed" instead of "Failed" when no execution record exists
- [ ] Rewrite action extraction to show all execution records for a rule, not just ones in chainStructure.actions
- [ ] Add collapsible JSON viewer for Variables Used in Evaluation
- [ ] Add "Not Executed" status icon and display in action status section
- [ ] Test with actual data to verify all actions show correctly

