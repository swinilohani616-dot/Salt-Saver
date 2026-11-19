/**
 * Runs the test suite in Node: `npm test`
 */
import { readFile } from 'node:fs/promises';
import { createHarness } from './harness.js';
import { registerTests } from './core.test.js';

const sampleData = JSON.parse(await readFile(new URL('../data/sample-data.json', import.meta.url), 'utf8'));
const harness = createHarness();
registerTests(harness, sampleData);
const results = await harness.run();

for (const r of results) console.log(`${r.passed ? '✓' : '✗'} ${r.name}${r.passed ? '' : `\n    ${r.error}`}`);
const failed = results.filter((r) => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
