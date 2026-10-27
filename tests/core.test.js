(function (LP) {
  'use strict';

  const { group, test } = LP.test;
  const rng = LP.rng;
  const effects = LP.effects;
  const tables = LP.data.tables;

  /** Count picks of `fn()` by row id. */
  function tally(times, fn) {
    const counts = {};
    for (let i = 0; i < times; i++) {
      const row = fn();
      const key = row ? row.id : 'null';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  /* ---------------------------------------------------------------------- */
  group('Table data');

  test('all 77 tables are loaded', (assert) => {
    assert.equal(Object.keys(tables).length, 77);
  });

  test('every table has rows, a label column, and unique row ids', (assert) => {
    for (const table of Object.values(tables)) {
      assert.ok(table.rows.length > 0, table.name + ' has no rows');
      assert.ok(table.columns.includes(table.labelColumn), table.name + ' label column missing');
      const ids = table.rows.map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, table.name + ' has duplicate ids');
    }
  });

  test('only the known irregular tables have no standard die', (assert) => {
    const noDie = Object.values(tables).filter((t) => t.die === null).map((t) => t.name).sort();
    // BHC uses target numbers; the book's Environmental Hazards Effects table has no row 5.
    assert.deepEqual(noDie, ['Benefits, Hazards, and Conditions (BHC) Table', 'Environmental Hazards - Effects']);
  });

  test('every weighted row with a standard die has a printed range', (assert) => {
    for (const table of Object.values(tables)) {
      if (!table.die) continue;
      for (const row of table.rows) {
        for (const wc of table.weightColumns) {
          if (row[wc] > 0) assert.ok(row.ranges[wc], table.name + ' / ' + row.id + ' has no range');
        }
      }
    }
  });

  test('2D6 table ranges are computed from combinations', (assert) => {
    const ranges = tables['Galactic War Progress Table'].rows.map((r) => r.ranges.weight);
    assert.deepEqual(ranges, ['2-4', '5-7', '8-9', '10-12']);
  });

  /* ---------------------------------------------------------------------- */
  group('Dice');

  test('parseDice understands the notations used in the tables', (assert) => {
    assert.deepEqual(rng.parseDice('1D6'), { count: 1, sides: 6, modifier: 0 });
    assert.deepEqual(rng.parseDice('D6'), { count: 1, sides: 6, modifier: 0 });
    assert.deepEqual(rng.parseDice('2d6'), { count: 2, sides: 6, modifier: 0 });
    assert.deepEqual(rng.parseDice('1D6 +20'), { count: 1, sides: 6, modifier: 20 });
    assert.deepEqual(rng.parseDice('1D6-1'), { count: 1, sides: 6, modifier: -1 });
    assert.deepEqual(rng.parseDice('3'), { count: 0, sides: 0, modifier: 3 });
    assert.equal(rng.parseDice('banana'), null);
    assert.equal(rng.parseDice('0D6'), null);
  });

  test('every Ship Table debt parses as dice', (assert) => {
    for (const row of tables['Ship Table'].rows) {
      assert.ok(rng.parseDice(row.debt), row.ship + ' debt: ' + row.debt);
    }
  });

  test('roll stays within range and reports each die', (assert) => {
    for (let i = 0; i < 2000; i++) {
      const r = rng.roll('2D6+1');
      assert.equal(r.dice.length, 2);
      assert.equal(r.total, r.dice[0] + r.dice[1] + 1);
      assert.ok(r.total >= 3 && r.total <= 13, 'total ' + r.total);
    }
    assert.throws(() => rng.roll('nope'));
  });

  test('1D6 is roughly uniform', (assert) => {
    rng.setSource(rng.seeded(1));
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 60000;
    for (let i = 0; i < n; i++) counts[rng.roll('1D6').total - 1]++;
    counts.forEach((c, i) => assert.near(c / n, 1 / 6, 0.01, 'face ' + (i + 1)));
  });

  test('rerollDice never repeats the current total', (assert) => {
    for (const notation of ['1D6', '2D6', '1D6 +20']) {
      for (let i = 0; i < 500; i++) {
        const current = rng.roll(notation).total;
        assert.ok(rng.rerollDice(notation, current).total !== current, notation + ' repeated ' + current);
      }
    }
  });

  test('rerollDice keeps the 2D6 bell curve', (assert) => {
    rng.setSource(rng.seeded(2));
    const n = 40000;
    let sevens = 0;
    let twos = 0;
    for (let i = 0; i < n; i++) {
      const total = rng.rerollDice('2D6', 12).total; // exclude 12
      if (total === 7) sevens++;
      if (total === 2) twos++;
    }
    // Conditional on not rolling 12: P(7) = 6/35, P(2) = 1/35.
    assert.near(sevens / n, 6 / 35, 0.01, 'P(7)');
    assert.near(twos / n, 1 / 35, 0.005, 'P(2)');
  });

  test('rerollDice returns null when only one total is possible', (assert) => {
    assert.equal(rng.rerollDice('3', 3), null);
    assert.equal(rng.rerollDice('1D1', 1), null);
  });

  /* ---------------------------------------------------------------------- */
  group('Weighted tables');

  test('Crew Type odds match the book (60/20/10/10)', (assert) => {
    rng.setSource(rng.seeded(3));
    const n = 40000;
    const counts = tally(n, () => rng.rollTable('Crew Type Table'));
    assert.near(counts['baseline-human'] / n, 0.6, 0.015, 'Baseline Human');
    assert.near(counts['primary-alien'] / n, 0.2, 0.015, 'Primary Alien');
    assert.near(counts['bot'] / n, 0.1, 0.015, 'Bot');
    assert.near(counts['strange-character'] / n, 0.1, 0.015, 'Strange Character');
  });

  test('rerollTable never returns the current row (every row of three tables)', (assert) => {
    for (const name of ['Strange Character Table', 'Class Table', 'Crew Type Table']) {
      for (const row of tables[name].rows) {
        for (let i = 0; i < 100; i++) {
          const picked = rng.rerollTable(name, row.id);
          assert.ok(picked && picked.id !== row.id, name + ' repeated ' + row.id);
        }
      }
    }
  });

  test('rerollTable keeps the remaining rows in proportion', (assert) => {
    rng.setSource(rng.seeded(4));
    const n = 40000;
    const counts = tally(n, () => rng.rerollTable('Crew Type Table', 'baseline-human'));
    assert.equal(counts['baseline-human'], undefined);
    assert.near(counts['primary-alien'] / n, 0.5, 0.015, 'Primary Alien');
    assert.near(counts['bot'] / n, 0.25, 0.015, 'Bot');
    assert.near(counts['strange-character'] / n, 0.25, 0.015, 'Strange Character');
  });

  test('zero-weight rows are never picked', (assert) => {
    const rows = tables['Enemy Encounter Category Table'].rows;
    const counts = tally(5000, () => rng.weightedPick(rows, { weightKey: 'weight_unknown_rival' }));
    assert.equal(counts['roving-threats'], undefined);
  });

  test('exclude accepts ids, arrays and predicates; returns null when nothing is left', (assert) => {
    const rows = tables['Crew Type Table'].rows;
    const all = rows.map((r) => r.id);
    assert.equal(rng.weightedPick(rows, { exclude: all }), null);
    assert.equal(rng.weightedPick(rows, { exclude: all.slice(1) }).id, all[0]);
    assert.equal(rng.weightedPick(rows, { exclude: (r) => r.id !== 'bot' }).id, 'bot');
    assert.equal(rng.eligibleCount(rows, { exclude: 'bot' }), 3);
    assert.equal(rng.rerollTable('Crew Type Table', 'bot', { exclude: all.filter((id) => id !== 'bot') }), null);
  });

  test('unknown table names throw', (assert) => {
    assert.throws(() => rng.rollTable('No Such Table'));
  });

  /* ---------------------------------------------------------------------- */
  group('Effects parser');

  test('stat changes', (assert) => {
    const r = effects.parse('+1 Savvy, +1 Luck');
    assert.equal(r.stats.savvy, 1);
    assert.equal(r.stats.luck, 1);
    assert.equal(effects.parse('+1 Combat Skill').stats.combat, 1);
    assert.equal(effects.parse('+1 Reactions').stats.reactions, 1);
    assert.equal(effects.parse('+2 XP').xp, 2);
  });

  test('resources', (assert) => {
    assert.deepEqual(effects.parse('+2D6 credits').credits, { flat: 0, dice: ['2D6'] });
    assert.deepEqual(effects.parse('+3 credits').credits, { flat: 3, dice: [] });
    const r = effects.parse('Patron, +1 story point');
    assert.equal(r.patrons, 1);
    assert.equal(r.storyPoints, 1);
    assert.equal(effects.parse('Rival').rivals, 1);
    assert.equal(effects.parse('1 Rumor, +1 story point').rumors, 1);
    assert.equal(effects.parse('2 Quest Rumors').rumors, 2);
  });

  test('starting rolls become table names', (assert) => {
    assert.deepEqual(effects.parse('+1 Low-tech Weapon').items, ['Low-tech Weapon Table']);
    assert.deepEqual(effects.parse('+1 High-tech Weapon').items, ['High-tech Weapon Table']);
    assert.deepEqual(effects.parse('+2 Gear').items, ['Gear Table', 'Gear Table']);
    for (const table of Object.values(effects.ITEM_TABLES)) {
      assert.ok(tables[table], table + ' exists');
    }
  });

  test('empty cells and dashes produce nothing', (assert) => {
    for (const text of ['-', '', null, undefined, ' - ']) {
      assert.deepEqual(effects.parse(text), effects.empty(), show(text));
    }
  });

  test('unrecognised text is kept, not dropped', (assert) => {
    assert.deepEqual(effects.parse('+1 Charisma, Rival').unknown, ['+1 Charisma']);
  });

  test('every Background, Motivation and Class cell parses completely', (assert) => {
    for (const name of ['Background Table', 'Motivation Table', 'Class Table']) {
      for (const row of tables[name].rows) {
        const r = effects.parseRow(row);
        assert.deepEqual(r.unknown, [], name + ' / ' + row[tables[name].labelColumn]);
      }
    }
  });

  test('a sample row parses into the expected totals', (assert) => {
    const techGuild = tables['Background Table'].rows.find((r) => r.id === 'tech-guild');
    const r = effects.parseRow(techGuild);
    assert.equal(r.stats.savvy, 1);
    assert.deepEqual(r.credits.dice, ['1D6']);
    assert.deepEqual(r.items, ['High-tech Weapon Table']);
  });

  test('merge sums results', (assert) => {
    const r = effects.merge(effects.parse('+1 Savvy, +1D6 credits'), effects.parse('+1 Savvy, Rival, +1 Gear'), null);
    assert.equal(r.stats.savvy, 2);
    assert.deepEqual(r.credits.dice, ['1D6']);
    assert.equal(r.rivals, 1);
    assert.deepEqual(r.items, ['Gear Table']);
  });

  function show(value) {
    return JSON.stringify(value) === undefined ? 'undefined' : JSON.stringify(value);
  }
})(window.LP);
