(function (LP) {
  'use strict';

  // Minimal in-browser test runner: group(), test(), and assertions.

  const cases = [];
  let currentGroup = '';

  function group(name) {
    currentGroup = name;
  }

  function test(name, fn) {
    cases.push({ group: currentGroup, name, fn });
  }

  function fail(message) {
    throw new Error(message);
  }

  function show(value) {
    return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value, null, 0);
  }

  const assert = {
    ok(value, message) {
      if (!value) fail(message || 'Expected a truthy value, got ' + show(value));
    },
    equal(actual, expected, message) {
      if (actual !== expected) fail((message ? message + ': ' : '') + 'expected ' + show(expected) + ', got ' + show(actual));
    },
    deepEqual(actual, expected, message) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) fail((message ? message + ': ' : '') + 'expected ' + b + ', got ' + a);
    },
    near(actual, expected, tolerance, message) {
      if (Math.abs(actual - expected) > tolerance) {
        fail((message ? message + ': ' : '') + 'expected ' + expected + ' ± ' + tolerance + ', got ' + actual);
      }
    },
    throws(fn, message) {
      try { fn(); } catch (e) { return; }
      fail(message || 'Expected an error to be thrown');
    }
  };

  function run() {
    const list = document.getElementById('results');
    const summary = document.getElementById('summary');
    let passed = 0;
    let failed = 0;
    let lastGroup = null;

    for (const c of cases) {
      if (c.group !== lastGroup) {
        lastGroup = c.group;
        const heading = document.createElement('li');
        heading.className = 'group';
        heading.textContent = c.group;
        list.appendChild(heading);
      }

      const item = document.createElement('li');
      item.textContent = c.name;
      try {
        c.fn(assert);
        passed++;
      } catch (error) {
        failed++;
        item.className = 'fail';
        const detail = document.createElement('pre');
        detail.textContent = error.message;
        item.appendChild(detail);
      } finally {
        LP.rng.setSource(); // never leak a seeded source into the next test
      }
      list.appendChild(item);
    }

    const total = passed + failed;
    summary.textContent = failed ? failed + ' of ' + total + ' tests failed' : 'All ' + total + ' tests passed';
    summary.className = 'summary ' + (failed ? 'fail' : 'pass');
    document.title = (failed ? 'FAIL' : 'PASS') + ' · Last Parsec tests';
    LP.test.result = { passed, failed };
  }

  LP.test = { group, test, run, result: null };
})(window.LP);
