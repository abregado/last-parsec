(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const T = LP.turn;

  function low() { rng.setSource(() => 0); }       // every die rolls 1
  function high() { rng.setSource(() => 0.9999); } // every die rolls its maximum

  /** A campaign whose turn is waiting at Upkeep (stayed on the world). */
  function atUpkeep(memory, traits) {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 },
      turnMemory: Object.assign({ hasPlayed: true }, memory),
      turn: null,
      models: { disabled: {} }
    };
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: traits || [] });
    T.confirm(c, { mode: 'stay' });
    return c;
  }

  function current(c) {
    const w = T.walk(c);
    return w.current ? w.current.id : (w.finished ? 'finished' : 'pending');
  }

  function last(c) {
    return c.turn.records[c.turn.records.length - 1];
  }

  function facts(c) {
    return T.context(c, c.turn.records).facts;
  }

  function linesText(output) {
    const out = [];
    (function visit(list) {
      for (const l of list || []) {
        out.push([l.label, l.title, l.text].filter(Boolean).join(' '));
        visit(l.children);
      }
    })((output.lines || []).concat(output.fu ? output.fu.lines : []));
    return out.join(' | ');
  }

  function upkeep(c, input) {
    return T.confirm(c, Object.assign({ crewCount: 6, sickBay: 0, hasShip: true, debt: 0, payment: 0, hullDamage: 0 }, input));
  }

  function noTasks(c, extra) {
    return T.confirm(c, Object.assign({ tasks: {} }, extra));
  }

  /* ---------------------------------------------------------------------- */
  group('World steps: upkeep');

  test('Upkeep is 1 credit up to 6 crew, +1 per crew member past 6', (assert) => {
    for (const [crew, sick, cost] of [[4, 0, 1], [6, 0, 1], [8, 0, 3], [9, 2, 2]]) {
      const c = atUpkeep();
      upkeep(c, { crewCount: crew, sickBay: sick });
      assert.equal(last(c).output.headline, 'Upkeep: ' + cost + (cost === 1 ? ' credit' : ' credits'), crew + ' crew, ' + sick + ' sick');
    }
    const highCost = atUpkeep({}, ['high-cost']);
    upkeep(highCost, { crewCount: 6 });
    assert.equal(last(highCost).output.headline, 'Upkeep: 3 credits', 'High cost counts 2 more crew');
  });

  test('crew in Sick Bay can’t take tasks', (assert) => {
    const c = atUpkeep();
    upkeep(c, { crewCount: 6, sickBay: 2 });
    assert.equal(facts(c).available, 4);
    assert.equal(T.currentFields(c).find((f) => f.key === 'tasks').total, 4);
    assert.ok(T.confirm(c, { tasks: { train: 2, explore: 2, decoy: 1 } }).error);
  });

  test('ship debt gains interest; paying it off stops it', (assert) => {
    let c = atUpkeep();
    upkeep(c, { debt: 40, payment: 5 });
    assert.equal(c.turnMemory.debt, 37, '35 left, +2 at 31 or more');
    c = atUpkeep();
    upkeep(c, { debt: 20 });
    assert.equal(c.turnMemory.debt, 21);
    c = atUpkeep();
    upkeep(c, { debt: 20, payment: 20 });
    assert.equal(c.turnMemory.debt, 0);
    assert.ok(upkeep(atUpkeep(), { debt: 5, payment: 9 }).error, 'can’t overpay');
  });

  test('debt of 75 or more can lose the ship', (assert) => {
    low();
    const c = atUpkeep();
    upkeep(c, { debt: 74 });
    assert.equal(last(c).output.headline, 'Ship seized!');
    assert.equal(c.turnMemory.hasShip, false);
    assert.equal(c.turnMemory.debt, 0);
    high();
    const safe = atUpkeep();
    upkeep(safe, { debt: 74 });
    assert.equal(safe.turnMemory.debt, 76);
    assert.equal(safe.turnMemory.hasShip, true);
  });

  test('one Hull Point is repaired for free', (assert) => {
    const c = atUpkeep();
    upkeep(c, { hullDamage: 3 });
    assert.equal(c.turnMemory.hullDamage, 2);
  });

  /* ---------------------------------------------------------------------- */
  group('World steps: crew tasks');

  test('a strong Patron search gives two offers, which pre-fill job offers', (assert) => {
    high();
    const c = atUpkeep({ patrons: 1 });
    upkeep(c, {});
    T.confirm(c, { tasks: { patron: 2 }, patrons: 1, patronCredits: 0 });
    assert.equal(facts(c).patronOffers, 2);
    assert.equal(T.currentFields(c).find((f) => f.key === 'offers').value, 2);
    assert.ok(/searchers/.test(JSON.stringify(last(c).output.fu.lines)));
  });

  test('a weak Patron search finds nothing', (assert) => {
    low();
    const c = atUpkeep();
    upkeep(c, {});
    T.confirm(c, { tasks: { patron: 1 }, patrons: 0, patronCredits: 0 });
    assert.equal(facts(c).patronOffers, 0);
  });

  test('recruiting below 6 crew is automatic; at 6 it needs 6+', (assert) => {
    low();
    const small = atUpkeep();
    upkeep(small, { crewCount: 4 });
    T.confirm(small, { tasks: { recruit: 2 } });
    const text = linesText(last(small).output);
    assert.equal((text.match(/Crew Type Table/g) || []).length, 0, 'table name is in line.table, not text');
    assert.equal(JSON.stringify(last(small).output.fu.lines).split('"table":"Species"').length - 1, 2, 'one species roll per recruit');

    const full = atUpkeep();
    upkeep(full, { crewCount: 6 });
    T.confirm(full, { tasks: { recruit: 2 } });
    assert.ok(/Nobody suitable/.test(linesText(last(full).output)));
  });

  test('a natural 1 on Repair always fails, without a Savvy note', (assert) => {
    low();
    const c = atUpkeep();
    upkeep(c, {});
    T.confirm(c, { tasks: { repair: 1 }, repairCredits: 3 });
    const text = linesText(last(c).output);
    assert.ok(/beyond fixing/.test(text));
    assert.ok(!/Savvy \+/.test(text));
  });

  test('Repair notes the Savvy and Engineer requirement', (assert) => {
    rng.setSource(() => 0.5); // 1D6 = 4
    const c = atUpkeep();
    upkeep(c, {});
    T.confirm(c, { tasks: { repair: 1 }, repairCredits: 0 });
    assert.ok(/Savvy \+2 or better \(\+1 or better for an Engineer\)/.test(linesText(last(c).output)));
  });

  test('Exploring can pause on a choice and gains carry forward', (assert) => {
    rng.setSource(() => 0.29); // D100 = 30: Alien merchant (a choice)
    const c = atUpkeep({ rivals: 1 });
    upkeep(c, {});
    T.confirm(c, { tasks: { explore: 1 }, rivals: 1 });
    assert.equal(current(c), 'pending');
    T.choose(c, 'pass');
    assert.equal(current(c), 'job-offers');

    rng.setSource(() => 0.56); // D100 = 57: Overheard some talk (+1 Rumor)
    const r = atUpkeep();
    upkeep(r, {});
    T.confirm(r, { tasks: { explore: 2 }, rivals: 0 });
    assert.equal(facts(r).rumorsGained, 2);
  });

  test('Travel restricted allows only one explorer', (assert) => {
    const c = atUpkeep({}, ['travel-restricted']);
    upkeep(c, {});
    assert.ok(/Travel restricted/.test(T.confirm(c, { tasks: { explore: 2 } }).error));
  });

  test('Tracking needs Rivals; success unlocks attacking a Rival', (assert) => {
    high();
    const c = atUpkeep({ rivals: 2 });
    upkeep(c, {});
    T.confirm(c, { tasks: { track: 1, decoy: 1 }, rivals: 2, trackCredits: 0 });
    assert.equal(facts(c).tracked, true);
    assert.equal(facts(c).decoys, 1);
  });

  /* ---------------------------------------------------------------------- */
  group('World steps: jobs, Rumors and battle');

  test('job offers roll Patron, Danger Pay, Time Frame and BHC', (assert) => {
    low(); // Patron D10 = 1: Corporation; Danger Pay 1 + 1
    const c = atUpkeep();
    upkeep(c, {});
    noTasks(c);
    T.confirm(c, { offers: 1 });
    const fu = last(c).output.fu;
    const job = fu.lines[0].children[0];
    assert.equal(job.rowId, 'corporation');
    const pay = job.children.find((l) => l.table === 'Danger Pay Table');
    assert.equal(pay.total, 2, 'Corporation +1');
    const conditions = job.children.find((l) => /Conditions \(5\+\)/.test(l.label));
    assert.ok(conditions, 'Corporations get Conditions on 5+');
    assert.equal(fu.lines[0].children.length, 1);
  });

  test('every Patron type script runs', (assert) => {
    for (let seed = 1; seed <= 20; seed++) {
      rng.setSource(rng.seeded(seed));
      for (const row of LP.data.tables['Patron Table'].rows) {
        const run = LP.followup.start([{ table: 'Patron Table', label: 'Patron' }], {});
        let guard = 0;
        while (run.pending && guard++ < 10) LP.followup.choose(run, run.pending.options[0].value);
        assert.equal(run.stack.length, 0, row.id);
      }
    }
  });

  test('no offers means no rolls', (assert) => {
    const c = atUpkeep();
    upkeep(c, {});
    noTasks(c);
    T.confirm(c, { offers: 0 });
    assert.equal(last(c).output.headline, 'No job offers');
    assert.equal(current(c), 'assign-equipment');
  });

  test('Rumors can become a Quest', (assert) => {
    low();
    const c = atUpkeep({ rumors: 2 });
    upkeep(c, {});
    noTasks(c);
    T.confirm(c, { offers: 0 });
    T.confirm(c, {});
    assert.equal(T.currentFields(c).find((f) => f.key === 'rumors').value, 2);
    T.confirm(c, { onQuest: false, rumors: 2 });
    assert.equal(last(c).output.headline, 'New Quest!');
    assert.equal(c.turnMemory.onQuest, true);
    assert.equal(c.turnMemory.rumors, 0);
  });

  test('Rivals can attack; otherwise you choose your battle', (assert) => {
    low();
    const hit = atUpkeep({ rivals: 2 });
    upkeep(hit, {});
    noTasks(hit);
    T.confirm(hit, { offers: 0 });
    T.confirm(hit, {});
    T.confirm(hit, { onQuest: false, rumors: 0 });
    T.confirm(hit, { rivals: 2, patronJob: false });
    assert.equal(last(hit).output.headline, 'Rival attack!');
    assert.equal(facts(hit).battleType, 'rival-attack');
    assert.equal(current(hit), 'battle-result');

    high();
    const free = atUpkeep({ rivals: 2 });
    upkeep(free, {});
    noTasks(free);
    T.confirm(free, { offers: 0 });
    T.confirm(free, {});
    T.confirm(free, { onQuest: true });
    T.confirm(free, { rivals: 2, patronJob: true, privateTransport: false });
    assert.equal(current(free), 'pending');
    const options = last(free).pending.options.map((o) => o.value);
    assert.deepEqual(options, ['opportunity', 'quest', 'patron']);
    T.choose(free, 'patron');
    assert.equal(facts(free).battleType, 'patron');
    assert.equal(current(free), 'battle-result');
  });

  test('Decoys add to the Rival check', (assert) => {
    low(); // 1D6 = 1, +2 Decoys = 3 > 2 Rivals
    const c = atUpkeep({ rivals: 2 });
    upkeep(c, {});
    T.confirm(c, { tasks: { decoy: 2 }, rivals: 2 });
    T.confirm(c, { offers: 0 });
    T.confirm(c, {});
    T.confirm(c, { onQuest: false, rumors: 0 });
    T.confirm(c, { rivals: 2, patronJob: false });
    assert.equal(last(c).output.headline, 'Battle: Opportunity mission');
  });

  test('a failed flee leaves only Assign Equipment and an Invasion Battle', (assert) => {
    low();
    const c = { settings: { difficulty: 'normal', crewSize: 6 }, turnMemory: { hasPlayed: true }, turn: null, models: { disabled: {} } };
    T.confirm(c, { firstTurn: false, invaded: true, worldTraits: [] });
    T.confirm(c, { hasShip: true });
    assert.equal(current(c), 'assign-equipment');
    const skipped = T.walk(c).items.filter((i) => i.status === 'skipped').map((i) => i.def.id);
    for (const id of ['upkeep', 'crew-tasks', 'job-offers']) assert.ok(skipped.includes(id), id);
    T.confirm(c, {});
    assert.equal(current(c), 'choose-battle');
    T.confirm(c, {});
    assert.equal(facts(c).battleType, 'invasion');
  });
})(window.LP);
