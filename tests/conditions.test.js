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
    P.setCurrent(c, planet.id);
    return c;
  }

  /** Add a condition the way an event does. */
  function add(c, type, settings) {
    const state = E.run.start(c, [Object.assign({ effect: 'condition.add', type: type }, settings)], { packs: [], disabled: [], vars: { ava: { ref: 'member', id: 'ava' }, bren: { ref: 'member', id: 'bren' } } });
    E.ledger.commit(c, state.ops);
    return c.conditions[c.conditions.length - 1];
  }

  /** Play Step 0 for the turn and apply it. */
  function step0(c) {
    const r = C.step0(c);
    E.ledger.commit(c, r.ops);
    return r;
  }

  const has = (c, type) => c.conditions.some((i) => i.type === type);

  /* ---------------------------------------------------------------------- */
  group('Condition types');

  test('every base condition type is valid, and the base pack validates', (assert) => {
    for (const type of LP.data.basePack.conditions) assert.deepEqual(C.validateType(type), [], type.id);
    assert.deepEqual(E.pack.validate(LP.data.basePack), []);
    const ids = LP.data.basePack.conditions.map((t) => t.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 37);
  });

  test('type validation names each mistake', (assert) => {
    const ok = { id: 'x', name: 'X', scope: 'campaign' };
    const bad = (extra) => C.validateType(Object.assign({}, ok, extra));
    assert.deepEqual(bad({}), []);
    assert.ok(bad({ scope: 'galaxy' }).length);
    assert.ok(bad({ blocks: ['sleeping'] }).length);
    assert.ok(bad({ modifiers: [{ target: 'roll.dancing', add: 1 }] }).length);
    assert.ok(bad({ modifiers: [{ target: 'roll.recruit' }] }).length);
    assert.ok(bad({ on: { whenever: [] } }).length);
    assert.ok(bad({ on: { arrive: [{ ask: 'yesno', prompt: 'ok?', yes: [], no: [] }] } }).length, 'no prompts in hooks');
    assert.ok(bad({ on: { arrive: [{ effect: 'teleport' }] } }).length);
    assert.ok(bad({ check: { stat: 'savvy', dice: '1D6', target: 5 } }).length, 'a check needs a duration');
    assert.ok(bad({ duration: { turns: 0, from: 'now' } }).length);
    assert.ok(bad({ consumeOn: 'tuesday' }).length);
    assert.ok(bad({ asks: [{ key: 'a', trigger: 'never', label: 'ok?' }] }).length);
    assert.ok(bad({ modifiers: [{ target: 'cost.upkeep', set: 0, ask: 'nope' }] }).length);
  });

  test('new instances take the type’s duration, or the event’s', (assert) => {
    const c = withCrew(campaign(3));
    const away = C.make(c, 'away', { targetId: 'ava' });
    assert.equal(away.activeFrom, 4);
    assert.equal(away.remaining, 2);
    const longer = C.make(c, 'away', { targetId: 'ava', turns: 5, from: 'now' });
    assert.equal(longer.activeFrom, 3);
    assert.equal(longer.remaining, 5);
    const permanent = C.make(c, 'on-quest');
    assert.equal(permanent.remaining, null);
    const planet = C.make(c, 'lockdown');
    assert.equal(planet.targetId, c.currentPlanetId, 'a planet condition defaults to the current planet');
  });

  test('unique: ignore keeps the old one, stack adds another', (assert) => {
    const c = withCrew(campaign());
    add(c, 'cosmic-seen');
    add(c, 'cosmic-seen');
    assert.equal(c.conditions.filter((i) => i.type === 'cosmic-seen').length, 1);
    add(c, 'refuses-tasks', { target: '$ava' });
    add(c, 'refuses-tasks', { target: '$ava' });
    assert.equal(c.conditions.filter((i) => i.type === 'refuses-tasks').length, 2);
  });

  test('a condition is in force only once begun, while it has time left, and (for a planet) while the crew is there', (assert) => {
    const c = withCrew(campaign(3));
    const later = add(c, 'refuses-tasks', { target: '$ava' });
    assert.ok(!C.isActive(c, later), 'begins next turn');
    c.turnNumber = 4;
    assert.ok(C.isActive(c, later));
    later.remaining = 0;
    assert.ok(!C.isActive(c, later));
    const lock = add(c, 'lockdown');
    c.turnNumber = 5;
    assert.ok(C.isActive(c, lock));
    c.currentPlanetId = null;
    assert.ok(!C.isActive(c, lock), 'not on that planet');
    const orphan = add(c, 'cant-fight', { target: '$ava' });
    R.removeMember(c, 'ava');
    assert.ok(!C.isActive(c, orphan));
  });

  /* ---------------------------------------------------------------------- */
  group('Step 0: timers');

  test('"next 2 turns" applied in turn 3 is active in turns 4 and 5, and gone at the start of turn 6', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'away', { target: '$ava' });
    c.turnNumber = 4;
    let r = step0(c);
    assert.equal(c.conditions[0].remaining, 2, 'no tick on its first turn');
    assert.ok(C.blocked(c, 'battle', { memberId: 'ava' }));
    assert.ok(r.any);
    c.turnNumber = 5;
    step0(c);
    assert.equal(c.conditions[0].remaining, 1);
    assert.ok(C.blocked(c, 'battle', { memberId: 'ava' }), 'still away in turn 5');
    c.turnNumber = 6;
    r = step0(c);
    assert.equal(c.conditions.length, 0, 'ended');
    assert.ok(!C.blocked(c, 'battle', { memberId: 'ava' }));
    assert.ok(r.lines.some((l) => /ends/.test(l.text)));
  });

  test('"this turn" applied in turn 3 is gone at the start of turn 4', (assert) => {
    const c = withCrew(campaign(3));
    const lost = add(c, 'cant-fight', { target: '$ava' });
    assert.ok(C.isActive(c, lost), 'active for the rest of turn 3');
    c.turnNumber = 4;
    step0(c);
    assert.equal(c.conditions.length, 0);
  });

  test('an expiry hook runs when the time is up', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'away', { target: '$ava' });
    c.turnNumber = 5; step0(c);
    c.turnNumber = 6;
    low();
    const r = C.step0(c);
    const kinds = r.ops.map((o) => o.effect);
    assert.ok(kinds.includes('xp'));
    assert.ok(kinds.includes('condition.remove'));
    assert.ok(r.ops.some((o) => o.effect === 'item.add'), 'a Loot Table item');
    assert.equal(r.ops.find((o) => o.effect === 'xp').target, 'ava');
  });

  test('permanent conditions never tick; a future one is left alone', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'cosmic-seen');
    add(c, 'refuses-tasks', { target: '$ava' });
    c.turnNumber = 3;
    const r = step0(c);
    assert.equal(c.conditions.find((i) => i.type === 'cosmic-seen').remaining, null);
    assert.equal(c.conditions.find((i) => i.type === 'refuses-tasks').remaining, 1, 'not begun');
    assert.ok(r.any);
  });

  test('a condition whose target has left is cleared', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'away', { target: '$ava' });
    R.removeMember(c, 'ava');
    c.turnNumber = 4;
    step0(c);
    assert.equal(c.conditions.length, 0);
  });

  test('conditions whose timers count arrivals tick only then', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'local-maps');
    c.turnNumber = 5;
    step0(c);
    assert.equal(c.conditions[0].remaining, 2, 'Step 0 leaves it alone');
    E.ledger.commit(c, C.arrivalTicks(c));
    assert.equal(c.conditions[0].remaining, 1);
    E.ledger.commit(c, C.arrivalTicks(c));
    assert.equal(c.conditions.length, 0, 'gone after the second arrival');
  });

  /* ---------------------------------------------------------------------- */
  group('Step 0: checks');

  function missing(c) {
    const item = R.addItem(c, { name: 'Blade', carrierId: 'ava' });
    const state = E.run.start(c, [{ effect: 'item.hold', target: '$i', type: 'missing-item' }], { packs: [], disabled: [], vars: { i: { ref: 'item', id: item.id } } });
    E.ledger.commit(c, state.ops);
    return item;
  }

  test('an item that goes missing is held by a condition', (assert) => {
    const c = withCrew(campaign(3));
    const item = missing(c);
    assert.equal(c.roster.items.length, 0);
    assert.equal(c.conditions[0].type, 'missing-item');
    assert.equal(c.conditions[0].targetId, 'ava');
    assert.equal(c.conditions[0].params.item.id, item.id);
  });

  test('the check is rolled by the best crew member outside Sick Bay, and a pass gives the item back', (assert) => {
    const c = withCrew(campaign(3));
    missing(c);
    c.turnNumber = 4;
    high();
    const r = C.step0(c);
    const roll = r.lines.find((l) => l.type === 'roll');
    assert.ok(/Ava/.test(roll.label), 'Ava, not Cole who is in Sick Bay');
    assert.equal(roll.total, 8, '6 + Savvy 2');
    assert.ok(roll.success);
    E.ledger.commit(c, r.ops);
    assert.equal(c.conditions.length, 0);
    assert.equal(c.roster.items.length, 1);
    assert.equal(c.roster.items[0].carrierId, 'ava');
  });

  test('a failed check loses the item for good', (assert) => {
    const c = withCrew(campaign(3));
    missing(c);
    c.turnNumber = 4;
    low();
    const r = C.step0(c);
    assert.ok(!r.lines.find((l) => l.type === 'roll').success);
    E.ledger.commit(c, r.ops);
    assert.equal(c.conditions.length, 0);
    assert.equal(c.roster.items.length, 0);
    assert.ok(r.lines.some((l) => (l.children || []).some((x) => /lost for good/.test(x.text))));
  });

  test('with nobody fit to try, the check fails', (assert) => {
    const c = withCrew(campaign(3));
    missing(c);
    for (const m of c.roster.members) m.status = 'sick-bay';
    c.turnNumber = 4;
    const r = C.step0(c);
    assert.ok(r.lines.some((l) => /nobody is fit/.test(l.text)));
    E.ledger.commit(c, r.ops);
    assert.equal(c.roster.items.length, 0);
  });

  test('a member who is blocked from tasks does not take the check', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'refuses-tasks', { target: '$ava', turns: 3, from: 'now' });
    missing(c);
    c.turnNumber = 4;
    high();
    const roll = C.step0(c).lines.find((l) => l.type === 'roll');
    assert.ok(/Bren/.test(roll.label));
  });

  /* ---------------------------------------------------------------------- */
  group('Blocks, grants and modifiers');

  test('battle blocks can name an exception', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'refuses-battle', { target: '$ava', from: 'now' });
    assert.ok(C.blocked(c, 'battle', { memberId: 'ava', mission: 'opportunity' }));
    assert.equal(C.blocked(c, 'battle', { memberId: 'ava', mission: 'invasion' }), null);
    assert.equal(C.blocked(c, 'battle', { memberId: 'bren' }), null);
    assert.equal(C.blocked(c, 'battle'), null, 'a character condition needs a member');
  });

  test('ship and planet conditions block travel for everyone', (assert) => {
    const c = withCrew(campaign(3));
    assert.equal(C.blocked(c, 'travel'), null);
    add(c, 'lockdown', { from: 'now' });
    assert.equal(C.blocked(c, 'travel').type, 'lockdown');
    add(c, 'grounded', { from: 'now' });
    assert.ok(C.blocked(c, 'travel'));
  });

  test('extra actions are granted to their character', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'extra-action', { target: '$ava', from: 'now' });
    assert.equal(C.grants(c, 'extra-action', 'ava'), 1);
    assert.equal(C.grants(c, 'extra-action', 'bren'), 0);
  });

  test('a single-use bonus names the roll in its params and says what it uses up', (assert) => {
    const c = withCrew(campaign(3));
    const bonus = add(c, 'roll-bonus', { params: { roll: 'recruit' }, from: 'now' });
    const gift = add(c, 'recruit-gift');
    const m = C.modifiers(c, 'roll.recruit');
    assert.deepEqual(m.mods.map((x) => x.value).sort(), [1, 2]);
    assert.deepEqual(m.used.sort(), [bonus.id, gift.id].sort());
    assert.deepEqual(C.consumeOps(m.used).map((o) => o.effect), ['condition.remove', 'condition.remove']);
    assert.equal(C.modifiers(c, 'roll.patron').mods.length, 0);
  });

  test('modifiers that need a Yes only count when the player said so', (assert) => {
    const c = withCrew(campaign(3));
    const supplies = add(c, 'supplies');
    const key = C.answerKey(supplies, 'use');
    assert.equal(C.modifiers(c, 'cost.upkeep').set, undefined);
    const yes = C.modifiers(c, 'cost.upkeep', { input: { [key]: true } });
    assert.equal(yes.set, 0);
    assert.deepEqual(yes.used, [supplies.id]);
  });

  test('a floor guarantees a result, and a planet bonus applies while there', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'insider-info');
    assert.equal(C.modifiers(c, 'roll.patron').floor, 5);
    add(c, 'war-rumors');
    assert.deepEqual(C.modifiers(c, 'roll.invasion').mods.map((m) => m.value), [2]);
    c.currentPlanetId = null;
    assert.equal(C.modifiers(c, 'roll.invasion').mods.length, 0);
  });

  test('rival conditions change only that Rival’s enemy count', (assert) => {
    const c = withCrew(campaign(3));
    const planet = P.current(c);
    const a = P.newRival(c, planet);
    const b = P.newRival(c, planet);
    add(c, 'follows', { target: '$r', from: 'now' });
    c.conditions[0].targetId = a.id;
    assert.equal(C.modifiers(c, 'enemies', { rivalId: a.id }).mods[0].value, 1);
    assert.equal(C.modifiers(c, 'enemies', { rivalId: b.id }).mods.length, 0);
    assert.equal(C.modifiers(c, 'enemies').mods.length, 0);
  });

  /* ---------------------------------------------------------------------- */
  group('Hooks');

  test('hook questions become Yes/No fields naming the person', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'stay-or-pay', { target: '$ava' });
    add(c, 'trade-goods');
    const depart = C.fields(c, 'depart');
    assert.equal(depart.length, 1);
    assert.ok(/Ava/.test(depart[0].label));
    assert.equal(depart[0].type, 'yesno');
    assert.equal(C.fields(c, 'arrive').length, 2);
    assert.equal(C.fields(c, 'upkeep').length, 0);
  });

  test('stay-or-pay: pay a story point, or they stay behind; either way it is used up', (assert) => {
    const c = withCrew(campaign(3));
    c.roster.resources.storyPoints = 2;
    const inst = add(c, 'stay-or-pay', { target: '$ava' });
    const key = C.answerKey(inst, 'pay');
    const paid = C.run(c, 'depart', { [key]: true });
    assert.deepEqual(paid.ops.map((o) => o.effect), ['resource', 'condition.remove']);
    const left = C.run(c, 'depart', { [key]: false });
    assert.deepEqual(left.ops.map((o) => o.effect), ['member.remove', 'condition.remove']);
    c.roster.resources.storyPoints = 0;
    assert.equal(C.run(c, 'depart', { [key]: true }).ops[0].effect, 'member.remove', 'can’t pay what they don’t have');
  });

  test('overstay adds a Rival each turn you stay, and ends when you leave', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'overstay');
    const stay = C.run(c, 'stay', {});
    assert.deepEqual(stay.ops.map((o) => o.effect), ['rival.add']);
    assert.ok(C.has(c, 'overstay'));
    const depart = C.run(c, 'depart', {});
    assert.deepEqual(depart.ops.map((o) => o.effect), ['condition.remove']);
  });

  test('package pays out on arrival and is used up', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'package', { target: '$ava' });
    high();
    const r = C.run(c, 'arrive', {});
    assert.deepEqual(r.ops.map((o) => o.effect), ['resource', 'condition.remove']);
    low();
    const trouble = C.run(c, 'arrive', {});
    assert.deepEqual(trouble.ops.map((o) => o.effect), ['resource', 'rival.add', 'resource', 'condition.remove']);
  });

  test('trade goods: roll for the price, sell, wait, or lose them on a 1', (assert) => {
    const c = withCrew(campaign(3));
    const inst = add(c, 'trade-goods');
    const roll = C.answerKey(inst, 'roll');
    const sell = C.answerKey(inst, 'sell');
    assert.equal(C.run(c, 'arrive', {}).ops.length, 0, 'nothing unless they ask');
    high();
    const sold = C.run(c, 'arrive', { [roll]: true, [sell]: true });
    assert.deepEqual(sold.ops.map((o) => [o.effect, o.amount]), [['resource', 6], ['condition.remove', undefined]]);
    const waited = C.run(c, 'arrive', { [roll]: true, [sell]: false });
    assert.equal(waited.ops.length, 0);
    low();
    const perished = C.run(c, 'arrive', { [roll]: true, [sell]: true });
    assert.deepEqual(perished.ops.map((o) => o.effect), ['condition.remove']);
  });

  test('small job and reward pay when the player says the job was done', (assert) => {
    const c = withCrew(campaign(3));
    const job = add(c, 'small-job', { from: 'now' });
    const key = C.answerKey(job, 'done');
    assert.deepEqual(C.run(c, 'battleResult', { [key]: true }).ops.map((o) => [o.effect, o.amount]), [['resource', 2], ['condition.remove', undefined]]);
    assert.deepEqual(C.run(c, 'battleResult', { [key]: false }).ops.map((o) => o.effect), ['condition.remove']);
  });

  test('promising lead pays for an Opportunity mission only', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'promising-lead', { from: 'now' });
    assert.equal(C.run(c, 'battleResult', {}, { turn: { mission: 'opportunity' } }).ops[0].amount, 3);
    assert.equal(C.run(c, 'battleResult', {}, { turn: { mission: 'patron' } }).ops.length, 1, 'only the removal');
  });

  test('gaining a Rival can repay a favor; gaining a Quest pays out Local maps', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'criminal-favor');
    high();
    const rival = E.run.start(c, [{ effect: 'rival.add' }], { packs: [], disabled: [] });
    assert.deepEqual(rival.ops.map((o) => o.effect), ['rival.add', 'rival.disable', 'condition.remove']);
    E.ledger.commit(c, rival.ops);
    assert.equal(P.current(c).rivals.length, 0, 'the new Rival was talked out of it');
    assert.equal(P.current(c).disabledRivals.length, 1);

    add(c, 'local-maps');
    const quest = E.run.start(c, [{ effect: 'condition.add', type: 'on-quest' }], { packs: [], disabled: [] });
    const kinds = quest.ops.map((o) => o.effect + (o.key ? ':' + o.key : ''));
    assert.deepEqual(kinds, ['condition.add', 'resource:rumors', 'condition.remove']);
  });

  /* ---------------------------------------------------------------------- */
  group('Leaving the ship');

  test('travel fields offer to pay off what can be paid, and just report the rest', (assert) => {
    const c = withCrew(campaign(3));
    assert.equal(C.travelFields(c).length, 0);
    const grounded = add(c, 'grounded', { from: 'now', turns: 1 });
    add(c, 'lockdown', { from: 'now' });
    const f = C.travelFields(c);
    assert.deepEqual(f.map((x) => x.type), ['yesno', 'info']);
    assert.equal(f[0].key, 'bypass:' + grounded.id);
  });

  test('taking off early costs the damage and clears the block; unpaid blocks stop the ship', (assert) => {
    const c = withCrew(campaign(3));
    const grounded = add(c, 'grounded', { from: 'now', turns: 1 });
    assert.ok(C.travelCheck(c, {}).error);
    high();
    const ok = C.travelCheck(c, { ['bypass:' + grounded.id]: true });
    assert.equal(ok.error, undefined);
    assert.deepEqual(ok.ops.map((o) => o.effect), ['hull', 'condition.remove']);
    assert.ok(ok.ops[0].amount < 0);
  });

  test('life support must be paid for, and the crew must be able to', (assert) => {
    const c = withCrew(campaign(3));
    const inst = add(c, 'life-support', { params: { cost: 4 } });
    assert.ok(/4 credits/.test(C.travelFields(c)[0].label));
    const ok = C.travelCheck(c, { ['bypass:' + inst.id]: true });
    assert.deepEqual(ok.ops.map((o) => [o.effect, o.amount]), [['resource', -4], ['condition.remove', undefined]]);
    c.roster.resources.credits = 2;
    assert.ok(/can’t pay/.test(C.travelCheck(c, { ['bypass:' + inst.id]: true }).error));
  });

  test('a lockdown has no way round', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'lockdown', { from: 'now' });
    assert.ok(C.travelCheck(c, {}).error);
    assert.ok(C.travelCheck(c, { 'bypass:x': true }).error);
  });

  /* ---------------------------------------------------------------------- */
  group('Step 0 in the turn');

  test('Step 0 is skipped with nothing in play, and comes before the rest of the turn', (assert) => {
    const c = withCrew(campaign(1));
    const w = T.walk(c);
    assert.equal(w.items[0].def.id, 'conditions');
    assert.equal(w.items[0].status, 'skipped');
    assert.equal(w.current.id, 'start');
    assert.equal(w.current.number, '0.5');
  });

  test('with conditions due, Step 0 is the first stage; its changes wait for Apply', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'away', { target: '$ava' });
    c.turnNumber = 6;
    c.conditions[0].activeFrom = 4;
    c.conditions[0].remaining = 1;
    assert.equal(T.walk(c).current.id, 'conditions');
    assert.deepEqual(T.confirm(c, {}), { ok: true });
    const w = T.walk(c);
    assert.equal(w.items[0].status, 'pending', 'waiting to be applied');
    assert.equal(w.current, null);
    assert.ok(T.awaitingApply(c.turn.records[0]));
    assert.equal(c.conditions.length, 1, 'nothing changed yet');
    assert.deepEqual(T.applyLedger(c), { ok: true });
    assert.equal(c.conditions.length, 0);
    assert.equal(T.walk(c).current.id, 'start');
    T.undo(c);
    assert.equal(c.conditions.length, 1, 'Undo takes back what Apply did');
    assert.ok(T.awaitingApply(c.turn.records[0]));
  });

  test('a Step 0 that changes nothing needs no Apply', (assert) => {
    const c = withCrew(campaign(3));
    add(c, 'cosmic-seen');
    assert.deepEqual(T.confirm(c, {}), { ok: true });
    assert.ok(!T.awaitingApply(c.turn.records[0]));
    assert.equal(T.walk(c).current.id, 'start');
  });
})(window.LP);
