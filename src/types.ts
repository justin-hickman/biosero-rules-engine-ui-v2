export type ChainNode = {
  id: string;
  label: string;
  expression?: string;
  successActions?: string[];
  failureActions?: string[];
  isInitiating?: boolean;
  isError?: boolean;
  actionType?: string;
  templateName?: string;
  inputParameters?: Record<string, any>;
  outputParameters?: Record<string, any>;
};

export type ChainEdge = {
  from: string;
  to: string;
  type: 'success' | 'failure' | 'connection';
  label?: string;
};

export type ChainData = {
  nodes: Record<string, ChainNode>;
  edges: ChainEdge[];
};

export type Rule = {
  id: string | null;
  name: string;
  description?: string;
  typeIdentifier?: string;
};
