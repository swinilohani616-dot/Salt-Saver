/**
 * Search results: one section per formulation, with the branded medicines first and the generics
 * they can be compared with under them. Every medicine is drawn by medicineCard.js.
 */
import { el, icon } from './dom.js';
import { medicineCard } from './medicineCard.js';
import { referenceForm } from './referenceForm.js';
import { medicineCardModel } from '../core/cardModel.js';
import { USER_ENTERED } from '../core/comparison.js';
import { formatINR } from '../core/sanitize.js';
import { toPaise } from '../core/savings.js';
import { ceilingCheck, GST_RATE_FOR_CEILING_CHECK } from '../core/unitSavings.js';
import { saltNames, formulationLabel, formName, releaseName, unitForForm, perUnitText, formatDate, sourceLabel } from '../core/labels.js';
import { normalizeText } from '../core/normalize.js';
import { MESSAGES } from '../config.js';

/**
 * @typedef {{comparison:{generics:Map<string, object>, brands:Map<string, object>}, basket:object[], canAdd:boolean,
 *   onAdd:(product:object) => void, onRemove:(product:object) => void, onPrint:(group:object|null) => void,
 *   onPrice:(product:object, value:object|null) => void, references:Record<string, object>}} Context
 */

/** The form for the price printed on your pack, for a branded or a generic result. */
function priceForm(p, view, { onPrice, references }, close) {
  const brand = !p.isJanAushadhi;
  const priced = view.reference && view.reference.source !== USER_ENTERED ? view.reference : null;
  return referenceForm({
    id: p.id,
    title: brand ? `Price of your pack of ${p.name}` : 'What do you pay now for the same medicine?',
    formulation: formulationLabel(p) ?? p.composition ?? p.name,
    unit: brand ? unitForForm(p.dosageForm) : p.price.packUnit,
    plainRelease: p.releaseType === 'ir',
    askRelease: brand && !!p.dosageForm && !p.releaseType,
    value: brand ? view.entered : references[p.formulationKey] ?? null,
    listed: brand && p.price?.packCount ? { mrp: p.price.amount, count: p.price.packCount } : null,
    submitLabel: brand && priced && !p.releaseType ? 'Check my strip' : 'Show savings',
    onSave: (value) => {
      onPrice(p, value);
      return null;
    },
    onCancel: close,
  });
}

function card(p, group, ctx) {
  const view = p.isJanAushadhi ? ctx.comparison.generics.get(p.id) : ctx.comparison.brands.get(p.id);
  return medicineCard(medicineCardModel(p, view, { canAdd: ctx.canAdd }), {
    basket: ctx.basket,
    onAdd: () => ctx.onAdd(p),
    onRemove: () => ctx.onRemove(p),
    onPrint: () => ctx.onPrint(group),
    onClearPrice: () => ctx.onPrice(p, null),
    priceForm: (close) => priceForm(p, view ?? { reference: null, entered: null }, ctx, close),
  });
}

const list = (products, group, ctx, start = 0) =>
  el('ul', { class: 'results-list list-unstyled' }, products.map((p, i) => el('li', { style: `--i: ${Math.min(start + i, 8)}` }, card(p, group, ctx))));

const ROUTES = { oral: 'by mouth', parenteral: 'by injection', topical: 'on the skin', ophthalmic: 'eye', otic: 'ear', inhalation: 'inhaled', nasal: 'nose', rectal: 'rectal', vaginal: 'vaginal' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function groupFacts(g) {
  const release = !g.releaseType ? 'release type to be checked' : g.releaseType !== 'ir' ? releaseName(g.releaseType) : null;
  return [formName(g.dosageForm).replace(/^./, (c) => c.toUpperCase()), release, ROUTES[g.route] ?? g.route].filter(Boolean).join(' · ');
}

/** @param {object} group from the API @param {Context} ctx */
function resultGroup(group, ctx) {
  const id = `group-${group.key.replace(/[^a-z0-9]+/gi, '-')}`;
  const generics = group.generics.map((x) => x.product);
  return el(
    'section',
    { class: 'result-group', aria: { labelledby: id } },
    el('div', { class: 'group-head' },
      el('div', {},
        el('h3', { id, class: 'group-title' }, group.composition),
        el('p', { class: 'group-facts mb-0' }, groupFacts(group))),
      el('button', { type: 'button', class: 'btn btn-link group-print', aria: { label: `Print the comparison for ${group.composition}` }, onClick: () => ctx.onPrint(group) }, icon('printer', 'me-2'), 'Print comparison')),
    group.brands.length > 0 && el('p', { class: 'group-label' }, `Branded ${group.brands.length === 1 ? 'medicine' : 'medicines'}`),
    group.brands.length > 0 && list(group.brands, group, ctx),
    el('p', { class: 'group-label' }, generics.length ? `${plural(generics.length, 'generic option', 'generic options')} to compare` : 'Generic options to compare'),
    generics.length ? list(generics, group, ctx, group.brands.length) : el('p', { class: 'group-empty' }, icon('info-circle', 'me-2'), 'No Jan Aushadhi generic with the same salt, strength, form and release type is listed.'),
    ceilings(group, ctx),
  );
}

/**
 * The groups of a search. When a salt was searched, combinations that merely contain it are folded
 * away under the medicines that are that salt; a brand that was searched by name always stays in view.
 */
export function resultGroups(body, ctx, query) {
  const fewest = Math.min(...body.groups.map((g) => g.salts.length));
  const asked = normalizeText(query).split(' ')[0];
  const byName = (g) => g.brands.some((b) => normalizeText(b.name).startsWith(asked));
  const folded = body.groups.filter((g) => g.salts.length > fewest && !byName(g));
  const main = body.groups.filter((g) => !folded.includes(g));
  return [
    main.map((g) => resultGroup(g, ctx)),
    folded.length > 0 && el('details', { class: 'result-more' },
      el('summary', {}, `${plural(folded.length, 'combination medicine', 'combination medicines')} with other salts added`),
      folded.map((g) => resultGroup(g, ctx))),
    otherResults(body.other, ctx),
  ];
}

/** Medicines that were found but lack the details needed to compare them. */
function otherResults(products, ctx) {
  if (!products.length) return null;
  return el(
    'section',
    { class: 'result-group', aria: { labelledby: 'group-other' } },
    el('div', { class: 'group-head' }, el('div', {},
      el('h3', { id: 'group-other', class: 'group-title' }, 'Other listed products'),
      el('p', { class: 'group-facts mb-0' }, 'The strength or dosage form is not fully listed, so they are not compared.'))),
    list(products, null, ctx),
  );
}

/** The legal maximum price of this formulation, when NPPA sets one, and whether a price you typed is above it. */
function ceilings(group, ctx) {
  if (!group.ceilings?.length) return null;
  const typed = group.brands.map((b) => ctx.comparison.brands.get(b.id)?.entered).filter((e) => e?.mrp);
  return el('div', { class: 'ceiling-note' }, group.ceilings.map((c) => {
    const above = typed.map((e) => ceilingCheck(e, c)).find((x) => x.applicable && x.above);
    return el('div', {},
      el('p', { class: 'mb-0' }, icon('bank', 'me-2'),
        `NPPA ceiling price: ${formatINR(Math.round(toPaise(c.ceilingPerUnit)))} per ${(c.unitText?.replace(/^1\s+/, '') || c.unitCode).toLowerCase()} plus GST. This is the legal maximum, not the shop price.`,
        c.effectiveFrom ? ` Effective from ${formatDate(c.effectiveFrom)}.` : '', ` Source: ${sourceLabel('nppa_ceiling_prices')}.`),
      above && el('p', { class: 'alert alert-warning py-2 mb-0 mt-2', role: 'alert' }, icon('exclamation-triangle-fill', 'me-2'), MESSAGES.CEILING_ABOVE,
        el('span', { class: 'd-block small' }, `You entered ${formatINR(Math.round(above.enteredPerUnit))} ${perUnitText(c.unitCode)}; the ceiling with ${Math.round(GST_RATE_FOR_CEILING_CHECK * 100)}% GST is ${formatINR(Math.round(above.ceilingWithGstPerUnit))}.`)));
  }));
}

/** One reminder above the results, so every card does not have to repeat it. The salt sentence is left out for devices. */
export function safetyReminder(body) {
  const products = [...body.groups.flatMap((g) => [...g.brands, ...g.generics.map((x) => x.product)]), ...body.other];
  const salts = products.some((p) => saltNames(p)) ? `${MESSAGES.DISCLAIMER} ` : '';
  return el('p', { class: 'safety-reminder', role: 'note' }, icon('shield-exclamation', 'me-2'), el('span', {}, `${salts}${MESSAGES.CONSULT}`));
}
