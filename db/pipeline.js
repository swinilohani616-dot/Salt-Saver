/**
 * Import pipeline shared by every official source.
 *
 *   stageImport   file -> checksum + raw copy -> parse -> normalise -> diff -> pending review (+ report)
 *   approveImport pending review -> commit in one transaction -> committed
 *   rejectImport  pending review -> rejected (nothing changes)
 *
 * Nothing reaches the catalogue tables until a person approves the diff.
 * A source adapter (db/importers/*.js) supplies the source-specific parts:
 *   { sourceId, label, fields, anchors, largeRemovalShare, prepare?, parseRow, snapshot, loadCurrent, commit }
 */
import { createHash } from 'node:crypto';
import { parseCsv } from '../lib/import/csv.js';
import { findHeader } from '../lib/import/columns.js';
import { extractPdfTable } from '../lib/import/pdfTable.js';
import { loadResolver } from './reference.js';
import { buildReport } from './report.js';

export class ImportError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.details = details;
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const BATCH = 500;

export function* batches(items, size = BATCH) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/** 'pdf' | 'csv' | 'xlsx' | 'xls' from the file's first bytes. */
export function detectFormat(bytes) {
  const head = bytes.subarray(0, 8);
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (head[0] === 0x50 && head[1] === 0x4b) return 'xlsx';
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'xls';
  return 'csv';
}

/** Reads the table from a CSV or PDF file into header + rows of cells. */
export async function readTable(bytes, adapter, overrides = {}) {
  const format = detectFormat(bytes);
  if (format === 'xlsx' || format === 'xls') {
    throw new ImportError('Excel files are not read directly. Open the file and save it as CSV (File > Save As > CSV), then import the CSV.');
  }
  if (format === 'pdf') {
    const table = await extractPdfTable(bytes, adapter.fields, { anchors: adapter.anchors, overrides });
    if (!table.ok) throw new ImportError(table.error, { format });
    return {
      format,
      header: table.header,
      index: table.index,
      rows: table.rows.map((r) => ({ cells: r.cells, location: `page ${r.page}, line ${r.line}` })),
      unassigned: table.unassigned,
    };
  }
  const all = parseCsv(bytes);
  if (all.length === 0) throw new ImportError('The file is empty.', { format });
  const found = findHeader(all, adapter.fields, overrides);
  if (!found.ok) {
    throw new ImportError(
      `Could not find the column(s) ${found.missing.join(', ')}. Headers seen: ${found.header.map((h) => `"${h}"`).join(', ')}. ` +
        'If a column has a different name, pass --map field="Header in file".',
      { format, missing: found.missing, header: found.header },
    );
  }
  return {
    format,
    header: found.header,
    index: found.index,
    rows: all.slice(found.headerRow + 1).map((cells, i) => ({ cells, location: `row ${found.headerRow + i + 2}` })),
    unassigned: [],
  };
}

/** Compares parsed rows with what is in the catalogue now. */
export function computeDiff(current, records, snapshot) {
  const changes = [];
  const seen = new Set();
  let unchanged = 0;
  for (const r of records) {
    if (r.status !== 'parsed') continue;
    seen.add(r.key);
    const after = snapshot(r.parsed);
    const before = current.get(r.key);
    if (!before) changes.push({ kind: 'new', key: r.key, after });
    else if (JSON.stringify(before) !== JSON.stringify(after)) {
      const fields = Object.keys(after).filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
      changes.push({ kind: 'changed', key: r.key, before, after, fields });
    } else unchanged += 1;
  }
  for (const [key, before] of current) if (!seen.has(key)) changes.push({ kind: 'removed', key, before });
  const count = (kind) => changes.filter((c) => c.kind === kind).length;
  return {
    changes,
    summary: {
      rows: records.length,
      parsed: records.filter((r) => r.status === 'parsed').length,
      failed: records.filter((r) => r.status === 'failed').length,
      skipped: records.filter((r) => r.status === 'skipped').length,
      withWarnings: records.filter((r) => r.status === 'parsed' && r.warnings.length).length,
      new: count('new'),
      changed: count('changed'),
      removed: count('removed'),
      unchanged,
      currentTotal: current.size,
    },
  };
}

/** The import the catalogue currently reflects for a source. */
async function latestCommitted(db, sourceId) {
  const [latest] = await db.query(
    `select source_file_id from import_diffs where source_id = $1 and status = 'committed' order by committed_at desc limit 1`,
    [sourceId],
  );
  return latest ?? null;
}

async function logSync(db, { sourceId, sourceFileId = null, job, status, message = null, stats = {} }) {
  await db.query(
    `insert into sync_logs (source_id, source_file_id, job, status, message, stats, finished_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, now())`,
    [sourceId, sourceFileId, job, status, message, JSON.stringify(stats)],
  );
}

/**
 * @param {object} db
 * @param {object} adapter
 * @param {{bytes:Buffer, fileName:string, url?:string|null, versionLabel?:string|null,
 *          effectiveFrom?:string|null, downloadedAt?:Date, overrides?:Record<string,string>, reread?:boolean}} file
 *        reread: read an already imported file again, after the reading rules changed. Only the newest
 *        imported file can be read again, and the result still waits for approval like any import.
 * @returns {Promise<{status:'staged'|'unchanged'|'already-pending', diffId:*, summary?:object, report?:string}>}
 */
export async function stageImport(db, adapter, file) {
  const { bytes, fileName, url = null, versionLabel = null, effectiveFrom = null, downloadedAt = new Date(), overrides = {}, reread = false } = file;
  const checksum = sha256(bytes);
  const sourceId = adapter.sourceId;

  try {
    const [pending] = await db.query(`select id, source_file_id from import_diffs where source_id = $1 and status = 'pending'`, [sourceId]);
    const [known] = await db.query('select id from source_files where source_id = $1 and checksum_sha256 = $2', [sourceId, checksum]);
    if (known) {
      const [diff] = await db.query(
        `select id, status from import_diffs where source_file_id = $1 and status in ('pending', 'approved', 'committed') order by id desc limit 1`,
        [known.id],
      );
      const imported = diff?.status === 'committed' || diff?.status === 'approved';
      if (imported && reread) {
        const latest = await latestCommitted(db, sourceId);
        if (String(latest?.source_file_id) !== String(known.id)) {
          throw new ImportError('This file cannot be read again: a newer list has been imported since, and this would bring back the older one.');
        }
      } else if (imported) {
        await db.query('update data_sources set last_checked_at = now() where id = $1', [sourceId]);
        await logSync(db, { sourceId, sourceFileId: known.id, job: 'diff', status: 'skipped', message: 'Same file as an earlier import (checksum match).' });
        return { status: 'unchanged', diffId: diff.id };
      }
      if (diff?.status === 'pending') return { status: 'already-pending', diffId: diff.id };
    }
    if (pending) {
      throw new ImportError(`Import #${pending.id} for this source is still waiting for review. Approve or reject it first.`);
    }

    const table = await readTable(bytes, adapter, overrides);
    const resolver = await loadResolver(db);
    const cellOf = (row) => (field) => (table.index[field] === undefined ? '' : (row.cells[table.index[field]] ?? '').trim());
    // An adapter may look at the whole file before its rows are read one by one.
    const ctx = { resolver, effectiveFrom, file: adapter.prepare?.(table.rows.map(cellOf)) ?? null };

    const records = [];
    const keys = new Set();
    for (const row of table.rows) {
      const cell = cellOf(row);
      const raw = Object.fromEntries(table.header.map((h, i) => [h || `column ${i + 1}`, row.cells[i] ?? '']));
      const r = adapter.parseRow(cell, ctx);
      const record = { key: r.key, status: r.status, parsed: r.parsed ?? null, errors: r.errors ?? [], warnings: r.warnings ?? [], raw, location: row.location };
      if (record.status === 'parsed' && keys.has(record.key)) {
        record.status = 'failed';
        record.errors.push(`duplicate ${adapter.keyLabel ?? 'key'} "${record.key}" in the file`);
      }
      if (record.status === 'parsed') keys.add(record.key);
      records.push(record);
    }
    if (!records.some((r) => r.status === 'parsed')) {
      throw new ImportError('No row in the file could be read. Check that this is the right file.', { format: table.format });
    }

    return await db.transaction(async (tx) => {
      const sourceFileId = known
        ? known.id
        : (
            await tx.query(
              `insert into source_files (source_id, url, file_name, storage_path, checksum_sha256, byte_size, content_type, version_label, downloaded_at)
               values ($1, $2, $3, 'db:source_file_blobs', $4, $5, $6, $7, $8) returning id`,
              [sourceId, url, fileName, checksum, bytes.length, table.format === 'pdf' ? 'application/pdf' : 'text/csv', versionLabel, downloadedAt],
            )
          )[0].id;
      // Rows of a file seen before are replaced by the new reading; each keeps its link to its product.
      const productOf = new Map();
      if (!known) await tx.query('insert into source_file_blobs (source_file_id, content) values ($1, $2)', [sourceFileId, bytes]);
      else {
        const old = await tx.query('delete from source_records where source_file_id = $1 returning record_key, product_id', [sourceFileId]);
        for (const r of old) if (r.product_id !== null) productOf.set(r.record_key, r.product_id);
      }

      for (const batch of batches(records)) {
        const payload = batch.map((r, i) => {
          const recordKey = r.status === 'parsed' ? r.key : `${r.key || 'no-key'}@${r.location}`;
          return {
            record_key: recordKey,
            raw: r.raw,
            parsed: r.parsed,
            parse_status: r.status,
            parse_errors: r.errors,
            warnings: r.warnings,
            location: r.location,
            product_id: productOf.get(recordKey) ?? null,
            n: i,
          };
        });
        await tx.query(
          `insert into source_records (source_id, source_file_id, record_key, raw, parsed, parse_status, parse_errors, warnings, location, product_id)
           select $1, $2, x.record_key, x.raw, x.parsed, x.parse_status, x.parse_errors, x.warnings, x.location, x.product_id
             from jsonb_to_recordset($3::jsonb) as x(record_key text, raw jsonb, parsed jsonb, parse_status text,
                                                       parse_errors jsonb, warnings jsonb, location text, product_id bigint, n int)
            order by x.n`,
          [sourceId, sourceFileId, JSON.stringify(payload)],
        );
      }

      const current = await adapter.loadCurrent(tx);
      const diff = computeDiff(current, records, adapter.snapshot);
      const previous = await latestCommitted(tx, sourceId);
      const report = buildReport({ reread: Boolean(known && reread), adapter, fileName, checksum, format: table.format, url, versionLabel, effectiveFrom, diff, records, unassigned: table.unassigned });
      const [created] = await tx.query(
        `insert into import_diffs (source_id, source_file_id, previous_source_file_id, status, summary, changes, report_md, file_format, effective_from)
         values ($1, $2, $3, 'pending', $4::jsonb, $5::jsonb, $6, $7, $8) returning id`,
        [sourceId, sourceFileId, previous?.source_file_id ?? null, JSON.stringify(diff.summary), JSON.stringify(diff.changes), report, table.format, effectiveFrom],
      );
      await tx.query('update data_sources set last_checked_at = now() where id = $1', [sourceId]);
      await logSync(tx, { sourceId, sourceFileId, job: 'parse', status: 'succeeded', stats: { rows: diff.summary.rows, failed: diff.summary.failed } });
      await logSync(tx, { sourceId, sourceFileId, job: 'diff', status: 'succeeded', stats: diff.summary });
      return { status: 'staged', diffId: created.id, summary: diff.summary, report };
    });
  } catch (error) {
    await logSync(db, { sourceId, job: 'parse', status: 'failed', message: error.message, stats: { file: fileName, checksum } }).catch(() => {});
    throw error;
  }
}

/** Records of a staged file, by key, for the adapter's commit step. */
async function stagedRecords(tx, sourceFileId) {
  const rows = await tx.query(
    `select id, record_key as key, parsed, warnings from source_records where source_file_id = $1 and parse_status = 'parsed'`,
    [sourceFileId],
  );
  return new Map(rows.map((r) => [r.key, r]));
}

/**
 * @param {{reviewedBy:string, note?:string, allowLargeRemoval?:boolean}} review
 */
export async function approveImport(db, adapters, diffId, review) {
  if (!review?.reviewedBy?.trim()) throw new ImportError('Say who approved the import (--by "Your name").');
  const result = await db.transaction(async (tx) => {
    const [diff] = await tx.query('select * from import_diffs where id = $1 for update', [diffId]);
    if (!diff) throw new ImportError(`Import #${diffId} does not exist.`);
    if (diff.status !== 'pending') throw new ImportError(`Import #${diffId} is ${diff.status}, not pending.`);
    const adapter = adapters[diff.source_id];
    if (!adapter) throw new ImportError(`No importer for source ${diff.source_id}.`);

    const latest = await latestCommitted(tx, diff.source_id);
    if (String(latest?.source_file_id ?? '') !== String(diff.previous_source_file_id ?? '')) {
      throw new ImportError(`Import #${diffId} was compared against data that has changed since. Reject it and run the import again.`);
    }

    const summary = diff.summary;
    const share = adapter.largeRemovalShare ?? 0.2;
    if (summary.removed > Math.max(20, summary.currentTotal * share) && !review.allowLargeRemoval) {
      throw new ImportError(
        `Import #${diffId} would deactivate ${summary.removed} of ${summary.currentTotal} products. ` +
          'If the file really is the complete list, approve again with --allow-large-removal.',
      );
    }

    const records = await stagedRecords(tx, diff.source_file_id);
    const stats = await adapter.commit(tx, {
      changes: diff.changes,
      records,
      sourceFileId: diff.source_file_id,
      effectiveFrom: diff.effective_from,
      resolver: await loadResolver(tx),
    });

    await tx.query(
      `update import_diffs set status = 'committed', reviewed_by = $2, review_note = $3, reviewed_at = now(), committed_at = now()
       where id = $1`,
      [diffId, review.reviewedBy.trim(), review.note ?? null],
    );
    await tx.query('update data_sources set last_checked_at = now(), last_success_at = now() where id = $1', [diff.source_id]);
    await logSync(tx, { sourceId: diff.source_id, sourceFileId: diff.source_file_id, job: 'commit', status: 'succeeded', stats });
    return { diffId, sourceId: diff.source_id, stats };
  });
  return result;
}

export async function rejectImport(db, diffId, { reviewedBy = null, note = null } = {}) {
  const rows = await db.query(
    `update import_diffs set status = 'rejected', reviewed_by = $2, review_note = $3, reviewed_at = now()
     where id = $1 and status = 'pending' returning source_id, source_file_id`,
    [diffId, reviewedBy, note],
  );
  if (!rows.length) throw new ImportError(`Import #${diffId} is not pending.`);
  await logSync(db, { sourceId: rows[0].source_id, sourceFileId: rows[0].source_file_id, job: 'commit', status: 'skipped', message: `Import #${diffId} rejected${note ? `: ${note}` : ''}` });
  return { diffId };
}

export async function listImports(db, { limit = 20 } = {}) {
  return db.query(
    `select d.id, d.source_id, d.status, d.summary, d.file_format, d.created_at, d.reviewed_by, d.committed_at, f.file_name
       from import_diffs d join source_files f on f.id = d.source_file_id
      order by d.id desc limit $1`,
    [limit],
  );
}

export async function getImport(db, diffId) {
  const [diff] = await db.query('select * from import_diffs where id = $1', [diffId]);
  return diff ?? null;
}
