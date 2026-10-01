import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ transaction: { findUnique: vi.fn() }, customer: { findFirst: vi.fn() } }));
vi.mock('./db', () => ({ db }));

import { ingestTransaction, ingestTransactionSchema } from './transaction-ingest';

const input = ingestTransactionSchema.parse({
  sourceReference: 'provider-123', customerId: 'customer-1', type: 'WIRE', direction: 'OUTBOUND', amount: 250.35,
  currency: 'USD', timestamp: '2026-09-20T15:00:00Z', counterpartyName: 'Supplier',
});
const actor = { id: 'manager-1', organizationId: 'org-1' };

describe('transaction source references', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the existing result for an exact retry', async () => {
    db.transaction.findUnique.mockResolvedValue({ id: 'txn-1', customerId: input.customerId, type: input.type, direction: input.direction, amount: input.amount, currency: input.currency, timestamp: new Date(input.timestamp), counterpartyName: input.counterpartyName, counterpartyCountry: null, paymentRail: null, description: null, alerts: [{ id: 'alert-1' }] });
    await expect(ingestTransaction(input, actor)).resolves.toEqual({ transactionId: 'txn-1', alertId: 'alert-1', duplicate: true });
    expect(db.customer.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a changed payload with the same source reference', async () => {
    db.transaction.findUnique.mockResolvedValue({ id: 'txn-1', customerId: input.customerId, type: input.type, direction: input.direction, amount: input.amount, currency: input.currency, timestamp: new Date(input.timestamp), counterpartyName: input.counterpartyName, counterpartyCountry: null, paymentRail: null, description: null, alerts: [] });
    await expect(ingestTransaction({ ...input, amount: 999 }, actor)).rejects.toThrow('Source reference already belongs to a different transaction');
  });
});
