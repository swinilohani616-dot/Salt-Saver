/**
 * Search results as comparison groups. A group is one formulation: the same salts, strengths,
 * dosage form, route and release type. It holds the branded medicines and the generics of that
 * formulation, so a brand search and a salt search end in the same place.
 *
 * Whether a generic may be compared with a brand is decided by the matching engine (match.js),
 * never by sharing a group: each generic carries its result against each brand.
 */
import { compareProducts, statusRank, STATUS } from './match.js';
import { compositionKey } from './composition.js';
import { canonicalStrength, formatStrength } from './strength.js';

const SOLID = new Set(['tablet', 'capsule']);
const OTHER_SOLID = new Set(['dispersible_tablet', 'mouth_dissolving_tablet', 'chewable_tablet']);
const LIQUID = new Set(['syrup', 'suspension', 'dry_syrup', 'oral_solution', 'oral_liquid', 'oral_drops']);
const formRank = (code) => (SOLID.has(code) ? 0 : OTHER_SOLID.has(code) ? 1 : LIQUID.has(code) ? 2 : 3);

/** Salts, strengths, dosage form and route; null when any of them is unknown. */
export function familyKey(p) {
  if (!p.ingredients?.length || !p.dosageForm || !p.route) return null;
  const composition = compositionKey(p.ingredients);
  return composition && p.ingredients.every((i) => i.strength) ? `${composition}|${p.dosageForm}|${p.route}` : null;
}

const amounts = (p) => p.ingredients.map((i) => canonicalStrength(i.strength)?.amount ?? 0);
const label = (p) => p.ingredients.map((i) => `${i.name} ${formatStrength(i.strength)}`).join(' + ');
const unitPrice = (p) => p.price?.unitPrice ?? Infinity;

/**
 * Packs of one branded medicine (a strip of 15, a strip of 30) become one entry: the pack that is
 * cheapest per unit, so a saving is never overstated, with the others listed under it.
 */
export function mergePacks(brands) {
  const byMedicine = new Map();
  for (const b of brands) {
    const key = [b.sourceId, b.name.toLowerCase(), familyKey(b), b.releaseType].join('|');
    byMedicine.set(key, [...(byMedicine.get(key) ?? []), b]);
  }
  return [...byMedicine.values()].map((packs) => {
    const [main, ...rest] = [...packs].sort((a, b) => unitPrice(a) - unitPrice(b) || (a.price?.packCount ?? 0) - (b.price?.packCount ?? 0));
    return { ...main, hit: packs.some((p) => p.hit), byName: packs.some((p) => p.byName), otherPacks: rest.filter((p) => p.price).map((p) => p.price) };
  });
}

/**
 * @param {Array<object>} products as loaded by db/matching.js, each with hit (found by the search itself,
 *        not only loaded to compare with a brand) and byName (its own name was searched)
 * @returns {{groups:Array<{key:string, composition:string, salts:string[], dosageForm:string, route:string, releaseType:string|null,
 *            compositionKey:string, brands:object[], generics:Array<{product:object, matches:Record<string, {status:string, reasons:object[]}>}>}>,
 *            other:object[], notEquivalent:number}}
 *          other: found, but without the details needed to compare; notEquivalent: generics with the same salts that
 *          are not shown because they differ in strength, form or release type
 */
export function groupProducts(products) {
  const other = [];
  const buckets = new Map();
  const bucket = (p, release) => {
    const family = familyKey(p);
    const key = `${family}|${release ?? 'unknown'}`;
    if (!buckets.has(key)) buckets.set(key, { key, family, release, brands: [], generics: [] });
    return buckets.get(key);
  };
  const brands = mergePacks(products.filter((p) => p.productType === 'brand'));
  const generics = products.filter((p) => p.productType !== 'brand');

  for (const p of [...generics, ...brands]) if (!familyKey(p) && p.hit) other.push(p);
  for (const g of generics.filter(familyKey)) bucket(g, g.releaseType).generics.push(g);
  const placed = brands.filter(familyKey);
  for (const b of placed.filter((x) => x.releaseType)) bucket(b, b.releaseType).brands.push(b);
  // A brand whose release type is not recorded sits with the plain form, if one is listed. Otherwise the whole
  // family becomes one group without a release type, so the brand is never filed under one it may not have.
  // Either way this is layout, not a match: the engine still reports the release type as unknown.
  for (const b of placed.filter((x) => !x.releaseType)) {
    const family = [...buckets.values()].filter((x) => x.family === familyKey(b));
    let home = family.find((x) => x.release === 'ir');
    if (!home) {
      home = bucket(b, null);
      home.release = null;
      for (const x of family.filter((y) => y !== home)) {
        home.brands.push(...x.brands);
        home.generics.push(...x.generics);
        buckets.delete(x.key);
      }
    }
    home.brands.push(b);
  }

  const openFamilies = new Set(placed.filter((b) => b.hit && !b.releaseType).map(familyKey)); // any release type may be theirs
  const kept = [...buckets.values()].filter((x) => x.brands.some((b) => b.hit) || x.generics.some((g) => g.hit) || (openFamilies.has(x.family) && x.generics.length));

  const match = (brand, generic) => compareProducts(brand, generic);
  const matchesFor = (generic, against) => {
    const out = {};
    for (const b of against) {
      const r = match(b, generic);
      if (r.status !== STATUS.NOT_EQUIVALENT) out[b.id] = r;
    }
    return out;
  };
  const shown = new Set();
  const groups = kept.map((x) => {
    const relevant = placed.filter((b) => b.hit && familyKey(b) === x.family);
    const entries = x.generics.map((g) => ({ product: g, matches: matchesFor(g, relevant) }));
    x.generics.forEach((g) => shown.add(g.id));
    return { ...x, brands: x.brands.filter((b) => b.hit), entries };
  });

  // Generics that are close to a searched brand but not the same formulation (e.g. a dispersible tablet):
  // shown with the brand, marked for a pharmacist to check, and never compared on price.
  for (const g of generics.filter((x) => !shown.has(x.id) && !x.hit)) {
    const home = groups.find((x) => x.brands.some((b) => match(b, g).status === STATUS.REVIEW));
    if (!home) continue;
    home.entries.push({ product: g, matches: matchesFor(g, home.brands) });
    shown.add(g.id);
  }

  const best = (entry) => Math.min(9, ...Object.values(entry.matches).map((m) => statusRank(m.status)));
  const out = groups.map((x) => {
    const sample = x.generics[0] ?? x.brands[0];
    return {
      sample,
      byName: x.brands.some((b) => b.byName),
      key: x.key,
      composition: label(sample),
      compositionKey: compositionKey(sample.ingredients),
      salts: sample.ingredients.map((i) => i.name),
      dosageForm: sample.dosageForm,
      route: sample.route,
      releaseType: x.release,
      brands: x.brands.sort((a, b) => Number(!a.price) - Number(!b.price) || a.name.localeCompare(b.name)),
      generics: x.entries.sort((a, b) => best(a) - best(b) || unitPrice(a.product) - unitPrice(b.product) || a.product.name.localeCompare(b.product.name)),
    };
  });
  const compareAmounts = (a, b) => {
    const [x, y] = [amounts(a.sample), amounts(b.sample)];
    for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  out.sort((a, b) =>
    Number(b.byName) - Number(a.byName)
    || a.salts.length - b.salts.length
    || a.salts.join().localeCompare(b.salts.join())
    || formRank(a.dosageForm) - formRank(b.dosageForm)
    || a.dosageForm.localeCompare(b.dosageForm)
    || compareAmounts(a, b)
    || Number(a.releaseType !== 'ir') - Number(b.releaseType !== 'ir')
    || a.key.localeCompare(b.key));

  return {
    groups: out.map(({ sample, byName, ...g }) => g),
    other,
    notEquivalent: generics.filter((g) => !shown.has(g.id) && !g.hit).length,
  };
}
