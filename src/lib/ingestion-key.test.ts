import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  ingestionKey: { findUnique: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('./db', () => ({ db }));

import { authenticateIngestionKey, issueIngestionKey } from './ingestion-key';

describe('ingestion keys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the raw key once and stores only its hash', async () => {
    const create = vi.fn().mockImplementation(async ({ data }) => ({ id: 'key-1', name: data.name, tokenPrefix: data.tokenPrefix, createdAt: new Date('2026-09-28') }));
    const audit = vi.fn();
    db.$transaction.mockImplementation(async callback => callback({ ingestionKey: { create }, auditLog: { create: audit } }));
    const issued = await issueIngestionKey('org-1', 'admin-1', 'Processor');
    expect(issued.token).toMatch(/^varia_ing_[A-Za-z0-9_-]{43}$/);
    expect(create.mock.calls[0][0].data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(create.mock.calls[0][0].data.tokenHash).not.toBe(issued.token);
    expect(audit).toHaveBeenCalledOnce();
  });

  it('refuses a key revoked before use', async () => {
    db.ingestionKey.findUnique.mockResolvedValue({ id: 'key-1', organizationId: 'org-1' });
    db.ingestionKey.updateMany.mockResolvedValue({ count: 0 });
    await expect(authenticateIngestionKey(`Bearer varia_ing_${'A'.repeat(43)}`)).resolves.toBeNull();
  });
});
