(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const T = LP.turn;

  function campaign(memory) {
    return { settings: { difficulty: 'normal', crewSize: 6 }, turnMemory: memory || {}, turn: null };
  }

  /** Stage ids by status, e.g. { done: [...], skipped: [...], current: 'x' } */
  function status(c) {
    const w = T.walk(c);
    const out = { done: [], skipped: [], pending: null, current: w.current ? w.current.id : null, finished: w.finished };
    for (const item of w.items) {
      if (item.status === 'done') out.done.push(item.def.id);
      if (item.status === 'skipped') out.skipped.push(item.def.id);
      if (item.status === 'pending') out.pending = item.def.id;
    }
    return out;
  }

  function lowDice() { rng.setSource(() => 0); }        // every die rolls 1
  function highDice() { rng.setSource(() => 0.9999); }  // every die rolls its maximum

  /* ---------------------------------------------------------------------- */
  group('Numbered table rolls');

  test('parseRange reads printed ranges', (assert) => {
    assert.deepEqual(rng.parseRange('1-4'), { min: 1, max: 4 });
    assert.deepEqual(rng.parseRange('10'), { min: 10, max: 10 });
    assert.equal(rng.parseRange(null), null);
  });

  test('rollOn returns the row whose range holds the roll', (assert) => {
    for (let i = 0; i < 500; i++) {
      const r = rng.rollOn('World Traits Table');
      const range = rng.parseRange(r.row.ranges.weight);
      assert.ok(r.total >= range.min && r.total <= range.max, r.total + ' vs ' + r.row.ranges.weight);
      assert.equal(r.die, 'D100');
    }
  });

  test('rollOn keeps the table odds', (assert) => {
    rng.setSource(rng.seeded(11));
    const n = 30000;
    let humans = 0;
    for (let i = 0; i < n; i++) if (rng.rollOn('Crew Type Table').row.id === 'baseline-human') humans++;
    assert.near(humans / n, 0.6, 0.015);
  });

  test('modifiers past the top count as the last row', (assert) => {
    highDice();
    const r = rng.rollOn('Danger Pay Table', { modifier: 1 });
    assert.equal(r.natural, 10);
    assert.equal(r.total, 11);
    assert.equal(r.row, LP.data.tables['Danger Pay Table'].rows[3]);
  });

  test('excluded rows are rolled again; all excluded gives null', (assert) => {
    const rows = LP.data.tables['Crew Type Table'].rows;
    for (let i = 0; i < 200; i++) assert.equal(rng.rollOn('Crew Type Table', { exclude: ['baseline-human', 'primary-alien', 'bot'] }).row.id, 'strange-character');
    assert.equal(rng.rollOn('Crew Type Table', { exclude: rows.map((r) => r.id) }).row, null);
  });

  test('savvyNote explains what Savvy is needed', (assert) => {
    assert.equal(T.line.savvyNote(4, 6), 'Succeeds if the character has Savvy +2 or better.');
    assert.equal(T.line.savvyNote(6, 6), 'Succeeds whatever the character’s Savvy.');
    assert.ok(/Fails whatever/.test(T.line.savvyNote(1, 7)));
    assert.equal(T.line.savvyNote(4, 6, { engineer: true }), 'Succeeds if the character has Savvy +2 or better (+1 or better for an Engineer).');
    assert.equal(T.line.savvyNote(5, 6, { engineer: true }), 'Succeeds if the character has Savvy +1 or better, or is an Engineer.');
  });

  /* ---------------------------------------------------------------------- */
  group('Turn engine');

  test('a new turn starts at Start of turn', (assert) => {
    const c = campaign();
    const s = status(c);
    assert.equal(s.current, 'start');
    assert.equal(T.canUndo(c), false);
    const fields = T.currentFields(c);
    assert.equal(fields.find((f) => f.key === 'firstTurn').value, true);
  });

  test('first turn without a generated world skips all Travel stages', (assert) => {
    const c = campaign();
    assert.ok(T.confirm(c, { firstTurn: true, generateWorld: false, worldTraits: ['haze'] }).ok);
    const s = status(c);
    assert.deepEqual(s.skipped, ['conditions', 'flee-invasion', 'travel', 'travel-event', 'new-world']);
    assert.equal(s.current, 'upkeep', 'on to the World steps');
    assert.equal(c.turnMemory.hasPlayed, true);
    assert.deepEqual(c.turnMemory.worldTraits, ['haze']);
  });

  test('first turn with a generated world goes to New world arrival', (assert) => {
    lowDice(); // licence 1D6 = 1: no licence, so no pending choice
    const c = campaign();
    T.confirm(c, { firstTurn: true, generateWorld: true });
    assert.equal(status(c).current, 'new-world');
    const fields = T.currentFields(c);
    assert.ok(!fields.some((f) => f.key === 'rivals'), 'no Rival check on the first turn');
    T.confirm(c, { wildGalaxy: false });
    const s = status(c);
    assert.equal(s.current, 'upkeep');
    assert.deepEqual(c.turnMemory.worldTraits, ['haze']); // D100 = 1
  });

  test('staying put skips the travel event and new world', (assert) => {
    const c = campaign({ hasPlayed: true });
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: [] });
    assert.equal(status(c).current, 'travel');
    T.confirm(c, { mode: 'stay' });
    const s = status(c);
    assert.equal(s.current, 'upkeep');
    assert.ok(s.skipped.includes('travel-event') && s.skipped.includes('new-world'));
  });

  test('commercial passage skips the Starship Travel Event', (assert) => {
    lowDice();
    const c = campaign({ hasPlayed: true, rivals: 2 });
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: [] });
    T.confirm(c, { mode: 'commercial', crewCount: 5 });
    const w = T.walk(c);
    const event = w.items.find((i) => i.def.id === 'travel-event');
    assert.equal(event.status, 'skipped');
    assert.ok(/Commercial/.test(event.reason));
    assert.equal(w.current.id, 'new-world');
    assert.equal(T.currentFields(c).find((f) => f.key === 'rivals').value, 2);
    T.confirm(c, { rivals: 2, wildGalaxy: false });
    assert.equal(c.turnMemory.rivals, 0, 'both Rivals rolled 1 and stayed behind');
    assert.equal(c.turnMemory.crewCount, 5);
  });

  test('travelling by ship rolls a travel event, and costs follow world traits', (assert) => {
    highDice();
    const c = campaign({ hasPlayed: true });
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: ['fuel-refinery', 'fuel-shortage'] });
    T.confirm(c, { mode: 'ship' });
    const travel = c.turn.records[1].output;
    assert.equal(travel.data.cost, 3 + 3, 'refinery 3 + shortage 1D3 (=3)');
    assert.equal(status(c).current, 'travel-event');
    T.confirm(c, {});
    assert.equal(c.turn.records[2].output.run.lines[0].rowId, 'base:locked-in-the-library-data-by-night'); // the last event on the table
  });

  test('invasion: fleeing must leave; a failed flee skips Travel', (assert) => {
    highDice();
    const ok = campaign({ hasPlayed: true, rivals: 3 });
    T.confirm(ok, { firstTurn: false, invaded: true, worldTraits: [] });
    assert.equal(status(ok).current, 'flee-invasion');
    T.confirm(ok, { hasShip: true });
    assert.equal(ok.turnMemory.rivals, 0, 'Rivals are lost when fleeing');
    assert.ok(!T.currentFields(ok).find((f) => f.key === 'mode').options.some((o) => o.value === 'stay'));
    assert.ok(T.confirm(ok, { mode: 'stay' }).error);

    lowDice();
    const bad = campaign({ hasPlayed: true });
    T.confirm(bad, { firstTurn: false, invaded: true, worldTraits: [] });
    T.confirm(bad, { hasShip: true });
    const s = status(bad);
    assert.ok(s.skipped.includes('travel') && s.skipped.includes('new-world'));
  });

  test('Bureaucratic mess: pending choice, then Undo steps back through it', (assert) => {
    lowDice(); // 2D6 = 2: delayed
    const c = campaign({ hasPlayed: true });
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: ['bureaucratic-mess'] });
    T.confirm(c, { mode: 'ship' });
    assert.equal(status(c).pending, 'travel');
    assert.equal(status(c).current, null);
    assert.ok(T.choose(c, 'nonsense').error);

    T.choose(c, 'stay');
    let s = status(c);
    assert.ok(s.current === 'upkeep' && s.skipped.includes('travel-event'));

    T.undo(c); // back to the pending choice
    assert.equal(status(c).pending, 'travel');
    T.choose(c, 'pay');
    assert.equal(status(c).current, 'travel-event');

    T.undo(c); // choice again
    T.undo(c); // remove the travel stage
    s = status(c);
    assert.equal(s.current, 'travel');
    assert.equal(T.currentFields(c).find((f) => f.key === 'mode').value, 'ship', 'Undo pre-fills the old input');
  });

  test('Undo restores remembered values; Restart restores the start of the turn', (assert) => {
    lowDice();
    const c = campaign({ hasPlayed: true, worldTraits: ['fog'], rivals: 1 });
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: ['haze'] });
    assert.deepEqual(c.turnMemory.worldTraits, ['haze']);
    T.undo(c);
    assert.deepEqual(c.turnMemory.worldTraits, ['fog']);

    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: ['gloom'] });
    T.confirm(c, { mode: 'commercial', crewCount: 4 });
    T.restart(c);
    assert.deepEqual(c.turnMemory.worldTraits, ['fog']);
    assert.equal(c.turnMemory.crewCount, undefined);
    assert.equal(c.turn.records.length, 0);
  });

  test('Start next turn keeps what this turn remembered', (assert) => {
    const c = campaign({ hasPlayed: true });
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: ['gloom'] });
    T.confirm(c, { mode: 'stay' });
    T.nextTurn(c);
    assert.equal(c.turn.records.length, 0);
    assert.deepEqual(T.currentFields(c).find((f) => f.key === 'worldTraits').value, ['gloom']);
    assert.equal(T.currentFields(c).find((f) => f.key === 'firstTurn').value, false);
  });

  test('a licence requirement asks about forging; a natural 1 adds a Rival', (assert) => {
    let calls = 0;
    // 1st die (licence) = 6, 2nd (cost) = 6, then D100 traits, then forging die = 1.
    rng.setSource(() => (calls++ < 2 ? 0.9999 : 0));
    const c = campaign({ rivals: 2 });
    T.confirm(c, { firstTurn: true, generateWorld: true });
    T.confirm(c, { wildGalaxy: false });
    assert.equal(status(c).pending, 'new-world');
    assert.equal(c.turn.records[1].output.data.licence, 6);
    T.choose(c, 'forge');
    assert.equal(c.turnMemory.rivals, 3, 'forgery Rival added to the 2 you had');
    T.undo(c);
    assert.equal(c.turnMemory.rivals, 2);
  });

  test('stored turns survive JSON and drop unknown stages', (assert) => {
    const c = campaign({ hasPlayed: true });
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: [] });
    const copy = JSON.parse(JSON.stringify(c));
    assert.equal(status(copy).current, 'travel');
    copy.turn.records.unshift({ id: 'no-such-stage', input: {}, output: {}, history: [] });
    T.ensure(copy);
    assert.equal(copy.turn.records.length, 0);
  });
})(window.LP);
