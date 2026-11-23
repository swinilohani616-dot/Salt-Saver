/**
 * Prescription Basket page (cart.html) — FR-03, FR-04.
 * Renders from the shared store and changes the basket only through basketService,
 * so there is one cart state for the whole app.
 */
import { el, icon, $, renderInto } from './dom.js';
import { stepper } from './stepper.js';
import { getState, setState, subscribe } from '../state/store.js';
import { updateQuantity, removeFromBasket, restoreItem, clearBasket, calculateTotalSavings } from '../services/basketService.js';
import { getMedicine } from '../services/medicineService.js';
import { validateQuantity } from '../core/validate.js';
import { can } from '../core/roles.js';
import { formatINR } from '../core/sanitize.js';
import { toPaise } from '../core/savings.js';
import { MESSAGES } from '../config.js';
import { toast, confirmDialog } from './alerts.js';
import { printBasket } from './printView.js';
import { openRoleSelector } from './roleSelector.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion() ? 0 : ms));

/** What was on screen last time, so only real changes animate. */
let renderedIds = null; // Set of medicine ids, null before the first basket render
let shownValues = new Map(); // data-value-key -> text

export function mountBasketView() {
  subscribe((state, prev) => {
    if (state.basket !== prev.basket || state.role !== prev.role || state.status !== prev.status) render(state);
  });
  render(getState());
}

function searchLink(label = 'Continue searching') {
  return el('a', { href: 'index.html', class: 'btn btn-outline-primary btn-lg' }, icon('search', 'me-2'), label);
}

function render(state) {
  const container = $('#basket-page');
  if (state.status !== 'ready') {
    resetRenderMemory();
    renderInto(container);
    return;
  }

  if (state.role && !can(state.role, 'addToBasket')) {
    resetRenderMemory();
    renderInto(
      container,
      el(
        'div',
        { class: 'notice-card' },
        el('h2', { class: 'h4' }, icon('info-circle-fill', 'me-2'), 'The basket is for patients and caregivers'),
        el('p', {}, `${MESSAGES.FORBIDDEN} Switch to Patient / Senior or Caregiver to save medicines and see monthly savings.`),
        el(
          'div',
          { class: 'd-flex flex-wrap gap-2' },
          el('button', { type: 'button', class: 'btn btn-primary btn-lg', onClick: openRoleSelector }, 'Change role'),
          searchLink('Back to search'),
        ),
      ),
    );
    return;
  }

  const summary = calculateTotalSavings();
  if (!summary.ok) {
    resetRenderMemory();
    renderInto(
      container,
      el(
        'div',
        { class: 'empty-state' },
        icon('cart3', 'empty-icon'),
        el('h2', { class: 'h4 mb-2' }, 'Your basket is empty'),
        el('p', { class: 'mb-3' }, 'Search a medicine and tap "Add to basket" to see your monthly savings here.'),
        searchLink('Search medicines'),
      ),
    );
    return;
  }

  const s = summary.data;
  const previousIds = renderedIds;
  renderedIds = new Set(s.lines.map((l) => l.medicine.id));
  let enterIndex = 0;
  const isNew = (id) => !previousIds || !previousIds.has(id);
  renderInto(
    container,
    el(
      'div',
      { class: 'row g-4' },
      el(
        'div',
        { class: 'col-lg-8' },
        el('h2', { class: 'visually-hidden' }, 'Medicines in your basket'),
        el('ul', { class: 'list-unstyled basket-list mb-3' }, s.lines.map((line) => lineItem(line, isNew(line.medicine.id) ? enterIndex++ : -1))),
        el('p', { class: 'disclaimer mb-0' }, icon('shield-check', 'me-1'), MESSAGES.DISCLAIMER),
      ),
      el('div', { class: 'col-lg-4' }, summaryCard(s, state.basket.length)),
    ),
  );
  highlightChangedValues(container);
}

/** Soft highlight on totals whose value changed (no counting animation). */
function highlightChangedValues(container) {
  const next = new Map();
  container.querySelectorAll('[data-value-key]').forEach((node) => {
    const key = node.dataset.valueKey;
    next.set(key, node.textContent);
    if (shownValues.has(key) && shownValues.get(key) !== node.textContent) node.classList.add('is-updated');
  });
  shownValues = next;
}

function resetRenderMemory() {
  renderedIds = null;
  shownValues = new Map();
}

function summaryCard(s, count) {
  return el(
    'aside',
    { class: 'summary-card', aria: { labelledby: 'summary-title' } },
    el(
      'h2',
      { id: 'summary-title', class: 'mb-3' },
      'Monthly summary ',
      el('span', { class: 'badge rounded-pill basket-count', aria: { label: `${count} medicines` } }, String(count)),
    ),
    el(
      'dl',
      { class: 'basket-totals', aria: { live: 'polite' } },
      el('div', {}, el('dt', {}, 'Branded total'), el('dd', { dataset: { valueKey: 'total-brand' } }, formatINR(s.totalBrand))),
      el('div', {}, el('dt', {}, 'Generic total'), el('dd', { dataset: { valueKey: 'total-generic' } }, formatINR(s.totalGeneric))),
      el(
        'div',
        { class: 'total-saving' },
        el('dt', {}, 'You save per month'),
        el('dd', { dataset: { valueKey: 'total-saving' } }, formatINR(s.totalSaving), el('span', { class: 'saving-percent' }, ` (${s.overallPercent}%)`)),
      ),
      el('div', { class: 'yearly' }, el('dt', {}, 'That is per year'), el('dd', { dataset: { valueKey: 'total-yearly' } }, formatINR(s.yearlySaving))),
    ),
    el(
      'div',
      { class: 'd-grid gap-2' },
      el('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { focusKey: 'print' }, onClick: printBasket }, icon('printer', 'me-2'), 'Print savings sheet'),
      searchLink(),
      el('button', { type: 'button', class: 'btn btn-outline-danger', dataset: { focusKey: 'clear' }, onClick: handleClear }, icon('trash3', 'me-2'), 'Clear basket'),
    ),
    el('p', { class: 'small text-body-secondary mt-3 mb-0' }, MESSAGES.PRICE_NOTE),
  );
}

function lineItem(line, enterIndex = -1) {
  const m = line.medicine;
  const headingId = `basket-${m.id}-title`;
  const errorId = `basket-error-${m.id}`;
  const error = el('div', { id: errorId, class: 'invalid-feedback d-block', role: 'alert' });

  const showError = (input, message) => {
    error.textContent = message;
    input.classList.add('is-invalid');
    input.setAttribute('aria-describedby', errorId);
    input.value = String(line.qty);
  };

  const commit = (input, value) => {
    const r = updateQuantity(m.id, value);
    if (r.ok) setState({ basket: r.data });
    else showError(input, r.error.message);
  };

  return el(
    'li',
    {
      class: `basket-item${enterIndex >= 0 ? ' is-entering' : ''}`,
      style: enterIndex >= 0 ? `--i: ${Math.min(enterIndex, 6)}` : null,
      dataset: { medicineId: m.id },
      aria: { labelledby: headingId },
    },
    el(
      'div',
      { class: 'd-flex justify-content-between align-items-start gap-2' },
      el(
        'div',
        { class: 'min-w-0' },
        el('h3', { id: headingId }, m.brandName),
        el('p', { class: 'small text-body-secondary mb-0' }, `Active salt: ${m.activeSalt}${m.packSize ? ` · ${m.packSize}` : ''}`),
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-sm btn-outline-danger flex-shrink-0',
          dataset: { focusKey: `remove-${m.id}` },
          aria: { label: `Remove ${m.brandName} from basket` },
          onClick: () => handleRemove(m.id),
        },
        icon('trash3', 'me-1'),
        'Remove',
      ),
    ),
    el('p', { class: 'ask-for' }, icon('arrow-right-circle-fill', 'me-2'), `Ask for: ${m.genericName}`),
    el(
      'p',
      { class: 'unit-prices' },
      `Branded ${formatINR(toPaise(m.brandPrice))} vs generic ${formatINR(toPaise(m.genericPrice))} per pack · Save ${line.percent}%`,
    ),
    el(
      'div',
      { class: 'd-flex flex-wrap align-items-end justify-content-between gap-3 mt-3' },
      el(
        'div',
        {},
        el('label', { for: `basket-qty-${m.id}`, class: 'form-label fw-semibold mb-1 d-block' }, 'Packs per month'),
        stepper({
          id: `basket-qty-${m.id}`,
          value: line.qty,
          label: `Packs per month of ${m.brandName}`,
          focusKey: `basket-${m.id}`,
          onStep: (delta, input) => {
            const next = line.qty + delta;
            if (next < 1) handleRemove(m.id, true);
            else commit(input, next);
          },
          onCommit: (input) => {
            const q = validateQuantity(input.value);
            if (!q.ok) showError(input, q.error.message);
            else if (q.data !== line.qty) commit(input, q.data);
          },
        }),
      ),
      el(
        'dl',
        { class: 'line-totals flex-grow-1' },
        el('div', { class: 'line-brand' }, el('dt', {}, 'Branded / month'), el('dd', { dataset: { valueKey: `${m.id}-brand` } }, formatINR(line.brandTotal))),
        el('div', { class: 'line-generic' }, el('dt', {}, 'Generic / month'), el('dd', { dataset: { valueKey: `${m.id}-generic` } }, formatINR(line.genericTotal))),
        el('div', { class: 'line-saving' }, el('dt', {}, 'You save / month'), el('dd', { dataset: { valueKey: `${m.id}-saving` } }, formatINR(line.saving))),
      ),
    ),
    error,
  );
}

async function handleRemove(medicineId, ask = false) {
  const name = getMedicine(medicineId)?.brandName || 'Medicine';
  if (ask) {
    const yes = await confirmDialog({ title: 'Remove medicine?', body: `Remove ${name} from your basket?`, confirmLabel: 'Remove', danger: true });
    if (!yes) return;
  }
  const item = document.querySelector(`.basket-item[data-medicine-id="${CSS.escape(medicineId)}"]`);
  if (item) {
    item.classList.add('is-leaving');
    await wait(200);
  }
  const r = removeFromBasket(medicineId);
  if (!r.ok) return;
  setState({ basket: r.data.basket });
  $('#basket-page')?.focus();
  toast(MESSAGES.removed(name), {
    variant: 'info',
    action: { label: 'Undo', onClick: () => setState({ basket: restoreItem(r.data.removed).data }) },
  });
}

async function handleClear() {
  const yes = await confirmDialog({
    title: 'Clear basket?',
    body: 'This removes every medicine from your monthly basket.',
    confirmLabel: 'Clear basket',
    danger: true,
  });
  if (yes) {
    setState({ basket: clearBasket().data });
    $('#basket-page')?.focus();
  }
}
