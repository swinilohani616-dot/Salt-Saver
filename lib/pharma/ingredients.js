/**
 * Ingredient name resolution: "Metformin HCl" -> {key:'metformin', saltForm:'hydrochloride'}.
 *
 * Order: exact canonical name -> exact alias -> strip salt-form / hydrate words one
 * at a time and try again. Names that stay unknown keep their cleaned name as key
 * (flagged known:false) so the same unknown name always maps to the same key.
 */
import { nameKey } from './text.js';

/** Salt-form words and their standard spelling. */
const SALT_WORDS = new Map(Object.entries({
  hydrochloride: 'hydrochloride', hcl: 'hydrochloride', dihydrochloride: 'dihydrochloride', '2hcl': 'dihydrochloride',
  hydrobromide: 'hydrobromide', hbr: 'hydrobromide',
  sodium: 'sodium', potassium: 'potassium', calcium: 'calcium', magnesium: 'magnesium', disodium: 'disodium',
  besylate: 'besylate', besilate: 'besylate', maleate: 'maleate', tartrate: 'tartrate', succinate: 'succinate',
  fumarate: 'fumarate', mesylate: 'mesylate', mesilate: 'mesylate', bisulphate: 'bisulphate', bisulfate: 'bisulphate',
  sulphate: 'sulphate', sulfate: 'sulphate', phosphate: 'phosphate', citrate: 'citrate', acetate: 'acetate',
  dipropionate: 'dipropionate', propionate: 'propionate', furoate: 'furoate', valerate: 'valerate',
  bromide: 'bromide', lactate: 'lactate', gluconate: 'gluconate', hyclate: 'hyclate', pamoate: 'pamoate',
  erbumine: 'erbumine', axetil: 'axetil', proxetil: 'proxetil', medoxomil: 'medoxomil', trometamol: 'trometamol',
}));

/** Water of crystallisation does not change the active moiety; these words are dropped. */
const HYDRATE_WORDS = new Set(['trihydrate', 'dihydrate', 'monohydrate', 'sesquihydrate', 'hemihydrate', 'hydrate', 'anhydrous']);

/** If stripping would leave only these, the full name is the ingredient ("zinc sulphate"). */
const ELEMENT_WORDS = new Set(['sodium', 'potassium', 'calcium', 'magnesium', 'zinc', 'ferrous', 'ferric', 'iron', 'aluminium', 'aluminum', 'chloride', 'carbonate', 'bicarbonate', 'hydroxide', 'oxide', 'elemental']);

/** Pharmacopoeial descriptors that are not part of the name. */
const DESCRIPTOR_WORDS = new Set(['diluted', 'micronised', 'micronized', 'pellets', 'granules', 'elemental']);

export const normalizeSaltForm = (word) => SALT_WORDS.get(nameKey(word)) ?? null;

/**
 * @param {{ingredients: Array<{key:string, name:string}>, aliases: Array<{alias:string, key:string, saltForm?:string|null}>}} data
 */
export function createIngredientResolver({ ingredients = [], aliases = [] } = {}) {
  const names = new Map(ingredients.map((i) => [i.key, i.name]));
  const aliasMap = new Map(aliases.map((a) => [nameKey(a.alias), { key: a.key, saltForm: a.saltForm ?? null }]));

  const lookup = (k) => {
    if (names.has(k)) return { key: k, saltForm: null };
    const a = aliasMap.get(k);
    return a && names.has(a.key) ? { ...a } : null;
  };

  /**
   * @param {string} raw
   * @returns {{key:string, name:string, saltForm:string|null, known:boolean}|null}
   */
  function resolve(raw) {
    let k = nameKey(raw)
      .replace(/\bhydrogen sul[pf]hate\b/g, 'bisulphate')
      .split(' ')
      .filter((w) => w && !HYDRATE_WORDS.has(w))
      .join(' ');
    if (!k) return null;

    const direct = lookup(k);
    if (direct) return { ...direct, name: names.get(direct.key), known: true };

    let tokens = k.split(' ').filter((w) => !DESCRIPTOR_WORDS.has(w));
    const salts = [];
    while (tokens.length > 1) {
      const last = tokens[tokens.length - 1];
      const first = tokens[0];
      let removed;
      if (SALT_WORDS.has(last)) removed = tokens.pop();
      else if (SALT_WORDS.has(first)) removed = tokens.shift();
      else break;
      if (tokens.every((w) => ELEMENT_WORDS.has(w))) {
        tokens = k.split(' ').filter((w) => !DESCRIPTOR_WORDS.has(w));
        salts.length = 0;
        break;
      }
      salts.push(SALT_WORDS.get(removed));
      const found = lookup(tokens.join(' '));
      if (found) {
        return { key: found.key, name: names.get(found.key), saltForm: found.saltForm ?? salts.join(' '), known: true };
      }
    }

    const key = tokens.join(' ');
    const again = lookup(key);
    if (again) return { key: again.key, name: names.get(again.key), saltForm: again.saltForm ?? (salts.join(' ') || null), known: true };
    return { key, name: titleCase(key), saltForm: salts.join(' ') || null, known: false };
  }

  return { resolve, has: (key) => names.has(key), nameOf: (key) => names.get(key) ?? titleCase(key) };
}

export function titleCase(s) {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Ip|Bp|Usp|Iu)\b/g, (w) => w.toUpperCase());
}

/** Turns the curated list (db/reference/ingredients.js) into resolver data. */
export function resolverDataFromCurated(list) {
  const ingredients = list.map((i) => ({ key: nameKey(i.name), name: i.name }));
  const aliases = list.flatMap((i) => i.aliases.map(([alias, , saltForm]) => ({ alias, key: nameKey(i.name), saltForm: saltForm ?? null })));
  return { ingredients, aliases };
}
