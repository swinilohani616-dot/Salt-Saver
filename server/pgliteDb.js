/**
 * PGlite (Postgres compiled to WebAssembly, runs in-process) behind the same
 * interface as server/db.js. Used by the tests and by `npm run dev:local`, so
 * the app can be tried without a Supabase project. Not used in production.
 */
export async function createPgliteDb(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  const pglite = await PGlite.create(dataDir, { extensions: { pg_trgm } });

  const wrap = (client) => ({
    query: async (text, params) => (await client.query(text, params)).rows,
    exec: async (text) => {
      await client.exec(text);
    },
  });

  return {
    ...wrap(pglite),
    transaction: (fn) => pglite.transaction((tx) => fn(wrap(tx))),
    close: () => pglite.close(),
  };
}
