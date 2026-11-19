/**
 * Loads the medicine database: localStorage first, sample-data.json as fallback.
 */
import { DATA_URL, STORAGE_KEYS, SCHEMA_VERSION, MESSAGES } from '../config.js';
import { ERR, ok, fail } from '../core/errors.js';
import { validateDb } from '../core/validate.js';
import { buildSaltIndex } from '../core/saltIndex.js';
import * as storage from './storage.js';

/** @type {{medicines:object[], byId:Map<string,object>, saltIndex:Map<string,object[]>}|null} */
let db = null;

async function fetchSeed() {
  const response = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function buildDb(medicines) {
  return {
    medicines,
    byId: new Map(medicines.map((m) => [m.id, m])),
    saltIndex: buildSaltIndex(medicines),
  };
}

/**
 * @param {{loadSeed?: () => Promise<unknown>}} [options] loadSeed is injectable for tests
 */
export async function loadDatabase({ loadSeed = fetchSeed } = {}) {
  const cached = validateDb(storage.getJSON(STORAGE_KEYS.db));
  if (cached.ok) {
    db = buildDb(cached.data.medicines);
    return ok(db);
  }

  let seed;
  try {
    seed = await loadSeed();
  } catch (error) {
    console.error('SaltSaver: failed to load medicine data', error);
    return fail(ERR.DATA_LOAD, MESSAGES.DATA_LOAD_FAIL);
  }

  const result = validateDb(seed);
  if (!result.ok) return result;
  if (result.data.skipped > 0) console.warn(`SaltSaver: skipped ${result.data.skipped} invalid medicine records`);

  storage.setJSON(STORAGE_KEYS.db, { schemaVersion: SCHEMA_VERSION, medicines: result.data.medicines });
  db = buildDb(result.data.medicines);
  return ok(db);
}

export const getDb = () => db;

/** Clears every SaltSaver key and re-seeds from sample-data.json. */
export async function resetDemo(options) {
  storage.clearAll();
  db = null;
  return loadDatabase(options);
}
