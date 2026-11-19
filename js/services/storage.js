/**
 * localStorage wrapper with an in-memory fallback (PRD §12 "LocalStorage full").
 * If a write fails (quota exceeded, private mode, blocked site data) the app
 * switches to memory for the rest of the tab and notifies listeners once.
 */
import { STORAGE_PREFIX } from '../config.js';

const memory = new Map();
const fallbackListeners = new Set();
let mode = 'local';

function getLocal() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function switchToMemory() {
  if (mode === 'memory') return;
  mode = 'memory';
  fallbackListeners.forEach((fn) => fn());
}

/** Checks that localStorage can be written. @returns {'local'|'memory'} */
export function initStorage() {
  const ls = getLocal();
  try {
    const probe = `${STORAGE_PREFIX}__probe__`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch {
    switchToMemory();
  }
  return mode;
}

export const isMemoryMode = () => mode === 'memory';

/** @param {() => void} fn called once when storage falls back to memory */
export function onFallback(fn) {
  fallbackListeners.add(fn);
  return () => fallbackListeners.delete(fn);
}

export function getJSON(key, fallback = null) {
  try {
    const raw = memory.has(key) ? memory.get(key) : getLocal()?.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** @returns {{persisted:boolean}} persisted is false when kept in memory only */
export function setJSON(key, value) {
  const raw = JSON.stringify(value);
  if (mode === 'local') {
    try {
      getLocal().setItem(key, raw);
      memory.delete(key);
      return { persisted: true };
    } catch {
      switchToMemory();
    }
  }
  memory.set(key, raw);
  return { persisted: false };
}

export function remove(key) {
  memory.delete(key);
  try {
    getLocal()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Removes every SaltSaver key (used by Reset demo). */
export function clearAll() {
  for (const key of [...memory.keys()]) if (key.startsWith(STORAGE_PREFIX)) memory.delete(key);
  try {
    const ls = getLocal();
    if (!ls) return;
    const keys = [];
    for (let i = 0; i < ls.length; i += 1) {
      const key = ls.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => ls.removeItem(key));
  } catch {
    /* ignore */
  }
}
