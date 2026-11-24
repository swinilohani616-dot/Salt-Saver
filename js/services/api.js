/**
 * Small client for SaltSaver's own API. Every call reads SaltSaver's database;
 * the browser never contacts government websites.
 */
import { API_BASE, MESSAGES } from '../config.js';

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {string} path e.g. 'search'
 * @param {Record<string, string>} [params]
 * @param {{signal?:AbortSignal}} [options]
 */
export async function apiGet(path, params = {}, { signal } = {}) {
  const query = new URLSearchParams(params).toString();
  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  const combined = signal && timeout && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal ?? timeout;
  let response;
  try {
    response = await fetch(`${API_BASE}/${path}${query ? `?${query}` : ''}`, { signal: combined, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error.name === 'AbortError' && signal?.aborted) throw error; // replaced by a newer request
    throw new ApiError('OFFLINE', MESSAGES.OFFLINE);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* not JSON */
  }
  if (!response.ok) {
    if (response.status === 429) throw new ApiError('RATE_LIMITED', MESSAGES.RATE_LIMITED, 429);
    const message = body?.error?.message || MESSAGES.SERVER_ERROR;
    throw new ApiError(body?.error?.code || 'SERVER_ERROR', message, response.status);
  }
  return body;
}
