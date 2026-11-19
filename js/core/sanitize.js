/**
 * Output safety and formatting (PRD §11).
 * The UI renders with textContent, so escapeHTML is only a safety net for any
 * string that must ever be placed into markup.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 245000 -> "₹2,450.00" */
export function formatINR(paise) {
  return inr.format((Number(paise) || 0) / 100);
}
