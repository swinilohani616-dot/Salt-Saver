/**
 * Composition parser for Indian product names and composition strings.
 *
 * Handles both ways Indian lists write combinations:
 *   inline:   "Glimepiride 1mg + Metformin Hydrochloride (SR) 500mg Tablets"
 *   trailing: "Amoxycillin and Potassium Clavulanate Tablets IP 500 mg + 125 mg"
 * and "X eq. to Y" salt statements:
 *   "Potassium Clavulanate Diluted IP eq. to Clavulanic Acid 125 mg"
 *
 * Anything it cannot read with confidence is returned in `errors`; it never guesses
 * which strength belongs to which ingredient.
 */
import { prepText } from './text.js';
import { findStrengths, formatStrength, canonicalStrength } from './strength.js';
import { detectDosageForm, detectReleaseType, detectPharmacopoeia, detectRoute, NOISE_WORDS } from './forms.js';

// NOISE_WORDS are regex fragments ("tablets?", "nebuli[sz]er"); spaces match any whitespace.
const NOISE_RE = new RegExp(`\\b(?:${NOISE_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'g');
const EQUIVALENT_RE = /\b(?:eq|eqv|equiv|equivalent|equivalent to|eq to)\b(?:\s+to\b)?/;
const SEPARATOR_RE = /\s*(?:\+|,|\band\b)\s*/;
const CONTAINER_AFTER = /^\s*(?:sachets?|bottles?|tubes?|pouch|strips?)\b/;
/** Pack counts inside a name: "(3 Tablets)", "(200 MDI)", "10 x 10", "(2 ml Ampoule)". */
const PACK_COUNT_RE = /\b\d+(?:\.\d+)?\s*(?:x\s*\d+(?:\.\d+)?\s*)?(?:ml\s+)?(?:tablets?|tabs?|capsules?|caps?|rotacaps?|vials?|ampoules?|ampules?|amps?|sachets?|strips?|metered doses?|doses?|mdi|md|respules?|bottles?)\b|\b\d+\s*x\s*\d+\b/g;
/** A ratio that is part of a name, e.g. biphasic insulin "30/70" (not followed by a unit). */
const RATIO_RE = /(?<![\d.])(\d{1,3})\s*\/\s*(\d{1,3})(?![\d.])(?!\s*(?:mg|mcg|ug|g|gm|ml|iu|units?|%|dose)\b)/g;
/** "Each 5 ml contains ...": a volume that applies to every strength that follows. */
const EACH_RE = /\beach\s+(\d+(?:\.\d+)?)\s*(ml|g|gm)\b\s*(?:contains?|containing)?/;
/** Unit words or bare numbers left in a name mean the text was not understood. */
const LEFTOVER_RE = /\b(?:mg|mcg|ml|gm|g|iu|units?)\b|(?<![a-z\d])\d+(?:\.\d+)?(?![a-z\d])/;
const TOKEN = (i) => ` \u0001${i}\u0001 `;
const TOKEN_RE = /\u0001(\d+)\u0001/g;

function cleanName(s) {
  return s
    .replace(/[+,/%]/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits "a and b + c" into names; returns [] for blank text. */
function splitNames(text) {
  return text
    .split(SEPARATOR_RE)
    .map(cleanName)
    .filter(Boolean);
}

/**
 * "potassium clavulanate diluted eq to clavulanic acid" -> {name:'clavulanic acid', saltSource:'potassium clavulanate diluted'}
 */
function splitEquivalent(text) {
  const m = EQUIVALENT_RE.exec(text);
  if (!m) return { name: text, saltSource: null };
  return { name: text.slice(m.index + m[0].length).trim(), saltSource: text.slice(0, m.index).trim() || null };
}

/**
 * @param {string} raw composition or product name
 * @param {{resolve:(name:string)=>{key:string,name:string,saltForm:string|null,known:boolean}|null}} resolver
 * @returns {{ok:boolean, errors:string[], warnings:string[], ingredients:object[], dosageForm:string|null,
 *            route:string|null, releaseType:string|null, pharmacopoeia:string|null, compositionKey:string|null}}
 */
export function parseComposition(raw, resolver) {
  const errors = [];
  const warnings = [];
  const base = prepText(raw); // forms, release and route are read before pack counts are removed
  let prepped = base
    .replace(RATIO_RE, 'ratio$1to$2') // keep "30/70" as part of the name
    .replace(PACK_COUNT_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const each = EACH_RE.exec(prepped);
  if (each) prepped = prepped.replace(EACH_RE, ' ').replace(/\s+/g, ' ').trim();
  const result = { ok: false, errors, warnings, ingredients: [], dosageForm: null, route: null, releaseType: null, pharmacopoeia: null, compositionKey: null };
  if (!prepped) {
    errors.push('composition is empty');
    return result;
  }

  const form = detectDosageForm(base);
  result.dosageForm = form.code;
  const route = detectRoute(base, form.code);
  result.route = route.route;
  if (route.conflict) warnings.push('more than one route is named (e.g. eye and ear); the route is treated as unknown');
  if (!form.code) warnings.push(form.ambiguous ? 'type of drops (eye, ear or oral) is not stated' : 'dosage form is not stated');

  const release = detectReleaseType(base, form.code);
  result.releaseType = release.code;
  if (release.conflict) errors.push(`more than one release type is named (${release.markers.join(', ')})`);
  if (release.unread) warnings.push('the release wording could not be read; the release type is treated as unknown');
  result.pharmacopoeia = detectPharmacopoeia(base);

  // Replace strengths with placeholders, then drop form / release / suffix words.
  // "60000 IU (1 gm sachet)": a weight followed by a container word is pack information, not a strength.
  const strengths = [];
  let text = '';
  const all = findStrengths(prepped);
  // "200 mg + 28.5 mg/5 ml": a "per" written once at the end applies to every strength in the list.
  const lastPer = all.length > 1 && all[all.length - 1].perUnit && all.slice(0, -1).every((s) => !s.perUnit) ? all[all.length - 1] : null;
  if (lastPer) for (const s of all.slice(0, -1)) Object.assign(s, { perValue: lastPer.perValue, perUnit: lastPer.perUnit });
  if (each) {
    const perUnit = each[2] === 'ml' ? 'ml' : 'g';
    for (const s of all) {
      if (s.perUnit) errors.push(`"each ${each[1]} ${each[2]}" and "${s.text}" both give a volume`);
      else Object.assign(s, { perValue: Number(each[1]), perUnit });
    }
  }
  let cursor = 0;
  for (const s of all) {
    const isPackInfo = CONTAINER_AFTER.test(prepped.slice(s.index + s.length));
    text += prepped.slice(cursor, s.index) + (isPackInfo ? ' ' : TOKEN(strengths.length));
    if (!isPackInfo) strengths.push(s);
    cursor = s.index + s.length;
  }
  text += prepped.slice(cursor);
  text = text.replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim();

  // Group the text into [names, strengths] runs.
  const groups = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const before = text.slice(last, m.index);
    if (cleanName(before) || groups.length === 0) groups.push({ text: before.trim(), strengths: [] });
    groups[groups.length - 1].strengths.push(strengths[Number(m[1])]);
    last = m.index + m[0].length;
  }
  const tail = text.slice(last).trim();
  if (cleanName(tail)) groups.push({ text: tail, strengths: [] });

  /** @type {Array<{name:string, saltSource:string|null, strength:object|null, equivalent?:object}>} */
  const parts = [];
  if (strengths.length === 0) {
    for (const name of splitNames(text)) parts.push({ ...splitEquivalent(name), strength: null });
    if (parts.length) warnings.push('no strength is given');
  } else {
    for (const [i, g] of groups.entries()) {
      const names = splitNames(g.text);
      const eq = splitEquivalent(g.text);
      if (eq.saltSource === null && EQUIVALENT_RE.test(g.text) && parts.length && g.strengths.length === 1) {
        // "... 1250 mg eq. to elemental calcium 500 mg": an equivalence for the previous ingredient.
        const prev = parts[parts.length - 1];
        prev.equivalent = { name: cleanName(eq.name), strength: g.strengths[0] };
        continue;
      }
      if (g.strengths.length === 0) {
        if (i === groups.length - 1 && parts.length) errors.push(`text after the last strength could not be read: "${cleanName(g.text)}"`);
        else errors.push(`no strength for "${cleanName(g.text)}"`);
        continue;
      }
      if (eq.saltSource !== null && g.strengths.length === 1) {
        parts.push({ name: cleanName(eq.name), saltSource: cleanName(eq.saltSource), strength: g.strengths[0] });
        continue;
      }
      if (names.length === g.strengths.length) {
        names.forEach((name, k) => parts.push({ ...splitEquivalent(name), strength: g.strengths[k] }));
      } else if (names.length === 0) {
        errors.push('a strength is given without an ingredient name');
      } else {
        errors.push(`${names.length} ingredient name(s) but ${g.strengths.length} strength(s) in "${cleanName(g.text)}"`);
      }
    }
  }

  if (parts.length === 0 && errors.length === 0) errors.push('no ingredient could be read');

  const seen = new Set();
  for (const part of parts) {
    if (!part.name) {
      errors.push('an ingredient name is missing');
      continue;
    }
    if (LEFTOVER_RE.test(part.name) || (part.saltSource && LEFTOVER_RE.test(part.saltSource))) {
      errors.push(`could not read "${part.saltSource ? `${part.saltSource} eq to ` : ''}${part.name}"`);
      continue;
    }
    let resolved = resolver.resolve(part.name);
    if (!resolved) {
      errors.push(`ingredient "${part.name}" could not be read`);
      continue;
    }
    let saltForm = resolved.saltForm;
    if (part.saltSource) {
      const fromSalt = resolver.resolve(part.saltSource);
      if (fromSalt && fromSalt.key === resolved.key && fromSalt.saltForm) saltForm = fromSalt.saltForm;
      else if (fromSalt && fromSalt.key !== resolved.key) {
        // "Ferrous Ascorbate eq. to elemental Iron 100 mg": the ingredient is the compound; the
        // stated amount is its equivalent. Different compounds must never look the same.
        part.equivalent = { name: part.name, strength: part.strength };
        part.strength = null;
        part.name = part.saltSource;
        resolved = fromSalt;
        saltForm = fromSalt.saltForm;
      }
    }
    if (seen.has(resolved.key)) {
      errors.push(`ingredient "${resolved.name}" appears twice`);
      continue;
    }
    seen.add(resolved.key);
    const ingredient = {
      key: resolved.key,
      name: resolved.name,
      saltForm: saltForm || null,
      strength: part.strength ? pick(part.strength) : null,
      known: resolved.known,
      sourceText: part.name,
    };
    if (part.equivalent) {
      const eqResolved = resolver.resolve(part.equivalent.name);
      if (eqResolved && part.equivalent.strength) ingredient.equivalent = { key: eqResolved.key, name: eqResolved.name, strength: pick(part.equivalent.strength) };
    }
    result.ingredients.push(ingredient);
  }

  result.ok = errors.length === 0 && result.ingredients.length > 0;
  if (result.ok) result.compositionKey = compositionKey(result.ingredients);
  return result;
}

function pick({ value, unit, perValue, perUnit }) {
  return { value, unit, perValue, perUnit };
}

const strengthKey = (strength) => {
  const c = canonicalStrength(strength);
  const unit = c.unit.startsWith('%') ? '%' : c.unit;
  return `${c.amount} ${unit}${c.per ? `/${c.per}` : ''}`;
};

/**
 * Order-independent key with canonical strengths (mg, per 1 ml):
 * "amoxycillin 500 mg + clavulanic acid 125 mg", "cefixime 10 mg/ml". Null if a strength is missing.
 * Percentages are keyed as plain "%" so "1% w/w" and "1%" find each other; dosage form tells them apart.
 */
export function compositionKey(ingredients) {
  if (!ingredients.length || ingredients.some((i) => !i.strength && !i.equivalent?.strength)) return null;
  return ingredients
    .map((i) => (i.strength ? `${i.key} ${strengthKey(i.strength)}` : `${i.key} eq ${i.equivalent.key} ${strengthKey(i.equivalent.strength)}`))
    .sort()
    .join(' + ');
}

/** "Amoxycillin 500 mg + Clavulanic Acid 125 mg" */
export function formatComposition(ingredients) {
  return ingredients.map((i) => (i.strength ? `${i.name} ${formatStrength(i.strength)}` : i.name)).join(' + ');
}
