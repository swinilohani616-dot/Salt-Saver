/**
 * Dosage form, release type and pharmacopoeia detection from prepped text
 * (see text.js). Codes match the dosage_forms / release_types tables.
 */

/** Ordered: the first match wins, so specific forms come before general ones. */
const FORM_RULES = [
  ['dry_syrup', /\b(dry syrup|powder for oral suspension|for oral suspension|granules for oral suspension)\b/],
  ['inhalation_capsule', /\b(rotacaps?|inhalation capsules?|capsules? for inhalation)\b/],
  ['respules', /\b(respules?|nebuli[sz](er|ing) solution|respirator solution|respiratory solution|for use in nebuli[sz]ers?|inhalation solution)\b/],
  ['dry_powder_inhaler', /\b(dry powder inhaler|dpi|inhalation powder)\b/],
  ['inhaler', /\b(inhaler|metered dose inhaler|mdi|inhalation aerosol|aerosol inhalation)\b/],
  ['nasal_spray', /\bnasal sprays?\b/],
  ['injection_vial', /\b(injection|inj|infusion)\b.*\bvials?\b|\bvials?\b.*\b(injection|inj|infusion)\b|\bvial and wfi\b/],
  ['injection_ampoule', /\b(injection|inj)\b.*\b(ampoules?|ampules?|amps?)\b|\b(ampoules?|ampules?)\b.*\b(injection|inj)\b/],
  ['injection', /\b(injection|inj|infusion)\b/],
  ['eye_drops', /\b(eye drops?|ophthalmic (solution|drops|suspension)|eye ?\/ ?ear drops?)\b/],
  ['ear_drops', /\b(ear drops?|otic (solution|drops))\b/],
  ['oral_drops', /\b(oral drops?|paediatric drops?|pediatric drops?)\b/],
  ['suspension', /\b(oral suspension|suspension)\b/],
  ['syrup', /\b(syrup|linctus)\b/],
  ['oral_solution', /\b(oral solution|solution for oral use)\b/],
  ['oral_liquid', /\boral liquid\b/],
  ['suppository', /\bsuppositor(y|ies)\b/],
  ['pessary', /\b(pessar(y|ies)|vaginal tablets?)\b/],
  ['enema', /\benema\b/],
  ['granules', /\b(granules|sachets?)\b/],
  ['dispersible_tablet', /\b(dispersible tablets?|dt)\b/],
  ['mouth_dissolving_tablet', /\b(mouth dissolving tablets?|orally disintegrating tablets?|odt|md)\b/],
  ['chewable_tablet', /\bchewable tablets?\b/],
  ['tablet', /\b(tablets?|tabs?)\b/],
  ['capsule', /\b(capsules?|caps?|softgels?)\b/],
  ['cream', /\bcream\b/],
  ['ointment', /\b(ointment|oint)\b/],
  ['gel', /\bgel\b/],
  ['lotion', /\blotion\b/],
];

/** Plain "drops" without eye/ear/oral is ambiguous and is reported, not guessed. */
const AMBIGUOUS_DROPS = /\bdrops?\b/;

const ROUTE_BY_FORM = {
  tablet: 'oral', dispersible_tablet: 'oral', mouth_dissolving_tablet: 'oral', chewable_tablet: 'oral', capsule: 'oral',
  syrup: 'oral', suspension: 'oral', dry_syrup: 'oral', oral_solution: 'oral', oral_drops: 'oral',
  injection: 'parenteral', injection_vial: 'parenteral', injection_ampoule: 'parenteral',
  granules: 'oral', oral_liquid: 'oral', suppository: 'rectal', enema: 'rectal', pessary: 'vaginal',
  dry_powder_inhaler: 'inhalation', nasal_spray: 'nasal',
  cream: 'topical', ointment: 'topical', gel: 'topical', lotion: 'topical',
  eye_drops: 'ophthalmic', ear_drops: 'otic',
  inhaler: 'inhalation', inhalation_capsule: 'inhalation', respules: 'inhalation',
};

/** Release type markers. "Film coated" is a coating, not a release type. "Relase" is a spelling used in the PMBI list. */
const RELEASE_RULES = [
  ['sr', /\b(sustained rele?ase|sr)\b/],
  ['er', /\b(extended rele?ase|er)\b/],
  ['xr', /\bxr\b/],
  ['xl', /\bxl\b/],
  ['mr', /\b(modified rele?ase|mr)\b/],
  ['cr', /\b(controlled rele?ase|cr)\b/],
  ['pr', /\b(prolonged rele?ase|pr)\b/],
  ['dr', /\b(delayed rele?ase|gastro ?resistan(?:t|ce)|enteric coated|ec|dr)\b/],
];

/** Wording that says the release is modified without a marker above being readable (a misspelling, "long acting"). */
const RELEASE_WORDING = /\b(rele?ase|long acting|retard|depot|sustained|extended|prolonged|controlled|delayed|enteric|gastro ?resist[a-z]*)\b/;

/** Forms where "no marker" means immediate release. */
const SOLID_ORAL = new Set(['tablet', 'dispersible_tablet', 'mouth_dissolving_tablet', 'chewable_tablet', 'capsule']);

const PHARMACOPOEIA = /\b(ip|bp|usp|ph eur)\b/;

/** Words removed before reading ingredient names (forms, release markers, suffixes, packaging). */
export const NOISE_WORDS = [
  'oral(?:ly)? disintegrating strips?', // before "oral", so the whole phrase goes; the form stays unknown
  'dry syrup', 'powder for oral suspension', 'for oral suspension', 'granules for oral suspension',
  'oral suspension', 'suspension', 'syrup', 'linctus', 'oral solution', 'solution for oral use', 'solution',
  'rotacaps?', 'inhalation capsules?', 'capsules? for inhalation', 'respules?', 'nebuli[sz]er', 'nebuli[sz]ing',
  'respirator', 'inhalation', 'inhaler', 'metered dose', 'mdi', 'aerosol',
  'injections?', 'inj', 'infusion', 'vials?', 'ampoules?', 'ampules?', 'amps?', 'water for injection', 'wfi',
  'eye', 'ear', 'oral', 'drops?', 'ophthalmic', 'otic', 'paediatric', 'pediatric',
  'dispersible', 'mouth dissolving', 'orally disintegrating', 'chewable', 'odt', 'dt', 'md',
  'film coated', 'sugar coated', 'uncoated', 'coated', 'tablets?', 'tabs?', 'capsules?', 'caps?', 'softgels?',
  'soft gelatin', 'hard gelatin', 'gelatin', 'cream', 'ointment', 'oint', 'gel', 'lotion',
  'sustained rele?ase', 'extended rele?ase', 'modified rele?ase', 'controlled rele?ase', 'prolonged rele?ase',
  'delayed rele?ase', 'gastro ?resistan(?:t|ce)', 'enteric coated', 'rele?ase',
  'sr', 'er', 'xr', 'xl', 'mr', 'cr', 'pr', 'dr', 'ec',
  'ip', 'bp', 'usp', 'ph eur', 'each', 'contains', 'containing', 'strip', 'bottle', 'pack', 'tube', 'of', 'the', 'with',
  'plain', 'diluted', 'for', 'granules', 'sachets?', 'pouch', 'oral liquid', 'liquid', 'powder', 'effervescent',
  'suppositor(?:y|ies)', 'retention', 'enema', 'concentrate', 'dilution', 'reconstitution',
  'pessar(?:y|ies)', 'vaginal', 'nasal', 'sprays?', 'dry powder', 'dpi', 'respiratory', 'use in', 'nebuli[sz]ers?', 'as per'
];

export function detectDosageForm(prepped) {
  for (const [code, re] of FORM_RULES) if (re.test(prepped)) return { code, ambiguous: false };
  return { code: null, ambiguous: AMBIGUOUS_DROPS.test(prepped) };
}

export const routeForForm = (code) => ROUTE_BY_FORM[code] ?? null;

/** Words that state the route outright; they override the form's usual route ("eye ointment"). */
const ROUTE_WORDS = [
  ['ophthalmic', /\b(eye|eyes|ophthalmic|ocular)\b/],
  ['otic', /\b(ear|otic|aural)\b/],
  ['vaginal', /\b(vaginal|pessar(y|ies))\b/],
  ['rectal', /\b(rectal|suppositor(y|ies)|enema)\b/],
  ['nasal', /\b(nasal|intranasal)\b/],
  ['inhalation', /\b(inhalation|inhaler|respules?|nebuli[sz](er|ing)|rotacaps?)\b/],
];

/**
 * Route of administration: stated words win over the dosage form's usual route.
 * Two different stated routes (e.g. "eye/ear drops") give null and conflict = true.
 * @returns {{route:string|null, conflict:boolean}}
 */
export function detectRoute(prepped, formCode) {
  const stated = [...new Set(ROUTE_WORDS.filter(([, re]) => re.test(prepped)).map(([r]) => r))];
  if (stated.length > 1) return { route: null, conflict: true };
  return { route: stated[0] ?? routeForForm(formCode), conflict: false };
}

/**
 * @returns {{code:string|null, markers:string[], conflict:boolean, unread:boolean}}
 *   code is 'ir' when a known form has no modified-release wording at all,
 *   null when the form is unknown, two different markers are present, or there is
 *   release wording that matches no marker (unread): that is unknown, never plain.
 */
export function detectReleaseType(prepped, dosageFormCode) {
  const markers = RELEASE_RULES.filter(([, re]) => re.test(prepped)).map(([code]) => code);
  if (markers.length > 1) return { code: null, markers, conflict: true, unread: false };
  if (markers.length === 1) return { code: markers[0], markers, conflict: false, unread: false };
  if (RELEASE_WORDING.test(prepped)) return { code: null, markers, conflict: false, unread: true };
  // Indian labels always name a modified release, so no marker on a known form means immediate release.
  return { code: dosageFormCode ? 'ir' : null, markers, conflict: false, unread: false };
}

export function detectPharmacopoeia(prepped) {
  const m = PHARMACOPOEIA.exec(prepped);
  return m ? m[1].toUpperCase().replace('PH EUR', 'Ph. Eur.') : null;
}

export const isSolidOral = (code) => SOLID_ORAL.has(code);
