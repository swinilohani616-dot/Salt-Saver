/**
 * Imports the legacy demo dataset into DATABASE_URL: `npm run db:seed [-- path/to/file.json] [-- --force]`.
 * --force re-imports a file that was already imported (after normalisation improvements).
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createDbFromEnv, loadEnvFile } from '../server/db.js';
import { seedLegacy } from '../db/seedLegacy.js';
import { printSeedResult } from './seedReport.js';

loadEnvFile();
const args = process.argv.slice(2);
const force = args.includes('--force');
const file = args.find((a) => !a.startsWith('--')) || 'data/sample-data.json';
const db = createDbFromEnv(process.env, { max: 1 });
try {
  const bytes = await readFile(file);
  const { mtime } = await stat(file);
  const result = await seedLegacy(db, { bytes, fileName: path.relative(process.cwd(), path.resolve(file)), downloadedAt: mtime, force });
  printSeedResult(result);
} catch (error) {
  console.error(`Seed failed, nothing was changed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
