/**
 * Data freshness banner (top of every page) and the "data sources" line in the footer.
 * Shows when official data is missing or stale, or the server cannot be reached.
 */
import { el, icon, $, renderInto } from './dom.js';
import { getDataStatus } from '../services/dataService.js';
import { formatDate, sourceLabel } from '../core/labels.js';
import { MESSAGES } from '../config.js';

const OFFICIAL = ['pmbi_product_list', 'nppa_brand_mrp', 'nppa_ceiling_prices'];

export function renderDataBanner() {
  const host = $('#data-banner');
  if (!host) return;
  const status = getDataStatus();
  const notes = [];
  if (!status) notes.push(['danger', 'wifi-off', MESSAGES.OFFLINE]);
  else {
    if (!status.officialDataImported) notes.push(['info', 'info-circle-fill', MESSAGES.NO_JA_DATA]);
    for (const s of status.sources.filter((x) => OFFICIAL.includes(x.id) && x.imported && x.stale)) {
      notes.push(['warning', 'clock-history', MESSAGES.STALE(sourceLabel(s.id), formatDate(s.lastSuccessAt))]);
    }
  }
  renderInto(
    host,
    notes.map(([tone, ic, text]) =>
      el('div', { class: `alert alert-${tone} rounded-0 mb-0 border-0 data-note`, role: tone === 'danger' ? 'alert' : 'status' },
        el('div', { class: 'container-xl d-flex gap-2 align-items-start' }, icon(ic, 'mt-1'), el('span', {}, text))),
    ),
  );
  renderFooterSources(status);
}

function renderFooterSources(status) {
  const host = $('#data-sources');
  if (!host) return;
  if (!status) {
    renderInto(host);
    return;
  }
  const parts = OFFICIAL.map((id) => status.sources.find((s) => s.id === id)).filter(Boolean).map((s) =>
    s.imported
      ? `${sourceLabel(s.id)}: updated ${formatDate(s.lastSuccessAt)}${s.asOf ? ` (list as on ${formatDate(s.asOf)})` : ''}${s.stale ? ', may have changed' : ''}`
      : `${sourceLabel(s.id)}: coming soon`,
  );
  renderInto(host, el('span', {}, 'Prices: ', parts.join(' · '), '. Taken from official government lists and updated from time to time.'));
}
