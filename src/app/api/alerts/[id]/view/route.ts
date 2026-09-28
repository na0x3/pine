import { requireRole, verifyOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'MANAGER', 'ANALYST', 'VIEWER']);
  if (!auth.ok) return auth.error;
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const id = (await params).id;
  if (!await db.alert.findFirst({ where: { id, organizationId: auth.user.organizationId }, select: { id: true } })) return Response.json({ error: 'Alert not found' }, { status: 404 });
  await db.auditLog.create({ data: { organizationId: auth.user.organizationId, actorUserId: auth.user.id, entityType: 'Alert', entityId: id, action: 'CASE_OPENED' } });
  return Response.json({ ok: true });
}
