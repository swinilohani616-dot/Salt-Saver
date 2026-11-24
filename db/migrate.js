/**
 * Applies db/migrations/*.sql in file-name order. Each file runs once, inside a
 * transaction, and is recorded in schema_migrations.
 */
import { readdir, readFile } from 'node:fs/promises';

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url);

/**
 * @param {{query:Function, exec:Function, transaction:Function}} db
 * @returns {Promise<string[]>} versions applied by this run
 */
export async function migrate(db) {
  await db.exec(`
    create table if not exists schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    );
    alter table schema_migrations enable row level security;
  `);

  const done = new Set((await db.query('select version from schema_migrations')).map((r) => r.version));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (done.has(version)) continue;
    const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into schema_migrations (version) values ($1)', [version]);
    });
    applied.push(version);
  }
  return applied;
}
