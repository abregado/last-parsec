(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const M = LP.models;
  const rng = LP.rng;

  function campaign() {
    return { models: { disabled: {}, invasion: {} } };
  }

  group('Models and settings');

  test('all four enemy tables exist', (assert) => {
    for (const name of M.ENEMY_TABLES) assert.ok(LP.data.tables[name], name);
  });

  test('with everything enabled, chances match the printed weights', (assert) => {
    const c = campaign();
    for (const name of M.ENEMY_TABLES) {
      const o = M.odds(c, name);
      assert.equal(o.total, 100, name);
      assert.equal(o.enabledCount, LP.data.tables[name].rows.length);
      assert.near(o.rows[0].chance, o.rows[0].row.weight / 100, 1e-9);
    }
  });

  test('switching entries off raises the others and still sums to 1', (assert) => {
    const c = campaign();
    M.setEnabled(c, 'Criminal Elements', 'gangers', false); // weight 10
    const o = M.odds(c, 'Criminal Elements');
    assert.equal(o.total, 90);
    assert.equal(o.rows.find((r) => r.row.id === 'gangers').chance, null);
    const sum = o.rows.reduce((s, r) => s + (r.chance || 0), 0);
    assert.near(sum, 1, 1e-9);
    assert.near(o.rows.find((r) => r.row.id === 'punks').chance, 9 / 90, 1e-9);
  });

  test('disabled entries are never rolled', (assert) => {
    const c = campaign();
    const rows = LP.data.tables['Roving Threats'].rows;
    rows.slice(0, rows.length - 2).forEach((r) => M.setEnabled(c, 'Roving Threats', r.id, false));
    const allowed = rows.slice(-2).map((r) => r.id);
    for (let i = 0; i < 500; i++) assert.ok(allowed.includes(M.rollEnemy(c, 'Roving Threats').id));
  });

  test('enabled odds hold when rolling', (assert) => {
    rng.setSource(rng.seeded(9));
    const c = campaign();
    M.setAll(c, 'Hired Muscle', false);
    M.setEnabled(c, 'Hired Muscle', 'unknown-mercs', true);  // weight 14
    M.setEnabled(c, 'Hired Muscle', 'black-ops-team', true); // weight 3
    let mercs = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (M.rollEnemy(c, 'Hired Muscle').id === 'unknown-mercs') mercs++;
    assert.near(mercs / n, 14 / 17, 0.01);
  });

  test('all off rolls null; All on restores everything', (assert) => {
    const c = campaign();
    M.setAll(c, 'Interested Parties', false);
    assert.equal(M.rollEnemy(c, 'Interested Parties'), null);
    assert.equal(M.odds(c, 'Interested Parties').enabledCount, 0);
    M.setAll(c, 'Interested Parties', true);
    assert.equal(M.enabledRows(c, 'Interested Parties').length, 16);
  });

  test('toggling the same entry twice leaves no duplicates', (assert) => {
    const c = campaign();
    M.setEnabled(c, 'Criminal Elements', 'punks', false);
    M.setEnabled(c, 'Criminal Elements', 'punks', false);
    assert.deepEqual(c.models.disabled['Criminal Elements'], ['punks']);
    M.setEnabled(c, 'Criminal Elements', 'punks', true);
    assert.deepEqual(c.models.disabled['Criminal Elements'], []);
  });

  test('invasion defaults to the book’s Invasion Threat entries', (assert) => {
    const c = campaign();
    const ids = M.invasionCandidates(c).map((x) => x.row.id).sort();
    assert.deepEqual(ids, ['abductor-raiders', 'converted-acquisition', 'converted-infiltrators', 'kerin-colonists', 'swarm-brood']);
    assert.ok(M.isInvasion(c, 'Roving Threats', 'swarm-brood'));
    assert.ok(!M.isInvasion(c, 'Criminal Elements', 'pirates'));
  });

  test('ticking and unticking invasion entries only changes that table', (assert) => {
    const c = campaign();
    M.setInvasion(c, 'Criminal Elements', 'pirates', true);
    M.setInvasion(c, 'Roving Threats', 'swarm-brood', false);
    assert.deepEqual(c.models.invasion['Criminal Elements'], ['pirates']);
    assert.ok(!M.isInvasion(c, 'Roving Threats', 'swarm-brood'));
    assert.ok(M.isInvasion(c, 'Roving Threats', 'converted-acquisition'), 'other defaults in that table stay');
    assert.ok(M.isInvasion(c, 'Interested Parties', 'kerin-colonists'), 'untouched tables keep their defaults');
    M.resetInvasion(c);
    assert.ok(!M.isInvasion(c, 'Criminal Elements', 'pirates'));
  });

  test('invasion rolls need both ticks: invasion and models', (assert) => {
    const c = campaign();
    M.setEnabled(c, 'Roving Threats', 'swarm-brood', false);
    for (let i = 0; i < 300; i++) {
      const pick = M.rollInvasion(c);
      assert.ok(pick.row.id !== 'swarm-brood', 'disabled entries never invade');
      assert.ok(M.isInvasion(c, pick.table, pick.row.id));
    }
    for (const t of M.ENEMY_TABLES) M.setAll(c, t, false);
    assert.equal(M.rollInvasion(c), null);
  });

  test('invasion rolls follow the printed weights', (assert) => {
    rng.setSource(rng.seeded(21));
    const c = campaign();
    for (const t of M.ENEMY_TABLES) {
      c.models.invasion[t] = [];
    }
    M.setInvasion(c, 'Roving Threats', 'swarm-brood', true);          // weight 10
    M.setInvasion(c, 'Roving Threats', 'converted-acquisition', true); // weight 4
    let swarm = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (M.rollInvasion(c).row.id === 'swarm-brood') swarm++;
    assert.near(swarm / n, 10 / 14, 0.01);
  });

  test('a unit lists the weapons of its basic and specialist columns; fixed weapons have none', (assert) => {
    const gangers = LP.data.tables['Criminal Elements'].rows.find((r) => r.id === 'gangers');
    const w = M.weaponsFor(gangers);
    assert.ok(w.basic.includes('Handgun') && w.specialist.length > 0);
    assert.equal(M.weaponsFor({ weapons: 'Claws (Damage +1)' }), null);
  });

  test('switched-off weapons are excluded from the roll, unless that leaves nothing', (assert) => {
    const c = campaign();
    const rows = LP.data.tables['Varied Armaments Table'].rows;
    M.setWeapon(c, 'Handgun', false);
    assert.equal(M.isWeaponOn(c, 'Handgun'), false);
    const out = M.weaponExclude(c, 'basic', 2);
    assert.equal(out.length, rows.filter((r) => r.weapon_2 === 'Handgun').length);
    for (const name of M.weaponNames('basic', 2)) M.setWeapon(c, name, false);
    assert.deepEqual(M.weaponExclude(c, 'basic', 2), []);
    M.setWeapon(c, 'Handgun', true);
    assert.equal(M.isWeaponOn(c, 'Handgun'), true);
  });

  test('notes split into a description, abilities and tags', (assert) => {
    const punks = LP.data.tables['Criminal Elements'].rows.find((r) => r.id === 'punks');
    const n = LP.enemies.splitNotes(punks.notes);
    assert.ok(n.description.startsWith('Disaffected delinquents') && !n.description.includes('Careless'));
    assert.deepEqual(n.abilities.map((a) => a.name), ['Careless', 'Bad shots']);
    assert.equal(n.abilities[0].text, 'You are +1 to Seize the Initiative.');
    const acq = LP.enemies.splitNotes('Cyborgs. Built-in: Always count as stationary when firing. Invasion Threat. Test at +1. 6+ Saving Throw.');
    assert.deepEqual(acq.tags, ['Invasion Threat', 'Test at +1', '6+ Saving Throw']);
    assert.equal(acq.abilities[0].text, 'Always count as stationary when firing.');
  });

  test('settings normalize to Normal / crew 6 and keep valid values', (assert) => {
    assert.deepEqual(LP.settings.normalize(undefined), { difficulty: 'normal', crewSize: 6 });
    assert.deepEqual(LP.settings.normalize({ difficulty: 'insanity', crewSize: 4 }), { difficulty: 'insanity', crewSize: 4 });
    assert.deepEqual(LP.settings.normalize({ difficulty: 'silly', crewSize: 9 }), { difficulty: 'normal', crewSize: 6 });
    assert.equal(LP.settings.summary({ difficulty: 'hardcore', crewSize: 5 }), 'Hardcore · crew 5');
  });
})(window.LP);
