/**
 * Scheduled source check (run by GitHub Actions, or by hand: `npm run check:sources`).
 *
 * For each official source:
 *   - age of the last approved import, and whether it is now stale
 *     (Jan Aushadhi after 60 days, NPPA ceilings after 400, NPPA brand MRPs after 90, without a successful import)
 *   - NPPA: in the first week of April, whether this year's revision (effective 1 April)
 *     has been imported yet
 *   - imports waiting for review
 *   - if a direct file URL is configured (PMBI_LIST_URL / NPPA_LIST_URL), download it
 *     (with retries) and stage a review when its checksum is new. Nothing is ever
 *     committed without approval, and a failed download leaves the data untouched.
 *
 * Every check is logged in sync_logs (job = 'stale_check').
 */
import { sourceStatus } from '../server/catalog.js';
import { stageImport } from './pipeline.js';
import { ADAPTERS } from './importers/index.js';

const CHECKED = ['pmbi_product_list', 'nppa_ceiling_prices', 'nppa_brand_mrp'];
const URL_ENV = { pmbi_product_list: 'PMBI_LIST_URL', nppa_ceiling_prices: 'NPPA_LIST_URL' }; // brand MRPs are looked up by hand
const PENDING_REMINDER_DAYS = 7;

/** Date parts in India time. */
function istParts(now) {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() + 1, day: ist.getUTCDate() };
}

/**
 * @param {object} db
 * @param {{now?:Date, env?:Record<string,string|undefined>, download?:(url:string)=>Promise<{bytes:Buffer, url:string}>}} [options]
 * @returns {Promise<{sources:object[], attention:string[]}>}
 */
export async function checkSources(db, { now = new Date(), env = process.env, download = null } = {}) {
  const statuses = await sourceStatus(db, now);
  const attention = [];
  const results = [];
  const { year, month, day } = istParts(now);

  for (const id of CHECKED) {
    const s = statuses.find((x) => x.id === id);
    if (!s) continue;
    const r = { id, name: s.name, lastSuccessAt: s.lastSuccessAt, ageDays: s.ageDays, imported: s.imported, stale: s.stale, notes: [] };

    if (!s.imported) {
      r.notes.push(`Never imported. Download the list from ${s.homepageUrl} and run the import.`);
      attention.push(`${s.name}: never imported`);
    } else if (s.stale) {
      r.notes.push(`Stale: last approved import ${s.ageDays} days ago (limit ${s.staleAfterDays}).`);
      attention.push(`${s.name}: stale (${s.ageDays} days old)`);
    }

    if (id === 'nppa_ceiling_prices' && month === 4 && day <= 7) {
      const revisionStart = `${year}-04-01`;
      const lastImport = s.lastSuccessAt ? s.lastSuccessAt.slice(0, 10) : null;
      if (!lastImport || lastImport < revisionStart) {
        r.annualRevisionDue = true;
        r.notes.push(`Annual NPPA revision (effective 1 April ${year}) not imported yet. Check ${s.homepageUrl}.`);
        attention.push(`${s.name}: ${year} annual revision not imported yet`);
      }
    }

    const pending = await db.query(
      `select id, extract(day from now() - created_at)::int as days from import_diffs where source_id = $1 and status = 'pending'`,
      [id],
    );
    for (const p of pending) {
      r.notes.push(`Import #${p.id} is waiting for review (${p.days} days). Run: npm run import:show -- ${p.id}`);
      if (p.days >= PENDING_REMINDER_DAYS) attention.push(`${s.name}: import #${p.id} waiting for review for ${p.days} days`);
    }

    const url = env[URL_ENV[id]];
    if (url && download && !pending.length) {
      try {
        const got = await download(url);
        const staged = await stageImport(db, ADAPTERS[id], { bytes: got.bytes, fileName: decodeURIComponent(new URL(got.url).pathname.split('/').pop() || 'download'), url: got.url });
        if (staged.status === 'staged') {
          r.notes.push(`New version found and staged as import #${staged.diffId} (${staged.summary.new} new, ${staged.summary.changed} changed, ${staged.summary.removed} removed). Review it before approving.`);
          attention.push(`${s.name}: new version staged as import #${staged.diffId}`);
        } else r.notes.push('Downloaded the configured file: no new version.');
      } catch (error) {
        r.notes.push(`Download or parse failed: ${error.message}. The current data is unchanged.`);
        attention.push(`${s.name}: automatic download failed`);
        await db.query(
          `insert into sync_logs (source_id, job, status, message, finished_at) values ($1, 'download', 'failed', $2, now())`,
          [id, error.message],
        );
      }
    } else if (!url && URL_ENV[id]) {
      r.notes.push(`No direct file URL is configured (${URL_ENV[id]}), so new versions are found by hand.`);
    }

    await db.query(
      `insert into sync_logs (source_id, job, status, message, stats, finished_at) values ($1, 'stale_check', 'succeeded', $2, $3::jsonb, now())`,
      [id, r.notes.join(' ') || null, JSON.stringify({ stale: r.stale, ageDays: r.ageDays, annualRevisionDue: !!r.annualRevisionDue })],
    );
    results.push(r);
  }
  return { sources: results, attention };
}

/** Markdown summary for the GitHub Actions run page. */
export function checkSummaryMarkdown({ sources, attention }, now = new Date()) {
  const lines = [`## SaltSaver data check (${now.toISOString().slice(0, 16).replace('T', ' ')} UTC)`, ''];
  lines.push(attention.length ? `**Needs attention (${attention.length}):**` : 'Nothing needs attention.');
  for (const a of attention) lines.push(`- ${a}`);
  lines.push('', '| Source | Last approved import | Age (days) | Stale |', '| --- | --- | --- | --- |');
  for (const s of sources) lines.push(`| ${s.name} | ${s.lastSuccessAt ?? 'never'} | ${s.ageDays ?? '—'} | ${s.stale ? 'yes' : 'no'} |`);
  for (const s of sources) if (s.notes.length) lines.push('', `**${s.name}**`, ...s.notes.map((n) => `- ${n}`));
  return lines.join('\n');
}
