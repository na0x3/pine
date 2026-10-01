import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { customerName, dateTime, title } from '@/lib/format';
import { PageHeading } from '@/components/page-heading';
import { investigationSchema } from '@/lib/validation';
import { Badge } from '@/components/badge';
export default async function InvestigationsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const total = await db.investigation.count({ where: { organizationId: user.organizationId } });
  const pageSize = 50;
  const requestedPage = Number((await searchParams).page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize))) : 1;
  const investigations = await db.investigation.findMany({ where: { organizationId: user.organizationId }, include: { alert: { include: { customer: true } } }, orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize });
  return <div className="content"><PageHeading eyebrow="ANALYSIS HISTORY" title="Investigations" description="Versioned case analyses with preserved evidence and recommendations."/><section className="card"><div className="card-header"><div><h2>Investigation history</h2><small>{total} saved versions</small></div></div><div className="table-wrap"><table><thead><tr><th>Alert</th><th>Customer</th><th>Version</th><th>Source</th><th>Recommendation</th><th>Confidence</th><th>Completed</th></tr></thead><tbody>{investigations.map(i => { const output = investigationSchema.safeParse(i.output); return <tr key={i.id}><td><Link className="table-link" href={`/alerts/${i.alertId}?version=${i.version}`}>{i.alertId}</Link></td><td>{customerName(i.alert.customer)}</td><td>v{i.version}</td><td>{i.source === 'CHATGPT_PLAN' ? `ChatGPT plan · ${i.model}` : i.source === 'OPENAI' ? i.model : 'Synthetic demo'}</td><td>{output.success ? title(output.data.recommended_action) : 'Unavailable'}</td><td>{output.success ? <Badge value={output.data.confidence.toUpperCase()}/> : '—'}</td><td className="muted">{dateTime(i.completedAt)}</td></tr>; })}</tbody></table></div><div className="table-footer"><span>Showing {investigations.length ? (page - 1) * pageSize + 1 : 0}–{(page - 1) * pageSize + investigations.length} of {total}</span><span className="button-row">{page > 1 && <Link className="button small" href={`/investigations?page=${page - 1}`}>Previous</Link>}<span>Page {page}</span>{page * pageSize < total && <Link className="button small" href={`/investigations?page=${page + 1}`}>Next</Link>}</span></div></section></div>;
}
