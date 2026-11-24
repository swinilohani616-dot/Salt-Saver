/**
 * Markdown review report for a staged import. Read it before approving.
 */
const LIMIT = 300;

const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const show = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function table(headers, rows) {
  if (!rows.length) return '_None._\n';
  const shown = rows.slice(0, LIMIT);
  const out = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...shown.map((r) => `| ${r.map(esc).join(' | ')} |`)];
  if (rows.length > LIMIT) out.push(`\n_…and ${rows.length - LIMIT} more (full list in the import_diffs.changes column)._`);
  return `${out.join('\n')}\n`;
}

export function buildReport({ reread = false, adapter, fileName, checksum, format, url, versionLabel, effectiveFrom, diff, records, unassigned = [] }) {
  const s = diff.summary;
  const changes = diff.changes;
  const columns = adapter.reportColumns;
  const lines = [];

  lines.push(`# Import review: ${adapter.label}`, '');
  lines.push(`- File: \`${fileName}\` (${format.toUpperCase()}, sha256 \`${checksum.slice(0, 16)}…\`)`);
  if (reread) lines.push('- Read again: this is the same file as an earlier import. Any change below comes from the reading rules, not from the list.');
  if (url) lines.push(`- Downloaded from: ${url}`);
  if (versionLabel) lines.push(`- Version: ${versionLabel}`);
  if (effectiveFrom) lines.push(`- Prices effective from: ${effectiveFrom}`);
  lines.push('', '## Summary', '');
  lines.push(`| Rows in file | Read | Failed | Skipped | With warnings | New | Changed | Removed | Unchanged |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
  lines.push(`| ${s.rows} | ${s.parsed} | ${s.failed} | ${s.skipped} | ${s.withWarnings} | ${s.new} | ${s.changed} | ${s.removed} | ${s.unchanged} |`, '');

  const warnings = [];
  if (s.currentTotal > 0 && s.removed > Math.max(20, s.currentTotal * (adapter.largeRemovalShare ?? 0.2))) {
    warnings.push(`**${s.removed} of ${s.currentTotal} current products would be deactivated.** Check that this is the complete list, not a search result.`);
  }
  if (s.failed > s.rows * 0.05) warnings.push(`More than 5% of rows could not be read (${s.failed}). Check the column mapping below.`);
  if (unassigned.length) warnings.push(`${unassigned.length} PDF line(s) could not be placed in a row; they are listed at the end.`);
  if (warnings.length) lines.push('## Check before approving', '', ...warnings.map((w) => `- ${w}`), '');

  lines.push(`## New (${s.new})`, '');
  lines.push(table(['Key', ...columns.map((c) => c.label)], changes.filter((c) => c.kind === 'new').map((c) => [c.key, ...columns.map((col) => show(c.after[col.field]))])));

  lines.push(`## Changed (${s.changed})`, '');
  lines.push(
    table(
      ['Key', 'Field', 'Before', 'After'],
      changes.filter((c) => c.kind === 'changed').flatMap((c) => c.fields.map((f) => [c.key, f, show(c.before[f]), show(c.after[f])])),
    ),
  );

  lines.push(`## Removed from the list (${s.removed})`, '', 'These will be marked inactive (kept for history, no longer shown).', '');
  lines.push(table(['Key', ...columns.map((c) => c.label)], changes.filter((c) => c.kind === 'removed').map((c) => [c.key, ...columns.map((col) => show(c.before[col.field]))])));

  const failed = records.filter((r) => r.status !== 'parsed');
  lines.push(`## Rows that could not be read (${failed.length})`, '', 'These are not imported. Nothing was guessed.', '');
  lines.push(table(['Where', 'Key', 'Problem', 'Row'], failed.map((r) => [r.location, r.key || '—', [...r.errors, ...r.warnings].join('; '), Object.values(r.raw).filter(Boolean).join(' · ')])));

  const warned = records.filter((r) => r.status === 'parsed' && r.warnings.length);
  lines.push(`## Imported with warnings (${warned.length})`, '', 'These are imported, but the matching engine will treat what is missing as unknown.', '');
  lines.push(table(['Key', 'Name', 'Warning'], warned.map((r) => [r.key, r.parsed?.name ?? '', r.warnings.join('; ')])));

  const unknown = new Map();
  for (const r of records) for (const i of r.parsed?.composition?.ingredients ?? []) if (!i.known) unknown.set(i.key, (unknown.get(i.key) ?? 0) + 1);
  if (unknown.size) {
    lines.push(`## Ingredients not in the alias list (${unknown.size})`, '', 'Add them to db/reference/ingredients.js if they are other names for a listed ingredient.', '');
    lines.push(table(['Ingredient', 'Rows'], [...unknown].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, n])));
  }

  if (unassigned.length) {
    lines.push('## PDF lines not placed in any row', '');
    lines.push(table(['Page', 'Text'], unassigned.map((u) => [u.page, u.text])));
  }

  lines.push('---', '', `Approve: \`npm run import:approve -- <id> --by "Your name"\` · Reject: \`npm run import:reject -- <id>\``);
  return lines.join('\n');
}
