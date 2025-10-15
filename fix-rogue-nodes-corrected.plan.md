# Fix Rogue Nodes - Corrected Approach

## Problem Analysis

The "rogue nodes" are being created because the code is extracting **rule display names** from `actionExecutionRecords` and treating them as **rule identifiers**, then creating fake nodes with those display names.

**The Real Issue:**
- `actionExecutionRecords` contain action instance IDs like `"000_AutomatedBRETest2_action_0_ExecuteOrchestratorWorkflowAction_RULENUZ18_..."`
- The code extracts `"000_AutomatedBRETest2"` (display name) and creates a fake rule node with this as the identifier
- But the real rule already exists with identifier `"RULEDYKRG"` and display name `"000_AutomatedBRETest2"`
- This creates **duplicate nodes**: one real (`RULEDYKRG`) and one fake (`000_AutomatedBRETest2`)

## Root Cause

**File**: `src/components/SampleMonitor.tsx` (lines 280-335)

The code is:
1. Extracting display names from action records
2. Treating them as rule identifiers
3. Creating fake nodes with display names as identifiers
4. This creates duplicates because the real nodes already exist with proper identifiers

## Solution

### Don't Remove the Logic - Fix It

The logic is needed to handle missing rules, but it should:
1. **NOT** extract display names from action records
2. **ONLY** use actual rule identifiers from `chainStructure.edges`
3. **ONLY** create nodes for rules that are actually missing from `chainContext.rules`

### Step 1: Remove Action Record Parsing

**File**: `src/components/SampleMonitor.tsx` (lines 280-310)

**DELETE** the action record parsing logic that extracts display names:

```typescript
// DELETE THIS ENTIRE BLOCK
if (chainContext.actionExecutionRecords) {
    chainContext.actionExecutionRecords.forEach((record: any) => {
        // Extract rule names from action instance IDs
        const actionId = record.actionInstanceId;
        console.log('🔧 Monitor: Processing action record:', actionId);
        
        // Pattern: 000_AutomatedBRETest2_action_0_ExecuteOrchestratorWorkflowAction_RULENUZ18_...
        if (actionId.includes('_action_')) {
            const parts = actionId.split('_action_');
            if (parts.length >= 1) {
                const ruleName = parts[0]; // Everything before '_action_' is the rule name
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
                const ruleName = parts[0]; // Everything before '_RULENUZ18_' is the rule name
                console.log('🔧 Monitor: Extracted rule name from action (pattern 2):', ruleName);
                if (ruleName && ruleName.length > 0) {
                    allRuleNames.add(ruleName);
                }
            }
        }
    });
}
```

### Step 2: Keep Only Edge-Based Rule Collection

**File**: `src/components/SampleMonitor.tsx` (lines 312-318)

**KEEP** only the edge-based rule collection:

```typescript
// Use chainStructure from API payload to get complete rule set
if (chainContext.chainStructure?.edges) {
    chainContext.chainStructure.edges.forEach((edge: any) => {
        allRuleNames.add(edge.from);
        allRuleNames.add(edge.to);
    });
}
```

### Step 3: Fix the Missing Rule Creation Logic

**File**: `src/components/SampleMonitor.tsx` (lines 320-335)

**MODIFY** the missing rule creation to only create nodes for actual missing rule identifiers (not display names):

```typescript
// Add missing rules from chainStructure edges only
Array.from(allRuleNames).forEach(ruleId => {
    if (!chainContext.rules.find(r => r.identifier === ruleId)) {
        // Only create nodes for actual rule identifiers from edges
        // Don't create nodes for display names extracted from action records
        completeRules.push({
            identifier: ruleId,
            name: ruleId, // Use ruleId as name for missing rules
            status: 'NotRun',
            lastEvaluatedAt: null
        });
    }
});
```

## Why This Will Work

1. **No more display name extraction**: We won't extract display names from action records
2. **Only real rule identifiers**: We only use rule identifiers from `chainStructure.edges`
3. **No duplicate nodes**: We won't create fake nodes with display names as identifiers
4. **Complete chain**: We still get all rules from edges, but without the duplicates

## Expected Outcome

After this fix:

1. **No rogue nodes**: Nodes like `000_AutomatedBRETest`, `000_AutomatedBRETest2`, `000_AutomatedBRETest3` will disappear
2. **Only real rule nodes**: Only nodes with proper rule identifiers (like `RULEDYKRG`, `RULEUPPKA`, etc.) will appear
3. **Complete chain**: All rules from the chain structure will still be displayed
4. **Proper display names**: The real nodes will show the correct display names from `chainStructure.actions`

## Files to Modify

1. **`src/components/SampleMonitor.tsx`**
   - Lines 280-310: Delete action record parsing logic
   - Lines 320-335: Update missing rule creation logic

## To-dos

- [ ] Remove action record parsing logic that extracts display names
- [ ] Keep only edge-based rule collection
- [ ] Update missing rule creation to only use rule identifiers
- [ ] Test that rogue nodes are gone but real chain rules remain
