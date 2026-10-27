(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const P = LP.planets;
  const R = LP.roster;
  const E = LP.events;
  const C = LP.conditions;
  const T = LP.turn;

  function low() { rng.setSource(() => 0); }
  function high() { rng.setSource(() => 0.999); }

  function campaign(turn) {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 },
      characters: [], crew: {}, turnMemory: {}, turn: null,
      models: { disabled: {}, invasion: {} }, conditions: []
    };
    P.ensure(c);
    LP.crew.ensure(c);
    R.ensure(c);
    c.turnNumber = turn || 3;
    return c;
  }

  function profile(o) {
    return Object.assign({ reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 0, luck: 0 }, o);
  }

  /** Ava (Human, Savvy 2), Bren (K'Erin, Savvy 1), Cole (Engineer, Savvy 3, in Sick Bay) on a planet. */
  function withCrew(c) {
    R.addMember(c, { id: 'ava', name: 'Ava', speciesId: 'baseline-human', profile: profile({ savvy: 2 }) });
    R.addMember(c, { id: 'bren', name: 'Bren', speciesId: 'kerin', profile: profile({ savvy: 1 }) });
    R.addMember(c, { id: 'cole', name: 'Cole', speciesId: 'engineer', profile: profile({ savvy: 3 }), status: 'sick-bay', sickBayTurns: 2 });
    c.roster.ship = { name: 'Wanderer', rowId: null, type: '', hull: 6, hullMax: 8, debt: 0, traits: [] };
    c.roster.resources.credits = 10;
    const { planet } = P.createPlanet(c, {});
    planet.worldTraits = [];
    P.setCurrent(c, planet.id);
    return c;
  }

  function add(c, type, settings) {
    const vars = { ava: { ref: 'member', id: 'ava' }, bren: { ref: 'member', id: 'bren' } };
    const state = E.run.start(c, [Object.assign({ effect: 'condition.add', type: type }, settings)], { packs: [], disabled: [], vars: vars });
    E.ledger.commit(c, state.ops);
    return c.conditions[c.conditions.length - 1];
  }

  /** A stage's context with facts we choose, as if earlier stages had set them. */
  function ctxFor(c, facts, memory) {
    const ctx = T.context(c, []);
    ctx.facts = Object.assign({}, facts);
    Object.assign(ctx.memory, memory);
    return ctx;
  }

  const stage = (id) => T.getStage(id);
  const keyOf = (inst, key) => C.answerKey(inst, key);

  function defaults(def, ctx, overrides) {
    const values = {};
    for (const f of def.fields(ctx).filter(Boolean)) if (f.type !== 'info') values[f.key] = f.value;
    return Object.assign(values, overrides);
  }

  /* ---------------------------------------------------------------------- */
  group('Conditions in the stages');

  test('a travel block stops the ship; staying is fine, and Stay hooks run', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'lockdown', { from: 'now' });
    add(c, 'overstay');
    const ctx = ctxFor(c, {});
    const def = stage('travel');
    assert.ok(/No ships may leave/.test(def.validate({ mode: 'ship' }, ctx)));
    assert.equal(def.validate({ mode: 'stay' }, ctx), null);
    assert.ok(def.fields(ctx).filter(Boolean).some((f) => f.type === 'info' && /No ships/.test(f.text)));
    const stay = def.resolve({ mode: 'stay' }, ctx);
    assert.deepEqual(stay.output.ops.map((o) => o.effect), ['rival.add']);
    assert.ok(def.ledger);
  });

  test('fleeing an invasion ignores travel blocks', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'lockdown', { from: 'now' });
    const ctx = ctxFor(c, { fled: true, invaded: true });
    assert.equal(stage('travel').validate({ mode: 'ship' }, ctx), null);
    assert.ok(!stage('travel').fields(ctx).filter(Boolean).some((f) => /No ships/.test(f.text || '')));
  });

  test('paying to take off early shows in the travel result, and leaving ends what is tied to the world', (assert) => {
    const c = withCrew(campaign(3));
    const g = add(c, 'grounded', { from: 'now', turns: 1 });
    add(c, 'war-rumors');
    const ctx = ctxFor(c, {});
    const def = stage('travel');
    assert.ok(def.fields(ctx).filter(Boolean).find((f) => f.key === 'bypass:' + g.id), 'a Yes/No for the early take-off');
    assert.ok(def.validate({ mode: 'ship' }, ctx));
    high();
    const input = { mode: 'ship', ['bypass:' + g.id]: true };
    assert.equal(def.validate(input, ctx), null);
    const kinds = def.resolve(input, ctx).output.ops.map((o) => o.effect);
    assert.ok(kinds.includes('hull'));
    assert.equal(kinds.filter((k) => k === 'condition.remove').length, 2, 'the grounding, and the rumors of war');
  });

  test('a fuel cell makes travel free when the player says to use it, and is used up', (assert) => {
    const c = withCrew(campaign(3));
    const cell = add(c, 'fuel-cell');
    const ctx = ctxFor(c, {});
    const def = stage('travel');
    assert.ok(def.fields(ctx).filter(Boolean).some((f) => f.key === keyOf(cell, 'use')));
    const off = def.resolve({ mode: 'ship', destination: 'new' }, ctx);
    assert.equal(off.output.data.cost, 5);
    const on = def.resolve({ mode: 'ship', destination: 'new', [keyOf(cell, 'use')]: true }, ctx);
    assert.equal(on.output.data.cost, 0);
    assert.deepEqual(on.output.ops.map((o) => [o.effect, o.id]), [['condition.remove', cell.id]]);
  });

  test('Upkeep leaves out crew who are away, and Basic supplies skip the cost once', (assert) => {
    const c = withCrew(campaign(3));
    R.addMember(c, { id: 'dax', name: 'Dax', speciesId: 'baseline-human', profile: profile() });
    add(c, 'away', { target: '$ava', from: 'now' });
    const supplies = add(c, 'supplies');
    const ctx = ctxFor(c, {});
    const def = stage('upkeep');
    assert.ok(def.fields(ctx).some((f) => f.key === keyOf(supplies, 'use')));
    const values = defaults(def, ctx, {});
    const plain = def.resolve(values, ctx);
    const counted = plain.output.lines[0].items.find((i) => i[0] === 'Counted crew')[1];
    assert.ok(/1 away/.test(counted), counted);
    assert.equal(plain.output.ops.length, 0);
    const used = def.resolve(Object.assign({}, values, { [keyOf(supplies, 'use')]: true }), ctx);
    assert.equal(used.output.lines[0].items[0][1], '0 credits (Basic supplies)');
    assert.deepEqual(used.output.ops.map((o) => o.id), [supplies.id]);
    assert.equal(def.facts(values, plain.output, ctx).available, 2, 'Bren and Dax are free; Ava is away and Cole is in Sick Bay');
  });

  test('crew tasks: held-back crew can’t be assigned; Insider information guarantees a Patron', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'refuses-tasks', { target: '$ava', from: 'now' });
    const insider = add(c, 'insider-info');
    const ctx = ctxFor(c, {});
    const def = stage('crew-tasks');
    const fields = def.fields(ctx).filter(Boolean);
    const assign = fields.find((f) => f.key === 'assign');
    assert.deepEqual(assign.members.map((m) => m.value), ['bren'], 'Ava is held back, Cole is in Sick Bay');
    assert.ok(fields.some((f) => /Ava can’t take tasks/.test(f.text || '')));
    low();
    const result = def.resolve({ assign: { bren: 'patron' } }, ctx);
    assert.ok(JSON.stringify(result.output.fu.lines).indexOf('Insider information') >= 0, 'the floor shows on the roll');
    assert.equal(result.output.fu.gains.patronOffers, 1);
    assert.deepEqual(result.output.ops.map((o) => o.id), [insider.id]);
  });

  test('a Useful contact adds its bonus to the roll it names, and Patron offers become job offers', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'roll-bonus', { params: { roll: 'patron' }, from: 'now' });
    add(c, 'patron-offer');
    const ctx = ctxFor(c, { patronOffers: 0 });
    const result = stage('crew-tasks').resolve({ assign: { ava: 'patron' } }, ctx);
    assert.ok(JSON.stringify(result.output.fu.lines).indexOf('Useful contact') >= 0);
    assert.equal(result.output.ops.length, 1);
    const offers = stage('job-offers').fields(ctx).find((f) => f.key === 'offers');
    assert.equal(offers.value, 1);
    const jobs = stage('job-offers').resolve({ offers: 1, known: '' }, ctx);
    assert.equal(jobs.output.ops.filter((o) => o.effect === 'condition.remove').length, 1);
  });

  test('choosing a battle: a tip allows a Rival fight; a forced Rival takes the choice away', (assert) => {
    const c = withCrew(campaign(3));
    const planet = P.current(c);
    const rival = P.newRival(c, planet);
    P.newRival(c, planet);
    add(c, 'tip');
    const def = stage('choose-battle');
    high();
    const tipped = def.resolve({ privateTransport: false, patronJob: false }, ctxFor(c, {}));
    assert.ok(tipped.pending.options.some((o) => o.value === 'rival:' + rival.id), 'the Rival fight is an option');
    assert.deepEqual(tipped.output.ops.map((o) => o.effect), ['condition.remove'], 'the tip is used up');
    const forced = add(c, 'forced-rival', { params: { rivalId: rival.id } });
    const result = def.resolve({ privateTransport: false, patronJob: false }, ctxFor(c, {}));
    assert.equal(result.pending, undefined);
    assert.equal(result.output.data.battle, 'rival');
    assert.equal(result.output.data.rivalId, rival.id);
    assert.ok(result.output.ops.some((o) => o.id === forced.id));
  });

  test('Battle result: crew who can’t fight aren’t pre-selected and can’t be entered', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'refuses-battle', { target: '$ava', from: 'now' });
    const ctx = ctxFor(c, {});
    const def = stage('battle-result');
    const field = def.fields(ctx).find((f) => f.key === 'participantIds');
    assert.deepEqual(field.value, ['bren']);
    const input = { type: 'opportunity', category: 'criminal-elements', heldField: true, won: true, participantIds: ['ava', 'bren'], casualtyIds: [] };
    assert.ok(/Ava can’t fight this turn/.test(def.validate(input, ctx)));
    assert.equal(def.validate(Object.assign({}, input, { type: 'invasion' }), ctx), null, 'except in an Invasion battle');
  });

  test('Battle result: asks which consumables were used and removes them on Apply', (assert) => {
    const c = withCrew(campaign(3));
    const def = stage('battle-result');
    assert.ok(!def.fields(ctxFor(c, {})).filter(Boolean).some((f) => f.key === 'consumedIds'), 'no question without consumables');
    const pills = R.addItem(c, { table: 'Consumables Subtable', rowId: 'booster-pills' });
    const serum = R.addItem(c, { table: 'Consumables Subtable', rowId: 'combat-serum' });
    const ctx = ctxFor(c, {});
    const field = def.fields(ctx).filter(Boolean).find((f) => f.key === 'consumedIds');
    assert.deepEqual(field.options.map((o) => o.value), [pills.id, serum.id]);
    const input = { type: 'opportunity', category: 'criminal-elements', heldField: true, won: true, participantIds: ['bren'], casualtyIds: [], consumedIds: [serum.id] };
    const result = def.resolve(input, ctx);
    assert.deepEqual(result.output.ops.filter((o) => o.effect === 'item.remove').map((o) => o.target), [serum.id]);
    assert.ok(/Combat Serum/.test(JSON.stringify(result.output.lines)));
  });

  test('Battle result hooks: a small job pays on a Yes, and Promising lead pays for Opportunity missions', (assert) => {
    const c = withCrew(campaign(3));
    const job = add(c, 'small-job', { from: 'now' });
    add(c, 'promising-lead', { from: 'now' });
    const ctx = ctxFor(c, {});
    const def = stage('battle-result');
    assert.ok(def.fields(ctx).filter(Boolean).some((f) => f.key === keyOf(job, 'done')));
    const base = { type: 'opportunity', category: 'criminal-elements', heldField: true, won: true, participantIds: ['bren'], casualtyIds: [] };
    const yes = def.resolve(Object.assign({}, base, { [keyOf(job, 'done')]: true }), ctx);
    assert.deepEqual(yes.output.ops.filter((o) => o.effect === 'resource').map((o) => o.amount).sort(), [2, 3]);
    const no = def.resolve(base, ctx);
    assert.deepEqual(no.output.ops.filter((o) => o.effect === 'resource').map((o) => o.amount), [3]);
    const patron = def.resolve(Object.assign({}, base, { type: 'patron' }), ctx);
    assert.equal(patron.output.ops.filter((o) => o.effect === 'resource').length, 0);
  });

  test('Injuries: someone feeling great skips the roll, and it is used up', (assert) => {
    const c = withCrew(campaign(3));
    const great = add(c, 'injury-ignore', { target: '$ava', from: 'now' });
    const post = { type: 'opportunity', casualties: 2, botCasualties: 0, casualtyIds: ['ava', 'bren'], participantIds: ['ava', 'bren'] };
    const result = stage('injuries').resolve({}, ctxFor(c, { post: post }));
    assert.ok(/Feeling great/.test(JSON.stringify(result.output.fu.lines)));
    assert.deepEqual(result.output.ops.map((o) => o.id), [great.id]);
  });

  test('Experience: no XP while a condition says so', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'no-xp', { target: '$ava', from: 'now' });
    const post = { type: 'opportunity', won: true, firstBlood: false, uniqueKilled: false, participantIds: ['ava', 'bren'], casualtyIds: [] };
    const result = stage('experience').resolve({}, ctxFor(c, { post: post }));
    const rows = result.output.data.xp;
    assert.equal(rows[0][0], 'Ava');
    assert.equal(rows[0][1], 'No XP (No XP)');
    assert.ok(/^\+3 XP/.test(rows[1][1]));
  });

  test('Invasion check: war rumors add to the roll, and a patrol nearby rules it out', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'war-rumors');
    const post = { type: 'opportunity', invasionThreat: true, heldField: false, category: 'criminal-elements', enemy: null };
    const def = stage('invasion-check');
    assert.deepEqual(def.fields(ctxFor(c, { post: post })), [], 'no manual question when the condition is there');
    const roll = def.resolve({}, ctxFor(c, { post: post })).output.lines[0];
    assert.ok(roll.modifiers.some((m) => m.label === 'Rumors of war' && m.value === 2));
    add(c, 'no-invasion-next');
    assert.ok(/can’t be Invaded/.test(def.applies(ctxFor(c, { post: post }))));
  });

  test('Character events skip anyone an event can’t touch', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'away', { target: '$ava', from: 'now' });
    const note = stage('character-event').fields(ctxFor(c, {}))[0].text;
    assert.ok(/Bren/.test(note) && !/Ava/.test(note), note);
  });

  test('arrival: conditions that act on arrival run with the new world as current, and arrivals count down Local maps', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'package', { target: '$ava' });
    add(c, 'local-maps');
    const dest = P.createPlanet(c, { name: 'Elsewhere' }).planet;
    const ctx = ctxFor(c, { traveling: true, destination: dest.id });
    high();
    const kinds = stage('new-world').resolve({ wildGalaxy: false }, ctx).output.ops.map((o) => o.effect);
    assert.ok(kinds.includes('resource'), 'package pays');
    assert.ok(kinds.includes('condition.tick'), 'Local maps counts an arrival');
    low();
    const trouble = stage('new-world').resolve({ wildGalaxy: false }, ctx);
    const rival = trouble.output.ops.find((o) => o.effect === 'rival.add');
    assert.equal(rival.planetId, dest.id, 'the Rival is on the world they arrived at');
  });

  test('arrival: worlds looked up in the library are the only choice, and are used up', (assert) => {
    const c = withCrew(campaign(3));
    const worlds = [P.createPlanet(c, { name: 'Uno' }).planet, P.createPlanet(c, { name: 'Dos' }).planet];
    const inst = add(c, 'destinations', { params: { planetIds: worlds.map((w) => w.id) } });
    const ctx = ctxFor(c, { traveling: true, destination: 'new' });
    const field = stage('new-world').fields(ctx).find((f) => f.key === 'pickDestination');
    assert.deepEqual(field.options.map((o) => o.value), worlds.map((w) => w.id));
    const result = stage('new-world').resolve({ pickDestination: worlds[1].id }, ctx);
    assert.equal(result.output.data.destinationId, worlds[1].id);
    assert.ok(!result.output.data.newPlanet, 'no new world is made');
    assert.ok(result.output.ops.some((o) => o.effect === 'condition.remove' && o.id === inst.id));
  });

  test('the turn waits for Apply when a stage planned changes, and Undo takes them back', (assert) => {
    const c = withCrew(campaign(3));
    c.turnMemory.hasPlayed = true;
    add(c, 'overstay');
    assert.equal(T.walk(c).current.id, 'conditions', 'Step 0 comes first');
    assert.deepEqual(T.confirm(c, {}), { ok: true });
    assert.deepEqual(T.confirm(c, { firstTurn: false, invaded: false, worldTraits: [] }), { ok: true });
    assert.equal(T.walk(c).current.id, 'travel');
    T.confirm(c, { mode: 'stay' });
    assert.equal(T.walk(c).current, null, 'waiting to be applied');
    const rivals = P.current(c).rivals.length;
    assert.deepEqual(T.applyLedger(c), { ok: true });
    assert.equal(P.current(c).rivals.length, rivals + 1);
    assert.equal(T.walk(c).current.id, 'upkeep');
    T.undo(c);
    assert.equal(P.current(c).rivals.length, rivals, 'the first Undo takes back what Apply did');
    T.undo(c);
    assert.equal(T.walk(c).current.id, 'travel');
  });

  test('removing a crew member by hand clears their conditions', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'refuses-tasks', { target: '$ava' });
    add(c, 'cosmic-seen');
    R.removeMember(c, 'ava');
    assert.deepEqual(c.conditions.map((i) => i.type), ['cosmic-seen']);
  });

  test('a condition added during the turn does not send the turn back to Step 0', (assert) => {
    const c = withCrew(campaign(3));
    c.turnMemory.hasPlayed = true;
    assert.equal(T.walk(c).current.id, 'start');
    T.confirm(c, { firstTurn: false, invaded: false, worldTraits: [] });
    add(c, 'overstay');
    assert.equal(T.walk(c).current.id, 'travel');
    const conditions = T.walk(c).items.find((i) => i.def.id === 'conditions');
    assert.equal(conditions.status, 'skipped');
  });

  test('adding and ending conditions by type respects what the type says', (assert) => {
    const c = withCrew(campaign(3));
    E.ledger.commit(c, C.addOps(c, 'on-quest'));
    E.ledger.commit(c, C.addOps(c, 'on-quest'));
    assert.equal(c.conditions.length, 1, 'a Quest is only begun once');
    E.ledger.commit(c, C.removeOps(c, 'on-quest'));
    assert.equal(c.conditions.length, 0);
    assert.deepEqual(C.removeOps(c, 'on-quest'), []);
  });

  test('the Quest: new Quests begin as a condition; a won finale ends it, and Choose battle offers it', (assert) => {
    const c = withCrew(campaign(3));
    const rumors = stage('rumors');
    assert.deepEqual(rumors.fields(ctxFor(c, {})).map((f) => f.key), ['rumors']);
    low();
    const quest = rumors.resolve({ rumors: 3 }, ctxFor(c, {}, { rumors: 3 }));
    assert.equal(quest.output.headline, 'New Quest!');
    assert.deepEqual(quest.output.ops.map((o) => (o.condition ? o.condition.type : o.effect + ':' + o.key + ':' + o.amount)), ['on-quest', 'resource:rumors:-3'], 'the Rumors are used up');
    assert.ok(rumors.ledger);
    E.ledger.commit(c, quest.output.ops);
    assert.deepEqual(rumors.fields(ctxFor(c, {})).map((f) => f.key), ['note'], 'no question once on a Quest');
    assert.equal(rumors.resolve({}, ctxFor(c, {})).output.headline, 'On a Quest');
    assert.equal(rumors.facts({}, quest.output, ctxFor(c, {})).onQuest, true);
    const post = { type: 'quest-finale', won: true, questRumors: 0 };
    const won = stage('quest-progress').resolve({}, ctxFor(c, { post: post }));
    assert.deepEqual(won.output.ops.map((o) => o.effect), ['condition.remove']);
    const lost = stage('quest-progress').resolve({}, ctxFor(c, { post: Object.assign({}, post, { won: false }) }));
    assert.deepEqual(lost.output.ops, []);
    assert.ok(stage('quest-progress').ledger);
    high();
    const battle = stage('choose-battle').resolve({ privateTransport: false, patronJob: false }, ctxFor(c, {}));
    assert.ok(battle.pending.options.some((o) => o.value === 'quest'));
  });
})(window.LP);
