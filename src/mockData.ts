import { ChainData } from './types';

export const sampleChain: ChainData = {
  nodes: {
    'rule-1': { id: 'rule-1', label: 'Validate Order', expression: 'order.total > 0', isInitiating: true },
    'rule-2': { id: 'rule-2', label: 'Transform Payload', actionType: 'transformation', expression: '', isInitiating: false },
    'rule-3': { id: 'rule-3', label: 'Send Notification', actionType: 'action', expression: '', isInitiating: false }
  },
  edges: [
    { from: 'rule-1', to: 'rule-2', type: 'success' },
    { from: 'rule-2', to: 'rule-3', type: 'success' }
  ]
};

export default sampleChain;
