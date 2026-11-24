/**
 * What a medicine card says. Every medicine, branded or generic, with or without a price,
 * fills the same slots, so ui/medicineCard.js can draw them all with one template.
 * Missing information is named as missing; nothing is made up.
 */
import { toPaise } from './savings.js';
import { formatINR } from './sanitize.js';
import { USER_ENTERED } from './comparison.js';
import { STATUS_LABELS, saltNames, strengthText, formLine, unitText, perUnitText, formatDate, sourceLabel, releaseName } from './labels.js';

const CATEGORY = Object.freeze({
  generic: Object.freeze({ text: 'Jan Aushadhi Generic', tone: 'ja' }),
  brand: Object.freeze({ text: 'Branded', tone: 'brand' }),
});

/** Who vouches for the price on the card. */
export const PRICE_TAGS = Object.freeze({
  verified: Object.freeze({ text: 'Verified price', tone: 'verified', icon: 'patch-check-fill' }),
  user: Object.freeze({ text: 'Entered by you', tone: 'user', icon: 'person-check' }),
  none: Object.freeze({ text: 'No verified price', tone: 'none', icon: 'dash-circle' }),
});
const DEMO_TAG = Object.freeze({ text: 'Demo data', tone: 'demo', icon: 'exclamation-circle' });

/** "10 tablets", or the pack exactly as listed when it cannot be read. */
export const packText = (price) => (price?.packCount ? unitText(price.packUnit, price.packCount) : price?.packLabel || null);

/** The pack of the current price, or the pack on record when there is no price; other packs of the same medicine follow. */
function packFact(p, entered) {
  if (entered) return unitText(entered.unit, entered.count);
  const main = packText(p.price) ?? (p.pack ? packText({ packCount: p.pack.count, packUnit: p.pack.unit, packLabel: p.pack.label }) : null);
  const others = (p.otherPacks ?? []).map((x) => x.label);
  return main && others.length ? `${main} (also ${others.join(', ')})` : main;
}

const fact = (label, value, missing = 'Not listed') => ({ label, text: value ?? missing, missing: value === null || value === undefined });

function sourceText(p, entered) {
  const date = formatDate(p.price?.updatedAt ?? p.updatedAt);
  const listed = date ? `${sourceLabel(p.sourceId)}, updated ${date}` : sourceLabel(p.sourceId);
  return entered ? `Price entered by you. Details: ${listed}` : listed;
}

const perUnitLine = (amount, count, unit) => (count > 0 && unit ? `, ${formatINR(Math.round(toPaise(amount) / count))} ${perUnitText(unit)}` : '');

function priceSlot(p, entered) {
  if (entered) {
    return {
      available: true, tag: PRICE_TAGS.user, label: 'MRP on your pack', text: formatINR(toPaise(entered.mrp)),
      note: `${unitText(entered.unit, entered.count)}${perUnitLine(entered.mrp, entered.count, entered.unit)}`,
    };
  }
  if (!p.price) {
    return {
      available: false, tag: PRICE_TAGS.none, label: 'MRP', text: 'Price unavailable',
      note: p.isJanAushadhi ? 'Listed by PMBI as under process.' : p.sourceId === 'nppa_brand_mrp' ? 'The MRP NPPA lists is out of date.' : 'Not in the official price list.',
    };
  }
  return {
    available: true, tag: PRICE_TAGS.verified, label: p.price.includesGst ? 'MRP, incl. taxes' : 'MRP', text: formatINR(toPaise(p.price.amount)),
    note: `${packText(p.price) ?? 'Per pack'}${perUnitLine(p.price.amount, p.price.packCount, p.price.packUnit)}`,
  };
}

const badge = (s) => ({ kind: 'badge', text: `Save ${formatINR(s.saving)} (${s.percent}%)`, links: null });
const note = (text, links = null) => ({ kind: 'note', text, links });
const prompt = (text) => ({ kind: 'prompt', text, links: null });

const CANNOT = 'Savings unavailable: strength, form or pack size is not fully listed.';

function brandSlots(p, view) {
  const { reference, saving, generic, entered, options } = view;
  const links = entered ? 'own' : reference ? 'override' : null;
  const out = { reference: null, match: '', saving: null, action: { kind: 'add', label: 'Add to Comparison Basket', disabled: true, hint: '' } };
  const blocked = (match, savingSlot, hint) => Object.assign(out, { match, saving: savingSlot, action: { ...out.action, hint } });
  if (saving.ok) {
    out.reference = `Generic: ${formatINR(saving.alternative)} for ${unitText(saving.unit, saving.count)}`;
    out.match = `Compared with ${generic.name}.`;
    out.saving = { ...(saving.cheaper ? badge(saving) : note('No saving: the generic is not cheaper.')), links };
    out.action.disabled = false;
    return out;
  }
  switch (saving.reason) {
    case 'no_generic':
      return blocked(p.salts?.length ? 'No Jan Aushadhi generic of the same strength, form and release type is listed.' : 'The salt, strength or form is not listed, so it cannot be compared.',
        note('No generic to compare with.', links), 'No matching generic to compare');
    case 'not_verified':
      if (p.releaseType) return blocked(`${options} possible ${options === 1 ? 'generic needs' : 'generics need'} a pharmacist’s check.`, note('Savings are shown only for verified matches.', links), 'Needs a verified match');
      if (entered?.release) return blocked(`Your strip says ${releaseName(entered.release)}. No generic of that type is listed.`, note('No generic to compare with.', links), 'No matching generic to compare');
      return blocked('Release type not recorded. Check your strip for SR, ER, XR, MR or CR.', { ...prompt(reference ? 'Check your strip to see savings' : 'Enter the MRP on your pack') }, 'Needs a verified match');
    case 'no_reference':
      return blocked(`${view.verified} matching ${view.verified === 1 ? 'generic' : 'generics'} below.`, prompt('Enter the MRP on your pack'), 'Add your price first');
    case 'units_differ':
      return blocked('Your pack and the generic are counted in different units.', note(`Savings unavailable: your pack is counted in ${entered?.unit ?? 'another unit'}.`, links), 'Packs cannot be compared');
    default:
      return blocked('The matching generic has no listed price.', note('Savings need a listed generic price.', links), 'No listed price to compare');
  }
}

function genericSlots(p, view) {
  const { match, brand, reference, saving, ownPrice } = view;
  const out = { reference: null, match: '', saving: null, action: { kind: 'add', label: 'Add to Comparison Basket', disabled: !p.price, hint: p.price ? '' : 'No listed price to compare' } };
  if (match?.status === 'verified_match') out.match = `Same salt, strength, form, route and release type as ${brand?.name ?? 'the branded medicine'}${match.confirmedRelease ? ', as you read it on your strip' : ''}.`;
  else if (match) out.match = match.reasons[0]?.message ?? '';
  else out.match = 'No branded medicine of this formulation is shown.';
  if (saving.ok) {
    out.reference = `${ownPrice ? 'Your price' : reference.source === USER_ENTERED ? `${brand.name}, your price` : brand.name}: ${formatINR(saving.referenceForPack)} for ${unitText(saving.unit, saving.count)}`;
    out.saving = { ...(saving.cheaper ? badge(saving) : note('No saving: the price you compare with is the same or lower.')), links: ownPrice ? 'own' : null };
    return out;
  }
  if (!p.price) out.saving = note('Savings need a listed price.');
  else if (!p.formulationKey || saving.reason === 'pack_unknown') out.saving = note(CANNOT);
  else if (match && match.status !== 'verified_match') out.saving = note(match.status === 'not_equivalent' ? 'Not compared: a different release type.' : 'Savings are shown only for verified matches.');
  else out.saving = prompt('Add your price to see savings');
  return out;
}

/** Views for a medicine that is not part of any comparison. */
export const NO_BRAND_VIEW = Object.freeze({ reference: null, entered: null, generic: null, saving: Object.freeze({ ok: false, reason: 'no_generic' }), verified: 0, options: 0 });
export const NO_GENERIC_VIEW = Object.freeze({ match: null, brand: null, reference: null, saving: Object.freeze({ ok: false, reason: 'no_reference' }), ownPrice: false });

/**
 * The one card model.
 * @param {object} p product from the API
 * @param {object} [view] its comparison, from comparison.js compareResults()
 * @param {{canAdd?:boolean}} [options]
 */
export function medicineCardModel(p, view = p.isJanAushadhi ? NO_GENERIC_VIEW : NO_BRAND_VIEW, { canAdd = true } = {}) {
  const entered = !p.isJanAushadhi && view.reference?.source === USER_ENTERED ? view.reference : null;
  const slots = p.isJanAushadhi ? genericSlots(p, view) : brandSlots(p, view);
  const tags = [];
  if (p.sourceId === 'legacy_json') tags.push(DEMO_TAG);
  if (p.isJanAushadhi && view.match) tags.push(STATUS_LABELS[view.match.status]);
  return {
    id: p.id,
    name: p.name,
    category: p.isJanAushadhi ? CATEGORY.generic : CATEGORY.brand,
    tags,
    status: p.isJanAushadhi && view.match ? STATUS_LABELS[view.match.status] : null,
    form: `${formLine(p) || 'Form not listed'}${p.jaDrugCode ? `, drug code ${p.jaDrugCode}` : ''}`,
    facts: [
      fact('Salt composition', saltNames(p)),
      fact('Strength', strengthText(p)),
      fact('Pack size', packFact(p, entered)),
      fact('Manufacturer', p.manufacturer, p.isJanAushadhi ? 'Not listed by PMBI' : p.sourceId === 'nppa_brand_mrp' ? 'Not listed by NPPA' : 'Not listed'),
    ],
    source: sourceText(p, entered),
    price: priceSlot(p, entered),
    ...slots,
    ...(canAdd ? {} : { action: { kind: 'print', label: 'Print Comparison', disabled: false, hint: '' } }),
  };
}
