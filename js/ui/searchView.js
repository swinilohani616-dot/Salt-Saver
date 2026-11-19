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

let input;
let timer;

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

function runSearch(raw) {
  const query = raw.trim();
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
      renderInto(
        container,
        el(
          'div',
          { class: 'row row-cols-1 row-cols-xl-2 g-3' },
          search.results.map(({ medicine, sameSalt }) =>
            el(
              'div',
              { class: 'col' },
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
      renderInto(
        container,
        el(
          'div',
          { class: 'empty-state', role: 'alert' },
          icon('search', 'empty-icon'),
          el('p', { class: 'h5 mb-2' }, search.message),
          el('p', { class: 'mb-3 text-body-secondary' }, 'For example, search "Paracetamol" instead of a brand name.'),
          el('div', { class: 'd-flex flex-wrap gap-2 justify-content-center' }, EXAMPLE_QUERIES.slice(1).map((q) => chip(q))),
        ),
      );
      break;
    case 'short':
      status.textContent = search.message;
      renderInto(container, el('p', { class: 'empty-state text-body-secondary' }, search.message));
      break;
    default:
      status.textContent = '';
      renderInto(
        container,
        el(
          'div',
          { class: 'empty-state' },
          icon('capsule-pill', 'empty-icon'),
          el('p', { class: 'h5 mb-2' }, 'Search a medicine to compare prices'),
          el(
            'p',
            { class: 'mb-0 text-body-secondary' },
            'Type the brand name from your prescription, like "Crocin", or the salt name, like "Paracetamol". SaltSaver shows the Jan Aushadhi generic with the same salt and how much you save.',
          ),
        ),
      );
  }
}

function handleAdd(medicineId, qty) {
  const result = addToBasket(medicineId, qty);
  if (result.ok) {
    setState({ basket: result.data });
    const { medicine } = getState().search.results.find((r) => r.medicine.id === medicineId) || {};
    const total = result.data.find((i) => i.medicineId === medicineId)?.quantityPerMonth || 0;
    toast(MESSAGES.added(medicine?.brandName || 'Medicine', total));
  }
  return result;
}

function updateInBasketHints(basket) {
  const qtyById = new Map(basket.map((i) => [i.medicineId, i.quantityPerMonth]));
  document.querySelectorAll('[data-in-basket-for]').forEach((node) => setInBasket(node, qtyById.get(node.dataset.inBasketFor) || 0));
}
