/**
 * Runs SaltSaver with a local PGlite database in .pglite/ instead of Supabase:
 * `npm run dev:local`. Applies migrations and imports the legacy dataset first.
 */
import { readFile, stat } from 'node:fs/promises';
import { createPgliteDb } from '../server/pgliteDb.js';
import { migrate } from '../db/migrate.js';
import { seedLegacy } from '../db/seedLegacy.js';
import { loadReferenceData } from '../db/reference.js';
import { createApp } from '../server/app.js';
import { printSeedResult } from './seedReport.js';

const SEED = 'data/sample-data.json';
const db = await createPgliteDb(process.env.PGLITE_DIR || './.pglite');

const applied = await migrate(db);
if (applied.length) console.log(`Applied migrations: ${applied.join(', ')}`);
await loadReferenceData(db);
const { mtime } = await stat(SEED);
printSeedResult(await seedLegacy(db, { bytes: await readFile(SEED), fileName: SEED, downloadedAt: mtime }));

const port = Number(process.env.PORT) || 3000;
createApp({ db, serveStatic: true }).listen(port, () => {
  console.log(`SaltSaver (local database) running at http://localhost:${port}`);
});
