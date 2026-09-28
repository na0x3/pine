import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ requireRole: vi.fn(), verifyOrigin: vi.fn() }));
const cases = vi.hoisted(() => ({ decideAlert: vi.fn(), investigateAlert: vi.fn() }));
vi.mock('@/lib/auth', () => auth);
vi.mock('@/lib/case-service', () => ({ ...cases, CaseError: class CaseError extends Error { status = 400; } }));

import { POST as decide } from './[id]/decision/route';
import { POST as investigate } from './[id]/investigate/route';

const actor = { id: 'analyst-1', organizationId: 'org-1', role: 'ANALYST' };
const params = { params: Promise.resolve({ id: 'ALT-1' }) };
const request = (body: unknown) => new Request('http://localhost/api/alerts/ALT-1/decision', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify(body) });

describe('case action routes', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.requireRole.mockResolvedValue({ ok: true, user: actor }); auth.verifyOrigin.mockResolvedValue(true); });
  it('rejects a decision without a substantive analyst note', async () => {
    const response = await decide(request({ decision: 'CLOSE', note: 'ok' }), params);
    expect(response.status).toBe(400);
    expect(cases.decideAlert).not.toHaveBeenCalled();
  });
  it('passes the authenticated tenant and analyst to the decision service', async () => {
    cases.decideAlert.mockResolvedValue({ id: 'decision-1' });
    const response = await decide(request({ decision: 'REQUEST_INFORMATION', note: 'Please obtain the invoice.' }), params);
    expect(response.status).toBe(200);
    expect(cases.decideAlert).toHaveBeenCalledWith('ALT-1', actor, 'REQUEST_INFORMATION', 'Please obtain the invoice.');
  });
  it('blocks viewer investigation at the server boundary', async () => {
    auth.requireRole.mockResolvedValue({ ok: false, error: Response.json({ error: 'Insufficient permission' }, { status: 403 }) });
    const response = await investigate(request({}), params);
    expect(response.status).toBe(403);
    expect(cases.investigateAlert).not.toHaveBeenCalled();
  });
  it('blocks cross-origin mutation requests', async () => {
    auth.verifyOrigin.mockResolvedValue(false);
    const response = await decide(request({ decision: 'CLOSE', note: 'Reviewed all transactions.' }), params);
    expect(response.status).toBe(403);
    expect(cases.decideAlert).not.toHaveBeenCalled();
  });
});
