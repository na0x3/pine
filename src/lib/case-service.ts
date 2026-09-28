import { db } from './db';
import { calculateRiskSignals, type RiskTransaction } from './risk-engine';
import { investigationSchema, type InvestigationOutput } from './validation';
import { customerName, money } from './format';
import type { Prisma, User } from '@prisma/client';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

type Actor = Pick<User, 'id' | 'organizationId' | 'role'>;
type EvidenceInput = { id: string; organizationId: string; type: string; source: string; label: string; value: string; metadata?: Prisma.InputJsonValue };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

export class CaseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export async function getAlertCase(alertId: string, organizationId: string) {
  return db.alert.findFirst({
    where: { id: alertId, organizationId },
    include: {
      customer: { include: { accounts: true } }, transaction: true, assignedAnalyst: { select: { id: true, name: true } },
      investigations: { orderBy: { version: 'desc' }, include: { evidence: true, signals: true, factors: true } },
      decisions: { orderBy: { createdAt: 'desc' }, include: { analyst: { select: { name: true } } } },
    },
  });
}

export async function getCaseTimeline(alertId: string, organizationId: string) {
  return db.auditLog.findMany({ where: { organizationId, entityType: 'Alert', entityId: alertId }, orderBy: { timestamp: 'desc' }, take: 30 });
}

function demoInvestigation(signals: ReturnType<typeof calculateRiskSignals>, evidence: EvidenceInput[], customer: { kycStatus: string }): InvestigationOutput {
  const high = signals.filter(s => s.severity === 'HIGH' || s.severity === 'CRITICAL');
  const ids = new Set(evidence.map(e => e.id));
  const factors = signals.slice(0, 5).map(s => ({ title: s.signal.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()), severity: s.severity.toLowerCase() as 'low' | 'medium' | 'high' | 'critical', explanation: s.description, evidence_ids: [`signal:${s.signal}`].filter(id => ids.has(id)) }));
  return {
    summary: `The transaction triggered ${signals.length} deterministic risk signal${signals.length === 1 ? '' : 's'}. The available record supports additional analyst review of the transaction context.`,
    risk_factors: factors,
    mitigating_factors: customer.kycStatus === 'VERIFIED' ? [{ title: 'Identity verified', explanation: 'The customer record indicates verified KYC status.', evidence_ids: ['customer:kycStatus'] }] : [],
    behavioral_anomalies: signals.filter(s => s.signal.startsWith('velocity') || s.signal === 'rapid_funds_movement').map(s => ({ title: s.signal.replaceAll('_', ' '), explanation: s.description, severity: s.severity === 'LOW' ? 'low' as const : s.severity === 'MEDIUM' ? 'medium' as const : 'high' as const })),
    missing_information: [{ field: 'Transaction purpose and supporting documentation', reason_needed: 'The supplied records do not establish the business purpose or source of funds for this transaction.' }],
    recommended_action: high.length >= 2 ? 'escalate' : 'request_information',
    recommendation_reasoning: high.length >= 2 ? 'Multiple high-severity signals warrant a closer human review.' : 'The available evidence is incomplete for a final disposition; request supporting information.',
    confidence: signals.length ? 'medium' : 'low',
  };
}

export async function investigateAlert(alertId: string, actor: Actor) {
  const startedAt = new Date();
  const alert = await getAlertCase(alertId, actor.organizationId);
  if (!alert) throw new CaseError('Alert not found', 404);
  if (alert.status === 'CLOSED') throw new CaseError('Closed alerts cannot be reinvestigated', 409);
  const recent = await db.auditLog.count({ where: { organizationId: actor.organizationId, actorUserId: actor.id, action: 'INVESTIGATION_STARTED', timestamp: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= 10) throw new CaseError('Investigation limit reached. Try again in one hour.', 429);
  const history = await db.transaction.findMany({ where: { organizationId: actor.organizationId, customerId: alert.customerId, timestamp: { lte: alert.transaction.timestamp } }, orderBy: { timestamp: 'desc' }, take: 80 });
  const previousAlerts = await db.alert.findMany({ where: { organizationId: actor.organizationId, customerId: alert.customerId, id: { not: alert.id }, createdAt: { lt: alert.createdAt } }, select: { id: true, type: true, createdAt: true, status: true }, orderBy: { createdAt: 'desc' }, take: 20 });
  const mapTxn = (t: typeof alert.transaction): RiskTransaction => ({ id: t.id, amount: Number(t.amount), timestamp: t.timestamp, direction: t.direction, counterpartyName: t.counterpartyName, counterpartyCountry: t.counterpartyCountry, paymentRail: t.paymentRail, metadata: t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata) ? t.metadata as Record<string, unknown> : null });
  const signals = calculateRiskSignals({
    current: mapTxn(alert.transaction), history: history.map(mapTxn),
    customer: { createdAt: alert.customer.createdAt, kycStatus: alert.customer.kycStatus, country: alert.customer.country, expectedMonthlyVolume: alert.customer.expectedMonthlyVolume ? Number(alert.customer.expectedMonthlyVolume) : null },
    previousAlerts,
  });
  const evidence: EvidenceInput[] = [
    { id: alert.transaction.id, organizationId: actor.organizationId, type: 'TRANSACTION', source: alert.transaction.id, label: 'Triggering transaction', value: `${money(Number(alert.transaction.amount), alert.transaction.currency)} ${alert.transaction.direction.toLowerCase()} ${alert.transaction.type.toLowerCase()} to ${alert.transaction.counterpartyName ?? 'unknown counterparty'}`, metadata: json({ timestamp: alert.transaction.timestamp, country: alert.transaction.counterpartyCountry, rail: alert.transaction.paymentRail }) },
    { id: 'customer:kycStatus', organizationId: actor.organizationId, type: 'CUSTOMER_FIELD', source: alert.customerId, label: 'KYC status', value: alert.customer.kycStatus },
    { id: 'customer:createdAt', organizationId: actor.organizationId, type: 'CUSTOMER_FIELD', source: alert.customerId, label: 'Account opened', value: alert.customer.createdAt.toISOString() },
    { id: 'customer:expectedMonthlyVolume', organizationId: actor.organizationId, type: 'CUSTOMER_FIELD', source: alert.customerId, label: 'Expected monthly volume', value: alert.customer.expectedMonthlyVolume ? money(Number(alert.customer.expectedMonthlyVolume)) : 'Unknown' },
    ...history.filter(t => t.id !== alert.transaction.id).map(t => ({ id: t.id, organizationId: actor.organizationId, type: 'HISTORICAL_TRANSACTION', source: t.id, label: `${t.type} · ${t.counterpartyName ?? 'Unknown counterparty'}`, value: `${money(Number(t.amount), t.currency)} on ${t.timestamp.toISOString().slice(0, 10)}` })),
    ...previousAlerts.map(a => ({ id: a.id, organizationId: actor.organizationId, type: 'PREVIOUS_ALERT', source: a.id, label: a.type, value: `${a.status} on ${a.createdAt.toISOString().slice(0, 10)}` })),
    ...signals.map(s => ({ id: `signal:${s.signal}`, organizationId: actor.organizationId, type: 'RISK_SIGNAL', source: s.signal, label: s.signal.replaceAll('_', ' '), value: s.description, metadata: json({ severity: s.severity, value: s.value, evidenceIds: s.evidenceIds }) })),
  ];
  const context = {
    alert: { id: alert.id, type: alert.type, description: alert.description, severity: alert.severity, riskScore: alert.riskScore },
    customer: { id: alert.customer.id, name: customerName(alert.customer), type: alert.customer.type, country: alert.customer.country, kycStatus: alert.customer.kycStatus, riskRating: alert.customer.riskRating, createdAt: alert.customer.createdAt, occupation: alert.customer.occupation, industry: alert.customer.businessIndustry, sourceOfFunds: alert.customer.sourceOfFunds, expectedMonthlyVolume: alert.customer.expectedMonthlyVolume?.toString() ?? null, accounts: alert.customer.accounts },
    transaction: { ...alert.transaction, amount: alert.transaction.amount.toString() },
    historicalTransactions: history.map(t => ({ ...t, amount: t.amount.toString() })), previousAlerts, signals,
    evidence: evidence.map(({ id, type, label, value }) => ({ id, type, label, value })),
  };
  await db.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alert.id, action: 'INVESTIGATION_STARTED', metadata: { signalCount: signals.length } } });
  let output: InvestigationOutput;
  let model: string;
  let source: string;
  try {
    if (process.env.OPENAI_API_KEY) {
      model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      source = 'OPENAI';
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.parse({
        model,
        input: [
          { role: 'system', content: 'You are an investigation assistant for human financial compliance analysts. Analyze only supplied evidence. If a fact is not present in the evidence provided, do not assume it. Put it in missing_information if it matters. Every risk or mitigating factor must cite one or more exact evidence IDs from the supplied list. Explain both risk and mitigating context. Your recommendation is decision support only; a human makes the final decision. Never invent sanctions matches or regulatory conclusions.' },
          { role: 'user', content: JSON.stringify(context) },
        ],
        text: { format: zodTextFormat(investigationSchema, 'investigation') },
      });
      if (!response.output_parsed) throw new CaseError('AI returned no structured investigation', 502);
      output = investigationSchema.parse(response.output_parsed);
    } else {
      model = 'synthetic-demo'; source = 'SYNTHETIC_DEMO';
      output = demoInvestigation(signals, evidence, alert.customer);
    }
    const allowed = new Set(evidence.map(e => e.id));
    for (const factor of [...output.risk_factors, ...output.mitigating_factors]) {
      if (!factor.evidence_ids.length || factor.evidence_ids.some(id => !allowed.has(id))) throw new CaseError('Investigation cites missing evidence', 502);
    }
    const version = (alert.investigations[0]?.version ?? 0) + 1;
    const nextStatus = alert.status === 'OPEN' ? 'INVESTIGATING' : alert.status;
    const investigation = await db.$transaction(async tx => {
      const created = await tx.investigation.create({ data: { organizationId: actor.organizationId, alertId: alert.id, version, model, source, output: json(output), contextSnapshot: json(context), createdById: actor.id, startedAt, completedAt: new Date() } });
      await tx.evidence.createMany({ data: evidence.map(({ id, organizationId, type, source, label, value, metadata }) => ({ id: `${created.id}:${id}`, referenceId: id, organizationId, investigationId: created.id, type, source, label, value, metadata })) });
      await tx.riskSignal.createMany({ data: signals.map(s => ({ organizationId: actor.organizationId, investigationId: created.id, signal: s.signal, severity: s.severity, value: s.value, description: s.description, evidenceIds: s.evidenceIds })) });
      await tx.riskFactor.createMany({ data: output.risk_factors.map(f => ({ organizationId: actor.organizationId, investigationId: created.id, title: f.title, severity: f.severity.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', explanation: f.explanation, evidenceIds: f.evidence_ids })) });
      if (nextStatus !== alert.status) await tx.alert.update({ where: { id: alert.id, organizationId: actor.organizationId }, data: { status: nextStatus } });
      await tx.auditLog.createMany({ data: [
        { organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alert.id, action: 'INVESTIGATION_COMPLETED', metadata: { investigationId: created.id, version, model, source } },
        { organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alert.id, action: 'AI_OUTPUT_VERSION', metadata: { investigationId: created.id, version, model, source } },
        ...(nextStatus !== alert.status ? [{ organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alert.id, action: 'STATUS_CHANGED', previousValue: { status: alert.status }, newValue: { status: nextStatus } }] : []),
      ] });
      return created;
    });
    return investigation;
  } catch (error) {
    await db.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alert.id, action: 'INVESTIGATION_FAILED', metadata: { reason: error instanceof Error ? error.message.slice(0, 160) : 'Unknown error' } } });
    throw error;
  }
}

export async function decideAlert(alertId: string, actor: Actor, decision: 'CLOSE' | 'REQUEST_INFORMATION' | 'ESCALATE' | 'SUSPICIOUS_ACTIVITY_REVIEW', note: string) {
  const alert = await getAlertCase(alertId, actor.organizationId);
  if (!alert) throw new CaseError('Alert not found', 404);
  if (alert.status === 'CLOSED') throw new CaseError('Closed alerts cannot be changed', 409);
  const status = { CLOSE: 'CLOSED', REQUEST_INFORMATION: 'NEEDS_INFORMATION', ESCALATE: 'ESCALATED', SUSPICIOUS_ACTIVITY_REVIEW: 'UNDER_REVIEW' }[decision] as 'CLOSED' | 'NEEDS_INFORMATION' | 'ESCALATED' | 'UNDER_REVIEW';
  const investigation = alert.investigations[0];
  const recommendation = investigation ? investigationSchema.parse(investigation.output).recommended_action : null;
  const agreedWithAi = recommendation === null ? null : recommendation.toUpperCase() === decision;
  return db.$transaction(async tx => {
    const claimed = await tx.alert.updateMany({ where: { id: alertId, organizationId: actor.organizationId, status: { not: 'CLOSED' } }, data: { status } });
    if (claimed.count !== 1) throw new CaseError('Alert has already been closed', 409);
    const record = await tx.analystDecision.create({ data: { organizationId: actor.organizationId, alertId, analystId: actor.id, investigationId: investigation?.id, decision, note, aiRecommendation: recommendation, agreedWithAi } });
    await tx.auditLog.createMany({ data: [
      { organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alertId, action: 'ANALYST_DECISION', newValue: { decision, note, agreedWithAi, investigationId: investigation?.id ?? null } },
      { organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alertId, action: 'NOTE_ADDED', newValue: { note, decisionId: record.id } },
      { organizationId: actor.organizationId, actorUserId: actor.id, entityType: 'Alert', entityId: alertId, action: 'STATUS_CHANGED', previousValue: { status: alert.status }, newValue: { status } },
    ] });
    return record;
  });
}
