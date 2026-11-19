/**
 * Uniform Result objects used by every service (ARCHITECTURE.md §5).
 *   { ok: true,  data }
 *   { ok: false, error: { code, message } }
 */

export const ERR = Object.freeze({
  NOT_FOUND: 'ERR_NOT_FOUND',
  VALIDATION: 'ERR_VALIDATION',
  EMPTY_BASKET: 'ERR_EMPTY_BASKET',
  FORBIDDEN: 'ERR_FORBIDDEN',
  STORAGE: 'ERR_STORAGE',
  DATA_LOAD: 'ERR_DATA_LOAD',
});

export const ok = (data) => ({ ok: true, data });

export const fail = (code, message) => ({ ok: false, error: { code, message } });
