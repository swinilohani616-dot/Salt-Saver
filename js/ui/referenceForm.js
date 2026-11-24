/**
 * "The price you pay now": MRP and pack size printed on the pack you already have, with a
 * confirmation that it is the same formulation. Used for branded and generic results and in
 * the basket. When the catalogue does not know a brand's release type, it is asked here too.
 */
import { el, icon } from './dom.js';
import { validateMrp, validatePackCount } from '../core/unitSavings.js';
import { unitText, STRIP_CHOICES, UNIT_CHOICES } from '../core/labels.js';

const ORAL_SOLIDS = ['tablet', 'capsule'];
const plural = (unit) => unitText(unit, 2).replace(/^2 /, '');

/**
 * @param {{id:string, formulation:string, unit:string|null, plainRelease:boolean, askRelease?:boolean,
 *          title?:string, value?:{mrp?:number, count?:number, unit?:string, release?:string}|null,
 *          listed?:{mrp:number, count:number}|null, submitLabel?:string,
 *          onSave:(ref:{mrp?:number, count?:number, unit?:string, release?:string}) => string|null, onCancel:() => void}} props
 *        unit: null asks for it; listed: the verified price, used as it is when the numbers are left alone;
 *        onSave returns an error message, or null when saved
 */
export function referenceForm({ id, formulation, unit, plainRelease, askRelease = false, title = 'What do you pay now for the same medicine?', value = null, listed = null, submitLabel = 'Show savings', onSave, onCancel }) {
  const mrpId = `ref-mrp-${id}`;
  const countId = `ref-count-${id}`;
  const sameId = `ref-same-${id}`;
  const stripId = `ref-strip-${id}`;
  const errorId = `ref-error-${id}`;
  const error = el('p', { id: errorId, class: 'invalid-feedback d-block mb-0', role: 'alert' });
  const mrp = el('input', { id: mrpId, class: 'form-control', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 32', value: value?.mrp ?? listed?.mrp ?? '', aria: { describedby: errorId } });
  const count = el('input', { id: countId, class: 'form-control', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 10', value: value?.count ?? listed?.count ?? '', aria: { describedby: errorId } });
  const same = el('input', { id: sameId, type: 'checkbox', class: 'form-check-input', checked: !!value, aria: { describedby: errorId } });
  const unitSelect = unit ? null : el('select', { class: 'form-select unit-select', aria: { label: 'Unit' } }, UNIT_CHOICES.map((u) => el('option', { value: u, selected: (value?.unit ?? 'tablet') === u }, plural(u))));
  const strip = askRelease ? el('select', { id: stripId, class: 'form-select' }, STRIP_CHOICES.map(([v, text]) => el('option', { value: v, selected: (value?.release ?? '') === v }, text))) : null;
  const plainNote = !askRelease && plainRelease && ORAL_SOLIDS.includes(unit) ? ', and the strip does not say SR, ER, XR, MR or CR' : '';

  const form = el(
    'form',
    { class: 'reference-form', novalidate: true },
    el('p', { class: 'reference-title mb-0' }, title),
    el('div', { class: 'reference-fields' },
      el('div', {}, el('label', { for: mrpId, class: 'form-label' }, 'MRP on your pack (₹)'), mrp),
      el('div', {}, el('label', { for: countId, class: 'form-label' }, unit ? `Pack contains (${plural(unit)})` : 'Pack contains'),
        unitSelect ? el('div', { class: 'input-group' }, count, unitSelect) : count)),
    strip && el('div', {}, el('label', { for: stripId, class: 'form-label' }, 'Does your strip say any of these after the name?'), strip),
    el('div', { class: 'form-check' }, same,
      el('label', { for: sameId, class: 'form-check-label' }, `My pack says ${formulation}${plainNote}.`)),
    error,
    el('div', { class: 'd-flex flex-wrap gap-2' },
      el('button', { type: 'submit', class: 'btn btn-primary' }, icon('check2', 'me-2'), submitLabel),
      el('button', { type: 'button', class: 'btn btn-outline-secondary', onClick: onCancel }, 'Cancel')),
    el('p', { class: 'reference-privacy mb-0' }, 'What you type stays on this device.'),
  );

  const showError = (message, field) => {
    error.textContent = message;
    for (const input of [mrp, count, same]) input.classList.toggle('is-invalid', input === field);
    field?.focus();
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const m = validateMrp(mrp.value);
    if (!m.ok) return showError(m.message, mrp);
    const c = validatePackCount(count.value);
    if (!c.ok) return showError(c.message, count);
    if (!same.checked) return showError('Tick the box if your pack is the same. Different medicines cannot be compared.', same);
    const release = strip ? { release: strip.value } : {};
    // Left as listed: the verified price stays the reference, and only the strip answer is kept.
    const asListed = listed && m.value === listed.mrp && c.value === listed.count;
    if (asListed && !release.release) return showError(strip ? 'Choose what your strip says, or change the price to match your pack.' : 'This is already the price shown.', mrp);
    const problem = onSave(asListed ? release : { mrp: m.value, count: c.value, unit: unitSelect ? unitSelect.value : unit, ...release });
    if (problem) showError(problem, mrp);
  });
  return form;
}
