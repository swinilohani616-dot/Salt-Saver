/**
 * Search input, example chips and the results area (FR-01, BR-03).
 * Results states: idle · short · results · notfound (USER_WORKFLOW.md W2).
 */
import { el, icon, $, renderInto } from './dom.js';
import { medicineCard, setInBasket } from './medicineCard.js';
import { getState, setState, subscribe } from '../state/store.js';
import { searchMedicine } from '../services/medicineService.js';
import { addToBasket } from '../services/basketService.js';
import { normalizeText } from '../core/normalize.js';
import { can } from '../core/roles.js';
import { ERR } from '../core/errors.js';
import { SEARCH, MESSAGES, EXAMPLE_QUERIES } from '../config.js';
import { toast } from './alerts.js';
import { printComparison } from './printView.js';

const LAST_QUERY_KEY = 'saltsaver:v1:lastQuery';
let input;
let timer;
let lastRenderKey = '';

export function mountSearchView() {
  input = $('#search-input');
  const form = $('#search-form');

  renderInto($('#example-chips'), el('span', { class: 'me-1' }, 'Try:'), EXAMPLE_QUERIES.map((q) => chip(q)));

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value), SEARCH.debounceMs);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(timer);
    runSearch(input.value);
  });

  subscribe((state, prev) => {
    if (state.search !== prev.search || state.role !== prev.role || state.status !== prev.status) render(state);
    else if (state.basket !== prev.basket) updateInBasketHints(state.basket);
    if (state.status !== prev.status) input.disabled = state.status !== 'ready';
  });
  render(getState());
}

/** Runs a search for the given text and puts it in the input (used by chips and salt badges). */
export function searchFor(text) {
  input.value = text;
  runSearch(text);
  $('#results-heading').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/** Re-runs the last search of this tab, so "Continue searching" lands back on the same results. */
export function restoreLastSearch() {
  let last = '';
  try {
    last = sessionStorage.getItem(LAST_QUERY_KEY) || '';
  } catch {
    /* sessionStorage blocked */
  }
  if (last) {
    input.value = last;
    runSearch(last);
  }
}

function rememberQuery(query) {
  try {
    sessionStorage.setItem(LAST_QUERY_KEY, query);
  } catch {
    /* sessionStorage blocked */
  }
}

function runSearch(raw) {
  const query = raw.trim();
  rememberQuery(query);
  const normalized = normalizeText(query);
  if (normalized.length === 0) return setState({ search: { query: '', status: 'idle', results: [] } });
  if (normalized.length < SEARCH.minChars) return setState({ search: { query, status: 'short', results: [], message: MESSAGES.TOO_SHORT } });

  const result = searchMedicine(query);
  if (result.ok) setState({ search: { query, status: 'results', results: result.data } });
  else if (result.error.code === ERR.NOT_FOUND) setState({ search: { query, status: 'notfound', results: [], message: result.error.message } });
  else setState({ search: { query, status: 'short', results: [], message: result.error.message } });
}

function chip(text) {
  return el('button', { type: 'button', class: 'btn btn-sm example-chip', onClick: () => searchFor(text) }, text);
}

function render(state) {
  const container = $('#results');
  const status = $('#results-status');
  const { search } = state;

  if (state.status !== 'ready') {
    status.textContent = '';
    return;
  }

  switch (search.status) {
    case 'results': {
      const canAdd = can(state.role, 'addToBasket');
      const qtyById = new Map(state.basket.map((i) => [i.medicineId, i.quantityPerMonth]));
      status.textContent = MESSAGES.resultsCount(search.results.length, search.query);
      // Animate only when the set of cards actually changes, so typing more letters doesn't flicker.
      const renderKey = `${state.role}|${search.results.map((r) => r.medicine.id).join(',')}`;
      const animate = renderKey !== lastRenderKey;
      lastRenderKey = renderKey;
      renderInto(
        container,
        el(
          'div',
          { class: `row row-cols-1 row-cols-lg-2 g-3 results-grid${animate ? '' : ' is-static'}` },
          search.results.map(({ medicine, sameSalt }, index) =>
            el(
              'div',
              { class: 'col', style: `--i: ${Math.min(index, 8)}` },
              medicineCard({
                medicine,
                sameSalt,
                canAdd,
                inBasketQty: qtyById.get(medicine.id) || 0,
                onAdd: handleAdd,
                onSaltClick: searchFor,
                onPrint: printComparison,
              }),
            ),
          ),
        ),
      );
      break;
    }
    case 'notfound':
      status.textContent = search.message;
      lastRenderKey = '';
      renderInto(
        container,
        el(
          'div',
          { class: 'empty-state results-swap', role: 'alert' },
          icon('search', 'empty-icon'),
          el('p', { class: 'h5 mb-2' }, search.message),
          el('p', { class: 'mb-3 text-body-secondary' }, 'For example, search "Paracetamol" instead of a brand name.'),
          el('div', { class: 'd-flex flex-wrap gap-2 justify-content-center' }, EXAMPLE_QUERIES.slice(1).map((q) => chip(q))),
        ),
      );
      break;
    case 'short':
      status.textContent = search.message;
      lastRenderKey = '';
      renderInto(container, el('p', { class: 'empty-state results-swap text-body-secondary' }, search.message));
      break;
    default:
      status.textContent = '';
      lastRenderKey = '';
      renderInto(
        container,
        el(
          'div',
          { class: 'how-it-works results-swap' },
          el('h2', { class: 'h5 mb-3' }, 'How SaltSaver works'),
          el(
            'ol',
            { class: 'steps' },
            step('search', 'Search your medicine', 'Type the brand on your prescription, like "Crocin", or the salt, like "Paracetamol".'),
            step('arrow-left-right', 'Compare prices', 'See the Jan Aushadhi generic with the same salt and strength, and how much less it costs.'),
            step('cart3', 'Plan your month', 'Add medicines to your basket to see your total monthly saving, then print it for the pharmacy.'),
          ),
        ),
      );
  }
}

function step(iconName, title, text) {
  return el(
    'li',
    { class: 'step' },
    el('span', { class: 'step-icon' }, icon(iconName)),
    el('span', { class: 'd-block' }, el('strong', { class: 'd-block' }, title), el('span', { class: 'text-body-secondary' }, text)),
  );
}

function handleAdd(medicineId, qty) {
  const result = addToBasket(medicineId, qty);
  if (result.ok) {
    setState({ basket: result.data });
    const { medicine } = getState().search.results.find((r) => r.medicine.id === medicineId) || {};
    const total = result.data.find((i) => i.medicineId === medicineId)?.quantityPerMonth || 0;
    toast(MESSAGES.added(medicine?.brandName || 'Medicine', total), {
      action: { label: 'View basket', onClick: () => window.location.assign('cart.html') },
    });
  }
  return result;
}

function updateInBasketHints(basket) {
  const qtyById = new Map(basket.map((i) => [i.medicineId, i.quantityPerMonth]));
  document.querySelectorAll('[data-in-basket-for]').forEach((node) => setInBasket(node, qtyById.get(node.dataset.inBasketFor) || 0));
}
