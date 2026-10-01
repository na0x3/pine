import { requireRole, verifyOrigin } from '@/lib/auth';
import { authenticateIngestionKey } from '@/lib/ingestion-key';
import { ingestTransaction, ingestTransactionSchema, IngestError } from '@/lib/transaction-ingest';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  let actor: { id: string | null; organizationId: string; credentialId?: string };
  if (authorization) {
    const key = await authenticateIngestionKey(authorization);
    if (!key) return Response.json({ error: 'Invalid ingestion key' }, { status: 401 });
    actor = { id: null, organizationId: key.organizationId, credentialId: key.id };
  } else {
    const auth = await requireRole(['ADMIN', 'MANAGER']);
    if (!auth.ok) return auth.error;
    if (!await verifyOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
    actor = auth.user;
  }
  if (Number(request.headers.get('content-length')) > 16_384) return Response.json({ error: 'Transaction payload is too large' }, { status: 413 });
  const body = await request.text().catch(() => '');
  if (body.length > 16_384) return Response.json({ error: 'Transaction payload is too large' }, { status: 413 });
  const input = ingestTransactionSchema.safeParse((() => { try { return JSON.parse(body); } catch { return null; } })());
  if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? 'Invalid transaction' }, { status: 400 });
  try {
    const result = await ingestTransaction(input.data, actor);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Transaction ingest failed' }, { status: error instanceof IngestError ? error.status : 500 });
  }
}
