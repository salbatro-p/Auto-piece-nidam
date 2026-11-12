import type { FastifyRequest } from 'fastify';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Explicit local-preview preference; enrolled MFA remains mandatory everywhere else.
export function localPasswordLogin(
  request: Pick<FastifyRequest, 'ip' | 'hostname'>,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (
    env.LOCAL_PREVIEW_PASSWORD_ONLY !== 'true' ||
    env.DEMO_MODE !== 'true' ||
    env.NODE_ENV !== 'development' ||
    !loopbackAddresses.has(env.API_HOST ?? '127.0.0.1') ||
    !loopbackAddresses.has(request.ip) ||
    !loopbackHosts.has(request.hostname)
  ) return false;
  try {
    return loopbackHosts.has(new URL(env.DATABASE_URL ?? '').hostname);
  } catch {
    return false;
  }
}
