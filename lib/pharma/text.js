/**
 * Text clean-up for medicine names, compositions and pack labels.
 * Indian labels write the same thing many ways ("S.R.", "SR", "Sustained-Release";
 * "1,000 mg"; "µg"), so everything is reduced to one lowercase form first.
 */

/**
 * "Metformin HCl S.R. Tablets I.P. 1,000 mg" -> "metformin hcl sr tablets ip 1000 mg"
 * Keeps digits, letters, "+", "%", "/" and decimal points; everything else becomes a space.
 * @param {unknown} value
 */
export function prepText(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/[µμ]/g, 'mc') // µg -> mcg
    .replace(/\b([a-z])\.\s?([a-z])\.\s?([a-z])\.?(?![a-z])/g, '$1$2$3') // u.s.p. -> usp
    .replace(/\b([a-z])\.\s?([a-z])\.?(?![a-z])/g, '$1$2') // s.r. -> sr, i.p. -> ip
    .replace(/\b(\d)-(?=[a-z])/g, '$1') // 5-fluorouracil -> 5fluorouracil (the number is part of the name)
    .replace(/&/g, ' and ')
    // Digit grouping: 1,000 and Indian 6,00,000 -> 1000, 600000. Any other comma inside a number
    // ("0,25") is ambiguous, so it is made unreadable as a strength rather than guessed.
    .replace(/(?<![\d.,])\d+(?:,\d+)+(?![\d,])/g, (m) =>
      /^\d{1,3}(,\d{3})+$/.test(m) || /^\d{1,2}(,\d{2})*,\d{3}$/.test(m) ? m.replace(/,/g, '') : m.replace(/,/g, 'c'))
    .replace(/(\d+(?:\.\d+)?)\s*(?:lacs?|lakhs?)\b/g, (_, n) => String(Math.round(Number(n) * 100000))) // 12 lac -> 1200000
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ') // dots that are not decimal points
    .replace(/[^a-z0-9+%/.\s]/g, ' ')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Name key used for lookups: prepText without "+", "%" or "/". */
export function nameKey(value) {
  return prepText(value)
    .replace(/[+%/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Escapes a string for use inside a RegExp. */
export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
