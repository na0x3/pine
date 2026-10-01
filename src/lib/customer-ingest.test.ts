import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({ customer: { create: vi.fn() }, auditLog: { create: vi.fn() } }));
const db = vi.hoisted(() => ({ customer: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock('./db', () => ({ db }));

import { ingestCustomer, ingestCustomerSchema } from './customer-ingest';

const input = ingestCustomerSchema.parse({
  sourceReference: 'processor-customer-123', type: 'BUSINESS', businessName: 'Example Supply Co.',
  country: 'United States', kycStatus: 'VERIFIED', riskRating: 'LOW', onboardedAt: '2025-04-10T12:00:00Z',
  expectedMonthlyVolume: 30000, expectedMonthlyVolumeCurrency: 'USD',
});
const actor = { id: null, organizationId: 'org-1', credentialId: 'key-1' };
const existing = {
  id: 'customer-1', type: input.type, fullName: null, businessName: input.businessName,
  country: input.country, kycStatus: input.kycStatus, riskRating: input.riskRating,
  onboardedAt: new Date(input.onboardedAt), expectedMonthlyVolume: input.expectedMonthlyVolume,
  expectedMonthlyVolumeCurrency: input.expectedMonthlyVolumeCurrency,
};

describe('customer ingestion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the same customer for an identical retry scoped to the organization', async () => {
    db.customer.findUnique.mockResolvedValue(existing);
    await expect(ingestCustomer(input, actor)).resolves.toEqual({ customerId: 'customer-1', duplicate: true });
    expect(db.customer.findUnique).toHaveBeenCalledWith({ where: { organizationId_sourceReference: { organizationId: 'org-1', sourceReference: input.sourceReference } } });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a changed profile with the same source reference', async () => {
    db.customer.findUnique.mockResolvedValue(existing);
    await expect(ingestCustomer({ ...input, riskRating: 'HIGH' }, actor)).rejects.toMatchObject({ status: 409 });
  });

  it('creates the customer and audit entry together', async () => {
    db.customer.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(callback => callback(tx));
    tx.customer.create.mockResolvedValue({ id: 'new-customer' });
    tx.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    await expect(ingestCustomer(input, actor)).resolves.toEqual({ customerId: 'new-customer', duplicate: false });
    expect(tx.customer.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: 'org-1', sourceReference: input.sourceReference, onboardedAt: new Date(input.onboardedAt) }) });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ entityId: 'new-customer', action: 'CUSTOMER_INGESTED', metadata: { sourceReference: input.sourceReference, credentialId: 'key-1' } }) });
  });
});
