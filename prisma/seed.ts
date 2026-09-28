import { PrismaClient, type TransactionType, type Severity, type CustomerType } from '@prisma/client';
import { hash } from 'bcryptjs';

const db = new PrismaClient();
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
const first = ['Maya', 'Daniel', 'Olivia', 'Ethan', 'Sophia', 'Noah', 'Ava', 'Liam', 'Isabella', 'Lucas', 'Amara', 'Mateo', 'Priya', 'Owen', 'Zoe', 'Nina', 'Marcus', 'Layla', 'James', 'Elena', 'Aiden', 'Ruby', 'Leo', 'Sara', 'Theo', 'Jade', 'Iris', 'Henry', 'Mila', 'Oscar', 'Ari', 'Clara', 'Finn', 'Cora', 'Sam', 'Tara', 'Eva', 'Ravi', 'Hana', 'Max'];
const last = ['Torres', 'Chen', 'Patel', 'Brooks', 'Martinez', 'Kim', 'Johnson', 'Wright', 'Garcia', 'Smith', 'Okafor', 'Silva', 'Shah', 'Morgan', 'Lee', 'Hassan', 'Reed', 'Ali', 'Walker', 'Costa', 'Adams', 'Diaz', 'Park', 'Nguyen', 'Stone', 'Hill', 'Khan', 'Cooper', 'Young', 'Rivera', 'Singh', 'Clark', 'Baker', 'White', 'Ford', 'Green', 'King', 'Rao', 'Mori', 'Evans'];
const rails: TransactionType[] = ['ACH', 'ACH', 'ACH', 'WIRE', 'WIRE', 'WIRE', 'CARD', 'CARD', 'CARD', 'BANK_TRANSFER', 'BANK_TRANSFER', 'BANK_TRANSFER', 'REMITTANCE', 'REMITTANCE', 'MERCHANT_PAYMENT', 'MERCHANT_PAYMENT', 'STABLECOIN', 'CRYPTO'];
const alertTypes = ['Unusual transaction size', 'High transaction velocity', 'New counterparty', 'New country', 'Rapid movement of funds', 'KYC mismatch', 'High-risk jurisdiction', 'Account takeover indicator', 'Structuring pattern', 'Manual review', 'Crypto wallet risk', 'Sanctions match'];

async function main() {
  const existing = await db.organization.findUnique({ where: { slug: 'northstar-payments' } });
  if (existing && await db.alert.count({ where: { organizationId: existing.id } }) === 20 && await db.investigation.count({ where: { organizationId: existing.id } }) >= 10) { console.log('Synthetic workspace already seeded'); return; }
  const organization = existing || await db.organization.create({ data: { name: 'Northstar Payments', slug: 'northstar-payments' } });
  const organizationId = organization.id;
  const passwordHash = await hash('DemoPass123!', 12);
  const users = await Promise.all([
    ['Avery Morgan', 'avery@northstar.demo', 'ADMIN'],
    ['Jordan Lee', 'jordan@northstar.demo', 'MANAGER'],
    ['Alex Rivera', 'alex@northstar.demo', 'ANALYST'],
    ['Sam Patel', 'sam@northstar.demo', 'ANALYST'],
    ['Taylor Kim', 'taylor@northstar.demo', 'VIEWER'],
  ].map(([name, email, role]) => db.user.upsert({ where: { email }, update: {}, create: { organizationId, name, email, role: role as 'ADMIN' | 'MANAGER' | 'ANALYST' | 'VIEWER', passwordHash } })));
  const customers = await Promise.all(first.map((given, i) => {
    const business = i > 0 && i % 5 === 0;
    const name = `${given} ${last[i]}`;
    return db.customer.upsert({ where: { id: `demo-customer-${String(i + 1).padStart(3, '0')}` }, update: {}, create: {
      id: `demo-customer-${String(i + 1).padStart(3, '0')}`, organizationId,
      type: (business ? 'BUSINESS' : 'INDIVIDUAL') as CustomerType,
      fullName: business ? null : name, businessName: business ? `${last[i]} Trading Co.` : null,
      legalName: business ? `${last[i]} Trading Company LLC` : null,
      email: `${given.toLowerCase()}.${last[i].toLowerCase()}@example.test`,
      phone: '+1 555 010 0000', country: i % 8 === 0 && i > 0 ? 'Mexico' : 'United States',
      riskRating: i % 9 === 0 && i > 0 ? 'HIGH' : i % 4 === 0 ? 'MEDIUM' : 'LOW',
      kycStatus: i % 11 === 0 && i > 0 ? 'NEEDS_REVIEW' : 'VERIFIED',
      createdAt: i === 0 ? daysAgo(426) : daysAgo(i % 7 === 0 ? 18 + i : 300 + i * 9),
      occupation: business ? null : ['Product designer', 'Consultant', 'Engineer', 'Sales manager', 'Healthcare professional'][i % 5],
      businessIndustry: business ? ['Wholesale', 'Logistics', 'Software'][i % 3] : null,
      incorporationCountry: business ? 'United States' : null,
      beneficialOwners: business ? [{ name, ownershipPercent: 100 }] : undefined,
      sourceOfFunds: business ? 'Business revenue' : 'Employment income',
      expectedMonthlyVolume: i === 0 ? 30000 : 12000 + i * 1800,
      expectedTransactionMin: 100, expectedTransactionMax: i === 0 ? 6500 : 9000 + i * 500,
      metadata: { synthetic: true },
    } });
  }));
  await db.account.createMany({ data: customers.flatMap((customer, i) => [
    { id: `demo-account-${String(i + 1).padStart(3, '0')}-1`, organizationId, customerId: customer.id, displayName: 'Operating account', institutionName: 'Northstar Payments', type: 'CHECKING', lastFour: String(3700 + i).slice(-4), openedAt: customer.createdAt, metadata: { synthetic: true } },
    ...(i % 4 === 0 ? [{ id: `demo-account-${String(i + 1).padStart(3, '0')}-2`, organizationId, customerId: customer.id, displayName: 'Linked external account', institutionName: 'Harbor Community Bank', type: 'LINKED_EXTERNAL', lastFour: String(8200 + i).slice(-4), openedAt: daysAgo(240), metadata: { synthetic: true } }] : []),
  ]), skipDuplicates: true });
  const transactions = customers.flatMap((customer, i) => Array.from({ length: 15 }, (_, j) => {
    const type = i === 0 && j === 14 || i === 7 && j === 14 ? 'WIRE' : rails[(i + j * 3) % rails.length];
    const amount = i === 0 && j === 14 ? 21500 : i === 0 ? 2900 + j * 70 : i === 7 && j === 14 ? 14500 : i === 7 && j === 13 ? 15000 : i === 12 && j === 14 ? 8500 : i === 12 && j >= 10 && j <= 13 ? 2000 : Math.round((240 + ((i * 371 + j * 211) % 5600)) * 100) / 100;
    const activeDays = i === 0 ? 410 : Math.max(12, 270 - i * 2);
    return {
      id: `demo-txn-${String(i + 1).padStart(3, '0')}-${String(j + 1).padStart(2, '0')}`,
      organizationId, customerId: customer.id, type, direction: i === 7 && j === 13 || i === 12 && j >= 10 && j <= 13 || j % 4 === 0 ? 'INBOUND' as const : 'OUTBOUND' as const,
      amount, currency: 'USD', timestamp: i === 7 && j === 13 ? daysAgo(2 + 4 / 24) : i === 9 && j >= 8 && j <= 13 ? daysAgo(4 + (14 - j) / 144) : i === 12 && j >= 10 && j <= 13 ? daysAgo(2 + 14 - j) : j === 14 ? daysAgo(i % 5) : daysAgo(activeDays - j * Math.floor(activeDays / 17)),
      counterpartyName: i === 0 && j === 14 ? 'Meridian Commercial Supply' : ['Harbor Services', 'Atlas Payroll', 'Evergreen Retail', 'Northline Logistics'][j % 4],
      counterpartyId: `CP-${j % 4}`, counterpartyCountry: i % 6 === 0 && i > 0 && j === 14 ? 'Mexico' : 'United States',
      paymentRail: type, status: 'COMPLETED', description: i === 0 && j === 14 ? 'Invoice payment, reference MT-4821' : ['Invoice payment', 'Payroll deposit', 'Card purchase', 'Services transfer'][j % 4],
      merchantCategory: type === 'CARD' ? 'Professional services' : null,
      walletAddress: type === 'CRYPTO' || type === 'STABLECOIN' ? `0x${String(i * 100 + j).padStart(40, '0')}` : null,
      blockchain: type === 'CRYPTO' || type === 'STABLECOIN' ? 'Ethereum' : null,
      transactionHash: null, metadata: { synthetic: true },
    };
  }));
  await db.transaction.createMany({ data: transactions, skipDuplicates: true });
  const alertData = Array.from({ length: 20 }, (_, i) => {
    const customerIndex = i >= 17 ? i - 14 : i;
    const customer = customers[customerIndex];
    const severity: Severity = i === 0 ? 'HIGH' : i % 7 === 0 ? 'CRITICAL' : i % 3 === 0 ? 'HIGH' : i % 2 === 0 ? 'MEDIUM' : 'LOW';
    return {
      id: `ALT-${String(1042 + i).padStart(5, '0')}`, organizationId, customerId: customer.id,
      transactionId: `demo-txn-${String(customerIndex + 1).padStart(3, '0')}-${i >= 17 ? '14' : '15'}`,
      type: i === 0 ? 'Unusual transaction size' : alertTypes[(i * 7) % alertTypes.length],
      description: i === 0 ? 'Outbound wire exceeds the customer’s historical transaction range and introduces a new business counterparty.' : `${alertTypes[(i * 7) % alertTypes.length]} detected on the triggering transaction.`,
      riskScore: i === 0 ? 78 : severity === 'CRITICAL' ? 91 + i % 7 : severity === 'HIGH' ? 72 + i % 14 : severity === 'MEDIUM' ? 49 + i % 13 : 22 + i,
      severity, status: i === 0 ? 'OPEN' as const : i % 8 === 0 ? 'ESCALATED' as const : i % 6 === 0 ? 'CLOSED' as const : i % 5 === 0 ? 'NEEDS_INFORMATION' as const : i % 4 === 0 ? 'INVESTIGATING' as const : 'OPEN' as const,
      assignedAnalystId: i % 4 === 0 ? null : users[2 + i % 2].id,
      createdAt: daysAgo(i % 9),
    };
  });
  await db.alert.createMany({ data: alertData, skipDuplicates: true });
  for (let i = 1; i <= 10; i++) {
    const alert = alertData[i];
    if (await db.investigation.findUnique({ where: { alertId_version: { alertId: alert.id, version: 1 } } })) continue;
    const txnId = alert.transactionId;
    const evidenceId = `seed-evidence-${i}`;
    const output = {
      summary: `A ${alert.type.toLowerCase()} alert requires analyst review. The triggering transaction differs from parts of the recorded customer history.`,
      risk_factors: [{ title: alert.type, severity: alert.severity.toLowerCase(), explanation: 'The alert rule identified an unusual transaction attribute that needs review.', evidence_ids: [evidenceId] }],
      mitigating_factors: [{ title: 'Identity verified', explanation: 'The synthetic customer record shows verified KYC.', evidence_ids: [`seed-kyc-${i}`] }],
      behavioral_anomalies: [], missing_information: [{ field: 'Transaction purpose', reason_needed: 'Confirm the commercial rationale for this activity.' }],
      recommended_action: 'request_information', recommendation_reasoning: 'Request supporting information before resolving the alert.', confidence: 'medium',
    };
    const investigation = await db.investigation.create({ data: {
      organizationId, alertId: alert.id, version: 1, model: 'synthetic-seed', source: 'SYNTHETIC_DEMO', output, contextSnapshot: { synthetic: true, transactionId: txnId }, createdById: users[2].id,
    } });
    await db.evidence.createMany({ data: [
      { id: evidenceId, referenceId: evidenceId, organizationId, investigationId: investigation.id, type: 'TRANSACTION', source: txnId, label: 'Triggering transaction', value: `${txnId} · ${alert.type}` },
      { id: `seed-kyc-${i}`, referenceId: `seed-kyc-${i}`, organizationId, investigationId: investigation.id, type: 'CUSTOMER_FIELD', source: alert.customerId, label: 'KYC status', value: 'Verified' },
    ] });
    await db.riskFactor.create({ data: { organizationId, investigationId: investigation.id, title: alert.type, severity: alert.severity, explanation: 'The alert rule identified an unusual transaction attribute that needs review.', evidenceIds: [evidenceId] } });
  }
  await db.auditLog.create({ data: { organizationId, actorUserId: users[0].id, entityType: 'Organization', entityId: organizationId, action: 'SYNTHETIC_SEED_CREATED', metadata: { customers: 40, transactions: 600, alerts: 20, investigations: 10 } } });
  console.log('Seeded 40 customers, 600 transactions, 20 alerts, 10 investigations. Login: alex@northstar.demo / DemoPass123!');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
