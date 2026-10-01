import { requireRole, verifyOrigin } from '@/lib/auth';
import { CaseError, investigateAlert } from '@/lib/case-service';
import { assertLocal, connectionStatus } from '@/lib/chatgpt-plan';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'MANAGER', 'ANALYST']);
  if (!auth.ok) return auth.error;
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const plan = await connectionStatus(auth.user.id);
  if (plan.connected && plan.model && process.env.OPENAI_DATA_SHARING_ENABLED === 'true') {
    try { assertLocal(request); }
    catch { return Response.json({ error: 'ChatGPT plan investigations require a local 127.0.0.1 session' }, { status: 403 }); }
  }
  try { const investigation = await investigateAlert((await params).id, auth.user); return Response.json({ id: investigation.id, version: investigation.version }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Investigation failed' }, { status: error instanceof CaseError ? error.status : 500 }); }
}
