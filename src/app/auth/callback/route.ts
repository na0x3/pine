import { currentUser } from '@/lib/auth';
import { assertLocal, completeChatGPTSignIn } from '@/lib/chatgpt-plan';

export async function GET(request: Request) {
  let local: URL;
  try { local = assertLocal(request); }
  catch { return Response.json({ error: 'Use http://127.0.0.1 for ChatGPT sign-in' }, { status: 403 }); }
  const user = await currentUser();
  if (!user) return Response.redirect(new URL('/login', local));
  try {
    await completeChatGPTSignIn(user.id, request);
    return Response.redirect(new URL('/settings?chatgpt=connected', local));
  } catch {
    return Response.redirect(new URL('/settings?chatgpt=error', local));
  }
}
