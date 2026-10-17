(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const T = LP.turn;
  const P = LP.planets;
  const A = LP.archetypes;
  const B = LP.battle;

  function low() { rng.setSource(() => 0); }
  function high() { rng.setSource(() => 0.9999); }

  function campaign(memory) {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 },
      turnMemory: Object.assign({}, memory),
      turn: null,
      models: { disabled: {}, invasion: {} }
    };
    P.ensure(c);
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

  /** Planets are restored from snapshots on Undo, so always look them up again by id. */
  function fresh(c, planet) {
    return P.get(c, planet.id);
  }

  function settle(c, pick) {
    let guard = 0;
    while (current(c) === 'pending' && guard++ < 20) {
      const rec = last(c);
      const option = pick ? rec.pending.options.find(pick) || rec.pending.options[0] : rec.pending.options[0];
      T.choose(c, option.value);
    }
  }

  /** Confirm with the stage's defaults plus overrides (hidden fields dropped). */
  function confirm(c, overrides) {
    const values = {};
    const fields = T.currentFields(c);
    for (const f of fields) if (f.type !== 'info') values[f.key] = f.value;
    Object.assign(values, overrides || {});
    for (const f of fields) if (f.showIf && !f.showIf(values)) delete values[f.key];
    const r = T.confirm(c, values);
    if (r.error) throw new Error(current(c) + ': ' + r.error);
    settle(c);
  }

  /** A campaign already on a planet, at the start of a new turn. */
  function onPlanet(setup) {
    const c = campaign({ hasPlayed: true });
    const { planet } = P.createPlanet(c, { name: 'Home' });
    planet.worldTraits = [];
    P.setCurrent(c, planet.id);
    if (setup) setup(c, planet);
    return { c, planet };
  }

  /** Stay on the planet and run the World steps up to Battle result. */
  function toBattleResult(c, battleChoice) {
    confirm(c);                              // start
    confirm(c, { mode: 'stay' });            // travel
    confirm(c);                              // upkeep
    confirm(c, { tasks: {} });               // crew tasks
    confirm(c, { offers: 0 });               // job offers
    confirm(c);                              // equipment
    confirm(c, { onQuest: false, rumors: 0 });
    T.confirm(c, { privateTransport: false, patronJob: false });
    settle(c, battleChoice);
  }

  /* ---------------------------------------------------------------------- */
  group('Planets in the turn: travel');

  test('first turn creates the starting planet from an archetype', (assert) => {
    rng.setSource(rng.seeded(1));
    const c = campaign();
    confirm(c, { firstTurn: true, startArchetype: c.archetypes[0].id, startName: 'Homeworld', generateWorld: true });
    assert.equal(current(c), 'new-world');
    confirm(c, { wildGalaxy: false });
    const planet = P.current(c);
    assert.equal(planet.name, 'Homeworld');
    assert.equal(planet.archetypeId, c.archetypes[0].id);
    assert.equal(planet.worldTraits.length, 1);
    assert.deepEqual(facts(c).worldTraits, planet.worldTraits);
  });

  test('first turn without New World Arrival creates a traitless planet at Start', (assert) => {
    const c = campaign();
    confirm(c, { firstTurn: true, startName: 'Quietus', generateWorld: false });
    assert.equal(P.current(c).name, 'Quietus');
    assert.deepEqual(P.current(c).worldTraits, []);
    assert.equal(current(c), 'upkeep');
  });

  test('Undo and Restart put the planets back', (assert) => {
    rng.setSource(rng.seeded(2));
    const c = campaign();
    confirm(c, { firstTurn: true, startName: 'Homeworld', generateWorld: true });
    confirm(c, { wildGalaxy: false });
    assert.equal(c.planets.length, 1);
    while (current(c) !== 'new-world') T.undo(c);
    assert.equal(c.planets.length, 0, 'Undo removed the new planet');
    assert.equal(c.currentPlanetId, null);
    confirm(c, { wildGalaxy: false });
    T.restart(c);
    assert.equal(c.planets.length, 0, 'Restart too');
  });

  test('an older campaign saves its remembered world as a planet', (assert) => {
    const c = campaign({ hasPlayed: true, rivals: 2, patrons: 1, worldTraits: ['gloom'] });
    const fields = T.currentFields(c);
    assert.ok(fields.some((f) => f.key === 'worldName'));
    confirm(c, { firstTurn: false, worldName: 'Old Haunt', invaded: false, worldTraits: ['gloom'] });
    const planet = P.current(c);
    assert.equal(planet.name, 'Old Haunt');
    assert.deepEqual(planet.rivals.map((r) => r.name), ['Rival 1', 'Rival 2']);
    assert.equal(planet.patrons.length, 1);
    assert.equal(T.context(c, c.turn.records).memory.rivals, 2, 'counts now come from the planet');
  });

  test('travelling: named Rivals follow, Persistent Patrons come along', (assert) => {
    const { c, planet } = onPlanet((c, p) => {
      P.newRival(c, p, { enemy: 'Criminal Elements|pirates' });
      const a = P.newPatron(c, p);
      a.persistent = true;
      P.newPatron(c, p);
    });
    confirm(c);
    confirm(c, { mode: 'ship', destination: 'new', destName: 'Far Shore' });
    assert.equal(current(c), 'travel-event');
    confirm(c, { crewCount: 6 });
    high(); // the Rival follows (6), licence roll 6 -> forgery choice
    confirm(c, { wildGalaxy: false });
    settle(c, (o) => o.value === 'skip');
    const dest = P.current(c);
    assert.equal(dest.name, 'Far Shore');
    assert.deepEqual(dest.rivals.map((r) => r.name), ['Pirates']);
    assert.equal(dest.patrons.length, 1, 'the Persistent Patron moved');
    assert.equal(fresh(c, planet).patrons.length, 1, 'the other stayed behind');
    assert.equal(fresh(c, planet).rivals.length, 0);
  });

  test('returning to a saved planet skips the rolls', (assert) => {
    const { c, planet } = onPlanet();
    const { planet: old } = P.createPlanet(c, { name: 'Old Port' });
    P.newRival(c, old, { enemy: 'Hired Muscle|enforcers' });
    confirm(c);
    confirm(c, { mode: 'commercial', crewCount: 6, destination: old.id });
    confirm(c);
    assert.equal(c.currentPlanetId, old.id);
    assert.equal(last(c).output.headline, 'Returned to Old Port');
    assert.equal(fresh(c, old).rivals.length, 1);
    assert.ok(planet);
  });

  test('fleeing an invasion deletes the planet’s contacts', (assert) => {
    high();
    const { c, planet } = onPlanet((c, p) => {
      P.newRival(c, p);
      P.newPatron(c, p);
      P.startInvasion(p, 'Roving Threats|swarm-brood');
    });
    confirm(c);
    assert.equal(current(c), 'flee-invasion');
    confirm(c, { hasShip: true });
    assert.equal(fresh(c, planet).rivals.length + fresh(c, planet).patrons.length, 0);
    assert.equal(fresh(c, planet).invasion.status, 'invaded', 'still invaded, tracked for the Galactic War');
  });

  test('the departure planet’s archetype limits travel events', (assert) => {
    const { c, planet } = onPlanet();
    const quiet = A.emptyArchetype('Quiet lanes');
    quiet.events.travel = ['uneventful-trip'];
    c.archetypes.push(quiet);
    planet.archetypeId = quiet.id;
    confirm(c);
    confirm(c, { mode: 'ship', destination: 'new' });
    confirm(c, { crewCount: 6 });
    assert.equal(last(c).output.fu.lines[0].rowId, 'uneventful-trip');
  });

  /* ---------------------------------------------------------------------- */
  group('Planets in the turn: world and battle');

  test('Pick a fight creates a named Rival; recruits use archetype species', (assert) => {
    const { c, planet } = onPlanet((c, p) => {
      const a = A.copyArchetype(c.archetypes[0]);
      a.species = { swift: 1 };
      c.archetypes.push(a);
      p.archetypeId = a.id;
    });
    confirm(c);
    confirm(c, { mode: 'stay' });
    confirm(c, { crewCount: 4 });
    rng.setSource(() => 0.585); // D100 = 59: Pick a fight
    confirm(c, { tasks: { explore: 1, recruit: 1 } });
    assert.equal(fresh(c, planet).rivals.length, 1);
    const lines = JSON.stringify(last(c).output.fu.lines);
    assert.ok(/Swift \(Primary Alien\)/.test(lines), 'recruit rolled from the archetype weights');
  });

  test('job offers come from named Patrons, new and known', (assert) => {
    rng.setSource(rng.seeded(4));
    const { c, planet } = onPlanet((c, p) => P.newPatron(c, p));
    const known = planet.patrons[0];
    confirm(c);
    confirm(c, { mode: 'stay' });
    confirm(c);
    confirm(c, { tasks: {} });
    confirm(c, { offers: 2, known: known.id });
    assert.equal(fresh(c, planet).patrons.length, 3);
    assert.equal(facts(c).jobPatronIds.length, 3);
    assert.ok(last(c).output.headline.includes(known.name));
  });

  test('a Rival attack names the Rival, and the Battle tab locks their enemy', (assert) => {
    low(); // 1D6 = 1: found
    const { c, planet } = onPlanet((c, p) => {
      const r = P.newRival(c, p, { enemy: 'Hired Muscle|war-bots' });
      r.hates = true;
      r.uniques = ['enemy-boss'];
    });
    toBattleResult(c);
    const rival = fresh(c, planet).rivals[0];
    assert.equal(facts(c).battleType, 'rival-attack');
    assert.equal(facts(c).rivalId, rival.id);

    rng.setSource(rng.seeded(7));
    const ctx = { settings: c.settings, campaign: c };
    const b = B.newBattle(ctx, 'rival-attack');
    b.options.rivalId = rival.id;
    B.generate(b, ctx);
    assert.equal(b.slots.enemy.value, 'Hired Muscle|war-bots');
    assert.equal(b.slots.enemy.mode, 'forced');
    assert.equal(b.slots.category.value, 'hired-muscle');
    assert.ok(B.force(b, ctx).modifiers.some((m) => /hate you/.test(m.label)));
    B.setFixed(b, ctx, 'uniqueCheck', 12);
    assert.equal(b.slots.unique.value, 'enemy-boss', 'only their own Unique Individuals');
  });

  test('tracked Rivals appear by name when choosing the battle', (assert) => {
    high();
    const { c, planet } = onPlanet((c, p) => {
      P.newRival(c, p, { enemy: 'Criminal Elements|punks' });
      P.newRival(c, p, { enemy: 'Criminal Elements|pirates' });
    });
    confirm(c);
    confirm(c, { mode: 'stay' });
    confirm(c);
    confirm(c, { tasks: { track: 1 } });
    confirm(c, { offers: 0 });
    confirm(c);
    confirm(c, { onQuest: false, rumors: 0 });
    T.confirm(c, { privateTransport: false, patronJob: false });
    const options = last(c).pending.options.map((o) => o.label);
    assert.ok(options.includes('Attack Punks') && options.includes('Attack Pirates'), options.join(', '));
    const second = fresh(c, planet).rivals[1];
    T.choose(c, 'rival:' + second.id);
    assert.equal(facts(c).battleType, 'rival');
    assert.equal(facts(c).rivalId, second.id);
  });

  test('Invasion battles lock the enemy to the planet’s invader', (assert) => {
    const { c, planet } = onPlanet((c, p) => P.startInvasion(p, 'Roving Threats|abductor-raiders'));
    const ctx = { settings: c.settings, campaign: c };
    const b = B.newBattle(ctx, 'invasion');
    B.generate(b, ctx);
    assert.equal(b.slots.enemy.value, 'Roving Threats|abductor-raiders');
    assert.ok(planet);
  });

  /* ---------------------------------------------------------------------- */
  group('Planets in the turn: post-battle');

  test('a new Rival matches the enemy you fought; a chased-off Rival is removed', (assert) => {
    const { c, planet } = onPlanet();
    const ctx = { settings: c.settings, campaign: c };
    const b = B.newBattle(ctx, 'opportunity');
    B.generate(b, ctx);
    B.setFixed(b, ctx, 'category', 'criminal-elements');
    B.setFixed(b, ctx, 'enemy', 'Criminal Elements|gangers');
    c.battle = b;
    toBattleResult(c);
    confirm(c, { type: 'opportunity', category: 'hired-muscle', heldField: true, won: true });
    low(); // grudge roll 1: new Rival
    confirm(c);
    assert.deepEqual(fresh(c, planet).rivals.map((r) => r.enemy), ['Criminal Elements|gangers']);
    assert.equal(fresh(c, planet).rivals[0].name, 'Gangers');

    const second = onPlanet((c, p) => P.newRival(c, p, { enemy: 'Hired Muscle|enforcers' }));
    high(); // no Rival attack (6 > 1); chase-off roll 6
    toBattleResult(second.c);
    confirm(second.c, { type: 'rival', category: 'hired-muscle', heldField: true, rivalId: fresh(second.c, second.planet).rivals[0].id });
    confirm(second.c);
    assert.equal(fresh(second.c, second.planet).rivals.length, 0);
  });

  test('Patron status: One-time Contracts leave; Vengeful Patrons turn on you', (assert) => {
    rng.setSource(rng.seeded(5));
    const a = onPlanet((c, p) => P.newPatron(c, p));
    toBattleResult(a.c);
    confirm(a.c, { type: 'patron', category: 'roving-threats', heldField: false, won: true, patronId: fresh(a.c, a.planet).patrons[0].id });
    while (current(a.c) !== 'patron-status') confirm(a.c);
    confirm(a.c, { oneTime: true });
    assert.equal(fresh(a.c, a.planet).patrons.length, 0);

    const b = onPlanet((c, p) => P.newPatron(c, p));
    const patron = b.planet.patrons[0];
    toBattleResult(b.c);
    confirm(b.c, { type: 'patron', category: 'roving-threats', heldField: false, won: false, patronId: patron.id });
    while (current(b.c) !== 'patron-status') confirm(b.c);
    confirm(b.c, { vengeful: true });
    assert.equal(fresh(b.c, b.planet).patrons.length, 0);
    assert.equal(fresh(b.c, b.planet).rivals[0].name, patron.name);
  });

  test('an invasion is recorded on the planet with its enemy', (assert) => {
    const { c, planet } = onPlanet((c, p) => { p.worldTraits = ['imminent-invasion', 'military-outpost']; });
    const ctx = { settings: c.settings, campaign: c };
    const b = B.newBattle(ctx, 'opportunity');
    B.generate(b, ctx);
    B.setFixed(b, ctx, 'category', 'roving-threats');
    B.setFixed(b, ctx, 'enemy', 'Roving Threats|swarm-brood');
    c.battle = b;
    toBattleResult(c);
    confirm(c, { type: 'opportunity', category: 'roving-threats', heldField: false, won: false, invasionThreat: true });
    high();
    while (current(c) !== 'invasion-check') confirm(c);
    confirm(c, { warRumors: true });
    assert.equal(fresh(c, planet).invasion.status, 'invaded');
    assert.equal(fresh(c, planet).invasion.enemy, 'Roving Threats|swarm-brood');
  });

  test('Galactic War rolls for each other invaded planet with its own modifiers', (assert) => {
    const { c } = onPlanet((c) => {
      const { planet: x } = P.createPlanet(c, { name: 'Ashfall' });
      x.worldTraits = ['military-outpost'];
      P.startInvasion(x, 'Roving Threats|swarm-brood');
      x.invasion.makingGround = 1;
      const { planet: y } = P.createPlanet(c, { name: 'Brimstone' });
      P.startInvasion(y, null);
    });
    rng.setSource(rng.seeded(6));
    toBattleResult(c);
    confirm(c, { type: 'opportunity', category: 'roving-threats', heldField: false, won: false });
    while (current(c) !== 'galactic-war') confirm(c);
    high(); // 2D6 = 12: Unity Victorious
    confirm(c);
    const results = last(c).output.data.results;
    assert.equal(results.length, 2);
    const ash = P.get(c, results[0].planetId);
    assert.equal(ash.invasion.status, 'liberated');
    assert.equal(last(c).output.lines[0].modifier, 3, '+1 Making Ground +2 Military outpost');
    assert.equal(current(c), 'finished');
  });
})(window.LP);
