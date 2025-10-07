# Biosero Rules Engine Chain Mapper - PRD

## Core Purpose & Success
- **Mission Statement**: Create a comprehensive rule chain visualization tool that performs recursive depth-first traversal to map rule dependencies and execution flows across complex business logic networks.
- **Success Indicators**: 
  - Successfully traverse and visualize complete rule chains with 100+ nodes
  - Detect and handle circular dependencies gracefully
  - Cache API calls to minimize server load during large traversals
  - Render interactive chain maps with sub-second performance
- **Experience Qualities**: Comprehensive, Intelligent, Reliable

## Project Classification & Approach
- **Complexity Level**: Complex Application (advanced recursive algorithms with visual editing)
- **Primary User Activity**: Analyzing and mapping complex rule interdependencies

## Essential Features

### Recursive Chain Building
- **Depth-First Traversal**: Starting from selected rule ID, recursively follow RuleEvaluationAction targets
- **Schema Compatibility**: Handle both old `{ ActionType, TargetRuleId }` and new `{ Type, Parameters: { TargetRuleId } }` formats
- **Loop Detection**: Use path tracking to identify circular dependencies and mark loop endpoints
- **Fetch Caching**: Cache all API calls to prevent duplicate requests and improve performance
- **Smart Deduplication**: Ensure nodes and edges aren't duplicated across traversal paths

### Action Type Support
- **Supported Actions**: 
  - RuleEvaluationAction (with recursive traversal)
  - ExecuteOrchestratorWorkflowAction (with template integration)
  - ExecuteGbgSchedulerProcessAction (with template integration)
- **Validation**: Block upload of rules containing unsupported action types
- **Template Integration**: Automatically fetch and populate template parameters for workflow/scheduler actions

### Interactive Chain Visualization
- **Full-Screen Chain View**: Dedicated interface showing only the chain map when active
- **Centered Rule Selection**: Prominent, centered selector for choosing starting rule
- **Node Click Navigation**: Click any node to load and edit that rule
- **Color-Coded Nodes**: Functional coloring based on action types:
  - GBG Scheduler Process: #2dc75c (green)
  - Rule Actions: #84dbcf (teal) 
  - Orchestrator Workflow: #8f7fee (purple)
  - Initiating Rules: #41d8c4 (cyan)

### Enhanced Node Editing
- **Comprehensive Dialogs**: Full-scope editing with template support when clicking nodes
- **Template-Driven Configuration**: Automatic parameter population from Data Services templates
- **Real-Time Validation**: Immediate feedback on configuration errors

## Design Direction

### Visual Strategy
- **Functional Color Coding**: Each action type has a distinct color carried through templates, nodes, and connections
- **Dark Theme Consistency**: Professional dark interface matching VS Code/Monaco aesthetic
- **Information Density**: Efficient use of space while maintaining readability

### Chain Map Interface
- **Streamlined Header**: Centered rule selector with essential controls only
- **No Sidebar Clutter**: Remove rule configurator when chain view is active
- **Connection Clarity**: Green/red connection handles for success/failure paths
- **Loop Indicators**: Special styling for detected circular dependencies

## Technical Architecture

### Recursive Algorithm
```typescript
// Depth-first traversal with caching and loop detection
async function buildRuleChainRecursively(startRuleId: string, dataServicesRootURI: string) {
  const nodes = {}; edges = [];
  const fetchCache = new Map();
  const processed = new Set();
  
  async function visit(ruleId: string, path: Set<string>) {
    if (path.has(ruleId)) { /* mark loop */ }
    if (processed.has(ruleId)) return;
    
    // Fetch rule data (cached)
    // Parse OnSuccess/OnFailure actions
    // Extract RuleEvaluationAction targets
    // Recursively visit targets
  }
  
  await visit(startRuleId, new Set());
  return { nodes, edges };
}
```

### Schema Compatibility
- Support legacy action format: `{ ActionType: "RuleEvaluationAction", TargetRuleId: "..." }`
- Support new action format: `{ Type: "RuleEvaluationAction", Parameters: { TargetRuleId: "..." } }`
- Graceful degradation for unsupported action types

### Performance Optimizations
- **API Call Caching**: Single fetch per rule regardless of how many times referenced
- **Incremental Rendering**: Update visualization as nodes are discovered
- **Loop Prevention**: Early termination prevents infinite recursion
- **Memory Management**: Cleanup unused references during large traversals

## User Experience Flow

1. **Chain Initiation**: User clicks "Chain Map" → Dialog opens for start rule selection
2. **Recursive Building**: System performs depth-first traversal, showing progress
3. **Interactive Visualization**: Full-screen chain map with navigable nodes
4. **Node Exploration**: Click any node → Comprehensive editor opens
5. **Template Integration**: Template-driven actions show parameter forms
6. **Chain Navigation**: Continue exploring through connected rules

## Acceptance Criteria

### Functional Requirements
- ✅ Recursively traverse rule chains following RuleEvaluationAction links only
- ✅ Handle both old and new action schemas transparently
- ✅ Detect circular dependencies and mark loop endpoints
- ✅ Cache all API calls to prevent redundant server requests
- ✅ Support template-driven action configuration
- ✅ Validate and block unsupported action types

### Interface Requirements  
- ✅ Full-screen chain view when active (no rule configurator)
- ✅ Centered rule selector in chain map header
- ✅ Click-to-edit nodes with comprehensive dialogs
- ✅ Color-coded nodes matching function types
- ✅ Success/failure connection handles
- ✅ Export functionality for chain data

### Performance Requirements
- ✅ Handle chains with 100+ nodes without performance degradation
- ✅ Sub-second rendering for typical rule chains (10-50 nodes)
- ✅ Graceful handling of API timeouts and errors
- ✅ Memory-efficient processing of large rule networks

## Success Metrics
- **Coverage**: Successfully map 95%+ of rule chains without errors
- **Performance**: Average chain generation time under 3 seconds
- **Accuracy**: Zero false positives in loop detection
- **Usability**: Users can navigate complex chains (50+ rules) intuitively