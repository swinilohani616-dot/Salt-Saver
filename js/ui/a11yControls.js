/**
 * Text size (A− / A / A+) and high-contrast controls (PRD §16 mitigation).
 */
import { $ } from './dom.js';
import { getState, setState, subscribe } from '../state/store.js';
import * as storage from '../services/storage.js';
import { STORAGE_KEYS, FONT_SCALES } from '../config.js';

export function applyPrefs(prefs) {
  const root = document.documentElement;
  root.style.setProperty('--font-scale', String(prefs.fontScale));
  root.dataset.contrast = prefs.highContrast ? 'high' : 'normal';

  const index = FONT_SCALES.indexOf(prefs.fontScale);
  $('#font-smaller').disabled = index <= 0;
  $('#font-larger').disabled = index >= FONT_SCALES.length - 1;
  $('#font-reset').setAttribute('aria-pressed', String(index === 0));
  $('#font-size-status').textContent = `${Math.round(prefs.fontScale * 100)}%`;
  $('#contrast-toggle').setAttribute('aria-pressed', String(prefs.highContrast));
}

function updatePrefs(patch) {
  const prefs = { ...getState().prefs, ...patch };
  storage.setJSON(STORAGE_KEYS.prefs, prefs);
  setState({ prefs });
}

function stepFont(direction) {
  const index = FONT_SCALES.indexOf(getState().prefs.fontScale);
  const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, index + direction))];
  updatePrefs({ fontScale: next });
}

export function mountA11yControls() {
  $('#font-smaller').addEventListener('click', () => stepFont(-1));
  $('#font-larger').addEventListener('click', () => stepFont(1));
  $('#font-reset').addEventListener('click', () => updatePrefs({ fontScale: FONT_SCALES[0] }));
  $('#contrast-toggle').addEventListener('click', () => updatePrefs({ highContrast: !getState().prefs.highContrast }));

  subscribe((state, prev) => {
    if (state.prefs !== prev.prefs) applyPrefs(state.prefs);
  });
  applyPrefs(getState().prefs);
}
