# Remove Rogue Hardcoded Nodes from Monitor Page

## Problem Analysis

The "rogue rules" (like `000_AutomatedBRETest`, `000_AutomatedBRETest2`, `000_AutomatedBRETest3`) are not actually hardcoded test data. They are being **dynamically created** from action execution records.

### Root Cause

**File**: `src/components/SampleMonitor.tsx` (lines 280-335)

The code extracts rule names from `actionExecutionRecords` by parsing `actionInstanceId` strings:

```typescript
// Extract rule names from action instance IDs
const actionId = record.actionInstanceId;

// Pattern: 000_AutomatedBRETest2_action_0_ExecuteOrchestratorWorkflowAction_RULENUZ18_...
if (actionId.includes('_action_')) {
    const parts = actionId.split('_action_');
    const ruleName = parts[0]; // Everything before '_action_' is the rule name
    allRuleNames.add(ruleName);
}
```

Then it **creates fake rule nodes** for these extracted names (lines 320-335):

```typescript
// Add missing rules from action execution records
Array.from(allRuleNames).forEach((ruleName) => {
    if (!chainContext.rules.find(r => r.identifier === ruleName)) {
        // Create a rule entry for missing rules  ← THIS IS THE PROBLEM!
        completeRules.push({
            identifier: ruleName,
            name: ruleName,
            status: 'NotRun',
            lastEvaluatedAt: null
        });
    }
});
```

**Why This is Wrong:**

1. Action instance IDs contain **rule display names** (like `000_AutomatedBRETest2`), not rule identifiers (like `RULEDYKRG`)
2. These display names are already part of the actual rules in the chain
3. Creating fake nodes with display names as identifiers creates **duplicate/rogue nodes** that don't actually exist in the rule chain
4. The real rule nodes (with proper IDs like `RULEDYKRG`) are separate from these fake nodes

## Solution

### Remove the Logic That Creates Fake Nodes from Action Records

We should **completely remove** the code that:
1. Extracts rule names from `actionExecutionRecords` (lines 280-310)
2. Creates fake rule nodes for extracted names (lines 320-335)

This logic was likely added to handle missing rules, but it's creating duplicate nodes with the wrong IDs.

### What to Keep

We should **keep** the code that:
1. Uses `chainContext.rules` array (the real rules from the API)
2. Uses `chainContext.chainStructure.edges` (the real edges from the API)
3. Maps rule statuses from `ruleStatusMap`

## Implementation

### Step 1: Remove Action Record Parsing Logic

**File**: `src/components/SampleMonitor.tsx` (lines 280-310)

**DELETE** this entire block:

```typescript
// Extract rule names from action execution records
if (chainContext.actionExecutionRecords && chainContext.actionExecutionRecords.length > 0) {
    chainContext.actionExecutionRecords.forEach((record: any) => {
        // Extract rule names from action instance IDs
        const actionId = record.actionInstanceId;
        console.log('🔧 Monitor: Processing action record:', actionId);
        
        // Pattern: 000_AutomatedBRETest2_action_0_ExecuteOrchestratorWorkflowAction_RULENUZ18_...
        if (actionId.includes('_action_')) {
            const parts = actionId.split('_action_');
            if (parts.length >= 1) {
                const ruleName = parts[0];
                console.log('🔧 Monitor: Extracted rule name from action:', ruleName);
                if (ruleName && ruleName.length > 0) {
                    allRuleNames.add(ruleName);
                }
            }
        }
        // Pattern: 000_AutomatedBRETest_RULENUZ18_ExecuteOrchestratorWorkflowAction
        else if (actionId.includes('_RULENUZ18_')) {
            const parts = actionId.split('_RULENUZ18_');
            if (parts.length >= 1) {
                const ruleName = parts[0];
                console.log('🔧 Monitor: Extracted rule name from action (pattern 2):', ruleName);
                if (ruleName && ruleName.length > 0) {
                    allRuleNames.add(ruleName);
                }
            }
        }
    });
}
```

### Step 2: Remove Fake Node Creation Logic

**File**: `src/components/SampleMonitor.tsx` (lines 320-335)

**DELETE** this entire block:

```typescript
// Add missing rules from action execution records
Array.from(allRuleNames).forEach((ruleName) => {
    if (!chainContext.rules.find(r => r.identifier === ruleName)) {
        // Create a rule entry for missing rules
        // Default status for missing rules
        let status = 'NotRun';
        
        completeRules.push({
            identifier: ruleName,
            name: ruleName,
            status: status,
            lastEvaluatedAt: null
        });
    }
});
```

### Step 3: Simplify the allRuleNames Collection

**File**: `src/components/SampleMonitor.tsx` (around line 312-318)

Keep only the edge-based collection:

```typescript
// Use chainStructure from API payload to get complete rule set
if (chainContext.chainStructure?.edges) {
    chainContext.chainStructure.edges.forEach((edge: any) => {
        allRuleNames.add(edge.from);
        allRuleNames.add(edge.to);
    });
}
```

This is sufficient because edges already contain all the rule IDs that are part of the chain.

### Step 4: Update Comments

Remove any comments referencing "the 3 rogue nodes" since they won't exist anymore.

**File**: `src/components/SampleMonitor.tsx` (line 823)

Change from:
```typescript
// If not found, try by ruleName (for the 3 rogue nodes and some edge cases)
```

To:
```typescript
// If not found, try by ruleName (for edge cases where nodeId is the display name)
```

## Expected Outcome

After these changes:

1. **No more rogue nodes**: Nodes like `000_AutomatedBRETest`, `000_AutomatedBRETest2`, `000_AutomatedBRETest3` will no longer appear
2. **Only real rule nodes**: Only rules from `chainContext.rules` and edges from `chainContext.chainStructure.edges` will be displayed
3. **Cleaner chain display**: No duplicate or fake nodes cluttering the monitor view
4. **Correct rule identification**: All nodes will use proper rule IDs (like `RULEDYKRG`), not display names

## Files to Modify

1. **`src/components/SampleMonitor.tsx`**
   - Lines 280-310: Delete action record parsing logic
   - Lines 320-335: Delete fake node creation logic
   - Line 823: Update comment

## To-dos

- [ ] Remove action record parsing logic that extracts rule names from actionInstanceId
- [ ] Remove fake node creation logic for extracted rule names
- [ ] Update comment about "rogue nodes"
- [ ] Test that only real chain rules appear in the monitor display

