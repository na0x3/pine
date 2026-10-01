import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueIngestionKey(organizationId: string, createdById: string, name: string) {
  const token = `varia_ing_${randomBytes(32).toString('base64url')}`;
  const key = await db.$transaction(async tx => {
    const created = await tx.ingestionKey.create({ data: { organizationId, createdById, name, tokenHash: hash(token), tokenPrefix: token.slice(0, 18) } });
    await tx.auditLog.create({ data: { organizationId, actorUserId: createdById, entityType: 'IngestionKey', entityId: created.id, action: 'INGESTION_KEY_CREATED', metadata: { name } } });
    return created;
  });
  return { id: key.id, name: key.name, token, tokenPrefix: key.tokenPrefix, createdAt: key.createdAt };
}

export async function authenticateIngestionKey(authorization: string) {
  if (!authorization.startsWith('Bearer varia_ing_')) return null;
  const token = authorization.slice('Bearer '.length);
  if (!/^varia_ing_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const key = await db.ingestionKey.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, organizationId: true } });
  if (!key) return null;
  const active = await db.ingestionKey.updateMany({ where: { id: key.id, revokedAt: null }, data: { lastUsedAt: new Date() } });
  if (active.count !== 1) return null;
  return { id: key.id, organizationId: key.organizationId };
}

export async function revokeIngestionKey(id: string, organizationId: string, actorUserId: string) {
  return db.$transaction(async tx => {
    const changed = await tx.ingestionKey.updateMany({ where: { id, organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (changed.count !== 1) return false;
    await tx.auditLog.create({ data: { organizationId, actorUserId, entityType: 'IngestionKey', entityId: id, action: 'INGESTION_KEY_REVOKED' } });
    return true;
  });
}
