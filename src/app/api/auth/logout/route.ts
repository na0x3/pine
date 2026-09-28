import { signOut, verifyOrigin } from '@/lib/auth';
export async function POST(request: Request) {
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  await signOut();
  return Response.json({ ok: true });
}
