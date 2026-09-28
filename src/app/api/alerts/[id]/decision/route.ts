import { requireRole, verifyOrigin } from '@/lib/auth';
import { CaseError, decideAlert } from '@/lib/case-service';
import { decisionSchema } from '@/lib/validation';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['ADMIN', 'MANAGER', 'ANALYST']);
  if (!auth.ok) return auth.error;
  if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const input = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message || 'Invalid decision' }, { status: 400 });
  try { const result = await decideAlert((await params).id, auth.user, input.data.decision, input.data.note); return Response.json({ id: result.id }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Decision failed' }, { status: error instanceof CaseError ? error.status : 500 }); }
}
