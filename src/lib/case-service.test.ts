import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  alert: { findFirst: vi.fn() }, auditLog: { count: vi.fn(), create: vi.fn() },
  transaction: { findMany: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock('./db', () => ({ db }));

import { investigateAlert } from './case-service';

describe('investigation status race', () => {
  it('does not save an investigation after another analyst closes the alert', async () => {
    db.alert.findFirst.mockResolvedValue({
      id: 'alert-1', organizationId: 'org-1', customerId: 'customer-1', status: 'OPEN', type: 'Manual review', description: '', severity: 'MEDIUM', riskScore: 50,
      transaction: { id: 'txn-1', amount: 100, currency: 'USD', timestamp: new Date('2026-09-20T15:00:00Z'), direction: 'OUTBOUND', type: 'WIRE', counterpartyName: null, counterpartyCountry: null, paymentRail: 'WIRE', metadata: null },
      customer: { id: 'customer-1', type: 'INDIVIDUAL', country: 'US', kycStatus: 'VERIFIED', riskRating: 'LOW', createdAt: new Date('2025-01-01'), expectedMonthlyVolume: null, expectedMonthlyVolumeCurrency: 'USD', accounts: [] },
      investigations: [], decisions: [],
    });
    db.auditLog.count.mockResolvedValue(0);
    db.auditLog.create.mockResolvedValue({});
    db.transaction.findMany.mockResolvedValue([]);
    const previousAlerts = vi.fn().mockResolvedValue([]);
    (db.alert as typeof db.alert & { findMany: typeof previousAlerts }).findMany = previousAlerts;
    const create = vi.fn();
    db.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ alert: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, investigation: { create } }));
    await expect(investigateAlert('alert-1', { id: 'analyst-1', organizationId: 'org-1', role: 'ANALYST' })).rejects.toThrow('Alert was closed during investigation');
    expect(create).not.toHaveBeenCalled();
  });
});
