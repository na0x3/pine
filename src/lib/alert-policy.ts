import type { RiskSignal } from './risk-engine';

export function deriveAlert(signals: RiskSignal[]) {
  const high = signals.filter(s => s.severity === 'HIGH' || s.severity === 'CRITICAL');
  const medium = signals.filter(s => s.severity === 'MEDIUM');
  const shouldAlert = high.length > 0 || medium.length >= 2;
  const score = Math.min(99, Math.max(high.length ? 70 : 0, 30 + high.length * 25 + medium.length * 12));
  const severity = score >= 85 ? 'CRITICAL' : score >= 70 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';
  return { shouldAlert, score, severity: severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', primary: high[0] ?? medium[0] ?? null };
}
