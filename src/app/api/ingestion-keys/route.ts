import { requireRole, verifyOrigin } from '@/lib/auth';
import { issueIngestionKey } from '@/lib/ingestion-key';
import { z } from 'zod';

const schema = z.object({ name: z.string().trim().min(3).max(80) }).strict();

export async function POST(request: Request) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.error;
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: 'Enter a key name of 3–80 characters' }, { status: 400 });
  const key = await issueIngestionKey(auth.user.organizationId, auth.user.id, input.data.name);
  return Response.json(key, { status: 201, headers: { 'cache-control': 'no-store' } });
}
