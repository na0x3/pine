import { requireUser } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Bell, ChevronRight, HelpCircle } from 'lucide-react';
import Image from 'next/image';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <div className="app-shell"><Sidebar name={user.name} role={user.role} organization={user.organization.name}/><main className="main"><header className="topbar"><div className="breadcrumb"><span>{user.organization.name}</span><ChevronRight size={13}/><strong>Investigation workspace</strong></div><div className="topbar-right"><HelpCircle/><Bell/><Image className="avatar" src="/profile-avatar.jpg" alt="User profile" width={29} height={29}/></div></header>{children}</main></div>;
}
