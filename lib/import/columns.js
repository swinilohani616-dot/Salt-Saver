/**
 * Maps a file's header row to the fields an importer needs.
 *
 * Each field lists the header names it accepts. If a required field is not
 * found, the import stops and prints the headers it saw, so the column can be
 * named on the command line (--map field="Header in file") instead of guessed.
 */

export const headerKey = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * @param {string[]} header
 * @param {Record<string, {required:boolean, synonyms:string[]}>} fields
 * @param {Record<string, string>} [overrides] field -> exact header text
 * @returns {{ok:true, index:Record<string, number>} | {ok:false, missing:string[], header:string[]}}
 */
export function mapColumns(header, fields, overrides = {}) {
  const keys = header.map(headerKey);
  const index = {};
  const used = new Set();
  for (const [field, spec] of Object.entries(fields)) {
    const wanted = overrides[field] ? [overrides[field]] : spec.synonyms;
    const i = wanted.map(headerKey).map((k) => keys.findIndex((h, j) => h === k && !used.has(j))).find((j) => j >= 0);
    if (i !== undefined) {
      index[field] = i;
      used.add(i);
    }
  }
  const missing = Object.entries(fields)
    .filter(([field, spec]) => spec.required && index[field] === undefined)
    .map(([field]) => field);
  return missing.length ? { ok: false, missing, header } : { ok: true, index };
}

/**
 * Finds the header row: the first of the first 15 rows that maps every required field.
 * Lists often start with a title line ("Product List as on ...").
 */
export function findHeader(rows, fields, overrides) {
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const mapped = mapColumns(rows[i], fields, overrides);
    if (mapped.ok) return { ok: true, headerRow: i, index: mapped.index, header: rows[i] };
  }
  const best = rows.slice(0, 15).find((r) => r.filter(Boolean).length >= 2) ?? rows[0] ?? [];
  return { ok: false, missing: mapColumns(best, fields, overrides).missing ?? [], header: best };
}

/** Parses "--map drugCode=Drug Code --map mrp=MRP (Rs)" style overrides. */
export function parseMapArgs(values = []) {
  const out = {};
  for (const v of values) {
    const eq = v.indexOf('=');
    if (eq > 0) out[v.slice(0, eq).trim()] = v.slice(eq + 1).trim();
  }
  return out;
}
