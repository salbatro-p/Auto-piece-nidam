import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { audit, DomainError, ORG_ID, protectPool, databaseConnectionErrors } from './db.js';
import { type AuthedRequest, installAuth, requirePermission } from './auth.js';
import { registerInventory } from './inventory.js';
import { registerCatalog } from './catalog.js';
import { registerOperations } from './operations.js';
import { registerImports } from './imports.js';
import { registerBins } from './bins.js';
import { registerPricing } from './pricing.js';
import { registerCatalogLinks } from './catalog-links.js';
import { registerOpeningBalances } from './opening-balances.js';
import {registerCatalogExport} from './catalog-export.js';
import {registerMediaCatalog} from './media-catalog.js';
import {registerCatalogDiscovery} from './catalog-discovery.js';
import {registerMediaImports} from './media-imports.js';

export async function createApp(pool: Pool, options: { logger?: boolean } = {}) {
  protectPool(pool);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 6000000,
    genReqId: () => randomUUID(),
    requestTimeout: 30000,
  });
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({ code: 'RATE_LIMITED' }),
  });
  const paths: Record<string, Record<string, unknown>> = {};
  app.addHook('onRoute', (route) => {
    if (route.url.startsWith('/api/')) {
      const path = route.url.replace(/:([\w]+)/g, '{$1}');
      paths[path] ??= {};
      const parameters=[...path.matchAll(/\{(\w+)\}/g)].map(match=>({in:'path',name:match[1],required:true,schema:{type:'string'}}));
      if(parameters.length)paths[path].parameters=parameters as unknown as Record<string,unknown>;
      const publicRoute=['/api/health','/api/config','/api/auth/login','/api/auth/invitation-info','/api/auth/accept-invitation'].includes(route.url);
      for (const m of Array.isArray(route.method) ? route.method : [route.method])
        if (m !== 'HEAD')
          paths[path][m.toLowerCase()] = {
            summary: route.url,
            ...(route.config?.requestBodySchema ? {requestBody:{required:true,content:{'application/json':{schema:route.config.requestBodySchema}}}} : {}),
            responses: {
              '200': { description: 'Successful response' },
              '400': { description: 'Stable domain error code' },
              '401': { description: 'Authentication required' },
              '403': { description: 'Permission denied' },
            },
            security: publicRoute ? [] : [{ businessSession: [] }],
            ...(['POST', 'PATCH', 'PUT', 'DELETE'].includes(m)
              ? {
                  parameters: [
                    { in: 'header', name: 'X-CSRF-Token', required: !publicRoute, schema: { type: 'string' } },
                    {
                      in: 'header',
                      name: 'Idempotency-Key',
                      required: !!route.config?.domainMutation,
                      schema: { type: 'string' },
                    },
                  ],
                }
              : {}),
          };
    }
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('Cache-Control', 'no-store').header('X-Request-ID', request.id);
    return payload;
  });
  installAuth(app, pool);
  app.setErrorHandler(async (error, request, reply) => {
    const e = error as Error & { code?: string; statusCode?: number };
    let code = 'INTERNAL_ERROR',
      status = 500;
    if (e instanceof DomainError) {
      code = e.code;
      status = e.status;
    } else if (e instanceof ZodError || e.code === '22P02') {
      code = 'VALIDATION_ERROR';
      status = 400;
    } else if (e.code === '23505') {
      code = 'DUPLICATE_RECORD';
      status = 409;
    } else if (e.code === '23514' || e.code === '23503') {
      code = 'CONSTRAINT_VIOLATION';
      status = 409;
    } else if (e.code === '55P03' || e.code === '57014') {
      code = 'BUSY_RETRY';
      status = 503;
    } else if (e.statusCode === 413) {
      code = 'PAYLOAD_TOO_LARGE';
      status = 413;
    } else if (e.statusCode === 429) {
      code = 'RATE_LIMITED';
      status = 429;
    } else if (e.statusCode === 400) {
      code = 'VALIDATION_ERROR';
      status = 400;
    }
    if (status === 500)
      request.log.error(
        { code: (e as { code?: string }).code, name: e.name, requestId: request.id },
        'Request failed',
      );
    const actor = (request as AuthedRequest).actor;
    if (actor && status === 403)
      await audit(pool, actor, 'ACCESS_DENIED', null, { route: request.routeOptions.url }, request.id).catch(
        () => {},
      );
    reply.status(status).send({ code, requestId: request.id });
  });
  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ code: 'NOT_FOUND' }));
  app.get('/api/health', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return {
        status: 'ok',
        application: 'AutoParts Business',
        mode: process.env.NODE_ENV === 'production' ? 'private' : 'isolated-demo',
      };
    } catch {
      reply.status(503);
      return { status: 'unavailable', code: 'DATABASE_UNAVAILABLE' };
    }
  });
  app.get('/api/config', async () => ({
    defaultLocale:
      (await pool.query('SELECT default_locale FROM organizations WHERE id=$1', [ORG_ID])).rows[0]
        ?.default_locale ?? 'fr',
  }));
  registerCatalog(app, pool);
  registerInventory(app, pool);
  registerOperations(app, pool);
  registerImports(app, pool);
  registerBins(app, pool);
  registerPricing(app, pool);
  registerCatalogLinks(app, pool);
  registerOpeningBalances(app, pool);
  registerCatalogExport(app,pool);
  registerMediaCatalog(app,pool);
  registerCatalogDiscovery(app,pool);
  registerMediaImports(app,pool);
  app.get('/api/openapi.json', async (request) => {
    requirePermission((request as AuthedRequest).actor, 'audit');
    return {
      openapi: '3.1.0',
      info: {
        title: 'AutoParts Business API',
        version: '0.1.0',
        description:
          'Private staff API. Phase 2 Shop is not exposed. Inventory writes require session, CSRF, idempotency and server authorization.',
      },
      components: {
        securitySchemes: { businessSession: { type: 'apiKey', in: 'cookie', name: 'ap_business' } },
      },
      paths,
    };
  });
  app.get('/api/metrics', async (request) => {
    requirePermission((request as AuthedRequest).actor, 'audit');
    const orgId = (request as AuthedRequest).actor.org_id;
    const row = (
      await pool.query(
        "SELECT (SELECT count(*) FROM outbox_events WHERE org_id=$1 AND processed_at IS NULL)::integer AS pending_events,(SELECT count(*) FROM reservations WHERE org_id=$1 AND status='ACTIVE' AND expires_at<now())::integer AS overdue_reservations,(SELECT count(*) FROM sessions s JOIN staff_users u ON u.id=s.user_id WHERE u.org_id=$1 AND s.expires_at>now() AND s.revoked_at IS NULL)::integer AS sessions",
        [orgId],
      )
    ).rows[0];
    return {
      ...row,
      dbPool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      uptimeSeconds: process.uptime(),
      memoryBytes: process.memoryUsage().rss,
      databaseConnectionErrors,
    };
  });
  await app.ready();
  return app;
}
