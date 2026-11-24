/**
 * Runs the site and the API locally against DATABASE_URL (Supabase): `npm start`.
 */
import { createApp } from './app.js';
import { createDbFromEnv, loadEnvFile, MissingDatabaseUrlError } from './db.js';

loadEnvFile();

let db;
try {
  db = createDbFromEnv();
} catch (error) {
  console.error(error instanceof MissingDatabaseUrlError ? error.message : `Database settings are invalid: ${error.message}`);
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
const server = createApp({ db, serveStatic: true }).listen(port, () => {
  console.log(`SaltSaver running at http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => db.close().finally(() => process.exit(0))));
}
