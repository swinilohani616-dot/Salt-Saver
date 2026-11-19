/**
 * Safe DOM builder. Text is always set with textContent / text nodes, never
 * innerHTML, so medicine names from data can't inject markup (PRD §11).
 *
 * el('button', { class: 'btn', type: 'button', onClick: fn, aria: { label: 'Add' } }, 'Add')
 */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'aria') for (const [k, v] of Object.entries(value)) node.setAttribute(`aria-${k}`, String(v));
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Bootstrap Icons glyph, hidden from screen readers. */
export const icon = (name, extra = '') => el('i', { class: `bi bi-${name} ${extra}`.trim(), aria: { hidden: 'true' } });

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Replaces children while keeping keyboard focus on the element with the same data-focus-key. */
export function renderInto(container, ...children) {
  const focusKey = container.contains(document.activeElement) ? document.activeElement?.dataset?.focusKey : null;
  clear(container);
  append(container, children);
  if (focusKey) container.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
}

export const $ = (selector, root = document) => root.querySelector(selector);
