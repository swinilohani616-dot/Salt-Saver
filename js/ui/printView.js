/**
 * Printable sheets (FR-05). print.css shows only #print-sheet when printing,
 * and the browser's "Save as PDF" gives the PDF export.
 */
import { el, $, renderInto } from './dom.js';
import { calculateTotalSavings } from '../services/basketService.js';
import { formatINR } from '../core/sanitize.js';
import { toPaise } from '../core/savings.js';
import { STATUS_LABELS, unitText, perUnitText, formatDate, sourceLabel, saltLabel, hasSameSalt } from '../core/labels.js';
import { ROLES } from '../core/roles.js';
import { getState } from '../state/store.js';
import { getDataStatus } from '../services/dataService.js';
import { getLivePrices, getLiveReferences } from './basketView.js';
import { MESSAGES } from '../config.js';
import { toast } from './alerts.js';

function header(title) {
  const role = ROLES[getState().role]?.label || '';
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return el(
    'header',
    { class: 'print-header' },
    el('div', {}, el('p', { class: 'print-brand' }, 'SaltSaver'), el('h1', {}, title)),
    el('p', { class: 'print-meta' }, `Date: ${date}`, el('br'), role && `Prepared by: ${role}`),
  );
}

/** @param {boolean} sameSalt every printed generic has the same salt, so the BR-02 sentence is true for all of them */
function footer(sameSalt) {
  const ja = getDataStatus()?.sources.find((s) => s.id === 'pmbi_product_list');
  return [
    sameSalt && el('p', { class: 'print-disclaimer' }, MESSAGES.DISCLAIMER),
    el('p', { class: 'print-disclaimer' }, MESSAGES.SAFETY_NOTE),
    el('p', { class: 'print-disclaimer' }, MESSAGES.PRICE_NOTE),
    ja?.lastSuccessAt && el('p', { class: 'print-disclaimer' }, `${sourceLabel('pmbi_product_list')} updated ${formatDate(ja.lastSuccessAt)}.`),
  ];
}

export function printBasket() {
  const result = calculateTotalSavings(getLivePrices(), getLiveReferences());
  if (!result.ok) {
    toast(result.error.message, { variant: 'info' });
    return;
  }
  const s = result.data;
  renderInto(
    $('#print-sheet'),
    header('My Prescription Savings List (estimate)'),
    el('p', { class: 'print-instruction' }, 'For price comparison only. Show this list to your doctor or pharmacist and ask about the generic in the "Ask about" column before switching.'),
    el('table', { class: 'print-table' },
      el('thead', {}, el('tr', {}, ['Reference medicine', 'Ask about (generic)', 'Packs / month', 'Reference cost', 'Generic cost', 'Savings / month'].map((h) => el('th', { scope: 'col' }, h)))),
      el('tbody', {}, s.lines.map((l) => el('tr', {},
        l.reference
          ? el('td', {}, l.item.productName || l.item.formulation || 'Your medicine', el('br'), el('small', {}, priceText(l.reference)))
          : el('td', {}, 'Price not entered'),
        el('td', {}, l.item.alternativeName, l.item.jaDrugCode ? el('small', {}, ` (code ${l.item.jaDrugCode})`) : null),
        el('td', { class: 'num' }, String(l.item.packsPerMonth)),
        el('td', { class: 'num' }, l.original === null ? '—' : formatINR(l.original)),
        el('td', { class: 'num' }, l.alternative === null ? '—' : formatINR(l.alternative)),
        el('td', { class: 'num' }, l.comparable ? formatINR(l.saving) : '—')))),
      el('tfoot', {}, el('tr', {},
        el('th', { scope: 'row', colspan: 3 }, s.uncompared.count ? 'Total of compared medicines' : 'Total'),
        el('td', { class: 'num' }, formatINR(s.totalOriginal)),
        el('td', { class: 'num' }, formatINR(s.totalAlternative)),
        el('td', { class: 'num' }, formatINR(s.totalSaving))))),
    el('p', { class: 'print-total' }, s.compared
      ? `Total monthly savings: ${formatINR(s.totalSaving)} (${s.overallPercent}%), about ${formatINR(s.yearlySaving)} per year.`
      : 'No savings shown: the prices you pay now have not been entered.'),
    footer(s.lines.every((l) => l.item.formulationKey || l.comparable)),
  );
  window.print();
}

/** "MRP ₹108.36 for 15 tablets (NPPA Pharma Sahi Daam (official MRP), 24 Nov 2026)" or "(entered by you)" */
function priceText(reference) {
  const from = reference.source === 'user_entered' ? 'entered by you' : `${sourceLabel(reference.source)}${reference.asOf ? `, ${formatDate(reference.asOf)}` : ''}`;
  return `MRP ${formatINR(toPaise(reference.mrp))} for ${unitText(reference.unit, reference.count)} (${from})`;
}

/**
 * One formulation's comparison, for any role (a Pharmacy Buyer has no basket).
 * @param {object|null} group from the search answer
 * @param {{generics:Map<string, object>, brands:Map<string, object>}} comparison from compareResults()
 */
export function printComparison(group, comparison) {
  if (!group) return;
  const items = group.generics.map(({ product, matches }) => ({ product, view: comparison.generics.get(product.id), matches }));
  const rows = items.map(({ product, view }) => {
    const pr = product.price;
    return el('tr', {},
      el('td', {}, product.name, product.jaDrugCode ? el('small', {}, ` (code ${product.jaDrugCode})`) : null),
      el('td', {}, view.match ? STATUS_LABELS[view.match.status].text : 'Not compared', view.brand && view.saving.ok ? el('small', {}, ` with ${view.brand.name}`) : null),
      el('td', { class: 'num' }, pr ? `${formatINR(toPaise(pr.amount))} / ${pr.packCount ? unitText(pr.packUnit, pr.packCount) : pr.packLabel ?? 'pack'}` : '—'),
      el('td', { class: 'num' }, pr?.unitPrice ? `${formatINR(Math.round(pr.unitPrice * 100))} ${perUnitText(pr.packUnit)}` : '—'),
      el('td', { class: 'num' }, view.saving.ok && view.saving.cheaper ? `${formatINR(view.saving.saving)} (${view.saving.percent}%)` : '—'));
  });
  renderInto(
    $('#print-sheet'),
    header('Branded vs Generic Price Comparison (estimate)'),
    el('p', {}, el('strong', {}, `${saltLabel(group.composition)}${group.composition}`)),
    group.brands.map((b) => {
      const reference = comparison.brands.get(b.id)?.reference;
      return el('p', {}, `${b.name}: ${reference ? priceText(reference) : 'no verified price'}.`);
    }),
    (group.ceilings ?? []).map((c) => el('p', {}, `NPPA ceiling price: ${formatINR(Math.round(toPaise(c.ceilingPerUnit)))} per ${(c.unitText?.replace(/^1\s+/, '') || c.unitCode).toLowerCase()} plus GST (legal maximum, not the shop price).`)),
    rows.length
      ? el('table', { class: 'print-table' },
          el('thead', {}, el('tr', {}, ['Jan Aushadhi generic', 'Match', 'MRP', 'Per unit', 'Savings per pack'].map((h) => el('th', { scope: 'col' }, h)))),
          el('tbody', {}, rows))
      : el('p', {}, 'No Jan Aushadhi generic of this formulation was found.'),
    footer(rows.length > 0 && items.every(({ view }) => hasSameSalt(view.match ?? { reasons: [] }))),
  );
  window.print();
}
