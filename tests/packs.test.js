(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const P = LP.planets;
  const R = LP.roster;
  const E = LP.events;
  const K = E.packs;
  const A = LP.archetypes;

  function campaign() {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 }, characters: [], crew: {}, turnMemory: {}, turn: null,
      models: { disabled: {}, invasion: {} }, conditions: []
    };
    P.ensure(c);
    LP.crew.ensure(c);
    R.ensure(c);
    return c;
  }

  function withCrew(c) {
    R.addMember(c, { id: 'ava', name: 'Ava', speciesId: 'baseline-human', profile: { reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 2, luck: 0 } });
    return c;
  }

  const defaultArchetype = (c) => c.archetypes[0];

  /* ---------------------------------------------------------------------- */
  group('Event packs: packs');

  test('the base pack is locked; a campaign makes packs of its own with fixed ids', (assert) => {
    const c = campaign();
    assert.ok(K.isLocked(c, 'base'));
    const pack = K.createPack(c, 'Pirate Tales', { author: 'Me' });
    assert.equal(pack.pack.id, 'pirate-tales');
    assert.ok(!K.isLocked(c, 'pirate-tales'));
    const twin = K.createPack(c, 'Pirate Tales');
    assert.equal(twin.pack.id, 'pirate-tales-2');
    assert.ok(K.updatePack(c, 'pirate-tales', { name: 'Better name', version: '2' }));
    assert.equal(pack.pack.id, 'pirate-tales', 'the id stays');
    assert.equal(pack.pack.name, 'Better name');
    assert.ok(!K.updatePack(c, 'base', { name: 'Hacked' }), 'the base pack can’t change');
    assert.equal(K.createPack(c, 'Base').pack.id, 'base-2', 'nothing takes the base pack’s id');
  });

  test('deleting a pack removes its events from the disabled and archetype lists', (assert) => {
    const c = campaign();
    const pack = K.createPack(c, 'Temp');
    const id = K.addEvent(c, 'temp', 'trade', 'Windfall');
    K.setEnabled(c, id, false);
    assert.ok(defaultArchetype(c).events.trade.includes(id));
    assert.ok(K.deletePack(c, 'temp'));
    assert.ok(!defaultArchetype(c).events.trade.includes(id));
    assert.deepEqual(c.eventsDisabled, []);
    assert.equal(K.find(c, id), null);
    assert.ok(!K.deletePack(c, 'base'));
    assert.ok(pack);
  });

  /* ---------------------------------------------------------------------- */
  group('Event packs: events');

  test('new events start empty, have a fixed id from their title, and join All options', (assert) => {
    const c = campaign();
    K.createPack(c, 'Mine');
    const id = K.addEvent(c, 'mine', 'exploration', 'A Strange Door!');
    assert.equal(id, 'mine:a-strange-door');
    assert.equal(K.addEvent(c, 'mine', 'exploration', 'A Strange Door!'), 'mine:a-strange-door-2');
    const found = K.find(c, id);
    assert.equal(found.event.table, 'exploration');
    assert.deepEqual(found.event.steps, []);
    assert.ok(!found.locked);
    assert.ok(defaultArchetype(c).events.exploration.includes(id));
    assert.deepEqual(K.eventProblems(c, id), []);
    found.event.steps = [{ effect: 'teleport' }];
    assert.equal(K.eventProblems(c, id).length, 1);
    assert.equal(K.addEvent(c, 'base', 'trade', 'No'), null);
  });

  test('a locked event can be duplicated into an editable copy; the original is untouched', (assert) => {
    const c = campaign();
    const copyId = K.duplicateEvent(c, 'base:asteroids');
    assert.equal(copyId, 'my-events:asteroids');
    const copy = K.find(c, copyId);
    const original = K.find(c, 'base:asteroids');
    assert.ok(!copy.locked && original.locked);
    assert.equal(copy.event.title, original.event.title);
    copy.event.weight = 9;
    copy.event.steps.push({ say: 'Extra.' });
    assert.equal(original.event.weight, 4);
    assert.ok(original.event.steps.length < copy.event.steps.length);
    assert.equal(K.duplicateEvent(c, copyId), 'my-events:asteroids-2', 'a copy of a copy gets its own id');
    assert.ok(defaultArchetype(c).events.travel.includes(copyId));
    assert.equal(K.duplicateEvent(c, 'base:nope'), null);
  });

  test('replace the original: it is switched off and the copy is in play', (assert) => {
    const c = campaign();
    const copy = K.replaceOriginal(c, 'base:asteroids');
    assert.ok(K.isDisabled(c, 'base:asteroids'));
    assert.ok(!K.isDisabled(c, copy));
    const env = E.pack.env(c, {});
    assert.ok(env.disabled.includes('base:asteroids'));
    for (let i = 0; i < 30; i++) {
      const state = E.run.start(withCrew(c), [{ table: 'travel' }], Object.assign(env, { vars: {} }));
      assert.ok(state.lines[0].rowId !== 'base:asteroids');
    }
    K.setEnabled(c, 'base:asteroids', true);
    assert.ok(!K.isDisabled(c, 'base:asteroids'));
  });

  test('deleting an editable event cleans every list; locked events can’t be deleted', (assert) => {
    const c = campaign();
    const copy = K.duplicateEvent(c, 'base:fuel');
    K.setEnabled(c, copy, false);
    assert.ok(K.deleteEvent(c, copy));
    assert.ok(!defaultArchetype(c).events.trade.includes(copy));
    assert.deepEqual(c.eventsDisabled, []);
    assert.ok(!K.deleteEvent(c, 'base:fuel'));
  });

  test('moving an event between packs keeps the lists pointing at it', (assert) => {
    const c = campaign();
    K.createPack(c, 'Other');
    const id = K.duplicateEvent(c, 'base:fuel');
    K.setEnabled(c, id, false);
    const moved = K.moveEvent(c, id, 'other');
    assert.equal(moved, 'other:fuel');
    assert.equal(K.find(c, id), null);
    assert.ok(K.isDisabled(c, moved));
    assert.ok(defaultArchetype(c).events.trade.includes(moved));
    assert.equal(K.moveEvent(c, 'base:fuel', 'other'), null, 'locked events stay put');
  });

  test('a broken event of the campaign’s own is left out of rolls instead of breaking them', (assert) => {
    const c = withCrew(campaign());
    K.createPack(c, 'Mine');
    const id = K.addEvent(c, 'mine', 'trade', 'Broken');
    K.find(c, id).event.steps = [{ effect: 'teleport' }];
    const env = E.pack.env(c, {});
    assert.ok(env.disabled.includes(id));
    for (let i = 0; i < 20; i++) {
      assert.ok(E.run.start(c, [{ table: 'trade' }], Object.assign(env, { vars: { actor: { ref: 'member', id: 'ava' } } })).done !== undefined);
    }
  });

  test('condition types and fragments can be added to and removed from a pack', (assert) => {
    const c = campaign();
    K.createPack(c, 'Mine');
    const type = K.addConditionType(c, 'mine', 'Haunted');
    assert.equal(type.id, 'haunted');
    assert.equal(LP.conditions.typeOf(c, 'haunted').name, 'Haunted');
    assert.deepEqual(LP.conditions.validateType(type), []);
    assert.ok(K.deleteConditionType(c, 'mine', 'haunted'));
    assert.equal(LP.conditions.typeOf(c, 'haunted'), null);
    const fragment = K.addFragment(c, 'mine', 'Bump');
    assert.equal(fragment.id, 'bump');
    assert.ok(K.deleteFragment(c, 'mine', 'bump'));
    assert.ok(!K.addConditionType(c, 'base', 'Nope'));
  });

  /* ---------------------------------------------------------------------- */
  group('Event packs: export and import');

  test('what an event refers to: condition types and fragments', (assert) => {
    const found = K.uses(LP.data.basePack.events.find((e) => e.id === 'drive-trouble'));
    assert.deepEqual(Array.from(found.conditions), ['grounded']);
    const detonation = K.uses(LP.data.basePack.events.find((e) => e.id === 'distress-call-detonation'));
    assert.deepEqual(Array.from(detonation.fragments), ['detonation']);
    const veteran = K.uses(LP.data.basePack.events.find((e) => e.id === 'cosmic-phenomenon'));
    assert.ok(veteran.conditions.has('cosmic-seen'), 'including in a requirement');
  });

  test('exporting chosen events takes the condition types and fragments they use', (assert) => {
    const c = campaign();
    const pack = K.exportEvents(c, ['base:drive-trouble', 'base:distress-call-detonation'], 'Two events');
    assert.equal(pack.pack.id, 'two-events');
    assert.deepEqual(pack.events.map((e) => e.id), ['drive-trouble', 'distress-call-detonation']);
    assert.deepEqual(pack.conditions.map((t) => t.id), ['grounded']);
    assert.deepEqual(pack.fragments.map((f) => f.id), ['detonation']);
    assert.deepEqual(E.pack.validate(pack), []);
  });

  test('a pack survives export and import into another campaign, and joins All options', (assert) => {
    const a = campaign();
    K.createPack(a, 'Pirate Tales', { author: 'Me', description: 'Arr' });
    const id = K.addEvent(a, 'pirate-tales', 'travel', 'Parrot Attack');
    K.find(a, id).event.steps = [{ effect: 'resource', key: 'credits', amount: -1 }, { say: 'Squawk!' }];
    K.addConditionType(a, 'pirate-tales', 'Seasick');
    const text = JSON.stringify(K.exportPack(a, 'pirate-tales'));
    const b = campaign();
    const result = K.importText(b, text);
    assert.equal(result.renamedFrom, null);
    assert.equal(result.pack.pack.name, 'Pirate Tales');
    assert.equal(result.pack.pack.author, 'Me');
    assert.deepEqual(K.find(b, 'pirate-tales:parrot-attack').event.steps, K.find(a, id).event.steps);
    assert.ok(defaultArchetype(b).events.travel.includes('pirate-tales:parrot-attack'));
    assert.equal(LP.conditions.typeOf(b, 'seasick').name, 'Seasick');
    assert.ok(!K.isLocked(b, 'pirate-tales'), 'an imported pack is editable');
  });

  test('importing a pack whose id is taken renames it; nothing is merged or overwritten', (assert) => {
    const a = campaign();
    K.createPack(a, 'Pirate Tales');
    K.addEvent(a, 'pirate-tales', 'trade', 'Loot');
    const text = JSON.stringify(K.exportPack(a, 'pirate-tales'));
    const preview = K.previewImport(a, text);
    assert.deepEqual(preview.problems, []);
    assert.equal(preview.renamedFrom, 'pirate-tales');
    assert.equal(a.eventPacks.length, 1, 'a preview changes nothing');
    const result = K.importText(a, text);
    assert.equal(result.pack.pack.id, 'pirate-tales-2');
    assert.equal(a.eventPacks.length, 2);
    assert.ok(K.find(a, 'pirate-tales-2:loot'));
    const baseCopy = JSON.stringify(Object.assign({}, LP.data.basePack, { pack: { id: 'base', name: 'Mine' } }));
    assert.equal(K.importText(a, baseCopy).pack.pack.id, 'base-2', 'a pack can’t take the base pack’s id');
  });

  test('bad files say what is wrong and add nothing', (assert) => {
    const c = campaign();
    assert.ok(/valid JSON/.test(K.previewImport(c, '{nope').problems[0]));
    assert.ok(/not a Last Parsec event pack/.test(K.previewImport(c, '{"a":1}').problems[0]));
    const pack = K.exportEvents(c, ['base:fuel'], 'x');
    pack.events[0].steps = [{ effect: 'teleport' }];
    const preview = K.previewImport(c, JSON.stringify(pack));
    assert.ok(preview.problems.length >= 1);
    assert.throws(() => K.importText(c, JSON.stringify(pack)));
    assert.deepEqual(c.eventPacks || [], [], 'nothing was added');
  });

  /* ---------------------------------------------------------------------- */
  group('Event packs: trying an event out');

  test('a test roll plays one event against a copy, without changing the campaign', (assert) => {
    const c = withCrew(campaign());
    c.roster.resources.credits = 10;
    const state = K.testStart(c, 'base:sell-some-cargo', 'ava');
    assert.ok(state.done);
    assert.equal(state.ops[0].amount, 2);
    assert.equal(c.roster.resources.credits, 10);
    assert.equal(E.ledger.preview(c, state.ops)[0].text.indexOf('Credits 10 → 12') === 0, true);
  });

  test('a test roll can be answered like the real thing', (assert) => {
    const c = withCrew(campaign());
    const state = K.testStart(c, 'base:information-broker', 'ava');
    assert.equal(E.run.prompt(state).kind, 'number');
    c.roster.resources.credits = 6;
    const again = K.testStart(c, 'base:information-broker', 'ava');
    assert.deepEqual(K.testAnswer(c, again, 'base:information-broker', 'ava', 3), { ok: true });
    assert.deepEqual(again.ops.map((o) => o.amount), [-6, 3]);
  });
})(window.LP);
