/**
 * Search page: input with autocomplete, and the results. One search gives everything: the branded
 * medicines, the generics they can be compared with, prices and savings (see ui/resultGroup.js).
 * Results states: idle · short · loading · results · notfound · error.
 */
import { el, icon, $, renderInto } from './dom.js';
import { resultGroups, safetyReminder } from './resultGroup.js';
import { getState, setState, subscribe } from '../state/store.js';
import { searchCatalog, suggestNames, isAbort } from '../services/catalogService.js';
import { addComparison, applyReference, applyBrandReference, removeFromBasket, restoreItem, basketKey } from '../services/basketService.js';
import { getReferences, saveReference, getEntered, saveEntered } from '../services/referenceService.js';
import { comparisonLine, compareResults, brandReference } from '../core/comparison.js';
import { normalizeText } from '../core/normalize.js';
import { can } from '../core/roles.js';
import { SEARCH, SUGGEST, MESSAGES, EXAMPLE_QUERIES, STORAGE_PREFIX } from '../config.js';
import { toast } from './alerts.js';
import { printComparison } from './printView.js';

const LAST_QUERY_KEY = `${STORAGE_PREFIX}lastQuery`;
let input;
let datalist;
let searchTimer;
let suggestTimer;
let searchSeq = 0;
let lastRenderKey = '';

const session = {
  get(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sessionStorage blocked: the value lives only in memory */
    }
  },
};

export function mountSearchView() {
  input = $('#search-input');
  datalist = $('#search-suggestions');
  const form = $('#search-form');

  renderInto($('#example-chips'), el('span', { class: 'me-1' }, 'Try:'), EXAMPLE_QUERIES.map((q) => chip(q)));

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    clearTimeout(suggestTimer);
    searchTimer = setTimeout(() => runSearch(input.value), SEARCH.debounceMs);
    suggestTimer = setTimeout(() => updateSuggestions(input.value), SUGGEST.debounceMs);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    runSearch(input.value);
  });

  subscribe((state, prev) => {
    const redraw = state.search !== prev.search || state.entered !== prev.entered || state.role !== prev.role || state.status !== prev.status || state.references !== prev.references;
    if (redraw) render(state);
    // A basket change only redraws the basket buttons, so a half-typed price is never lost.
    else if (state.basket !== prev.basket) document.querySelectorAll('#results .basket-slot').forEach((slot) => slot.refresh(state.basket));
    if (state.status !== prev.status) input.disabled = state.status !== 'ready';
  });
  render(getState());
}

/** Runs a search for the given text and puts it in the input (used by chips). */
export function searchFor(text) {
  input.value = text;
  runSearch(text);
  $('#results-heading').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/**
 * A search handed over in the address (the front page links to search.html?q=…).
 * The parameter is removed once read, so a later reload restores the latest search instead.
 */
function takeQueryFromUrl() {
  const url = new URL(window.location.href);
  const q = url.searchParams.get('q');
  if (q === null) return null;
  url.searchParams.delete('q');
  history.replaceState(history.state, '', url);
  return q.trim();
}

/**
 * Runs the search handed over in the address, or else re-runs the last search of this tab,
 * so "Continue searching" lands back on the same results.
 */
export function restoreLastSearch() {
  const last = takeQueryFromUrl() || session.get(LAST_QUERY_KEY);
  if (typeof last === 'string' && last) {
    input.value = last;
    runSearch(last);
  }
}

async function updateSuggestions(raw) {
  const q = raw.trim();
  if (normalizeText(q).length < SEARCH.minChars) {
    renderInto(datalist);
    return;
  }
  try {
    const suggestions = await suggestNames(q);
    renderInto(datalist, suggestions.map((s) => el('option', { value: s.value ?? s.label, label: s.label !== (s.value ?? s.label) ? s.label : null })));
  } catch {
    /* suggestions are optional */
  }
}

async function runSearch(raw) {
  const query = raw.trim();
  session.set(LAST_QUERY_KEY, query);
  const seq = ++searchSeq;
  const normalized = normalizeText(query);
  if (normalized.length === 0) return setState({ search: { query: '', status: 'idle', body: null } });
  if (normalized.length < SEARCH.minChars) return setState({ search: { query, status: 'short', body: null, message: MESSAGES.TOO_SHORT } });

  setState({ search: { ...getState().search, query, status: 'loading' } });
  try {
    const body = await searchCatalog(query);
    if (seq !== searchSeq) return;
    if (!body.groups.length && !body.other.length) setState({ search: { query, status: 'notfound', body: null, message: MESSAGES.NOT_FOUND } });
    else setState({ search: { query, status: 'results', body } });
  } catch (error) {
    if (isAbort(error) || seq !== searchSeq) return;
    setState({ search: { query, status: 'error', body: null, message: error.message } });
  }
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
    case 'loading':
      status.textContent = 'Searching…';
      if (!search.body) renderInto(container, el('div', { class: 'text-center py-5' }, el('div', { class: 'spinner-border text-primary', aria: { hidden: 'true' } })));
      break;
    case 'results': {
      const { body } = search;
      status.textContent = MESSAGES.resultsCount(body, search.query);
      const renderKey = JSON.stringify([search.query, body.groups.map((g) => g.key)]);
      const animate = renderKey !== lastRenderKey;
      lastRenderKey = renderKey;
      const references = getReferences();
      const context = {
        comparison: compareResults(body, { entered: getEntered(), references }),
        references,
        basket: state.basket,
        canAdd: can(state.role, 'addToBasket'),
        onAdd: handleAdd,
        onRemove: handleRemove,
        onPrice: handlePrice,
        onPrint: (group) => printComparison(group, context.comparison),
      };
      renderInto(
        container,
        safetyReminder(body),
        body.matchedBy === 'similar' && el('p', { class: 'similar-note', role: 'status' }, icon('info-circle', 'me-2'), MESSAGES.similar(search.query)),
        el('div', { class: `result-groups${animate ? '' : ' is-static'}` }, resultGroups(body, context, search.query)),
        body.notEquivalent > 0 && el('p', { class: 'not-shown-note' }, icon('info-circle', 'me-1'), MESSAGES.notShown(body.notEquivalent)),
        body.truncated && el('p', { class: 'not-shown-note' }, icon('info-circle', 'me-1'), MESSAGES.TRUNCATED),
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
          el('p', { class: 'mb-3 text-body-secondary' }, 'You can try one of these:'),
          el('div', { class: 'd-flex flex-wrap gap-2 justify-content-center' }, EXAMPLE_QUERIES.slice(1).map((q) => chip(q))),
        ),
      );
      break;
    case 'error':
      status.textContent = search.message;
      lastRenderKey = '';
      renderInto(container, errorState(search.message, () => runSearch(search.query)));
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
            step('search', 'Search your medicine', 'Type a brand name, like "Crocin", or an active salt, like "Paracetamol".'),
            step('capsule', 'See the active salt', 'Your medicine and the Jan Aushadhi generics of the same salt, strength and form appear together.'),
            step('arrow-left-right', 'Compare the price', 'Savings are shown at once where a verified price is known. Otherwise, enter the MRP on your pack.'),
            step('cart3', 'Save your monthly list', 'Add verified matches to My Prescription Savings Basket, then print the list for the pharmacy.'),
          ),
        ),
      );
  }
}

function errorState(message, retry) {
  return el(
    'div',
    { class: 'empty-state results-swap', role: 'alert' },
    icon('exclamation-octagon', 'empty-icon'),
    el('p', { class: 'h5 mb-3' }, message),
    el('button', { type: 'button', class: 'btn btn-primary btn-lg', onClick: retry }, icon('arrow-clockwise', 'me-2'), 'Try again'),
  );
}

function step(iconName, title, text) {
  return el(
    'li',
    { class: 'step' },
    el('span', { class: 'step-icon' }, icon(iconName)),
    el('span', { class: 'd-block' }, el('strong', { class: 'd-block' }, title), el('span', { class: 'text-body-secondary' }, text)),
  );
}

/**
 * Adds a comparison to the basket. From a generic card: that generic, with the brand and price its
 * saving was worked out from. From a brand card: the brand with its best matching generic.
 */
function handleAdd(product) {
  const { body } = getState().search;
  const comparison = compareResults(body, { entered: getEntered(), references: getReferences() });
  const view = product.isJanAushadhi ? comparison.generics.get(product.id) : comparison.brands.get(product.id);
  const generic = product.isJanAushadhi ? product : view?.generic;
  const from = !view?.saving.ok ? {} : { product: product.isJanAushadhi ? (view.ownPrice ? null : view.brand) : product, reference: view.reference };
  const line = generic ? comparisonLine(generic, from) : null;
  const result = line ? addComparison(line) : { ok: false, error: { message: MESSAGES.UNKNOWN_MEDICINE } };
  if (!result.ok) {
    toast(result.error.message, { variant: 'danger' });
    return;
  }
  setState({ basket: result.data.basket });
  // The card itself now shows "View basket", so the notification needs no button of its own.
  if (result.data.added) toast(MESSAGES.added(product.name), { group: 'basket-added' });
}

function handleRemove(product) {
  const item = getState().basket.find((i) => (product.isJanAushadhi ? i.alternativeId : i.productId) === product.id);
  const result = item && removeFromBasket(basketKey(item));
  if (!result?.ok) return;
  setState({ basket: result.data.basket });
  toast(MESSAGES.removed(product.name), {
    variant: 'info',
    action: { label: 'Undo', onClick: () => setState({ basket: restoreItem(result.data.removed).data }) },
  });
}

/**
 * Saves (or clears) what you typed from your pack, for a brand or for a generic's formulation.
 * Every card it concerns then shows its saving, and so does the basket if it is already there.
 */
function handlePrice(product, value) {
  const allowed = can(getState().role, 'addToBasket');
  let applied = null;
  if (product.isJanAushadhi) {
    saveReference(product.formulationKey, value);
    if (value && allowed) applied = applyReference(product.formulationKey, value);
  } else {
    saveEntered(product.id, value);
    if (allowed) applied = applyBrandReference(product.id, brandReference(product, value));
  }
  setState({ entered: getEntered(), references: getReferences(), ...(applied?.ok ? { basket: applied.data } : {}) });
}
