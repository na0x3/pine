import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { investigationSchema } from './validation';

const resource = 'https://api.openai.com/v1';
const tokenEndpoint = 'https://auth.openai.com/api/accounts/oauth/token';
const jwks = createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json'));
const localDir = process.env.VARIA_LOCAL_AUTH_DIR ? path.resolve(process.env.VARIA_LOCAL_AUTH_DIR) : path.join(process.cwd(), '.varia');
const storePath = path.join(localDir, 'chatgpt-connections.json');
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');
const random = () => randomBytes(32).toString('base64url');

type Credentials = {
  clientId: string; subject: string; email: string | null; idToken: string;
  accessToken: string; refreshToken: string; expiresAt: number; model: string | null;
};
type Pending = { state: string; nonce: string; verifier: string; clientId: string; redirectUri: string; expiresAt: number };
type Store = { hostId: string; accounts: Record<string, Credentials>; pending: Record<string, Pending> };
let writeQueue: Promise<unknown> = Promise.resolve();
const refreshes = new Map<string, Promise<string>>();

export function assertLocal(request: Request) {
  const incoming = new URL(request.url);
  const host = request.headers.get('host');
  if (incoming.protocol !== 'http:' || !host || !/^127\.0\.0\.1(?::\d{1,5})?$/.test(host)) {
    throw new Error('ChatGPT plan sign-in is available only at http://127.0.0.1 on this computer.');
  }
  return new URL(`${incoming.pathname}${incoming.search}`, `http://${host}`);
}

async function readStore(): Promise<Store> {
  try { return JSON.parse(await readFile(storePath, 'utf8')) as Store; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { hostId: `urn:uuid:${randomUUID()}`, accounts: {}, pending: {} };
  }
}

async function updateStore<T>(update: (store: Store) => T | Promise<T>): Promise<T> {
  const task = writeQueue.then(async () => {
    await mkdir(localDir, { recursive: true, mode: 0o700 });
    const store = await readStore();
    const result = await update(store);
    const temporary = `${storePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(store), { mode: 0o600, flag: 'wx' });
    await rename(temporary, storePath);
    return result;
  });
  writeQueue = task.catch(() => {});
  return task;
}

export async function connectionStatus(userId: string) {
  const credentials = (await readStore()).accounts[userId];
  return credentials ? { connected: true, email: credentials.email, model: credentials.model } : { connected: false, email: null, model: null };
}

export async function beginChatGPTSignIn(userId: string, request: Request) {
  const local = assertLocal(request);
  const redirectUri = `${local.origin}/auth/callback`;
  const state = random(); const nonce = random(); const verifier = random();
  const { clientId, email, hostId } = await updateStore(store => {
    const existing = store.accounts[userId];
    const clientId = existing?.clientId ?? 'dynamic_agent_client';
    store.pending[userId] = { state, nonce, verifier, clientId, redirectUri, expiresAt: Date.now() + 10 * 60_000 };
    return { clientId, email: existing?.email, hostId: store.hostId };
  });
  const authorize = new URL('https://auth.openai.com/api/accounts/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('ext_agent_host_id', hostId);
  if (clientId === 'dynamic_agent_client') authorize.searchParams.set('agent_name_hint', 'Varia');
  // A returning user can select their account; keeping ID tokens out of URLs avoids log exposure.
  if (email) authorize.searchParams.set('login_hint', email);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct');
  authorize.searchParams.set('resource', resource);
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('nonce', nonce);
  authorize.searchParams.set('code_challenge_method', 'S256');
  authorize.searchParams.set('code_challenge', hash(verifier));
  return authorize;
}

type TokenResponse = { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string };
async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store' });
  if (!response.ok) throw new Error(`ChatGPT token request failed (${response.status}). Please reconnect.`);
  return response.json() as Promise<TokenResponse>;
}

export async function completeChatGPTSignIn(userId: string, request: Request) {
  const local = assertLocal(request);
  const state = local.searchParams.get('state') ?? '';
  const pending = await updateStore(store => {
    const value = store.pending[userId];
    if (!value || value.expiresAt < Date.now() || value.redirectUri !== `${local.origin}/auth/callback` || !state || !timingSafeEqual(Buffer.from(hash(state)), Buffer.from(hash(value.state)))) throw new Error('ChatGPT sign-in expired. Please try again.');
    delete store.pending[userId]; // one-time use, even after an error
    return value;
  });
  if (local.searchParams.has('error')) throw new Error('ChatGPT access was not granted.');
  const code = local.searchParams.get('code');
  if (!code) throw new Error('ChatGPT did not return an authorization code.');
  const returnedClientId = local.searchParams.get('client_id');
  if (pending.clientId !== 'dynamic_agent_client' && returnedClientId && returnedClientId !== pending.clientId) throw new Error('ChatGPT returned a different client registration.');
  const clientId = pending.clientId === 'dynamic_agent_client' ? returnedClientId : pending.clientId;
  if (!clientId || clientId === 'dynamic_agent_client') throw new Error('ChatGPT did not complete client registration.');
  const tokens = await requestTokens(new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource }));
  if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(' ').includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan permission was not granted.');
  const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: 'https://auth.openai.com', audience: clientId, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 });
  if (payload.nonce !== pending.nonce || !payload.sub) throw new Error('ChatGPT identity verification failed.');
  await updateStore(store => {
    const existing = store.accounts[userId];
    if (existing && existing.subject !== payload.sub) throw new Error('A different ChatGPT account was returned. Disconnect the current account first.');
    store.accounts[userId] = { clientId, subject: payload.sub!, email: typeof payload.email === 'string' ? payload.email : null, idToken: tokens.id_token!, accessToken: tokens.access_token!, refreshToken: tokens.refresh_token!, expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000, model: existing?.model ?? null };
  });
}

async function getAccessToken(userId: string): Promise<string | null> {
  const credentials = (await readStore()).accounts[userId];
  if (!credentials) return null;
  if (credentials.expiresAt > Date.now() + 90_000) return credentials.accessToken;
  const running = refreshes.get(userId);
  if (running) return running;
  const task = (async () => {
    const current = (await readStore()).accounts[userId];
    if (!current) throw new Error('ChatGPT account disconnected.');
    if (current.expiresAt > Date.now() + 90_000) return current.accessToken;
    const tokens = await requestTokens(new URLSearchParams({ grant_type: 'refresh_token', client_id: current.clientId, refresh_token: current.refreshToken, resource }));
    if (!tokens.access_token || !tokens.refresh_token || (tokens.scope && !tokens.scope.split(' ').includes('chatgpt.tokens.use.direct'))) throw new Error('ChatGPT plan access expired. Please reconnect.');
    await updateStore(store => {
      const saved = store.accounts[userId];
      if (!saved || saved.clientId !== current.clientId || saved.subject !== current.subject) throw new Error('ChatGPT account changed during refresh.');
      saved.accessToken = tokens.access_token!;
      saved.refreshToken = tokens.refresh_token!;
      saved.expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
    });
    return tokens.access_token;
  })();
  refreshes.set(userId, task);
  try { return await task; } finally { refreshes.delete(userId); }
}

export async function listChatGPTModels(userId: string) {
  const token = await getAccessToken(userId);
  if (!token) return [];
  const response = await fetch(`${resource}/models`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ChatGPT models (${response.status}).`);
  const data = await response.json() as { models?: { slug?: string; display_name?: string; visibility?: string }[] };
  return (data.models ?? []).filter(model => model.visibility === 'list' && model.slug).map(model => ({ id: model.slug!, name: model.display_name ?? model.slug! }));
}

export async function selectChatGPTModel(userId: string, model: string) {
  const models = await listChatGPTModels(userId);
  if (!models.some(item => item.id === model)) throw new Error('This model is unavailable for the connected ChatGPT account.');
  await updateStore(store => { if (!store.accounts[userId]) throw new Error('ChatGPT account disconnected.'); store.accounts[userId].model = model; });
}

export async function disconnectChatGPT(userId: string) {
  const credentials = (await readStore()).accounts[userId];
  if (credentials) {
    try {
      const discovery = await fetch('https://auth.openai.com/.well-known/openid-configuration', { cache: 'no-store' });
      if (discovery.ok) {
        const configuration = await discovery.json() as { revocation_endpoint?: string };
        if (configuration.revocation_endpoint?.startsWith('https://auth.openai.com/')) await fetch(configuration.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: credentials.refreshToken, token_type_hint: 'refresh_token', client_id: credentials.clientId }) });
      }
    }
    finally { await updateStore(store => { delete store.accounts[userId]; delete store.pending[userId]; }); }
  }
}

export async function planInvestigation(userId: string, context: unknown) {
  const credentials = (await readStore()).accounts[userId];
  if (!credentials?.model) throw new Error('Choose a ChatGPT model in Settings before investigating.');
  const token = await getAccessToken(userId);
  if (!token) throw new Error('Connect your ChatGPT account in Settings first.');
  const client = new OpenAI({ apiKey: token, maxRetries: 0 });
  let content = ''; let completed = false;
  const stream = await client.responses.create({
    model: credentials.model,
    instructions: 'You are an investigation assistant for human financial compliance analysts. Analyze only supplied evidence. Do not assume missing facts. Every risk or mitigating factor must cite supplied evidence IDs. Explain risk and mitigating context. A human makes the final decision. Never invent sanctions matches or regulatory conclusions.',
    input: [{ role: 'user', content: JSON.stringify(context) }],
    text: { format: zodTextFormat(investigationSchema, 'investigation') },
    store: false, stream: true,
  });
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') content += event.delta;
    if (event.type === 'response.failed') throw new Error(`ChatGPT investigation failed: ${event.response.error?.code ?? 'unknown error'}`);
    if (event.type === 'response.completed') completed = true;
  }
  if (!completed) throw new Error('ChatGPT investigation ended without completion.');
  return { model: credentials.model, output: investigationSchema.parse(JSON.parse(content)) };
}
