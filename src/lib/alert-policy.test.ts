import { describe, expect, it } from 'vitest';
import { deriveAlert } from './alert-policy';
import type { RiskSignal } from './risk-engine';

const signal = (name: string, severity: RiskSignal['severity']): RiskSignal => ({ signal: name, severity, value: null, description: name, evidenceIds: ['txn-1'] });

describe('alert creation policy', () => {
  it('does not create an alert for a lone medium or low signal', () => {
    expect(deriveAlert([signal('new_rail', 'LOW'), signal('new_country', 'MEDIUM')]).shouldAlert).toBe(false);
  });
  it('creates a medium alert for two medium signals', () => {
    expect(deriveAlert([signal('new_country', 'MEDIUM'), signal('new_counterparty', 'MEDIUM')])).toMatchObject({ shouldAlert: true, severity: 'MEDIUM' });
  });
  it('keeps a high signal at high alert severity', () => {
    expect(deriveAlert([signal('kyc_not_verified', 'HIGH')])).toMatchObject({ shouldAlert: true, severity: 'HIGH' });
  });
});
