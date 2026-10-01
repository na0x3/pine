'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type KeyRow = { id: string; name: string; tokenPrefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

export function IngestionKeys({ keys }: { keys: KeyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [issued, setIssued] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true); setError(''); setIssued('');
    try {
      const response = await fetch('/api/ingestion-keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create key');
      setIssued(data.token); setName(''); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create key'); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/ingestion-keys/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not revoke key');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not revoke key'); }
    finally { setBusy(false); }
  }

  return <section className="card card-pad" style={{ marginTop: 17 }}>
    <h2>Data ingestion keys</h2>
    <p className="subtle" style={{ marginTop: 8 }}>Keys allow a source system to submit customers and transactions to this workspace. Each key can only use the two ingestion endpoints.</p>
    <div className="button-row" style={{ marginTop: 14 }}><input className="field" aria-label="New key name" placeholder="Key name, such as staging processor" value={name} onChange={event => setName(event.target.value)} maxLength={80}/><button className="button primary" onClick={create} disabled={busy || name.trim().length < 3}>Create key</button></div>
    {issued && <div className="note-box" role="status" style={{ marginTop: 14, overflowWrap: 'anywhere' }}><strong>Copy this key now. It will only be shown once.</strong><br/><code>{issued}</code></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="table-wrap" style={{ marginTop: 16 }}><table><thead><tr><th>Name</th><th>Prefix</th><th>Created</th><th>Last used</th><th>Status</th><th></th></tr></thead><tbody>{keys.map(key => <tr key={key.id}><td>{key.name}</td><td><code>{key.tokenPrefix}…</code></td><td>{new Date(key.createdAt).toLocaleDateString()}</td><td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}</td><td>{key.revokedAt ? 'Revoked' : 'Active'}</td><td>{!key.revokedAt && <button className="button small" onClick={() => revoke(key.id)} disabled={busy}>Revoke</button>}</td></tr>)}</tbody></table></div>
  </section>;
}
