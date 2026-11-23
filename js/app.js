/**
 * App start-up (ARCHITECTURE.md §6.1), shared by both pages:
 *   index.html  (data-page="search") → search + comparison cards
 *   cart.html   (data-page="cart")   → Prescription Basket page
 * storage check → load DB → restore basket/role/prefs → init store → mount views.
 */
import { STORAGE_KEYS, DEFAULT_PREFS, FONT_SCALES, MESSAGES } from './config.js';
import { isValidRole } from './core/roles.js';
import * as storage from './services/storage.js';
import { loadDatabase, resetDemo } from './services/dataService.js';
import { initBasket, resetBasketMemory } from './services/basketService.js';
import { initStore, getState, setState } from './state/store.js';
import { $ } from './ui/dom.js';
import { toast, showStorageBanner, confirmDialog } from './ui/alerts.js';
import { mountSearchView, restoreLastSearch } from './ui/searchView.js';
import { mountBasketView } from './ui/basketView.js';
import { mountCartBadge } from './ui/cartBadge.js';
import { mountRoleSelector, openRoleSelector } from './ui/roleSelector.js';
import { mountA11yControls } from './ui/a11yControls.js';
import { printBasket } from './ui/printView.js';

const PAGE = document.body.dataset.page === 'cart' ? 'cart' : 'search';
const IDLE_SEARCH = Object.freeze({ query: '', status: 'idle', results: [] });

function readPrefs() {
  const saved = storage.getJSON(STORAGE_KEYS.prefs, {}) || {};
  return {
    fontScale: FONT_SCALES.includes(saved.fontScale) ? saved.fontScale : DEFAULT_PREFS.fontScale,
    highContrast: saved.highContrast === true,
  };
}

function readRole() {
  const role = storage.getJSON(STORAGE_KEYS.role);
  return isValidRole(role) ? role : null;
}

/** Re-reads basket, role and prefs from storage (another tab changed them, or Back restored a cached page). */
function resyncFromStorage() {
  if (getState().status !== 'ready') return;
  setState({ role: readRole() ?? getState().role, prefs: readPrefs(), basket: initBasket() });
}

async function boot() {
  storage.onFallback(() => {
    showStorageBanner();
    setState({ storageFallback: true });
  });
  storage.initStorage();

  initStore({
    status: 'loading',
    role: readRole(),
    prefs: readPrefs(),
    search: IDLE_SEARCH,
    basket: [],
    storageFallback: storage.isMemoryMode(),
  });
  if (storage.isMemoryMode()) showStorageBanner();

  mountA11yControls();
  mountRoleSelector();
  mountCartBadge();
  if (PAGE === 'search') mountSearchView();
  else mountBasketView();
  bindGlobalButtons();

  const loaded = await loadDatabase();
  $('#loading-state').hidden = true;
  if (!loaded.ok) {
    $('#load-error').hidden = false;
    setState({ status: 'error' });
    return;
  }

  setState({ status: 'ready', basket: initBasket(() => getState().role) });
  if (PAGE === 'search') restoreLastSearch();
  if (!getState().role) openRoleSelector();

  // Keep every open page in sync: other tabs (storage event) and Back/Forward cache (pageshow).
  window.addEventListener('storage', (event) => {
    if ([STORAGE_KEYS.basket, STORAGE_KEYS.role, STORAGE_KEYS.prefs].includes(event.key)) resyncFromStorage();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resyncFromStorage();
  });
}

function bindGlobalButtons() {
  $('#reset-button').addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Reset demo?',
      body: 'This clears your basket, role and display settings and reloads the sample medicines.',
      confirmLabel: 'Reset demo',
      danger: true,
    });
    if (!yes) return;

    resetBasketMemory();
    const loaded = await resetDemo();
    if (!loaded.ok) {
      toast(loaded.error.message, { variant: 'danger' });
      return;
    }
    const searchInput = $('#search-input');
    if (searchInput) searchInput.value = '';
    setState({ role: null, prefs: { ...DEFAULT_PREFS }, search: IDLE_SEARCH, basket: initBasket() });
    toast(MESSAGES.RESET_DONE, { variant: 'info' });
    openRoleSelector();
  });

  $('#banner-print').addEventListener('click', printBasket);
}

boot();
