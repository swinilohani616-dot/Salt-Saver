/**
 * RFC 4180 CSV reader: quoted fields, "" escapes, commas and newlines inside
 * quotes, CRLF or LF line ends, and a UTF-8 byte order mark.
 */

/**
 * @param {string|Buffer} input
 * @returns {string[][]} rows of cells (blank lines removed)
 */
export function parseCsv(input) {
  let text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV ends inside a quoted field; the file may be cut off.');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''));
}
