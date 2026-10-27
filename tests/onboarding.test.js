(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const M = LP.models;
  const C = LP.character;
  const P = LP.planets;
  const R = LP.roster;
  const T = LP.turn;

  const PICTURE = 'data:image/jpeg;base64,AAAA';

  function campaign() {
    const c = {
      settings: { difficulty: 'normal', crewSize: 5 },
      characters: [],
      crew: {},
      turnMemory: {},
      turn: null,
      models: M.normalize(null),
      presets: []
    };
    P.ensure(c);
    LP.crew.ensure(c);
    R.ensure(c);
    return c;
  }

  /** A preset: a human with a fixed first Background, and a picture. */
  function preset(name) {
    const p = LP.presets.create();
    p.name = name;
    p.portrait = PICTURE;
    p.species = { mode: 'fixed', value: 'baseline-human' };
    C.sync(p);
    const background = C.fieldsFor(C.getSpecies('baseline-human'))[0];
    C.setFixed(p, ['fields', background.key], LP.rng.getTable(background.table).rows[0].id);
    return p;
  }

  group('Enemy names and pictures');

  test('normalize keeps names and pictures and drops junk', (assert) => {
    const models = M.normalize({
      names: { 'Hired Muscle|mercs': 'My Mercs', 'Hired Muscle|blank': '   ', 'Hired Muscle|n': 5 },
      portraits: { 'Hired Muscle|mercs': PICTURE, 'Hired Muscle|x': 'http://example.com/a.png' }
    });
    assert.deepEqual(models.names, { 'Hired Muscle|mercs': 'My Mercs' });
    assert.deepEqual(models.portraits, { 'Hired Muscle|mercs': PICTURE });
    assert.deepEqual(M.normalize([]).names, {});
  });

  test('displayName falls back to the book name', (assert) => {
    const c = campaign();
    const row = LP.rng.getTable('Criminal Elements').rows[0];
    assert.equal(M.displayName(c, 'Criminal Elements', row), row.enemy);
    M.setName(c, 'Criminal Elements', row.id, '  Space   Pirates ');
    assert.equal(M.displayName(c, 'Criminal Elements', row), 'Space Pirates');
    M.setName(c, 'Criminal Elements', row.id, '');
    assert.equal(M.displayName(c, 'Criminal Elements', row), row.enemy);
  });

  test('dress gives a parsed enemy the custom name and picture', (assert) => {
    const c = campaign();
    const row = LP.rng.getTable('Roving Threats').rows[0];
    M.setName(c, 'Roving Threats', row.id, 'Plastic Beasts');
    M.setPortrait(c, 'Roving Threats', row.id, PICTURE);
    const e = M.dress(c, LP.enemies.getEnemy('Roving Threats', row.id));
    assert.equal(e.name, 'Plastic Beasts');
    assert.equal(e.bookName, row.enemy);
    assert.equal(e.portrait, PICTURE);
    M.setPortrait(c, 'Roving Threats', row.id, null);
    assert.equal(M.portraitOf(c, 'Roving Threats', row.id), null);
  });

  test('archetype enemy names use the campaign’s names', (assert) => {
    const c = campaign();
    const row = LP.rng.getTable('Hired Muscle').rows[0];
    M.setName(c, 'Hired Muscle', row.id, 'Tin Soldiers');
    assert.equal(LP.archetypes.enemyName('Hired Muscle|' + row.id), row.enemy);
    assert.equal(LP.archetypes.enemyName('Hired Muscle|' + row.id, c), 'Tin Soldiers');
  });

  group('New campaign defaults');

  test('a new campaign gets its own copy of the defaults', (assert) => {
    const holder = LP.defaults.reset({ models: { disabled: { 'Hired Muscle': ['mercs'] }, names: { 'Hired Muscle|x': 'Foo' } }, presets: [preset('Ace')] });
    const seed = LP.defaults.seed();
    assert.deepEqual(seed.models.disabled['Hired Muscle'], ['mercs']);
    assert.equal(seed.presets.length, 1);
    seed.models.disabled['Hired Muscle'].push('other');
    seed.presets[0].name = 'Changed';
    assert.deepEqual(holder.models.disabled['Hired Muscle'], ['mercs']);
    assert.equal(holder.characters[0].name, 'Ace');
    LP.defaults.reset(null);
  });

  group('Character presets');

  test('presets never hold rolled values', (assert) => {
    const raw = preset('Ace');
    raw.fields.class.mode = 'random';
    raw.fields.class.value = 'primitive';
    const [clean] = LP.presets.normalize([raw, { nonsense: true }, null]);
    assert.equal(LP.presets.normalize([raw, null]).length, 1);
    assert.equal(clean.fields.class.value, null);
    assert.equal(clean.generated, false);
    assert.equal(clean.portrait, PICTURE);
    assert.equal(clean.species.value, 'baseline-human');
  });

  test('each preset is used once, in order, then characters are random', (assert) => {
    const c = campaign();
    c.presets = LP.presets.normalize([preset('One'), preset('Two')]);
    const a = LP.presets.take(c);
    c.characters.push(a);
    const b = LP.presets.take(c);
    c.characters.push(b);
    assert.deepEqual([a.name, b.name], ['One', 'Two']);
    assert.equal(a.presetId, c.presets[0].id);
    assert.equal(a.portrait, PICTURE);
    assert.equal(a.species.value, 'baseline-human');
    assert.equal(LP.presets.take(c), null);
  });

  test('deleting a preset character puts the preset back', (assert) => {
    const c = campaign();
    c.presets = LP.presets.normalize([preset('One')]);
    c.characters.push(LP.presets.take(c));
    assert.equal(LP.presets.unused(c).length, 0);
    c.characters = [];
    assert.equal(LP.presets.unused(c).length, 1);
  });

  test('recruits ignore presets once the crew exists', (assert) => {
    const c = campaign();
    c.presets = LP.presets.normalize([preset('One')]);
    R.addMember(c, { name: 'Already here', speciesId: 'baseline-human' });
    assert.equal(LP.presets.take(c), null);
  });

  test('a preset’s fixed values survive Generate and its picture reaches the crew', (assert) => {
    const c = campaign();
    c.presets = LP.presets.normalize([preset('One')]);
    const ch = LP.presets.take(c);
    c.characters.push(ch);
    const fixed = Object.assign({}, ch.fields.background);
    C.generate(ch);
    assert.equal(ch.fields.background.value, fixed.value);
    assert.equal(ch.fields.background.mode, 'fixed');
    assert.ok(C.resolve(ch).complete);
    assert.equal(R.memberFrom(ch, false, 0).portrait, PICTURE);
  });

  group('Quick Start');

  test('builds the crew from presets, then random, and stops at Step 2', (assert) => {
    const c = campaign();
    c.presets = LP.presets.normalize([preset('One'), preset('Two')]);
    assert.ok(LP.quickStart.available(c));
    const result = LP.quickStart.run(c);
    assert.equal(result.error, undefined);
    assert.equal(R.members(c).length, 5);
    assert.deepEqual(R.members(c).slice(0, 2).map((m) => m.name), ['One', 'Two']);
    assert.equal(R.members(c)[0].portrait, PICTURE);
    assert.equal(R.members(c)[2].portrait, null);
    assert.ok(R.roster(c).leaderId, 'a Leader is set');
    assert.ok(R.roster(c).ship, 'a ship is set');
    assert.ok(R.roster(c).items.length > 0, 'the crew has equipment');
    assert.ok(P.current(c), 'the starting world exists');
    const w = T.walk(c);
    assert.equal(w.current && w.current.step, 'world');
    assert.equal(c.turnMemory.hasPlayed, true);
  });

  test('keeps characters and rolls the player already made', (assert) => {
    const c = campaign();
    c.settings.crewSize = 3;
    const mine = C.newCharacter();
    mine.name = 'Mine';
    C.setFixed(mine, ['species'], 'baseline-human');
    c.characters.push(mine);
    const result = LP.quickStart.run(c);
    assert.equal(result.error, undefined);
    assert.equal(R.members(c).length, 3);
    assert.equal(R.members(c)[0].name, 'Mine');
  });

  test('is only for campaigns without a turn', (assert) => {
    const c = campaign();
    assert.equal(LP.quickStart.run(c).error, undefined);
    assert.equal(LP.quickStart.available(c), false);
    assert.ok(LP.quickStart.run(c).error);
    const later = campaign();
    later.turnNumber = 2;
    assert.equal(LP.quickStart.available(later), false);
  });

  test('works on a crew that is already finalized', (assert) => {
    const c = campaign();
    c.settings.crewSize = 2;
    const first = campaign();
    first.settings.crewSize = 2;
    LP.quickStart.run(first);
    // Same crew, but rewind to before the first turn.
    const again = JSON.parse(JSON.stringify(first));
    again.turn = null;
    again.turnMemory = {};
    again.planets = [];
    again.currentPlanetId = null;
    P.ensure(again);
    assert.equal(R.members(again).length, 2);
    assert.equal(LP.quickStart.run(again).error, undefined);
    assert.equal(R.members(again).length, 2);
    assert.equal(T.walk(again).current.step, 'world');
  });
})(window.LP);
