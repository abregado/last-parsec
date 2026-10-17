(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const E = LP.enemies;
  const B = LP.battle;
  const M = LP.models;

  function ctx(settings, extra) {
    const campaign = Object.assign({
      settings: Object.assign({ difficulty: 'normal', crewSize: 6 }, settings),
      models: { disabled: {}, invasion: {} },
      turnMemory: {}
    }, extra);
    return { settings: campaign.settings, campaign: campaign };
  }

  function battle(c, mission, fixed) {
    const b = B.newBattle(c, mission);
    for (const [key, value] of Object.entries(fixed || {})) {
      B.generate(b, c); // make sure dependent fields exist
      if (!B.setFixed(b, c, key, value)) throw new Error('could not fix ' + key + ' = ' + value);
    }
    return B.generate(b, c);
  }

  function keys(b, c) {
    return B.fields(b, c).map((f) => f.key);
  }

  /* ---------------------------------------------------------------------- */
  group('Enemy profiles');

  test('every enemy row parses: weapons, AI and stats', (assert) => {
    for (const name of M.ENEMY_TABLES) {
      for (const row of LP.data.tables[name].rows) {
        const e = E.parse(name, row);
        assert.ok(e.weapons.code || e.weapons.fixed || e.weapons.blades, name + ' / ' + row.id + ' weapons');
        assert.ok(E.AI_NAMES[e.ai], row.id + ' AI ' + e.ai);
        assert.ok(e.toughness >= 3 && e.toughness <= 6, row.id + ' toughness');
        assert.ok(E.DEPLOYMENT[e.ai], row.id + ' deployment pattern');
        assert.equal(e.category, E.categoryOfTable(name));
      }
    }
  });

  test('special rules are read from the notes', (assert) => {
    const get = (t, id) => E.getEnemy(t, id);
    assert.deepEqual(get('Criminal Elements', 'punks').seize, { modifier: 1 });
    assert.deepEqual(get('Hired Muscle', 'skulker-mercenaries').seize, { modifier: -1 });
    assert.deepEqual(get('Interested Parties', 'precursor-exiles').seize, { cannot: true });
    assert.deepEqual(get('Interested Parties', 'swift-war-squad').seize, { unmodified: true });
    const bots = get('Hired Muscle', 'war-bots');
    assert.equal(bots.save, '5+');
    assert.ok(bots.fearless);
    assert.ok(get('Interested Parties', 'kerin-colonists').invasionThreat);
    assert.ok(get('Interested Parties', 'primitives').weapons.blades);
    assert.equal(get('Roving Threats', 'krorg').weapons.fixed, 'Claws (Damage +2)');
    assert.deepEqual(get('Criminal Elements', 'brat-gang').weapons.code, { basic: 2, specialist: 'C' });
    assert.ok(get('Criminal Elements', 'pirates').extraLoot);
    assert.ok(get('Criminal Elements', 'raiders').extraFinds);
    assert.ok(get('Interested Parties', 'renegade-soldiers').rivalGrudge);
  });

  test('Unique Individuals: the first three adjust the main enemy', (assert) => {
    const main = E.getEnemy('Criminal Elements', 'gangers'); // CS +0, T3, 4", A
    const row = (id) => LP.data.tables['Unique Individuals'].rows.find((r) => r.id === id);
    const boss = E.parseUnique(row('enemy-boss'), main);
    assert.equal(boss.combat, 1);
    assert.equal(boss.toughness, 4);
    assert.equal(boss.ai, 'A', 'Boss uses the main enemy’s AI');
    const bruiser = E.parseUnique(row('enemy-bruiser'), main);
    assert.equal(bruiser.toughness, 4);
    assert.equal(bruiser.speed, main.speed);
    const killer = E.parseUnique(row('hired-killer'), main);
    assert.equal(killer.toughness, 5);
    assert.equal(killer.combat, 1);
    assert.ok(E.parseUnique(row('gene-dog'), main).guardian);
  });

  /* ---------------------------------------------------------------------- */
  group('Battle generation');

  test('an Opportunity battle generates every field', (assert) => {
    const c = ctx();
    for (let i = 0; i < 200; i++) {
      const b = battle(c, 'opportunity');
      const r = B.resolve(b, c);
      assert.ok(r.complete, 'complete');
      assert.ok(r.deployment && r.sight && r.objective && r.edge);
      assert.ok(r.force.total >= 1);
      for (const key of keys(b, c)) {
        const spec = B.fields(b, c).find((f) => f.key === key);
        if (spec.kind !== 'locked') assert.ok(b.slots[key] && b.slots[key].value !== null, key + ' rolled');
      }
    }
  });

  test('mission types lock the right fields', (assert) => {
    const c = ctx();
    const finale = battle(c, 'quest-finale');
    assert.equal(finale.slots.objective.mode, 'forced');
    assert.equal(finale.slots.objective.value, 'fight-off');
    assert.ok(B.force(finale, c).modifiers.some((m) => m.label === 'Quest finale'));

    const tracked = battle(c, 'rival');
    assert.equal(tracked.slots.rivalAttack.value, 'showdown');
    assert.equal(B.fields(tracked, c).find((f) => f.key === 'objective').kind, 'locked');

    const invasion = battle(c, 'invasion');
    const k = keys(invasion, c);
    assert.ok(!k.includes('deployment') && !k.includes('sight') && !k.includes('category'));
    assert.ok(B.force(invasion, c).modifiers.some((m) => m.label === 'Invasion' && m.value === 2));
    assert.equal(B.resolve(invasion, c).uniques.length, 0, 'no Unique Individuals in Invasions');
  });

  test('Rival fights never roll Roving Threats (Unknown Rival column)', (assert) => {
    const c = ctx();
    for (let i = 0; i < 300; i++) {
      const b = battle(c, 'rival-attack');
      assert.ok(b.slots.category.value !== 'roving-threats');
      assert.ok(b.slots.rivalAttack.value);
    }
  });

  test('Invasions only roll enemies ticked for invasions and enabled', (assert) => {
    const c = ctx();
    M.setEnabled(c.campaign, 'Roving Threats', 'swarm-brood', false);
    for (let i = 0; i < 300; i++) {
      const b = battle(c, 'invasion');
      const [table, id] = b.slots.enemy.value.split('|');
      assert.ok(M.isInvasion(c.campaign, table, id) && id !== 'swarm-brood', b.slots.enemy.value);
    }
  });

  test('disabled models are never rolled, and empty categories are skipped', (assert) => {
    const c = ctx();
    M.setAll(c.campaign, 'Hired Muscle', false);
    M.setAll(c.campaign, 'Criminal Elements', false);
    M.setEnabled(c.campaign, 'Criminal Elements', 'pirates', true);
    for (let i = 0; i < 300; i++) {
      const b = battle(c, 'opportunity');
      assert.ok(b.slots.category.value !== 'hired-muscle');
      if (b.slots.category.value === 'criminal-elements') assert.equal(b.slots.enemy.value, 'Criminal Elements|pirates');
    }
  });

  test('fixed fields survive Generate; changing the category re-rolls the enemy', (assert) => {
    const c = ctx();
    const b = battle(c, 'opportunity', { category: 'hired-muscle' });
    for (let i = 0; i < 30; i++) {
      B.generate(b, c);
      assert.equal(b.slots.category.value, 'hired-muscle');
      assert.ok(b.slots.enemy.value.startsWith('Hired Muscle|'));
    }
    B.setFixed(b, c, 'category', 'roving-threats');
    assert.ok(b.slots.enemy.value.startsWith('Roving Threats|'));
  });

  test('rerolls never repeat (tables and dice)', (assert) => {
    const c = ctx();
    for (let i = 0; i < 100; i++) {
      const b = battle(c, 'opportunity');
      for (const key of ['deployment', 'sight', 'objective', 'enemy', 'numbers', 'edge']) {
        const before = b.slots[key].value;
        if (!B.canReroll(b, c, key)) continue;
        assert.ok(B.reroll(b, c, key), 'reroll ' + key);
        assert.ok(b.slots[key].value !== before, key + ' repeated');
      }
    }
  });

  test('enemy number dice follow the crew size', (assert) => {
    rng.setSource(rng.seeded(4));
    const fake = (size) => {
      const c = ctx({ crewSize: size });
      const b = battle(c, 'opportunity', { category: 'criminal-elements' });
      return { c, b };
    };
    for (let i = 0; i < 100; i++) {
      const six = fake(6);
      const r6 = B.rollNumbers(six.c, six.b);
      assert.equal(r6.dice.length, 2);
      assert.equal(r6.value, Math.max(...r6.dice));
      const four = fake(4);
      const r4 = B.rollNumbers(four.c, four.b);
      assert.equal(r4.value, Math.min(...r4.dice));
      const five = fake(5);
      assert.equal(B.rollNumbers(five.c, five.b).dice.length, 1);
    }
  });

  test('Challenging rerolls 1s and 2s once', (assert) => {
    const seq = [0, 0.99, 0, 0.99]; // each die: 1, rerolled at once to 6
    let i = 0;
    const c = ctx({ difficulty: 'challenging' });
    const b = battle(c, 'opportunity', { category: 'criminal-elements' });
    rng.setSource(() => seq[i++ % seq.length]);
    const r = B.rollNumbers(c, b);
    assert.deepEqual(r.first, [1, 1]);
    assert.deepEqual(r.dice, [6, 6]);
  });

  test('Specialists and Lieutenant follow the total', (assert) => {
    const c = ctx();
    const b = battle(c, 'opportunity', { category: 'hired-muscle', enemy: 'Hired Muscle|enforcers' }); // Numbers +0
    const at = (n) => { B.setFixed(b, c, 'numbers', n); return B.force(b, c); };
    let f = at(2);
    assert.deepEqual([f.total, f.specialists, f.lieutenant], [2, 0, false]);
    f = at(4);
    assert.deepEqual([f.specialists, f.lieutenant, f.regulars], [1, true, 2]);
    f = at(6);
    assert.equal(f.specialists, 1);
    const q = battle(c, 'quest', { category: 'hired-muscle', enemy: 'Hired Muscle|enforcers' });
    assert.ok(B.setFixed(q, c, 'objective', 'defend'), 'Defend is a Quest objective');
    assert.equal(B.setFixed(b, c, 'objective', 'defend'), false, 'not an Opportunity objective');
    B.setFixed(q, c, 'numbers', 6);
    f = B.force(q, c); // 6 + 1 Defend = 7
    assert.deepEqual([f.total, f.specialists], [7, 2]);
    const insane = ctx({ difficulty: 'insanity' });
    const bi = battle(insane, 'opportunity', { category: 'hired-muscle', enemy: 'Hired Muscle|enforcers' });
    B.setFixed(bi, insane, 'numbers', 3);
    const fi = B.force(bi, insane); // 3 + 1 Insanity = 4
    assert.deepEqual([fi.total, fi.specialists], [4, 2]);
  });

  test('number modifiers: difficulty, deployment, hazards, crew and world traits', (assert) => {
    const c = ctx({ difficulty: 'easy' }, { turnMemory: { worldTraits: ['rampant-crime'] } });
    const b = battle(c, 'patron', { category: 'criminal-elements', enemy: 'Criminal Elements|gangers', deployment: 'small-encounter' }); // Numbers +2
    B.setOption(b, c, 'dangerousJob', true);
    B.setOption(b, c, 'crewFielded', 4);
    B.setFixed(b, c, 'numbers', 5);
    const f = B.force(b, c);
    const labels = f.modifiers.map((m) => m.label + ' ' + m.value);
    // 5 + 2 Numbers + 1 Dangerous + 1 Rampant - 1 crew = 8; outnumbers 4 crew -> Small encounter -2 = 6; Easy -1 = 5
    assert.ok(labels.includes('Dangerous Job 1'));
    assert.ok(labels.includes('Rampant crime 1'));
    assert.ok(labels.includes('Crew 2+ below standard -1'));
    assert.ok(labels.includes('Small encounter -2'));
    assert.ok(labels.includes('Easy -1'));
    assert.equal(f.total, 5);
  });

  test('Unique Individuals: 9+ (Interested Parties +1), never Roving, always on Insanity', (assert) => {
    const c = ctx();
    const ip = battle(c, 'opportunity', { category: 'interested-parties', enemy: 'Interested Parties|zealots' });
    B.setFixed(ip, c, 'uniqueCheck', 8);
    assert.equal(B.uniqueStatus(ip, c).count, 1, '8 + 1 = 9');
    assert.ok(ip.slots.unique && ip.slots.unique.value);
    B.setFixed(ip, c, 'uniqueCheck', 7);
    assert.equal(B.uniqueStatus(ip, c).count, 0);
    assert.ok(!ip.slots.unique);

    const rov = battle(c, 'opportunity', { category: 'roving-threats' });
    assert.ok(!keys(rov, c).includes('uniqueCheck'));

    const ins = ctx({ difficulty: 'insanity' });
    const b = battle(ins, 'opportunity', { category: 'roving-threats' });
    assert.ok(B.uniqueStatus(b, ins).count >= 1);
    B.setFixed(b, ins, 'uniqueCheck', 11);
    assert.equal(B.resolve(b, ins).uniques.length, 2);
  });

  test('weapons: codes roll the right columns; beasts and Primitives don’t roll', (assert) => {
    const c = ctx();
    const brat = battle(c, 'opportunity', { category: 'criminal-elements', enemy: 'Criminal Elements|brat-gang' }); // 2 C
    B.setFixed(brat, c, 'numbers', 6);
    const r = B.resolve(brat, c);
    const basicRow = LP.data.tables['Varied Armaments Table'].rows.find((x) => x.id === brat.slots.weaponBasic.value);
    assert.ok(r.weapons.regular.startsWith(basicRow.weapon_2));
    assert.ok(r.weapons.specialist.length > 0);
    assert.ok(/Blade/.test(r.weapons.lieutenant));
    B.setOption(brat, c, 'varied', true);
    assert.ok(brat.slots.weaponBasic2 && brat.slots.weaponBasic2.value === null || brat.slots.weaponBasic2.value);

    const bugs = battle(c, 'opportunity', { category: 'roving-threats', enemy: 'Roving Threats|large-bugs' });
    assert.ok(!keys(bugs, c).includes('weaponBasic'));
    assert.equal(B.resolve(bugs, c).weapons.regular, 'Mandibles (Damage +1)');

    const prim = battle(c, 'opportunity', { category: 'interested-parties', enemy: 'Interested Parties|primitives' });
    assert.equal(B.resolve(prim, c).weapons.specialist, 'Brutal Melee Weapon');
  });

  test('Criminal bounty pays on 1–3 only', (assert) => {
    const c = ctx();
    const b = battle(c, 'opportunity', { category: 'criminal-elements' });
    B.setFixed(b, c, 'bounty', 2);
    assert.equal(B.resolve(b, c).bounty, 2);
    B.setFixed(b, c, 'bounty', 5);
    assert.equal(B.resolve(b, c).bounty, 0);
  });

  /* ---------------------------------------------------------------------- */
  group('Seize the Initiative and Battle Events');

  test('Seize modifiers: Hired Muscle, enemy notes, Feral, difficulty', (assert) => {
    const c = ctx({ difficulty: 'hardcore' });
    const b = battle(c, 'opportunity', { category: 'hired-muscle', enemy: 'Hired Muscle|skulker-mercenaries' });
    b.seize.savvy = 2;
    b.seize.outnumbered = false;
    let mods = B.seizeModifiers(b, c).modifiers.map((m) => m.label + ' ' + m.value);
    assert.ok(mods.includes('Hired Muscle -1'));
    assert.ok(mods.includes('Skulker Mercenaries -1'));
    assert.ok(mods.includes('Hardcore -2'));
    b.seize.feral = true;
    mods = B.seizeModifiers(b, c).modifiers.map((m) => m.label + ' ' + m.value);
    assert.ok(mods.includes('Hired Muscle (ignored: Feral) 0'));
    assert.ok(mods.includes('Hardcore -2'), 'difficulty isn’t an enemy penalty');

    const exiles = battle(ctx(), 'opportunity', { category: 'interested-parties', enemy: 'Interested Parties|precursor-exiles' });
    assert.ok(B.seizeModifiers(exiles, ctx()).cannot);
    assert.equal(B.rollSeize(exiles, ctx()), null);

    const ambush = battle(ctx(), 'rival-attack', { rivalAttack: 'ambush' });
    assert.ok(/Ambush/.test(B.seizeModifiers(ambush, ctx()).cannot));
  });

  test('Seize rolls 2D6 + modifiers and succeeds on 10+', (assert) => {
    rng.setSource(() => 0.9999);
    const c = ctx();
    const b = battle(c, 'opportunity', { category: 'criminal-elements', enemy: 'Criminal Elements|gangers' });
    b.seize.savvy = 1;
    b.seize.outnumbered = false;
    const r = B.rollSeize(b, c);
    assert.equal(r.total, 13);
    assert.ok(r.success);
  });

  test('Battle Events: one per round, rerolling replaces it', (assert) => {
    const c = ctx();
    const b = battle(c, 'opportunity');
    B.rollEvent(b, 4);
    B.rollEvent(b, 2);
    B.rollEvent(b, 2);
    assert.deepEqual(b.events.map((e) => e.round), [2, 4]);
    assert.ok(LP.data.tables['Battle Events Table'].rows.some((r) => r.id === b.events[0].rowId));
    B.generate(b, c);
    assert.equal(b.events.length, 0, 'a new battle clears them');
  });

  test('stored battles survive JSON and repair junk', (assert) => {
    const c = ctx();
    const b = battle(c, 'patron');
    const copy = B.normalize(JSON.parse(JSON.stringify(b)), c);
    assert.deepEqual(B.resolve(copy, c).force, B.resolve(b, c).force);
    assert.equal(B.normalize(null, c), null);
    const junk = B.normalize({ mission: 'nonsense', slots: { enemy: { mode: 'fixed', value: 'Nope|nope' } } }, c);
    assert.equal(junk.mission, 'opportunity');
    assert.ok(!junk.slots.enemy || junk.slots.enemy.value === null);
  });

  test('summary gives Post-Battle what it needs', (assert) => {
    const c = ctx();
    const b = battle(c, 'opportunity', { category: 'criminal-elements', enemy: 'Criminal Elements|pirates' });
    const s = B.summary(b, c);
    assert.equal(s.enemyCategory, 'criminal-elements');
    assert.equal(s.enemyName, 'Pirates');
    assert.ok(s.extraLoot);
    assert.equal(s.invasionThreat, false);
  });
})(window.LP);
