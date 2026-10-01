'use client';
import { useEffect, useState } from 'react';

type Model = { id: string; name: string };
export function ChatGPTConnection({ connected, email, selectedModel, notice, dataSharingEnabled }: { connected: boolean; email: string | null; selectedModel: string | null; notice?: string; dataSharingEnabled: boolean }) {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState(selectedModel ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!connected) return;
    fetch('/api/chatgpt/models').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load models');
      setModels(data.models);
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load models'));
  }, [connected]);
  async function post(path: string, body?: unknown) {
    setBusy(true); setError('');
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed'); setBusy(false); }
  }
  return <section className="card card-pad" style={{ marginBottom: 17 }}>
    <h2>ChatGPT plan for investigations</h2>
    <p className="subtle" style={{ margin: '8px 0 14px' }}>Connect your own ChatGPT account on this computer. Case context is sent only when you run an AI investigation and data sharing is enabled.</p>
    {notice === 'connected' && <p role="status">ChatGPT account connected.</p>}
    {notice === 'error' && <p role="alert" className="error">ChatGPT sign-in did not complete. Please try again.</p>}
    {notice === 'local-only' && <p role="alert" className="error">Open Varia at http://127.0.0.1:3000 to connect your ChatGPT plan.</p>}
    {!dataSharingEnabled && <p className="subtle" style={{ marginBottom: 12 }}>AI investigations are disabled. Set OPENAI_DATA_SHARING_ENABLED=true in your local .env and restart Varia after reviewing the case context described in the README.</p>}
    {connected ? <>
      <p className="subtle">Connected as {email ?? 'ChatGPT account'}</p>
      <label htmlFor="chatgpt-model" className="eyebrow">MODEL</label>
      <select id="chatgpt-model" className="select" value={model} onChange={event => setModel(event.target.value)}><option value="">Choose a model</option>{models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <div className="button-row" style={{ marginTop: 12 }}><button className="button primary" disabled={!model || busy} onClick={() => post('/api/chatgpt/models', { model })}>Save model</button><a className="button" href="/api/chatgpt/connect">Reconnect</a><button className="button" disabled={busy} onClick={() => post('/api/chatgpt/disconnect')}>Disconnect</button></div>
    </> : <a className="button primary" href="/api/chatgpt/connect">Continue with ChatGPT</a>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
