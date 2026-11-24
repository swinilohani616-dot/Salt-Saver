/**
 * Single app state object with publish/subscribe.
 * Views subscribe and re-render only the parts whose slice changed.
 *
 * state = {
 *   status: 'loading' | 'ready' | 'error',
 *   role: 'patient' | 'caregiver' | 'pharmacy' | null,
 *   prefs: { fontScale, highContrast },
 *   search: { query, status: 'idle'|'short'|'loading'|'results'|'notfound'|'error', body, message },  // body: the API's answer
 *   entered, references: prices typed from the user's own packs (services/referenceService.js),
 *   basket: [lines, see core/validate.js],
 *   storageFallback: boolean,
 * }
 */

let state = {};
const subscribers = new Set();

export const getState = () => state;

export function initStore(initial) {
  state = { ...initial };
}

export function setState(patch) {
  const prev = state;
  state = { ...state, ...patch };
  subscribers.forEach((fn) => fn(state, prev));
}

/** @param {(state:object, prev:object) => void} fn */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
