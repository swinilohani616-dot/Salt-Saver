/**
 * PRD §4 capability matrix, as data.
 */

export const ROLES = Object.freeze({
  patient: { id: 'patient', label: 'Patient / Senior', description: 'Find cheaper generics for my own medicines.' },
  caregiver: { id: 'caregiver', label: 'Caregiver', description: "Manage a family member's monthly medicines." },
  pharmacy: { id: 'pharmacy', label: 'Pharmacy Buyer', description: 'Compare brand and generic prices at the counter.' },
});

export const DEFAULT_ROLE = 'patient';

const CAPABILITIES = Object.freeze({
  search: ['patient', 'caregiver', 'pharmacy'],
  viewGeneric: ['patient', 'caregiver', 'pharmacy'],
  addToBasket: ['patient', 'caregiver'],
  print: ['patient', 'caregiver', 'pharmacy'],
  resetDemo: ['patient', 'caregiver', 'pharmacy'],
});

export const isValidRole = (role) => Object.prototype.hasOwnProperty.call(ROLES, role);

/**
 * @param {string} role
 * @param {keyof typeof CAPABILITIES} capability
 */
export function can(role, capability) {
  return (CAPABILITIES[capability] || []).includes(role);
}
