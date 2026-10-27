(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const P = LP.planets;
  const R = LP.roster;
  const T = LP.turn;
  const A = LP.archetypes;
  const E = LP.events;

  function low() { rng.setSource(() => 0); }
  function high() { rng.setSource(() => 0.999); }

  function profile(o) {
    return Object.assign({ reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 0, luck: 0 }, o);
  }

  /** A campaign on a planet with a crew: Ava (Human), Bren (K'Erin), Cole (Precursor). */
  function world() {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 },
      turnMemory: { hasPlayed: true }, turn: null, characters: [], crew: {},
      models: { disabled: {}, invasion: {} }
    };
    P.ensure(c);
    LP.crew.ensure(c);
    R.ensure(c);
    R.addMember(c, { id: 'ava', name: 'Ava', speciesId: 'baseline-human', profile: profile({ savvy: 2 }) });
    R.addMember(c, { id: 'bren', name: 'Bren', speciesId: 'kerin', profile: profile({ savvy: 1 }) });
    R.addMember(c, { id: 'cole', name: 'Cole', speciesId: 'precursor', profile: profile() });
    c.roster.leaderId = 'ava';
    c.roster.ship = { name: 'Wanderer', rowId: null, type: '', hull: 6, hullMax: 8, debt: 0, traits: [] };
    Object.assign(c.roster.resources, { credits: 20, storyPoints: 1 });
    const { planet } = P.createPlanet(c, { name: 'Home' });
    planet.worldTraits = [];
    P.setCurrent(c, planet.id);
    return { c, planet };
  }

  /** Switch off every event but these (by id, without the pack). */
  function only(c, ...ids) {
    const keep = ids.map((id) => 'base:' + id);
    c.eventsDisabled = LP.data.basePack.events.map((e) => 'base:' + e.id).filter((id) => !keep.includes(id));
  }

  function current(c) {
    const w = T.walk(c);
    return w.current ? w.current.id : (w.finished ? 'finished' : 'pending');
  }

  const last = (c) => c.turn.records[c.turn.records.length - 1];

  /** Confirm the current stage with its defaults plus overrides. */
  function confirm(c, overrides) {
    const values = {};
    const fields = T.currentFields(c);
    for (const f of fields) if (f.type !== 'info') values[f.key] = f.value;
    Object.assign(values, overrides || {});
    for (const f of fields) if (f.showIf && !f.showIf(values)) delete values[f.key];
    const r = T.confirm(c, values);
    if (r.error) throw new Error(current(c) + ': ' + r.error);
  }

  /** Get to the stage after Upkeep: crew tasks. */
  function toTasks(c) {
    confirm(c);                          // start
    confirm(c, { mode: 'stay' });        // travel
    confirm(c);                          // upkeep
    assert(current(c) === 'crew-tasks');
  }

  function assert(ok) {
    if (!ok) throw new Error('setup went wrong');
  }

  const kinds = (ops) => ops.map((o) => o.effect + (o.key ? ':' + o.key : ''));

  /* ---------------------------------------------------------------------- */
  group('Event stages: Starship travel event');

  function toTravelEvent(c) {
    confirm(c);                                       // start
    confirm(c, { mode: 'ship', destination: 'new' }); // travel
    assert(current(c) === 'travel-event');
  }

  test('a travel event that asks something pauses the turn, answers through the engine, and Undo goes back', (assert) => {
    const { c } = world();
    only(c, 'escape-pod-wanted-criminal');
    toTravelEvent(c);
    confirm(c);
    const record = last(c);
    assert.equal(record.pending.kind, 'options');
    assert.ok(/wanted criminal/.test(record.pending.prompt));
    assert.equal(T.walk(c).current, null);
    assert.equal(T.choose(c, 'nope').error, 'Unknown choice.');
    assert.deepEqual(T.choose(c, 'turn-in'), { ok: true });
    assert.equal(record.pending, null);
    assert.ok(T.awaitingApply(record), 'its changes wait for Apply');
    assert.deepEqual(kinds(record.output.ops), ['resource:credits', 'rival.add']);
    assert.equal(T.walk(c).current, null);
    assert.deepEqual(T.context(c, c.turn.records).facts.travelGains, { rumors: 0, storyPoints: 0 });
    const credits = c.roster.resources.credits;
    assert.deepEqual(T.applyLedger(c), { ok: true });
    assert.ok(c.roster.resources.credits > credits);
    assert.equal(current(c), 'new-world');
    T.undo(c);
    assert.equal(c.roster.resources.credits, credits, 'the first Undo takes back what Apply did');
    assert.ok(T.awaitingApply(last(c)));
    T.undo(c);
    assert.equal(last(c).pending.kind, 'options', 'the next goes back to the choice');
  });

  test('a reload mid-prompt keeps the question', (assert) => {
    const { c } = world();
    only(c, 'escape-pod-wanted-criminal');
    toTravelEvent(c);
    confirm(c);
    const copy = JSON.parse(JSON.stringify(c));
    assert.equal(last(copy).pending.kind, 'options');
    assert.deepEqual(T.choose(copy, 'let-go'), { ok: true });
    assert.equal(last(copy).output.ops[0].condition.type, 'criminal-favor');
  });

  test('the departure planet’s archetype limits travel events', (assert) => {
    const { c, planet } = world();
    const quiet = A.emptyArchetype('Quiet lanes');
    quiet.events.travel = ['base:uneventful-trip'];
    c.archetypes.push(quiet);
    planet.archetypeId = quiet.id;
    for (let i = 0; i < 10; i++) {
      const state = T.eventStage.start(T.context(c, []), [{ table: 'travel' }], {});
      assert.equal(state.output.run.lines[0].rowId, 'base:uneventful-trip');
    }
  });

  test('Patrol ship rules out an Invasion for the world arrived at', (assert) => {
    const { c } = world();
    only(c, 'patrol-ship');
    high();
    toTravelEvent(c);
    confirm(c);
    T.applyLedger(c);
    assert.ok(LP.conditions.has(c, 'no-invasion-next'));
    assert.equal(T.context(c, c.turn.records).facts.travelEvent, 'patrol-ship');
  });

  /* ---------------------------------------------------------------------- */
  group('Event stages: Campaign and Character events');

  const post = { type: 'opportunity', heldField: true, won: true, casualtyIds: ['bren'], participantIds: ['ava', 'bren'] };

  function ctxFor(c, facts) {
    const ctx = T.context(c, []);
    ctx.facts = Object.assign({}, facts);
    return ctx;
  }

  test('the Campaign event stage rolls an event and lists its changes for Apply', (assert) => {
    const { c } = world();
    only(c, 'youve-made-friends-among-the-locals');
    const def = T.getStage('campaign-event');
    assert.ok(def.ledger);
    const result = def.resolve({}, ctxFor(c, { post: post }));
    assert.equal(result.output.headline, 'You’ve made friends among the locals.');
    assert.deepEqual(kinds(result.output.ops), ['resource:storyPoints']);
    assert.equal(result.pending, null);
    assert.equal(c.roster.resources.storyPoints, 1, 'nothing changed yet');
  });

  test('Campaign events know who was a casualty in the battle', (assert) => {
    const { c } = world();
    only(c, 'in-hindsight-itll-make-a-great-story');
    const result = T.getStage('campaign-event').resolve({}, ctxFor(c, { post: post }));
    assert.deepEqual(result.output.ops.map((o) => [o.effect, o.target, o.stat]), [['stat', 'bren', 'luck']]);
    const none = T.getStage('campaign-event').resolve({}, ctxFor(c, { post: Object.assign({}, post, { casualtyIds: [] }) }));
    assert.deepEqual(kinds(none.output.ops), ['resource:storyPoints']);
  });

  test('the Character event happens to a random crew member who can have one', (assert) => {
    const { c } = world();
    only(c, 'you-make-some-local-friends');
    c.roster.members = c.roster.members.filter((m) => m.id !== 'cole');
    R.addMember(c, { id: 'fay', name: 'Fay', speciesId: 'soulless', profile: profile() });
    const def = T.getStage('character-event');
    for (let i = 0; i < 20; i++) {
      const result = def.resolve({}, ctxFor(c, { post: post }));
      assert.ok(result.output.data.target !== 'Fay', 'no Character Events for Soulless');
      assert.deepEqual(kinds(result.output.ops), ['xp']);
      assert.equal(R.nameOf(R.getMember(c, result.output.ops[0].target)), result.output.data.target);
    }
  });

  test('anyone who is away is passed over for Character events', (assert) => {
    const { c } = world();
    only(c, 'you-make-some-local-friends');
    E.ledger.commit(c, LP.conditions.addOps(c, 'away', { targetId: 'ava', from: 'now' }).concat(LP.conditions.addOps(c, 'away', { targetId: 'cole', from: 'now' })));
    const def = T.getStage('character-event');
    for (let i = 0; i < 10; i++) assert.equal(def.resolve({}, ctxFor(c, { post: post })).output.data.target, 'Bren');
    assert.ok(/Bren/.test(def.fields(ctxFor(c, {}))[0].text));
  });

  test('a Precursor chooses between two Character events', (assert) => {
    const { c } = world();
    c.roster.members = c.roster.members.filter((m) => m.id === 'cole');
    only(c, 'you-make-some-local-friends', 'time-spent-exercising-is-never-wasted');
    const def = T.getStage('character-event');
    const result = def.resolve({}, ctxFor(c, { post: post }));
    assert.equal(result.pending.kind, 'alternatives');
    assert.equal(result.pending.options.length, 2);
    assert.ok(result.pending.free);
    assert.deepEqual(result.output.ops, [], 'nothing is planned until one is kept');
  });

  test('the Character event stage has nobody to roll for when the crew are all machines', (assert) => {
    const { c } = world();
    c.roster.members = [];
    R.addMember(c, { id: 'fay', name: 'Fay', speciesId: 'soulless', profile: profile() });
    const result = T.getStage('character-event').resolve({}, ctxFor(c, { post: post }));
    assert.equal(result.output.headline, 'No Character Event');
    assert.deepEqual(result.output.ops, []);
  });

  /* ---------------------------------------------------------------------- */
  group('Event stages: Trade and Explore in Crew tasks');

  test('each trader and explorer plays an event as themselves, and the ledger waits for Apply', (assert) => {
    const { c } = world();
    only(c, 'sell-some-cargo', 'found-a-trainer');
    toTasks(c);
    confirm(c, { assign: { ava: 'trade', bren: 'explore' } });
    const out = last(c).output;
    const text = JSON.stringify(out.run.lines);
    assert.ok(/Trade: Ava/.test(text) && /Explore: Bren/.test(text));
    assert.deepEqual(kinds(out.ops), ['resource:credits', 'xp']);
    assert.equal(out.ops[1].target, 'bren');
    assert.ok(T.awaitingApply(last(c)));
    T.applyLedger(c);
    assert.equal(c.roster.resources.credits, 22);
    assert.equal(R.getMember(c, 'bren').xp, 2);
    assert.equal(current(c), 'job-offers');
  });

  test('bought trade rolls, and the free trade zone’s two-result choice', (assert) => {
    const { c, planet } = world();
    planet.worldTraits = ['free-trade-zone'];
    only(c, 'sell-some-cargo', 'bits-of-scrap');
    toTasks(c);
    confirm(c, { assign: { ava: 'trade' }, extraTrades: 1 });
    const record = last(c);
    assert.equal(record.pending.kind, 'alternatives', 'the first trader keeps one of two results');
    assert.deepEqual(T.choose(c, 1), { ok: true });
    assert.equal(record.pending, null);
    assert.equal(record.output.ops.length, 2, 'the kept result, and the bought roll');
    assert.ok(/Bought Trade roll/.test(JSON.stringify(record.output.run.lines)));
  });

  test('prompts: a number, with the cost and the limit checked', (assert) => {
    const { c } = world();
    only(c, 'information-broker');
    toTasks(c);
    confirm(c, { assign: { ava: 'explore' } });
    const record = last(c);
    assert.equal(record.pending.kind, 'number');
    assert.equal(record.pending.max, 3);
    assert.ok(record.pending.free);
    assert.ok(/Choose a number/.test(T.choose(c, 9).error));
    assert.deepEqual(T.choose(c, 2), { ok: true });
    assert.deepEqual(record.output.ops.map((o) => o.amount), [-4, 2]);
  });

  test('prompts: pick several from a list', (assert) => {
    const { c } = world();
    only(c, 'ordnance');
    toTasks(c);
    confirm(c, { assign: { ava: 'trade' } });
    const record = last(c);
    assert.equal(record.pending.kind, 'pickList');
    assert.equal(record.pending.k, 3);
    assert.ok(T.choose(c, ['frakk']).error);
    T.choose(c, ['frakk', 'dazzle', 'frakk']);
    assert.deepEqual(record.output.ops.map((o) => o.item.name), ['Frakk grenade', 'Dazzle grenade', 'Frakk grenade']);
    T.applyLedger(c);
    assert.equal(R.itemsOf(c, null).filter((i) => /grenade/.test(i.name)).length, 3);
  });

  test('prompts: an offer of two items, answered by choosing one or declining', (assert) => {
    const { c } = world();
    only(c, 'alien-merchant');
    R.addItem(c, { name: 'Blade', carrierId: 'ava' });
    R.addItem(c, { name: 'Rope' });
    toTasks(c);
    confirm(c, { assign: { ava: 'explore' } });
    const record = last(c);
    assert.equal(record.pending.kind, 'offer');
    assert.equal(record.pending.options.length, 2);
    assert.ok(record.pending.allowDecline);
    T.choose(c, null);
    assert.deepEqual(record.output.ops, []);
    T.undo(c);
    const again = last(c).pending.options[0].value;
    T.choose(c, again);
    assert.equal(record.output.ops[0].effect, 'item.remove');
    assert.equal(record.output.ops[0].target, again);
  });

  test('prompts: Yes/No with a cost can’t be answered Yes without the money', (assert) => {
    const { c } = world();
    only(c, 'dont-usually-see-these-for-sale');
    c.roster.resources.credits = 1;
    toTasks(c);
    confirm(c, { assign: { ava: 'trade' } });
    const record = last(c);
    assert.ok(record.pending.options[0].disabled);
    assert.ok(/afford/.test(T.choose(c, true).error));
    assert.ok(record.pending, 'still waiting');
    assert.deepEqual(T.choose(c, false), { ok: true });
  });

  test('the event prompt comes first, then any follow-up choice, and consumed conditions stay in the ledger', (assert) => {
    const { c } = world();
    only(c, 'information-broker');
    toTasks(c);
    E.ledger.commit(c, LP.conditions.addOps(c, 'insider-info'));
    confirm(c, { assign: { ava: 'explore', bren: 'patron' } });
    const record = last(c);
    assert.equal(record.pending.kind, 'number');
    T.choose(c, 0);
    assert.equal(record.pending, null);
    assert.ok(record.output.ops.some((o) => o.effect === 'condition.remove'), 'Insider information was used on the Patron search');
  });

  /* ---------------------------------------------------------------------- */
  group('Event stages: recruits');

  test('a recruit prompt opens a character on the Characters tab; accepting adds them and what they bring', (assert) => {
    const { c } = world();
    only(c, 'quality-food-and-booze');
    toTasks(c);
    confirm(c, { assign: { ava: 'trade' } });
    const record = last(c);
    assert.equal(record.pending.kind, 'recruit');
    const character = LP.recruit.begin(c, record.pending.variant);
    assert.equal(c.characters.length, 1);
    assert.equal(LP.recruit.current(c).character.id, character.id);
    assert.equal(LP.recruit.begin(c, {}).id, character.id, 'asking again reopens the same one');
    character.name = 'Dax';
    const answer = LP.recruit.finish(c, true);
    assert.equal(answer.accepted, true);
    assert.equal(answer.member.name, 'Dax');
    assert.equal(c.characters.length, 0);
    assert.equal(c.pendingRecruit, null);
    assert.deepEqual(T.choose(c, answer), { ok: true });
    assert.equal(R.members(c).length, 3, 'not yet: they join when it is applied');
    T.applyLedger(c);
    assert.equal(R.members(c).length, 4);
    const dax = R.members(c).find((m) => m.name === 'Dax');
    assert.ok(R.itemsOf(c, dax.id).length === answer.items.length);
  });

  test('declining a recruit adds nobody', (assert) => {
    const { c } = world();
    only(c, 'quality-food-and-booze');
    toTasks(c);
    confirm(c, { assign: { ava: 'trade' } });
    LP.recruit.begin(c, last(c).pending.variant);
    const answer = LP.recruit.finish(c, false);
    assert.deepEqual(answer, { accepted: false });
    T.choose(c, answer);
    assert.deepEqual(last(c).output.ops, []);
    assert.equal(R.members(c).length, 3);
  });

  test('variants: a fixed species, no equipment and unspent XP, and base profile only', (assert) => {
    const { c } = world();
    const swift = LP.recruit.begin(c, { species: 'swift' });
    assert.equal(swift.species.value, 'swift');
    LP.recruit.cancel(c);
    assert.equal(c.characters.length, 0);
    const veteran = LP.recruit.begin(c, { equipment: false, xp: 10 });
    assert.ok(veteran.generated);
    const rolledXp = LP.character.resolve(veteran).xp;
    c.turn = { records: [{ id: 'x', pending: { kind: 'recruit' } }] };
    const answer = LP.recruit.finish(c, true);
    assert.deepEqual(answer.items, []);
    assert.equal(answer.member.xp, rolledXp + 10, 'the XP they join with, and 10 more');
    const basic = LP.recruit.begin(c, { baseProfileOnly: true, feral: true });
    assert.equal(basic.species.value, 'feral');
    assert.ok(basic.basic);
    assert.equal(LP.character.resolve(basic).origins.length, 0, 'no Background, Motivation or Class');
    assert.ok(LP.character.resolve(basic).complete);
    assert.ok(LP.recruit.describe({ baseProfileOnly: true, feral: true }).indexOf('Feral') >= 0);
  });

  test('a recruit that the turn no longer waits for is dropped', (assert) => {
    const { c } = world();
    only(c, 'quality-food-and-booze');
    toTasks(c);
    confirm(c, { assign: { ava: 'trade' } });
    LP.recruit.begin(c, last(c).pending.variant);
    T.undo(c);
    assert.equal(LP.recruit.current(c), null);
    assert.equal(c.characters.length, 0);
  });

  /* ---------------------------------------------------------------------- */
  group('Event stages: Rumors and the Quest on the roster');

  test('Rumors come from the Crew tab; a new Quest uses them up', (assert) => {
    const { c } = world();
    c.roster.resources.rumors = 3;
    const ctx = T.context(c, []);
    const def = T.getStage('rumors');
    assert.equal(def.fields(ctx).find((f) => f.key === 'rumors').value, 3);
    low();
    const result = def.resolve({ rumors: 3 }, ctx);
    assert.equal(result.output.headline, 'New Quest!');
    assert.deepEqual(result.output.ops.map((o) => o.effect + (o.key ? ':' + o.key : '')), ['condition.add', 'resource:rumors']);
    E.ledger.commit(c, result.output.ops);
    assert.equal(c.roster.resources.rumors, 0);
    assert.ok(LP.conditions.has(c, 'on-quest'));
  });

  test('Quest progress adds a Rumor on a step closer, and the finale ends the Quest and its Rumors', (assert) => {
    const { c } = world();
    E.ledger.commit(c, LP.conditions.addOps(c, 'on-quest'));
    c.roster.resources.rumors = 2;
    const def = T.getStage('quest-progress');
    const ctx = (p) => { const x = T.context(c, []); x.facts = { post: p }; return x; };
    high(); // 6 + Rumors: a step closer or better
    const step = def.resolve({}, ctx({ type: 'quest', won: true, questRumors: 0 }));
    assert.ok(step.output.ops.every((o) => o.effect === 'resource'));
    const finale = def.resolve({}, ctx({ type: 'quest-finale', won: true }));
    assert.deepEqual(finale.output.ops.map((o) => o.effect + (o.key ? ':' + o.key + ':' + o.amount : '')), ['condition.remove', 'resource:rumors:-2']);
    const failed = def.resolve({}, ctx({ type: 'quest-finale', won: false }));
    assert.deepEqual(failed.output.ops, []);
  });

  test('the Battle result Quest Rumors default to the roster’s', (assert) => {
    const { c } = world();
    c.roster.resources.rumors = 4;
    const ctx = T.context(c, []);
    ctx.facts = {};
    assert.equal(T.getStage('battle-result').fields(ctx).find((f) => f.key === 'questRumors').value, 4);
  });
})(window.LP);
