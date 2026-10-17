(function (LP) {
  'use strict';

  /*
   * Battle generation (pp.87-112).
   *
   * Stored as campaign.battle:
   *   {
   *     generated, createdAt,
   *     mission: 'opportunity' | 'patron' | 'quest' | 'quest-finale' | 'rival' | 'rival-attack' | 'invasion',
   *     options: { crewFielded, dangerousJob, securityTeam, lowPriority, varied },
   *     slots: { key: { mode: 'random' | 'fixed' | 'forced', value, dice? } },
   *     events: [{ round, rowId, natural }],
   *     seize: { savvy, outnumbered, feral, gadget, result? }
   *   }
   *
   * Fields are built in order by FIELD builders; each may read earlier slots
   * (the enemy depends on the category, weapons on the enemy, ...). A builder
   * returns null when its field doesn't apply. Field specs:
   *   { key, label, kind: 'table', rows: [{ id, weight, label, range }], exclude: [ids],
   *     forced?, locked? (text shown instead of a value) }
   *   { key, label, kind: 'dice', options: [{ value, label }], roll() -> { value, dice } }
   */

  const rng = LP.rng;
  const E = LP.enemies;
  const M = LP.models;

  const MISSIONS = [
    { id: 'opportunity', label: 'Opportunity mission' },
    { id: 'patron', label: 'Patron job' },
    { id: 'quest', label: 'Quest mission' },
    { id: 'quest-finale', label: 'Quest finale' },
    { id: 'rival', label: 'Attack a Rival (tracked)' },
    { id: 'rival-attack', label: 'Rival attack' },
    { id: 'invasion', label: 'Invasion battle' }
  ];

  /* Turn 'Choose your battle' results -> mission ids. */
  const FROM_TURN = {
    'opportunity': 'opportunity',
    'patron': 'patron',
    'quest': 'quest',
    'rival': 'rival',
    'rival-attack': 'rival-attack',
    'invasion': 'invasion'
  };

  const OBJECTIVE_TEXT = {
    'access': 'Reach the console at the centre and gain access: 1D6 + Savvy, 6+, a Combat Action per attempt, up to two characters a round. Soulless can try from within 6"; Engineers and Bots add +1. A natural 1 hardens the system; a second natural 1 fails the mission (Engineers ignore natural 1s).',
    'acquire': 'An item is at the centre. A crew member must move into contact, take a Combat Action, then carry it off the table. If the carrier becomes a casualty, roll 1D6: on a 1 it is destroyed, otherwise it can be picked up again.',
    'defend': 'Drive off the enemy: to Win you must Hold the Field. Cautious, Defensive or Tactical enemies become Aggressive. +1 enemy (included in the numbers).',
    'deliver': 'A crew member carries a package to the exact centre and places it with a Combat Action. If the carrier becomes a casualty, roll 1D6: on a 1 it is destroyed, otherwise it can be picked up. Driving off all enemies wins if the package is undamaged.',
    'eliminate': 'A random enemy figure is the target: kill them to Win. If they would Bail, they stay in place for one more round (can shoot and fight but not move); if they survive it, they escape.',
    'fight-off': 'No objective beyond driving off the enemy: Hold the Field to Win.',
    'move-through': 'Get at least 2 crew members off the opposing battlefield edge. If you drive off all enemies, you Win as long as 2 crew remain.',
    'patrol': 'Pick 3 random large terrain features. A crew member must end a move within 2" of each. Then you Win.',
    'protect': 'A VIP (Reactions 1, Speed 4", CS +0, Toughness 3, unarmed) joins you, set up 12" or more from the centre; the enemy sets up 12" from the centre on their side. The VIP spending a full round within 3" of the centre wins; within the first 4 rounds earns +2 credits.',
    'search': 'Put a token on each medium or large terrain feature. A character there can search as a Combat Action: 1D6, 5+ finds it and you Win. If every location fails, it isn’t here. If you drive the enemy off, roll for the remaining features at once.',
    'secure': 'End 2 consecutive rounds with crew within 2" of the centre (a crew member with an enemy within 6" doesn’t count). Then you Win.'
  };

  const RIVAL_ATTACK_TEXT = {
    'ambush': 'Deploy one crew member fewer than standard, and you can’t roll to Seize the Initiative.',
    'brought-friends': 'Add 1 enemy (included in the numbers).',
    'showdown': 'A straight-up fight. No modifications.',
    'assault': 'Add 1 enemy (included in the numbers). Your crew all set up in or next to a building. Fail to Hold the Field and lose 1D3 credits.',
    'raid': 'Fail to Hold the Field and your ship takes 1D6+1 Hull damage. Put a ship on the table if you have one.'
  };

  const EDGES = ['North', 'East', 'South', 'West'];

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                                */
  /* ---------------------------------------------------------------------- */

  function missionLabel(id) {
    const m = MISSIONS.find((x) => x.id === id);
    return m ? m.label : id;
  }

  function tableRows(tableName, weightKey, labelOf) {
    const t = rng.getTable(tableName);
    return t.rows
      .filter((r) => r[weightKey || 'weight'] > 0)
      .map((r) => ({
        id: r.id,
        weight: r[weightKey || 'weight'],
        label: labelOf ? labelOf(r) : r[t.labelColumn],
        range: r.ranges ? r.ranges[weightKey || 'weight'] : null
      }));
  }

  function slotValue(battle, key) {
    const slot = battle.slots[key];
    return slot ? slot.value : null;
  }

  function sightColumn(mission) {
    if (mission === 'rival' || mission === 'rival-attack') return 'weight_rival';
    if (mission === 'quest' || mission === 'quest-finale') return 'weight_quest';
    return 'weight_opportunity_patron';
  }

  function categoryColumn(mission) {
    if (mission === 'rival' || mission === 'rival-attack') return 'weight_unknown_rival';
    if (mission === 'quest' || mission === 'quest-finale') return 'weight_quest';
    if (mission === 'patron') return 'weight_patron';
    return 'weight_opportunity';
  }

  function worldTraits(ctx) {
    const c = ctx.campaign || {};
    return (c.turnMemory && c.turnMemory.worldTraits) || [];
  }

  function difficulty(ctx) {
    return (ctx.settings && ctx.settings.difficulty) || 'normal';
  }

  function crewSize(ctx) {
    return (ctx.settings && ctx.settings.crewSize) || 6;
  }

  /** The chosen enemy as { table, row id } from the "Table|rowId" slot value. */
  function enemyRef(battle) {
    const value = slotValue(battle, 'enemy');
    if (!value) return null;
    const i = value.indexOf('|');
    return { table: value.slice(0, i), id: value.slice(i + 1) };
  }

  function currentEnemy(battle) {
    const ref = enemyRef(battle);
    return ref ? E.getEnemy(ref.table, ref.id) : null;
  }

  /* ---------------------------------------------------------------------- */
  /* Enemy numbers dice                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * The base number of opponents (p.92):
   *   crew 6: 2D6 keep higher · crew 5: 1D6 · crew 4: 2D6 keep lower.
   * Challenging and harder: dice showing 1-2 are rerolled once before choosing.
   * Interested Parties in Quest missions: dice showing 1 are rerolled once.
   */
  function rollNumbers(ctx, battle) {
    const size = crewSize(ctx);
    const count = size === 5 ? 1 : 2;
    const enemy = currentEnemy(battle);
    const hardMode = ['challenging', 'hardcore', 'insanity'].includes(difficulty(ctx));
    const questParties = enemy && enemy.category === 'interested-parties' && (battle.mission === 'quest' || battle.mission === 'quest-finale');
    const first = [];
    const dice = [];
    for (let i = 0; i < count; i++) {
      let d = rng.roll('1D6').total;
      first.push(d);
      if ((hardMode && d <= 2) || (questParties && d === 1)) d = rng.roll('1D6').total;
      dice.push(d);
    }
    const value = size === 4 ? Math.min(...dice) : Math.max(...dice);
    return { value: value, dice: dice, first: first };
  }

  /* ---------------------------------------------------------------------- */
  /* Field builders                                                         */
  /* ---------------------------------------------------------------------- */

  const DIE_OPTIONS = (min, max, labelOf) => {
    const out = [];
    for (let v = min; v <= max; v++) out.push({ value: v, label: labelOf ? labelOf(v) : String(v) });
    return out;
  };

  function simpleDice(notation) {
    return () => {
      const r = rng.roll(notation);
      return { value: r.total, dice: r.dice };
    };
  }

  const FIELDS = [
    function rivalAttack(battle) {
      if (battle.mission === 'rival') {
        return { key: 'rivalAttack', label: 'Rival attack', kind: 'table', rows: tableRows('Rival Attacks'), forced: 'showdown', lockedBy: 'You tracked them down' };
      }
      if (battle.mission !== 'rival-attack') return null;
      return { key: 'rivalAttack', label: 'Rival attack', kind: 'table', rows: tableRows('Rival Attacks') };
    },

    function deployment(battle) {
      if (battle.mission === 'invasion') return null;
      return { key: 'deployment', label: 'Deployment condition', kind: 'table', rows: tableRows('Deployment Conditions Table', sightColumn(battle.mission)) };
    },

    function sight(battle) {
      if (battle.mission === 'invasion') return null;
      return { key: 'sight', label: 'Notable sight', kind: 'table', rows: tableRows('Notable Sights Table', sightColumn(battle.mission)) };
    },

    function objective(battle) {
      const m = battle.mission;
      if (m === 'rival' || m === 'rival-attack') return { key: 'objective', label: 'Objective', kind: 'locked', text: 'No objective: Hold the Field for a better chance of chasing them off for good.' };
      if (m === 'invasion') return { key: 'objective', label: 'Objective', kind: 'locked', text: 'Survive 6 rounds, then flee or fight on until you Hold the Field. No Win condition. Anyone leaving the table before round 6 becomes a casualty.' };
      if (m === 'quest-finale') return { key: 'objective', label: 'Objective', kind: 'table', rows: tableRows('Quest Mission Objectives'), forced: 'fight-off', lockedBy: 'Quest finale' };
      const table = m === 'patron' ? 'Patron Mission Objectives' : (m === 'quest' ? 'Quest Mission Objectives' : 'Opportunity Mission Objectives');
      return { key: 'objective', label: 'Objective', kind: 'table', rows: tableRows(table) };
    },

    function category(battle, ctx) {
      if (battle.mission === 'invasion') return null;
      const column = categoryColumn(battle.mission);
      const rows = tableRows('Enemy Encounter Category Table', column);
      // Categories with no enabled models can't be rolled.
      const exclude = rows.filter((r) => M.enabledRows(ctx.campaign, E.CATEGORIES[r.id].table).length === 0).map((r) => r.id);
      return { key: 'category', label: battle.mission.startsWith('rival') ? 'Enemy category (Unknown Rival)' : 'Enemy category', kind: 'table', rows, exclude };
    },

    function enemy(battle, ctx) {
      const campaign = ctx.campaign;
      if (battle.mission === 'invasion') {
        const rows = [];
        const exclude = [];
        for (const tableName of M.ENEMY_TABLES) {
          for (const r of rng.getTable(tableName).rows) {
            const id = tableName + '|' + r.id;
            const usable = M.isInvasion(campaign, tableName, r.id) && M.isEnabled(campaign, tableName, r.id);
            rows.push({ id, weight: r.weight, label: r.enemy + ' (' + tableName + ')' + (usable ? '' : M.isEnabled(campaign, tableName, r.id) ? '' : ' — no models') });
            if (!usable) exclude.push(id);
          }
        }
        return { key: 'enemy', label: 'Invading enemy', kind: 'table', rows, exclude };
      }
      const cat = slotValue(battle, 'category');
      if (!cat) return { key: 'enemy', label: 'Enemy', kind: 'locked', text: 'Roll the enemy category first.' };
      const tableName = E.CATEGORIES[cat].table;
      const rows = rng.getTable(tableName).rows.map((r) => ({
        id: tableName + '|' + r.id,
        weight: r.weight,
        label: r.enemy + (M.isEnabled(campaign, tableName, r.id) ? '' : ' — no models'),
        range: r.ranges.weight
      }));
      const exclude = rng.getTable(tableName).rows.filter((r) => !M.isEnabled(campaign, tableName, r.id)).map((r) => tableName + '|' + r.id);
      return { key: 'enemy', label: 'Enemy', kind: 'table', rows, exclude };
    },

    function numbers(battle, ctx) {
      if (!currentEnemy(battle)) return null;
      const size = crewSize(ctx);
      const how = size === 5 ? '1D6' : (size === 4 ? '2D6, keep lower' : '2D6, keep higher');
      return {
        key: 'numbers', label: 'Enemy numbers (' + how + ')', kind: 'dice',
        options: DIE_OPTIONS(1, 6),
        roll: () => rollNumbers(ctx, battle)
      };
    },

    function weaponBasic(battle) {
      const e = currentEnemy(battle);
      if (!e || !e.weapons.code) return null;
      const column = 'weapon_' + e.weapons.code.basic;
      return {
        key: 'weaponBasic', label: battle.options.varied ? 'Weapon, group 1 (column ' + e.weapons.code.basic + ')' : 'Weapon (column ' + e.weapons.code.basic + ')',
        kind: 'table', rows: tableRows('Varied Armaments Table', 'weight', (r) => r[column])
      };
    },

    function weaponBasic2(battle) {
      const e = currentEnemy(battle);
      if (!e || !e.weapons.code || !battle.options.varied) return null;
      const column = 'weapon_' + e.weapons.code.basic;
      return { key: 'weaponBasic2', label: 'Weapon, group 2 (column ' + e.weapons.code.basic + ')', kind: 'table', rows: tableRows('Varied Armaments Table', 'weight', (r) => r[column]) };
    },

    function weaponSpecialist(battle, ctx) {
      const e = currentEnemy(battle);
      if (!e || !e.weapons.code) return null;
      if (force(battle, ctx).specialists === 0) return null;
      const column = 'specialist_' + e.weapons.code.specialist.toLowerCase();
      return { key: 'weaponSpecialist', label: 'Specialist weapon (column ' + e.weapons.code.specialist + ')', kind: 'table', rows: tableRows('Specialists Table', 'weight', (r) => r[column]) };
    },

    function uniqueCheck(battle, ctx) {
      const e = currentEnemy(battle);
      if (!e) return null;
      if (difficulty(ctx) === 'insanity') {
        return { key: 'uniqueCheck', label: 'Insanity: a second Unique Individual on 11–12 (2D6)', kind: 'dice', options: DIE_OPTIONS(2, 12), roll: simpleDice('2D6') };
      }
      if (battle.mission === 'invasion' || e.category === 'roving-threats') return null;
      return { key: 'uniqueCheck', label: 'Unique Individual? (2D6, 9+)', kind: 'dice', options: DIE_OPTIONS(2, 12), roll: simpleDice('2D6') };
    },

    function unique(battle, ctx) {
      const u = uniqueStatus(battle, ctx);
      if (!u.count) return null;
      return { key: 'unique', label: 'Unique Individual', kind: 'table', rows: tableRows('Unique Individuals', 'weight', (r) => r.enemy) };
    },

    function unique2(battle, ctx) {
      if (uniqueStatus(battle, ctx).count < 2) return null;
      return { key: 'unique2', label: 'Second Unique Individual', kind: 'table', rows: tableRows('Unique Individuals', 'weight', (r) => r.enemy) };
    },

    function bounty(battle) {
      const e = currentEnemy(battle);
      if (!e || e.category !== 'criminal-elements') return null;
      return { key: 'bounty', label: 'Criminal bounty (1D6: 1–3 pays that many credits)', kind: 'dice', options: DIE_OPTIONS(1, 6), roll: simpleDice('1D6') };
    },

    function edge() {
      return { key: 'edge', label: 'Your battlefield edge', kind: 'dice', options: DIE_OPTIONS(1, 4, (v) => EDGES[v - 1]), roll: simpleDice('1D4') };
    },

    function sightDistance(battle) {
      const s = slotValue(battle, 'sight');
      if (!s || s === 'nothing-special' || battle.mission === 'invasion') return null;
      return { key: 'sightDistance', label: 'Notable sight distance (2D6+2")', kind: 'dice', options: DIE_OPTIONS(4, 14, (v) => v + '"'), roll: simpleDice('2D6+2') };
    },

    function sightDirection(battle) {
      const s = slotValue(battle, 'sight');
      if (!s || s === 'nothing-special' || battle.mission === 'invasion') return null;
      return { key: 'sightDirection', label: 'Notable sight direction (D12 clock)', kind: 'dice', options: DIE_OPTIONS(1, 12, (v) => v + ' o’clock'), roll: simpleDice('1D12') };
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* Derived values                                                         */
  /* ---------------------------------------------------------------------- */

  /** How many Unique Individuals are present: { count, reason }. */
  function uniqueStatus(battle, ctx) {
    const e = currentEnemy(battle);
    if (!e) return { count: 0, reason: '' };
    const check = slotValue(battle, 'uniqueCheck');
    if (difficulty(ctx) === 'insanity') {
      return { count: check !== null && check >= 11 ? 2 : 1, reason: 'Insanity: a Unique Individual is always present.' };
    }
    if (battle.mission === 'invasion') return { count: 0, reason: 'No Unique Individuals in Invasion battles.' };
    if (e.category === 'roving-threats') return { count: 0, reason: 'Roving Threats are never accompanied by Unique Individuals.' };
    if (check === null) return { count: 0, reason: '' };
    const total = check + uniqueMods(battle, ctx).reduce((s, m) => s + m.value, 0);
    return { count: total >= 9 ? 1 : 0, reason: '', total: total };
  }

  function uniqueMods(battle, ctx) {
    const e = currentEnemy(battle);
    const mods = [];
    if (e && e.category === 'interested-parties') mods.push({ label: 'Interested Parties', value: 1 });
    if (difficulty(ctx) === 'hardcore') mods.push({ label: 'Hardcore', value: 1 });
    return mods;
  }

  /**
   * The enemy force: total figures, modifiers, Specialists, Lieutenant.
   * Returns { base, modifiers: [{ label, value }], total, specialists, lieutenant, regulars }.
   */
  function force(battle, ctx) {
    const e = currentEnemy(battle);
    const base = slotValue(battle, 'numbers');
    if (!e || base === null) return { base: null, modifiers: [], total: 0, specialists: 0, lieutenant: false, regulars: 0 };

    const o = battle.options || {};
    const mods = [];
    const add = (label, value) => { if (value) mods.push({ label, value }); };
    add(e.name + ' Numbers', e.numbers);
    if (slotValue(battle, 'objective') === 'defend') add('Defend objective', 1);
    if (battle.mission === 'quest-finale') add('Quest finale', 1);
    const attack = slotValue(battle, 'rivalAttack');
    if (battle.mission === 'rival-attack' && attack === 'brought-friends') add('Brought friends', 1);
    if (battle.mission === 'rival-attack' && attack === 'assault') add('Assault', 1);
    if ((battle.mission === 'rival' || battle.mission === 'rival-attack') && e.rivalGrudge) add('Grudge (as Rivals)', 1);
    if (battle.mission === 'invasion') add('Invasion', 2);
    if (battle.mission === 'patron') {
      if (o.dangerousJob) add('Dangerous Job', 1);
      if (o.securityTeam) add('Security Team', -1);
      if (o.lowPriority) add('Low Priority', -1);
    }
    const traits = worldTraits(ctx);
    if (e.category === 'criminal-elements' && traits.includes('heavily-enforced')) add('Heavily enforced', -1);
    if (e.category === 'criminal-elements' && traits.includes('rampant-crime')) add('Rampant crime', 1);
    if (e.category === 'roving-threats' && traits.includes('dangerous')) add('Dangerous world', 1);
    const fielded = o.crewFielded || crewSize(ctx);
    if (fielded <= crewSize(ctx) - 2) add('Crew 2+ below standard', -1);

    let total = base + mods.reduce((s, m) => s + m.value, 0);
    if (slotValue(battle, 'deployment') === 'small-encounter') {
      const cut = total > fielded ? 2 : 1;
      add('Small encounter', -cut);
      total -= cut;
    }
    if (difficulty(ctx) === 'easy' && total >= 5) {
      add('Easy', -1);
      total -= 1;
    }
    if (difficulty(ctx) === 'hardcore' || difficulty(ctx) === 'insanity') {
      add(difficulty(ctx) === 'hardcore' ? 'Hardcore' : 'Insanity', 1);
      total += 1;
    }
    total = Math.max(1, total);

    let specialists = total <= 2 ? 0 : (total <= 6 ? 1 : 2);
    if (difficulty(ctx) === 'insanity') specialists += 1;
    specialists = Math.min(specialists, total);
    const lieutenant = total >= 4 && total - specialists >= 1;
    return { base, modifiers: mods, total, specialists, lieutenant, regulars: total - specialists - (lieutenant ? 1 : 0) };
  }

  /* ---------------------------------------------------------------------- */
  /* Model operations                                                       */
  /* ---------------------------------------------------------------------- */

  function newBattle(ctx, mission) {
    const battle = {
      generated: false,
      createdAt: new Date().toISOString(),
      mission: mission || 'opportunity',
      options: { crewFielded: crewSize(ctx), dangerousJob: false, securityTeam: false, lowPriority: false, varied: false },
      slots: {},
      events: [],
      seize: { savvy: 0, outnumbered: null, feral: false, gadget: false, result: null }
    };
    return sync(battle, ctx);
  }

  /** Repair stored data; returns a usable battle or null. */
  function normalize(raw, ctx) {
    if (!raw || typeof raw !== 'object') return null;
    const battle = {
      generated: !!raw.generated,
      createdAt: raw.createdAt || new Date().toISOString(),
      mission: MISSIONS.some((m) => m.id === raw.mission) ? raw.mission : 'opportunity',
      options: Object.assign({ crewFielded: crewSize(ctx), dangerousJob: false, securityTeam: false, lowPriority: false, varied: false }, raw.options || {}),
      slots: raw.slots && typeof raw.slots === 'object' ? raw.slots : {},
      events: Array.isArray(raw.events) ? raw.events : [],
      seize: Object.assign({ savvy: 0, outnumbered: null, feral: false, gadget: false, result: null }, raw.seize || {})
    };
    return sync(battle, ctx);
  }

  function rollSpec(spec, different, slot) {
    if (spec.kind === 'dice') {
      for (let i = 0; i < 200; i++) {
        const r = spec.roll();
        if (!different || r.value !== slot.value) return r;
      }
      return null;
    }
    const exclude = (spec.exclude || []).slice();
    if (different && slot.value) exclude.push(slot.value);
    const row = rng.weightedPick(spec.rows, { exclude });
    return row ? { value: row.id } : null;
  }

  function valid(spec, value) {
    if (value === null || value === undefined) return false;
    if (spec.kind === 'dice') return spec.options.some((o) => o.value === value);
    return spec.rows.some((r) => r.id === value);
  }

  /** Walk the field builders, fixing up slots; rolls empty Random slots once generated. */
  function sync(battle, ctx) {
    const slots = {};
    for (const build of FIELDS) {
      const spec = build(battle, ctx);
      const key = build.name;
      if (!spec || spec.kind === 'locked') {
        delete battle.slots[key];
        continue;
      }
      const slot = battle.slots[key] || { mode: 'random', value: null };
      battle.slots[key] = slot; // visible to later builders
      if (spec.forced) {
        slot.mode = 'forced';
        slot.value = spec.forced;
      } else {
        if (slot.mode === 'forced') {
          slot.mode = 'random';
          slot.value = null;
        }
        if (slot.value !== null && !valid(spec, slot.value)) {
          slot.mode = 'random';
          slot.value = null;
        }
        // A Random value that is now excluded (e.g. its models were switched off) is rolled again.
        if (slot.mode === 'random' && slot.value !== null && spec.kind === 'table' && (spec.exclude || []).includes(slot.value)) {
          slot.value = null;
        }
        if (battle.generated && slot.mode === 'random' && slot.value === null) {
          const r = rollSpec(spec, false, slot);
          if (r) Object.assign(slot, r);
        }
      }
      slots[key] = slot;
    }
    battle.slots = slots;
    return battle;
  }

  /** Visible fields in order, with their specs, for the UI. */
  function fields(battle, ctx) {
    const out = [];
    for (const build of FIELDS) {
      const spec = build(battle, ctx);
      if (spec) out.push(spec);
    }
    return out;
  }

  function specFor(battle, ctx, key) {
    return fields(battle, ctx).find((s) => s.key === key) || null;
  }

  /** Roll every Random field (fresh rolls). Fixed and forced fields stay. */
  function generate(battle, ctx) {
    battle.generated = true;
    battle.createdAt = new Date().toISOString();
    for (const slot of Object.values(battle.slots)) {
      if (slot.mode === 'random') {
        slot.value = null;
        delete slot.dice;
        delete slot.first;
      }
    }
    battle.events = [];
    battle.seize.result = null;
    return sync(battle, ctx);
  }

  function canReroll(battle, ctx, key) {
    const slot = battle.slots[key];
    const spec = specFor(battle, ctx, key);
    if (!slot || !spec || slot.mode !== 'random' || slot.value === null) return false;
    if (spec.kind === 'dice') return spec.options.length > 1;
    const exclude = (spec.exclude || []).concat([slot.value]);
    return rng.eligibleCount(spec.rows, { exclude }) > 0;
  }

  function reroll(battle, ctx, key) {
    if (!canReroll(battle, ctx, key)) return false;
    const slot = battle.slots[key];
    const r = rollSpec(specFor(battle, ctx, key), true, slot);
    if (!r) return false;
    delete slot.dice;
    delete slot.first;
    Object.assign(slot, r);
    sync(battle, ctx);
    return true;
  }

  function setFixed(battle, ctx, key, value) {
    const slot = battle.slots[key];
    const spec = specFor(battle, ctx, key);
    if (!slot || !spec || slot.mode === 'forced' || !valid(spec, value)) return false;
    slot.mode = 'fixed';
    slot.value = value;
    delete slot.dice;
    delete slot.first;
    sync(battle, ctx);
    return true;
  }

  function setRandom(battle, ctx, key) {
    const slot = battle.slots[key];
    if (!slot || slot.mode === 'forced') return false;
    slot.mode = 'random';
    sync(battle, ctx);
    return true;
  }

  function setMission(battle, ctx, mission) {
    if (!MISSIONS.some((m) => m.id === mission)) return false;
    battle.mission = mission;
    sync(battle, ctx);
    return true;
  }

  function setOption(battle, ctx, key, value) {
    battle.options[key] = value;
    sync(battle, ctx);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Resolution                                                             */
  /* ---------------------------------------------------------------------- */

  function rowOf(tableName, id) {
    return rng.getTable(tableName).rows.find((r) => r.id === id) || null;
  }

  /** Weapons carried by each part of the force, as text. */
  function armament(battle, enemy, f) {
    const w = enemy.weapons;
    const out = { regular: '', regular2: '', specialist: '', lieutenant: '', notes: [] };
    if (w.fixed) {
      out.regular = w.fixed;
      out.specialist = w.fixed;
      out.lieutenant = w.fixed + (enemy.beast ? '' : ' + Blade');
      if (enemy.beast) out.notes.push('Animals: the Lieutenant is a pack leader (+1 Combat Skill, no other changes).');
      return out;
    }
    if (w.blades) {
      out.regular = 'Blade';
      out.specialist = 'Brutal Melee Weapon';
      out.lieutenant = 'Blade (and a second Blade)';
      return out;
    }
    const column = 'weapon_' + w.code.basic;
    const basic = rowOf('Varied Armaments Table', slotValue(battle, 'weaponBasic'));
    const basic2 = rowOf('Varied Armaments Table', slotValue(battle, 'weaponBasic2'));
    const spec = rowOf('Specialists Table', slotValue(battle, 'weaponSpecialist'));
    const blade = enemy.ai === 'A' && enemy.combat > 0 ? ' + Blade' : '';
    out.regular = basic ? basic[column] + blade : '';
    out.regular2 = basic2 ? basic2[column] + blade : '';
    out.specialist = spec ? spec['specialist_' + w.code.specialist.toLowerCase()] + blade : '';
    out.lieutenant = basic ? basic[column] + ' + Blade' : '';
    if (blade) out.notes.push('Aggressive enemies with Combat Skill above +0 also carry a Blade.');
    return out;
  }

  /**
   * Everything the UI and the Post-Battle stages need.
   */
  function resolve(battle, ctx) {
    const enemy = currentEnemy(battle);
    const f = force(battle, ctx);
    const objectiveSpec = specFor(battle, ctx, 'objective');
    const objectiveId = slotValue(battle, 'objective');
    const objectiveRow = objectiveId && objectiveSpec && objectiveSpec.kind === 'table'
      ? objectiveSpec.rows.find((r) => r.id === objectiveId) : null;

    const deployment = rowOf('Deployment Conditions Table', slotValue(battle, 'deployment'));
    const sight = rowOf('Notable Sights Table', slotValue(battle, 'sight'));
    const attackId = slotValue(battle, 'rivalAttack');
    const attack = attackId ? rowOf('Rival Attacks', attackId) : null;
    const us = uniqueStatus(battle, ctx);
    const uniques = [];
    for (const key of ['unique', 'unique2']) {
      const row = rowOf('Unique Individuals', slotValue(battle, key));
      if (row && uniques.length < us.count) uniques.push(E.parseUnique(row, enemy));
    }
    const bounty = slotValue(battle, 'bounty');
    const edgeValue = slotValue(battle, 'edge');

    return {
      mission: battle.mission,
      missionLabel: missionLabel(battle.mission),
      rivalAttack: attack ? { id: attack.id, title: attack.attack, text: RIVAL_ATTACK_TEXT[attack.id] || '' } : null,
      deployment: deployment ? { id: deployment.id, title: deployment.title, text: deployment.effect } : null,
      sight: sight ? { id: sight.id, title: sight.title, text: sight.effect } : null,
      objective: objectiveSpec && objectiveSpec.kind === 'locked'
        ? { id: null, title: battle.mission === 'invasion' ? 'Survive' : 'No objective', text: objectiveSpec.text }
        : (objectiveRow ? { id: objectiveRow.id, title: objectiveRow.label, text: OBJECTIVE_TEXT[objectiveRow.id] || '' } : null),
      enemy: enemy,
      categoryRules: enemy ? E.CATEGORIES[enemy.category].rules : [],
      force: f,
      weapons: enemy ? armament(battle, enemy, f) : null,
      uniques: uniques,
      uniqueReason: us.reason,
      uniqueTotal: us.total,
      uniqueMods: uniqueMods(battle, ctx),
      bounty: bounty === null ? null : (bounty <= 3 ? bounty : 0),
      edge: edgeValue ? { mine: EDGES[edgeValue - 1], theirs: EDGES[(edgeValue + 1) % 4] } : null,
      deploymentPattern: enemy ? E.DEPLOYMENT[enemy.ai] || '' : '',
      sightPlacement: slotValue(battle, 'sightDistance') !== null && slotValue(battle, 'sightDirection') !== null
        ? slotValue(battle, 'sightDistance') + '" from the centre, toward ' + slotValue(battle, 'sightDirection') + ' o’clock' : null,
      complete: !!enemy && f.base !== null
    };
  }

  /** Short facts the Post-Battle stages can pre-fill from. */
  function summary(battle, ctx) {
    const r = resolve(battle, ctx);
    return {
      mission: r.mission,
      enemyCategory: r.enemy ? r.enemy.category : null,
      enemyName: r.enemy ? r.enemy.name : null,
      invasionThreat: r.enemy ? r.enemy.invasionThreat : false,
      uniqueIndividual: r.uniques.length > 0,
      bounty: r.bounty,
      sight: r.sight ? r.sight.id : null,
      extraLoot: r.enemy ? r.enemy.extraLoot : false,
      extraFinds: r.enemy ? r.enemy.extraFinds : false,
      intrigue: r.enemy ? r.enemy.intrigue : false
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Seize the Initiative (p.112) and Battle Events (p.116)                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Modifiers for Seize the Initiative.
   * Returns { cannot: reason | null, unmodified: bool, modifiers: [{ label, value }] }.
   */
  function seizeModifiers(battle, ctx) {
    const r = resolve(battle, ctx);
    const s = battle.seize;
    const e = r.enemy;
    if (battle.mission === 'rival-attack' && slotValue(battle, 'rivalAttack') === 'ambush') return { cannot: 'Ambush: you can’t Seize the Initiative.', unmodified: false, modifiers: [] };
    if (e && e.seize && e.seize.cannot) return { cannot: e.name + ': you cannot Seize the Initiative.', unmodified: false, modifiers: [] };
    if (e && e.seize && e.seize.unmodified) {
      return { cannot: null, unmodified: true, modifiers: [{ label: 'highest Savvy', value: s.savvy || 0 }] };
    }
    const mods = [{ label: 'highest Savvy', value: s.savvy || 0 }];
    const enemyMods = [];
    if (e && e.category === 'hired-muscle') enemyMods.push({ label: 'Hired Muscle', value: -1 });
    if (e && e.seize && e.seize.modifier) enemyMods.push({ label: e.name, value: e.seize.modifier });
    for (const m of enemyMods) {
      // A Feral in the crew ignores penalties the enemy imposes.
      if (s.feral && m.value < 0) mods.push({ label: m.label + ' (ignored: Feral)', value: 0 });
      else mods.push(m);
    }
    const outnumbered = s.outnumbered !== null ? s.outnumbered : (r.force.total + r.uniques.length) > (battle.options.crewFielded || crewSize(ctx));
    if (outnumbered) mods.push({ label: 'outnumbered', value: 1 });
    if (s.gadget) mods.push({ label: 'Motion tracker / Scanner bot', value: 1 });
    if (difficulty(ctx) === 'hardcore') mods.push({ label: 'Hardcore', value: -2 });
    if (difficulty(ctx) === 'insanity') mods.push({ label: 'Insanity', value: -3 });
    return { cannot: null, unmodified: false, modifiers: mods.filter((m) => m.value !== 0 || m.label === 'highest Savvy' || /ignored/.test(m.label)) };
  }

  function rollSeize(battle, ctx) {
    const mods = seizeModifiers(battle, ctx);
    if (mods.cannot) {
      battle.seize.result = null;
      return null;
    }
    const r = rng.roll('2D6');
    const total = r.total + mods.modifiers.reduce((s, m) => s + m.value, 0);
    battle.seize.result = { dice: r.dice, modifiers: mods.modifiers, total: total, success: total >= 10 };
    return battle.seize.result;
  }

  /** Roll the Battle Event for the end of round 2 or 4 (replaces an earlier roll for that round). */
  function rollEvent(battle, round) {
    const r = rng.rollOn('Battle Events Table');
    battle.events = battle.events.filter((ev) => ev.round !== round);
    battle.events.push({ round: round, rowId: r.row.id, natural: r.natural });
    battle.events.sort((a, b) => a.round - b.round);
    return battle.events;
  }

  LP.battle = {
    MISSIONS, FROM_TURN, OBJECTIVE_TEXT, RIVAL_ATTACK_TEXT, EDGES,
    missionLabel, newBattle, normalize, sync, fields, generate, canReroll, reroll,
    setFixed, setRandom, setMission, setOption, force, uniqueStatus, resolve, summary,
    seizeModifiers, rollSeize, rollEvent, rollNumbers
  };
})(window.LP);
