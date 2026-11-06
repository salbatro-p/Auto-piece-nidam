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
  options: { method?: string; body?: unknown; key?: string; onUploadProgress?:(percent:number)=>void } = {},
): Promise<T> {
  let response: Response;
  try {
    const init={
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    };
    response=options.onUploadProgress?await new Promise<Response>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open(init.method,`/api${path}`);xhr.timeout=60000;
      for(const [key,value] of Object.entries(init.headers))xhr.setRequestHeader(key,value);
      xhr.upload.onprogress=e=>{if(e.lengthComputable)options.onUploadProgress?.(Math.round(e.loaded/e.total*100));};
      xhr.onerror=xhr.ontimeout=()=>reject(new Error('NETWORK_ERROR'));
      xhr.onload=()=>resolve(new Response(xhr.responseText,{status:xhr.status,headers:{'Content-Type':'application/json'}}));xhr.send(init.body);
    }):await fetch(`/api${path}`,{...init,credentials:'same-origin'});
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
