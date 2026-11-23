/**
 * localStorage wrapper with a session fallback (PRD §12 "LocalStorage full").
 * If a write fails (quota exceeded, private mode, blocked site data) the app
 * switches to session memory for the rest of the tab and notifies listeners once.
 * Session memory is sessionStorage when available (so the basket survives moving
 * between index.html and cart.html), plus an in-memory Map as the last resort.
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

function getSession() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readSession(key) {
  try {
    return getSession()?.getItem(key) ?? null;
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

/** Reads memory → sessionStorage (newer fallback copy) → localStorage. */
export function getJSON(key, fallback = null) {
  try {
    let raw = memory.has(key) ? memory.get(key) : readSession(key);
    if (raw === null || raw === undefined) raw = getLocal()?.getItem(key);
    return raw === null || raw === undefined ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** @returns {{persisted:boolean}} persisted is false when kept for this tab only */
export function setJSON(key, value) {
  const raw = JSON.stringify(value);
  if (mode === 'local') {
    try {
      getLocal().setItem(key, raw);
      memory.delete(key);
      try {
        getSession()?.removeItem(key);
      } catch {
        /* ignore */
      }
      return { persisted: true };
    } catch {
      switchToMemory();
    }
  }
  memory.set(key, raw);
  try {
    getSession()?.setItem(key, raw);
  } catch {
    /* sessionStorage unavailable too: memory only */
  }
  return { persisted: false };
}

export function remove(key) {
  memory.delete(key);
  for (const area of [getSession(), getLocal()]) {
    try {
      area?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Removes every SaltSaver key (used by Reset demo). */
export function clearAll() {
  for (const key of [...memory.keys()]) if (key.startsWith(STORAGE_PREFIX)) memory.delete(key);
  for (const area of [getSession(), getLocal()]) {
    try {
      if (!area) continue;
      const keys = [];
      for (let i = 0; i < area.length; i += 1) {
        const key = area.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
      }
      keys.forEach((key) => area.removeItem(key));
    } catch {
      /* ignore */
    }
  }
}
