(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const F = LP.followup;
  const scripts = LP.data.followups;
  const tables = LP.data.tables;

  /** Every step in a script, recursively. */
  function walkSteps(steps, visit) {
    for (const step of steps || []) {
      visit(step);
      walkSteps(step.then, visit);
      walkSteps(step.steps, visit);
      walkSteps(step.ifFail, visit);
      for (const o of step.outcomes || []) walkSteps(o.then, visit);
      if (step.choice) for (const o of step.choice.options) walkSteps(o.then, visit);
    }
  }

  /** Run a row's script, answering choices with option `first` then option 0. */
  function runRow(tableName, rowId, first, env) {
    let state = F.start(F.scriptFor(tableName, rowId), Object.assign({ table: tableName, crewCount: 6, rivals: 2, crewSize: 6 }, env));
    let pick = first || 0;
    let guard = 0;
    while (state.pending && guard++ < 20) {
      state = JSON.parse(JSON.stringify(state)); // must survive saving mid-choice
      const option = state.pending.options[Math.min(pick, state.pending.options.length - 1)];
      if (!F.choose(state, option.value)) throw new Error('choose failed');
      pick = 0;
    }
    return state;
  }

  function allText(lines) {
    const out = [];
    (function visit(list) {
      for (const l of list) {
        out.push([l.label, l.title, l.text].filter(Boolean).join(' '));
        if (l.children) visit(l.children);
      }
    })(lines);
    return out.join(' | ');
  }

  function count(lines, predicate) {
    let n = 0;
    (function visit(list) {
      for (const l of list) {
        if (predicate(l)) n++;
        if (l.children) visit(l.children);
      }
    })(lines);
    return n;
  }

  /* ---------------------------------------------------------------------- */
  group('Follow-up scripts');

  test('every scripted table and row id exists', (assert) => {
    for (const [tableName, rows] of Object.entries(scripts)) {
      assert.ok(tables[tableName], 'table ' + tableName);
      const ids = tables[tableName].rows.map((r) => r.id);
      for (const id of Object.keys(rows)) assert.ok(ids.includes(id), tableName + ' / ' + id);
    }
  });

  test('every table a script rolls on exists, and dice notations parse', (assert) => {
    for (const rows of Object.values(scripts)) {
      for (const steps of Object.values(rows)) {
        walkSteps(steps, (step) => {
          if (step.table) assert.ok(tables[step.table], 'missing table ' + step.table);
          if (step.roll) assert.ok(rng.parseDice(step.roll), 'bad dice ' + step.roll);
          if (step.choice) assert.ok(step.choice.options.length >= 2, 'choice needs options');
        });
      }
    }
  });

  test('the Loot chain covers every row of every subtable it leads to', (assert) => {
    for (const name of ['Loot Table', 'Weapon Category Subtable', 'Gear Subtable', 'Odd and Ends Table']) {
      for (const row of tables[name].rows) assert.ok(F.scriptFor(name, row.id).length, name + ' / ' + row.id);
    }
  });

  test('every row of the three event tables runs to the end, down every choice', (assert) => {
    for (let seed = 1; seed <= 25; seed++) {
      rng.setSource(rng.seeded(seed));
      for (const name of ['Starship Travel Events Table', 'Trade Table', 'Exploration Table', 'Loot Table', 'Rewards Table']) {
        for (const row of tables[name].rows) {
          for (let option = 0; option < 2; option++) {
            const state = runRow(name, row.id, option);
            assert.equal(state.pending, null, name + ' / ' + row.id + ' still pending');
            assert.equal(state.stack.length, 0, name + ' / ' + row.id + ' did not finish');
          }
        }
      }
    }
  });

  test('a full table roll shows the rule text and runs the row script', (assert) => {
    rng.setSource(() => 0.21); // D100 = 22: Deep space wreckage
    const state = F.start([{ table: 'Starship Travel Events Table' }], { crewCount: 5 });
    const top = state.lines[0];
    assert.equal(top.rowId, 'deep-space-wreckage');
    assert.ok(/old wreck/.test(top.text));
    assert.equal(top.children.filter((l) => l.type === 'table' && l.table === 'Gear Subtable').length, 2);
    assert.ok(/Damaged/.test(allText(top.children)));
  });

  /* ---------------------------------------------------------------------- */
  group('Follow-up executor');

  test('Asteroids: avoiding and succeeding rolls a new event', (assert) => {
    rng.setSource(() => 0.9999); // 1D6 = 6 (safe path); D100 = 100
    const state = runRow('Starship Travel Events Table', 'asteroids', 0, { table: 'Starship Travel Events Table' });
    assert.ok(count(state.lines, (l) => l.type === 'table' && l.table === 'Starship Travel Events Table') === 1, 'one new event');
  });

  test('Asteroids: going through gives three Savvy checks with Hull damage if they fail', (assert) => {
    rng.setSource(() => 0); // every die rolls 1
    const state = runRow('Starship Travel Events Table', 'asteroids', 1);
    assert.equal(count(state.lines, (l) => l.type === 'roll' && /Piloting/.test(l.label)), 3);
    assert.equal(count(state.lines, (l) => l.type === 'roll' && l.label === 'Hull damage'), 3);
    assert.ok(/Savvy \+3 or better/.test(allText(state.lines)));
  });

  test('roll-again chains stop after a few rolls', (assert) => {
    rng.setSource(() => 0.385); // D100 = 39: Completely lost, every time
    const state = F.start([{ table: 'Exploration Table' }], {});
    assert.ok(/Stopped: too many rolls/.test(allText(state.lines)));
    assert.equal(state.stack.length, 0);
  });

  test('choices pause the run and resume where they left off', (assert) => {
    rng.setSource(rng.seeded(3));
    let state = F.start(F.scriptFor('Trade Table', 'contraband'), { table: 'Trade Table' });
    assert.equal(state.pending.options.length, 2);
    assert.equal(F.pendingChoice(state).prompt, 'Accept the contraband?');
    state = JSON.parse(JSON.stringify(state));
    assert.equal(F.choose(state, 'nope'), false);
    assert.ok(F.choose(state, 'accept'));
    assert.equal(state.pending, null);
    assert.ok(/Accept/.test(allText(state.lines)));
    assert.equal(count(state.lines, (l) => l.type === 'roll'), 1);
  });

  test('nested choices: Escape pod → wanted criminal → turn them in', (assert) => {
    rng.setSource(() => 0); // 1D6 = 1: wanted criminal
    let state = F.start(F.scriptFor('Starship Travel Events Table', 'escape-pod'), {});
    F.choose(state, 'rescue');
    assert.ok(/Let them go/.test(state.pending.prompt));
    F.choose(state, 'turn-in');
    assert.equal(state.pending, null);
    assert.equal(state.gains.rivals, 1);
  });

  test('gains add up (Rumors, story points, Rivals)', (assert) => {
    rng.setSource(() => 0);
    const a = runRow('Exploration Table', 'meet-someone-interesting');
    assert.equal(a.gains.rumors, 1);
    const b = runRow('Starship Travel Events Table', 'navigation-trouble', 0, { table: 'Starship Travel Events Table' });
    assert.ok(b.gains.storyPoints <= -1);
  });

  test('random crew picks are distinct and within the crew', (assert) => {
    for (let i = 0; i < 200; i++) {
      const state = F.start([{ randomCrew: true, count: 3 }], { crewCount: 4 });
      const nums = state.lines[0].text.match(/\d+/g).map(Number);
      const picks = nums.slice(0, 3);
      assert.equal(new Set(picks).size, 3);
      assert.ok(picks.every((n) => n >= 1 && n <= 4));
    }
    const none = F.start([{ randomCrew: true }], {});
    assert.ok(/random crew member/.test(none.lines[0].text));
  });

  test('enemy numbers use the campaign crew size', (assert) => {
    const six = F.start([{ enemyNumbers: true }], { crewSize: 6 });
    assert.equal(six.lines[0].dice.length, 3);
    const four = F.start([{ enemyNumbers: true }], { crewSize: 4 });
    assert.equal(four.lines[0].dice.length, 1);
    assert.equal(six.lines[0].total, Math.max(...six.lines[0].dice));
  });

  test('enemy rolls respect the Models tab', (assert) => {
    const rows = tables['Criminal Elements'].rows;
    const disabled = { 'Criminal Elements': rows.filter((r) => r.id !== 'pirates').map((r) => r.id) };
    for (let i = 0; i < 50; i++) {
      const state = F.start([{ table: 'Criminal Elements' }], { disabled });
      assert.equal(state.lines[0].rowId, 'pirates');
    }
  });

  /* ---------------------------------------------------------------------- */
  group('Travel event stage');

  test('a travel event choice pauses the turn, and Undo goes back to it', (assert) => {
    const T = LP.turn;
    const c = { settings: { difficulty: 'normal', crewSize: 6 }, turnMemory: { hasPlayed: true }, turn: null, models: { disabled: {} } };
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: [] });
    T.confirm(c, { mode: 'ship' });
    rng.setSource(() => 0.55); // D100 = 56: Escape pod (a choice)
    T.confirm(c, { crewCount: 5 });
    const record = c.turn.records[2];
    assert.equal(record.output.fu.lines[0].rowId, 'escape-pod');
    assert.equal(record.pending.prompt, 'Rescue whoever is in the pod?');
    assert.equal(T.walk(c).current, null);
    rng.setSource(() => 0.6); // 1D6 = 4: Rumor + story point
    T.choose(c, 'rescue');
    assert.equal(record.pending, null);
    assert.deepEqual(T.context(c, c.turn.records).facts.travelGains, { rumors: 1, storyPoints: 1 });
    assert.equal(T.walk(c).current.id, 'new-world');
    T.undo(c);
    assert.ok(c.turn.records[2].pending, 'back at the choice');
  });
})(window.LP);
