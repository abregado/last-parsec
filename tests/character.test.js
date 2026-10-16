(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const C = LP.character;
  const species = LP.data.species;
  const tables = LP.data.tables;

  /** A character with the given species and fixed origin values, generated. */
  function make(speciesId, fixed) {
    const c = C.newCharacter();
    if (speciesId) C.setFixed(c, ['species'], speciesId);
    for (const [key, value] of Object.entries(fixed || {})) {
      if (!C.setFixed(c, ['fields', key], value)) throw new Error('Could not fix ' + key + ' = ' + value);
    }
    return C.generate(c);
  }

  function value(c, key) {
    return c.fields[key] && c.fields[key].value;
  }

  /* ---------------------------------------------------------------------- */
  group('Species data');

  test('26 species with unique ids, each linked to its table row', (assert) => {
    assert.equal(species.list.length, 26);
    assert.equal(Object.keys(species.byId).length, 26);
    for (const s of species.list) {
      assert.ok(C.findRow(s.sourceTable, s.sourceRow), s.id + ' source row');
      assert.ok(species.GROUPS.some((g) => g.id === s.group), s.id + ' group');
    }
    // Every subtable row is covered.
    for (const name of ['Primary Alien Table', 'Strange Character Table']) {
      for (const row of tables[name].rows) {
        assert.ok(species.list.some((s) => s.sourceTable === name && s.sourceRow === row.id), name + ' / ' + row.id);
      }
    }
  });

  test('every forced, extra and mapped result exists in its table', (assert) => {
    for (const s of species.list) {
      const forced = s.forced || {};
      if (forced.background) assert.ok(C.findRow('Background Table', forced.background), s.id + ' background');
      if (forced.motivation) assert.ok(C.findRow('Motivation Table', forced.motivation), s.id + ' motivation');
      if (s.extraMotivation) assert.ok(C.findRow('Motivation Table', s.extraMotivation), s.id + ' extra');
      for (const [from, to] of Object.entries(s.classMap || {})) {
        assert.ok(C.findRow('Class Table', from) && C.findRow('Class Table', to), s.id + ' classMap ' + from);
      }
    }
  });

  test('species odds follow Crew Type x subtable', (assert) => {
    const rows = C.speciesRows();
    const weight = (id) => rows.find((r) => r.id === id).weight;
    assert.equal(rows.reduce((sum, r) => sum + r.weight, 0), 10000);
    assert.equal(weight('baseline-human'), 6000);
    assert.equal(weight('bot'), 1000);
    assert.equal(weight('engineer'), 400);   // 20% x 20%
    assert.equal(weight('de-converted'), 20); // 10% x 2%
  });

  test('random species roll matches those odds', (assert) => {
    rng.setSource(rng.seeded(5));
    const n = 30000;
    let humans = 0;
    let aliens = 0;
    for (let i = 0; i < n; i++) {
      const s = C.getSpecies(C.generate(C.newCharacter()).species.value);
      if (s.group === 'human') humans++;
      if (s.group === 'primary-alien') aliens++;
    }
    assert.near(humans / n, 0.6, 0.015, 'Baseline Human');
    assert.near(aliens / n, 0.2, 0.015, 'Primary Aliens');
  });

  /* ---------------------------------------------------------------------- */
  group('Generate');

  test('a new character has the three standard fields, all Random and empty', (assert) => {
    const c = C.newCharacter();
    assert.deepEqual(Object.keys(c.fields), ['background', 'motivation', 'class']);
    assert.equal(c.generated, false);
    for (const slot of Object.values(c.fields)) {
      assert.equal(slot.mode, 'random');
      assert.equal(slot.value, null);
    }
    assert.equal(C.canReroll(c, ['fields', 'class']), false, 'no reroll before Generate');
  });

  test('generate fills every Random slot, including children', (assert) => {
    for (let i = 0; i < 300; i++) {
      const c = C.generate(C.newCharacter());
      assert.ok(c.species.value);
      const result = C.resolve(c);
      assert.ok(result.complete, 'incomplete: ' + JSON.stringify(c));
    }
  });

  test('generate never changes Fixed slots', (assert) => {
    const c = C.newCharacter();
    C.setFixed(c, ['species'], 'feral');
    C.setFixed(c, ['fields', 'motivation'], 'fame');
    for (let i = 0; i < 50; i++) {
      C.generate(c);
      assert.equal(c.species.value, 'feral');
      assert.equal(value(c, 'motivation'), 'fame');
    }
  });

  test('children match the row: Tech Guild gives 1D6 credits and a High-tech Weapon', (assert) => {
    const c = make('baseline-human', { background: 'tech-guild' });
    const slot = c.fields.background;
    assert.equal(slot.credits.length, 1);
    assert.equal(slot.credits[0].notation, '1D6');
    assert.ok(slot.credits[0].value >= 1 && slot.credits[0].value <= 6);
    assert.equal(slot.items.length, 1);
    assert.equal(slot.items[0].table, 'High-tech Weapon Table');
    assert.ok(C.findRow('High-tech Weapon Table', slot.items[0].value));
  });

  test('changing a parent keeps still-valid children and replaces the rest', (assert) => {
    const c = make('baseline-human', { background: 'tech-guild' });
    const credit = c.fields.background.credits[0];
    C.setFixed(c, ['fields', 'background'], 'peaceful-high-tech-colony'); // also 1D6 credits
    assert.equal(c.fields.background.credits[0], credit, 'credits child kept');
    assert.equal(c.fields.background.items.length, 0, 'weapon child removed');
    C.setFixed(c, ['fields', 'background'], 'drifter');
    assert.equal(c.fields.background.credits.length, 0);
    assert.equal(c.fields.background.items[0].table, 'Gear Table');
    assert.ok(c.fields.background.items[0].value, 'new child rolled straight away');
  });

  test('characters survive a JSON round trip', (assert) => {
    const c = make('hulker');
    const copy = JSON.parse(JSON.stringify(c));
    assert.deepEqual(C.resolve(copy), C.resolve(c));
  });

  /* ---------------------------------------------------------------------- */
  group('Reroll');

  test('rerolls never repeat: species, fields, credits and items', (assert) => {
    for (let i = 0; i < 200; i++) {
      const c = make('baseline-human', { background: 'wealthy-merchant-family', class: 'mercenary' });
      // background 2D6 credits, class Military Weapon item; make them Random again.
      C.setRandom(c, ['fields', 'background']);
      const checks = [
        ['fields', 'motivation'],
        ['fields', 'background', 'credits', 0],
        ['fields', 'class', 'items', 0],
        ['species'] // last: a new species can change the fields
      ];
      C.setRandom(c, ['species']);
      for (const path of checks) {
        const before = C.getSlot(c, path).value;
        assert.ok(C.reroll(c, path), 'reroll ' + path.join('.'));
        assert.ok(C.getSlot(c, path).value !== before, path.join('.') + ' repeated ' + before);
      }
    }
  });

  test('Fixed and Forced slots cannot be rerolled', (assert) => {
    const c = make('de-converted', { class: 'soldier' });
    assert.equal(C.canReroll(c, ['fields', 'class']), false, 'fixed');
    assert.equal(C.reroll(c, ['fields', 'class']), false);
    assert.equal(C.canReroll(c, ['fields', 'motivation']), false, 'forced');
    assert.equal(C.canReroll(c, ['species']), false, 'fixed species');
    assert.ok(C.canReroll(c, ['fields', 'background']), 'random background can');
  });

  test('switching to Random keeps the value until the next roll', (assert) => {
    const c = make('baseline-human', { class: 'soldier' });
    C.setRandom(c, ['fields', 'class']);
    assert.equal(value(c, 'class'), 'soldier');
    assert.ok(C.canReroll(c, ['fields', 'class']));
  });

  test('setFixed rejects values not offered in the dropdown', (assert) => {
    const c = make('hakshan');
    assert.equal(C.setFixed(c, ['fields', 'motivation'], 'truth'), false, 'Hakshan already has Truth');
    assert.equal(C.setFixed(c, ['fields', 'motivation'], 'not-a-row'), false);
    assert.equal(C.setFixed(c, ['species'], 'not-a-species'), false);
  });

  /* ---------------------------------------------------------------------- */
  group('Species rules');

  test('Bots have no origin fields and the Bot profile', (assert) => {
    const c = make('bot');
    assert.deepEqual(Object.keys(c.fields), []);
    const r = C.resolve(c);
    assert.ok(r.complete);
    assert.deepEqual(r.profile, { reactions: 2, speed: 4, combat: 1, toughness: 4, savvy: 2, luck: 0 });
  });

  test('forced results are locked and cannot be changed', (assert) => {
    const c = make('de-converted');
    assert.equal(c.fields.motivation.mode, 'forced');
    assert.equal(value(c, 'motivation'), 'revenge');
    assert.equal(C.setFixed(c, ['fields', 'motivation'], 'fame'), false);
    assert.equal(C.setRandom(c, ['fields', 'motivation']), false);
    assert.equal(value(c, 'motivation'), 'revenge');
  });

  test('forced background for Mutant, Manipulator and Primitive', (assert) => {
    assert.equal(value(make('mutant'), 'background'), 'lower-megacity-class');
    assert.equal(value(make('manipulator'), 'background'), 'bureaucrat');
    assert.equal(value(make('primitive'), 'background'), 'primitive-or-regressed-world');
  });

  test('leaving a forcing species frees the field and rolls it', (assert) => {
    const c = make('de-converted');
    C.setFixed(c, ['species'], 'baseline-human');
    assert.equal(c.fields.motivation.mode, 'random');
    assert.ok(value(c, 'motivation'), 'rolled');
  });

  test('Mysterious Past: two different Backgrounds, origin story points ignored', (assert) => {
    for (let i = 0; i < 200; i++) {
      const c = make('mysterious-past');
      assert.ok(value(c, 'background2'));
      assert.ok(value(c, 'background') !== value(c, 'background2'));
    }
    const c = make('mysterious-past', { background: 'religious-cult', motivation: 'fame', class: 'soldier' });
    assert.equal(C.resolve(c).storyPoints, 0);
  });

  test('Feeler: two different Motivations, both applied', (assert) => {
    for (let i = 0; i < 200; i++) {
      const c = make('feeler');
      assert.ok(value(c, 'motivation') !== value(c, 'motivation2'));
    }
    const c = make('feeler', { motivation: 'survival', motivation2: 'escape', background: 'drifter', class: 'artist' });
    const r = C.resolve(c);
    assert.equal(r.profile.toughness, 4);
    assert.equal(r.profile.speed, 5);
  });

  test('Hakshan: always Truth, and the rolled Motivation is never Truth', (assert) => {
    for (let i = 0; i < 300; i++) {
      const c = make('hakshan');
      assert.equal(value(c, 'motivationExtra'), 'truth');
      assert.ok(value(c, 'motivation') !== 'truth');
    }
    const c = make('hakshan', { background: 'mining-colony', motivation: 'survival', class: 'soldier' });
    const r = C.resolve(c);
    assert.equal(r.questRumors, 1, 'Truth rumor');
    assert.equal(r.storyPoints, 1, 'Truth story point');
  });

  test('Hulker: Technician counts as Primitive, and rerolls skip Primitive results', (assert) => {
    const c = make('hulker', { class: 'technician' });
    const r = C.resolve(c);
    assert.equal(r.origins.find((o) => o.key === 'class').effectiveRow.id, 'primitive');
    assert.deepEqual(c.fields.class.items.map((i) => i.table), ['Low-tech Weapon Table']);
    C.setRandom(c, ['fields', 'class']);
    for (let i = 0; i < 200; i++) {
      C.reroll(c, ['fields', 'class']);
      const before = value(c, 'class');
      C.reroll(c, ['fields', 'class']);
      const after = value(c, 'class');
      const prim = ['technician', 'scientist', 'hacker', 'primitive'];
      assert.ok(!(prim.includes(before) && prim.includes(after)), before + ' -> ' + after);
    }
  });

  test('Genetic Uplift: no Background credits and +1 Rival', (assert) => {
    const c = make('genetic-uplift', { background: 'wealthy-merchant-family', motivation: 'survival', class: 'soldier' });
    assert.equal(c.fields.background.credits.length, 0);
    const r = C.resolve(c);
    assert.equal(r.credits, c.fields.class.credits[0].value);
    assert.equal(r.rivals, 1);
  });

  test('Minor Alien: ability roll, credits and story points reduced by 1', (assert) => {
    const c = make('minor-alien', { background: 'mining-colony', motivation: 'fame', class: 'trader' });
    assert.ok(value(c, 'minorAbility'));
    const r = C.resolve(c);
    assert.equal(r.credits, c.fields.class.credits[0].value - 1);
    assert.equal(r.storyPoints, 0);
  });

  test('Bio-upgrade: credits reduced by 2, never below 0', (assert) => {
    for (let i = 0; i < 100; i++) {
      const c = make('bio-upgrade', { background: 'mining-colony', motivation: 'wealth', class: 'soldier' });
      const rolled = c.fields.motivation.credits[0].value + c.fields.class.credits[0].value;
      assert.equal(C.resolve(c).credits, rolled - 2);
    }
    const none = make('bio-upgrade', { background: 'mining-colony', motivation: 'survival', class: 'ganger' });
    assert.equal(C.resolve(none).credits, 0);
  });

  test('De-converted: Savvy is never improved', (assert) => {
    const c = make('de-converted', { background: 'peaceful-high-tech-colony', class: 'technician' });
    const r = C.resolve(c);
    assert.equal(r.profile.savvy, 0);
    assert.equal(r.savvyIncrease, false);
  });

  test('Traveler: Truth plus +2 story points and 2 Quest Rumors', (assert) => {
    const c = make('traveler', { background: 'mining-colony', class: 'soldier' });
    const r = C.resolve(c);
    assert.equal(value(c, 'motivation'), 'truth');
    assert.equal(r.storyPoints, 3);
    assert.equal(r.questRumors, 3);
  });

  test('Luck: Humans can exceed 1, others cannot; Bots and Emo-suppressed get none', (assert) => {
    const fixed = { background: 'mining-colony', motivation: 'survival', class: 'working-class' };
    assert.equal(C.resolve(make('baseline-human', fixed), { isLeader: true }).profile.luck, 2);
    assert.equal(C.resolve(make('feral', fixed), { isLeader: true }).profile.luck, 1);
    assert.equal(C.resolve(make('emo-suppressed', { background: 'mining-colony', class: 'working-class' }), { isLeader: true }).profile.luck, 0);
    assert.equal(C.resolve(make('bot'), { isLeader: true }).profile.luck, 0);
    assert.equal(C.resolve(make('hopeful-rookie', { background: 'mining-colony', motivation: 'survival', class: 'soldier' })).profile.luck, 1);
  });

  /* ---------------------------------------------------------------------- */
  group('Rulebook example crew (pp.32-34)');

  test('Flint Williamson: Dystopian City, Freedom, Trader', (assert) => {
    const r = C.resolve(make('baseline-human', { background: 'giant-overcrowded-dystopian-city', motivation: 'freedom', class: 'trader' }));
    assert.deepEqual(r.profile, { reactions: 1, speed: 5, combat: 0, toughness: 3, savvy: 0, luck: 0 });
    assert.equal(r.xp, 2);
    assert.ok(r.credits >= 2 && r.credits <= 12);
  });

  test('Kersh "Tank" Filjan: Mining Colony, Loyalty, Enforcer', (assert) => {
    const r = C.resolve(make('baseline-human', { background: 'mining-colony', motivation: 'loyalty', class: 'enforcer' }));
    assert.deepEqual(r.profile, { reactions: 1, speed: 4, combat: 1, toughness: 4, savvy: 0, luck: 0 });
    assert.equal(r.patrons, 2);
    assert.equal(r.storyPoints, 1);
  });

  test('Milli "Twitch" Cershaw: Space Station, Discovery, Punk', (assert) => {
    const r = C.resolve(make('baseline-human', { background: 'space-station', motivation: 'discovery', class: 'punk' }));
    assert.deepEqual(r.profile, { reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 1, luck: 0 });
    assert.equal(r.xp, 2);
    assert.equal(r.rivals, 1);
    assert.deepEqual(r.items.map((i) => i.table), ['Gear Table', 'Gear Table']);
    assert.ok(r.savvyIncrease);
  });

  test('Shi Jiang: Dystopian City, Escape, Scientist', (assert) => {
    const r = C.resolve(make('baseline-human', { background: 'giant-overcrowded-dystopian-city', motivation: 'escape', class: 'scientist' }));
    assert.deepEqual(r.profile, { reactions: 1, speed: 6, combat: 0, toughness: 3, savvy: 1, luck: 0 });
    assert.deepEqual(r.items.map((i) => i.table), ['Gadget Table']);
  });
})(window.LP);
