(function (LP) {
  'use strict';

  /*
   * Turns the text in the Background / Motivation / Class tables'
   * effect, resources and starting columns into structured data, e.g.
   *   "+1 Savvy, +1 Luck"        -> stats.savvy 1, stats.luck 1
   *   "Patron, +1 story point"   -> patrons 1, storyPoints 1
   *   "+2D6 credits"             -> credits.dice ['2D6']
   *   "+1 Low-tech Weapon"       -> items ['Low-tech Weapon Table']
   * Anything not understood is kept in `unknown` so it is never silently lost.
   */

  const STAT_NAMES = {
    'reactions': 'reactions',
    'speed': 'speed',
    'combat skill': 'combat',
    'combat': 'combat',
    'toughness': 'toughness',
    'savvy': 'savvy',
    'luck': 'luck'
  };

  const ITEM_TABLES = {
    'low-tech weapon': 'Low-tech Weapon Table',
    'military weapon': 'Military Weapon Table',
    'high-tech weapon': 'High-tech Weapon Table',
    'gear': 'Gear Table',
    'gadget': 'Gadget Table'
  };

  const EMPTY_TEXT = new Set(['', '-', '–', '—']);

  function empty() {
    return {
      stats: { reactions: 0, speed: 0, combat: 0, toughness: 0, savvy: 0, luck: 0 },
      xp: 0,
      credits: { flat: 0, dice: [] },
      storyPoints: 0,
      patrons: 0,
      rivals: 0,
      questRumors: 0,
      items: [],
      unknown: []
    };
  }

  /** "+2" -> 2, "-1" -> -1, "" / undefined -> fallback. */
  function num(text, fallback) {
    return text ? parseInt(text.replace(/\s+/g, ''), 10) : fallback;
  }

  const RULES = [
    {
      pattern: /^([+-]?\s*\d+)\s+(reactions|speed|combat skill|combat|toughness|savvy|luck)$/i,
      apply: (out, m) => { out.stats[STAT_NAMES[m[2].toLowerCase()]] += num(m[1]); }
    },
    {
      pattern: /^([+-]?\s*\d+)\s+xp$/i,
      apply: (out, m) => { out.xp += num(m[1]); }
    },
    {
      pattern: /^\+?\s*(\d*d\d+)\s+credits?$/i,
      apply: (out, m) => { out.credits.dice.push(m[1].toUpperCase().replace(/^D/, '1D')); }
    },
    {
      pattern: /^([+-]?\s*\d+)\s+credits?$/i,
      apply: (out, m) => { out.credits.flat += num(m[1]); }
    },
    {
      pattern: /^([+-]?\s*\d+)\s+story points?$/i,
      apply: (out, m) => { out.storyPoints += num(m[1]); }
    },
    {
      pattern: /^(\+?\s*\d+\s+)?(?:quest\s+)?rumou?rs?$/i,
      apply: (out, m) => { out.questRumors += num(m[1], 1); }
    },
    {
      pattern: /^(\+?\s*\d+\s+)?patrons?$/i,
      apply: (out, m) => { out.patrons += num(m[1], 1); }
    },
    {
      pattern: /^(\+?\s*\d+\s+)?rivals?$/i,
      apply: (out, m) => { out.rivals += num(m[1], 1); }
    },
    {
      pattern: /^\+?\s*(\d+)\s+(low-tech weapon|military weapon|high-tech weapon|gear|gadget)s?$/i,
      apply: (out, m) => {
        const table = ITEM_TABLES[m[2].toLowerCase()];
        for (let i = 0; i < num(m[1]); i++) out.items.push(table);
      }
    }
  ];

  /** Parse one cell of text, adding into `into` (or a new empty result). */
  function parse(text, into) {
    const out = into || empty();
    const value = text === null || text === undefined ? '' : String(text).trim();
    if (EMPTY_TEXT.has(value)) return out;

    for (const raw of value.split(',')) {
      const part = raw.trim();
      if (EMPTY_TEXT.has(part)) continue;
      const rule = RULES.find((r) => r.pattern.test(part));
      if (rule) {
        rule.apply(out, rule.pattern.exec(part));
      } else {
        out.unknown.push(part);
      }
    }
    return out;
  }

  /** Parse a Background / Motivation / Class row's effect, resources and starting columns. */
  function parseRow(row, columns) {
    const out = empty();
    for (const column of columns || ['effect', 'resources', 'starting']) {
      parse(row[column], out);
    }
    return out;
  }

  /** Sum any number of results into a new one. */
  function merge(...results) {
    const out = empty();
    for (const r of results) {
      if (!r) continue;
      for (const stat of Object.keys(out.stats)) out.stats[stat] += r.stats[stat];
      out.xp += r.xp;
      out.credits.flat += r.credits.flat;
      out.credits.dice.push(...r.credits.dice);
      out.storyPoints += r.storyPoints;
      out.patrons += r.patrons;
      out.rivals += r.rivals;
      out.questRumors += r.questRumors;
      out.items.push(...r.items);
      out.unknown.push(...r.unknown);
    }
    return out;
  }

  LP.effects = { empty, parse, parseRow, merge, ITEM_TABLES };
})(window.LP);
