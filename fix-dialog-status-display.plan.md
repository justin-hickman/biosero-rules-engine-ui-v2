# Fix Monitor Dialog Status Display Mismatch

## Problem Analysis

From the screenshot, the dialog shows:
- **Status**: "Not Evaluated" (yellow badge) 
- **Error Message**: "Rule '000_AutomatedBRETest2' evaluated to false."
- **Evaluated At**: "10/14/2025, 12:02:22 PM"

**This is incorrect because:**
1. If the rule has an error message saying it "evaluated to false", it **was evaluated** (not "Not Evaluated")
2. A rule that evaluated to false should show status as **"Failed"** (red), not "Not Evaluated" (yellow)
3. The node in the canvas likely shows the correct "Failed" status

## Root Cause

Looking at `src/components/SampleMonitor.tsx`:

### Issue 1: Status Badge Display Logic (lines 1024-1032)

```typescript
{selectedNodeDetails.executionResult ? (
    selectedNodeDetails.executionResult.isSuccess ? (
        <Badge>Success</Badge>
    ) : selectedNodeDetails.executionResult.isFailed ? (
        <Badge>Failed</Badge>
    ) : (
        <Badge>Not Evaluated</Badge>  // ← WRONG: Shows when neither isSuccess nor isFailed
    )
) : (
    <Badge>Pending</Badge>
)}
```

**Problem**: When `isSuccess = false` and `isFailed = false` (but should be `true`), it falls through to "Not Evaluated".

### Issue 2: Execution Result Interpretation (lines 670-681)

```typescript
const foundResult = chainExecution.ruleStatusHistory.find(r => r.ruleName === nodeId);
if (foundResult) {
    executionResult = foundResult;
    usedVariables = (foundResult as any).usedVariables || {};
}
```

The `foundResult` from `ruleStatusHistory` has:
```json
{
  "ruleName": "RULEDYKRG",
  "isSuccess": false,
  "evaluatedAt": "2025-10-14T16:02:22.2819724Z",
  "errorMessage": "Rule '000_AutomatedBRETest2' evaluated to false.",
  "usedVariables": {...}
}
```

**But the status display logic expects `isFailed` field, not just `isSuccess: false`.**

## Solution

### Fix 1: Properly Interpret isSuccess: false as Failed

When setting `executionResult` from `ruleStatusHistory`, we need to set the `isFailed` flag:

**File**: `src/components/SampleMonitor.tsx` (around lines 670-681)

```typescript
const foundResult = chainExecution.ruleStatusHistory.find(r => r.ruleName === nodeId);
if (foundResult) {
    executionResult = {
        ...foundResult,
        isFailed: !foundResult.isSuccess && foundResult.evaluatedAt != null,  // ← ADD THIS
        isPending: foundResult.evaluatedAt == null  // ← ADD THIS
    };
    usedVariables = (foundResult as any).usedVariables || {};
}
```

**Logic:**
- If `isSuccess = false` AND the rule was evaluated (`evaluatedAt` exists), then `isFailed = true`
- If `evaluatedAt` is null, then it's `isPending = true`

### Fix 2: Update Fallback Status Creation (lines 768-793)

The fallback logic already has correct logic, but we should ensure consistency:

```typescript
if (!executionResult) {
    const isSuccess = ruleStatus === 'Success';
    const isFailed = ruleStatus === 'Failed';
    const isPending = !ruleStatus || ruleStatus === 'Pending' || ruleStatus === 'NotRun';
    
    executionResult = {
        ruleName: nodeId,
        isSuccess: isSuccess,
        isFailed: isFailed,  // ← Already correct
        isPending: isPending,  // ← Already correct
        evaluatedAt: isSuccess || isFailed ? new Date().toISOString() : null,
        errorMessage: isFailed ? 'Rule evaluation failed' : null,
        expression: ruleExpressions[nodeId] || 'Expression not available'
    };
}
```

## Implementation

### Step 1: Fix ruleStatusHistory Result Interpretation

**File**: `src/components/SampleMonitor.tsx` (lines 670-681)

Change from:
```typescript
if (foundResult) {
    executionResult = foundResult;
    usedVariables = (foundResult as any).usedVariables || {};
}
```

To:
```typescript
if (foundResult) {
    executionResult = {
        ...foundResult,
        // Add isFailed flag based on isSuccess and whether rule was evaluated
        isFailed: !foundResult.isSuccess && foundResult.evaluatedAt != null,
        // Add isPending flag if not yet evaluated
        isPending: foundResult.evaluatedAt == null
    };
    usedVariables = (foundResult as any).usedVariables || {};
    console.log('📊 Monitor: Processed execution result:', {
        ruleName: foundResult.ruleName,
        isSuccess: foundResult.isSuccess,
        isFailed: executionResult.isFailed,
        isPending: executionResult.isPending,
        hasErrorMessage: !!foundResult.errorMessage
    });
}
```

## Expected Outcome

After this fix:

1. **Dialog Status Badge**: Will show "Failed" (red) when `isSuccess: false` with `errorMessage`
2. **Status matches node display**: Dialog status will match the node status in the canvas
3. **Correct status logic**:
   - `isSuccess: true` → "Success" (green)
   - `isSuccess: false` + `evaluatedAt` exists → "Failed" (red) 
   - `evaluatedAt: null` → "Not Evaluated" (yellow)

## Files to Modify

1. **`src/components/SampleMonitor.tsx`**
   - Lines 670-681: Add `isFailed` and `isPending` flags when processing `ruleStatusHistory` result

## To-dos

- [ ] Add isFailed and isPending flags when processing ruleStatusHistory results
- [ ] Add debug logging to show the processed execution result flags
- [ ] Test that dialog status now matches node display status

