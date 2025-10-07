import { ChainData } from '../types';

export const n8nConverter = {
  convertChainToWorkflow(chain: ChainData, name = 'Converted Workflow') {
    const nodes: any[] = [];
    const connections: Record<string, any> = {};

    // Simple position algorithm
    const ids = Object.keys(chain.nodes);
    ids.forEach((id, idx) => {
      const node = chain.nodes[id];
      const isRule = !node.actionType;

      const n8nNode: any = {
        id: id,
        name: node.label || id,
        type: isRule ? 'n8n-nodes-base.if' : 'n8n-nodes-base.httpRequest',
        typeVersion: 1,
        position: [idx * 200, 100],
        parameters: {}
      };

      if (isRule) {
        n8nNode.parameters = {
          conditions: {
            boolean: [
              {
                value1: node.expression || '',
                operation: 'isTrue'
              }
            ]
          }
        };
      } else {
        n8nNode.parameters = {
          requestMethod: 'POST',
          url: '',
          jsonBody: true,
          options: {}
        };
      }

      nodes.push(n8nNode);
    });

    // Build simple connections map expected by n8n API
    chain.edges.forEach(edge => {
      const source = edge.from;
      const target = edge.to;
      if (!connections[source]) connections[source] = { main: [] };
      connections[source].main.push([{ node: target, type: edge.type }]);
    });

    return {
      name,
      nodes,
      connections
    };
  }
};

export default n8nConverter;
