(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const C = LP.character;
  const crew = LP.crew;

  function character(speciesId, fixed, credits) {
    const c = C.newCharacter();
    C.setFixed(c, ['species'], speciesId);
    for (const [key, value] of Object.entries(fixed)) {
      if (!C.setFixed(c, ['fields', key], value)) throw new Error('Could not fix ' + key);
    }
    C.generate(c);
    // credits: { fieldKey: [values...] } pins dice results
    for (const [key, values] of Object.entries(credits || {})) {
      values.forEach((v, i) => C.setFixed(c, ['fields', key, 'credits', i], v));
    }
    return c;
  }

  function campaign(characters) {
    const camp = { id: 'test', name: 'Test', characters: characters || [], crew: {} };
    crew.ensure(camp);
    return camp;
  }

  /** The example crew from pp.32-34 with the book's dice results. */
  function exampleCrew() {
    return campaign([
      character('baseline-human', { background: 'giant-overcrowded-dystopian-city', motivation: 'freedom', class: 'trader' }, { class: [5] }),
      character('baseline-human', { background: 'mining-colony', motivation: 'loyalty', class: 'enforcer' }),
      character('baseline-human', { background: 'space-station', motivation: 'discovery', class: 'punk' }),
      character('baseline-human', { background: 'industrial-world', motivation: 'wealth', class: 'soldier' }, { motivation: [2], class: [4] }),
      character('baseline-human', { background: 'giant-overcrowded-dystopian-city', motivation: 'escape', class: 'scientist' }),
      character('baseline-human', { background: 'drifter', motivation: 'power', class: 'starship-crew' })
    ]);
  }

  /* ---------------------------------------------------------------------- */
  group('Crew');

  test('ensure builds the starting structure', (assert) => {
    const camp = campaign();
    assert.deepEqual(camp.crew.equipment.map((s) => s.group),
      ['military', 'military', 'military', 'low-tech', 'low-tech', 'low-tech', 'gear', 'gadget']);
    assert.ok(camp.crew.equipment.every((s) => s.mode === 'random' && s.value === null));
    assert.equal(camp.crew.ship.value, null);
    assert.equal(camp.crew.ship.debt, null);
    assert.equal(camp.crew.generated, false);
  });

  test('ensure repairs junk data', (assert) => {
    const camp = { characters: [], crew: { equipment: 'nope', ship: { mode: 'fixed', value: 'no-such-ship' }, leaderId: 'ghost' } };
    crew.ensure(camp);
    assert.equal(camp.crew.equipment.length, 8);
    assert.deepEqual([camp.crew.ship.mode, camp.crew.ship.value], ['random', null]);
    assert.equal(camp.crew.leaderId, null);
  });

  test('generate fills every slot, and the ship debt follows the ship row', (assert) => {
    for (let i = 0; i < 100; i++) {
      const camp = campaign();
      crew.generate(camp);
      assert.ok(camp.crew.equipment.every((s) => s.value));
      assert.ok(camp.crew.metThrough.value && camp.crew.characterizedAs.value);
      const ship = C.findRow('Ship Table', camp.crew.ship.value);
      assert.equal(camp.crew.ship.debt.notation, ship.debt);
      const range = LP.rng.diceRange(ship.debt);
      assert.ok(camp.crew.ship.debt.value >= range.min && camp.crew.ship.debt.value <= range.max);
    }
  });

  test('rerolls never repeat, fixed slots are kept by generate', (assert) => {
    const camp = campaign();
    crew.setFixed(camp, ['metThrough'], 'a-common-enemy');
    crew.generate(camp);
    const paths = [['equipment', 0], ['equipment', 7], ['ship'], ['ship', 'debt'], ['characterizedAs']];
    for (let i = 0; i < 100; i++) {
      for (const path of paths) {
        const before = crew.getSlot(camp.crew, path).value;
        assert.ok(crew.reroll(camp, path), 'reroll ' + path.join('.'));
        assert.ok(crew.getSlot(camp.crew, path).value !== before, path.join('.') + ' repeated');
      }
      crew.generate(camp);
      assert.equal(camp.crew.metThrough.value, 'a-common-enemy');
    }
    assert.equal(crew.canReroll(camp.crew, ['metThrough']), false);
  });

  test('a fixed ship gives the right debt range', (assert) => {
    const camp = campaign();
    crew.setFixed(camp, ['ship'], 'retired-military-patrol-ship');
    crew.generate(camp);
    const d = camp.crew.ship.debt;
    assert.equal(d.notation, '1D6 +35');
    assert.ok(d.value >= 36 && d.value <= 41);
    assert.deepEqual(crew.summarize(camp).ship.traits.map((t) => t.name), ['Armored']);
    assert.ok(crew.summarize(camp).ship.traits[0].text);
  });

  test('High-tech swaps are limited by Savvy-increase characters', (assert) => {
    const dull = character('baseline-human', { background: 'mining-colony', motivation: 'survival', class: 'soldier' });
    const smart = character('baseline-human', { background: 'research-outpost', motivation: 'survival', class: 'soldier' });
    const camp = campaign([dull, smart]);
    crew.generate(camp);
    assert.equal(crew.summarize(camp).savvyCount, 1);
    assert.ok(crew.setHighTech(camp, 0, true), 'first swap allowed');
    assert.equal(camp.crew.equipment[0].table, 'High-tech Weapon Table');
    assert.ok(C.findRow('High-tech Weapon Table', camp.crew.equipment[0].value), 'rerolled on the new table');
    assert.equal(crew.setHighTech(camp, 1, true), false, 'second swap refused');
    assert.equal(crew.setHighTech(camp, 3, true), false, 'low-tech slots cannot swap');
    assert.ok(crew.setHighTech(camp, 0, false), 'swap back');
    assert.equal(camp.crew.equipment[0].table, 'Military Weapon Table');
  });

  test('a warning appears if Savvy characters drop below the High-tech swaps', (assert) => {
    const smart = character('baseline-human', { background: 'research-outpost', motivation: 'survival', class: 'soldier' });
    const camp = campaign([smart]);
    crew.setHighTech(camp, 0, true);
    C.setFixed(smart, ['fields', 'background'], 'mining-colony');
    assert.equal(crew.summarize(camp).warnings.length, 1);
  });

  test('the Leader gets +1 Luck, and deleting them clears the Leader', (assert) => {
    const a = character('baseline-human', { background: 'mining-colony', motivation: 'survival', class: 'soldier' });
    const camp = campaign([a]);
    crew.setLeader(camp, a.id);
    assert.equal(C.resolve(a, { isLeader: camp.crew.leaderId === a.id }).profile.luck, 1);
    camp.characters = [];
    crew.sync(camp);
    assert.equal(camp.crew.leaderId, null);
    assert.equal(crew.setLeader(camp, 'nobody') && camp.crew.leaderId, null);
  });

  test('rulebook example crew: 17 credits, 2 Patrons, 2 Rivals, 3 Savvy characters, 4 Gear + 1 Gadget', (assert) => {
    const camp = exampleCrew();
    const s = crew.summarize(camp);
    assert.equal(s.members, 6);
    assert.equal(s.credits.total, 17);
    assert.equal(s.patrons, 2);
    assert.equal(s.rivals, 2);
    assert.equal(s.storyPoints, 1);
    assert.equal(s.savvyCount, 3);
    const tables = s.characterItems.map((i) => i.table).sort();
    assert.deepEqual(tables, ['Gadget Table', 'Gear Table', 'Gear Table', 'Gear Table', 'Gear Table']);
    assert.deepEqual(s.xp.map((x) => x.xp), [2, 0, 2, 0, 0, 2]);
  });
})(window.LP);
