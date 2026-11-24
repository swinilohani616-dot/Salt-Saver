/**
 * The one medicine card. Every medicine is drawn by this template, from the slots in
 * core/cardModel.js: details on the left; price, savings and one action on the right.
 * The slots always appear, in the same order, so cards line up even when details differ.
 */
import { el, icon, renderInto } from './dom.js';
import { isInBasket } from '../core/comparison.js';

const ACTION_ICONS = { add: 'plus-circle', print: 'printer' };

/**
 * The action: one button of one size, and the row under it that says why the button is off, or
 * holds "View basket" and "Remove" once added. It redraws itself (slot.refresh) when the basket
 * changes, so the rest of the page, including a half-typed price, is left alone.
 */
function actionSlot(card, { basket = [], onAdd, onRemove, onPrint }) {
  const { kind, label, disabled, hint } = card.action;
  const focusKey = `action-${card.id}`;
  const slot = el('div', { class: `action-slot${kind === 'add' ? ' basket-slot' : ''}` });
  const draw = (button, links = null) => renderInto(slot, button, el('div', { class: 'card-links' }, links));
  if (kind !== 'add') {
    draw(el('button', { type: 'button', class: 'btn btn-compare', dataset: { focusKey }, aria: { label: `${label}: ${card.name}` }, onClick: onPrint }, icon(ACTION_ICONS[kind], 'me-2'), label));
    return slot;
  }
  let was = null;
  slot.refresh = (items) => {
    const added = isInBasket(items, card.id);
    if (added === was) return;
    const animate = was !== null;
    was = added;
    if (added) {
      draw(
        el('button', { type: 'button', class: `btn btn-compare is-added${animate ? ' is-just-added' : ''}`, dataset: { focusKey }, aria: { disabled: 'true', label: `${card.name}: added to comparison basket` } }, 'Added ✓'),
        [
          el('a', { href: 'cart.html' }, 'View basket'),
          el('button', { type: 'button', class: 'btn btn-link', aria: { label: `Remove ${card.name} from comparison basket` }, onClick: onRemove }, 'Remove'),
        ],
      );
    } else {
      draw(
        el('button', { type: 'button', class: 'btn btn-compare', disabled, dataset: { focusKey }, aria: { label: `Add ${card.name} to comparison basket` }, onClick: onAdd }, icon(ACTION_ICONS.add, 'me-2'), label),
        hint ? el('span', { class: 'action-hint' }, hint) : null,
      );
    }
  };
  slot.refresh(basket);
  return slot;
}

const editLink = (card, label, onClick) => el('button', { type: 'button', class: 'btn btn-link reference-toggle', dataset: { focusKey: `ref-${card.id}` }, aria: { label: `${label}: ${card.name}` }, onClick }, label);

/** The price, who vouches for it, and a way to use the price printed on your own pack instead. */
function priceSlot(card, { onEditPrice, onClearPrice }) {
  const { label, text, note, tag, available } = card.price;
  const { links } = card.saving;
  return el(
    'div',
    { class: 'result-price' },
    el('p', { class: 'price-label mb-0' }, label),
    el('p', { class: `price-amount mb-0${available ? '' : ' is-missing'}` }, text),
    el('p', { class: 'price-pack mb-0' }, note),
    el('div', { class: 'price-tag-row' },
      links === 'override' && editLink(card, 'Use my price', onEditPrice),
      links === 'own' && [editLink(card, 'Change', onEditPrice), el('button', { type: 'button', class: 'btn btn-link', aria: { label: `Clear your price: ${card.name}` }, onClick: onClearPrice }, 'Clear')],
      el('span', { class: `price-tag price-tag-${tag.tone}` }, icon(tag.icon, 'me-1'), tag.text)),
  );
}

/** The saving and what it was measured against, or a short reason why there is no saving. */
function savingSlot(card, { onEditPrice }) {
  const { kind, text } = card.saving;
  return el(
    'div',
    { class: 'saving-slot' },
    el('p', { class: 'slot-label mb-0' }, 'Potential savings'),
    kind === 'badge' && el('span', { class: 'saving-badge' }, icon('arrow-down-short', 'me-1'), text),
    kind === 'note' && el('p', { class: 'saving-none mb-0' }, text),
    kind === 'prompt' && editLink(card, text, onEditPrice),
    card.reference && el('p', { class: 'saving-detail mb-0' }, card.reference),
  );
}

const tagClass = { verified: 'status-verified', review: 'status-review', missing: 'status-missing', mismatch: 'status-mismatch', demo: 'source-demo' };

/**
 * @param {object} card from core/cardModel.js
 * @param {{heading?:'h3'|'h4', basket?:object[], onAdd?:() => void, onRemove?:() => void, onPrint?:() => void,
 *          onClearPrice?:() => void, priceForm?:(close:() => void) => HTMLElement}} [options]
 *        priceForm: builds the "price you pay" form
 */
export function medicineCard(card, options = {}) {
  const { heading = 'h4', priceForm, basket, onAdd, onRemove, onPrint, onClearPrice } = options;
  const headingId = `medicine-${card.id}-title`;
  const formSlot = el('div', { class: 'result-form', hidden: true });
  const closeForm = () => {
    formSlot.hidden = true;
    renderInto(formSlot);
    node.querySelector('.reference-toggle')?.focus();
  };
  const onEditPrice = () => {
    if (!formSlot.hidden) {
      closeForm();
      return;
    }
    renderInto(formSlot, priceForm(closeForm));
    formSlot.hidden = false;
    formSlot.querySelector('input')?.focus();
  };

  const node = el(
    'article',
    { class: `result-row${card.status ? ` has-status status-${card.status.tone}` : ''}`, aria: { labelledby: headingId }, dataset: { productId: card.id, kind: card.category.tone } },
    el(
      'div',
      { class: 'result-main' },
      el('div', { class: 'result-tags' },
        el('span', { class: `badge type-badge type-${card.category.tone}` }, card.category.text),
        card.tags.map((t) => el('span', { class: `badge status-badge ${tagClass[t.tone] ?? ''}` }, icon(t.icon, 'me-1'), t.text)),
        el('span', { class: 'result-form-name' }, card.form)),
      el(heading, { id: headingId, class: 'result-name' }, card.name),
      el('dl', { class: 'result-facts' }, card.facts.map((f) => el('div', {}, el('dt', {}, f.label), el('dd', { class: f.missing ? 'fact-missing' : null }, f.text)))),
      el('p', { class: 'match-note mb-0' }, card.match),
      el('p', { class: 'source-line mb-0' }, icon('database', 'me-1'), `Source: ${card.source}`),
    ),
    el(
      'div',
      { class: 'result-side' },
      priceSlot(card, { onEditPrice, onClearPrice }),
      savingSlot(card, { onEditPrice }),
      actionSlot(card, { basket, onAdd, onRemove, onPrint }),
    ),
    formSlot,
  );
  return node;
}
