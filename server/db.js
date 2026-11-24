/**
 * Database access. Everything else talks to this small interface, so the same
 * code runs on Supabase (node-postgres) and on PGlite (tests, local dev):
 *
 *   db.query(sql, params) -> rows
 *   db.exec(sql)          -> runs one or more statements without parameters
 *   db.transaction(fn)    -> fn(tx) inside BEGIN/COMMIT, ROLLBACK on error
 *   db.close()
 *
 * Credentials come only from environment variables and stay on the server.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const QUERY_TIMEOUT_MS = 10_000;

/** Wraps a pg Pool or PoolClient. */
function wrapPg(client) {
  return {
    query: async (text, params) => (await client.query(text, params)).rows,
    exec: async (text) => {
      await client.query(text);
    },
  };
}

/**
 * DATABASE_SSL:
 *   require (default) encrypted, server certificate not checked
 *   verify            encrypted and checked against DATABASE_SSL_CA_FILE (Supabase's CA certificate)
 *   disable           no TLS; only for a Postgres on this machine
 */
export function sslConfig(env = process.env) {
  const mode = (env.DATABASE_SSL || 'require').toLowerCase();
  if (mode === 'disable') return false;
  if (mode === 'verify') {
    if (!env.DATABASE_SSL_CA_FILE) throw new Error('DATABASE_SSL=verify needs DATABASE_SSL_CA_FILE (path to the CA certificate).');
    return { rejectUnauthorized: true, ca: readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8') };
  }
  if (mode === 'require') return { rejectUnauthorized: false };
  throw new Error(`DATABASE_SSL must be require, verify or disable (got "${env.DATABASE_SSL}").`);
}

/** An sslmode in the URL would override DATABASE_SSL, so it is removed. */
function stripSslMode(connectionString) {
  try {
    const url = new URL(connectionString);
    if (!url.searchParams.has('sslmode')) return connectionString;
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function createPgDb({ connectionString, ssl, max = 5 }) {
  const pool = new pg.Pool({
    connectionString: stripSslMode(connectionString),
    ssl,
    max,
    connectionTimeoutMillis: QUERY_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
    statement_timeout: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
  // An idle client losing its connection must not crash the process.
  pool.on('error', (error) => console.error('[db] idle client error:', error.message));

  return {
    ...wrapPg(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrapPg(client));
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super(
      'DATABASE_URL is not set. Copy .env.example to .env and paste your Supabase connection string, ' +
        'or run "npm run dev:local" to use a local database instead.',
    );
  }
}

/** Builds the database from DATABASE_URL (Supabase or any Postgres). */
export function createDbFromEnv(env = process.env, { max } = {}) {
  if (!env.DATABASE_URL) throw new MissingDatabaseUrlError();
  return createPgDb({ connectionString: env.DATABASE_URL, ssl: sslConfig(env), max });
}

/** Loads .env from the project root when it exists. Real environment variables win. */
export function loadEnvFile() {
  try {
    process.loadEnvFile(new URL('../.env', import.meta.url));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
