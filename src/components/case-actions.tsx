'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';
import { Sparkles, Check, Download, FileJson, FileText } from 'lucide-react';

export function CaseActions({ alertId, status, canWrite, source, aiEnabled }: { alertId: string; status: string; canWrite: boolean; source?: string; aiEnabled: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState('REQUEST_INFORMATION');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const investigateLabel = busy === 'investigate' ? 'Investigating…' : aiEnabled ? 'Investigate with AI' : 'Run synthetic analysis';
  async function post(path: string, body?: unknown) {
    const response = await fetch(`/api/alerts/${alertId}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    router.refresh();
  }
  async function investigate() { setBusy('investigate'); setError(''); setSuccess(''); try { await post('investigate'); setSuccess('Investigation saved as a new version.'); } catch (error) { setError(error instanceof Error ? error.message : 'Investigation failed'); } finally { setBusy(''); } }
  async function submitDecision() { setBusy('decision'); setError(''); setSuccess(''); try { await post('decision', { decision, note }); setNote(''); setSuccess('Decision recorded in the audit log.'); } catch (error) { setError(error instanceof Error ? error.message : 'Decision failed'); } finally { setBusy(''); } }
  return <div className="stack">
    <section className="card section-pad"><h3 className="section-title"><Sparkles/> Investigation analysis</h3><p className="subtle" style={{ fontSize: 11, marginBottom: 15 }}>Analyze transaction history, customer context, and deterministic signals.</p><Button variant="primary" onClick={investigate} disabled={!canWrite || status === 'CLOSED' || !!busy} style={{ width: '100%' }}><Sparkles size={14}/>{investigateLabel}</Button>{!aiEnabled && <p className="subtle" style={{ fontSize: 9, margin: '9px 0 0' }}>This creates a labeled synthetic demo analysis. AI data sharing is disabled.</p>}{source === 'SYNTHETIC_DEMO' && <p className="subtle" style={{ fontSize: 9, margin: '9px 0 0' }}>Current result: synthetic demo analysis.</p>}</section>
    <section className="card section-pad"><h3 className="section-title"><Check/> Analyst decision</h3><p className="subtle" style={{ fontSize: 10 }}>Your decision is final for this alert. It can differ from the AI recommendation.</p><label className="eyebrow" htmlFor="decision">DECISION</label><select id="decision" className="select action-select" value={decision} onChange={e => setDecision(e.target.value)} disabled={!canWrite || status === 'CLOSED'}><option value="REQUEST_INFORMATION">Request information</option><option value="CLOSE">Close alert</option><option value="ESCALATE">Escalate</option><option value="SUSPICIOUS_ACTIVITY_REVIEW">Suspicious activity review</option></select><label className="eyebrow" htmlFor="decision-note">ANALYST NOTE · REQUIRED</label><textarea id="decision-note" className="textarea" placeholder="Explain the evidence and your decision…" value={note} onChange={e => setNote(e.target.value)} disabled={!canWrite || status === 'CLOSED'}/><Button onClick={submitDecision} disabled={!canWrite || status === 'CLOSED' || note.trim().length < 10 || !!busy} style={{ width: '100%', marginTop: 9 }}>{busy === 'decision' ? 'Saving…' : 'Record decision'}</Button>{status === 'CLOSED' && <p className="subtle" style={{ fontSize: 10, margin: '10px 0 0' }}>This alert is closed.</p>}{error && <p role="alert" className="error">{error}</p>}{success && <p role="status" style={{ color: '#387c51', fontSize: 10, marginTop: 10 }}>{success}</p>}<div className="review-warning">AI-generated investigation output is decision support only and must be reviewed by an authorized human analyst.</div></section>
    <section className="card section-pad"><h3 className="section-title"><Download/> Export case</h3><div className="button-row"><a className="button small" href={`/api/alerts/${alertId}/export/json`}><FileJson size={13}/> JSON</a><a className="button small" href={`/api/alerts/${alertId}/export/pdf`}><FileText size={13}/> PDF report</a></div></section>
  </div>;
}

export function Assignment({ alertId, current, analysts }: { alertId: string; current: string | null; analysts: { id: string; name: string }[] }) { const router = useRouter(); const [error, setError] = useState(''); return <><select className="select" style={{ width: '100%' }} value={current ?? ''} onChange={async e => { setError(''); const response = await fetch(`/api/alerts/${alertId}/assignment`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ analystId: e.target.value || null }) }); if (!response.ok) setError((await response.json()).error || 'Assignment failed'); else router.refresh(); }}><option value="">Unassigned</option>{analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{error && <p className="error">{error}</p>}</>; }
