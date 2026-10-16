(function (LP) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* Random source                                                          */
  /* ---------------------------------------------------------------------- */

  const cryptoObj = window.crypto && typeof window.crypto.getRandomValues === 'function' ? window.crypto : null;

  function defaultSource() {
    if (cryptoObj) {
      const buffer = new Uint32Array(1);
      cryptoObj.getRandomValues(buffer);
      return buffer[0] / 4294967296; // [0, 1)
    }
    return Math.random();
  }

  let source = defaultSource;

  /** Replace the random source (a function returning [0, 1)). Pass nothing to restore. */
  function setSource(fn) {
    source = typeof fn === 'function' ? fn : defaultSource;
  }

  /** Deterministic source for tests (mulberry32). */
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Integer in [0, n). */
  function int(n) {
    return Math.floor(source() * n);
  }

  /* ---------------------------------------------------------------------- */
  /* Dice                                                                   */
  /* ---------------------------------------------------------------------- */

  const DICE_PATTERN = /^\s*(\d*)\s*[dD]\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/;
  const FLAT_PATTERN = /^\s*([+-]?\d+)\s*$/;

  /**
   * Parse dice notation: "1D6", "D6", "2D6", "1D6 +20", "1D6-1", or a flat "3".
   * Returns { count, sides, modifier } or null.
   */
  function parseDice(notation) {
    const text = String(notation);
    const dice = DICE_PATTERN.exec(text);
    if (dice) {
      const count = dice[1] ? parseInt(dice[1], 10) : 1;
      const sides = parseInt(dice[2], 10);
      if (count < 1 || sides < 1) return null;
      const modifier = dice[3] ? parseInt(dice[3] + dice[4], 10) : 0;
      return { count, sides, modifier };
    }
    const flat = FLAT_PATTERN.exec(text);
    if (flat) return { count: 0, sides: 0, modifier: parseInt(flat[1], 10) };
    return null;
  }

  /** Roll dice. Returns { notation, dice: [..], modifier, total }. Throws on bad notation. */
  function roll(notation) {
    const spec = parseDice(notation);
    if (!spec) throw new Error('Bad dice notation: ' + notation);
    const dice = [];
    for (let i = 0; i < spec.count; i++) dice.push(int(spec.sides) + 1);
    const total = dice.reduce((sum, d) => sum + d, spec.modifier);
    return { notation: String(notation).trim(), dice, modifier: spec.modifier, total };
  }

  /** Lowest and highest possible totals. */
  function diceRange(notation) {
    const spec = parseDice(notation);
    if (!spec) throw new Error('Bad dice notation: ' + notation);
    return { min: spec.count + spec.modifier, max: spec.count * spec.sides + spec.modifier };
  }

  /**
   * Roll again until the total differs from `currentTotal`, keeping the real
   * dice odds. Returns null if no other total is possible.
   */
  function rerollDice(notation, currentTotal) {
    const range = diceRange(notation);
    if (range.min === range.max) return null;
    for (;;) {
      const result = roll(notation);
      if (result.total !== currentTotal) return result;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Weighted tables                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Weighted pick from `rows`.
   *   weightKey: column holding the weight (default 'weight')
   *   exclude:   a row id, an array of ids, or a predicate(row) -> true to skip
   * Rows with zero weight are never picked. Returns null if nothing is eligible.
   */
  function weightedPick(rows, options) {
    const opts = options || {};
    const weightKey = opts.weightKey || 'weight';
    const skip = toPredicate(opts.exclude);

    const eligible = rows.filter((row) => row[weightKey] > 0 && !skip(row));
    const total = eligible.reduce((sum, row) => sum + row[weightKey], 0);
    if (total <= 0) return null;

    let target = source() * total;
    for (const row of eligible) {
      target -= row[weightKey];
      if (target < 0) return row;
    }
    return eligible[eligible.length - 1]; // floating-point safety
  }

  function toPredicate(exclude) {
    if (!exclude) return () => false;
    if (typeof exclude === 'function') return exclude;
    const ids = new Set(Array.isArray(exclude) ? exclude : [exclude]);
    return (row) => ids.has(row.id);
  }

  function getTable(name) {
    const table = LP.data && LP.data.tables && LP.data.tables[name];
    if (!table) throw new Error('Unknown table: ' + name);
    return table;
  }

  /** Roll on a named table. Same options as weightedPick. */
  function rollTable(name, options) {
    return weightedPick(getTable(name).rows, options);
  }

  /** Roll on a named table, never returning the row with id `currentId`. */
  function rerollTable(name, currentId, options) {
    const opts = Object.assign({}, options);
    const extra = toPredicate(opts.exclude);
    opts.exclude = (row) => row.id === currentId || extra(row);
    return weightedPick(getTable(name).rows, opts);
  }

  /** Number of rows that could still be picked (used to disable reroll buttons). */
  function eligibleCount(rows, options) {
    const opts = options || {};
    const weightKey = opts.weightKey || 'weight';
    const skip = toPredicate(opts.exclude);
    return rows.filter((row) => row[weightKey] > 0 && !skip(row)).length;
  }

  LP.rng = {
    setSource,
    seeded,
    int,
    parseDice,
    roll,
    diceRange,
    rerollDice,
    weightedPick,
    getTable,
    rollTable,
    rerollTable,
    eligibleCount
  };
})(window.LP);
