'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';
export function LoginForm() {
  const router = useRouter();
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const [email, setEmail] = useState(demo ? 'alex@northstar.demo' : '');
  const [password, setPassword] = useState(demo ? 'DemoPass123!' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try { const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); router.push('/alerts'); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Sign in failed'); }
    finally { setLoading(false); }
  }
  return <form className="login-card" onSubmit={submit}><div className="eyebrow">WELCOME BACK</div><h2>Sign in to Varia</h2><p className="subtle">Access your organization’s investigation workspace.</p><label htmlFor="email">Work email</label><input className="field" id="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required/><label htmlFor="password">Password</label><input className="field" id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required/>{error && <p className="error" role="alert">{error}</p>}<Button variant="primary" disabled={loading} style={{ width: '100%', marginTop: 23, height: 42 }}>{loading ? 'Signing in…' : 'Sign in'}</Button>{demo && <div className="note-box" style={{ marginTop: 22 }}><strong>Synthetic demo workspace</strong><br/>Use the prefilled analyst credentials after running the seed command. No customer data is real.</div>}</form>;
}
