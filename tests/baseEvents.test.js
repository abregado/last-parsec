(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const P = LP.planets;
  const R = LP.roster;
  const E = LP.events;
  const C = LP.conditions;

  const PACK = LP.data.basePack;
  const EVENTS = PACK.events;
  const byId = (id) => EVENTS.find((e) => e.id === id);

  function low() { rng.setSource(() => 0); }
  function high() { rng.setSource(() => 0.999); }

  function profile(o) {
    return Object.assign({ reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 0, luck: 0 }, o);
  }

  /** Ava (Human), Bren (K'Erin), Cole (Engineer, in Sick Bay), Dax (Swift), Eli (Precursor), Fay (Soulless), with a ship, a planet and some kit. */
  function world() {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 }, characters: [], crew: {}, turnMemory: {}, turn: null,
      models: { disabled: {}, invasion: {} }, conditions: []
    };
    P.ensure(c);
    LP.crew.ensure(c);
    R.ensure(c);
    c.turnNumber = 4;
    R.addMember(c, { id: 'ava', name: 'Ava', speciesId: 'baseline-human', profile: profile({ savvy: 2, combat: 1, luck: 1 }) });
    R.addMember(c, { id: 'bren', name: 'Bren', speciesId: 'kerin', profile: profile({ savvy: 1 }) });
    R.addMember(c, { id: 'cole', name: 'Cole', speciesId: 'engineer', profile: profile({ savvy: 3 }), status: 'sick-bay', sickBayTurns: 2 });
    R.addMember(c, { id: 'dax', name: 'Dax', speciesId: 'swift', profile: profile({ savvy: 0 }) });
    R.addMember(c, { id: 'eli', name: 'Eli', speciesId: 'precursor', profile: profile({ savvy: 1 }) });
    R.addMember(c, { id: 'fay', name: 'Fay', speciesId: 'soulless', profile: profile() });
    c.roster.leaderId = 'ava';
    c.roster.ship = { name: 'Wanderer', rowId: null, type: '', hull: 6, hullMax: 8, debt: 3, traits: [] };
    Object.assign(c.roster.resources, { credits: 20, storyPoints: 2 });
    const { planet } = P.createPlanet(c, {});
    planet.worldTraits = [];
    P.setCurrent(c, planet.id);
    P.newRival(c, planet);
    P.newRival(c, planet);
    P.newPatron(c, planet);
    R.addItem(c, { name: 'Blade', table: 'Low-tech Weapon Table', rowId: 'blade', carrierId: 'ava' });
    R.addItem(c, { name: 'Handgun', table: 'Low-tech Weapon Table', rowId: 'handgun', carrierId: 'ava' });
    R.addItem(c, { name: 'Rope', table: 'Gear Table', rowId: null, carrierId: 'bren', damaged: true });
    R.addItem(c, { name: 'Rifle', table: 'Low-tech Weapon Table', rowId: 'colony-rifle' });
    return c;
  }

  const ref = (id) => ({ ref: 'member', id: id });

  /**
   * Play one event of the base pack. `answers` is a function (prompt) -> answer, or a list of answers in order.
   * Returns { state, ops, lines }.
   */
  function play(c, id, answers, options) {
    const o = options || {};
    const full = 'base:' + id;
    const event = byId(id);
    const list = Array.isArray(answers) ? answers.slice() : null;
    const answer = list ? () => list.shift() : (answers || (() => undefined));
    const env = {
      packs: [PACK], disabled: [], allowed: o.allowed || ((x) => x === full), turn: o.turn || {},
      vars: { actor: o.actor === null ? undefined : ref(o.actor || 'ava') }
    };
    let state = E.run.start(c, [{ table: event.table }], env);
    let guard = 0;
    while (state.pending && guard++ < 20) {
      const result = E.run.answer(c, state, env, answer(state.pending));
      if (result.error) throw new Error(id + ': ' + result.error);
    }
    return { state: state, ops: state.ops, lines: state.lines, done: state.done };
  }

  const kinds = (ops) => ops.map((o) => o.effect + (o.key ? ':' + o.key : ''));

  /* ---------------------------------------------------------------------- */
  group('Base events: the pack');

  test('151 events across the five tables, and the pack validates', (assert) => {
    assert.equal(EVENTS.length, 151);
    const count = (t) => EVENTS.filter((e) => e.table === t).length;
    assert.deepEqual(['travel', 'character', 'campaign', 'exploration', 'trade'].map(count), [25, 31, 28, 31, 36]);
    assert.deepEqual(E.pack.validate(PACK), []);
  });

  test('every rulebook row is still there, by title, and split rows keep their weight', (assert) => {
    const tables = {
      travel: 'Starship Travel Events Table', character: 'Character Events Table', campaign: 'Campaign Events Table',
      exploration: 'Exploration Table', trade: 'Trade Table'
    };
    for (const [key, name] of Object.entries(tables)) {
      const t = rng.getTable(name);
      const events = EVENTS.filter((e) => e.table === key);
      const titles = new Set(events.map((e) => e.title));
      for (const row of t.rows) assert.ok(titles.has(row[t.labelColumn]), name + ': ' + row[t.labelColumn]);
      const printed = t.rows.reduce((s, r) => s + r.weight, 0);
      const ours = events.reduce((s, e) => s + e.weight, 0);
      const expected = key === 'travel' ? printed - 3 : printed;
      assert.near(ours, expected, 0.1, name + ' total weight');
    }
  });

  test('split rows are one event per answer of the dice, with the weights shared', (assert) => {
    const sum = (ids) => ids.reduce((s, id) => s + byId(id).weight, 0);
    assert.near(sum(['distress-call-detonation', 'distress-call-wreckage', 'distress-call-rescue', 'distress-call-save-the-ship']), 6, 0.01);
    assert.near(sum(['escape-pod-wanted-criminal', 'escape-pod-reward', 'escape-pod-information', 'escape-pod-recruit', 'escape-pod-veteran-recruit']), 7, 0.02);
    assert.near(sum(['time-to-read-a-book-solo', 'time-to-read-a-book-pair', 'time-to-read-a-book-group']), 4, 0.01);
    assert.near(sum(['you-get-a-letter-from-home', 'you-get-a-letter-from-home-quest']), 3, 0.01);
    assert.near(sum(['worthless-trinket', 'worthless-trinket-valuable']), 2, 0.01);
    assert.near(sum(['tourist-garbage', 'tourist-garbage-valuable']), 2, 0.01);
    assert.equal(byId('asteroids').weight, 4);
  });

  test('no event starts a battle out of turn', (assert) => {
    for (const e of EVENTS) assert.ok(!/"(?:effect|table|rollGroup|call)":"[^"]*[Bb]attle/.test(JSON.stringify(e.steps)), e.id);
  });

  /* ---------------------------------------------------------------------- */
  group('Base events: every event plays');

  /** A player who answers every prompt at random. */
  function randomPlayer(c) {
    return (p) => {
      const pick = (list) => list[rng.int(list.length)];
      switch (p.kind) {
        case 'question': return rng.int(2) === 0;
        case 'yesno': return p.options[0].disabled ? false : rng.int(2) === 0;
        case 'options': return pick(p.options).value;
        case 'number': return p.min + rng.int(p.max - p.min + 1);
        case 'pickList': {
          const out = [];
          const pool = p.options.map((o) => o.value);
          for (let i = 0; i < p.k; i++) out.push(p.repeats ? pick(pool) : pool.splice(rng.int(pool.length), 1)[0]);
          return out;
        }
        case 'offer': return rng.int(4) === 0 && p.allowDecline ? null : pick(p.options).value;
        case 'recruit': return rng.int(2) === 0 ? { accepted: true, member: { id: 'new' + rng.int(1e6), name: 'Recruit', speciesId: 'baseline-human', profile: profile() } } : { accepted: false };
        case 'alternatives': return rng.int(p.alternatives.length);
        default: throw new Error('Unknown prompt ' + p.kind);
      }
    };
  }

  test('each event runs many times with random dice and answers, finishes, and its ops apply cleanly', (assert) => {
    for (const e of EVENTS) {
      for (let seed = 1; seed <= 12; seed++) {
        rng.setSource(rng.seeded(seed * 7919 + e.id.length));
        const c = world();
        let r;
        try {
          r = play(c, e.id, randomPlayer(c), { actor: ['ava', 'bren', 'dax', 'eli', 'fay'][seed % 5] });
          assert.ok(r.done, e.id + ' did not finish (seed ' + seed + ')');
          const preview = E.ledger.preview(c, r.ops);
          assert.equal(preview.length, r.ops.length);
          const scratch = LP.snapshot.scratch(c);
          E.ledger.commit(scratch, r.ops);
          JSON.parse(JSON.stringify(r.state));
        } catch (err) {
          throw new Error(e.id + ' (seed ' + seed + '): ' + err.message);
        }
      }
    }
  });

  /* ---------------------------------------------------------------------- */
  group('Base events: Starship Travel');

  test('Asteroids: the best pilot outside Sick Bay rolls three times and each miss costs hull', (assert) => {
    const c = world();
    low();
    const r = play(c, 'asteroids', null, { actor: null });
    const rolls = r.lines[0].children.filter((l) => l.type === 'roll');
    assert.equal(rolls.length, 3);
    assert.ok(rolls.every((l) => /Piloting/.test(l.label) && l.modifiers[0].value === 2), 'Ava has the best Savvy outside Sick Bay');
    assert.deepEqual(kinds(r.ops), ['hull', 'hull', 'hull']);
    high();
    assert.equal(play(c, 'asteroids', null, { actor: null }).ops.length, 0);
  });

  test('Raided: intimidation works on a 6+, and otherwise costs hull and a Rival', (assert) => {
    const c = world();
    high();
    assert.equal(play(c, 'raided', null, { actor: null }).ops.length, 0);
    low();
    assert.deepEqual(kinds(play(c, 'raided', null, { actor: null }).ops), ['hull', 'rival.add']);
  });

  test('Drive trouble: each failure adds a turn of Grounded, and they add up', (assert) => {
    const c = world();
    low();
    const r = play(c, 'drive-trouble', null, { actor: null });
    assert.equal(r.lines[0].children.filter((l) => l.type === 'roll').length, 3, 'three crew roll');
    E.ledger.commit(c, r.ops);
    const grounded = c.conditions.filter((i) => i.type === 'grounded');
    assert.equal(grounded.length, 1);
    assert.equal(grounded[0].remaining, 3);
    assert.equal(grounded[0].activeFrom, R.turnNumber(c) + 1);
  });

  test('Distress call: each answer of the dice is its own event, and "rescue" plays an Escape pod event', (assert) => {
    const c = world();
    assert.deepEqual(kinds(play(c, 'distress-call-detonation', null, { actor: null }).ops), ['hull']);
    assert.equal(play(c, 'distress-call-wreckage', null, { actor: null }).ops.length, 0);
    const env = { packs: [PACK], disabled: [], allowed: (x) => /^base:escape-pod-/.test(x), vars: {} };
    const rescue = E.run.start(c, byId('distress-call-rescue').steps, env);
    assert.ok(rescue.lines.some((l) => l.type === 'table' && /^base:escape-pod-/.test(l.rowId)), 'an Escape pod event plays');
    high();
    const saved = play(c, 'distress-call-save-the-ship', null, { actor: null });
    assert.equal(saved.ops.filter((o) => o.effect === 'item.add').length, 3, 'three Gear items');
    low();
    const failed = play(c, 'distress-call-save-the-ship', null, { actor: null });
    assert.equal(failed.lines[0].children.filter((l) => l.type === 'roll' && /Attempt/.test(l.label)).length, 3, 'three tries');
    assert.deepEqual(kinds(failed.ops), ['hull']);
  });

  test('Escape pod events: the criminal can be let go or turned in; recruits come with their variant', (assert) => {
    const c = world();
    const letGo = play(c, 'escape-pod-wanted-criminal', ['let-go'], { actor: null });
    assert.deepEqual(letGo.ops.map((o) => o.condition && o.condition.type), ['criminal-favor']);
    const turnIn = play(c, 'escape-pod-wanted-criminal', ['turn-in'], { actor: null });
    assert.deepEqual(kinds(turnIn.ops), ['resource:credits', 'rival.add']);
    const vet = play(c, 'escape-pod-veteran-recruit', [{ accepted: false }], { actor: null });
    assert.deepEqual(vet.state.lines[0].children.length, 1);
    const prompt = E.run.start(c, [{ table: 'travel' }], { packs: [PACK], disabled: [], allowed: (x) => x === 'base:escape-pod-veteran-recruit' }).pending;
    assert.deepEqual(prompt.variant, { equipment: false, xp: 10 });
  });

  test('Patrol ship takes items at random and rules out an Invasion', (assert) => {
    const c = world();
    high();
    const r = play(c, 'patrol-ship', null, { actor: null });
    assert.equal(r.ops.filter((o) => o.effect === 'item.remove').length, 4, 'every item (there are four), when it asks for more than there are');
    assert.ok(r.ops.some((o) => o.condition && o.condition.type === 'no-invasion-next'));
    low();
    const none = play(c, 'patrol-ship', null, { actor: null });
    assert.deepEqual(none.ops.map((o) => o.effect), ['condition.add']);
  });

  test('Cosmic phenomenon happens once per campaign', (assert) => {
    const c = world();
    const first = play(c, 'cosmic-phenomenon', null, { actor: null });
    assert.deepEqual(kinds(first.ops).sort(), ['condition.add', 'resource:storyPoints', 'stat'].sort(), 'a Precursor is in the crew');
    E.ledger.commit(c, first.ops);
    const again = E.run.start(c, [{ table: 'travel' }], { packs: [PACK], disabled: [], allowed: (x) => x === 'base:cosmic-phenomenon' });
    assert.ok(/No Starship Travel Events event can happen/.test(again.lines[0].text), 'it is no longer on the table');
  });

  test('Library: three new worlds join the campaign, and one must be visited', (assert) => {
    const c = world();
    const planets = c.planets.length;
    const r = play(c, 'locked-in-the-library-data-by-night', null, { actor: null });
    E.ledger.commit(c, r.ops);
    assert.equal(c.planets.length, planets + 3);
    const inst = c.conditions.find((i) => i.type === 'destinations');
    assert.equal(inst.params.planetIds.length, 3);
    assert.ok(inst.params.planetIds.every((id) => P.get(c, id)));
    assert.ok(P.current(c).id !== inst.params.planetIds[0]);
  });

  test('Time to read a book: the three events share the crew out', (assert) => {
    const c = world();
    assert.deepEqual(play(c, 'time-to-read-a-book-pair', null, { actor: null }).ops.map((o) => o.amount), [2, 1]);
    const group3 = play(c, 'time-to-read-a-book-group', null, { actor: null }).ops;
    assert.equal(new Set(group3.map((o) => o.target)).size, 3);
    assert.deepEqual(play(c, 'time-to-read-a-book-solo', null, { actor: null }).ops.map((o) => o.amount), [3]);
  });

  /* ---------------------------------------------------------------------- */
  group('Base events: Character');

  test('Letter from home: one event is just XP, the other brings a Quest, or a Rumor if you are on one', (assert) => {
    const c = world();
    assert.deepEqual(kinds(play(c, 'you-get-a-letter-from-home', null).ops), ['xp']);
    const quest = play(c, 'you-get-a-letter-from-home-quest', null);
    assert.deepEqual(quest.ops.map((o) => o.effect), ['xp', 'condition.add']);
    E.ledger.commit(c, quest.ops);
    assert.deepEqual(kinds(play(c, 'you-get-a-letter-from-home-quest', null).ops), ['xp', 'resource:rumors']);
  });

  test('Endless violence and melancholy skip K’Erin; others get a condition', (assert) => {
    const c = world();
    assert.deepEqual(play(c, 'all-this-endless-violence-is-depressing-you', null, { actor: 'bren' }).ops, []);
    const ava = play(c, 'all-this-endless-violence-is-depressing-you', null, { actor: 'ava' });
    assert.deepEqual(kinds(ava.ops), ['condition.add', 'resource:storyPoints']);
    assert.deepEqual(play(c, 'a-deep-feeling-of-melancholy-and-despair-is-afflicting-you', null, { actor: 'bren' }).ops, []);
    assert.equal(play(c, 'a-deep-feeling-of-melancholy-and-despair-is-afflicting-you', null, { actor: 'ava' }).ops[0].condition.type, 'no-xp');
  });

  test('Business elsewhere: a Swift is replaced; anyone else is away for two turns', (assert) => {
    const c = world();
    const away = play(c, 'you-have-some-business-to-attend-to-elsewhere', null, { actor: 'ava' });
    assert.equal(away.ops[0].condition.type, 'away');
    assert.equal(away.ops[0].condition.remaining, 2);
    const swift = E.run.start(c, [{ table: 'character' }], { packs: [PACK], disabled: [], allowed: (x) => x === 'base:you-have-some-business-to-attend-to-elsewhere', vars: { actor: ref('dax') } });
    assert.equal(swift.pending.kind, 'recruit');
    assert.deepEqual(swift.pending.variant, { species: 'swift' });
    assert.deepEqual(swift.ops.map((o) => o.effect), ['member.remove']);
  });

  test('Scrap: the lower roll goes to Sick Bay, a draw sends both, and a K’Erin is the preferred opponent', (assert) => {
    const c = world();
    low();
    const draw = play(c, 'you-get-in-a-scrap-with-another-crew-member', null, { actor: 'ava' });
    assert.ok(draw.ops.every((o) => o.effect === 'sickBay'));
    assert.ok(draw.ops.length >= 1);
    for (let i = 0; i < 10; i++) {
      const r = play(c, 'you-get-in-a-scrap-with-another-crew-member', null, { actor: 'ava' });
      assert.ok(/Bren/.test(JSON.stringify(r.lines)), 'the K’Erin must be fought');
    }
    const solo = world();
    solo.roster.members = solo.roster.members.filter((m) => m.id === 'ava');
    const none = E.run.start(solo, [{ table: 'character' }], { packs: [PACK], disabled: [], allowed: (x) => x === 'base:you-get-in-a-scrap-with-another-crew-member', vars: { actor: ref('ava') } });
    assert.ok(/No Character Events event can happen/.test(none.lines[0].text), 'needs someone to fight');
  });

  test('Not the same person: a new motivation pays XP; the same one gives a story point', (assert) => {
    const c = world();
    const ava = R.getMember(c, 'ava');
    ava.origins = [{ label: 'Motivation', value: 'Wealth', table: 'Motivation Table', row: 'wealth' }];
    low();
    const same = play(c, 'you-are-not-sure-you-are-really-the-same-person-any-longer', null, { actor: 'ava' });
    assert.deepEqual(kinds(same.ops), ['resource:storyPoints'], 'the first row is Wealth');
    high();
    const other = play(c, 'you-are-not-sure-you-are-really-the-same-person-any-longer', null, { actor: 'ava' });
    assert.equal(other.ops[0].effect, 'motivation.set');
    E.ledger.commit(c, other.ops);
    assert.deepEqual(E.props(c, ref('ava')).motivations, [other.ops[0].row]);
  });

  test('True love pays XP only to those who were Romantic', (assert) => {
    const c = world();
    R.getMember(c, 'ava').origins = [{ label: 'Motivation', value: 'Romance', table: 'Motivation Table', row: 'romance' }];
    assert.deepEqual(kinds(play(c, 'you-have-finally-found-true-love-in-this-bleak-universe', null, { actor: 'ava' }).ops), ['resource:storyPoints', 'xp']);
    assert.deepEqual(kinds(play(c, 'you-have-finally-found-true-love-in-this-bleak-universe', null, { actor: 'bren' }).ops), ['resource:storyPoints']);
  });

  test('Breakthrough raises an ability that has never been raised; with none left, +1 XP instead', (assert) => {
    const c = world();
    const r = play(c, 'youve-made-a-real-personal-breakthrough', null, { actor: 'ava' });
    assert.equal(r.ops[0].effect, 'stat');
    assert.equal(r.ops[0].amount, 1);
    for (const m of c.roster.members) for (const s of ['reactions', 'speed', 'combat', 'toughness', 'savvy']) m.profile[s] += 1;
    const none = play(c, 'youve-made-a-real-personal-breakthrough', null, { actor: 'ava' });
    assert.deepEqual(kinds(none.ops), ['xp'], 'the event’s fallback');
  });

  test('Where did it go: a carried item is held by a condition, and with nothing carried it is +1 XP', (assert) => {
    const c = world();
    const r = play(c, 'where-did-it-go', null, { actor: 'ava' });
    assert.deepEqual(r.ops.map((o) => o.effect), ['item.remove', 'condition.add']);
    assert.equal(r.ops[1].condition.type, 'missing-item');
    assert.equal(r.ops[1].condition.params.item.carrierId, 'ava');
    assert.deepEqual(kinds(play(c, 'where-did-it-go', null, { actor: 'eli' }).ops), ['xp']);
  });

  test('Hard work: an Engineer does both, anyone else chooses', (assert) => {
    const c = world();
    const eng = play(c, 'youve-put-in-a-lot-of-hard-work-around-here', null, { actor: 'cole' });
    assert.ok(eng.ops.some((o) => o.effect === 'hull'));
    const choice = E.run.start(c, [{ table: 'character' }], { packs: [PACK], disabled: [], allowed: (x) => x === 'base:youve-put-in-a-lot-of-hard-work-around-here', vars: { actor: ref('ava') } });
    assert.deepEqual(choice.pending.options.map((o) => o.value), ['hull', 'item']);
  });

  test('Injury-related events: hurt on the ship, a feeling of being great, and a heart to heart', (assert) => {
    const c = world();
    assert.deepEqual(kinds(play(c, 'you-get-hurt-while-working-on-the-ship', null, { actor: 'ava' }).ops), ['sickBay', 'hull']);
    assert.equal(play(c, 'you-feel-great', null, { actor: 'ava' }).ops[0].condition.type, 'injury-ignore');
    assert.equal(play(c, 'you-feel-great', null, { actor: 'cole' }).ops.length, 0);
    const talk = play(c, 'have-a-heart-to-heart-talk-with-a-crew-member', null, { actor: 'ava' });
    assert.deepEqual(talk.ops.map((o) => o.effect), ['xp', 'xp']);
    assert.ok(talk.ops[0].target !== talk.ops[1].target);
  });

  /* ---------------------------------------------------------------------- */
  group('Base events: Campaign');

  test('Life support: paid at once, or the ship is grounded until it is', (assert) => {
    const c = world();
    const paid = play(c, 'the-life-support-system-on-the-ship-needs-upgrading-badly', null, { actor: null });
    assert.deepEqual(kinds(paid.ops), ['resource:credits']);
    c.roster.resources.credits = 0;
    high();
    const owed = play(c, 'the-life-support-system-on-the-ship-needs-upgrading-badly', null, { actor: null });
    assert.equal(owed.ops[0].condition.type, 'life-support');
    assert.equal(owed.ops[0].condition.params.cost, 5, 'an Engineer in the crew takes 1 off the 6');
  });

  test('Tax man: pay the higher die, or be impounded', (assert) => {
    const c = world();
    high();
    assert.deepEqual(play(c, 'the-tax-man-is-taking-an-interest-in-your-business-conduct', null, { actor: null }).ops.map((o) => o.amount), [-6]);
    c.roster.resources.credits = 2;
    const poor = play(c, 'the-tax-man-is-taking-an-interest-in-your-business-conduct', null, { actor: null });
    assert.equal(poor.ops[0].condition.type, 'impounded');
    assert.equal(poor.ops[0].condition.params.cost, 6);
  });

  test('Old nemesis brings back a set-aside Rival, or makes a new one, and they follow you', (assert) => {
    const c = world();
    const planet = P.current(c);
    const fresh = play(c, 'an-old-nemesis-has-tracked-you-down', null, { actor: null });
    assert.deepEqual(fresh.ops.map((o) => o.effect), ['rival.add', 'condition.add']);
    P.disableRival(planet, planet.rivals[0].id, { turn: 1, reason: 'test' });
    const back = play(c, 'an-old-nemesis-has-tracked-you-down', null, { actor: null });
    assert.deepEqual(back.ops.map((o) => o.effect), ['rival.enable', 'condition.add']);
    E.ledger.commit(c, back.ops);
    assert.equal(planet.disabledRivals.length, 0);
    assert.equal(c.conditions[0].type, 'follows');
    assert.equal(c.conditions[0].scope, 'rival');
  });

  test('Settling old business sets a Rival aside; with none it is XP for the captain', (assert) => {
    const c = world();
    const r = play(c, 'youve-managed-to-settle-some-old-business', (p) => p.options[0].value, { actor: null });
    assert.deepEqual(r.ops.map((o) => o.effect), ['rival.disable']);
    const planet = P.current(c);
    planet.rivals = [];
    const captain = play(c, 'youve-managed-to-settle-some-old-business', null, { actor: null });
    assert.deepEqual(captain.ops.map((o) => [o.effect, o.target]), [['xp', 'ava']]);
  });

  test('Bad reputation sets a Patron aside', (assert) => {
    const c = world();
    const r = play(c, 'youve-earned-a-bit-of-a-bad-reputation', null, { actor: null });
    assert.deepEqual(r.ops.map((o) => o.effect), ['patron.disable']);
    E.ledger.commit(c, r.ops);
    assert.equal(P.current(c).disabledPatrons.length, 1);
  });

  test('New captain: someone else leads, with 3 XP, and a 1 sends the old captain away with their kit', (assert) => {
    const c = world();
    high();
    const stay = play(c, 'the-crew-has-decided-its-time-for-a-new-person-to-be-in-charge', null, { actor: null });
    assert.deepEqual(kinds(stay.ops), ['leader.set', 'xp']);
    assert.ok(stay.ops[0].target !== 'ava');
    assert.equal(stay.ops[1].amount, 3);
    assert.equal(stay.ops[0].target, 'bren', 'a K’Erin is preferred');
    low();
    const leaves = play(c, 'the-crew-has-decided-its-time-for-a-new-person-to-be-in-charge', null, { actor: null });
    assert.deepEqual(kinds(leaves.ops), ['leader.set', 'xp', 'item.remove', 'item.remove', 'member.remove']);
  });

  test('Arms dealer contact: three weapons from the list', (assert) => {
    const c = world();
    const r = play(c, 'you-meet-up-with-an-old-arms-dealer-contact-who-owes-you-a-deal', [['hand-cannon', 'shotgun', 'shotgun']], { actor: null });
    assert.deepEqual(r.ops.map((o) => o.item.name), ['Hand Cannon', 'Shotgun', 'Shotgun']);
    assert.ok(r.ops.every((o) => o.item.rowId && o.item.table));
  });

  test('Time on your hands: two crew each explore, as themselves', (assert) => {
    const c = world();
    const pack = { format: PACK.format, version: 1, pack: { id: 'x', name: 'x' }, conditions: [], fragments: [], events: [
      { id: 'train', table: 'exploration', weight: 1, title: 'Train', text: '', steps: [{ effect: 'xp', target: '$actor', amount: 1 }] }
    ].concat(EVENTS.filter((e) => e.id === 'a-bit-of-time-on-your-hands').map((e) => Object.assign({}, e, { id: 'hands' }))) };
    const env = { packs: [pack], disabled: [], allowed: (id) => id === 'x:train' || id === 'x:hands', vars: {} };
    const state = E.run.start(c, [{ table: 'campaign' }], env);
    assert.equal(state.ops.length, 2);
    assert.equal(new Set(state.ops.map((o) => o.target)).size, 2);
    assert.ok(state.vars.actor === undefined || state.vars.actor === null, '$actor is put back');
  });

  /* ---------------------------------------------------------------------- */
  group('Base events: Exploration and Trade');

  test('Possible bargain: give up one of two weapons for a Loot roll on a 6, or a credit', (assert) => {
    const c = world();
    const first = E.run.start(c, [{ table: 'exploration' }], { packs: [PACK], disabled: [], allowed: (x) => x === 'base:possible-bargain', vars: { actor: ref('ava') } });
    assert.equal(first.pending.options.length, 2);
    assert.ok(first.pending.options.every((o) => /Blade|Handgun/.test(o.label)), 'only weapons Ava carries');
    high();
    const win = play(c, 'possible-bargain', (p) => p.options[0].value, { actor: 'ava' });
    assert.equal(win.ops[0].effect, 'item.remove');
    assert.ok(win.ops.length >= 2, 'a Loot Table result follows');
    low();
    assert.deepEqual(kinds(play(c, 'possible-bargain', (p) => p.options[0].value, { actor: 'ava' }).ops), ['item.remove', 'resource:credits']);
    assert.equal(play(c, 'possible-bargain', () => null, { actor: 'ava' }).ops.length, 0);
  });

  test('Information broker and Arms dealer sell by the number, within what the crew can pay', (assert) => {
    const c = world();
    const r = play(c, 'information-broker', [3], { actor: 'ava' });
    assert.deepEqual(kinds(r.ops), ['resource:credits', 'resource:rumors']);
    assert.equal(r.ops[0].amount, -6);
    const arms = play(c, 'arms-dealer', [2], { actor: 'ava' });
    assert.equal(arms.ops[0].amount, -6);
    assert.equal(arms.ops.filter((o) => o.effect === 'item.add').length, 2);
    c.roster.resources.credits = 5;
    const prompt = E.run.start(c, [{ table: 'exploration' }], { packs: [PACK], disabled: [], allowed: (x) => x === 'base:arms-dealer', vars: { actor: ref('ava') } }).pending;
    assert.equal(prompt.max, 1, 'only one at 3 credits');
  });

  test('Useful contact adds a bonus to the roll chosen', (assert) => {
    const c = world();
    const r = play(c, 'you-make-a-useful-contact', ['patron'], { actor: 'ava' });
    assert.deepEqual(r.ops[0].condition.params, { roll: 'patron' });
    assert.equal(r.ops[0].condition.activeFrom, R.turnNumber(c) + 1);
  });

  test('Got yourself noticed forces a fight with a Rival, or nothing without one', (assert) => {
    const c = world();
    const r = play(c, 'got-yourself-noticed', null, { actor: 'ava' });
    assert.equal(r.ops[0].condition.type, 'forced-rival');
    assert.ok(P.current(c).rivals.some((x) => x.id === r.ops[0].condition.params.rivalId));
    P.current(c).rivals = [];
    assert.equal(play(c, 'got-yourself-noticed', null, { actor: 'ava' }).ops.length, 0);
  });

  test('Gambling takes an item from the character or the Stash, not Soulless', (assert) => {
    const c = world();
    for (let i = 0; i < 20; i++) {
      const op = play(c, 'i-dont-have-a-gambling-problem', null, { actor: 'ava' }).ops[0];
      const item = c.roster.items.find((x) => x.id === op.target);
      assert.ok(!item.carrierId || item.carrierId === 'ava');
    }
    assert.equal(play(c, 'i-dont-have-a-gambling-problem', null, { actor: 'fay' }).ops.length, 0);
  });

  test('Luxury trinket: a Swift keeps it; anyone else keeps it as a gift or sells it for a choice of two Trade rolls', (assert) => {
    const c = world();
    assert.deepEqual(kinds(play(c, 'luxury-trinket', null, { actor: 'dax' }).ops), ['xp']);
    const keep = play(c, 'luxury-trinket', ['keep'], { actor: 'ava' });
    assert.equal(keep.ops[0].condition.type, 'recruit-gift');
    const env = { packs: [PACK], disabled: [], allowed: (x) => x === 'base:bits-of-scrap' || x === 'base:sell-some-cargo', vars: { actor: ref('ava') } };
    const sell = E.run.start(c, byId('luxury-trinket').steps, env);
    E.run.answer(c, sell, env, 'sell');
    assert.equal(sell.pending.kind, 'alternatives');
    assert.equal(sell.pending.options.length, 2);
  });

  test('Contraband: accept for credits, with trouble on a 4+', (assert) => {
    const c = world();
    high();
    const trouble = play(c, 'contraband', [true], { actor: 'ava' });
    assert.deepEqual(kinds(trouble.ops), ['resource:credits', 'rival.add']);
    low();
    assert.deepEqual(kinds(play(c, 'contraband', [true], { actor: 'ava' }).ops), ['resource:credits']);
    assert.equal(play(c, 'contraband', [false], { actor: 'ava' }).ops.length, 0);
  });

  test('Ordnance is three single grenades, and medical reserves two of each', (assert) => {
    const c = world();
    const r = play(c, 'ordnance', [['frakk', 'dazzle', 'frakk']], { actor: 'ava' });
    assert.deepEqual(r.ops.map((o) => o.item.name), ['Frakk grenade', 'Dazzle grenade', 'Frakk grenade']);
    const med = play(c, 'medical-reserves', null, { actor: 'ava' });
    assert.deepEqual(med.ops.map((o) => o.item.name).sort(), ['Med-patch', 'Med-patch', 'Stim-pack', 'Stim-pack']);
  });

  test('Unloading stuff sells undamaged weapons at random', (assert) => {
    const c = world();
    const r = play(c, 'a-chance-to-unload-some-stuff', [2], { actor: 'ava' });
    assert.equal(r.ops.filter((o) => o.effect === 'item.remove').length, 2);
    assert.equal(r.ops.filter((o) => o.effect === 'resource').reduce((s, o) => s + o.amount, 0), 4);
    const all = play(c, 'a-chance-to-unload-some-stuff', [6], { actor: 'ava' });
    assert.equal(all.ops.filter((o) => o.effect === 'item.remove').length, 3, 'only three undamaged weapons');
  });

  test('Trinkets: junk, or worth a story point', (assert) => {
    const c = world();
    assert.equal(play(c, 'worthless-trinket', null).ops.length, 0);
    assert.deepEqual(kinds(play(c, 'worthless-trinket-valuable', null).ops), ['resource:storyPoints']);
    assert.deepEqual(kinds(play(c, 'tourist-garbage-valuable', null).ops), ['resource:storyPoints']);
  });

  test('Single-use items become conditions, and money-like finds go to resources', (assert) => {
    const c = world();
    for (const [id, type] of [['basic-supplies', 'supplies'], ['military-fuel-cell', 'fuel-cell'], ['insider-information', 'insider-info'], ['local-maps', 'local-maps'], ['trade-goods', 'trade-goods'], ['spare-parts', 'spare-parts']]) {
      assert.equal(play(c, id, null).ops[0].condition.type, type, id);
    }
    assert.equal(play(c, 'fuel', null).ops[0].key, 'fuel');
    assert.equal(play(c, 'starship-repair-parts', null).ops[0].key, 'shipParts');
  });

  /* ---------------------------------------------------------------------- */
  group('Injury rolls');

  function injury(row, who, setup) {
    const c = world();
    if (setup) setup(c);
    const state = E.run.start(c, [{ effect: 'injuryRoll', target: '$a', row: row }], { packs: [], disabled: [], vars: { a: ref(who || 'ava') } });
    return { c, state, ops: state.ops };
  }

  test('minor injuries and a serious injury put the character in Sick Bay for the time the table gives', (assert) => {
    assert.deepEqual(injury('minor-injuries').ops.map((o) => [o.effect, o.turns]), [['sickBay', 1]]);
    high();
    assert.equal(injury('serious-injury').ops[0].turns, 4);
    assert.equal(injury('knocked-out').ops.length, 0);
  });

  test('death removes the character, flagged; Luck saves them and is lost', (assert) => {
    const dead = injury('death-or-permanent-injury', 'bren');
    assert.deepEqual(dead.ops.map((o) => o.effect), ['member.remove']);
    assert.ok(E.ledger.preview(dead.c, dead.ops)[0].destructive);
    const saved = injury('death-or-permanent-injury', 'ava');
    assert.deepEqual(saved.ops.map((o) => [o.effect, o.stat, o.amount]), [['stat', 'luck', -1]]);
    const gruesome = injury('gruesome-fate', 'bren');
    assert.deepEqual(gruesome.ops.map((o) => o.effect), ['item.damage', 'member.remove']);
  });

  test('equipment loss, a miraculous escape and hard knocks', (assert) => {
    assert.deepEqual(injury('equipment-loss').ops.map((o) => o.effect), ['item.damage']);
    const escape = injury('miraculous-escape', 'ava');
    assert.deepEqual(escape.ops.map((o) => o.effect), ['stat', 'item.remove', 'item.remove']);
    assert.deepEqual(injury('school-of-hard-knocks').ops.map((o) => [o.effect, o.amount]), [['xp', 1]]);
    const crippling = injury('crippling-wound');
    assert.equal(crippling.ops[0].effect, 'sickBay');
    assert.ok(crippling.state.lines.some((l) => l.manual), 'the surgery is left to the player');
  });

  test('a Bot or Soulless uses the Bot Injury Table', (assert) => {
    const r = injury('severe-damage', 'fay');
    assert.equal(r.state.lines[0].table, 'Bot Injury Table');
    assert.equal(r.ops[0].effect, 'sickBay');
    assert.deepEqual(injury('destroyed', 'fay').ops.map((o) => o.effect), ['member.remove']);
  });

  test('a random injury roll finishes and applies', (assert) => {
    for (let seed = 1; seed < 40; seed++) {
      rng.setSource(rng.seeded(seed));
      const r = injury(null, ['ava', 'bren', 'fay'][seed % 3]);
      E.ledger.commit(r.c, r.ops);
    }
    assert.ok(true);
  });

  /* ---------------------------------------------------------------------- */
  group('Item rows that give several items');

  test('a pack of grenades is three single grenades', (assert) => {
    assert.deepEqual(LP.items.expandRow('Grenades Subtable', '3-frakk-grenades'), ['Frakk grenade', 'Frakk grenade', 'Frakk grenade']);
    assert.deepEqual(LP.items.expandRow('Grenades Subtable', '3-dazzle-grenades'), ['Dazzle grenade', 'Dazzle grenade', 'Dazzle grenade']);
    assert.deepEqual(LP.items.expandRow('Low-tech Weapon Table', 'blade'), ['Blade']);
    assert.equal(LP.items.makeAll({ table: 'Grenades Subtable', rowId: '3-frakk-grenades' }).length, 3);
  });

  test('a Loot roll that lands on grenades gives three items; a result card line adds three too', (assert) => {
    const c = world();
    const r = E.run.start(c, [{ effect: 'item.add', table: 'Grenades Subtable', row: '3-dazzle-grenades' }], { packs: [], disabled: [] });
    assert.equal(r.ops.length, 3);
    assert.ok(r.ops.every((o) => o.item.name === 'Dazzle grenade'));
    const line = { type: 'table', table: 'Grenades Subtable', rowId: '3-frakk-grenades', itemKey: 'x' };
    const before = c.roster.items.length;
    R.addFromLine(c, 'tag', line);
    assert.equal(c.roster.items.length, before + 3);
  });

  test('pack validation checks item names and tables', (assert) => {
    const good = E.run.validateSteps([{ effect: 'item.add', table: 'Low-tech Weapon Table', name: 'Handgun' }, { effect: 'item.add', name: 'Frakk grenade' }], 'steps', {});
    assert.deepEqual(good, []);
    assert.equal(E.run.validateSteps([{ effect: 'item.add', table: 'Low-tech Weapon Table', name: 'Death Ray' }], 'steps', {}).length, 1);
    assert.equal(E.run.validateSteps([{ effect: 'item.add', table: 'Nope Table', name: 'X' }], 'steps', {}).length, 1);
    assert.equal(E.run.validateSteps([{ effect: 'item.add' }], 'steps', {}).length, 1);
  });
})(window.LP);
