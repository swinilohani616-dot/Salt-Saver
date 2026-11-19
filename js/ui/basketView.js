/**
 * Monthly prescription basket panel (FR-03, FR-04).
 * On large screens it sits beside the results; on phones it is an offcanvas
 * opened from the sticky bottom bar.
 */
import { el, icon, $, renderInto } from './dom.js';
import { stepper } from './stepper.js';
import { getState, setState, subscribe } from '../state/store.js';
import { updateQuantity, removeFromBasket, restoreItem, clearBasket, calculateTotalSavings } from '../services/basketService.js';
import { getMedicine } from '../services/medicineService.js';
import { validateQuantity } from '../core/validate.js';
import { can } from '../core/roles.js';
import { formatINR } from '../core/sanitize.js';
import { MESSAGES } from '../config.js';
import { toast, confirmDialog } from './alerts.js';
import { printBasket } from './printView.js';

export function mountBasketView() {
  subscribe((state, prev) => {
    if (state.basket !== prev.basket || state.role !== prev.role || state.status !== prev.status) render(state);
  });
  render(getState());
}

function render(state) {
  const allowed = state.status === 'ready' && can(state.role, 'addToBasket');
  document.body.classList.toggle('no-basket', !allowed);
  $('#basket-column').hidden = !allowed;
  $('#basket-bar').hidden = !allowed;
  if (!allowed) return;

  const summary = calculateTotalSavings();
  const count = state.basket.length;
  $('#basket-count').textContent = String(count);
  $('#basket-bar-count').textContent = String(count);
  $('#basket-bar-saving').textContent = summary.ok ? `Save ${formatINR(summary.data.totalSaving)}/mo` : 'Empty';

  if (!summary.ok) {
    renderInto(
      $('#basket-body'),
      el('div', { class: 'empty-state py-4' }, icon('basket2', 'empty-icon'), el('p', { class: 'mb-0' }, MESSAGES.EMPTY_BASKET)),
    );
    return;
  }

  const s = summary.data;
  renderInto(
    $('#basket-body'),
    el('ul', { class: 'list-unstyled basket-list mb-3' }, s.lines.map(lineItem)),
    el(
      'dl',
      { class: 'basket-totals' },
      el('div', {}, el('dt', {}, 'Branded total'), el('dd', {}, formatINR(s.totalBrand))),
      el('div', {}, el('dt', {}, 'Generic total'), el('dd', {}, formatINR(s.totalGeneric))),
      el(
        'div',
        { class: 'total-saving' },
        el('dt', {}, 'You save per month'),
        el('dd', {}, formatINR(s.totalSaving), el('span', { class: 'saving-percent' }, ` (${s.overallPercent}%)`)),
      ),
      el('div', { class: 'yearly' }, el('dt', {}, 'That is per year'), el('dd', {}, formatINR(s.yearlySaving))),
    ),
    el(
      'div',
      { class: 'd-grid gap-2' },
      el('button', { type: 'button', class: 'btn btn-primary btn-lg', dataset: { focusKey: 'print' }, onClick: printBasket }, icon('printer', 'me-2'), 'Print savings sheet'),
      el('button', { type: 'button', class: 'btn btn-outline-danger', dataset: { focusKey: 'clear' }, onClick: handleClear }, icon('trash3', 'me-2'), 'Clear basket'),
    ),
  );
}

function lineItem(line) {
  const m = line.medicine;
  const errorId = `basket-error-${m.id}`;
  const error = el('div', { id: errorId, class: 'invalid-feedback d-block', role: 'alert' });

  const commit = (input, value) => {
    const r = updateQuantity(m.id, value);
    if (r.ok) {
      setState({ basket: r.data });
    } else {
      error.textContent = r.error.message;
      input.classList.add('is-invalid');
      input.setAttribute('aria-describedby', errorId);
      input.value = String(line.qty);
    }
  };

  return el(
    'li',
    { class: 'basket-item' },
    el(
      'div',
      { class: 'd-flex justify-content-between align-items-start gap-2' },
      el('div', {}, el('p', { class: 'fw-semibold mb-0' }, m.brandName), el('p', { class: 'small text-body-secondary mb-0' }, `Ask for: ${m.genericName}`)),
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-sm btn-link text-danger p-1',
          dataset: { focusKey: `remove-${m.id}` },
          aria: { label: `Remove ${m.brandName} from basket` },
          onClick: () => handleRemove(m.id),
        },
        icon('trash3'),
      ),
    ),
    el(
      'div',
      { class: 'd-flex flex-wrap justify-content-between align-items-center gap-2 mt-2' },
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
          if (!q.ok) {
            error.textContent = q.error.message;
            input.classList.add('is-invalid');
            input.setAttribute('aria-describedby', errorId);
            input.value = String(line.qty);
            return;
          }
          if (q.data !== line.qty) commit(input, q.data);
        },
      }),
      el('span', { class: 'line-saving' }, `Save ${formatINR(line.saving)}/mo`),
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
  const r = removeFromBasket(medicineId);
  if (!r.ok) return;
  setState({ basket: r.data.basket });
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
  if (yes) setState({ basket: clearBasket().data });
}
