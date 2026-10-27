(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const P = LP.planets;
  const R = LP.roster;
  const E = LP.events;

  function low() { rng.setSource(() => 0); }
  function high() { rng.setSource(() => 0.999); }

  function campaign() {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 },
      characters: [], crew: {}, turnMemory: {}, turn: null,
      models: { disabled: {}, invasion: {} }, conditions: []
    };
    P.ensure(c);
    LP.crew.ensure(c);
    R.ensure(c);
    return c;
  }

  function profile(o) {
    return Object.assign({ reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 0, luck: 0 }, o);
  }

  /** Ava (Human, Savvy 2), Bren (K'Erin, Savvy 1), Cole (Engineer, Savvy 3, in Sick Bay). */
  function withCrew(c) {
    R.addMember(c, { id: 'ava', name: 'Ava', speciesId: 'baseline-human', profile: profile({ savvy: 2, combat: 1 }) });
    R.addMember(c, { id: 'bren', name: 'Bren', speciesId: 'kerin', profile: profile({ savvy: 1 }) });
    R.addMember(c, { id: 'cole', name: 'Cole', speciesId: 'engineer', profile: profile({ savvy: 3 }), status: 'sick-bay', sickBayTurns: 2 });
    c.roster.ship = { name: 'Wanderer', rowId: null, type: '', hull: 6, hullMax: 8, debt: 5, traits: [] };
    c.roster.resources.credits = 10;
    return c;
  }

  function withPlanet(c) {
    const { planet } = P.createPlanet(c, {});
    P.setCurrent(c, planet.id);
    return planet;
  }

  const member = (id) => ({ ref: 'member', id: id });

  function scopeOf(c, vars, extra) {
    return E.makeScope(c, Object.assign({ vars: vars || {} }, extra));
  }

  function makePack(events, fragments) {
    return {
      format: 'last-parsec-events', version: 1,
      pack: { id: 't', name: 'Test' },
      events: events || [], conditions: [], fragments: fragments || []
    };
  }

  function ev(id, table, steps, extra) {
    return Object.assign({ id: id, table: table, weight: 1, title: id, text: 'Rule text for ' + id, steps: steps }, extra);
  }

  function play(c, steps, options) {
    const env = Object.assign({ packs: [], disabled: [] }, options);
    const state = E.run.start(c, steps, env);
    return { state, env };
  }

  /* ---------------------------------------------------------------------- */
  group('Registry and conditions');

  test('a registry checks settings against their declared types', (assert) => {
    const r = LP.registry.create('thing');
    r.register({ id: 'pay', params: { amount: { type: 'dice', required: true }, key: { type: 'enum', options: ['a', 'b'] } } });
    assert.deepEqual(r.validate('pay', { amount: '1D6+1', key: 'a' }), []);
    assert.deepEqual(r.validate('pay', { amount: '$cost' }), [], 'variables are accepted');
    assert.equal(r.validate('pay', {}).length, 1, 'missing required');
    assert.equal(r.validate('pay', { amount: 'lots' }).length, 1, 'bad dice');
    assert.equal(r.validate('pay', { amount: 2, key: 'c' }).length, 1, 'bad enum');
    assert.equal(r.validate('pay', { amount: 2, extra: 1 }).length, 1, 'unknown setting');
    assert.equal(r.validate('nope', {}).length, 1, 'unknown id');
    assert.throws(() => r.register({ id: 'pay' }), 'duplicate id');
  });

  test('conditions: all, any, not, facts, variables', (assert) => {
    const c = withCrew(campaign());
    const scope = scopeOf(c, { actor: member('bren'), roll: { total: 4, natural: 4 } });
    const t = (tree) => LP.predicate.evaluate(tree, scope);
    assert.ok(t({ fact: 'crew.count', gte: 3 }));
    assert.ok(!t({ fact: 'crew.count', gt: 3 }));
    assert.ok(t({ fact: 'member.species', of: '$actor', eq: 'kerin' }));
    assert.ok(t({ fact: 'member.species', eq: 'kerin' }), 'defaults to $actor');
    assert.ok(t({ fact: 'resource', key: 'credits', gte: 10 }));
    assert.ok(t({ var: '$roll', lt: 5 }));
    assert.ok(t({ var: '$roll.natural', eq: 4 }));
    assert.ok(t({ all: [{ fact: 'crew.has', species: 'engineer' }, { not: { fact: 'crew.has', species: 'precursor' } }] }));
    assert.ok(t({ any: [{ fact: 'crew.count', eq: 99 }, { fact: 'ship.hullDamaged' }] }));
    assert.ok(t({ fact: 'member.species', of: '$actor', in: ['kerin', 'feral'] }));
  });

  test('questions to the player are listed, and must be answered before evaluating', (assert) => {
    const tree = { all: [{ ask: 'Was Ava hurt?' }, { not: { ask: 'On a Quest?' } }, { ask: 'Was Ava hurt?' }] };
    assert.deepEqual(LP.predicate.asks(tree), ['Was Ava hurt?', 'On a Quest?']);
    const scope = scopeOf(campaign(), {}, { answers: { 'Was Ava hurt?': true } });
    assert.throws(() => LP.predicate.evaluate(tree, scope));
    scope.answers['On a Quest?'] = false;
    assert.ok(LP.predicate.evaluate(tree, scope));
  });

  test('predicate validation names unknown facts and bad settings', (assert) => {
    assert.deepEqual(LP.predicate.validate({ fact: 'crew.count', gte: 2 }, E.facts), []);
    assert.equal(LP.predicate.validate({ fact: 'crew.nope' }, E.facts).length, 1);
    assert.equal(LP.predicate.validate({ fact: 'resource', key: 'gold' }, E.facts).length, 1);
    assert.equal(LP.predicate.validate({ foo: 1 }, E.facts).length, 1);
  });

  /* ---------------------------------------------------------------------- */
  group('Facts');

  test('member facts: caps, raised stats, Sick Bay, motivations', (assert) => {
    const c = withCrew(campaign());
    const ava = R.getMember(c, 'ava');
    const s = scopeOf(c, { a: member('ava'), b: member('bren'), k: member('cole') });
    assert.ok(s.fact('member.canGain', { stat: 'luck' }, '$a'), 'a Human can have more Luck');
    c.roster.members[1].profile.luck = 1;
    assert.ok(!s.fact('member.canGain', { stat: 'luck' }, '$b'), 'a K’Erin is capped at 1');
    assert.ok(s.fact('member.inSickBay', {}, '$k'));
    assert.ok(!s.fact('member.raised', { stat: 'savvy' }, '$a'));
    ava.profile.savvy += 1;
    assert.ok(s.fact('member.raised', { stat: 'savvy' }, '$a'));
    ava.origins = [{ label: 'Motivation', value: 'Romance', table: 'Motivation Table', row: 'romance' }];
    assert.deepEqual(s.fact('member.motivations', {}, '$a'), ['romance']);
    ava.origins = [{ label: 'Motivation', value: 'Wealth' }];
    assert.deepEqual(s.fact('member.motivations', {}, '$a'), ['wealth'], 'found by name when the row id is missing');
  });

  test('ship, Stash and planet facts', (assert) => {
    const c = withCrew(campaign());
    const planet = withPlanet(c);
    const s = scopeOf(c);
    assert.ok(s.fact('ship.hullDamaged'));
    assert.equal(s.fact('ship.debt'), 5);
    assert.equal(s.fact('stash.count'), 0);
    R.addItem(c, { table: 'Gear Table', rowId: null, name: 'Thing', damaged: true });
    assert.equal(s.fact('stash.count'), 1);
    assert.equal(s.fact('items.damaged'), 1);
    P.newRival(c, planet);
    assert.equal(s.fact('planet.rivals'), 1);
    assert.equal(s.fact('crew.inSickBay'), 1);
  });

  test('turn facts come from what the stage passes in', (assert) => {
    const s = scopeOf(campaign(), {}, { turn: { casualtyIds: ['ava'], mission: 'opportunity' } });
    assert.deepEqual(s.fact('turn.casualtyIds'), ['ava']);
    assert.equal(s.fact('turn.mission'), 'opportunity');
  });

  /* ---------------------------------------------------------------------- */
  group('Selectors');

  test('crew picks are random, filtered, distinct and can exclude earlier picks', (assert) => {
    const c = withCrew(campaign());
    const s = scopeOf(c, {});
    for (let i = 0; i < 20; i++) {
      const one = E.select({ from: 'crew', where: { not: { fact: 'member.inSickBay' } } }, s).refs;
      assert.equal(one.length, 1);
      assert.ok(one[0].id !== 'cole', 'not the one in Sick Bay');
    }
    const two = E.select({ from: 'crew', count: 2 }, s).refs;
    assert.equal(new Set(two.map((r) => r.id)).size, 2);
    s.vars.a = member('ava');
    for (let i = 0; i < 20; i++) assert.ok(E.select({ from: 'crew', exclude: ['$a'] }, s).refs[0].id !== 'ava');
    assert.equal(E.select({ from: 'crew', where: { fact: 'member.species', eq: 'nobody' } }, s).refs.length, 0);
  });

  test('prefer wins when someone matches, and is ignored when nobody does', (assert) => {
    const c = withCrew(campaign());
    const s = scopeOf(c, {});
    for (let i = 0; i < 20; i++) assert.equal(E.select({ from: 'crew', prefer: { fact: 'member.species', eq: 'kerin' } }, s).refs[0].id, 'bren');
    assert.equal(E.select({ from: 'crew', prefer: { fact: 'member.species', eq: 'swift' }, count: 3 }, s).refs.length, 3);
  });

  test('best takes the highest stat among those left after the filter', (assert) => {
    const c = withCrew(campaign());
    const s = scopeOf(c, {});
    const awake = { not: { fact: 'member.inSickBay' } };
    assert.equal(E.select({ from: 'crew', best: 'savvy', where: awake }, s).refs[0].id, 'ava');
    assert.deepEqual(E.select({ from: 'crew', best: 'savvy', count: 2 }, s).refs.map((r) => r.id), ['cole', 'ava']);
  });

  test('offer draws N candidates; items can be limited to a carrier or the Stash', (assert) => {
    const c = withCrew(campaign());
    R.addItem(c, { name: 'Blade', carrierId: 'ava' });
    R.addItem(c, { name: 'Pistol', carrierId: 'ava' });
    R.addItem(c, { name: 'Rope' });
    const s = scopeOf(c, { who: member('ava') });
    const offer = E.select({ from: 'items', carrier: '$who', offer: 2 }, s);
    assert.equal(offer.refs.length, 2);
    assert.ok(offer.offer);
    const stash = E.select({ from: 'items', carrier: 'stash', count: 3 }, s).refs;
    assert.equal(stash.length, 1);
    assert.equal(E.select({ from: 'items' }, s).refs.length, 1);
    assert.equal(E.select({ from: 'items', count: 3 }, s).refs.length, 3);
  });

  test('rivals and patrons come from the current planet; disabled ones only on request', (assert) => {
    const c = withCrew(campaign());
    const planet = withPlanet(c);
    const a = P.newRival(c, planet);
    const b = P.newRival(c, planet);
    P.disableRival(planet, b.id, { turn: 1, reason: 'test' });
    const s = scopeOf(c);
    assert.deepEqual(E.select({ from: 'rivals' }, s).refs.map((r) => r.id), [a.id]);
    assert.deepEqual(E.select({ from: 'rivals', disabled: true }, s).refs.map((r) => r.id), [b.id]);
    assert.equal(E.select({ from: 'patrons' }, s).refs.length, 0);
  });

  test('selector validation', (assert) => {
    assert.deepEqual(E.validateSelector({ from: 'crew', best: 'savvy', count: 2 }), []);
    assert.equal(E.validateSelector({ from: 'moons' }).length, 1);
    assert.equal(E.validateSelector({ from: 'items', best: 'savvy' }).length, 1);
    assert.equal(E.validateSelector({ from: 'crew', offer: 1 }).length, 1);
  });

  /* ---------------------------------------------------------------------- */
  group('Effects and the ledger');

  function plan(c, effect, settings, vars) {
    const { state } = play(c, [Object.assign({ effect: effect }, settings)], { vars: vars || {} });
    return state;
  }

  test('resources change by whole numbers and never go below 0', (assert) => {
    const c = withCrew(campaign());
    const state = plan(c, 'resource', { key: 'credits', amount: -15 });
    assert.equal(state.ops.length, 1);
    assert.deepEqual(E.ledger.preview(c, state.ops).map((l) => l.text), ['Credits 10 → 0 (−10, all they had)']);
    assert.equal(c.roster.resources.credits, 10, 'preview changes nothing');
    E.ledger.commit(c, state.ops);
    assert.equal(c.roster.resources.credits, 0);
  });

  test('dice amounts are rolled while planning, with a roll line', (assert) => {
    const c = withCrew(campaign());
    high();
    const state = plan(c, 'resource', { key: 'storyPoints', amount: '1D6+1' });
    assert.equal(state.ops[0].amount, 7);
    assert.equal(state.lines[0].type, 'roll');
    assert.equal(state.lines[0].total, 7);
  });

  test('xp and stat changes, with the species cap', (assert) => {
    const c = withCrew(campaign());
    c.roster.members[1].profile.luck = 1;
    const vars = { a: member('ava'), b: member('bren') };
    const state = play(c, [
      { effect: 'xp', target: '$a', amount: 2 },
      { effect: 'stat', target: '$a', stat: 'luck', amount: 1 },
      { effect: 'stat', target: '$b', stat: 'luck', amount: 1 }
    ], { vars }).state;
    assert.deepEqual(state.ops.map((o) => o.effect), ['xp', 'stat'], 'the K’Erin is at the Luck cap, so no op');
    assert.ok(state.lines.some((l) => /can’t gain any more luck/.test(l.text)));
    E.ledger.commit(c, state.ops);
    assert.equal(R.getMember(c, 'ava').xp, 2);
    assert.equal(R.getMember(c, 'ava').profile.luck, 1);
  });

  test('Sick Bay: adding turns, shortening and recovering', (assert) => {
    const c = withCrew(campaign());
    const vars = { a: member('ava'), k: member('cole') };
    const state = play(c, [
      { effect: 'sickBay', target: '$a', turns: 2 },
      { effect: 'sickBay', target: '$k', turns: -1 },
      { effect: 'sickBay', target: '$k', turns: -5 }
    ], { vars }).state;
    E.ledger.commit(c, state.ops);
    assert.equal(R.getMember(c, 'ava').status, 'sick-bay');
    assert.equal(R.getMember(c, 'ava').sickBayTurns, 2);
    assert.equal(R.getMember(c, 'cole').status, 'active');
    assert.equal(R.getMember(c, 'cole').sickBayTurns, 0);
  });

  test('hull and debt stay in range; with no ship they are skipped with a note', (assert) => {
    const c = withCrew(campaign());
    const state = play(c, [{ effect: 'hull', amount: -9 }, { effect: 'debt', amount: -9 }]).state;
    E.ledger.commit(c, state.ops);
    assert.equal(c.roster.ship.hull, 0);
    assert.equal(c.roster.ship.debt, 0);
    const bare = campaign();
    const none = play(bare, [{ effect: 'hull', amount: -1 }]).state;
    assert.equal(none.ops.length, 0);
    assert.equal(none.lines.length, 1);
  });

  test('items: add to the Stash or a member, damage, repair, remove', (assert) => {
    const c = withCrew(campaign());
    const vars = { a: member('ava') };
    const state = play(c, [
      { effect: 'item.add', table: 'Low-tech Weapon Table', row: 'handgun', damaged: true },
      { effect: 'item.add', table: 'Low-tech Weapon Table', row: 'blade', to: '$a' }
    ], { vars }).state;
    E.ledger.commit(c, state.ops);
    const items = c.roster.items;
    assert.equal(items.length, 2);
    assert.ok(items[0].damaged);
    assert.equal(items[0].carrierId, null);
    assert.equal(items[1].carrierId, 'ava');
    E.ledger.commit(c, state.ops);
    assert.equal(c.roster.items.length, 2, 'applying twice does not add twice');
    const fix = play(c, [{ effect: 'item.repair', target: '$i' }, { effect: 'item.remove', target: '$j' }], { vars: { i: { ref: 'item', id: items[0].id }, j: { ref: 'item', id: items[1].id } } }).state;
    E.ledger.commit(c, fix.ops);
    assert.equal(c.roster.items.length, 1);
    assert.ok(!c.roster.items[0].damaged);
  });

  test('Rivals and Patrons: add, set aside, bring back', (assert) => {
    const c = withCrew(campaign());
    const planet = withPlanet(c);
    const state = play(c, [{ effect: 'rival.add', bindTo: '$a' }, { effect: 'patron.add' }], { vars: { a: member('ava') } }).state;
    assert.equal(planet.rivals.length, 0, 'nothing happens before Apply');
    E.ledger.commit(c, state.ops);
    assert.equal(planet.rivals.length, 1);
    assert.equal(planet.rivals[0].boundTo, 'ava');
    assert.equal(planet.patrons.length, 1);
    const rivalRef = { ref: 'rival', id: planet.rivals[0].id };
    const off = play(c, [{ effect: 'rival.disable', target: '$r', reason: 'settled' }], { vars: { r: rivalRef } }).state;
    E.ledger.commit(c, off.ops);
    assert.equal(planet.rivals.length, 0);
    assert.equal(planet.disabledRivals.length, 1);
    const on = play(c, [{ effect: 'rival.enable', target: '$r' }], { vars: { r: rivalRef } }).state;
    E.ledger.commit(c, on.ops);
    assert.equal(planet.rivals.length, 1);
  });

  test('members leave, join and take command', (assert) => {
    const c = withCrew(campaign());
    R.addItem(c, { name: 'Blade', carrierId: 'bren' });
    const newcomer = { id: 'dax', name: 'Dax', speciesId: 'baseline-human', profile: profile() };
    const state = play(c, [
      { effect: 'member.remove', target: '$b' },
      { effect: 'member.add', member: newcomer },
      { effect: 'leader.set', target: '$a' }
    ], { vars: { a: member('ava'), b: member('bren') } }).state;
    E.ledger.commit(c, state.ops);
    assert.deepEqual(c.roster.members.map((m) => m.id), ['ava', 'cole', 'dax']);
    assert.equal(c.roster.items[0].carrierId, null, 'what they carried is in the Stash');
    assert.equal(c.roster.leaderId, 'ava');
  });

  test('a new motivation pays its ability bonuses as XP', (assert) => {
    const c = withCrew(campaign());
    const row = rng.getTable('Motivation Table').rows.find((r) => LP.effects.parse(r.effect).stats.combat > 0 || LP.effects.parse(r.effect).stats.savvy > 0 || LP.effects.parse(r.effect).stats.speed > 0);
    const state = play(c, [{ effect: 'motivation.set', target: '$a', row: row.id }], { vars: { a: member('ava') } }).state;
    E.ledger.commit(c, state.ops);
    assert.ok(state.ops[0].xp >= 1);
    assert.equal(R.getMember(c, 'ava').xp, state.ops[0].xp);
    assert.deepEqual(E.props(c, member('ava')).motivations, [row.id]);
  });

  test('conditions can be added and removed; new planets never become current', (assert) => {
    const c = withCrew(campaign());
    const here = withPlanet(c);
    const before = c.planets.length;
    const state = play(c, [
      { effect: 'condition.add', type: 'away', scope: 'character', target: '$a', turns: 2, from: 'next' },
      { effect: 'planets.generate', count: 3 }
    ], { vars: { a: member('ava') } }).state;
    E.ledger.commit(c, state.ops);
    assert.equal(c.conditions.length, 1);
    assert.equal(c.conditions[0].targetId, 'ava');
    assert.equal(c.conditions[0].activeFrom, R.turnNumber(c) + 1);
    assert.equal(c.conditions[0].remaining, 2);
    assert.equal(c.planets.length, before + 3);
    assert.equal(c.currentPlanetId, here.id);
    const gone = play(c, [{ effect: 'condition.remove', type: 'away' }]).state;
    E.ledger.commit(c, gone.ops);
    assert.equal(c.conditions.length, 0);
  });

  test('replay puts the snapshot back first, so applying again gives the same result', (assert) => {
    const c = withCrew(campaign());
    const snap = LP.snapshot.take(c);
    const state = play(c, [{ effect: 'resource', key: 'credits', amount: -4 }, { effect: 'xp', target: '$a', amount: 1 }], { vars: { a: member('ava') } }).state;
    E.ledger.replay(c, snap, state.ops);
    E.ledger.replay(c, snap, state.ops);
    assert.equal(c.roster.resources.credits, 6);
    assert.equal(R.getMember(c, 'ava').xp, 1);
    LP.snapshot.restore(c, snap);
    assert.equal(c.roster.resources.credits, 10);
  });

  test('snapshots notice changes', (assert) => {
    const c = withCrew(campaign());
    const snap = LP.snapshot.take(c);
    assert.ok(!LP.snapshot.changedSince(c, snap));
    c.roster.resources.credits += 1;
    assert.ok(LP.snapshot.changedSince(c, snap));
  });

  /* ---------------------------------------------------------------------- */
  group('Running steps');

  test('rolls bind a result, take modifiers from people, and branch on outcomes', (assert) => {
    const c = withCrew(campaign());
    high();
    const state = play(c, [{
      roll: '1D6', as: 'r', label: 'Piloting', add: [{ label: 'Savvy', value: '$p.savvy' }], target: 4,
      outcomes: [{ min: 8, steps: [{ say: 'Brilliant: {r}.' }] }, { max: 7, steps: [{ say: 'Fine.' }] }],
      pass: [{ effect: 'resource', key: 'storyPoints', amount: 1 }],
      fail: [{ effect: 'hull', amount: -1 }]
    }], { vars: { p: member('ava') } }).state;
    const roll = state.lines[0];
    assert.equal(roll.total, 8, '6 + Savvy 2');
    assert.equal(roll.success, true);
    assert.equal(state.lines[0].children[0].text, 'Brilliant: 8.');
    assert.deepEqual(state.ops.map((o) => o.effect), ['resource']);
    assert.deepEqual(state.vars.r, { total: 8, natural: 6, success: true });
  });

  test('best-Savvy crew outside Sick Bay take a ship roll', (assert) => {
    const c = withCrew(campaign());
    low();
    const state = play(c, [
      { select: { from: 'crew', best: 'savvy', where: { not: { fact: 'member.inSickBay' } } }, as: 'pilot', label: 'Pilot' },
      { roll: '1D6', add: [{ label: 'Savvy', value: '$pilot.savvy' }], target: 4 }
    ]).state;
    assert.equal(state.vars.pilot.id, 'ava');
    assert.equal(state.lines[0].text, 'Pilot: Ava.');
    assert.equal(state.lines[1].total, 3);
    assert.equal(state.lines[1].success, false);
  });

  test('a question in a condition pauses the run; the state survives a reload', (assert) => {
    const c = withCrew(campaign());
    const steps = [{ if: { ask: 'Was Ava hurt this turn?' }, then: [{ say: 'Yes' }], else: [{ say: 'No' }] }, { say: 'After' }];
    const env = { packs: [], disabled: [] };
    let state = E.run.start(c, steps, env);
    assert.equal(E.run.prompt(state).kind, 'question');
    state = JSON.parse(JSON.stringify(state));
    assert.deepEqual(E.run.answer(c, state, env, true), { ok: true });
    assert.deepEqual(state.lines.map((l) => l.text), ['Yes', 'After']);
    assert.ok(state.done);
  });

  test('yes/no with a cost: disabled when too poor, pays when accepted', (assert) => {
    const c = withCrew(campaign());
    const steps = [{ ask: 'yesno', prompt: 'Pay 4 credits?', cost: { key: 'credits', amount: 4 }, yes: [{ say: 'Paid.' }], no: [{ say: 'Walked away.' }] }];
    const env = { packs: [], disabled: [] };
    const state = E.run.start(c, steps, env);
    assert.ok(!E.run.prompt(state).options[0].disabled);
    assert.deepEqual(E.run.answer(c, state, env, true), { ok: true });
    assert.deepEqual(state.ops.map((o) => [o.effect, o.key, o.amount]), [['resource', 'credits', -4]]);
    c.roster.resources.credits = 2;
    const poor = E.run.start(c, steps, env);
    assert.ok(E.run.prompt(poor).options[0].disabled);
    assert.equal(typeof E.run.answer(c, poor, env, true).error, 'string');
    assert.deepEqual(E.run.answer(c, poor, env, false), { ok: true });
    assert.equal(poor.ops.length, 0);
  });

  test('options branch on the answer', (assert) => {
    const c = withCrew(campaign());
    const steps = [{ ask: 'options', prompt: 'Which?', as: 'which', options: [{ value: 'a', label: 'A', steps: [{ say: 'chose a' }] }, { value: 'b', label: 'B', steps: [{ say: 'chose b' }] }] }];
    const env = { packs: [], disabled: [] };
    const state = E.run.start(c, steps, env);
    assert.equal(typeof E.run.answer(c, state, env, 'z').error, 'string');
    E.run.answer(c, state, env, 'b');
    assert.equal(state.lines[state.lines.length - 1].text, 'chose b');
    assert.equal(state.vars.which, 'b');
  });

  test('a number prompt is limited by what the crew can afford and charges per unit', (assert) => {
    const c = withCrew(campaign());
    const steps = [{ ask: 'number', prompt: 'Rumors?', max: 3, per: { key: 'credits', amount: 2 }, steps: [{ effect: 'resource', key: 'rumors', amount: '$n' }], as: 'n' }];
    const env = { packs: [], disabled: [] };
    const state = E.run.start(c, steps, env);
    assert.equal(E.run.prompt(state).max, 3);
    c.roster.resources.credits = 5;
    const capped = E.run.start(c, steps, env);
    assert.equal(E.run.prompt(capped).max, 2);
    assert.equal(typeof E.run.answer(c, capped, env, 3).error, 'string');
    assert.deepEqual(E.run.answer(c, capped, env, 2), { ok: true });
    assert.deepEqual(capped.ops.map((o) => [o.key, o.amount]), [['credits', -4], ['rumors', 2]]);
  });

  test('a pick list takes exactly k picks and runs each pick’s steps', (assert) => {
    const c = withCrew(campaign());
    const item = (row) => [{ effect: 'item.add', table: 'Low-tech Weapon Table', row: row }];
    const steps = [{ ask: 'pickList', prompt: 'Pick 2', k: 2, repeats: true, list: [{ value: 'h', label: 'Handgun', steps: item('handgun') }, { value: 'b', label: 'Blade', steps: item('blade') }] }];
    const env = { packs: [], disabled: [] };
    const state = E.run.start(c, steps, env);
    assert.equal(typeof E.run.answer(c, state, env, ['h']).error, 'string');
    assert.deepEqual(E.run.answer(c, state, env, ['h', 'h']), { ok: true });
    assert.deepEqual(state.ops.map((o) => o.item.rowId), ['handgun', 'handgun']);
  });

  test('an offer lets the player choose one of N random candidates, or decline', (assert) => {
    const c = withCrew(campaign());
    R.addItem(c, { name: 'Blade', carrierId: 'ava' });
    R.addItem(c, { name: 'Pistol', carrierId: 'ava' });
    R.addItem(c, { name: 'Rifle', carrierId: 'ava' });
    const steps = [{
      ask: 'offer', prompt: 'Give up which?', select: { from: 'items', carrier: '$a', offer: 2 }, as: 'gift',
      chosen: [{ effect: 'item.remove', target: '$gift' }, { say: 'Traded {gift.name}.' }], declined: [{ say: 'No deal.' }]
    }];
    const env = { packs: [], disabled: [], vars: { a: member('ava') } };
    const state = E.run.start(c, steps, env);
    const options = E.run.prompt(state).options;
    assert.equal(options.length, 2);
    const first = options[0].value;
    E.run.answer(c, state, env, first);
    assert.equal(state.ops[0].effect, 'item.remove');
    assert.equal(state.ops[0].target, first);
    assert.ok(/^Traded /.test(state.lines[state.lines.length - 1].text));
    const again = E.run.start(c, steps, env);
    E.run.answer(c, again, env, null);
    assert.equal(again.ops.length, 0);
    assert.equal(again.lines[again.lines.length - 1].text, 'No deal.');
  });

  test('a recruit prompt adds the accepted character, and declining adds nobody', (assert) => {
    const c = withCrew(campaign());
    const steps = [{ ask: 'recruit', variant: { equipment: false }, accept: [{ say: 'Welcome.' }], decline: [{ effect: 'resource', key: 'storyPoints', amount: 1 }] }];
    const env = { packs: [], disabled: [] };
    const yes = E.run.start(c, steps, env);
    assert.deepEqual(E.run.prompt(yes).variant, { equipment: false });
    E.run.answer(c, yes, env, { accepted: true, member: { id: 'eli', name: 'Eli', speciesId: 'baseline-human', profile: profile() } });
    assert.deepEqual(yes.ops.map((o) => o.effect), ['member.add']);
    const no = E.run.start(c, steps, env);
    E.run.answer(c, no, env, { accepted: false });
    assert.deepEqual(no.ops.map((o) => o.effect), ['resource']);
  });

  test('pay runs the else steps when the crew can’t afford it', (assert) => {
    const c = withCrew(campaign());
    const steps = [{ effect: 'pay', amount: 12, else: [{ effect: 'condition.add', type: 'impounded', scope: 'ship', params: { cost: '$cost' } }] }];
    const poor = play(c, steps).state;
    assert.deepEqual(poor.ops.map((o) => o.effect), ['condition.add']);
    c.roster.resources.credits = 20;
    const rich = play(c, steps).state;
    assert.deepEqual(rich.ops.map((o) => [o.effect, o.amount]), [['resource', -12]]);
  });

  test('later steps see the effect of earlier ones in the same run', (assert) => {
    const c = withCrew(campaign());
    const state = play(c, [
      { effect: 'resource', key: 'credits', amount: -8 },
      { if: { fact: 'resource', key: 'credits', lt: 5 }, then: [{ say: 'Nearly broke' }] }
    ]).state;
    assert.equal(state.lines[0].text, 'Nearly broke');
    assert.equal(c.roster.resources.credits, 10, 'the campaign itself is untouched');
  });

  test('repeat runs a fixed number of times, or until a condition', (assert) => {
    const c = withCrew(campaign());
    const fixed = play(c, [{ repeat: { times: 3 }, steps: [{ effect: 'resource', key: 'rumors', amount: 1 }] }]).state;
    assert.equal(fixed.ops.length, 3);
    high();
    const until = play(c, [{ repeat: { max: 3, until: { var: '$r.success', eq: true } }, steps: [{ roll: '1D6', as: 'r', target: 4 }] }]).state;
    assert.equal(until.lines.length, 1, 'stops at the first success');
    low();
    const never = play(c, [{ repeat: { max: 3, until: { var: '$r.success', eq: true } }, steps: [{ roll: '1D6', as: 'r', target: 4 }] }]).state;
    assert.equal(never.lines.length, 3);
  });

  test('forEach runs steps for each picked person', (assert) => {
    const c = withCrew(campaign());
    const state = play(c, [
      { select: { from: 'crew', count: 3 }, as: 'all' },
      { forEach: '$all', steps: [{ effect: 'xp', target: '$each', amount: 1 }] }
    ]).state;
    assert.deepEqual(state.ops.map((o) => o.target).sort(), ['ava', 'bren', 'cole']);
  });

  test('a step with nobody to act on is skipped, and required selectors use the fallback', (assert) => {
    const c = withCrew(campaign());
    const skipped = play(c, [
      { select: { from: 'crew', where: { fact: 'member.species', eq: 'nobody' } }, as: 'who' },
      { effect: 'xp', target: '$who', amount: 1 },
      { say: 'Done' }
    ]).state;
    assert.equal(skipped.ops.length, 0);
    assert.equal(skipped.lines[0].text, 'Done');
    const pack = makePack([ev('picky', 'character', [
      { select: { from: 'crew', where: { fact: 'member.species', eq: 'nobody' } }, as: 'who', required: true },
      { say: 'never shown' }
    ], { fallback: [{ say: 'Fallback' }] })]);
    const state = play(c, [{ table: 'character' }], { packs: [pack] }).state;
    assert.deepEqual(state.lines[0].children.map((l) => l.text), ['Fallback']);
  });

  /* ---------------------------------------------------------------------- */
  group('Event tables');

  test('an event table rolls by weight, skipping disabled events and unmet requirements', (assert) => {
    const c = withCrew(campaign());
    const pack = makePack([
      ev('big', 'trade', [{ say: 'big' }], { weight: 9 }),
      ev('small', 'trade', [{ say: 'small' }], { weight: 1 }),
      ev('picky', 'trade', [{ say: 'picky' }], { weight: 50, requires: { fact: 'crew.count', gte: 10 } }),
      ev('off', 'trade', [{ say: 'off' }], { weight: 50 })
    ]);
    for (let i = 0; i < 30; i++) {
      const state = play(c, [{ table: 'trade' }], { packs: [pack], disabled: ['t:off'] }).state;
      const id = state.lines[0].rowId;
      assert.ok(id === 't:big' || id === 't:small', id);
    }
    high();
    const last = play(c, [{ table: 'trade' }], { packs: [pack], disabled: ['t:off'] }).state;
    assert.equal(last.lines[0].rowId, 't:small', 'a high roll lands on the last event in order');
    assert.equal(last.lines[0].title, 'small');
    assert.equal(last.lines[0].text, 'Rule text for small');
    assert.equal(last.lines[0].children[0].text, 'small');
  });

  test('allowed lets an archetype narrow the table; an empty table says so', (assert) => {
    const c = withCrew(campaign());
    const pack = makePack([ev('a', 'trade', [{ say: 'a' }]), ev('b', 'trade', [{ say: 'b' }])]);
    for (let i = 0; i < 10; i++) {
      assert.equal(play(c, [{ table: 'trade' }], { packs: [pack], allowed: (id) => id === 't:b' }).state.lines[0].rowId, 't:b');
    }
    const none = play(c, [{ table: 'trade' }], { packs: [pack], allowed: () => false }).state;
    assert.ok(/No Trade event can happen/.test(none.lines[0].text));
  });

  test('"again" rolls the same table once more, and chains stop at a depth limit', (assert) => {
    const c = withCrew(campaign());
    const pack = makePack([ev('loop', 'travel', [{ say: 'again' }, { again: true }])]);
    const state = play(c, [{ table: 'travel' }], { packs: [pack] }).state;
    const walk = (lines) => lines.reduce((n, l) => n + 1 + walk(l.children || []), 0);
    assert.ok(walk(state.lines) > 4);
    assert.ok(JSON.stringify(state.lines).includes('too many events in a row'));
  });

  test('rollGroup picks among the events of a group, and call runs a fragment', (assert) => {
    const c = withCrew(campaign());
    const pack = makePack([
      ev('pod-a', 'travel', [{ call: 'bump' }], { group: 'pod', weight: 1 }),
      ev('pod-b', 'travel', [{ say: 'b' }], { group: 'pod', weight: 1 }),
      ev('other', 'travel', [{ say: 'other' }], { weight: 100 })
    ], [{ id: 'bump', steps: [{ effect: 'resource', key: 'rumors', amount: 1 }] }]);
    low();
    const state = play(c, [{ rollGroup: 'pod' }], { packs: [pack] }).state;
    assert.equal(state.lines[0].rowId, 't:pod-a');
    assert.equal(state.ops.length, 1);
    high();
    assert.equal(play(c, [{ rollGroup: 'pod' }], { packs: [pack] }).state.lines[0].rowId, 't:pod-b');
  });

  test('a roll table with its own scripts hands items and gains to the ledger', (assert) => {
    const c = withCrew(campaign());
    withPlanet(c);
    low();
    const state = play(c, [{ table: 'Loot Table', as: 'found' }]).state;
    assert.equal(state.lines[0].table, 'Loot Table');
    const adds = state.ops.filter((o) => o.effect === 'item.add');
    assert.equal(adds.length, 1, 'the lowest roll is a weapon');
    assert.ok(adds[0].item.table && adds[0].item.rowId);
    assert.ok(state.vars.found.rowId);
    high();
    const rewards = play(c, [{ table: 'Loot Table' }]).state;
    assert.ok(rewards.ops.every((o) => o.effect === 'resource' || o.effect === 'item.add'));
  });

  test('alternatives roll in separate ledgers and keep only the one chosen', (assert) => {
    const c = withCrew(campaign());
    const pack = makePack([
      ev('one', 'trade', [{ effect: 'resource', key: 'credits', amount: 1 }], { weight: 1 }),
      ev('two', 'trade', [{ effect: 'resource', key: 'credits', amount: 2 }], { weight: 1 })
    ]);
    const env = { packs: [pack], disabled: [] };
    const state = E.run.start(c, [{ alternatives: { n: 2, table: 'trade' } }], env);
    assert.equal(E.run.prompt(state).options.length, 2);
    assert.equal(state.ops.length, 0);
    E.run.answer(c, state, env, 1);
    assert.equal(state.ops.length, 1);
    assert.ok(state.lines.length >= 1);
    assert.ok(state.done);
  });

  /* ---------------------------------------------------------------------- */
  group('Packs');

  test('a valid pack passes; each kind of mistake is named', (assert) => {
    const good = makePack([ev('a', 'trade', [{ effect: 'xp', target: '$actor', amount: 1 }, { say: 'hi' }], { group: 'g', requires: { fact: 'crew.count', gte: 1 } })]);
    assert.deepEqual(E.pack.validate(good), []);
    const bad = (mutate) => { const p = JSON.parse(JSON.stringify(good)); mutate(p); return E.pack.validate(p); };
    assert.equal(E.pack.validate({}).length, 1);
    assert.equal(bad((p) => { p.version = 9; }).length, 1);
    assert.ok(bad((p) => { p.pack.id = 'Bad Id'; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].table = 'weather'; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].weight = 0; }).length >= 1);
    assert.ok(bad((p) => { p.events.push(p.events[0]); }).length >= 1, 'duplicate id');
    assert.ok(bad((p) => { p.events[0].steps = [{ effect: 'xp', amount: 'lots' }]; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].steps = [{ effect: 'teleport' }]; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].steps = [{ wobble: 1 }]; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].steps = [{ call: 'missing' }]; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].steps = [{ rollGroup: 'missing' }]; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].requires = { ask: 'Really?' }; }).length >= 1);
    assert.ok(bad((p) => { p.events[0].steps = [{ table: 'No Such Table' }]; }).length >= 1);
    assert.ok(bad((p) => { p.conditions = [{ id: 'x', scope: 'galaxy' }]; }).length >= 1);
  });

  test('every step kind validates its own shape', (assert) => {
    const steps = [
      { roll: '1D6+$bonus', as: 'r', outcomes: [{ min: 1, steps: [{ say: 'x' }] }] },
      { select: { from: 'crew', best: 'savvy' }, as: 'p' },
      { if: { fact: 'crew.count', gte: 2 }, then: [{ say: 'x' }], else: [{ manual: 'do it' }] },
      { ask: 'yesno', prompt: 'ok?', yes: [], no: [] },
      { ask: 'options', prompt: 'which', options: [{ value: 'a', label: 'A', steps: [] }] },
      { ask: 'number', prompt: 'n', max: 3, steps: [] },
      { ask: 'pickList', prompt: 'p', k: 1, list: [{ value: 'a', label: 'A', steps: [] }] },
      { ask: 'offer', prompt: 'o', select: { from: 'items', offer: 2 }, chosen: [], declined: [] },
      { ask: 'recruit', accept: [], decline: [] },
      { table: 'Loot Table' }, { table: 'trade' }, { again: true },
      { alternatives: { n: 2, table: 'trade' } },
      { forEach: '$p', steps: [] }, { repeat: { times: 2 }, steps: [] }
    ];
    assert.deepEqual(E.run.validateSteps(steps, 'steps', { groups: [], fragments: [] }), []);
    assert.ok(E.run.validateSteps([{ roll: 'two dice' }], 'steps').length >= 1);
    assert.ok(E.run.validateSteps([{ select: { from: 'crew' } }], 'steps').length >= 1, 'select needs a name');
    assert.ok(E.run.validateSteps([{ ask: 'number', prompt: 'n' }], 'steps').length >= 1);
    assert.ok(E.run.validateSteps([{ select: { from: 'crew', where: { ask: 'sure?' } }, as: 'x' }], 'steps').length >= 1, 'no questions inside selectors');
    assert.ok(E.run.validateSteps([{ repeat: { max: 3 }, steps: [] }], 'steps').length >= 1);
  });

  test('importing adds a pack on top, renaming the id when it is taken', (assert) => {
    const a = makePack([ev('a', 'trade', [])]);
    const first = E.pack.importPack([], a);
    assert.equal(first.pack.pack.id, 't');
    assert.equal(first.renamedFrom, null);
    const second = E.pack.importPack([first.pack], a);
    assert.equal(second.pack.pack.id, 't-2');
    assert.equal(second.renamedFrom, 't');
    assert.equal(E.pack.fullId(second.pack, second.pack.events[0]), 't-2:a');
    assert.throws(() => E.pack.importPack([], { format: 'nope' }));
  });

  /* ---------------------------------------------------------------------- */
  group('Turn engine: applying a ledger');

  // Only used by these tests; it is skipped unless turnMemory.ledgerTest is set.
  LP.turn.register({
    id: 'zz-ledger-test', step: 'post', number: '9.9', title: 'Ledger test', page: 0, ledger: true,
    applies: (ctx) => (ctx.memory.ledgerTest ? true : 'Only for tests.'),
    fields: () => [],
    resolve: () => ({ output: { headline: 'Test', lines: [], ops: [] } })
  });

  function ledgerTurn(c, steps) {
    const state = E.run.start(c, steps, { packs: [], disabled: [], vars: { a: member('ava') } });
    c.turn = {
      startedAt: 'test', memoryAtStart: {}, geoAtStart: null, draft: null, portraits: {},
      records: [{
        id: 'zz-ledger-test', input: {}, output: { headline: 'Test', lines: state.lines, ops: state.ops },
        pending: null, facts: {}, todo: [], history: [], memoryBefore: {}, geoBefore: null,
        snapBefore: LP.snapshot.take(c)
      }]
    };
  }

  test('nothing changes until Apply; Apply commits the ops once', (assert) => {
    const c = withCrew(campaign());
    ledgerTurn(c, [{ effect: 'resource', key: 'credits', amount: -4 }, { effect: 'xp', target: '$a', amount: 2 }]);
    assert.equal(c.roster.resources.credits, 10);
    assert.deepEqual(LP.turn.applyLedger(c), { ok: true });
    assert.equal(c.roster.resources.credits, 6);
    assert.equal(R.getMember(c, 'ava').xp, 2);
    assert.equal(typeof LP.turn.applyLedger(c).error, 'string', 'not twice');
    assert.equal(LP.turn.undoWarning(c), null);
  });

  test('Undo puts the roster back and warns when the Crew tab was changed since', (assert) => {
    const c = withCrew(campaign());
    ledgerTurn(c, [{ effect: 'resource', key: 'credits', amount: -4 }, { effect: 'sickBay', target: '$a', turns: 2 }]);
    LP.turn.applyLedger(c);
    c.roster.resources.fuel = 3;
    assert.ok(/Crew tab/.test(LP.turn.undoWarning(c)));
    assert.ok(/Crew tab/.test(LP.turn.restartWarning(c)));
    assert.ok(LP.turn.undo(c), 'the first Undo takes back Apply');
    assert.ok(LP.turn.awaitingApply(c.turn.records[0]));
    assert.ok(LP.turn.undo(c), 'the next removes the stage');
    assert.equal(c.roster.resources.credits, 10);
    assert.equal(c.roster.resources.fuel, 0, 'the hand-made change goes too');
    assert.equal(R.getMember(c, 'ava').status, 'active');
    assert.equal(c.turn.records.length, 0);
  });

  test('Undo before Apply changes nothing, and Restart reverts applied stages', (assert) => {
    const c = withCrew(campaign());
    ledgerTurn(c, [{ effect: 'resource', key: 'credits', amount: -4 }]);
    c.roster.resources.fuel = 3;
    LP.turn.undo(c);
    assert.equal(c.roster.resources.fuel, 3, 'not applied, so nothing to put back');
    ledgerTurn(c, [{ effect: 'resource', key: 'credits', amount: -4 }]);
    LP.turn.applyLedger(c);
    LP.turn.restart(c);
    assert.equal(c.roster.resources.credits, 10);
    assert.equal(c.turn.records.length, 0);
  });

  test('portraits survive Undo, even for a member an event removed', (assert) => {
    const c = withCrew(campaign());
    c.roster.members[1].portrait = 'data:image/jpeg;base64,AAAA';
    ledgerTurn(c, [{ effect: 'member.remove', target: '$a' }]);
    c.roster.members[0].portrait = 'data:image/jpeg;base64,BBBB';
    c.turn.portraits = LP.snapshot.portraitsOf(c);
    LP.turn.applyLedger(c);
    assert.ok(!R.getMember(c, 'ava'));
    LP.turn.undo(c);
    LP.turn.undo(c);
    assert.equal(R.getMember(c, 'ava').portrait, 'data:image/jpeg;base64,BBBB');
    assert.ok(JSON.stringify(c.turn.records) === '[]');
  });
})(window.LP);
