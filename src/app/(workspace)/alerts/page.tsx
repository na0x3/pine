import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { customerName, date, money } from '@/lib/format';
import { PageHeading } from '@/components/page-heading';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/badge';
import { Activity, CircleAlert, CircleCheck, ShieldAlert, Search, ArrowRight } from 'lucide-react';
import type { Prisma } from '@prisma/client';

type Params = { status?: string; severity?: string; customer?: string; type?: string; assigned?: string; date?: string; page?: string };
export default async function AlertsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const q = await searchParams;
  const base = { organizationId: user.organizationId };
  const where: Prisma.AlertWhereInput = { ...base };
  if (q.status && ['OPEN', 'INVESTIGATING', 'NEEDS_INFORMATION', 'ESCALATED', 'UNDER_REVIEW', 'CLOSED'].includes(q.status)) where.status = q.status as Prisma.EnumAlertStatusFilter['equals'];
  if (q.severity && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(q.severity)) where.severity = q.severity as Prisma.EnumSeverityFilter['equals'];
  if (q.customer) where.customer = { is: { organizationId: user.organizationId, OR: [{ fullName: { contains: q.customer, mode: 'insensitive' } }, { businessName: { contains: q.customer, mode: 'insensitive' } }] } };
  if (q.type) where.type = q.type;
  if (q.assigned) where.assignedAnalystId = q.assigned === 'unassigned' ? null : q.assigned;
  if (q.date && !Number.isNaN(Date.parse(q.date))) where.createdAt = { gte: new Date(q.date) };
  const [filteredTotal, counts, analysts, types] = await Promise.all([
    db.alert.count({ where }),
    db.alert.groupBy({ by: ['status'], where: base, _count: true }),
    db.user.findMany({ where: { organizationId: user.organizationId, active: true, role: { in: ['ADMIN', 'MANAGER', 'ANALYST'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.alert.findMany({ where: base, select: { type: true }, distinct: ['type'], orderBy: { type: 'asc' } }),
  ]);
  const pageSize = 50;
  const requestedPage = Number(q.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, Math.max(1, Math.ceil(filteredTotal / pageSize))) : 1;
  const alerts = await db.alert.findMany({ where, include: { customer: true, transaction: true, assignedAnalyst: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize });
  const pageHref = (number: number) => { const params = new URLSearchParams(); for (const [key, value] of Object.entries(q)) if (key !== 'page' && value) params.set(key, value); params.set('page', String(number)); return `/alerts?${params}`; };
  const total = counts.reduce((n, c) => n + c._count, 0);
  const count = (status: string) => counts.find(c => c.status === status)?._count ?? 0;
  return <div className="content"><PageHeading eyebrow="CASE MANAGEMENT" title="Alerts" description="Review, investigate, and resolve transaction alerts in one place." actions={<Link className="button" href="/analytics">View analytics <ArrowRight size={14}/></Link>}/>
    <div className="stats-grid"><StatCard label="Total alerts" value={total} foot="All time · current workspace" icon={Activity}/><StatCard label="Open alerts" value={count('OPEN')} foot="Awaiting analyst review" icon={CircleAlert}/><StatCard label="Escalated" value={count('ESCALATED')} foot="Require additional review" icon={ShieldAlert}/><StatCard label="Closed" value={count('CLOSED')} foot="Human decision recorded" icon={CircleCheck}/></div>
    <section className="card"><div className="card-header"><div><h2>Alert queue</h2><small>Prioritize and triage cases across all payment rails</small></div><span className="subtle" style={{ fontSize: 11 }}>{alerts.length} shown</span></div>
      <form className="filters" method="get"><input className="field search" name="customer" defaultValue={q.customer} placeholder="Search customer…" aria-label="Search customer"/><select className="select" name="status" defaultValue={q.status || ''} aria-label="Status"><option value="">All statuses</option>{['OPEN', 'INVESTIGATING', 'NEEDS_INFORMATION', 'ESCALATED', 'UNDER_REVIEW', 'CLOSED'].map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select><select className="select" name="severity" defaultValue={q.severity || ''} aria-label="Severity"><option value="">All severities</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(v => <option key={v}>{v}</option>)}</select><select className="select" name="type" defaultValue={q.type || ''} aria-label="Alert type"><option value="">All alert types</option>{types.map(v => <option key={v.type}>{v.type}</option>)}</select><select className="select" name="assigned" defaultValue={q.assigned || ''} aria-label="Analyst"><option value="">All analysts</option><option value="unassigned">Unassigned</option>{analysts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><input className="field" style={{ width: 130, fontSize: 11 }} type="date" name="date" defaultValue={q.date || ''} aria-label="Created since"/><button className="button small"><Search size={13}/> Filter</button><Link href="/alerts" className="button small ghost">Clear</Link></form>
      <div className="table-wrap"><table><thead><tr><th>Alert ID</th><th>Customer</th><th>Alert type</th><th>Amount</th><th>Currency</th><th>Risk score</th><th>Severity</th><th>Status</th><th>Assigned analyst</th><th>Created</th></tr></thead><tbody>{alerts.map(a => <tr key={a.id}><td><Link href={`/alerts/${a.id}`} className="table-link">{a.id}</Link></td><td><div className="customer-cell"><span className="avatar">{customerName(a.customer).slice(0, 2).toUpperCase()}</span>{customerName(a.customer)}</div></td><td>{a.type}</td><td style={{ fontWeight: 700 }}>{money(Number(a.transaction.amount), a.transaction.currency)}</td><td className="muted">{a.transaction.currency}</td><td><div className="risk"><div className="risk-track"><div className={`risk-fill ${a.riskScore >= 70 ? 'high' : a.riskScore < 40 ? 'low' : ''}`} style={{ width: `${a.riskScore}%` }}/></div>{a.riskScore}</div></td><td><Badge value={a.severity}/></td><td><Badge value={a.status}/></td><td>{a.assignedAnalyst?.name || <span className="muted">Unassigned</span>}</td><td className="muted">{date(a.createdAt)}</td></tr>)}</tbody></table>{!alerts.length && <div className="empty-state"><strong>No alerts match these filters</strong>Try adjusting the search or clearing filters.</div>}</div><div className="table-footer"><span>Showing {alerts.length ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + alerts.length} of {filteredTotal} matching alerts ({total} total)</span><span className="button-row">{page > 1 && <Link className="button small" href={pageHref(page - 1)}>Previous</Link>}<span>Page {page}</span>{page * pageSize < filteredTotal && <Link className="button small" href={pageHref(page + 1)}>Next</Link>}</span></div>
    </section></div>;
}
