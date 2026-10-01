import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';

const amount = z.number().finite().positive().max(999_999_999_999)
  .refine(value => Math.round(value * 100) / 100 === value, 'Amount must have at most two decimal places');

export const ingestCustomerSchema = z.object({
  sourceReference: z.string().trim().min(1).max(120),
  type: z.enum(['INDIVIDUAL', 'BUSINESS']),
  fullName: z.string().trim().min(1).max(160).optional(),
  businessName: z.string().trim().min(1).max(160).optional(),
  country: z.string().trim().min(2).max(100),
  kycStatus: z.enum(['PENDING', 'VERIFIED', 'NEEDS_REVIEW', 'REJECTED']),
  riskRating: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  onboardedAt: z.string().datetime({ offset: true }),
  expectedMonthlyVolume: amount.optional(),
  expectedMonthlyVolumeCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.type === 'INDIVIDUAL' && (!value.fullName || value.businessName))
    context.addIssue({ code: 'custom', path: ['fullName'], message: 'Individual customers require fullName and no businessName' });
  if (value.type === 'BUSINESS' && (!value.businessName || value.fullName))
    context.addIssue({ code: 'custom', path: ['businessName'], message: 'Business customers require businessName and no fullName' });
  if ((value.expectedMonthlyVolume === undefined) !== (value.expectedMonthlyVolumeCurrency === undefined))
    context.addIssue({ code: 'custom', path: ['expectedMonthlyVolumeCurrency'], message: 'Expected volume and currency must be provided together' });
});

export type IngestCustomerInput = z.infer<typeof ingestCustomerSchema>;
export class CustomerIngestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type ExistingCustomer = NonNullable<Awaited<ReturnType<typeof db.customer.findUnique>>>;
function duplicateResult(existing: ExistingCustomer, input: IngestCustomerInput) {
  const same = existing.type === input.type
    && (existing.fullName ?? '') === (input.fullName ?? '')
    && (existing.businessName ?? '') === (input.businessName ?? '')
    && existing.country === input.country
    && existing.kycStatus === input.kycStatus
    && existing.riskRating === input.riskRating
    && existing.onboardedAt?.getTime() === new Date(input.onboardedAt).getTime()
    && (existing.expectedMonthlyVolume === null ? null : Number(existing.expectedMonthlyVolume)) === (input.expectedMonthlyVolume ?? null)
    && (input.expectedMonthlyVolume === undefined || existing.expectedMonthlyVolumeCurrency === input.expectedMonthlyVolumeCurrency);
  if (!same) throw new CustomerIngestError('Source reference already belongs to a different customer profile', 409);
  return { customerId: existing.id, duplicate: true };
}

export async function ingestCustomer(input: IngestCustomerInput, actor: { id: string | null; organizationId: string; credentialId?: string }) {
  const organizationId = actor.organizationId;
  const onboardedAt = new Date(input.onboardedAt);
  if (onboardedAt.getTime() > Date.now() + 5 * 60_000) throw new CustomerIngestError('Customer onboarding date is in the future');
  const where = { organizationId_sourceReference: { organizationId, sourceReference: input.sourceReference } };
  const existing = await db.customer.findUnique({ where });
  if (existing) return duplicateResult(existing, input);
  try {
    return await db.$transaction(async tx => {
      const customer = await tx.customer.create({ data: {
        organizationId, sourceReference: input.sourceReference, type: input.type,
        fullName: input.fullName, businessName: input.businessName, country: input.country,
        kycStatus: input.kycStatus, riskRating: input.riskRating, onboardedAt,
        expectedMonthlyVolume: input.expectedMonthlyVolume === undefined ? undefined : new Prisma.Decimal(input.expectedMonthlyVolume),
        expectedMonthlyVolumeCurrency: input.expectedMonthlyVolumeCurrency ?? 'USD',
      } });
      await tx.auditLog.create({ data: {
        organizationId, actorUserId: actor.id, entityType: 'Customer', entityId: customer.id,
        action: 'CUSTOMER_INGESTED', metadata: { sourceReference: input.sourceReference, credentialId: actor.credentialId ?? null },
      } });
      return { customerId: customer.id, duplicate: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await db.customer.findUnique({ where });
      if (duplicate) return duplicateResult(duplicate, input);
    }
    throw error;
  }
}
