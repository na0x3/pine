import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { PageHeading } from '@/components/page-heading';
import { StatCard } from '@/components/stat-card';
import { Activity, CircleAlert, ShieldAlert, CircleCheck } from 'lucide-react';

function Bars({ title, rows }: { title: string; rows: { label: string; count: number }[] }) { const max = Math.max(...rows.map(r => r.count), 1); return <section className="card"><div className="card-header"><h2>{title}</h2></div><div className="card-pad bar-list">{rows.map(r => <div className="bar-row" key={r.label}><span title={r.label}>{r.label}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${r.count / max * 100}%` }}/></div><strong>{r.count}</strong></div>)}{!rows.length && <span className="subtle">No data yet</span>}</div></section>; }
export default async function AnalyticsPage() {
  const user = await requireUser(); const org = user.organizationId;
  const [alerts, investigations, decisions] = await Promise.all([
    db.alert.findMany({ where: { organizationId: org }, include: { customer: { select: { country: true } }, transaction: { select: { paymentRail: true } } } }),
    db.investigation.findMany({ where: { organizationId: org }, select: { startedAt: true, completedAt: true } }),
    db.analystDecision.findMany({ where: { organizationId: org, agreedWithAi: { not: null } }, select: { agreedWithAi: true } }),
  ]);
  const rows = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((result, v) => { result[v] = (result[v] || 0) + 1; return result; }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const avg = investigations.length ? Math.round(investigations.reduce((sum, i) => sum + Math.max(0, i.completedAt.getTime() - i.startedAt.getTime()), 0) / investigations.length / 1000) : 0;
  const agreement = decisions.length ? Math.round(decisions.filter(d => d.agreedWithAi).length / decisions.length * 100) : null;
  return <div className="content"><PageHeading eyebrow="OPERATIONAL INSIGHTS" title="Analytics" description="Measure alert volume, case flow, and human review patterns."/><div className="stats-grid"><StatCard label="Total alerts" value={alerts.length} foot="Across all types" icon={Activity}/><StatCard label="Open alerts" value={alerts.filter(a => a.status === 'OPEN').length} foot="Awaiting review" icon={CircleAlert}/><StatCard label="Escalated" value={alerts.filter(a => a.status === 'ESCALATED').length} foot="Additional review" icon={ShieldAlert}/><StatCard label="Closed" value={alerts.filter(a => a.status === 'CLOSED').length} foot="Resolved by an analyst" icon={CircleCheck}/></div><div className="two-col" style={{ marginBottom: 17 }}><div className="card card-pad"><div className="eyebrow">AVERAGE INVESTIGATION TIME</div><div style={{ fontSize: 25, fontWeight: 700, margin: '10px 0' }}>{avg}s</div><div className="subtle">Elapsed time from investigation start to saved output</div></div><div className="card card-pad"><div className="eyebrow">AI RECOMMENDATION AGREEMENT</div><div style={{ fontSize: 25, fontWeight: 700, margin: '10px 0' }}>{agreement === null ? '—' : `${agreement}%`}</div><div className="subtle">Based on {decisions.length} analyst decisions with an AI recommendation</div></div></div><div className="two-col" style={{ marginBottom: 17 }}><Bars title="Alerts by severity" rows={rows(alerts.map(a => a.severity))}/><Bars title="Alerts by type" rows={rows(alerts.map(a => a.type))}/></div><div className="two-col"><Bars title="Alerts by country" rows={rows(alerts.map(a => a.customer.country))}/><Bars title="Alerts by payment rail" rows={rows(alerts.map(a => a.transaction.paymentRail || 'Unknown'))}/></div></div>;
}
