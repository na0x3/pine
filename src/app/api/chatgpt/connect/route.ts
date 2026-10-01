import { currentUser } from '@/lib/auth';
import { assertLocal, beginChatGPTSignIn } from '@/lib/chatgpt-plan';

export async function GET(request: Request) {
  let local: URL;
  try { local = assertLocal(request); }
  catch { return Response.json({ error: 'Use http://127.0.0.1 to connect ChatGPT' }, { status: 403 }); }
  const user = await currentUser();
  if (!user) return Response.redirect(new URL('/login', local));
  try { return Response.redirect(await beginChatGPTSignIn(user.id, request)); }
  catch { return Response.redirect(new URL('/settings?chatgpt=error', local)); }
}
