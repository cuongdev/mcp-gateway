const BASE = '';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions extends RequestInit {
  /** Skip the global 401 → unauth event dispatch */
  silent401?: boolean;
}

export async function api<T>(path: string, init: ApiOptions = {}): Promise<T> {
  const { silent401, ...fetchInit } = init;
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...fetchInit.headers },
    credentials: 'same-origin',
    ...fetchInit,
  });
  if (res.status === 401) {
    if (!silent401) {
      window.dispatchEvent(new CustomEvent('mcp:unauth'));
    }
    throw new ApiError(401, null, 'unauthenticated');
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    type ErrBody = { error?: { message?: string } };
    const msg = (body as ErrBody)?.error?.message ?? res.statusText;
    throw new ApiError(res.status, body, msg);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPut = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiDelete = <T>(path: string) =>
  api<T>(path, { method: 'DELETE' });
