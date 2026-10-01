import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { customerName, date, money } from '@/lib/format';
import { Badge } from '@/components/badge';
import { PageHeading } from '@/components/page-heading';
export default async function CustomersPage() {
  const user = await requireUser();
  const customers = await db.customer.findMany({ where: { organizationId: user.organizationId }, include: { _count: { select: { transactions: true, alerts: true } } }, orderBy: { createdAt: 'desc' } });
  return <div className="content"><PageHeading eyebrow="CUSTOMER INTELLIGENCE" title="Customers" description="Profiles, verification state, and alert history for your organization."/><section className="card"><div className="card-header"><div><h2>Customer directory</h2><small>{customers.length} customers</small></div></div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Type</th><th>Country</th><th>KYC / KYB</th><th>Risk</th><th>Expected volume</th><th>Transactions</th><th>Alerts</th><th>Since</th></tr></thead><tbody>{customers.map(c => <tr key={c.id}><td><div className="customer-cell"><span className="avatar">{customerName(c).slice(0, 2).toUpperCase()}</span>{customerName(c)}</div></td><td>{c.type}</td><td>{c.country}</td><td><Badge value={c.kycStatus}/></td><td><Badge value={c.riskRating}/></td><td>{c.expectedMonthlyVolume ? money(Number(c.expectedMonthlyVolume), c.expectedMonthlyVolumeCurrency) : '—'}</td><td>{c._count.transactions}</td><td>{c._count.alerts}</td><td className="muted">{date(c.onboardedAt ?? c.createdAt)}</td></tr>)}</tbody></table></div></section></div>;
}
