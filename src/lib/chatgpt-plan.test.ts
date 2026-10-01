import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(tmpdir(), 'varia-chatgpt-test-'));
process.env.VARIA_LOCAL_AUTH_DIR = directory;
vi.resetModules();
const { assertLocal, beginChatGPTSignIn, completeChatGPTSignIn } = await import('./chatgpt-plan');
afterAll(() => { delete process.env.VARIA_LOCAL_AUTH_DIR; });

const localRequest = (url: string) => new Request(url, { headers: { host: '127.0.0.1:3000' } });

describe('local ChatGPT sign-in', () => {
  it('rejects non-loopback requests', () => {
    expect(() => assertLocal(new Request('https://example.com/api/chatgpt/connect', { headers: { host: 'example.com' } }))).toThrow('only at');
    expect(() => assertLocal(new Request('http://127.0.0.1:3000/api/chatgpt/connect', { headers: { host: 'example.com' } }))).toThrow('only at');
    expect(assertLocal(new Request('http://localhost:3000/api/chatgpt/connect', { headers: { host: '127.0.0.1:3000' } })).origin).toBe('http://127.0.0.1:3000');
  });

  it('persists a host ID and consumes only the matching OAuth state', async () => {
    const auth = await beginChatGPTSignIn('analyst-1', localRequest('http://127.0.0.1:3000/api/chatgpt/connect'));
    expect(auth.searchParams.get('client_id')).toBe('dynamic_agent_client');
    expect(auth.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/auth/callback');
    const saved = JSON.parse(await readFile(path.join(directory, 'chatgpt-connections.json'), 'utf8'));
    expect(saved.hostId).toMatch(/^urn:uuid:/);
    expect((await stat(path.join(directory, 'chatgpt-connections.json'))).mode & 0o777).toBe(0o600);
    await expect(completeChatGPTSignIn('analyst-1', localRequest('http://127.0.0.1:3000/auth/callback?state=wrong&error=access_denied'))).rejects.toThrow('expired');
    const validState = auth.searchParams.get('state');
    await expect(completeChatGPTSignIn('analyst-1', localRequest(`http://127.0.0.1:3000/auth/callback?state=${validState}&error=access_denied`))).rejects.toThrow('not granted');
    await expect(completeChatGPTSignIn('analyst-1', localRequest(`http://127.0.0.1:3000/auth/callback?state=${validState}&error=access_denied`))).rejects.toThrow('expired');
  });
});
