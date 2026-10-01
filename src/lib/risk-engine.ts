export type RiskTransaction = {
  id: string; amount: number; currency: string; timestamp: Date; direction: 'INBOUND' | 'OUTBOUND';
  counterpartyName?: string | null; counterpartyCountry?: string | null; paymentRail?: string | null;
  metadata?: Record<string, unknown> | null;
};
export type RiskCustomer = {
  createdAt: Date; onboardedAt?: Date | null; kycStatus: string; country: string; expectedMonthlyVolume?: number | null; expectedMonthlyVolumeCurrency?: string | null;
};
export type RiskSignal = { signal: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; value: number | null; description: string; evidenceIds: string[] };
export type RiskContext = { current: RiskTransaction; history: RiskTransaction[]; customer: RiskCustomer; previousAlerts: { id: string; createdAt: Date }[] };

const hours = (n: number) => n * 3600_000;
const round = (n: number) => Math.round(n * 10) / 10;
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function calculateRiskSignals({ current, history, customer, previousAlerts }: RiskContext): RiskSignal[] {
  const prior = history.filter(t => t.id !== current.id && t.timestamp < current.timestamp).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const sameCurrency = prior.filter(t => t.currency === current.currency);
  const values = sameCurrency.map(t => t.amount).sort((a, b) => a - b);
  const signals: RiskSignal[] = [];
  const add = (signal: string, severity: RiskSignal['severity'], value: number | null, description: string, evidenceIds: string[]) =>
    signals.push({ signal, severity, value, description, evidenceIds });
  if (values.length >= 3) {
    const median = values[Math.floor(values.length / 2)];
    const average = values.reduce((sum, n) => sum + n, 0) / values.length;
    const maximum = values[values.length - 1];
    if (median > 0 && current.amount / median >= 2) add('transaction_amount_anomaly', current.amount / median >= 5 ? 'HIGH' : 'MEDIUM', round(current.amount / median), `Transaction is ${round(current.amount / median)}× the customer's historical ${current.currency} median`, [current.id, ...sameCurrency.slice(0, 5).map(t => t.id)]);
    if (average > 0 && current.amount / average >= 3) add('amount_vs_average', 'MEDIUM', round(current.amount / average), `Amount is ${round(current.amount / average)}× the historical average`, [current.id]);
    if (maximum > 0 && current.amount > maximum * 1.5) add('amount_vs_maximum', 'MEDIUM', round(current.amount / maximum), `Amount exceeds the previous maximum by ${round(current.amount / maximum)}×`, [current.id]);
  }
  for (const [period, label, threshold] of [[hours(1), '1h', 4], [hours(24), '24h', 10], [hours(24 * 7), '7d', 30]] as const) {
    const recent = prior.filter(t => current.timestamp.getTime() - t.timestamp.getTime() <= period);
    if (recent.length + 1 >= threshold) add(`velocity_${label}`, recent.length + 1 >= threshold * 2 ? 'HIGH' : 'MEDIUM', recent.length + 1, `${recent.length + 1} transactions in the last ${label}`, [current.id, ...recent.slice(0, 10).map(t => t.id)]);
  }
  if (current.counterpartyName && prior.length && !prior.some(t => same(t.counterpartyName, current.counterpartyName))) add('new_counterparty', 'MEDIUM', null, 'First recorded transaction with this counterparty', [current.id]);
  if (current.counterpartyCountry && prior.length && !prior.some(t => same(t.counterpartyCountry, current.counterpartyCountry))) add('new_country', 'MEDIUM', null, 'First recorded transaction to this counterparty country', [current.id]);
  if (current.paymentRail && prior.length && !prior.some(t => same(t.paymentRail, current.paymentRail))) add('new_payment_rail', 'LOW', null, 'First recorded use of this payment rail', [current.id]);
  const device = current.metadata?.deviceId;
  if (typeof device === 'string' && prior.some(t => typeof t.metadata?.deviceId === 'string') && !prior.some(t => t.metadata?.deviceId === device)) add('new_device', 'MEDIUM', null, 'Transaction uses a device not seen in prior records', [current.id]);
  const hour = current.timestamp.getUTCHours();
  if ((hour <= 4 || hour >= 23) && prior.length >= 10 && prior.filter(t => t.timestamp.getUTCHours() <= 4 || t.timestamp.getUTCHours() >= 23).length / prior.length < 0.1) add('unusual_transaction_time', 'LOW', hour, 'Transaction occurred outside the customer’s usual hours', [current.id]);
  const ageDays = Math.max(0, Math.floor((current.timestamp.getTime() - (customer.onboardedAt ?? customer.createdAt).getTime()) / 86400_000));
  if (ageDays < 30) add('recent_customer_onboarding', 'HIGH', ageDays, `Customer was onboarded ${ageDays} days before this transaction`, ['customer:onboardedAt']);
  if (customer.kycStatus !== 'VERIFIED') add('kyc_not_verified', 'HIGH', null, `KYC status is ${customer.kycStatus.toLowerCase().replaceAll('_', ' ')}`, ['customer:kycStatus']);
  const recentAlerts = previousAlerts.filter(a => a.createdAt < current.timestamp && current.timestamp.getTime() - a.createdAt.getTime() < hours(24 * 90));
  if (recentAlerts.length) add('previous_alerts', recentAlerts.length >= 3 ? 'HIGH' : 'MEDIUM', recentAlerts.length, `${recentAlerts.length} previous alerts in 90 days`, recentAlerts.map(a => a.id));
  const inbound = sameCurrency.find(t => t.direction === 'INBOUND' && current.direction === 'OUTBOUND' && current.timestamp.getTime() - t.timestamp.getTime() < hours(24) && t.amount >= current.amount * 0.8);
  if (inbound) add('rapid_funds_movement', 'HIGH', round((current.timestamp.getTime() - inbound.timestamp.getTime()) / 3600_000), 'Similar inbound funds arrived less than 24 hours before this outbound transfer', [inbound.id, current.id]);
  const small = sameCurrency.filter(t => t.direction === 'INBOUND' && t.amount < current.amount * 0.25 && current.timestamp.getTime() - t.timestamp.getTime() < hours(24 * 7));
  if (small.length >= 4 && small.reduce((sum, t) => sum + t.amount, 0) >= current.amount * 0.7) add('small_inflows_large_outflow', 'HIGH', small.length, 'Several smaller inflows preceded this larger transfer', [current.id, ...small.slice(0, 10).map(t => t.id)]);
  const monthVolume = sameCurrency.filter(t => current.timestamp.getTime() - t.timestamp.getTime() < hours(24 * 30)).reduce((sum, t) => sum + t.amount, current.amount);
  if (customer.expectedMonthlyVolume && customer.expectedMonthlyVolumeCurrency === current.currency && monthVolume > customer.expectedMonthlyVolume * 1.5) add('volume_vs_expected', 'MEDIUM', round(monthVolume / customer.expectedMonthlyVolume), `Trailing 30-day ${current.currency} volume is ${round(monthVolume / customer.expectedMonthlyVolume)}× expected monthly volume`, [current.id, 'customer:expectedMonthlyVolume']);
  const totalValue = sameCurrency.reduce((sum, t) => sum + t.amount, current.amount);
  const sameCounterpartyVolume = sameCurrency.filter(t => same(t.counterpartyName, current.counterpartyName)).reduce((sum, t) => sum + t.amount, current.amount);
  if (sameCurrency.length >= 5 && current.counterpartyName && sameCounterpartyVolume / totalValue > 0.7) add('counterparty_concentration', 'MEDIUM', round(sameCounterpartyVolume / totalValue), 'A large share of recorded value is concentrated with one counterparty', [current.id]);
  if (current.counterpartyCountry && prior.length >= 5 && prior.slice(0, 5).every(t => t.counterpartyCountry && !same(t.counterpartyCountry, current.counterpartyCountry))) add('sudden_country_change', 'MEDIUM', null, 'Destination country differs from the five most recent transactions', [current.id, ...prior.slice(0, 5).map(t => t.id)]);
  return signals;
}
