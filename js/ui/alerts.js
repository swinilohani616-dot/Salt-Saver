/**
 * Toasts, the storage banner and the confirm dialog (Bootstrap 5 components).
 * Bootstrap's JS bundle is loaded as a global before the app modules.
 */
import { el, icon, $ } from './dom.js';

const { Toast, Modal } = window.bootstrap;

/**
 * @param {string} message
 * @param {{variant?:'success'|'danger'|'info', action?:{label:string, onClick:() => void}, delay?:number}} [options]
 */
export function toast(message, { variant = 'success', action, delay = 5000 } = {}) {
  const icons = { success: 'check-circle-fill', danger: 'exclamation-triangle-fill', info: 'info-circle-fill' };
  const body = el(
    'div',
    { class: 'd-flex align-items-center gap-2 toast-body' },
    icon(icons[variant] || icons.info, `text-${variant}`),
    el('span', { class: 'flex-grow-1' }, message),
    action &&
      el(
        'button',
        {
          type: 'button',
          class: 'btn btn-sm btn-outline-primary',
          onClick: () => {
            action.onClick();
            Toast.getInstance(node)?.hide();
          },
        },
        action.label,
      ),
    el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'toast', aria: { label: 'Close' } }),
  );
  const node = el(
    'div',
    { class: 'toast', role: variant === 'danger' ? 'alert' : 'status', aria: { live: variant === 'danger' ? 'assertive' : 'polite', atomic: 'true' } },
    body,
  );
  $('#toast-stack').append(node);
  node.addEventListener('hidden.bs.toast', () => node.remove());
  Toast.getOrCreateInstance(node, { delay: action ? Math.max(delay, 6000) : delay }).show();
}

export function showStorageBanner() {
  $('#storage-banner').hidden = false;
}

/**
 * In-page confirmation dialog.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  const modalEl = $('#confirm-modal');
  $('#confirm-title', modalEl).textContent = title;
  $('#confirm-body', modalEl).textContent = body;
  const okBtn = $('#confirm-ok', modalEl);
  okBtn.textContent = confirmLabel;
  okBtn.className = `btn btn-lg ${danger ? 'btn-danger' : 'btn-primary'}`;

  const modal = Modal.getOrCreateInstance(modalEl);
  return new Promise((resolve) => {
    let confirmed = false;
    const onOk = () => {
      confirmed = true;
      modal.hide();
    };
    okBtn.addEventListener('click', onOk, { once: true });
    modalEl.addEventListener(
      'hidden.bs.modal',
      () => {
        okBtn.removeEventListener('click', onOk);
        resolve(confirmed);
      },
      { once: true },
    );
    modal.show();
  });
}
