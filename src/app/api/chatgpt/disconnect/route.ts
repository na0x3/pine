import { requireUser, verifyOrigin } from '@/lib/auth';
import { assertLocal, disconnectChatGPT } from '@/lib/chatgpt-plan';

export async function POST(request: Request) {
  const user = await requireUser();
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  try { assertLocal(request); await disconnectChatGPT(user.id); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not disconnect' }, { status: 400 }); }
}
