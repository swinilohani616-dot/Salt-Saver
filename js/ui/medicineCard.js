/**
 * Generic substitute comparison card (FR-02, BR-02).
 */
import { el, icon } from './dom.js';
import { stepper } from './stepper.js';
import { formatINR } from '../core/sanitize.js';
import { toPaise, unitSaving, savingPercent } from '../core/savings.js';
import { validateQuantity } from '../core/validate.js';
import { MESSAGES, QTY } from '../config.js';

/**
 * @param {{medicine:object, sameSalt:object[], canAdd:boolean, inBasketQty:number,
 *          onAdd:(id:string, qty:number) => {ok:boolean,error?:{message:string}},
 *          onSaltClick:(salt:string) => void, onPrint:(medicine:object) => void}} props
 */
export function medicineCard({ medicine: m, sameSalt, canAdd, inBasketQty, onAdd, onSaltClick, onPrint }) {
  const headingId = `med-${m.id}-title`;
  const saving = unitSaving(m);
  const percent = savingPercent(m);
  const meta = [m.manufacturer, m.packSize].filter(Boolean).join(' · ');

  const savingRow =
    saving > 0
      ? el(
          'div',
          { class: 'save-row' },
          el('span', { class: 'badge save-badge' }, icon('arrow-down-circle-fill', 'me-1'), `Save ${percent}%`),
          el('span', { class: 'save-text' }, `You save ${formatINR(saving)} on every pack`),
        )
      : el('div', { class: 'save-row' }, el('span', { class: 'badge text-bg-secondary' }, 'No saving'));

  return el(
    'article',
    { class: 'card med-card h-100', aria: { labelledby: headingId }, dataset: { medicineId: m.id } },
    el(
      'div',
      { class: 'card-body d-flex flex-column gap-3' },
      el(
        'header',
        { class: 'd-flex justify-content-between align-items-start gap-2' },
        el('div', {}, el('h3', { id: headingId, class: 'h4 mb-1' }, m.brandName), meta && el('p', { class: 'text-body-secondary mb-0 small' }, meta)),
        m.category && el('span', { class: 'badge category-badge' }, m.category),
      ),
      el(
        'div',
        { class: 'd-flex flex-wrap align-items-center gap-2' },
        el('span', { class: 'label-eyebrow' }, 'Active salt:'),
        el(
          'button',
          {
            type: 'button',
            class: 'btn btn-sm salt-chip',
            aria: { label: `Show all medicines with ${m.activeSalt}` },
            onClick: () => onSaltClick(m.activeSalt),
          },
          icon('capsule', 'me-1'),
          m.activeSalt,
        ),
      ),
      el(
        'dl',
        { class: 'price-compare mb-0' },
        el('div', { class: 'price-cell price-brand' }, el('dt', {}, 'Branded'), el('dd', { class: 'price' }, formatINR(toPaise(m.brandPrice))), el('dd', { class: 'small text-body-secondary' }, 'per pack')),
        el(
          'div',
          { class: 'price-cell price-generic' },
          el('dt', {}, 'Jan Aushadhi generic'),
          el('dd', { class: 'price' }, formatINR(toPaise(m.genericPrice))),
          el('dd', { class: 'small' }, m.genericName),
        ),
      ),
      savingRow,
      sameSalt.length > 0 &&
        el(
          'p',
          { class: 'small mb-0 text-body-secondary' },
          el('strong', {}, 'Same salt also sold as: '),
          sameSalt.map((o) => `${o.brandName} (${formatINR(toPaise(o.brandPrice))})`).join(', '),
        ),
      canAdd ? addForm(m, inBasketQty, onAdd) : printButton(m, onPrint),
      el('p', { class: 'disclaimer mb-0 mt-auto' }, icon('shield-check', 'me-1'), MESSAGES.DISCLAIMER),
    ),
  );
}

function addForm(m, inBasketQty, onAdd) {
  const qtyId = `qty-${m.id}`;
  const errorId = `qty-error-${m.id}`;
  const error = el('div', { id: errorId, class: 'invalid-feedback d-block', role: 'alert' });
  const inBasket = el('span', { class: 'in-basket small', dataset: { inBasketFor: m.id } });
  setInBasket(inBasket, inBasketQty);

  const showError = (input, message) => {
    error.textContent = message || '';
    input.classList.toggle('is-invalid', !!message);
    if (message) input.setAttribute('aria-describedby', errorId);
    else input.removeAttribute('aria-describedby');
  };

  const qtyControl = stepper({
    id: qtyId,
    value: 1,
    label: 'Packs per month',
    focusKey: `card-${m.id}`,
    onStep: (delta, input) => {
      const current = validateQuantity(input.value);
      const base = current.ok ? current.data : 1;
      input.value = String(Math.min(QTY.max, Math.max(QTY.min, base + delta)));
      showError(input, '');
    },
    onCommit: (input) => {
      const r = validateQuantity(input.value);
      showError(input, r.ok ? '' : r.error.message);
    },
  });

  const addLabel = el('span', {}, 'Add to basket');
  const addIcon = icon('basket2-fill', 'me-2');
  const addButton = el('button', { type: 'submit', class: 'btn btn-primary btn-lg add-button' }, addIcon, addLabel);
  let addedTimer;

  /** Short "Added" confirmation; width is locked so nothing around the button moves. */
  const showAdded = () => {
    clearTimeout(addedTimer);
    addButton.style.minWidth = `${addButton.offsetWidth}px`;
    addButton.classList.add('is-added');
    addIcon.className = 'bi bi-check-lg me-2';
    addLabel.textContent = 'Added';
    addedTimer = setTimeout(() => {
      addButton.classList.remove('is-added');
      addIcon.className = 'bi bi-basket2-fill me-2';
      addLabel.textContent = 'Add to basket';
      addButton.style.minWidth = '';
    }, 1600);
  };

  const form = el(
    'form',
    { class: 'add-form', novalidate: true },
    el('label', { for: qtyId, class: 'form-label fw-semibold mb-1' }, 'Packs per month'),
    el(
      'div',
      { class: 'd-flex flex-wrap gap-2 align-items-center' },
      qtyControl,
      addButton,
    ),
    error,
    inBasket,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input');
    const result = onAdd(m.id, input.value);
    if (result.ok) {
      showError(input, '');
      input.value = '1';
      showAdded();
    } else {
      showError(input, result.error.message);
      input.focus();
    }
  });
  return form;
}

function printButton(m, onPrint) {
  return el(
    'button',
    { type: 'button', class: 'btn btn-outline-primary align-self-start', onClick: () => onPrint(m) },
    icon('printer', 'me-2'),
    'Print this comparison',
  );
}

/** Updates the "In your basket" hint without re-rendering the card. */
export function setInBasket(node, qty) {
  node.textContent = qty > 0 ? `✓ In your basket: ${qty} ${qty === 1 ? 'pack' : 'packs'} per month` : '';
}
