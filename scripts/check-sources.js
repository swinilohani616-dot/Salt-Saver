/**
 * Checks data freshness and (when a direct URL is configured) looks for a new file version:
 * `npm run check:sources [-- --fail-on-attention]`. Run twice a week by .github/workflows/data-check.yml.
 * With --fail-on-attention the command exits 1 when something needs you, so GitHub emails you.
 */
import { appendFile } from 'node:fs/promises';
import { createDbFromEnv, loadEnvFile } from '../server/db.js';
import { checkSources, checkSummaryMarkdown } from '../db/checks.js';
import { downloadFile } from '../lib/import/download.js';

loadEnvFile();
const failOnAttention = process.argv.includes('--fail-on-attention');
const db = createDbFromEnv(process.env, { max: 1 });
try {
  const result = await checkSources(db, { download: downloadFile });
  const summary = checkSummaryMarkdown(result);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (failOnAttention && result.attention.length) process.exitCode = 1;
} catch (error) {
  console.error(`Data check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
