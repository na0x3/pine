import type { LucideIcon } from 'lucide-react';
export function StatCard({ label, value, foot, icon: Icon }: { label: string; value: string | number; foot: string; icon: LucideIcon }) { return <div className="card stat"><div className="label">{label}<Icon/></div><div className="value">{value}</div><div className="foot">{foot}</div></div>; }
