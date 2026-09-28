import { title } from '@/lib/format';
export function Badge({ value }: { value: string }) { return <span className={`badge ${value}`}>{title(value)}</span>; }
