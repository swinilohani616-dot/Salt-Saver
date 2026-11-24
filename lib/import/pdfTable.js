/**
 * Table extraction from text-based PDFs (PMBI product list exports, NPPA price
 * lists), using pdf.js (Apache-2.0).
 *
 * 1. Read every text item with its position.
 * 2. Group items into lines by their y position.
 * 3. Find the header line (one or two lines) whose cells name the required fields.
 * 4. Assign each item on later lines to the header column it overlaps most.
 * 5. Rows are anchored on lines that have the anchor field (e.g. the price);
 *    wrapped lines without one are attached to the nearest anchor line on the
 *    same page. Lines that cannot be attached are returned in `unassigned`, so
 *    they show up in the import report instead of being guessed into a row.
 *
 * Scanned PDFs (images, no text) return no lines; the importer reports that.
 */
import { mapColumns } from './columns.js';

const LINE_TOLERANCE = 2.5; // points: items closer than this vertically are on one line
const CHUNK_GAP = 4; // points: items closer than this horizontally form one cell

/** @returns {Promise<Array<{page:number, y:number, items:Array<{x:number, x2:number, text:string}>}>>} */
export async function extractPdfLines(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await task.promise;

  const lines = [];
  try {
    for (let p = 1; p <= doc.numPages; p += 1) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter((it) => typeof it.str === 'string' && it.str.trim())
        .map((it) => ({ x: it.transform[4], x2: it.transform[4] + (it.width || 0), y: it.transform[5], text: it.str }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines = [];
      for (const it of items) {
        const line = pageLines.find((l) => Math.abs(l.y - it.y) <= LINE_TOLERANCE);
        if (line) line.items.push(it);
        else pageLines.push({ page: p, y: it.y, items: [it] });
      }
      for (const line of pageLines) {
        line.raw = line.items.sort((a, b) => a.x - b.x); // single items, placed one by one in body rows
        line.items = chunk(line.raw); // joined cells, used to recognise the header
      }
      lines.push(...pageLines.sort((a, b) => b.y - a.y));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return lines;
}

/** Joins items that sit next to each other into one cell. */
function chunk(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && it.x - last.x2 < CHUNK_GAP) {
      last.text = `${last.text}${it.x - last.x2 > 0.5 && !last.text.endsWith(' ') ? ' ' : ''}${it.text}`.replace(/\s+/g, ' ');
      last.x2 = Math.max(last.x2, it.x2);
    } else out.push({ ...it, text: it.text.trim() });
  }
  return out;
}

/** Merges a two-line header ("MRP" over "(Rs.)") column by column. */
function mergeHeaderLines(a, b) {
  const cells = a.items.map((c) => ({ ...c }));
  for (const item of b.items) {
    const target = cells.find((c) => overlap(c, item) > 0);
    if (target) {
      target.text = `${target.text} ${item.text}`;
      target.x = Math.min(target.x, item.x);
      target.x2 = Math.max(target.x2, item.x2);
    } else cells.push({ ...item });
  }
  return cells.sort((x, y) => x.x - y.x);
}

const overlap = (a, b) => Math.min(a.x2, b.x2) - Math.max(a.x, b.x);
const center = (c) => (c.x + c.x2) / 2;

/**
 * Column for a text item: the column whose span (header cell widened to the midpoints
 * between neighbouring headers) contains the item's centre. A column with a value
 * pattern (e.g. serial numbers) only accepts matching text; anything else moves right.
 */
function columnFor(columns, patterns, item) {
  const c = center(item);
  let i = columns.findIndex((col, k) => {
    const left = k === 0 ? -Infinity : (columns[k - 1].x2 + col.x) / 2;
    const right = k === columns.length - 1 ? Infinity : (col.x2 + columns[k + 1].x) / 2;
    return c >= left && c < right;
  });
  if (i < 0) i = 0;
  while (patterns[i] && !patterns[i].test(item.text.trim()) && i < columns.length - 1) i += 1;
  return i;
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * @param {Uint8Array|Buffer} bytes
 * @param {Record<string, {required:boolean, synonyms:string[]}>} fields
 * @param {{anchors:string[], overrides?:Record<string,string>}} options
 * @returns {Promise<{ok:boolean, error?:string, header?:string[], index?:Record<string,number>,
 *                    rows:Array<{cells:string[], page:number, line:number}>, unassigned:Array<{page:number, text:string}>, pages:number}>}
 */
export async function extractPdfTable(bytes, fields, { anchors, overrides = {} }) {
  const lines = await extractPdfLines(bytes);
  if (lines.length === 0) {
    return { ok: false, error: 'The PDF has no text layer (it may be a scanned image). Use the CSV download instead.', rows: [], unassigned: [], pages: 0 };
  }

  let header = null;
  for (let i = 0; i < lines.length && !header; i += 1) {
    const single = mapColumns(lines[i].items.map((c) => c.text), fields, overrides);
    if (single.ok) {
      header = { at: i, span: 1, cells: lines[i].items, index: single.index };
      break;
    }
    const next = lines[i + 1];
    if (next && mapColumns(next.items.map((c) => c.text), fields, overrides).ok) continue; // the next line is the header on its own
    if (next && next.page === lines[i].page && lines[i].y - next.y <= 14) {
      const merged = mergeHeaderLines(lines[i], next);
      const two = mapColumns(merged.map((c) => c.text), fields, overrides);
      if (two.ok) header = { at: i, span: 2, cells: merged, index: two.index };
    }
  }
  if (!header) {
    return { ok: false, error: 'Could not find a header row naming the required columns.', rows: [], unassigned: [], pages: lines.at(-1).page };
  }

  const columns = header.cells;
  const headerTexts = columns.map((c) => c.text);
  const headerLower = headerTexts.map((t) => t.toLowerCase());
  const anchorCols = anchors.map((f) => header.index[f]).filter((i) => i !== undefined);
  const patterns = columns.map((_, i) => {
    const field = Object.keys(header.index).find((f) => header.index[f] === i);
    return field ? fields[field].pattern ?? null : null;
  });

  // Split body lines into cells; drop repeated header lines on later pages.
  const body = [];
  lines.slice(header.at + header.span).forEach((line, n) => {
    // Items are placed one by one, so text that touches the next column cannot drag it along.
    const place = (usePatterns) => {
      const cells = columns.map(() => []);
      for (const item of line.raw) cells[columnFor(columns, usePatterns ? patterns : [], item)].push(item);
      return cells.map((c) => chunk(c).map((x) => x.text).join(' ').trim());
    };
    // Header and column-number lines are recognised by plain position, before value patterns move text.
    const plain = place(false);
    const texts = place(true);
    const filled = plain.map((t, i) => [t, i]).filter(([t]) => t);
    // A header repeated on a later page (possibly split over two lines), or the "(1) (2) (3)" column-number line.
    const isHeaderPart = filled.length > 0 && filled.every(([t, i]) => headerLower[i].includes(t.toLowerCase()));
    const isColumnNumbers = filled.length >= 2 && filled.every(([t]) => /^\(\d{1,2}\)$/.test(t));
    if (!isHeaderPart && !isColumnNumbers) body.push({ page: line.page, y: line.y, texts, line: n + 1, anchored: anchorCols.every((i) => texts[i]) });
  });

  // Typical distance between consecutive lines, used to decide what "near" means.
  const gaps = [];
  for (let i = 1; i < body.length; i += 1) if (body[i].page === body[i - 1].page) gaps.push(body[i - 1].y - body[i].y);
  const maxAttach = Math.max(6, median(gaps) * 1.6);

  const rows = body.filter((l) => l.anchored).map((l) => ({ page: l.page, line: l.line, y: l.y, parts: [l] }));
  const unassigned = [];
  for (const l of body.filter((x) => !x.anchored)) {
    // Nearest anchor line on the same page; on a near-tie the row above wins (wrapped text runs downwards).
    let above = null;
    let below = null;
    for (const r of rows) {
      if (r.page !== l.page) continue;
      const d = Math.abs(r.y - l.y);
      if (d > maxAttach) continue;
      if (r.y > l.y && (!above || d < above.d)) above = { r, d };
      if (r.y < l.y && (!below || d < below.d)) below = { r, d };
    }
    const best = above && (!below || above.d <= below.d + 2) ? above : below;
    if (best) best.r.parts.push(l);
    else unassigned.push({ page: l.page, text: l.texts.filter(Boolean).join(' | ') });
  }

  return {
    ok: true,
    header: headerTexts,
    index: header.index,
    rows: rows.map((r) => ({
      page: r.page,
      line: r.line,
      cells: columns.map((_, i) => r.parts.sort((a, b) => b.y - a.y).map((p) => p.texts[i]).filter(Boolean).join(' ').trim()),
    })),
    unassigned,
    pages: lines.at(-1).page,
  };
}
