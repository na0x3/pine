import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { calculateRiskSignals, type RiskTransaction } from './risk-engine';
import { deriveAlert } from './alert-policy';

const amount = z.number().finite().positive().max(999_999_999_999).refine(value => Math.round(value * 100) / 100 === value, 'Amount must have at most two decimal places');
export const ingestTransactionSchema = z.object({
  sourceReference: z.string().trim().min(1).max(120),
  customerId: z.string().min(1).max(120),
  type: z.enum(['ACH', 'WIRE', 'CARD', 'BANK_TRANSFER', 'REMITTANCE', 'MERCHANT_PAYMENT', 'CRYPTO', 'STABLECOIN', 'CASH_EQUIVALENT', 'OTHER']),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  amount,
  currency: z.string().regex(/^[A-Z]{3}$/),
  timestamp: z.string().datetime({ offset: true }),
  counterpartyName: z.string().trim().max(160).optional(),
  counterpartyCountry: z.string().trim().max(100).optional(),
  paymentRail: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
}).strict();
export type IngestTransactionInput = z.infer<typeof ingestTransactionSchema>;

export class IngestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type ExistingTransaction = Prisma.TransactionGetPayload<{ include: { alerts: { select: { id: true } } } }>;
function duplicateResult(existing: ExistingTransaction, input: IngestTransactionInput) {
  const same = existing.customerId === input.customerId && existing.type === input.type && existing.direction === input.direction
    && Number(existing.amount) === input.amount && existing.currency === input.currency && existing.timestamp.getTime() === new Date(input.timestamp).getTime()
    && (existing.counterpartyName ?? '') === (input.counterpartyName ?? '')
    && (existing.counterpartyCountry ?? '') === (input.counterpartyCountry ?? '')
    && (existing.paymentRail ?? '') === (input.paymentRail ?? '')
    && (existing.description ?? '') === (input.description ?? '');
  if (!same) throw new IngestError('Source reference already belongs to a different transaction', 409);
  return { transactionId: existing.id, alertId: existing.alerts[0]?.id ?? null, duplicate: true };
}

export async function ingestTransaction(input: IngestTransactionInput, actor: { id: string | null; organizationId: string; credentialId?: string }) {
  const organizationId = actor.organizationId;
  const existing = await db.transaction.findUnique({ where: { organizationId_sourceReference: { organizationId, sourceReference: input.sourceReference } }, include: { alerts: { select: { id: true } } } });
  if (existing) return duplicateResult(existing, input);
  const customer = await db.customer.findFirst({ where: { id: input.customerId, organizationId } });
  if (!customer) throw new IngestError('Customer not found', 404);
  const timestamp = new Date(input.timestamp);
  if (timestamp.getTime() > Date.now() + 5 * 60_000) throw new IngestError('Transaction timestamp is in the future');
  const [history, previousAlerts] = await Promise.all([
    db.transaction.findMany({ where: { organizationId, customerId: customer.id, timestamp: { lt: timestamp } }, orderBy: { timestamp: 'desc' }, take: 80 }),
    db.alert.findMany({ where: { organizationId, customerId: customer.id, createdAt: { lt: timestamp } }, select: { id: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const current: RiskTransaction = { id: `source:${input.sourceReference}`, amount: input.amount, currency: input.currency, timestamp, direction: input.direction, counterpartyName: input.counterpartyName, counterpartyCountry: input.counterpartyCountry, paymentRail: input.paymentRail };
  const signals = calculateRiskSignals({
    current,
    history: history.map(t => ({ id: t.id, amount: Number(t.amount), currency: t.currency, timestamp: t.timestamp, direction: t.direction, counterpartyName: t.counterpartyName, counterpartyCountry: t.counterpartyCountry, paymentRail: t.paymentRail })),
    customer: { createdAt: customer.createdAt, onboardedAt: customer.onboardedAt, kycStatus: customer.kycStatus, country: customer.country, expectedMonthlyVolume: customer.expectedMonthlyVolume ? Number(customer.expectedMonthlyVolume) : null, expectedMonthlyVolumeCurrency: customer.expectedMonthlyVolumeCurrency },
    previousAlerts,
  });
  const { shouldAlert, score, severity, primary } = deriveAlert(signals);
  try {
    return await db.$transaction(async tx => {
      const transaction = await tx.transaction.create({ data: {
        organizationId, customerId: customer.id, sourceReference: input.sourceReference,
        type: input.type, direction: input.direction, amount: new Prisma.Decimal(input.amount), currency: input.currency,
        timestamp, counterpartyName: input.counterpartyName, counterpartyCountry: input.counterpartyCountry,
        paymentRail: input.paymentRail, description: input.description,
      } });
      const alert = shouldAlert && primary ? await tx.alert.create({ data: {
        organizationId, customerId: customer.id, transactionId: transaction.id,
        type: primary.signal.replaceAll('_', ' '), description: primary.description,
        riskScore: score, severity,
      } }) : null;
      await tx.auditLog.createMany({ data: [
        { organizationId, actorUserId: actor.id, entityType: 'Transaction', entityId: transaction.id, action: 'TRANSACTION_INGESTED', metadata: { sourceReference: input.sourceReference, currency: input.currency, credentialId: actor.credentialId ?? null } },
        ...(alert ? [{ organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alert.id, action: 'ALERT_CREATED', metadata: { transactionId: transaction.id, signalNames: signals.map(s => s.signal), credentialId: actor.credentialId ?? null } }] : []),
      ] });
      return { transactionId: transaction.id, alertId: alert?.id ?? null, duplicate: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const duplicate = await db.transaction.findUnique({ where: { organizationId_sourceReference: { organizationId, sourceReference: input.sourceReference } }, include: { alerts: { select: { id: true } } } });
      if (duplicate) return duplicateResult(duplicate, input);
    }
    throw error;
  }
}
