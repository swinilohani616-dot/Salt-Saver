/**
 * Navbar cart icon + item-count badge. Reads the shared store; no cart state of its own.
 * Hidden for roles that cannot use the basket (Pharmacy Buyer).
 */
import { $ } from './dom.js';
import { getState, subscribe } from '../state/store.js';
import { can } from '../core/roles.js';

let lastPacks = null;

/** Small one-off scale on the badge when an item is added (CSS; off under reduced motion). */
function bump(badge) {
  badge.classList.remove('is-bumped');
  void badge.offsetWidth; // restart the animation
  badge.classList.add('is-bumped');
}

function render(state) {
  const link = $('#cart-link');
  const badge = $('#cart-count');
  if (!link || !badge) return;

  link.hidden = !!state.role && !can(state.role, 'addToBasket');
  const count = state.basket.length;
  badge.textContent = count > 0 ? String(count) : '';
  // Bump whenever something is added, including more packs of a medicine already in the basket.
  const packs = state.basket.reduce((sum, item) => sum + item.quantityPerMonth, 0);
  if (lastPacks !== null && packs > lastPacks && count > 0) bump(badge);
  if (state.status === 'ready') lastPacks = packs;
  link.setAttribute(
    'aria-label',
    count > 0 ? `Open Prescription Basket, ${count} ${count === 1 ? 'medicine' : 'medicines'}` : 'Open Prescription Basket, empty',
  );
}

export function mountCartBadge() {
  subscribe((state, prev) => {
    if (state.basket !== prev.basket || state.role !== prev.role) render(state);
  });
  render(getState());
}
