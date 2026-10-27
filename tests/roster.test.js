(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const T = LP.turn;
  const P = LP.planets;
  const R = LP.roster;
  const I = LP.items;
  const B = LP.battle;
  const C = LP.character;

  function low() { rng.setSource(() => 0); }

  function campaign(memory) {
    const c = {
      settings: { difficulty: 'normal', crewSize: 6 },
      characters: [],
      crew: {},
      turnMemory: Object.assign({}, memory),
      turn: null,
      models: { disabled: {}, invasion: {} }
    };
    P.ensure(c);
    LP.crew.ensure(c);
    R.ensure(c);
    return c;
  }

  /** A campaign whose generator holds `n` generated characters and a generated crew. */
  function generated(n) {
    const c = campaign();
    for (let i = 0; i < n; i++) {
      const ch = C.newCharacter();
      ch.id = 'char-' + i;   // tests have no storage, so ids would clash
      ch.name = 'Crew ' + (i + 1);
      ch.species = { mode: 'fixed', value: 'baseline-human' };
      C.sync(ch);
      C.generate(ch);
      c.characters.push(ch);
    }
    LP.crew.ensure(c);
    LP.crew.generate(c);
    LP.crew.setLeader(c, c.characters[0].id);
    return c;
  }

  function current(c) {
    const w = T.walk(c);
    return w.current ? w.current.id : (w.finished ? 'finished' : 'pending');
  }

  function last(c) {
    return c.turn.records[c.turn.records.length - 1];
  }

  function settle(c) {
    let guard = 0;
    while (current(c) === 'pending' && guard++ < 20) T.choose(c, last(c).pending.options[0].value);
  }

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

  /** A campaign on planet Home with three named crew (one a Bot). */
  function crewed() {
    const c = campaign({ hasPlayed: true });
    const { planet } = P.createPlanet(c, { name: 'Home' });
    planet.worldTraits = [];
    P.setCurrent(c, planet.id);
    const ava = R.addMember(c, { name: 'Ava', speciesId: 'baseline-human', profile: { reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 2, luck: 0 } });
    const bren = R.addMember(c, { name: 'Bren', speciesId: 'feral', profile: { reactions: 1, speed: 5, combat: 0, toughness: 3, savvy: 0, luck: 0 } });
    const unit = R.addMember(c, { name: 'Unit 7', speciesId: 'bot', profile: { reactions: 2, speed: 4, combat: 1, toughness: 4, savvy: 1, luck: 0 } });
    return { c, planet, ava, bren, unit };
  }

  /* ---------------------------------------------------------------------- */
  group('Crew: finalize');

  test('finalize moves characters, items and the ship into the crew', (assert) => {
    rng.setSource(rng.seeded(11));
    const c = generated(3);
    const ownItems = c.characters.reduce((n, ch) => n + C.resolve(ch).items.length, 0);
    assert.equal(R.finalizeProblem(c), null);
    const result = R.finalize(c);
    assert.equal(result.added.length, 3);
    assert.ok(R.hasCrew(c));
    assert.equal(c.roster.members.map((m) => m.name).join(','), 'Crew 1,Crew 2,Crew 3');
    assert.equal(R.nameOf(R.getMember(c, c.roster.leaderId)), 'Crew 1', 'the leader carries over');
    assert.equal(R.itemsOf(c, null).length, 8, 'starting equipment goes to the Stash');
    assert.equal(c.roster.items.length, 8 + ownItems, 'origin items are carried');
    assert.ok(c.roster.items.every((i) => i.turn === 0 && /crew creation/.test(i.source)));
    assert.ok(c.roster.ship && c.roster.ship.hullMax > 0, 'ship set up');
    assert.equal(c.roster.ship.hull, c.roster.ship.hullMax);
    assert.ok(c.roster.start.credits >= 3, 'starting credits recorded');
    assert.equal(c.characters.length, 0, 'generator emptied');
    assert.equal(c.crew.generated, false);
  });

  test('later finalizes add recruits on the current turn, without crew equipment', (assert) => {
    rng.setSource(rng.seeded(12));
    const c = generated(2);
    R.finalize(c);
    c.turnNumber = 7;
    const before = c.roster.items.length;
    const ch = C.newCharacter();
    ch.name = 'Newbie';
    C.generate(ch);
    c.characters.push(ch);
    assert.equal(R.finalizeProblem(c), null, 'no crew equipment needed for recruits');
    R.finalize(c);
    const newbie = c.roster.members.find((m) => m.name === 'Newbie');
    assert.equal(newbie.joinedTurn, 7);
    assert.equal(c.roster.items.length, before + C.resolve(ch).items.length);
    assert.ok(R.itemsOf(c, newbie.id).every((i) => /turn 7/.test(i.source)));
  });

  test('finalize needs complete characters and, the first time, crew equipment', (assert) => {
    const c = campaign();
    assert.ok(R.finalizeProblem(c));
    const ch = C.newCharacter();
    c.characters.push(ch);
    assert.ok(/missing/.test(R.finalizeProblem(c)));
    C.generate(ch);
    assert.ok(/equipment/.test(R.finalizeProblem(c)));
  });

  test('removing a member puts their items in the Stash', (assert) => {
    const { c, ava } = crewed();
    const item = R.addItem(c, { table: 'Gear Table', rowId: rng.getTable('Gear Table').rows[0].id, carrierId: ava.id });
    R.removeMember(c, ava.id);
    assert.equal(item.carrierId, null);
    assert.equal(c.roster.members.length, 2);
  });

  test('saved rosters load back the same', (assert) => {
    const { c, ava } = crewed();
    c.name = 'Saved';
    c.turnNumber = 4;
    R.addItem(c, { table: 'Gear Table', rowId: rng.getTable('Gear Table').rows[0].id, carrierId: ava.id, source: 'From a test.' });
    const back = JSON.parse(JSON.stringify(c));
    R.ensure(back);
    assert.equal(back.turnNumber, 4);
    assert.equal(back.roster.members.length, 3);
    assert.equal(back.roster.items[0].carrierId, ava.id);
    assert.equal(back.roster.items[0].source, 'From a test.');
  });

  /* ---------------------------------------------------------------------- */
  group('Crew: consumables and abilities');

  const CONSUMABLE = { table: 'Consumables Subtable', rowId: 'booster-pills' };

  test('a consumable is never carried: it goes to the Consumables stash', (assert) => {
    const { c, ava } = crewed();
    const item = R.addItem(c, Object.assign({ carrierId: ava.id }, CONSUMABLE));
    assert.equal(item.carrierId, null);
    assert.equal(R.consumables(c).length, 1);
    assert.equal(R.itemsOf(c, null).length, 0, 'not in the ordinary Stash');
    assert.equal(R.itemsOf(c, ava.id).length, 0);
    assert.equal(R.moveItem(c, item.id, ava.id), false);
    assert.equal(item.carrierId, null);
  });

  test('a saved consumable that was carried comes back in the Consumables stash', (assert) => {
    const { c, ava } = crewed();
    R.addItem(c, Object.assign({}, CONSUMABLE));
    c.roster.items[0].carrierId = ava.id;
    R.ensure(c);
    assert.equal(c.roster.items[0].carrierId, null);
  });

  test('a member shows their Class and its effect with their species rules', (assert) => {
    const { c, ava, bren } = crewed();
    ava.origins = [{ label: 'Class', value: 'Soldier', table: 'Class Table', row: 'soldier' }];
    assert.deepEqual(R.classOf(ava), { name: 'Soldier', effect: '+1 Combat Skill' });
    assert.ok(R.abilities(ava).some((a) => a.name === 'Soldier' && a.text === '+1 Combat Skill'));
    assert.ok(R.abilities(bren).some((a) => a.name === 'Feral'), 'species rules come first');
    ava.origins = [{ label: 'Class', value: 'Agitator', table: 'Class Table', row: 'agitator' }];
    assert.equal(R.classOf(ava).effect, '', 'a class with no bonus has no ability line');
    assert.equal(R.classOf(bren), null);
  });

  /* ---------------------------------------------------------------------- */
  group('Crew: items from turns');

  test('item lines: Damaged passes down, "when" items need confirming', (assert) => {
    low();
    const run = LP.followup.start([
      { table: 'Loot Table', note: 'Damaged: needs Repair before it can be used.' },
      { when: 'If it works', steps: [{ table: 'Gear Table' }] }
    ], {});
    const found = I.linesIn({ lines: [], fu: run });
    assert.equal(found.length, 2);
    assert.equal(found[0].damaged, true);
    assert.equal(found[0].manual, false);
    assert.equal(found[1].manual, true);
    assert.equal(found[1].damaged, false);
  });

  test('loot goes into the Stash with where and when it was found; Undo takes it back', (assert) => {
    low();
    const { c } = crewed();
    c.turnNumber = 11;
    let guard = 0;
    while (current(c) !== 'loot' && guard++ < 40) {
      const id = current(c);
      if (id === 'travel') confirm(c, { mode: 'stay' });
      else if (id === 'choose-battle') confirm(c, { privateTransport: false, patronJob: false });
      else confirm(c, id === 'job-offers' ? { offers: 0 } : {});
    }
    assert.equal(current(c), 'loot');
    const before = c.roster.items.length;
    confirm(c, { rolls: 1 });
    const gained = c.roster.items.slice(before);
    assert.equal(gained.length, 1);
    assert.equal(gained[0].name, 'Hold Out Pistol');
    assert.equal(gained[0].carrierId, null);
    assert.equal(gained[0].turn, 11);
    assert.equal(gained[0].source, 'Gained on Home during post-battle loot on turn 11.');
    const line = last(c).output.fu.lines[0].children[0].children[0];
    assert.equal(line.item, 'stash');
    T.undo(c);
    assert.equal(c.roster.items.length, before, 'Undo removes it');
    confirm(c, { rolls: 1 });
    T.restart(c);
    assert.equal(c.roster.items.length, 0, 'Restart removes everything the turn added');
  });

  test('a conditional item is only added when the player confirms it', (assert) => {
    low();
    const { c } = crewed();
    const tag = 'x/test';
    const run = LP.followup.start([{ when: 'If it works', steps: [{ table: 'Gear Table' }] }], {});
    const output = { lines: [], fu: run };
    R.syncStageItems(c, tag, output, { label: 'a test', planet: 'Home', turn: 3 });
    assert.equal(c.roster.items.length, 0);
    const line = run.lines[0].children[0];
    assert.equal(line.item, 'manual');
    R.addFromLine(c, tag, line);
    assert.ok(R.hasManual(c, tag, line));
    assert.equal(c.roster.items[0].source, 'Gained on Home during a test on turn 3.');
    R.removeTagged(c, tag, true);
    assert.equal(c.roster.items.length, 0);
  });

  test('without a crew, items are marked but nothing is stored', (assert) => {
    low();
    const c = campaign();
    const run = LP.followup.start([{ table: 'Gear Table' }], {});
    R.syncStageItems(c, 't', { lines: [], fu: run }, { label: 'x', planet: null, turn: 1 });
    assert.equal(c.roster.items.length, 0);
    assert.equal(run.lines[0].item, 'stash');
  });

  /* ---------------------------------------------------------------------- */
  group('Crew: named crew in the turn');

  test('Upkeep lists Sick Bay by name and counts the roster', (assert) => {
    const { c, bren } = crewed();
    bren.status = 'sick-bay';
    confirm(c);
    confirm(c, { mode: 'stay' });
    assert.equal(current(c), 'upkeep');
    const fields = T.currentFields(c);
    assert.ok(!fields.some((f) => f.key === 'crewCount'), 'no crew count to type');
    assert.deepEqual(fields.find((f) => f.key === 'sickBayIds').value, [bren.id]);
    confirm(c, { hasShip: false });
    const f = T.context(c, c.turn.records).facts;
    assert.equal(f.crewCount, 3);
    assert.equal(f.available, 2);
    assert.equal(f.availableIds.includes(bren.id), false);
  });

  test('crew tasks are assigned by name, and Repair uses that character’s Savvy', (assert) => {
    const { c, ava, unit } = crewed();
    confirm(c);
    confirm(c, { mode: 'stay' });
    confirm(c, { hasShip: false, sickBayIds: [] });
    const field = T.currentFields(c).find((f) => f.key === 'assign');
    assert.equal(field.members.length, 3);
    rng.setSource(() => 0.5);                 // 1D6 = 4
    confirm(c, { assign: { [ava.id]: 'repair', [unit.id]: 'train' } });
    const lines = last(c).output.fu.lines;
    const repair = lines.find((l) => l.text === 'Repair: Ava:');
    assert.ok(repair, 'group named after the character');
    const roll = repair.children[0];
    assert.equal(roll.total, 6, '4 + Savvy 2');
    assert.equal(roll.success, true);
    assert.ok(lines.some((l) => l.text === 'Train:' && /Unit 7/.test(l.children[0].text)));
  });

  test('Savvy rolls inside a named character’s group use their Savvy', (assert) => {
    rng.setSource(() => 0.5);                 // 1D6 = 4
    const run = LP.followup.start([{
      group: 'Explore: Ava', who: { name: 'Ava', savvy: 1, engineer: false },
      steps: [{ roll: '1D6', label: 'Chat', savvy: true, target: 5, ifFail: [{ text: 'Nothing.' }] }]
    }], {});
    const roll = run.lines[0].children[0];
    assert.equal(roll.total, 5);
    assert.equal(roll.success, true);
    assert.ok(!roll.children, 'no "if it fails" branch once the result is known');
  });

  test('random crew events name a crew member', (assert) => {
    const { c } = crewed();
    const run = LP.followup.start([{ randomCrew: true, label: 'Hit' }], R.crewEnv({ campaign: c, memory: {}, settings: c.settings }));
    assert.ok(/^Hit: (Ava|Bren|Unit 7)\.$/.test(run.lines[0].text));
  });

  test('Battle tab deploys named crew; Seize uses their best Savvy and Feral', (assert) => {
    const { c, ava, bren } = crewed();
    const ctx = { settings: c.settings, campaign: c };
    const battle = B.newBattle(ctx, 'opportunity');
    B.setDeployed(battle, ctx, [ava.id, bren.id]);
    assert.equal(battle.options.crewFielded, 2);
    assert.equal(battle.seize.savvy, 2);
    assert.equal(battle.seize.feral, true);
    assert.deepEqual(B.defaultDeployed(ctx).length, 3);
  });

  test('Battle result, injuries and XP use the named crew', (assert) => {
    low();
    const { c, ava, unit } = crewed();
    c.battle = { options: { deployedIds: [ava.id, unit.id] } };
    let guard = 0;
    while (current(c) !== 'battle-result' && guard++ < 20) {
      const id = current(c);
      if (id === 'travel') confirm(c, { mode: 'stay' });
      else if (id === 'choose-battle') confirm(c, { privateTransport: false, patronJob: false });
      else confirm(c, id === 'job-offers' ? { offers: 0 } : {});
    }
    const fields = T.currentFields(c);
    assert.deepEqual(fields.find((f) => f.key === 'participantIds').value, [ava.id, unit.id], 'from the Battle tab');
    const bad = T.confirm(c, Object.assign({}, ...fields.filter((f) => f.type !== 'info').map((f) => ({ [f.key]: f.value })), { participantIds: [ava.id], casualtyIds: [unit.id] }));
    assert.ok(bad.error, 'casualties must have taken part');
    confirm(c, { participantIds: [ava.id, unit.id], casualtyIds: [ava.id, unit.id], heldField: false, won: false });
    const post = T.context(c, c.turn.records).facts.post;
    assert.equal(post.casualties, 1);
    assert.equal(post.botCasualties, 1);
    guard = 0;
    while (current(c) !== 'injuries' && guard++ < 20) confirm(c);
    confirm(c);
    const groups = last(c).output.fu.lines.filter((l) => l.children);
    assert.equal(groups[0].text, 'Ava:');
    assert.equal(groups[0].children[0].table, 'Injury Table');
    assert.equal(groups[1].children[0].table, 'Bot Injury Table');
    assert.equal(current(c), 'experience');
    confirm(c);
    const xp = last(c).output.lines[1].items;
    assert.deepEqual(xp.map((x) => x[0]), ['Ava', 'Unit 7']);
    assert.ok(/^\+1 XP/.test(xp[0][1]), 'casualty');
    assert.equal(xp[1][1], 'No XP (Bot)');
  });

  test('finalize starts the resources; starting contacts go to the first planet', (assert) => {
    rng.setSource(rng.seeded(21));
    const c = generated(2);
    R.finalize(c);
    c.roster.start.rivals = 2;
    c.roster.start.patrons = 1;
    assert.equal(c.roster.resources.credits, c.roster.start.credits);
    confirm(c, { firstTurn: true, startName: 'Firstfall', generateWorld: false });
    const planet = P.current(c);
    assert.equal(planet.rivals.length, 2);
    assert.equal(planet.patrons.length, 1);
    assert.equal(planet.rivals[0].notes, 'Starting Rival from crew creation.');
    T.undo(c);
    assert.equal(c.planets.length, 0, 'Undo removes the planet and its contacts');
  });

  test('Upkeep shows crew credits and the debt interest, and lists what to change', (assert) => {
    const { c } = crewed();
    c.roster.resources.credits = 10;
    c.roster.ship = { name: '', rowId: null, type: 'Ship', hull: 20, hullMax: 20, debt: 32, traits: [] };
    confirm(c);
    confirm(c, { mode: 'stay' });
    const info = T.currentFields(c).find((f) => f.key === 'credits');
    assert.ok(/10 credits/.test(info.text) && /2 credits of interest/.test(info.text));
    confirm(c, { sickBayIds: [], payment: 2 });
    const rec = last(c);
    assert.equal(rec.output.data.creditsAfter, 10 - rec.output.data.cost - 2);
    assert.ok(rec.todo.some((t) => /^Credits: set to/.test(t)));
    assert.ok(rec.todo.includes('Ship debt: set to 31.'), '32 − 2 paid + 1 interest');
  });

  test('crew tasks use the planet’s Patrons and Rivals', (assert) => {
    const { c, planet, ava } = crewed();
    P.newPatron(c, planet);
    P.newPatron(c, planet);
    confirm(c);
    confirm(c, { mode: 'stay' });
    confirm(c, { sickBayIds: [], hasShip: false });
    assert.ok(!T.currentFields(c).some((f) => f.key === 'patrons' || f.key === 'rivals'));
    confirm(c, { assign: { [ava.id]: 'patron' } });
    const roll = last(c).output.fu.lines[0].children[0];
    assert.ok(roll.modifiers.some((m) => m.label === 'known Patrons' && m.value === 2));
  });

  test('Galactic War is skipped when no other planet is invaded', (assert) => {
    const { c } = crewed();
    const stage = T.getStage('galactic-war');
    const ctx = T.context(c, []);
    ctx.facts.post = { type: 'opportunity' };
    assert.ok(/No other planets/.test(stage.applies(ctx)));
    const { planet: other } = P.createPlanet(c, { name: 'Elsewhere' });
    P.startInvasion(other, null);
    assert.equal(stage.applies(ctx), true);
  });

  test('contacts record where they came from', (assert) => {
    const { c, planet } = crewed();
    c.turnNumber = 5;
    const r = P.newRival(c, planet, { notes: P.contactNote('a campaign event', c) });
    assert.equal(r.notes, 'Met during a campaign event on turn 5.');
    const pat = P.newPatron(c, planet, { notes: 'Old friend.' });
    const turned = P.patronToRival(c, planet, pat.id, 'Turned on you.');
    assert.equal(turned.notes, 'Old friend. Turned on you.');
  });

  test('follow-up gains become to-dos', (assert) => {
    low();
    const { c } = crewed();
    let guard = 0;
    while (current(c) !== 'get-paid' && guard++ < 40) {
      const id = current(c);
      if (id === 'travel') confirm(c, { mode: 'stay' });
      else if (id === 'choose-battle') confirm(c, { privateTransport: false, patronJob: false });
      else confirm(c, id === 'job-offers' ? { offers: 0 } : {});
    }
    confirm(c);
    assert.ok(/^\+\d+ credits?\.$/.test(last(c).todo[0]));
  });

  test('Start next turn moves the turn number on', (assert) => {
    const { c } = crewed();
    assert.equal(R.turnNumber(c), 1);
    T.nextTurn(c);
    assert.equal(c.turnNumber, 2);
  });

  /* ---------------------------------------------------------------------- */
  group('Base profile');

  test('a member keeps the profile they joined with', (assert) => {
    const c = campaign();
    const m = R.addMember(c, { name: 'Ava', profile: { reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 1, luck: 0 } });
    m.profile.savvy = 3;
    assert.equal(m.baseProfile.savvy, 1);
    assert.equal(m.profile.savvy, 3);
    R.ensure(c);
    assert.equal(c.roster.members[0].baseProfile.savvy, 1, 'survives normalizing');
  });

  test('a saved member without a base profile gets one from the profile', (assert) => {
    const c = campaign();
    c.roster.members.push({ id: 'old', name: 'Old', profile: { savvy: 2 } });
    R.ensure(c);
    assert.equal(c.roster.members[0].baseProfile.savvy, 2);
  });

  test('resources are credits, story points, Rumors, fuel and ship parts only', (assert) => {
    const c = campaign();
    assert.deepEqual(Object.keys(c.roster.resources), ['credits', 'storyPoints', 'rumors', 'fuel', 'shipParts']);
  });
})(window.LP);
