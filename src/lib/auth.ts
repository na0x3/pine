import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { compare } from 'bcryptjs';
import { db } from './db';
import { redirect } from 'next/navigation';
import type { Role } from '@prisma/client';

const cookieName = 'varia_session';
const sessionDays = 7;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { include: { organization: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(roles: Role[]) {
  const user = await currentUser();
  if (!user) return { ok: false as const, error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
  if (!roles.includes(user.role)) return { ok: false as const, error: Response.json({ error: 'Insufficient permission' }, { status: 403 }) };
  return { ok: true as const, user };
}

export async function verifyOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = (await headers()).get('host');
  if (!origin || !host || new URL(origin).host !== host) return false;
  return true;
}

export async function signIn(email: string, password: string, ip: string) {
  const normalized = email.trim().toLowerCase();
  const ipHash = hash(ip || 'unknown');
  const since = new Date(Date.now() - 15 * 60_000);
  const [emailFailures, ipFailures] = await Promise.all([
    db.loginAttempt.count({ where: { email: normalized, successful: false, createdAt: { gt: since } } }),
    db.loginAttempt.count({ where: { ipHash, successful: false, createdAt: { gt: since } } }),
  ]);
  if (emailFailures >= 8 || ipFailures >= 30) return false;
  const user = await db.user.findUnique({ where: { email: normalized } });
  const valid = !!user?.active && await compare(password, user.passwordHash);
  await db.loginAttempt.create({ data: { email: normalized, ipHash, successful: valid } });
  if (!valid || !user) return false;
  const token = randomBytes(32).toString('base64url');
  await db.$transaction([
    db.session.create({ data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + sessionDays * 86400_000) } }),
    db.auditLog.create({ data: { organizationId: user.organizationId, actorUserId: user.id, entityType: 'User', entityId: user.id, action: 'LOGIN' } }),
  ]);
  (await cookies()).set(cookieName, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: sessionDays * 86400 });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  jar.delete(cookieName);
}
