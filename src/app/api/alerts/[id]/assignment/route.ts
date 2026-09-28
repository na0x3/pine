import { requireRole, verifyOrigin } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'MANAGER']);
  if (!auth.ok) return auth.error;
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const input = z.object({ analystId: z.string().nullable() }).safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: 'Invalid assignment' }, { status: 400 });
  const id = (await params).id;
  const alert = await db.alert.findFirst({ where: { id, organizationId: auth.user.organizationId } });
  if (!alert) return Response.json({ error: 'Alert not found' }, { status: 404 });
  if (input.data.analystId && !await db.user.findFirst({ where: { id: input.data.analystId, organizationId: auth.user.organizationId, active: true, role: { in: ['ADMIN', 'MANAGER', 'ANALYST'] } } })) return Response.json({ error: 'Analyst not found' }, { status: 404 });
  await db.$transaction([
    db.alert.update({ where: { id, organizationId: auth.user.organizationId }, data: { assignedAnalystId: input.data.analystId } }),
    db.auditLog.create({ data: { organizationId: auth.user.organizationId, actorUserId: auth.user.id, entityType: 'Alert', entityId: id, action: 'ALERT_ASSIGNED', previousValue: { analystId: alert.assignedAnalystId }, newValue: { analystId: input.data.analystId } } }),
  ]);
  return Response.json({ ok: true });
}
