/**
 * Printable savings sheet (FR-05). print.css shows only #print-sheet when printing,
 * and the browser's "Save as PDF" gives the PDF export.
 */
import { el, $, renderInto } from './dom.js';
import { calculateTotalSavings } from '../services/basketService.js';
import { basketSummary } from '../core/savings.js';
import { formatINR } from '../core/sanitize.js';
import { ROLES } from '../core/roles.js';
import { getState } from '../state/store.js';
import { MESSAGES } from '../config.js';
import { toast } from './alerts.js';

export function printBasket() {
  const result = calculateTotalSavings();
  if (!result.ok) {
    toast(result.error.message, { variant: 'info' });
    return;
  }
  buildSheet('Generic Medicine Savings Sheet', result.data, true);
  window.print();
}

/** Pharmacy buyer variant: one medicine, one pack. */
export function printComparison(medicine) {
  const summary = basketSummary([{ medicineId: medicine.id, quantityPerMonth: 1 }], new Map([[medicine.id, medicine]]));
  buildSheet('Generic Medicine Price Comparison', summary, false);
  window.print();
}

function buildSheet(title, s, monthly) {
  const role = ROLES[getState().role]?.label || '';
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const qtyHeader = monthly ? 'Packs / month' : 'Packs';
  const savingHeader = monthly ? 'Saving / month' : 'Saving';

  renderInto(
    $('#print-sheet'),
    el(
      'header',
      { class: 'print-header' },
      el('div', {}, el('p', { class: 'print-brand' }, 'SaltSaver'), el('h1', {}, title)),
      el('p', { class: 'print-meta' }, `Date: ${date}`, el('br'), role && `Prepared by: ${role}`),
    ),
    el('p', { class: 'print-instruction' }, 'Show this sheet at a Jan Aushadhi Kendra or pharmacy and ask for the generic medicine in the "Ask for" column.'),
    el(
      'table',
      { class: 'print-table' },
      el(
        'thead',
        {},
        el('tr', {}, ['Prescribed brand', 'Active salt', 'Ask for (generic)', qtyHeader, 'Branded cost', 'Generic cost', savingHeader].map((h) => el('th', { scope: 'col' }, h))),
      ),
      el(
        'tbody',
        {},
        s.lines.map((l) =>
          el(
            'tr',
            {},
            el('td', {}, l.medicine.brandName),
            el('td', {}, l.medicine.activeSalt),
            el('td', {}, l.medicine.genericName),
            el('td', { class: 'num' }, String(l.qty)),
            el('td', { class: 'num' }, formatINR(l.brandTotal)),
            el('td', { class: 'num' }, formatINR(l.genericTotal)),
            el('td', { class: 'num' }, formatINR(l.saving)),
          ),
        ),
      ),
      el(
        'tfoot',
        {},
        el(
          'tr',
          {},
          el('th', { scope: 'row', colspan: 4 }, 'Total'),
          el('td', { class: 'num' }, formatINR(s.totalBrand)),
          el('td', { class: 'num' }, formatINR(s.totalGeneric)),
          el('td', { class: 'num' }, formatINR(s.totalSaving)),
        ),
      ),
    ),
    el(
      'p',
      { class: 'print-total' },
      monthly
        ? `You save ${formatINR(s.totalSaving)} per month (${s.overallPercent}%), about ${formatINR(s.yearlySaving)} per year.`
        : `You save ${formatINR(s.totalSaving)} per pack (${s.overallPercent}%).`,
    ),
    el('p', { class: 'print-disclaimer' }, MESSAGES.DISCLAIMER),
    el('p', { class: 'print-disclaimer' }, MESSAGES.PRICE_NOTE),
  );
}
