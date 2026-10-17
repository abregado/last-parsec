(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const A = LP.archetypes;
  const P = LP.planets;

  function campaign(extra) {
    const c = Object.assign({ settings: { difficulty: 'normal', crewSize: 6 }, models: { disabled: {}, invasion: {} }, turnMemory: {} }, extra);
    P.ensure(c);
    return c;
  }

  /* ---------------------------------------------------------------------- */
  group('Species table');

  test('the combined table gives the book’s two-step odds', (assert) => {
    const table = A.speciesTable();
    assert.equal(table.length, 26);
    assert.equal(table.reduce((s, r) => s + r.weight, 0), 10000);
    const byId = Object.fromEntries(table.map((r) => [r.id, r]));
    assert.equal(byId['baseline-human'].weight, 6000);
    assert.equal(byId['engineer'].weight, 400);
    assert.equal(byId['de-converted'].weight, 20);
    assert.equal(byId['engineer'].how, 'Primary Alien 20 × Engineer 20');
    const rows = LP.character.speciesRows();
    for (const r of rows) assert.equal(byId[r.id].weight, r.weight, r.id + ' matches the character generator');
  });

  test('rolling with archetype weights; all zero falls back to the defaults', (assert) => {
    const a = A.emptyArchetype('Feral world');
    a.species.feral = 5;
    for (let i = 0; i < 100; i++) assert.equal(A.rollSpecies(a).id, 'feral');
    const none = A.emptyArchetype('Nobody');
    assert.ok(A.rollSpecies(none), 'falls back');
    assert.deepEqual(A.speciesWeights(none), A.defaultSpeciesWeights());
  });

  /* ---------------------------------------------------------------------- */
  group('Archetypes');

  test('the default archetype allows everything', (assert) => {
    const a = A.defaultArchetype();
    assert.equal(a.name, 'All options');
    assert.equal(a.worldTraits.length, LP.data.tables['World Traits Table'].rows.length);
    assert.equal(a.patrons.length, 6);
    assert.equal(a.rivals.length, 47);
    assert.ok(a.patrons.every((p) => p.forces.length === 47 && p.uniques.length === 22 && p.patronType));
    assert.ok(a.rivals.every((r) => r.forces.length === 1 && r.uniques.length === 22));
    assert.equal(a.rivals.find((r) => r.forces[0] === 'Criminal Elements|pirates').name, 'Pirates');
    for (const [key, table] of Object.entries(A.EVENT_TABLES)) assert.equal(a.events[key].length, LP.data.tables[table].rows.length, key);
    assert.deepEqual(A.warnings(a), []);
  });

  test('ensure adds the default; normalize repairs junk; copy gets new ids', (assert) => {
    const c = {};
    A.ensure(c);
    assert.equal(c.archetypes.length, 1);
    const junk = A.normalize({ name: '  ', worldTraits: ['haze', 'nope'], species: { feral: -3, swift: 7.6 }, rivals: [{ name: 'X', forces: ['Nope|nope', 'Hired Muscle|enforcers'] }] });
    assert.equal(junk.name, 'Unnamed archetype');
    assert.deepEqual(junk.worldTraits, ['haze']);
    assert.equal(junk.species.feral, 0);
    assert.equal(junk.species.swift, 8);
    assert.deepEqual(junk.rivals[0].forces, ['Hired Muscle|enforcers']);
    const copy = A.copyArchetype(c.archetypes[0]);
    assert.ok(copy.id !== c.archetypes[0].id);
    assert.ok(copy.rivals[0].id !== c.archetypes[0].rivals[0].id);
    assert.equal(copy.name, 'All options (copy)');
  });

  test('event restrictions merge with Models exclusions for follow-up rolls', (assert) => {
    const c = campaign();
    c.models.disabled['Criminal Elements'] = ['gangers'];
    const a = A.emptyArchetype('Quiet');
    a.events.travel = ['uneventful-trip'];
    const map = A.disabledMap(c, a);
    assert.deepEqual(map['Criminal Elements'], ['gangers']);
    assert.equal(map['Starship Travel Events Table'].length, 15);
    assert.deepEqual(map['Trade Table'], [], 'empty list = full table');
    for (let i = 0; i < 50; i++) {
      const run = LP.followup.start([{ table: 'Starship Travel Events Table' }], { disabled: map });
      assert.equal(run.lines[0].rowId, 'uneventful-trip');
    }
  });

  test('the follow-up species step uses the given weights', (assert) => {
    for (let i = 0; i < 50; i++) {
      const run = LP.followup.start([{ species: true, label: 'Recruit' }], { speciesWeights: { swift: 1 } });
      assert.equal(run.lines[0].rowId, 'swift');
      assert.ok(/Swift \(Primary Alien\)/.test(run.lines[0].title));
    }
  });

  /* ---------------------------------------------------------------------- */
  group('Planets');

  test('worlds roll traits only from their archetype', (assert) => {
    const c = campaign();
    const hazy = A.emptyArchetype('Hazy');
    hazy.worldTraits = ['haze', 'fog'];
    c.archetypes.push(hazy);
    for (let i = 0; i < 100; i++) {
      const { planet, world } = P.createPlanet(c, { archetypeId: hazy.id, wildGalaxy: true });
      assert.ok(planet.worldTraits.every((t) => t === 'haze' || t === 'fog'));
      assert.equal(world.rolls.traits.length, 2);
      assert.equal(planet.archetypeId, hazy.id);
      assert.equal(planet.licence.required, world.rolls.licence >= 5);
    }
    const names = c.planets.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, 'generated names are unique');
  });

  test('Random archetype picks among all of them', (assert) => {
    rng.setSource(rng.seeded(3));
    const c = campaign();
    c.archetypes.push(A.emptyArchetype('Second'));
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(P.pickArchetype(c, 'random').id);
    assert.equal(seen.size, 2);
  });

  test('new Patrons use unused entries first, then reuse with a number', (assert) => {
    const c = campaign();
    const { planet } = P.createPlanet(c, {});
    for (let i = 0; i < 6; i++) P.newPatron(c, planet);
    assert.equal(new Set(planet.patrons.map((p) => p.entryId)).size, 6, 'all six types used once');
    const seventh = P.newPatron(c, planet);
    assert.ok(/\(2\)$/.test(seventh.name), seventh.name);
    assert.ok(seventh.patronType);
    assert.equal(seventh.forces.length, 47);
  });

  test('a Patron from an empty archetype is named after its rolled type', (assert) => {
    const c = campaign();
    const empty = A.emptyArchetype('Empty');
    c.archetypes.push(empty);
    const { planet } = P.createPlanet(c, { archetypeId: empty.id });
    const patron = P.newPatron(c, planet);
    assert.equal(patron.name, P.patronTypeName(patron.patronType));
  });

  test('a Rival you fought matches its enemy; unknown enemies get a plain Rival', (assert) => {
    const c = campaign();
    const { planet } = P.createPlanet(c, {});
    const r = P.newRival(c, planet, { enemy: 'Criminal Elements|pirates' });
    assert.equal(r.name, 'Pirates');
    assert.equal(r.enemy, 'Criminal Elements|pirates');
    assert.equal(r.uniques.length, 22);
    const again = P.newRival(c, planet, { enemy: 'Criminal Elements|pirates' });
    assert.equal(again.name, 'Pirates (2)');

    const empty = A.emptyArchetype('Empty');
    c.archetypes.push(empty);
    const { planet: bare } = P.createPlanet(c, { archetypeId: empty.id });
    const plain = P.newRival(c, bare, { enemy: 'Hired Muscle|war-bots' });
    assert.equal(plain.name, 'War Bots');
    assert.equal(plain.entryId, null);
  });

  test('a random Rival takes an enemy from its entry, preferring enabled models', (assert) => {
    const c = campaign();
    const a = A.emptyArchetype('Gangland');
    a.rivals = [{ id: 'e1', name: 'The Syndicate', forces: ['Criminal Elements|gangers', 'Criminal Elements|punks'], uniques: [] }];
    c.archetypes.push(a);
    c.models.disabled['Criminal Elements'] = ['gangers'];
    const { planet } = P.createPlanet(c, { archetypeId: a.id });
    for (let i = 0; i < 30; i++) {
      const r = P.newRival(c, planet);
      assert.equal(r.enemy, 'Criminal Elements|punks');
      assert.ok(r.name.startsWith('The Syndicate'));
    }
  });

  test('a Vengeful Patron becomes a Rival with their own forces', (assert) => {
    const c = campaign();
    const { planet } = P.createPlanet(c, {});
    const patron = P.newPatron(c, planet);
    patron.forces = ['Hired Muscle|black-ops-team'];
    const rival = P.patronToRival(c, planet, patron.id);
    assert.equal(rival.enemy, 'Hired Muscle|black-ops-team');
    assert.equal(rival.name, patron.name);
    assert.equal(planet.patrons.length, 0);
  });

  test('moving contacts keeps names unique on the new planet', (assert) => {
    const c = campaign();
    const { planet: a } = P.createPlanet(c, {});
    const { planet: b } = P.createPlanet(c, {});
    const ra = P.newRival(c, a, { enemy: 'Criminal Elements|pirates' });
    P.newRival(c, b, { enemy: 'Criminal Elements|pirates' });
    P.moveContacts(a, b, [ra.id], []);
    assert.equal(a.rivals.length, 0);
    assert.deepEqual(b.rivals.map((r) => r.name).sort(), ['Pirates', 'Pirates (2)']);
  });

  test('Galactic War results move an invasion along', (assert) => {
    const ids = LP.data.tables['Galactic War Progress Table'].rows.map((r) => r.id);
    assert.deepEqual(ids, ['lost-to-unity', 'contested', 'making-ground', 'unity-victorious']);
    const c = campaign();
    const { planet } = P.createPlanet(c, {});
    P.startInvasion(planet, 'Roving Threats|swarm-brood');
    P.applyWarResult(planet, 'making-ground');
    P.applyWarResult(planet, 'making-ground');
    assert.equal(planet.invasion.makingGround, 2);
    assert.equal(P.invadedPlanets(c).length, 1);
    assert.equal(P.invadedPlanets(c, planet.id).length, 0);
    P.applyWarResult(planet, 'lost-to-unity');
    assert.equal(planet.invasion.status, 'lost');
    assert.equal(P.canVisit(planet), false);
  });

  test('the remembered world becomes a planet with placeholder contacts', (assert) => {
    const c = campaign({ turnMemory: { worldTraits: ['gloom'], rivals: 2, patrons: 1, invadedNext: true } });
    const planet = P.fromMemory(c);
    assert.equal(P.current(c), planet);
    assert.deepEqual(planet.worldTraits, ['gloom']);
    assert.deepEqual(planet.rivals.map((r) => r.name), ['Rival 1', 'Rival 2']);
    assert.equal(planet.patrons.length, 1);
    assert.equal(planet.invasion.status, 'invaded');
  });

  test('planets survive JSON and repair missing archetypes', (assert) => {
    const c = campaign();
    const { planet } = P.createPlanet(c, {});
    P.setCurrent(c, planet.id);
    const copy = JSON.parse(JSON.stringify(c));
    copy.planets[0].archetypeId = 'gone';
    copy.currentPlanetId = 'also-gone';
    P.ensure(copy);
    assert.equal(copy.planets[0].archetypeId, copy.archetypes[0].id);
    assert.equal(copy.currentPlanetId, null);
  });
})(window.LP);
