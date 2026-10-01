import { signIn, verifyOrigin } from '@/lib/auth';
import { z } from 'zod';

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) });
export async function POST(request: Request) {
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const data = schema.safeParse(await request.json().catch(() => null));
  if (!data.success) return Response.json({ error: 'Enter a valid email and password' }, { status: 400 });
  // Only use forwarded addresses when deployment explicitly declares its trusted proxy hops.
  const hops = Number(process.env.TRUSTED_PROXY_HOPS);
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map(value => value.trim()) ?? [];
  const ip = Number.isSafeInteger(hops) && hops > 0 && forwarded.length >= hops ? forwarded[forwarded.length - hops] : null;
  if (!await signIn(data.data.email, data.data.password, ip)) return Response.json({ error: 'Invalid credentials or too many attempts' }, { status: 401 });
  return Response.json({ ok: true });
}
