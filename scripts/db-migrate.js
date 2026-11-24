/**
 * Applies pending migrations to DATABASE_URL: `npm run db:migrate`.
 */
import { createDbFromEnv, loadEnvFile } from '../server/db.js';
import { migrate } from '../db/migrate.js';

loadEnvFile();
const db = createDbFromEnv(process.env, { max: 1 });
try {
  const applied = await migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} catch (error) {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
