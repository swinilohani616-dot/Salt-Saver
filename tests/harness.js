/**
 * Tiny test harness that runs in both the browser (tests/index.html) and Node (npm test).
 */
export function createHarness() {
  const tests = [];
  const test = (name, fn) => tests.push({ name, fn });

  const assert = {
    equal(actual, expected, msg = '') {
      if (!Object.is(actual, expected)) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`.trim());
    },
    deepEqual(actual, expected, msg = '') {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`.trim());
    },
    ok(value, msg = 'expected truthy value') {
      if (!value) throw new Error(msg);
    },
  };

  async function run() {
    const results = [];
    for (const { name, fn } of tests) {
      try {
        await fn(assert);
        results.push({ name, passed: true });
      } catch (error) {
        results.push({ name, passed: false, error: error.message });
      }
    }
    return results;
  }

  return { test, run };
}
