/** Recomputes the stored match results for every brand: `npm run match:refresh`. */
import { createDbFromEnv, loadEnvFile } from '../server/db.js';
import { refreshMatches } from '../db/matching.js';

loadEnvFile();
const db = createDbFromEnv(process.env, { max: 1 });
try {
  const r = await refreshMatches(db);
  console.log(`Checked ${r.brands} brands; stored ${r.stored} possible alternatives.`);
} finally {
  await db.close();
}
