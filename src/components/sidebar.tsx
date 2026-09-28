'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { LayoutDashboard, ListFilter, Users, ScanSearch, ChartNoAxesCombined, ScrollText, Settings, LogOut, ChevronDown } from 'lucide-react';

const items = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/alerts', label: 'Alerts', icon: ListFilter },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/investigations', label: 'Investigations', icon: ScanSearch },
  { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/audit-log', label: 'Audit Log', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
];
export function Sidebar({ name, role, organization }: { name: string; role: string; organization: string }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/login'); router.refresh(); }
  return <aside className="sidebar">
    <Link href="/overview" className="brand"><span className="brand-mark">V</span><span>varia<span style={{ color: '#b4d9b4' }}>.</span></span></Link>
    <div className="workspace-switch"><span className="workspace-icon">N</span><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{organization}<small>Workspace</small></span><ChevronDown size={12}/></div>
    <div className="nav-label">Workspace</div>
    <nav>{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${path === href || href === '/alerts' && path.startsWith('/alerts/') ? 'active' : ''}`}><Icon/><span>{label}</span></Link>)}</nav>
    <div className="sidebar-spacer"/>
    <div className="sidebar-bottom"><div className="sidebar-user"><Image className="avatar" src="/profile-avatar.jpg" alt="User profile" width={32} height={32}/><span style={{ flex: 1 }}><strong style={{ fontSize: 11 }}>{name}</strong><small>{role.toLowerCase()}</small></span><button onClick={logout} title="Sign out" className="button ghost" style={{ color: '#b8d2bf', padding: 3 }}><LogOut size={15}/></button></div></div>
  </aside>;
}
