(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const T = LP.turn;

  function low() { rng.setSource(() => 0); }       // every die rolls 1
  function high() { rng.setSource(() => 0.9999); } // every die rolls its maximum

  function current(c) {
    const w = T.walk(c);
    return w.current ? w.current.id : (w.finished ? 'finished' : 'pending');
  }

  function facts(c) {
    return T.context(c, c.turn.records).facts;
  }

  function record(c, id) {
    return c.turn.records.find((r) => r.id === id);
  }

  function status(c, id) {
    const item = T.walk(c).items.find((i) => i.def.id === id);
    return item ? item.status : 'not reached';
  }

  /** Confirm the current stage with its pre-filled values, plus overrides. */
  function confirmDefaults(c, overrides) {
    const done = c.turn && c.turn.records[c.turn.records.length - 1];
    if (done && T.awaitingApply(done) && !done.pending) T.applyLedger(c);
    const values = {};
    const fields = T.currentFields(c);
    for (const f of fields) if (f.type !== 'info') values[f.key] = f.value;
    Object.assign(values, overrides || {});
    // Only keep fields that would be visible with these values.
    for (const f of fields) if (f.showIf && !f.showIf(values)) delete values[f.key];
    const r = T.confirm(c, values);
    if (r.error) throw new Error(current(c) + ': ' + r.error);
  }

  /** An answer for whatever a stage asks: the first usable option, or something harmless for the free-form prompts. */
  function answerFor(pending) {
    switch (pending.kind) {
      case 'number': return pending.min || 0;
      case 'pickList': return Array.from({ length: pending.k }, () => pending.options[0].value);
      case 'offer': return null;
      case 'recruit': return { accepted: false };
      case 'alternatives': return 0;
      default: return (pending.options.find((o) => !o.disabled) || pending.options[0]).value;
    }
  }

  /** Answer every pending choice with its first option. */
  function settle(c) {
    let guard = 0;
    while (current(c) === 'pending' && guard++ < 20) {
      const rec = c.turn.records[c.turn.records.length - 1];
      if (!rec.pending) { T.applyLedger(c); continue; }
      T.choose(c, answerFor(rec.pending));
    }
  }

  /** A turn that stayed put and chose an Opportunity mission: waiting at Battle result. */
  function atResult(memory, traits, campaignExtra) {
    const c = Object.assign({
      settings: { difficulty: 'normal', crewSize: 6 },
      turnMemory: Object.assign({ hasPlayed: true, rivals: 0 }, memory),
      turn: null,
      models: { disabled: {}, invasion: {} }
    }, campaignExtra);
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: traits || [] });
    if (memory && memory.onQuest) LP.events.ledger.commit(c, LP.conditions.addOps(c, 'on-quest'));
    T.confirm(c, { mode: 'stay' });
    T.confirm(c, { crewCount: 6, sickBay: 0, hasShip: true, debt: 0, payment: 0, hullDamage: 0 });
    T.confirm(c, { tasks: {} });
    T.confirm(c, { offers: 0 });
    T.confirm(c, {});
    T.confirm(c, { onQuest: false, rumors: 0 });
    T.confirm(c, { rivals: memory && memory.rivals || 0, patronJob: false });
    settle(c);
    return c;
  }

  /** Play every remaining stage with defaults. */
  function playOut(c, overrides) {
    let guard = 0;
    while (current(c) !== 'finished' && guard++ < 40) {
      if (current(c) === 'pending') settle(c);
      else confirmDefaults(c, (overrides || {})[current(c)]);
    }
  }

  /* ---------------------------------------------------------------------- */
  group('Post-Battle: flow');

  test('after choosing the battle, the turn waits for the result', (assert) => {
    const c = atResult();
    assert.equal(current(c), 'battle-result');
    const type = T.currentFields(c).find((f) => f.key === 'type');
    assert.equal(type.value, 'opportunity', 'pre-filled from the turn');
  });

  test('a won Opportunity mission runs every applicable step to the end', (assert) => {
    rng.setSource(rng.seeded(8));
    const c = atResult();
    playOut(c, { 'battle-result': { type: 'opportunity', category: 'hired-muscle', heldField: true, won: true, casualties: 1 } });
    assert.equal(current(c), 'finished');
    for (const id of ['rival-status', 'get-paid', 'battlefield-finds', 'loot', 'injuries', 'experience', 'campaign-event', 'character-event', 'galactic-war']) {
      assert.equal(status(c, id), 'done', id);
    }
    for (const id of ['patron-status', 'quest-progress', 'invasion-check']) assert.equal(status(c, id), 'skipped', id);
  });

  test('Invasion battles: no pay, finds, loot or Rival roll', (assert) => {
    rng.setSource(rng.seeded(9));
    const c = atResult();
    playOut(c, { 'battle-result': { type: 'invasion', heldField: true } });
    for (const id of ['rival-status', 'get-paid', 'battlefield-finds', 'loot']) assert.equal(status(c, id), 'skipped', id);
  });

  test('the Battle tab pre-fills the result', (assert) => {
    const c = atResult();
    const ctx = { settings: c.settings, campaign: c };
    const b = LP.battle.newBattle(ctx, 'opportunity');
    LP.battle.generate(b, ctx);
    LP.battle.setFixed(b, ctx, 'category', 'criminal-elements');
    LP.battle.setFixed(b, ctx, 'enemy', 'Criminal Elements|pirates');
    LP.battle.setFixed(b, ctx, 'bounty', 2);
    c.battle = b;
    const fields = T.currentFields(c);
    assert.equal(fields.find((f) => f.key === 'category').value, 'criminal-elements');
    assert.equal(fields.find((f) => f.key === 'bounty').value, 2);
    confirmDefaults(c);
    assert.ok(facts(c).post.extraLoot, 'Pirates give an extra Loot roll');
    playOut(c, { 'rival-status': {} });
    assert.equal(record(c, 'loot').input.rolls, 2, 'one roll + Pirates extra');
  });

  /* ---------------------------------------------------------------------- */
  group('Post-Battle: steps');

  test('Rival status: criminals roll 2D6; double 1s means they hate you', (assert) => {
    const c = atResult({ rivals: 1 });
    confirmDefaults(c, { type: 'opportunity', category: 'criminal-elements', heldField: true });
    low();
    confirmDefaults(c);
    assert.equal(record(c, 'rival-status').output.data.hate, true);
    assert.equal(c.turnMemory.rivals, 2);
  });

  test('Rival status: Vendetta system makes 1–2 a Rival', (assert) => {
    rng.setSource(() => 0.2); // 1D6 = 2
    const c = atResult({}, ['vendetta-system']);
    confirmDefaults(c, { type: 'opportunity', category: 'hired-muscle', heldField: true });
    confirmDefaults(c);
    assert.equal(record(c, 'rival-status').output.data.gained, 1);
  });

  test('Rival status: chasing off a Rival (4+, +1 for a Unique kill)', (assert) => {
    rng.setSource(() => 0.5); // 1D6 = 4
    const c = atResult({ rivals: 2 });
    confirmDefaults(c, { type: 'rival-attack', category: 'hired-muscle', heldField: true, uniqueKilled: false });
    confirmDefaults(c, { rivals: 2 });
    assert.equal(c.turnMemory.rivals, 1);
  });

  test('no Rival roll when you didn’t Hold the Field, or against Roving Threats', (assert) => {
    const a = atResult();
    confirmDefaults(a, { type: 'opportunity', category: 'hired-muscle', heldField: false });
    assert.equal(status(a, 'rival-status'), 'skipped');
    const b = atResult();
    confirmDefaults(b, { type: 'opportunity', category: 'roving-threats', heldField: true });
    assert.equal(status(b, 'rival-status'), 'skipped');
  });

  test('Patron status adds a contact after a won job (not One-time)', (assert) => {
    rng.setSource(rng.seeded(2));
    const c = atResult({ patrons: 1 });
    confirmDefaults(c, { type: 'patron', category: 'hired-muscle', heldField: true, won: true, dangerPay: 2 });
    confirmDefaults(c); // rival status
    settle(c);
    confirmDefaults(c, { oneTime: false });
    assert.equal(c.turnMemory.patrons, 2);
  });

  test('Quest progress: Rumors help, not Winning hurts', (assert) => {
    low(); // 1 + 3 Rumors = 4: a step closer
    const c = atResult({ rumors: 3, onQuest: true });
    confirmDefaults(c, { type: 'quest', category: 'hired-muscle', heldField: true, won: true, questRumors: 3 });
    confirmDefaults(c); // rival
    confirmDefaults(c);
    assert.equal(record(c, 'quest-progress').output.data.rumorGained, 1);
    assert.equal(c.turnMemory.rumors, 4);

    const lost = atResult({ rumors: 3, onQuest: true });
    confirmDefaults(lost, { type: 'quest', category: 'hired-muscle', heldField: false, won: false, questRumors: 3 });
    confirmDefaults(lost); // 1 + 3 - 2 = 2: dead end
    assert.equal(record(lost, 'quest-progress').output.data.rumorGained, 0);
  });

  test('a won Quest finale completes the Quest: 3 Loot rolls and +1 XP', (assert) => {
    rng.setSource(rng.seeded(5));
    const c = atResult({ onQuest: true });
    confirmDefaults(c, { type: 'quest-finale', category: 'hired-muscle', heldField: true, won: true });
    playOut(c);
    assert.equal(record(c, 'loot').input.rolls, 3);
    assert.ok(/Completed the Quest/.test(JSON.stringify(record(c, 'experience').output)));
    assert.ok(!LP.conditions.has(c, 'on-quest'), 'the Quest condition ends');
  });

  test('Get paid: Winning makes a 1–2 count as 3; Danger Pay and bounty add on', (assert) => {
    low();
    const c = atResult();
    confirmDefaults(c, { type: 'patron', category: 'criminal-elements', heldField: true, won: true, dangerPay: 2, bounty: 1 });
    confirmDefaults(c); // rival status (rolls 1s: becomes Rival)
    confirmDefaults(c, { oneTime: true });
    confirmDefaults(c);
    const pay = record(c, 'get-paid').output;
    assert.equal(pay.headline, '6 credits', '1 (+2 to make 3) +2 Danger Pay +1 bounty');
  });

  test('Get paid: Booming economy rerolls 1s', (assert) => {
    const seq = [0, 0, 0.5]; // 1, 1, then 4
    let i = 0;
    const c = atResult({}, ['booming-economy']);
    confirmDefaults(c, { type: 'opportunity', category: 'roving-threats', heldField: false, won: false });
    rng.setSource(() => seq[Math.min(i++, seq.length - 1)]);
    confirmDefaults(c);
    assert.equal(record(c, 'get-paid').output.headline, '4 credits');
  });

  test('Check for Invasion: Evidence, Held the Field and difficulty modify; 9+ invades', (assert) => {
    high();
    const c = atResult({}, [], { settings: { difficulty: 'hardcore', crewSize: 6 } });
    confirmDefaults(c, { type: 'opportunity', category: 'roving-threats', heldField: true, won: true, invasionThreat: true });
    playOut(c);
    const roll = record(c, 'invasion-check').output.lines[0];
    const labels = roll.modifiers.map((m) => m.label);
    assert.ok(labels.includes('Held the Field') && labels.includes('Hardcore'));
    assert.equal(c.turnMemory.invadedNext, true);
    T.nextTurn(c);
    assert.equal(T.currentFields(c).find((f) => f.key === 'invaded').value, true, 'next turn starts Invaded');
  });

  test('Check for Invasion is skipped in a Unity safe sector', (assert) => {
    const c = atResult({}, ['unity-safe-sector']);
    rng.setSource(rng.seeded(12));
    confirmDefaults(c, { type: 'opportunity', category: 'roving-threats', heldField: false, won: false, invasionThreat: true });
    playOut(c);
    assert.equal(status(c, 'invasion-check'), 'skipped');
  });

  test('Injuries roll once per casualty, Bots on their own table', (assert) => {
    rng.setSource(rng.seeded(3));
    const c = atResult();
    confirmDefaults(c, { type: 'opportunity', category: 'roving-threats', heldField: false, won: false, casualties: 2, botCasualties: 1 });
    playOut(c);
    const lines = JSON.stringify(record(c, 'injuries').output.fu.lines);
    assert.equal(lines.split('"table":"Injury Table"').length - 1, 2);
    assert.equal(lines.split('"table":"Bot Injury Table"').length - 1, 1);
  });

  test('Galactic War: one roll per tracked planet', (assert) => {
    rng.setSource(rng.seeded(6));
    const c = atResult({ invadedPlanets: 2 });
    confirmDefaults(c, { type: 'opportunity', category: 'roving-threats', heldField: false, won: false });
    playOut(c);
    const lines = JSON.stringify(record(c, 'galactic-war').output.fu.lines);
    assert.equal(lines.split('"table":"Galactic War Progress Table"').length - 1, 2);
    assert.equal(c.turnMemory.invadedPlanets, 2);
  });

  test('every post-battle event table script runs to the end', (assert) => {
    for (let seed = 1; seed <= 15; seed++) {
      rng.setSource(rng.seeded(seed));
      for (const name of ['Battlefield Finds Table', 'Injury Table', 'Bot Injury Table']) {
        for (const row of LP.data.tables[name].rows) {
          const run = LP.followup.start(LP.followup.scriptFor(name, row.id), { table: name, crewCount: 5 });
          let guard = 0;
          while (run.pending && guard++ < 10) LP.followup.choose(run, run.pending.options[guard % run.pending.options.length].value);
          assert.equal(run.stack.length, 0, name + ' / ' + row.id);
        }
      }
    }
  });
})(window.LP);
