/**
 * Price comparison of one Jan Aushadhi pack with the medicine you buy now (the reference).
 *
 *   savings   = reference price - alternative price
 *   savings % = savings / reference price x 100   (rounded down, never over-promised)
 *
 * The reference is first converted to the same quantity as the alternative's pack, so a
 * strip of 15 and a strip of 10 compare fairly. Nothing is worked out when either price,
 * a pack size or a unit is missing. Money is in paise.
 */
import { toPaise } from './savings.js';
import { compareUnitPrices } from './unitSavings.js';
import { formulationLabel, strengthText, releaseName } from './labels.js';

/**
 * @param {{mrp:number, count:number, unit:string}|null} reference the price you pay, for the same formulation
 * @param {{amount:number, packCount:number|null, packUnit:string|null}|null} price the alternative's MRP and pack
 * @returns {{ok:false, reason:'no_price'|'no_reference'|'pack_unknown'|'units_differ'} |
 *           {ok:true, cheaper:boolean, referenceForPack:number, alternative:number, saving:number, percent:number, count:number, unit:string}}
 */
export function packSaving(reference, price) {
  if (!(price?.amount > 0)) return { ok: false, reason: 'no_price' };
  if (!(price.packCount > 0) || !price.packUnit) return { ok: false, reason: 'pack_unknown' };
  if (!(reference?.mrp > 0) || !(reference.count > 0)) return { ok: false, reason: 'no_reference' };
  const compared = compareUnitPrices({
    status: 'verified_match', // the caller has already established that the formulation is the same
    original: reference,
    alternative: { mrp: price.amount, count: price.packCount, unit: price.packUnit },
  });
  if (!compared.ok) return { ok: false, reason: compared.reason };
  const referenceForPack = Math.round(compared.originalPerUnit * price.packCount);
  const alternative = toPaise(price.amount);
  const cheaper = compared.cheaper && referenceForPack > alternative;
  return {
    ok: true,
    cheaper,
    referenceForPack,
    alternative,
    saving: cheaper ? referenceForPack - alternative : 0,
    percent: cheaper ? compared.savingPercent : 0,
    count: price.packCount,
    unit: price.packUnit,
  };
}

/** The same comparison for the pack you buy: the saving on a strip of 15 when the generic comes in 10s. */
export function brandPackSaving(reference, price) {
  const s = packSaving(reference, price);
  if (!s.ok) return s;
  const referenceForPack = toPaise(reference.mrp);
  const alternative = Math.round((toPaise(price.amount) / price.packCount) * reference.count);
  const cheaper = s.cheaper && referenceForPack > alternative;
  return { ...s, cheaper, referenceForPack, alternative, saving: cheaper ? referenceForPack - alternative : 0, percent: cheaper ? s.percent : 0, count: reference.count };
}

export const USER_ENTERED = 'user_entered';

/**
 * The price to compare with for one brand: the MRP you typed from your own pack, otherwise its verified MRP.
 * @returns {{mrp:number, count:number, unit:string, source:string, asOf:string}|null}
 */
export function brandReference(brand, entered = null) {
  if (entered?.mrp > 0 && entered.count > 0 && entered.unit) return { mrp: entered.mrp, count: entered.count, unit: entered.unit, source: USER_ENTERED, asOf: '' };
  const p = brand.price;
  if (p?.amount > 0 && p.packCount > 0 && p.packUnit) return { mrp: p.amount, count: p.packCount, unit: p.packUnit, source: p.sourceId, asOf: p.effectiveFrom ?? p.updatedAt ?? '' };
  return null;
}

/**
 * How a generic matches a brand, using the release type you read on your strip when the catalogue has none.
 * @param {{product:object, matches:Record<string, {status:string, reasons:object[]}>}} item a generic of a search result
 * @returns {{status:string, reasons:object[], confirmedRelease?:string}|null} null when they were not compared
 */
export function matchWith(item, brand, entered = null) {
  const match = item.matches?.[brand.id];
  if (!match) return null;
  const onlyReleaseUnknown = match.status === 'needs_review' && match.reasons.length > 0 && match.reasons.every((r) => r.code === 'release_unknown');
  if (!onlyReleaseUnknown || brand.releaseType || !entered?.release || !item.product.releaseType) return match;
  if (item.product.releaseType === entered.release) return { status: 'verified_match', reasons: [], confirmedRelease: entered.release };
  return { status: 'not_equivalent', reasons: [{ code: 'release_differs', message: `Your strip says ${releaseName(entered.release)}; this is ${releaseName(item.product.releaseType)}.` }] };
}

const STATUS_ORDER = ['verified_match', 'needs_review', 'insufficient_data', 'not_equivalent'];

/**
 * Works out every comparison of a search result at once, so a brand card and the generic cards
 * under it always tell the same story. Only verified matches get a saving. When several brands
 * could be the reference, a price you entered comes first, then the cheapest brand, so a saving
 * is never overstated.
 * @param {{groups:object[]}} body search answer
 * @param {{entered?:Record<string, object>, references?:Record<string, object>}} [prices]
 *        entered: what you typed from a brand's pack (MRP and pack, its release type, or both), by brand id; references: MRP typed for a formulation, by formulation key
 * @returns {{generics:Map<string, object>, brands:Map<string, object>}}
 */
export function compareResults(body, { entered = {}, references = {} } = {}) {
  const brandsById = new Map(body.groups.flatMap((g) => g.brands).map((b) => [b.id, b]));
  const items = body.groups.flatMap((g) => g.generics);
  const generics = new Map();
  const pairs = []; // every brand with every generic it was matched with

  for (const item of items) {
    const g = item.product;
    const options = Object.keys(item.matches ?? {}).map((id) => brandsById.get(id)).filter(Boolean).map((brand) => {
      const reference = brandReference(brand, entered[brand.id]);
      const match = matchWith(item, brand, entered[brand.id]);
      const pair = { item, brand, reference, match, saving: match.status === 'verified_match' ? packSaving(reference, g.price) : { ok: false, reason: 'not_verified' } };
      pairs.push(pair);
      return pair;
    });
    const usable = options.filter((o) => o.saving.ok).sort((a, b) =>
      Number(b.reference.source === USER_ENTERED) - Number(a.reference.source === USER_ENTERED) || a.saving.referenceForPack - b.saving.referenceForPack);
    const best = [...options].sort((a, b) => STATUS_ORDER.indexOf(a.match.status) - STATUS_ORDER.indexOf(b.match.status))[0] ?? null;
    const own = g.formulationKey ? references[g.formulationKey] ?? null : null;
    const ownSaving = own ? packSaving(own, g.price) : { ok: false };
    const chosen = usable[0] ?? null;
    if (ownSaving.ok && chosen?.reference.source !== USER_ENTERED) {
      generics.set(g.id, { match: best?.match ?? null, brand: best?.match.status === 'verified_match' ? best.brand : null, reference: { ...own, source: USER_ENTERED, asOf: '' }, saving: ownSaving, ownPrice: true });
    } else {
      generics.set(g.id, { match: (chosen ?? best)?.match ?? null, brand: (chosen ?? best)?.brand ?? null, reference: chosen?.reference ?? null, saving: chosen?.saving ?? best?.saving ?? packSaving(null, g.price), ownPrice: false });
    }
  }

  const brands = new Map();
  for (const brand of brandsById.values()) {
    const mine = pairs.filter((p) => p.brand.id === brand.id);
    const verified = mine.filter((p) => p.match.status === 'verified_match');
    const priced = verified.filter((p) => p.saving.ok).sort((a, b) => a.item.product.price.unitPrice - b.item.product.price.unitPrice);
    const reference = brandReference(brand, entered[brand.id]);
    const best = priced[0] ?? null;
    brands.set(brand.id, {
      reference,
      entered: entered[brand.id] ?? null,
      generic: best?.item.product ?? null,
      saving: best ? brandPackSaving(reference, best.item.product.price) : { ok: false, reason: !mine.length ? 'no_generic' : !verified.length ? 'not_verified' : reference ? verified[0].saving.reason : 'no_reference' },
      verified: verified.length,
      options: mine.filter((p) => p.match.status !== 'not_equivalent').length,
    });
  }
  return { generics, brands };
}

/**
 * A comparison basket line for a Jan Aushadhi product.
 * @param {object} alternative product from the API
 * @param {{product?:{id:string, name:string}|null, reference?:{mrp:number, count:number, unit:string, source?:string, asOf?:string}|null}} [from]
 * @returns {object|null} null when there is no price to compare
 */
export function comparisonLine(alternative, { product = null, reference = null } = {}) {
  const price = alternative.price;
  if (!(price?.amount > 0)) return null;
  const usable = packSaving(reference, price).ok ? reference : null;
  return {
    productId: usable && product ? product.id : '',
    productName: usable && product ? product.name : '',
    composition: alternative.composition ?? '',
    strength: strengthText(alternative) ?? '',
    formulation: formulationLabel(alternative) ?? '',
    formulationKey: alternative.formulationKey ?? '',
    alternativeId: alternative.id,
    alternativeName: alternative.name,
    jaDrugCode: alternative.jaDrugCode ?? '',
    unit: price.packUnit ?? '',
    enteredMrp: usable?.mrp ?? null,
    enteredCount: usable?.count ?? null,
    referenceSource: usable ? usable.source ?? USER_ENTERED : '',
    referenceAsOf: usable?.asOf ?? '',
    alternativePrice: { mrp: price.amount, count: price.packCount ?? null, unit: price.packUnit ?? null, packLabel: price.packLabel ?? '', asOf: price.updatedAt ?? '' },
  };
}

/** Is this medicine already in the basket, as the generic of a line or as the brand it is compared with? */
export const isInBasket = (items, productId) => items.some((i) => i.alternativeId === productId || i.productId === productId);

/**
 * A basket line's price, reference price and saving for one Jan Aushadhi pack.
 * @param {{mrp:number, count:number|null, unit:string|null}} [livePrice] refreshed price, if any
 * @param {{mrp:number, count:number, unit:string}} [reference] the reference price of the line (see basketMath.lineReference)
 */
export function savingForLine(line, livePrice = null, reference = line.enteredMrp && line.enteredCount ? { mrp: line.enteredMrp, count: line.enteredCount, unit: line.unit } : null) {
  const alt = livePrice ?? line.alternativePrice;
  return packSaving(reference, { amount: alt.mrp, packCount: alt.count, packUnit: alt.unit });
}
