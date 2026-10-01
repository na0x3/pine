import { describe, expect, it } from 'vitest';
import { calculateRiskSignals, type RiskContext } from './risk-engine';

const now = new Date('2026-09-20T15:00:00Z');
const base: RiskContext = {
  current: { id: 'current', amount: 21500, currency: 'USD', timestamp: now, direction: 'OUTBOUND', counterpartyName: 'New supplier', counterpartyCountry: 'US', paymentRail: 'WIRE' },
  history: Array.from({ length: 8 }, (_, i) => ({ id: `prior-${i}`, amount: 3300 + i * 100, currency: 'USD', timestamp: new Date(now.getTime() - (i + 3) * 86400_000), direction: 'OUTBOUND' as const, counterpartyName: 'Known supplier', counterpartyCountry: 'US', paymentRail: 'ACH' })),
  customer: { createdAt: new Date('2025-07-20'), kycStatus: 'VERIFIED', country: 'US', expectedMonthlyVolume: 70000, expectedMonthlyVolumeCurrency: 'USD' },
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
    const history = [{ id: 'inbound', amount: 21000, currency: 'USD', timestamp: new Date(now.getTime() - 3600_000), direction: 'INBOUND' as const }];
    expect(calculateRiskSignals({ ...base, history }).some(s => s.signal === 'rapid_funds_movement')).toBe(true);
  });
  it('does not compare values across currencies', () => {
    const history = base.history.map(t => ({ ...t, currency: 'JPY' }));
    const signals = calculateRiskSignals({ ...base, history });
    expect(signals.some(s => ['transaction_amount_anomaly', 'amount_vs_average', 'amount_vs_maximum', 'counterparty_concentration'].includes(s.signal))).toBe(false);
  });
  it('uses onboarding date rather than import date for customer tenure', () => {
    const signals = calculateRiskSignals({ ...base, customer: { ...base.customer, createdAt: now, onboardedAt: new Date('2025-01-01') } });
    expect(signals.some(s => s.signal === 'recent_customer_onboarding')).toBe(false);
  });
});
