import { clsx } from 'clsx';
import type { ButtonHTMLAttributes } from 'react';
export function Button({ className, variant = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) { return <button className={clsx('button', variant !== 'default' && variant, className)} {...props} />; }
