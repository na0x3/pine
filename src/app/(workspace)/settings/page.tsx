import { requireUser } from '@/lib/auth';
import { connectionStatus } from '@/lib/chatgpt-plan';
import { db } from '@/lib/db';
import { date } from '@/lib/format';
import { PageHeading } from '@/components/page-heading';
import { Badge } from '@/components/badge';
import { IngestionKeys } from '@/components/ingestion-keys';
import { ChatGPTConnection } from '@/components/chatgpt-connection';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ chatgpt?: string }> }) {
  const user = await requireUser();
  const [members, keys, chatgpt] = await Promise.all([
    db.user.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: 'asc' } }),
    user.role === 'ADMIN' ? db.ingestionKey.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, tokenPrefix: true, createdAt: true, lastUsedAt: true, revokedAt: true }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
    connectionStatus(user.id),
  ]);
  return <div className="content">
    <PageHeading eyebrow="WORKSPACE" title="Settings" description="Organization details, access roles, and ingestion keys."/>
    <section className="card card-pad" style={{ marginBottom: 17 }}><h2>{user.organization.name}</h2><div className="subtle" style={{ marginTop: 8 }}>Workspace ID: {user.organizationId} · Created {date(user.organization.createdAt)}</div></section>
    <ChatGPTConnection connected={chatgpt.connected} email={chatgpt.email} selectedModel={chatgpt.model} notice={(await searchParams).chatgpt} dataSharingEnabled={process.env.OPENAI_DATA_SHARING_ENABLED === 'true'}/>
    <section className="card"><div className="card-header"><div><h2>Team members</h2><small>Roles are enforced on the server for case actions and assignments</small></div></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{members.map(member => <tr key={member.id}><td style={{ fontWeight: 700 }}>{member.name}</td><td>{member.email}</td><td><Badge value={member.role}/></td><td>{member.active ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></div></section>
    {user.role === 'ADMIN' && <IngestionKeys keys={keys.map(key => ({ ...key, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, revokedAt: key.revokedAt?.toISOString() ?? null }))}/>}
  </div>;
}
