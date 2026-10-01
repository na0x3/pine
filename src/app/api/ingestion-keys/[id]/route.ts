import { requireRole, verifyOrigin } from '@/lib/auth';
import { revokeIngestionKey } from '@/lib/ingestion-key';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN']);
  if (!auth.ok) return auth.error;
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const revoked = await revokeIngestionKey((await params).id, auth.user.organizationId, auth.user.id);
  return revoked ? Response.json({ ok: true }) : Response.json({ error: 'Active key not found' }, { status: 404 });
}
