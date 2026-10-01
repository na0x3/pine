import { requireUser, verifyOrigin } from '@/lib/auth';
import { assertLocal, listChatGPTModels, selectChatGPTModel } from '@/lib/chatgpt-plan';

export async function GET(request: Request) {
  const user = await requireUser();
  try { assertLocal(request); return Response.json({ models: await listChatGPTModels(user.id) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not load models' }, { status: 400 }); }
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    assertLocal(request);
    const body = await request.json() as { model?: unknown };
    if (typeof body.model !== 'string' || body.model.length > 100) return Response.json({ error: 'Invalid model' }, { status: 400 });
    await selectChatGPTModel(user.id, body.model);
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not select model' }, { status: 400 }); }
}
