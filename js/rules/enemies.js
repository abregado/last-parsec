(function (LP) {
  'use strict';

  /*
   * Reads enemy rows (pp.94-107) into structured profiles: stats, AI,
   * weapon code or fixed weapons, and the special rules the app applies
   * (Seize the Initiative modifiers, Invasion Threat, Saving Throw...).
   */

  const rng = LP.rng;

  const AI_NAMES = {
    A: 'Aggressive',
    C: 'Cautious',
    D: 'Defensive',
    G: 'Guardian',
    R: 'Rampage',
    T: 'Tactical',
    B: 'Beast'
  };

  /* Deployment pattern by AI type (p.110). */
  const DEPLOYMENT = {
    A: 'One cluster, figures 1" apart.',
    R: 'One cluster, figures 1" apart.',
    T: 'Three teams 8" apart; team members 1–2" apart.',
    D: 'Three teams 8" apart; team members 1–2" apart.',
    C: 'Two groups 6" apart; members 1.5–2" apart.',
    B: 'Pairs: divide the table into thirds and place a pair in each, 2" between figures. Any odd figure stands alone.',
    G: 'Set up with the figure they guard.'
  };

  /* Encounter category id -> table name and category-wide rules. */
  const CATEGORIES = {
    'criminal-elements': {
      table: 'Criminal Elements',
      rules: [
        'Bounty: roll 1D6 at setup; on 1–3 that many bonus credits are paid if you Hold the Field.',
        'Rivals: roll 2D6 to see if they become Rivals: a 1 on either die makes them Rivals. Double 1s: they hate you and add +1 to their numbers in all battles.'
      ]
    },
    'hired-muscle': {
      table: 'Hired Muscle',
      rules: ['Paid professionals: you are −1 to Seize the Initiative (on top of their own modifiers).']
    },
    'interested-parties': {
      table: 'Interested Parties',
      rules: [
        '+1 when rolling for Unique Individuals.',
        'In Quest missions, reroll any die scoring 1 once when rolling enemy numbers.'
      ]
    },
    'roving-threats': {
      table: 'Roving Threats',
      rules: [
        'Never become Rivals.',
        'Never accompanied by Unique Individuals (except on Insanity).'
      ]
    }
  };

  function categoryOfTable(tableName) {
    return Object.keys(CATEGORIES).find((id) => CATEGORIES[id].table === tableName) || null;
  }

  function int(text) {
    const n = parseInt(String(text).replace(/[^\d+-]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  /** Sentences of the notes that mention a phrase. */
  function sentence(notes, pattern) {
    const m = notes.match(new RegExp('[^.]*' + pattern + '[^.]*\\.?', 'i'));
    return m ? m[0].trim() : null;
  }

  /** Seize the Initiative effect from the notes. */
  function seizeRule(notes) {
    if (/cannot Seize the Initiative/i.test(notes)) return { cannot: true };
    if (/Seize the Initiative roll is always unmodified/i.test(notes)) return { unmodified: true };
    const m = notes.match(/You are ([+-]\d) to (?:any attempt to )?Seize the Initiative/i);
    return m ? { modifier: parseInt(m[1], 10) } : null;
  }

  /**
   * Profile for a row of one of the four enemy tables.
   *   weapons: { code: { basic: 1-3, specialist: 'A'-'C' } } or { fixed: 'Claws (Damage +1)' }
   *            or { blades: true } for Primitives (Blades; Specialists carry Brutal Melee Weapons)
   */
  function parse(tableName, row) {
    const notes = row.notes || '';
    const code = /^\s*([123])\s*([ABC])\s*$/.exec(row.weapons || '');
    let weapons;
    if (code) weapons = { code: { basic: parseInt(code[1], 10), specialist: code[2] } };
    else if (/Going medieval/i.test(notes)) weapons = { blades: true };
    else weapons = { fixed: row.weapons };

    const save = notes.match(/(\d)\+ (?:Armor )?Saving Throw/i);
    return {
      id: row.id,
      table: tableName,
      category: categoryOfTable(tableName),
      name: row.enemy,
      numbers: int(row.numbers),
      panic: row.panic,
      speed: row.speed,
      combat: int(row.combat_skill),
      toughness: int(row.tough_ness),
      ai: row.ai,
      aiName: AI_NAMES[row.ai] || row.ai,
      weapons: weapons,
      beast: !code && !/Going medieval/i.test(notes),
      notes: notes,
      seize: seizeRule(notes),
      save: save ? save[1] + '+' : null,
      invasionThreat: /invasion threat/i.test(notes),
      fearless: /Fearless: Never affected by Morale/i.test(notes),
      rivalGrudge: /Grudge: If encountered as Rivals, they bring one additional figure/i.test(notes),
      extraLoot: !!sentence(notes, 'extra Loot roll'),
      extraFinds: !!sentence(notes, 'Roll twice on the Battlefield Finds Table'),
      intrigue: !!sentence(notes, 'Intrigue:')
    };
  }

  function getEnemy(tableName, rowId) {
    const row = rng.getTable(tableName).rows.find((r) => r.id === rowId);
    return row ? parse(tableName, row) : null;
  }

  /* The first three Unique Individuals are adjustments to the main enemy (p.105). */
  const RELATIVE_UNIQUES = ['enemy-bruiser', 'enemy-heavy', 'enemy-boss'];

  function relative(value, base, suffix) {
    const text = String(value).trim();
    if (text === '-' || text === '') return base;
    if (/^[+-]\d+$/.test(text)) return base + parseInt(text, 10);
    return int(text) || base;
  }

  /** A Unique Individual's profile, worked out against the main enemy where needed. */
  function parseUnique(row, main) {
    const isRelative = RELATIVE_UNIQUES.includes(row.id);
    const base = main || { combat: 0, toughness: 3, speed: '4"', ai: 'A' };
    const ai = row.ai === '-' ? base.ai : row.ai;
    const save = (row.notes || '').match(/(\d)\+ Saving Throw/i);
    return {
      id: row.id,
      name: row.enemy,
      speed: row.speed === '-' ? base.speed : row.speed,
      combat: isRelative ? relative(row.combat_skill, base.combat) : int(row.combat_skill),
      toughness: isRelative ? relative(row.tough_ness, base.toughness) : int(row.tough_ness),
      ai: ai,
      aiName: AI_NAMES[ai] || ai,
      luck: int(row.luck),
      weapons: row.weapons,
      notes: row.notes || '',
      save: save ? save[1] + '+' : null,
      guardian: ai === 'G'
    };
  }

  LP.enemies = { AI_NAMES, DEPLOYMENT, CATEGORIES, categoryOfTable, parse, getEnemy, parseUnique };
})(window.LP);
