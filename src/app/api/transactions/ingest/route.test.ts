import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ requireRole: vi.fn(), verifyOrigin: vi.fn() }));
const ingest = vi.hoisted(() => ({ ingestTransaction: vi.fn() }));
const keys = vi.hoisted(() => ({ authenticateIngestionKey: vi.fn() }));
vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/ingestion-key', () => keys);
vi.mock('@/lib/transaction-ingest', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/transaction-ingest')>(), ingestTransaction: ingest.ingestTransaction }));

import { POST } from './route';

const actor = { id: 'manager-1', organizationId: 'org-1', role: 'MANAGER' };
const valid = { sourceReference: 'processor-1', customerId: 'customer-1', type: 'WIRE', direction: 'OUTBOUND', amount: 15000, currency: 'USD', timestamp: '2026-09-20T15:00:00Z' };
const request = (body: unknown, authorization?: string) => new Request('http://localhost/api/transactions/ingest', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });

describe('transaction ingest route', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.requireRole.mockResolvedValue({ ok: true, user: actor }); auth.verifyOrigin.mockResolvedValue(true); });

  it('rejects viewers and cross-origin requests before ingestion', async () => {
    auth.requireRole.mockResolvedValueOnce({ ok: false, error: Response.json({ error: 'Insufficient permission' }, { status: 403 }) });
    expect((await POST(request(valid))).status).toBe(403);
    auth.verifyOrigin.mockResolvedValueOnce(false);
    expect((await POST(request(valid))).status).toBe(403);
    expect(ingest.ingestTransaction).not.toHaveBeenCalled();
  });

  it('rejects malformed money and forwards a valid transaction with the signed-in tenant', async () => {
    expect((await POST(request({ ...valid, currency: 'US', amount: -4 }))).status).toBe(400);
    expect(ingest.ingestTransaction).not.toHaveBeenCalled();
    ingest.ingestTransaction.mockResolvedValue({ transactionId: 'txn-1', alertId: 'alert-1', duplicate: false });
    const response = await POST(request(valid));
    expect(response.status).toBe(201);
    expect(ingest.ingestTransaction).toHaveBeenCalledWith(valid, actor);
  });

  it('accepts a valid ingestion key without a browser session and rejects an invalid key', async () => {
    keys.authenticateIngestionKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'key-1', organizationId: 'org-2' });
    expect((await POST(request(valid, 'Bearer bad'))).status).toBe(401);
    ingest.ingestTransaction.mockResolvedValue({ transactionId: 'txn-2', alertId: null, duplicate: false });
    expect((await POST(request(valid, 'Bearer valid'))).status).toBe(201);
    expect(auth.requireRole).not.toHaveBeenCalled();
    expect(ingest.ingestTransaction).toHaveBeenCalledWith(valid, { id: null, organizationId: 'org-2', credentialId: 'key-1' });
  });
});
