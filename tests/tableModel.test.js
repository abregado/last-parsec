(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const B = LP.battle;
  const R = LP.roster;
  const T = LP.tableModel;

  function setup(crewItems) {
    const campaign = {
      name: 'Test',
      settings: { difficulty: 'normal', crewSize: 6 },
      models: { disabled: {}, invasion: {} },
      turnMemory: {},
      characters: [],
      crew: {},
      turn: null
    };
    LP.planets.ensure(campaign);
    R.ensure(campaign);
    const ava = R.addMember(campaign, { name: 'Ava', speciesId: 'baseline-human', profile: { reactions: 1, speed: 4, combat: 1, toughness: 3, savvy: 0, luck: 1 } });
    for (const [table, rowId] of crewItems || []) R.addItem(campaign, { table: table, rowId: rowId, carrierId: ava.id });
    const ctx = { settings: campaign.settings, campaign: campaign };
    const battle = B.generate(B.newBattle(ctx, 'opportunity'), ctx);
    campaign.battle = battle;
    return { campaign, ctx, battle, ava };
  }

  group('Table view model');

  test('every weapon in the item tables has stats', (assert) => {
    const names = [];
    for (const [table, kind] of Object.entries(LP.items.ITEM_TABLES)) {
      if (kind !== 'weapon') continue;
      const t = LP.rng.getTable(table);
      for (const row of t.rows) for (const n of LP.items.expandRow(table, row.id)) names.push(n);
    }
    for (const n of names) assert.ok(LP.data.gear.weapons[T.keyOf(n)], n + ' is missing from gear.js');
  });

  test('every weapon trait has a rule', (assert) => {
    for (const w of Object.values(LP.data.gear.weapons)) {
      for (const t of w.traits) assert.ok(LP.data.gear.traits[t], w.name + ': ' + t);
    }
  });

  test('a weapon line has range, shots, damage and a rule per trait', (assert) => {
    const w = T.weaponOf('Beam pistol', 1);
    assert.equal(w.range, '10"');
    assert.equal(w.shots, '1');
    assert.equal(w.damage, '+1');
    assert.deepEqual(w.rules.map((r) => r.name), ['Pistol', 'Critical']);
    const blade = T.weaponOf('Blade', 1);
    assert.equal(blade.range, 'Brawl');
    assert.equal(blade.shots, '—');
    assert.equal(T.weaponOf('Frakk Grenade', 3).name, 'Frakk Grenade ×3');
  });

  test('an unknown weapon keeps its name and shows dashes', (assert) => {
    const w = T.weaponOf('Claws (Damage +1)', 1);
    assert.equal(w.name, 'Claws (Damage +1)');
    assert.equal(w.range, '—');
    assert.equal(w.rules.length, 0);
  });

  test('enemy weapon text splits into lines', (assert) => {
    assert.deepEqual(T.enemyWeapons('Hand gun + Blade').map((w) => w.name), ['Hand gun', 'Blade']);
    assert.equal(T.enemyWeapons('Blade (and a second Blade)').length, 2);
  });

  test('no model before a battle is generated', (assert) => {
    const s = setup();
    const fresh = B.newBattle(s.ctx, 'opportunity');
    assert.equal(T.build(s.campaign, fresh, s.ctx), null);
  });

  test('the model lists the enemy force and the crew', (assert) => {
    const s = setup([['Slug Weapons Subtable', 'hand-gun'], ['Gear Table', 'combat-armor']]);
    const m = T.build(s.campaign, s.battle, s.ctx);
    const total = B.resolve(s.battle, s.ctx).force.total;
    assert.equal(m.enemies.units.filter((u) => u.sub !== 'Unique Individual').length, total);
    assert.equal(m.enemies.units[0].stats.length, m.enemies.heads.length);
    assert.equal(m.crew.units.length, 1);
    const ava = m.crew.units[0];
    assert.equal(ava.name, 'Ava');
    assert.equal(ava.stats.length, m.crew.heads.length);
    assert.equal(ava.stats[1], '4"');
    assert.equal(ava.weapons[0].name, 'Hand Gun');
    assert.ok(ava.rules.some((r) => r.name === 'Combat Armor' && /Saving Throw/.test(r.text)), 'gear rule');
    assert.ok(m.brief.some((b) => b.label === 'Objective'));
    assert.ok(m.enemies.rules.length > 0);
  });

  test('a damaged weapon is not listed as usable', (assert) => {
    const s = setup([['Slug Weapons Subtable', 'hand-gun']]);
    R.itemsOf(s.campaign, s.ava.id)[0].damaged = true;
    const ava = T.build(s.campaign, s.battle, s.ctx).crew.units[0];
    assert.equal(ava.weapons.length, 0);
    assert.ok(ava.rules.some((r) => /damaged/.test(r.name)));
  });

  test('identical grenades are one line with a count', (assert) => {
    const s = setup();
    for (let i = 0; i < 3; i++) R.addItem(s.campaign, { name: 'Frakk grenade', table: 'Grenades Subtable', rowId: '3-frakk-grenades', carrierId: s.ava.id });
    const ava = T.build(s.campaign, s.battle, s.ctx).crew.units[0];
    assert.equal(ava.weapons.length, 1);
    assert.equal(ava.weapons[0].name, 'Frakk grenade ×3');
  });

  test('the model survives a JSON round trip', (assert) => {
    const s = setup([['Slug Weapons Subtable', 'hand-gun']]);
    const m = T.build(s.campaign, s.battle, s.ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  });

  test('a model survives the trip through a URL hash, accents and symbols included', (assert) => {
    const model = { battleId: 'x', title: 'Café · 4×2 — "ok"', units: [1, 2, 3] };
    const hash = LP.tableStore.encode(model);
    assert.ok(/^#m=[A-Za-z0-9_-]+$/.test(hash));
    assert.deepEqual(LP.tableStore.decode(hash), model);
    assert.equal(LP.tableStore.decode('#nonsense'), null);
    assert.equal(LP.tableStore.decode('#m=@@@'), null);
  });

  group('Table view marks');

  test('marks carry over for the same battle and reset for a new one', (assert) => {
    const store = LP.tableStore;
    const model = { battleId: 'a', events: [{ round: 2, rowId: 'x', natural: 5 }] };
    const marks = store.loadMarks(model);
    assert.deepEqual(marks.events[2], { rowId: 'x', natural: 5 });
    assert.deepEqual(marks.out, {});
    const other = store.loadMarks({ battleId: 'b', events: [] });
    assert.equal(other.battleId, 'b');
  });
})(window.LP);
