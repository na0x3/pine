import { describe, expect, it } from 'vitest';
import { calculateRiskSignals, type RiskContext } from './risk-engine';

const now = new Date('2026-09-20T15:00:00Z');
const base: RiskContext = {
  current: { id: 'current', amount: 21500, timestamp: now, direction: 'OUTBOUND', counterpartyName: 'New supplier', counterpartyCountry: 'US', paymentRail: 'WIRE' },
  history: Array.from({ length: 8 }, (_, i) => ({ id: `prior-${i}`, amount: 3300 + i * 100, timestamp: new Date(now.getTime() - (i + 3) * 86400_000), direction: 'OUTBOUND' as const, counterpartyName: 'Known supplier', counterpartyCountry: 'US', paymentRail: 'ACH' })),
  customer: { createdAt: new Date('2025-07-20'), kycStatus: 'VERIFIED', country: 'US', expectedMonthlyVolume: 70000 },
  previousAlerts: [],
};

describe('calculateRiskSignals', () => {
  it('identifies amount, new counterparty and rail with record references', () => {
    const signals = calculateRiskSignals(base);
    expect(signals.map(s => s.signal)).toEqual(expect.arrayContaining(['transaction_amount_anomaly', 'new_counterparty', 'new_payment_rail']));
    expect(signals.find(s => s.signal === 'transaction_amount_anomaly')?.evidenceIds).toContain('current');
  });
  it('does not flag unseen history when no prior records exist', () => {
    const signals = calculateRiskSignals({ ...base, history: [] });
    expect(signals.some(s => s.signal === 'new_counterparty')).toBe(false);
  });
  it('detects rapid inbound then outbound movement', () => {
    const history = [{ id: 'inbound', amount: 21000, timestamp: new Date(now.getTime() - 3600_000), direction: 'INBOUND' as const }];
    expect(calculateRiskSignals({ ...base, history }).some(s => s.signal === 'rapid_funds_movement')).toBe(true);
  });
});
