/**
 * Loads the curated ingredient names and aliases into DATABASE_URL: `npm run db:reference`.
 * Safe to re-run; merges duplicate ingredients created before an alias existed.
 */
import { createDbFromEnv, loadEnvFile } from '../server/db.js';
import { loadReferenceData } from '../db/reference.js';

loadEnvFile();
const db = createDbFromEnv(process.env, { max: 1 });
try {
  const stats = await loadReferenceData(db);
  console.log(`Loaded ${stats.ingredients} ingredients and ${stats.aliases} aliases.`);
  if (stats.merged.length) console.log(`Merged duplicates: ${stats.merged.join(', ')}`);
} catch (error) {
  console.error(`Loading reference data failed, nothing was changed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
