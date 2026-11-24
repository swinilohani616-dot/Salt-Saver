/**
 * Prescription Basket page (cart.html) — FR-03, FR-04.
 * Each line: a Jan Aushadhi medicine, the price you pay now for the same medicine (entered
 * by you, optional), and the estimated monthly saving. Jan Aushadhi MRPs are refreshed from
 * the server when the page opens; if it cannot be reached, the saved MRPs are used and labelled.
 */
import { el, icon, $, renderInto } from './dom.js';
import { stepper } from './stepper.js';
import { referenceForm } from './referenceForm.js';
import { getState, setState, subscribe } from '../state/store.js';
import { updateQuantity, setReference, removeFromBasket, restoreItem, clearBasket, calculateTotalSavings, basketKey } from '../services/basketService.js';
import { getProducts } from '../services/catalogService.js';
import { saveReference, saveEntered, getEntered } from '../services/referenceService.js';
import { validateQuantity, hasReference } from '../core/validate.js';
import { can } from '../core/roles.js';
import { formatINR } from '../core/sanitize.js';
import { toPaise } from '../core/savings.js';
import { unitText, perUnitText, formatDate, sourceLabel, strengthText } from '../core/labels.js';
import { savingForLine, brandReference } from '../core/comparison.js';
import { isUserPrice } from '../core/basketMath.js';
import { MESSAGES } from '../config.js';
import { toast, confirmDialog } from './alerts.js';
import { printBasket } from './printView.js';
import { openRoleSelector } from './roleSelector.js';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduceMotion() ? 0 : ms));

/** Current Jan Aushadhi prices by alternative id (null = no longer listed). */
let livePrices = new Map();
/** Current verified MRPs of the brands compared with, by brand id. */
let liveReferences = new Map();
let refresh = { status: 'idle', at: null }; // idle | loading | done | failed
let renderedKeys = null;
let shownValues = new Map();
let editingPrice = null; // key of the line whose price form is open

export const getLivePrices = () => livePrices;
export const getLiveReferences = () => liveReferences;

export function mountBasketView() {
  subscribe((state, prev) => {
    if (state.basket !== prev.basket || state.role !== prev.role || state.status !== prev.status) render(state);
    if (state.status === 'ready' && prev.status !== 'ready') refreshPrices();
  });
  render(getState());
  if (getState().status === 'ready') refreshPrices();
}

/** Fetches the current MRPs of the generics in the basket, and of the brands whose verified price they are compared with. */
async function refreshPrices() {
  const { basket } = getState();
  const ids = [...new Set(basket.map((i) => i.alternativeId))];
  const brandIds = [...new Set(basket.filter((i) => i.productId && hasReference(i) && !isUserPrice(i)).map((i) => i.productId))];
  if (!ids.length) return;
  refresh = { status: 'loading', at: null };
  try {
    const products = await getProducts([...ids, ...brandIds]);
    const next = new Map(ids.map((id) => [id, null]));
    const references = new Map();
    for (const p of products) {
      if (brandIds.includes(p.id)) {
        const reference = brandReference(p);
        if (reference) references.set(p.id, reference);
      }
      if (ids.includes(p.id) && p.price?.amount > 0) next.set(p.id, { mrp: p.price.amount, count: p.price.packCount ?? null, unit: p.price.packUnit ?? null, updatedAt: p.price.updatedAt, strength: strengthText(p) ?? '' });
    }
    livePrices = next;
    liveReferences = references;
    refresh = { status: 'done', at: new Date().toISOString() };
  } catch {
    refresh = { status: 'failed', at: null };
  }
  render(getState());
}

function searchLink(label = 'Continue searching') {
  return el('a', { href: 'search.html', class: 'btn btn-outline-primary btn-lg' }, icon('search', 'me-2'), label);
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
        el('h2', { class: 'h4' }, icon('info-circle-fill', 'me-2'), 'The prescription basket is for patients and caregivers'),
        el('p', {}, `${MESSAGES.FORBIDDEN} Switch to Patient / Senior or Caregiver to save medicines and see your monthly savings.`),
        el('div', { class: 'd-flex flex-wrap gap-2' },
          el('button', { type: 'button', class: 'btn btn-primary btn-lg', onClick: openRoleSelector }, 'Change role'),
          searchLink('Back to search')),
      ),
    );
    return;
  }

  const summary = calculateTotalSavings(livePrices, liveReferences);
  if (!summary.ok) {
    resetRenderMemory();
    renderInto(
      container,
      el(
        'div',
        { class: 'empty-state' },
        icon('cart3', 'empty-icon'),
        el('h2', { class: 'h4 mb-2' }, 'Your prescription basket is empty'),
        el('p', { class: 'mb-3' }, 'Search a medicine and tap "Add to Comparison Basket". Add the price you pay now to see your total monthly savings here.'),
        searchLink('Search medicines'),
      ),
    );
    return;
  }

  const s = summary.data;
  const previous = renderedKeys;
  renderedKeys = new Set(s.lines.map((l) => basketKey(l.item)));
  let enterIndex = 0;
  const isNew = (key) => !previous || !previous.has(key);
  renderInto(
    container,
    el(
      'div',
      { class: 'row g-4' },
      el(
        'div',
        { class: 'col-lg-8' },
        el('h2', { class: 'visually-hidden' }, 'Medicines in your basket'),
        refreshNote(),
        el('p', { class: 'safety-reminder', role: 'note' }, icon('chat-heart', 'me-2'), el('span', {}, MESSAGES.BASKET_PURPOSE)),
        el('ul', { class: 'list-unstyled basket-list mb-3' }, s.lines.map((line) => lineItem(line, isNew(basketKey(line.item)) ? enterIndex++ : -1))),
        el('p', { class: 'disclaimer mb-0' }, icon('shield-exclamation', 'me-1'), `${MESSAGES.DISCLAIMER} ${MESSAGES.SAFETY_NOTE}`),
      ),
      el('div', { class: 'col-lg-4' }, summaryCard(s, state.basket.length)),
    ),
  );
  highlightChangedValues(container);
}

function refreshNote() {
  if (refresh.status === 'loading') return el('p', { class: 'small text-body-secondary' }, icon('arrow-repeat', 'me-1'), 'Checking current Jan Aushadhi MRPs…');
  if (refresh.status === 'failed') return el('p', { class: 'alert alert-warning py-2', role: 'status' }, icon('wifi-off', 'me-2'), 'Could not check current Jan Aushadhi MRPs. Showing the MRPs saved when you added each medicine.');
  return null;
}

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
  renderedKeys = null;
  shownValues = new Map();
}

function summaryCard(s, count) {
  const shown = (paise) => (s.compared > 0 ? formatINR(paise) : '—'); // nothing compared yet: no figure, rather than ₹0
  return el(
    'aside',
    { class: 'summary-card', aria: { labelledby: 'summary-title' } },
    el('h2', { id: 'summary-title', class: 'mb-3' }, 'Monthly comparison ',
      el('span', { class: 'badge rounded-pill basket-count', aria: { label: `${count} medicines` } }, String(count))),
    el(
      'dl',
      { class: 'basket-totals', aria: { live: 'polite' } },
      el('div', {}, el('dt', {}, 'Total reference price'), el('dd', { dataset: { valueKey: 'total-original' } }, shown(s.totalOriginal))),
      el('div', {}, el('dt', {}, 'Total alternative price'), el('dd', { dataset: { valueKey: 'total-alternative' } }, shown(s.totalAlternative))),
      el('div', { class: 'total-saving' }, el('dt', {}, 'Total potential savings'),
        el('dd', { dataset: { valueKey: 'total-saving' } }, shown(s.totalSaving), s.compared > 0 && el('span', { class: 'saving-percent' }, ` (${s.overallPercent}%)`))),
      el('div', { class: 'yearly' }, el('dt', {}, 'Estimated per year'), el('dd', { dataset: { valueKey: 'total-yearly' } }, shown(s.yearlySaving))),
    ),
    s.uncompared.count > 0 && el('p', { class: 'uncompared-note' }, icon('info-circle', 'me-1'),
      `${s.uncompared.count} ${s.uncompared.count === 1 ? 'medicine has' : 'medicines have'} no reference price (${formatINR(s.uncompared.cost)} a month) and ${s.uncompared.count === 1 ? 'is' : 'are'} not in these totals.`),
    el('div', { class: 'd-grid gap-2' },
      el('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { focusKey: 'print' }, onClick: printBasket }, icon('printer', 'me-2'), 'Print or save as PDF'),
      searchLink(),
      el('button', { type: 'button', class: 'btn btn-outline-danger', dataset: { focusKey: 'clear' }, onClick: handleClear }, icon('trash3', 'me-2'), 'Clear basket')),
    el('p', { class: 'small text-body-secondary mt-3 mb-0' }, MESSAGES.PRICE_NOTE),
  );
}

function lineItem(line, enterIndex = -1) {
  const i = line.item;
  const key = basketKey(i);
  const domKey = key.replace(':', '-');
  const headingId = `basket-${domKey}-title`;
  const errorId = `basket-error-${domKey}`;
  const error = el('div', { id: errorId, class: 'invalid-feedback d-block', role: 'alert' });
  const alt = line.alternativePrice ?? i.alternativePrice;
  const title = i.productName || i.alternativeName;

  const showError = (input, message) => {
    error.textContent = message;
    input.classList.add('is-invalid');
    input.setAttribute('aria-describedby', errorId);
    input.value = String(i.packsPerMonth);
  };
  const commit = (input, value) => {
    const r = updateQuantity(key, value);
    if (r.ok) setState({ basket: r.data });
    else showError(input, r.error.message);
  };

  const status = line.noLongerListed
    ? el('p', { class: 'alert alert-warning py-2 mb-2' }, icon('exclamation-triangle-fill', 'me-2'), 'This Jan Aushadhi medicine is not in the latest price list right now. The price you saved earlier is shown.')
    : line.priceChanged
      ? el('p', { class: 'small text-body-secondary mb-2' }, icon('arrow-repeat', 'me-1'), 'The Jan Aushadhi MRP has changed since you added it; the current MRP is used.')
      : null;

  return el(
    'li',
    {
      class: `basket-item${enterIndex >= 0 ? ' is-entering' : ''}`,
      style: enterIndex >= 0 ? `--i: ${Math.min(enterIndex, 6)}` : null,
      dataset: { basketKey: key },
      aria: { labelledby: headingId },
    },
    el('div', { class: 'd-flex justify-content-between align-items-start gap-2' },
      el('div', { class: 'min-w-0' },
        el('h3', { id: headingId }, title),
        i.composition && el('p', { class: 'small text-body-secondary mb-0' }, i.composition)),
      el('button', {
        type: 'button',
        class: 'btn btn-sm btn-outline-danger flex-shrink-0',
        dataset: { focusKey: `remove-${domKey}` },
        aria: { label: `Remove ${title} from comparison basket` },
        onClick: () => handleRemove(key, title),
      }, icon('trash3', 'me-1'), 'Remove')),
    el('p', { class: 'ask-for' }, icon('chat-left-text-fill', 'me-2'),
      i.productName ? `Ask about: ${i.alternativeName}${i.jaDrugCode ? ` (drug code ${i.jaDrugCode})` : ''}` : `Jan Aushadhi generic${i.jaDrugCode ? `, drug code ${i.jaDrugCode}` : ''}`),
    status,
    referenceBlock(i, key, domKey, line.reference),
    lineFacts(i, alt, line.reference),
    el('p', { class: 'unit-prices' }, sourceLabel('pmbi_product_list'),
      alt.updatedAt || i.alternativePrice.asOf ? `, ${line.priceChanged || livePrices.has(i.alternativeId) ? 'updated' : 'saved'} ${formatDate(alt.updatedAt || i.alternativePrice.asOf)}` : ''),
    el('div', { class: 'd-flex flex-wrap align-items-end justify-content-between gap-3 mt-3' },
      el('div', {},
        el('label', { for: `basket-qty-${domKey}`, class: 'form-label fw-semibold mb-1 d-block' }, 'Packs per month'),
        stepper({
          id: `basket-qty-${domKey}`,
          value: i.packsPerMonth,
          label: `Packs per month of ${title}`,
          focusKey: `basket-${domKey}`,
          onStep: (delta, input) => {
            const next = i.packsPerMonth + delta;
            if (next < 1) handleRemove(key, title, true);
            else commit(input, next);
          },
          onCommit: (input) => {
            const q = validateQuantity(input.value);
            if (!q.ok) showError(input, q.error.message);
            else if (q.data !== i.packsPerMonth) commit(input, q.data);
          },
        })),
      el('dl', { class: 'line-totals flex-grow-1' },
        el('div', { class: 'line-brand' }, el('dt', {}, 'Reference / month'), el('dd', { dataset: { valueKey: `${domKey}-original` } }, line.original === null ? '—' : formatINR(line.original))),
        el('div', { class: 'line-generic' }, el('dt', {}, 'Alternative / month'), el('dd', { dataset: { valueKey: `${domKey}-alternative` } }, line.alternative === null ? '—' : formatINR(line.alternative))),
        el('div', { class: 'line-saving' }, el('dt', {}, 'Savings / month'), el('dd', { dataset: { valueKey: `${domKey}-saving` } }, line.comparable ? formatINR(line.saving) : '—')))),
    error,
  );
}

/** Strength, pack size, price, reference price and potential savings, for one Jan Aushadhi pack. */
function lineFacts(i, alt, reference) {
  const missing = (text) => el('span', { class: 'fact-missing' }, text);
  const fact = (label, value) => el('div', {}, el('dt', {}, label), el('dd', {}, value));
  const pack = alt.count ? unitText(alt.unit, alt.count) : i.alternativePrice.packLabel;
  const s = savingForLine(i, alt, reference);
  return el(
    'dl',
    { class: 'result-facts basket-facts' },
    fact('Strength', i.strength || livePrices.get(i.alternativeId)?.strength || missing('See the name above')),
    fact('Pack size', pack || missing('Not listed')),
    fact('Jan Aushadhi price', alt.count ? `${formatINR(toPaise(alt.mrp))} (${formatINR(Math.round(toPaise(alt.mrp) / alt.count))} ${perUnitText(alt.unit)})` : formatINR(toPaise(alt.mrp))),
    fact('Reference price', s.ok ? `${formatINR(s.referenceForPack)} for ${unitText(s.unit, s.count)}` : missing('Not added yet')),
    fact('Potential savings', s.ok && s.cheaper
      ? el('span', { class: 'saving-badge' }, `Save ${formatINR(s.saving)} (${s.percent}%)`)
      : missing(s.ok ? 'No saving' : 'Needs your price')),
  );
}

/** The price compared with, and who vouches for it; otherwise a form to add yours when the two can be compared safely. */
function referenceBlock(i, key, domKey, reference) {
  const canCompare = !!i.formulationKey && !!i.alternativePrice.count;
  const open = (on) => {
    editingPrice = on ? key : null;
    render(getState());
    document.querySelector(on ? `#ref-mrp-${CSS.escape(domKey)}` : `[data-focus-key="price-${CSS.escape(domKey)}"]`)?.focus();
  };
  const edit = (label) => el('button', { type: 'button', class: 'btn btn-link reference-toggle', dataset: { focusKey: `price-${domKey}` }, onClick: () => open(true) }, label);
  if (editingPrice === key && canCompare) {
    return referenceForm({
      id: domKey,
      formulation: i.formulation || i.alternativeName,
      unit: i.alternativePrice.unit,
      plainRelease: i.formulationKey.endsWith('| ir'),
      value: isUserPrice(i) ? { mrp: i.enteredMrp, count: i.enteredCount } : null,
      onSave: (ref) => {
        const r = setReference(key, ref);
        if (!r.ok) return r.error.message;
        editingPrice = null;
        // The search page then shows the same saving: on the brand's card, or on the generic's.
        if (i.productId) saveEntered(i.productId, { ...ref, release: getEntered()[i.productId]?.release ?? '' });
        else saveReference(i.formulationKey, ref);
        setState({ basket: r.data });
        return null;
      },
      onCancel: () => open(false),
    });
  }
  if (reference) {
    const own = reference.source === 'user_entered';
    return el('p', { class: 'unit-prices mb-1' },
      `${own ? 'Your price' : `${i.productName || 'Brand'} MRP`} ${formatINR(toPaise(reference.mrp))} for ${unitText(reference.unit, reference.count)} `,
      own ? el('span', { class: 'entered-tag' }, 'entered by you')
        : [el('span', { class: 'entered-tag verified-tag' }, 'verified price'), ` ${sourceLabel(reference.source)}${reference.asOf ? `, ${formatDate(reference.asOf)}` : ''}. `],
      canCompare && edit(own ? 'Change' : 'Use my price'));
  }
  return canCompare
    ? el('p', { class: 'unit-prices mb-1' }, 'No reference price yet. ', edit('Add your price'))
    : el('p', { class: 'unit-prices mb-1' }, icon('info-circle', 'me-1'), MESSAGES.CANNOT_COMPARE);
}

async function handleRemove(key, name, ask = false) {
  if (ask) {
    const yes = await confirmDialog({ title: 'Remove medicine?', body: `Remove ${name} from your comparison basket?`, confirmLabel: 'Remove', danger: true });
    if (!yes) return;
  }
  const item = document.querySelector(`.basket-item[data-basket-key="${CSS.escape(key)}"]`);
  if (item) {
    item.classList.add('is-leaving');
    await wait(200);
  }
  const r = removeFromBasket(key);
  if (!r.ok) return;
  setState({ basket: r.data.basket });
  $('#basket-page')?.focus();
  toast(MESSAGES.removed(name), {
    variant: 'info',
    action: { label: 'Undo', onClick: () => setState({ basket: restoreItem(r.data.removed).data }) },
  });
}

async function handleClear() {
  const yes = await confirmDialog({ title: 'Clear basket?', body: 'This removes every medicine from My Prescription Savings Basket.', confirmLabel: 'Clear basket', danger: true });
  if (yes) {
    setState({ basket: clearBasket().data });
    $('#basket-page')?.focus();
  }
}
