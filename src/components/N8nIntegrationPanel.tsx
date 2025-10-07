import React, { useState, useEffect } from 'react';
import n8nService from '../services/n8nService';
import n8nConverter from '../utils/n8nConverter';
import { ChainData } from '../types';

export const N8nIntegrationPanel: React.FC<{
  chain: ChainData | null;
  onWorkflowCreated?: (id: string) => void;
}> = ({ chain, onWorkflowCreated }) => {
  const [connected, setConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Checking n8n...');
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch((import.meta.env.VITE_N8N_BASE_URL || 'http://localhost:5678') + '/healthz');
        if (!mounted) return;
        setConnected(res.ok);
        setStatusMessage(res.ok ? 'n8n reachable' : 'n8n not reachable');
      } catch (e) {
        // Fallback: try favicon
        try {
          const img = new Image();
          img.onload = () => { if (mounted) { setConnected(true); setStatusMessage('n8n reachable (image ping)'); } };
          img.onerror = () => { if (mounted) { setConnected(false); setStatusMessage('n8n not reachable'); } };
          img.src = (import.meta.env.VITE_N8N_BASE_URL || 'http://localhost:5678') + '/favicon.ico?cb=' + Date.now();
        } catch {
          if (mounted) { setConnected(false); setStatusMessage('n8n not reachable'); }
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleCreate = async () => {
    if (!chain) return;
    setIsSyncing(true);
    try {
      const workflow = n8nConverter.convertChainToWorkflow(chain, `Chain ${Date.now()}`);
      const created = await n8nService.createWorkflow(workflow.name, workflow.nodes, workflow.connections);
      const id = created?.id || created?.data?.id || created?.workflow?.id || null;
      setWorkflowId(id);
      onWorkflowCreated?.(id);
      setStatusMessage('Workflow created');
      setIsSyncing(false);
    } catch (e: any) {
      setIsSyncing(false);
      setStatusMessage('Create failed: ' + (e?.message || e));
      console.error('n8n create error', e);
    }
  };

  const handleOpen = () => {
    const base = import.meta.env.VITE_N8N_BASE_URL || 'http://localhost:5678';
    if (workflowId) window.open(`${base}/workflow/${workflowId}`, '_blank');
    else window.open(base, '_blank');
  };

  const handleExecute = async () => {
    if (!workflowId) return setStatusMessage('No workflow to execute');
    try {
      setStatusMessage('Executing workflow...');
      const res = await n8nService.executeWorkflow(workflowId, {});
      setStatusMessage('Execution complete');
      console.log('Execution result', res);
    } catch (e: any) {
      setStatusMessage('Execute failed: ' + (e?.message || e));
      console.error('Execute error', e);
    }
  };

  return (
    <div className="n8n-integration-panel">
      <h3>n8n Integration</h3>
      <div className="connection-status">{statusMessage}</div>
      <div className="sync-controls">
        <button className={`sync-button ${isSyncing ? 'syncing' : ''}`} onClick={handleCreate} disabled={!connected || isSyncing}>
          {isSyncing ? 'Syncing...' : 'Create in n8n'}
        </button>
        <button className="open-button" onClick={handleOpen}>Open n8n</button>
        <button className="execute-button" onClick={handleExecute} disabled={!workflowId}>Test Execute</button>
        {workflowId && <div className="workflow-info"><small>Workflow ID: {workflowId}</small></div>}
      </div>

      <div className="setup-instructions">
        <p>Quick setup:</p>
        <ol>
          <li>Start n8n with API enabled: <code>N8N_API_DISABLED=false n8n start</code></li>
          <li>Set <code>VITE_N8N_BASE_URL</code> in <code>.env</code> if needed</li>
        </ol>
      </div>
    </div>
  );
};

export default N8nIntegrationPanel;
