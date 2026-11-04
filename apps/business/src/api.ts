let csrfToken = '';
export function setCsrf(value: string) {
  csrfToken = value;
}
export class ApiError extends Error {
  constructor(
    public code: string,
    public requestId?: string,
    public status?: number,
  ) {
    super(code);
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; key?: string } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('NETWORK_ERROR');
  }
  const data = (await response.json().catch(() => ({}))) as { code?: string; requestId?: string };
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && path !== '/me')
      window.dispatchEvent(new Event('autoparts-session-expired'));
    throw new ApiError(data.code ?? 'INTERNAL_ERROR', data.requestId, response.status);
  }
  return data as T;
}
export const mutationKey = () => crypto.randomUUID();
