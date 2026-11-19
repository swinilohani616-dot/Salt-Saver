/**
 * Large −/+ quantity stepper (44px+ targets for senior users).
 */
import { el, icon } from './dom.js';
import { QTY } from '../config.js';

/**
 * @param {{id:string, value:number, label:string, focusKey:string,
 *          onStep:(delta:number, input:HTMLInputElement) => void,
 *          onCommit:(input:HTMLInputElement) => void}} options
 */
export function stepper({ id, value, label, focusKey, onStep, onCommit }) {
  const input = el('input', {
    id,
    type: 'number',
    class: 'form-control text-center qty-input',
    inputmode: 'numeric',
    min: QTY.min,
    max: QTY.max,
    step: 1,
    value,
    dataset: { focusKey: `${focusKey}-input` },
    aria: { label },
  });
  input.addEventListener('change', () => onCommit(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit(input);
    }
  });

  return el(
    'div',
    { class: 'input-group qty-stepper' },
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-outline-secondary',
        dataset: { focusKey: `${focusKey}-minus` },
        aria: { label: `Decrease ${label.toLowerCase()}` },
        onClick: () => onStep(-1, input),
      },
      icon('dash-lg'),
    ),
    input,
    el(
      'button',
      {
        type: 'button',
        class: 'btn btn-outline-secondary',
        dataset: { focusKey: `${focusKey}-plus` },
        aria: { label: `Increase ${label.toLowerCase()}` },
        onClick: () => onStep(1, input),
      },
      icon('plus-lg'),
    ),
  );
}
