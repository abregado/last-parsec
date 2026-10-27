(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const N = LP.names;
  const rng = LP.rng;

  function campaign() {
    const c = { characters: [] };
    N.ensure(c);
    return c;
  }

  function character(speciesId, name, auto) {
    return { name: name || '', nameAuto: !!auto, species: { mode: 'fixed', value: speciesId } };
  }

  group('Names: tables and species');

  test('a new campaign gets the starter tables', (t) => {
    const c = campaign();
    t.ok(N.getTable(c, 'human-first') && N.getTable(c, 'strange'));
  });

  test('humans use two tables, bots a prefix and suffix, aliens one', (t) => {
    const c = campaign();
    t.deepEqual(N.tablesFor(c, 'baseline-human'), ['human-first', 'human-last']);
    t.deepEqual(N.tablesFor(c, 'bot'), ['bot-prefix', 'bot-suffix']);
    t.deepEqual(N.tablesFor(c, 'kerin'), ['kerin']);
  });

  test('every strange species shares the one Strange table', (t) => {
    const c = campaign();
    for (const s of LP.data.species.list.filter((x) => x.group === 'strange')) {
      t.deepEqual(N.tablesFor(c, s.id), ['strange'], s.id);
    }
  });

  test('a name joins one pick from each table with a space', (t) => {
    const c = campaign();
    rng.setSource(() => 0);
    t.equal(N.rollName(c, 'baseline-human'), N.getTable(c, 'human-first').names[0] + ' ' + N.getTable(c, 'human-last').names[0]);
    t.equal(N.rollName(c, 'bot').split(' ').length >= 2, true);
  });

  test('empty tables are skipped; no tables gives an empty name', (t) => {
    const c = campaign();
    N.getTable(c, 'human-last').names = [];
    t.equal(N.rollName(c, 'baseline-human').includes(' '), false);
    N.getTable(c, 'kerin').names = [];
    t.equal(N.rollName(c, 'kerin'), '');
  });

  test('a species override replaces the default and can be reset', (t) => {
    const c = campaign();
    N.setSpeciesTables(c, 'kerin', ['strange', 'kerin']);
    t.deepEqual(N.tablesFor(c, 'kerin'), ['strange', 'kerin']);
    t.ok(N.isOverridden(c, 'kerin'));
    N.resetSpecies(c, 'kerin');
    t.deepEqual(N.tablesFor(c, 'kerin'), ['kerin']);
  });

  test('deleting a table removes it from species lists', (t) => {
    const c = campaign();
    N.setSpeciesTables(c, 'kerin', ['kerin', 'strange']);
    N.deleteTable(c, 'strange');
    t.deepEqual(N.tablesFor(c, 'kerin'), ['kerin']);
    t.deepEqual(c.speciesNames.kerin, ['kerin']);
  });

  test('new tables take names one per line and skip repeats', (t) => {
    const c = campaign();
    const table = N.addTable(c, 'Pirates');
    t.equal(N.addNames(c, table.id, 'Red\nBlack\nRed\n  \nGold'), 3);
    N.removeName(c, table.id, 0);
    t.deepEqual(table.names, ['Black', 'Gold']);
  });

  test('commas are split on add and stripped from stored names', (t) => {
    const c = campaign();
    const table = N.addTable(c, 'Pirates');
    t.equal(N.addNames(c, table.id, 'Red, Black ,  ,Gold'), 3);
    t.deepEqual(table.names, ['Red', 'Black', 'Gold']);
    table.names.push('Smith, John');
    N.ensure(c);
    t.deepEqual(N.getTable(c, 'generic').names.some((n) => n.includes(',')), false);
    t.equal(N.getTable(c, table.id).names[3], 'Smith John');
  });

  test('the generic table cannot be deleted or emptied', (t) => {
    const c = campaign();
    t.equal(N.deleteTable(c, 'generic'), false);
    t.ok(N.getTable(c, 'generic'));
    const g = N.getTable(c, 'generic');
    while (g.names.length > 1) N.removeName(c, 'generic', 0);
    t.equal(N.removeName(c, 'generic', 0), false);
    t.equal(g.names.length, 1);
    g.names = [];
    N.ensure(c);
    t.ok(N.getTable(c, 'generic').names.length > 0);
  });

  test('a species left with no table uses the generic one', (t) => {
    const c = campaign();
    N.deleteTable(c, 'kerin');
    t.deepEqual(N.tablesFor(c, 'kerin'), ['generic']);
    N.setSpeciesTables(c, 'engineer', []);
    t.deepEqual(N.tablesFor(c, 'engineer'), ['generic']);
    N.deleteTable(c, 'human-first');
    t.deepEqual(N.tablesFor(c, 'baseline-human'), ['human-last']);
  });

  test('ensure repairs bad data', (t) => {
    const c = { characters: [], nameTables: [{ id: 'a', name: '  ', names: ['x', 5, ' '] }, null], speciesNames: { kerin: ['gone'], bot: 'x' } };
    N.ensure(c);
    t.deepEqual(N.getTable(c, 'a'), { id: 'a', name: 'Names', names: ['x'] });
    t.ok(N.getTable(c, 'generic').names.length);
    t.deepEqual(c.speciesNames, { kerin: ['generic'] });
  });

  group('Names: assigning to characters');

  test('assign names an empty character and marks it auto', (t) => {
    const c = campaign();
    const ch = character('kerin');
    t.ok(N.assign(c, ch, true));
    t.ok(ch.name && ch.nameAuto);
  });

  test('a typed name is never overwritten', (t) => {
    const c = campaign();
    const ch = character('kerin', 'Captain Pip', false);
    t.equal(N.assign(c, ch, true), false);
    t.equal(ch.name, 'Captain Pip');
  });

  test('an auto name rerolls when the species changes, not otherwise', (t) => {
    const c = campaign();
    const ch = character('kerin');
    N.assign(c, ch, true);
    const first = ch.name;
    t.equal(N.assign(c, ch, false), false);
    t.equal(ch.name, first);
    ch.species.value = 'baseline-human';
    t.ok(N.assign(c, ch, false));
    t.ok(ch.name.includes(' '));
  });

  test('duplicates of other characters are rerolled', (t) => {
    const c = campaign();
    N.getTable(c, 'kerin').names = ['Gruk', 'Vorg'];
    c.characters.push(character('kerin', 'Gruk'));
    const ch = character('kerin');
    c.characters.push(ch);
    let calls = 0;
    rng.setSource(() => (calls++ === 0 ? 0 : 0.9));
    N.assign(c, ch, true);
    t.equal(ch.name, 'Vorg');
  });

  test('reroll replaces even a typed name', (t) => {
    const c = campaign();
    const ch = character('kerin', 'Typed', false);
    t.ok(N.reroll(c, ch));
    t.ok(ch.nameAuto && ch.name !== 'Typed');
  });
})(window.LP);
