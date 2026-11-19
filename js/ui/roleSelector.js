/**
 * Role selection modal + navbar role button (PRD §4, USER_WORKFLOW.md W1, W6).
 */
import { el, icon, $, renderInto } from './dom.js';
import { getState, setState, subscribe } from '../state/store.js';
import { ROLES, DEFAULT_ROLE } from '../core/roles.js';
import * as storage from '../services/storage.js';
import { STORAGE_KEYS, MESSAGES } from '../config.js';
import { toast } from './alerts.js';

const ROLE_ICONS = { patient: 'person-heart', caregiver: 'people-fill', pharmacy: 'shop' };
let modal;
let chosen = false;

export function mountRoleSelector() {
  const modalEl = $('#role-modal');
  modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);

  modalEl.addEventListener('show.bs.modal', () => {
    chosen = false;
    renderOptions();
  });
  modalEl.addEventListener('shown.bs.modal', () => {
    modalEl.querySelector(`[data-role="${getState().role || DEFAULT_ROLE}"]`)?.focus();
  });
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (!chosen && !getState().role) {
      setRole(DEFAULT_ROLE, { silent: true });
      toast(MESSAGES.ROLE_DEFAULT, { variant: 'info' });
    }
    $('#search-input')?.focus();
  });

  $('#role-button').addEventListener('click', () => modal.show());

  subscribe((state, prev) => {
    if (state.role !== prev.role) renderRoleButton(state.role);
  });
  renderRoleButton(getState().role);
}

export function openRoleSelector() {
  modal.show();
}

function renderOptions() {
  const current = getState().role;
  renderInto(
    $('#role-options'),
    Object.values(ROLES).map((role) =>
      el(
        'button',
        {
          type: 'button',
          class: `btn role-option ${role.id === current ? 'active' : ''}`,
          dataset: { role: role.id },
          aria: { pressed: String(role.id === current) },
          onClick: () => {
            chosen = true;
            setRole(role.id);
            modal.hide();
          },
        },
        icon(ROLE_ICONS[role.id], 'role-icon'),
        el('span', { class: 'd-block' }, el('span', { class: 'role-label d-block' }, role.label), el('span', { class: 'role-desc d-block' }, role.description)),
      ),
    ),
  );
}

function setRole(roleId, { silent = false } = {}) {
  const previous = getState().role;
  storage.setJSON(STORAGE_KEYS.role, roleId);
  setState({ role: roleId });
  if (!silent && previous && previous !== roleId) toast(MESSAGES.roleChanged(ROLES[roleId].label), { variant: 'info' });
}

function renderRoleButton(roleId) {
  const role = ROLES[roleId];
  renderInto($('#role-button'), icon(role ? ROLE_ICONS[role.id] : 'person', 'me-2'), el('span', {}, role ? role.label : 'Choose role'));
  $('#role-button').setAttribute('aria-label', role ? `Current role: ${role.label}. Change role` : 'Choose your role');
}
