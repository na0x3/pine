import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ requireRole: vi.fn(), verifyOrigin: vi.fn() }));
const ingest = vi.hoisted(() => ({ ingestCustomer: vi.fn() }));
const keys = vi.hoisted(() => ({ authenticateIngestionKey: vi.fn() }));
vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/ingestion-key', () => keys);
vi.mock('@/lib/customer-ingest', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/customer-ingest')>(), ingestCustomer: ingest.ingestCustomer }));

import { POST } from './route';

const actor = { id: 'manager-1', organizationId: 'org-1', role: 'MANAGER' };
const valid = { sourceReference: 'provider-customer-1', type: 'INDIVIDUAL', fullName: 'Alex Example', country: 'United States', kycStatus: 'PENDING', riskRating: 'MEDIUM', onboardedAt: '2025-04-10T12:00:00Z' };
const request = (body: unknown, authorization?: string) => new Request('http://localhost/api/customers/ingest', { method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });

describe('customer ingest route', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.requireRole.mockResolvedValue({ ok: true, user: actor }); auth.verifyOrigin.mockResolvedValue(true); });

  it('rejects viewers, cross-origin requests, and invalid profiles', async () => {
    auth.requireRole.mockResolvedValueOnce({ ok: false, error: Response.json({ error: 'Insufficient permission' }, { status: 403 }) });
    expect((await POST(request(valid))).status).toBe(403);
    auth.verifyOrigin.mockResolvedValueOnce(false);
    expect((await POST(request(valid))).status).toBe(403);
    expect((await POST(request({ ...valid, type: 'BUSINESS' }))).status).toBe(400);
    expect(ingest.ingestCustomer).not.toHaveBeenCalled();
  });

  it('accepts a manager session and a valid ingestion key with the correct organization', async () => {
    ingest.ingestCustomer.mockResolvedValue({ customerId: 'customer-1', duplicate: false });
    expect((await POST(request(valid))).status).toBe(201);
    expect(ingest.ingestCustomer).toHaveBeenCalledWith(valid, actor);
    keys.authenticateIngestionKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'key-1', organizationId: 'org-2' });
    expect((await POST(request(valid, 'Bearer bad'))).status).toBe(401);
    expect((await POST(request(valid, 'Bearer valid'))).status).toBe(201);
    expect(ingest.ingestCustomer).toHaveBeenLastCalledWith(valid, { id: null, organizationId: 'org-2', credentialId: 'key-1' });
  });
});
