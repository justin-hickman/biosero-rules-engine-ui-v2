# Rules Engine Monitor - API Optimization Suggestions

## Current Implementation

The monitor currently works with the existing API endpoints:
- `GET /contexts/rulechains` - Returns all chain IDs (2181 in the example)
- `GET /contexts/rulechains/{chainId}` - Returns chain details

To find the chain for a specific context, we must:
1. Fetch all chain IDs
2. Fetch individual chains (in batches) 
3. Parse the `ds_originalTags` array to find the matching `contextId`

## Performance Issues

With 2000+ chains, this approach has limitations:
- Multiple HTTP requests needed (10-100 depending on position)
- O(n) search complexity
- Network latency compounds the issue
- Not scalable as chain count grows

## Recommended API Improvements

### Option 1: Direct Context-to-Chain Lookup (Preferred)
Add a new endpoint:
```
GET /contexts/{contextId}/chains
```
Returns chains associated with a context directly.

### Option 2: Chain Search with Filtering
Enhance the existing endpoint:
```
GET /contexts/rulechains?contextId={contextId}
```
Returns only chain IDs matching the context.

### Option 3: Include Chain Info in Context
Modify `GET /contexts/{contextId}` to include:
```json
{
  "contextId": "...",
  "activeChainId": "...",
  "recentChainIds": ["..."],
  ...
}
```

### Option 4: Bulk Chain Fetch
Add endpoint to fetch multiple chains at once:
```
POST /contexts/rulechains/bulk
Body: { "chainIds": ["id1", "id2", ...] }
```

## Implementation Priority

1. **Quick Win**: Add contextId filtering to `/contexts/rulechains`
2. **Best Long-term**: Direct context-to-chain lookup endpoint
3. **Alternative**: Store active chainId in context variables

## Current Workarounds

The monitor implements:
- Caching of chain data
- Batch fetching (10 chains at a time)
- Limiting search to 100 most recent chains
- Context-to-chain mapping cache

These help but don't fully solve the scalability issue.
