import {
  scryptSync,
  randomBytes,
  timingSafeEqual,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit, DomainError, hash, transaction, type Actor } from './db.js';

export const permissions: Record<string, string[]> = {
  owner: [
    'catalog',
    'costs',
    'receive',
    'sell',
    'transfer',
    'returns',
    'counts',
    'approve',
    'suppliers',
    'purchases',
    'imports',
    'audit',
    'staff',
    'reports',
  ],
  manager: [
    'catalog',
    'costs',
    'receive',
    'sell',
    'transfer',
    'returns',
    'counts',
    'approve',
    'suppliers',
    'purchases',
    'imports',
    'audit',
    'reports',
  ],
  warehouse: ['receive', 'transfer', 'returns', 'counts'],
  sales: ['sell', 'returns'],
  buyer: ['costs', 'suppliers', 'purchases'],
  curator: ['catalog', 'imports'],
  auditor: ['audit', 'reports'],
  accountant: ['costs', 'reports'],
};
export const roleSchema = z.enum([
  'owner',
  'manager',
  'warehouse',
  'sales',
  'buyer',
  'curator',
  'auditor',
  'accountant',
]);
export const localeSchema = z.enum(['ar', 'fr', 'en']);
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const b = Buffer.from(key, 'hex');
  const a = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function protectSecret(secret: string) {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key || !/^[a-fA-F0-9]{64}$/.test(key))
    throw new Error('MFA_ENCRYPTION_KEY must be 64 hexadecimal characters');
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  return [
    iv.toString('hex'),
    c.update(secret, 'utf8', 'hex') + c.final('hex'),
    c.getAuthTag().toString('hex'),
  ].join(':');
}
function readSecret(value: string) {
  const [iv, data, tag] = value.split(':');
  const d = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.MFA_ENCRYPTION_KEY!, 'hex'),
    Buffer.from(iv!, 'hex'),
  );
  d.setAuthTag(Buffer.from(tag!, 'hex'));
  return d.update(data!, 'hex', 'utf8') + d.final('utf8');
}
function base32(value: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of value.replace(/=+$/, '').toUpperCase()) {
    const n = chars.indexOf(c);
    if (n < 0) throw new Error('invalid base32');
    bits += n.toString(2).padStart(5, '0');
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
}
export function totp(secret: string, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = digest[19]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export function userView(actor: Actor) {
  return {
    id: actor.id,
    name: actor.name,
    email: (actor as Actor & { email?: string }).email,
    role: actor.role,
    locale: actor.locale,
    permissions: actor.permissions,
    warehouseIds: actor.warehouse_ids,
  };
}
export function requirePermission(actor: Actor, permission: string) {
  if (!actor.permissions.includes(permission)) throw new DomainError('FORBIDDEN', 403);
}
export type AuthedRequest = FastifyRequest & { actor: Actor; csrfToken: string; sessionHash: string };
const cookieName = 'ap_business';
function cookieValue(request: FastifyRequest) {
  return (request.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
function setCookie(token: string, expire = false) {
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${expire ? 0 : 28800}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function installAuth(app: FastifyInstance, pool: Pool) {
  const attempts = new Map<string, { n: number; until: number }>();
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const origin = request.headers.origin;
      const allowed = (
        process.env.APP_ORIGINS ??
        process.env.APP_ORIGIN ??
        'http://localhost:4173,http://127.0.0.1:4173,http://localhost:4310'
      ).split(',');
      if (origin && !allowed.includes(origin)) throw new DomainError('CSRF_INVALID', 403);
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new DomainError('CSRF_INVALID', 403);
    }
    if (['/api/health', '/api/config', '/api/auth/login', '/api/auth/invitation-info','/api/auth/accept-invitation'].includes(path))
      return;
    if (!path.startsWith('/api/')) return;
    const token = cookieValue(request);
    if (!token) throw new DomainError('UNAUTHENTICATED', 401);
    const result = await pool.query(
      `SELECT u.*,s.csrf_token,s.token_hash FROM sessions s JOIN staff_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND s.last_seen>now()-interval '5 minutes' AND u.active`,
      [hash(token)],
    );
    if (!result.rowCount) {
      reply.header('Set-Cookie', setCookie('', true));
      throw new DomainError('SESSION_EXPIRED', 401);
    }
    const row = result.rows[0];
    const req = request as AuthedRequest;
    req.actor = { ...row, permissions: permissions[row.role] ?? [] };
    req.csrfToken = row.csrf_token;
    req.sessionHash = row.token_hash;
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      request.headers['x-csrf-token'] !== row.csrf_token
    )
      throw new DomainError('CSRF_INVALID', 403);
    await pool.query('UPDATE sessions SET last_seen=now() WHERE token_hash=$1', [row.token_hash]);
  });
  app.post('/api/auth/login', async (request, reply) => {
    const data = z
      .object({
        email: z.string().email().max(200),
        password: z.string().min(1).max(200),
        totp: z.string().optional(),
        locale: localeSchema.optional(),
      })
      .strict()
      .parse(request.body);
    const limitKey = `${request.ip}:${data.email.toLowerCase()}`;
    const entry = attempts.get(limitKey);
    if (entry && entry.until > Date.now() && entry.n >= 10) throw new DomainError('RATE_LIMITED', 429);
    attempts.set(limitKey, {
      n: entry && entry.until > Date.now() ? entry.n + 1 : 1,
      until: Date.now() + 600000,
    });
    if (attempts.size > 10000)
      for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key);
    return transaction(pool, async (c) => {
      const result = await c.query('SELECT * FROM staff_users WHERE lower(email)=$1 AND active FOR UPDATE', [
        data.email.toLowerCase(),
      ]);
      const row = result.rows[0];
      const valid = verifyPassword(
        data.password,
        row?.password_hash ??
          'dummy:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
      );
      if (!row || !valid) throw new DomainError('INVALID_CREDENTIALS', 401);
      if (['owner', 'manager'].includes(row.role)) {
        if (!row.mfa_secret) throw new DomainError('MFA_SETUP_REQUIRED', 403);
        if (!data.totp) throw new DomainError('MFA_REQUIRED', 401);
        const step = Math.floor(Date.now() / 30000);
        const secret = readSecret(row.mfa_secret);
        const matched = [step - 1, step, step + 1].find((s) => totp(secret, s) === data.totp);
        if (matched === undefined || Number(row.mfa_last_step ?? 0) >= matched)
          throw new DomainError('MFA_INVALID', 401);
        await c.query('UPDATE staff_users SET mfa_last_step=$2 WHERE id=$1', [row.id, matched]);
      }
      const actor: Actor = { ...row, permissions: permissions[row.role] ?? [] };
      const token = randomBytes(32).toString('hex'),
        csrfToken = randomBytes(24).toString('hex');
      const old = cookieValue(request);
      if (old) await c.query('DELETE FROM sessions WHERE token_hash=$1', [hash(old)]);
      await c.query(
        "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",
        [hash(token), row.id, csrfToken],
      );
      await audit(c, actor, 'SESSION_STARTED', row.id, {}, request.id);
      attempts.delete(limitKey);
      reply.header('Set-Cookie', setCookie(token));
      return { user: userView(actor), csrfToken };
    });
  });
  app.get('/api/me', async (request) => {
    const req = request as AuthedRequest;
    return { user: userView(req.actor), csrfToken: req.csrfToken };
  });
  app.patch('/api/me/locale', async (request) => {
    const req = request as AuthedRequest;
    const { locale } = z.object({ locale: localeSchema }).strict().parse(request.body);
    await pool.query('UPDATE staff_users SET locale=$2 WHERE id=$1', [req.actor.id, locale]);
    return { locale };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const req = request as AuthedRequest;
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]);
    await audit(pool, req.actor, 'SESSION_ENDED', req.actor.id, {}, request.id);
    reply.header('Set-Cookie', setCookie('', true));
    return { ok: true };
  });
  app.post('/api/auth/lock', async (request, reply) => {
    const req = request as AuthedRequest;
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionHash]);
    reply.header('Set-Cookie', setCookie('', true));
    return { ok: true };
  });
}
