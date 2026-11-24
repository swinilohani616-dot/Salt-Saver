/**
 * Official data imports. Nothing changes in the catalogue until you approve.
 *
 *   npm run import:ja -- --file ~/Downloads/product-list.csv [--as-of 2026-11-20] [--map mrp="MRP (Rs.)"]
 *   npm run import:ja -- --download <direct file URL>
 *   npm run import:ja -- --file <same file> --reread   (after the reading rules changed; still needs approval)
 *   npm run import:list
 *   npm run import:show -- <id>
 *   npm run import:approve -- <id> --by "Your name" [--note "..."] [--allow-large-removal]
 *   npm run import:reject -- <id> [--note "..."]
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createDbFromEnv, loadEnvFile } from '../server/db.js';
import { stageImport, approveImport, rejectImport, listImports, getImport, ImportError } from '../db/pipeline.js';
import { ADAPTERS, COMMAND_NAMES } from '../db/importers/index.js';
import { parseMapArgs } from '../lib/import/columns.js';
import { downloadFile } from '../lib/import/download.js';

const REPORT_DIR = 'imports/reports';
const INBOX_DIR = 'imports/inbox';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: 'string' },
    download: { type: 'string' },
    'page-url': { type: 'string' },
    'as-of': { type: 'string' },
    version: { type: 'string' },
    map: { type: 'string', multiple: true },
    by: { type: 'string' },
    note: { type: 'string' },
    'allow-large-removal': { type: 'boolean' },
    reread: { type: 'boolean' },
  },
});
const [command, ...rest] = positionals;

function usage() {
  console.log(`Usage:
  import <ja|nppa> --file <path> [--as-of YYYY-MM-DD] [--version "label"] [--page-url <url>] [--map field="Header"]
  import <ja|nppa> --download <direct file URL> [--as-of YYYY-MM-DD]
  import <ja|nppa> --file <path> --reread     read the newest imported file again (still needs approval)
  import list
  import show <id>
  import approve <id> --by "Your name" [--note "..."] [--allow-large-removal]
  import reject <id> [--note "..."]`);
}

async function saveReport(id, sourceId, markdown) {
  await mkdir(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `import-${id}-${sourceId}.md`);
  await writeFile(file, markdown);
  return file;
}

function printSummary(s) {
  console.log(`  rows ${s.rows}: read ${s.parsed}, failed ${s.failed}, with warnings ${s.withWarnings}`);
  console.log(`  new ${s.new}, changed ${s.changed}, removed ${s.removed}, unchanged ${s.unchanged}`);
}

async function stage(db, sourceId) {
  const adapter = ADAPTERS[sourceId];
  if (values['as-of'] && !/^\d{4}-\d{2}-\d{2}$/.test(values['as-of'])) throw new ImportError('--as-of must look like 2026-11-20.');
  let bytes;
  let fileName;
  let url = values['page-url'] ?? null;
  let downloadedAt = new Date();
  if (values.download) {
    console.log(`Downloading ${values.download} …`);
    const got = await downloadFile(values.download);
    bytes = got.bytes;
    url = got.url;
    const base = path.basename(new URL(got.url).pathname) || 'download';
    await mkdir(path.join(INBOX_DIR, sourceId), { recursive: true });
    fileName = path.join(INBOX_DIR, sourceId, `${new Date().toISOString().slice(0, 10)}-${base}`);
    await writeFile(fileName, bytes);
    console.log(`Saved ${bytes.length} bytes to ${fileName} (attempts: ${got.attempts})`);
  } else if (values.file) {
    bytes = await readFile(values.file);
    fileName = path.basename(values.file);
    downloadedAt = (await stat(values.file)).mtime;
  } else throw new ImportError('Give --file <path> or --download <url>.');

  const result = await stageImport(db, adapter, {
    bytes,
    fileName,
    url,
    versionLabel: values.version ?? null,
    effectiveFrom: values['as-of'] ?? null,
    downloadedAt,
    overrides: parseMapArgs(values.map),
    reread: values.reread ?? false,
  });
  if (result.status === 'unchanged') {
    console.log(`No new version: this file was already imported (import #${result.diffId}). To read it again after a change to the reading rules, add --reread.`);
    return;
  }
  if (result.status === 'already-pending') {
    console.log(`This file is already waiting for review as import #${result.diffId}. Run: npm run import:show -- ${result.diffId}`);
    return;
  }
  const reportFile = await saveReport(result.diffId, sourceId, result.report);
  console.log(`Staged import #${result.diffId} for review (nothing has changed in the catalogue yet).`);
  printSummary(result.summary);
  console.log(`Report: ${reportFile}`);
  console.log(`Approve: npm run import:approve -- ${result.diffId} --by "Your name"   Reject: npm run import:reject -- ${result.diffId}`);
}

loadEnvFile();
if (!command) {
  usage();
  process.exit(1);
}
const db = createDbFromEnv(process.env, { max: 1 });
try {
  if (COMMAND_NAMES[command]) await stage(db, COMMAND_NAMES[command]);
  else if (command === 'list') {
    const rows = await listImports(db);
    if (!rows.length) console.log('No imports yet.');
    for (const r of rows) {
      const s = r.summary ?? {};
      console.log(`#${r.id}  ${r.status.padEnd(9)} ${r.source_id.padEnd(20)} ${r.file_name}  new ${s.new ?? 0} / changed ${s.changed ?? 0} / removed ${s.removed ?? 0} / failed ${s.failed ?? 0}`);
    }
  } else if (command === 'show') {
    const diff = await getImport(db, rest[0]);
    if (!diff) throw new ImportError(`Import #${rest[0]} does not exist.`);
    const file = await saveReport(diff.id, diff.source_id, diff.report_md ?? '');
    console.log(diff.report_md);
    console.log(`\n(Status: ${diff.status}. Saved to ${file})`);
  } else if (command === 'approve') {
    const r = await approveImport(db, ADAPTERS, rest[0], { reviewedBy: values.by, note: values.note, allowLargeRemoval: values['allow-large-removal'] });
    console.log(`Import #${r.diffId} committed: ${JSON.stringify(r.stats)}`);
  } else if (command === 'reject') {
    await rejectImport(db, rest[0], { reviewedBy: values.by ?? null, note: values.note ?? null });
    console.log(`Import #${rest[0]} rejected. Nothing was changed.`);
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof ImportError ? error.message : `Import failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
