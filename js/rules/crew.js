(function (LP) {
  'use strict';

  /*
   * Crew-level creation (pp.24, 28-32): Leader, starting equipment, credits
   * and resource totals, ship, and flavour.
   *
   * Stored on campaign.crew:
   *   {
   *     generated: false,
   *     leaderId: null,
   *     equipment: ItemSlot[8]   // 3 military (may switch to high-tech), 3 low-tech, gear, gadget
   *     ship: { mode, value, debt: DiceSlot | null },
   *     metThrough: { mode, value },
   *     characterizedAs: { mode, value }
   *   }
   * ItemSlot = { mode, group, table, value }   group = 'military' | 'low-tech' | 'gear' | 'gadget'
   * DiceSlot = { mode, notation, value }
   *
   * Paths: ['equipment', i], ['ship'], ['ship', 'debt'], ['metThrough'], ['characterizedAs']
   */

  const rng = LP.rng;
  const C = LP.character;

  const MILITARY = 'Military Weapon Table';
  const HIGH_TECH = 'High-tech Weapon Table';
  const SHIP = 'Ship Table';
  const MET_THROUGH = 'We Met Through Table';
  const CHARACTERIZED_AS = 'We Are Best Characterized As Table';

  const EQUIPMENT_LAYOUT = [
    { group: 'military', table: MILITARY },
    { group: 'military', table: MILITARY },
    { group: 'military', table: MILITARY },
    { group: 'low-tech', table: 'Low-tech Weapon Table' },
    { group: 'low-tech', table: 'Low-tech Weapon Table' },
    { group: 'low-tech', table: 'Low-tech Weapon Table' },
    { group: 'gear', table: 'Gear Table' },
    { group: 'gadget', table: 'Gadget Table' }
  ];

  const SHIP_TRAITS = {
    'Emergency Drives': 'If you must make an emergency take-off while damaged, reduce the Hull damage from the roll by 3.',
    'Fuel-efficient': 'Fuel costs 1 credit less when traveling to a new world.',
    'Fuel Hog': 'Fuel costs 1 credit more when traveling to a new world.',
    'Standard Issue': 'All Starship Components cost 1 credit less.',
    'Dodgy Drive': 'Whenever the ship takes Hull damage, roll 2D6. If the roll is equal to or below the damage, take 2 more damage.',
    'Armored': 'Whenever the ship takes damage, lose 1 Hull Point less.'
  };

  /* ---------------------------------------------------------------------- */
  /* Structure                                                              */
  /* ---------------------------------------------------------------------- */

  function rowExists(tableName, id) {
    return !!C.findRow(tableName, id);
  }

  function cleanSimple(slot, tableName) {
    const s = slot && typeof slot === 'object' ? slot : {};
    const mode = s.mode === 'fixed' ? 'fixed' : 'random';
    const value = s.value && rowExists(tableName, s.value) ? s.value : null;
    return { mode: value === null && mode === 'fixed' ? 'random' : mode, value: value };
  }

  /** Fill in or repair campaign.crew, then sync it. Returns the crew. */
  function ensure(campaign) {
    const raw = campaign.crew && typeof campaign.crew === 'object' ? campaign.crew : {};
    const equipment = EQUIPMENT_LAYOUT.map((layout, i) => {
      const old = Array.isArray(raw.equipment) ? raw.equipment[i] : null;
      const table = layout.group === 'military' && old && old.table === HIGH_TECH ? HIGH_TECH : layout.table;
      const slot = old && old.table === table ? cleanSimple(old, table) : { mode: 'random', value: null };
      return { mode: slot.mode, group: layout.group, table: table, value: slot.value };
    });

    const ship = cleanSimple(raw.ship, SHIP);
    ship.debt = raw.ship && raw.ship.debt && typeof raw.ship.debt === 'object' ? raw.ship.debt : null;

    campaign.crew = {
      generated: !!raw.generated,
      leaderId: typeof raw.leaderId === 'string' ? raw.leaderId : null,
      equipment: equipment,
      ship: ship,
      metThrough: cleanSimple(raw.metThrough, MET_THROUGH),
      characterizedAs: cleanSimple(raw.characterizedAs, CHARACTERIZED_AS)
    };
    return sync(campaign);
  }

  /** Rebuild the ship's debt roll, drop a missing leader, and roll empty Random slots once generated. */
  function sync(campaign) {
    const crew = campaign.crew;
    const roll = crew.generated;

    if (crew.leaderId && !campaign.characters.some((c) => c.id === crew.leaderId)) {
      crew.leaderId = null;
    }

    const rollTableSlot = (slot, tableName) => {
      if (roll && slot.mode === 'random' && slot.value === null) slot.value = rng.rollTable(tableName).id;
    };

    crew.equipment.forEach((slot) => rollTableSlot(slot, slot.table));
    rollTableSlot(crew.ship, SHIP);
    rollTableSlot(crew.metThrough, MET_THROUGH);
    rollTableSlot(crew.characterizedAs, CHARACTERIZED_AS);

    const shipRow = crew.ship.value ? C.findRow(SHIP, crew.ship.value) : null;
    if (!shipRow) {
      crew.ship.debt = null;
    } else {
      const old = crew.ship.debt;
      const debt = old && old.notation === shipRow.debt ? old : { mode: 'random', notation: shipRow.debt, value: null };
      const range = rng.diceRange(debt.notation);
      if (debt.value !== null && (debt.value < range.min || debt.value > range.max)) {
        debt.mode = 'random';
        debt.value = null;
      }
      if (roll && debt.mode === 'random' && debt.value === null) debt.value = rng.roll(debt.notation).total;
      crew.ship.debt = debt;
    }
    return crew;
  }

  /* ---------------------------------------------------------------------- */
  /* Paths                                                                  */
  /* ---------------------------------------------------------------------- */

  function getSlot(crew, path) {
    if (path[0] === 'equipment') return crew.equipment[path[1]] || null;
    if (path[0] === 'ship') return path[1] === 'debt' ? crew.ship.debt : crew.ship;
    if (path[0] === 'metThrough' || path[0] === 'characterizedAs') return crew[path[0]];
    return null;
  }

  function isDice(path) {
    return path[0] === 'ship' && path[1] === 'debt';
  }

  function tableFor(crew, path) {
    if (path[0] === 'equipment') return crew.equipment[path[1]].table;
    if (path[0] === 'ship') return SHIP;
    if (path[0] === 'metThrough') return MET_THROUGH;
    return CHARACTERIZED_AS;
  }

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  /** Roll every Random crew slot (fresh rolls). Fixed slots are kept. */
  function generate(campaign) {
    const crew = campaign.crew;
    crew.generated = true;
    const clear = (slot) => { if (slot && slot.mode === 'random') slot.value = null; };
    crew.equipment.forEach(clear);
    clear(crew.ship);
    clear(crew.ship.debt);
    clear(crew.metThrough);
    clear(crew.characterizedAs);
    return sync(campaign);
  }

  function canReroll(crew, path) {
    const slot = getSlot(crew, path);
    if (!slot || slot.mode !== 'random' || slot.value === null) return false;
    if (isDice(path)) {
      const range = rng.diceRange(slot.notation);
      return range.max > range.min;
    }
    return rng.eligibleCount(rng.getTable(tableFor(crew, path)).rows, { exclude: slot.value }) > 0;
  }

  function reroll(campaign, path) {
    const crew = campaign.crew;
    if (!canReroll(crew, path)) return false;
    const slot = getSlot(crew, path);
    if (isDice(path)) {
      slot.value = rng.rerollDice(slot.notation, slot.value).total;
    } else {
      slot.value = rng.rerollTable(tableFor(crew, path), slot.value).id;
    }
    sync(campaign);
    return true;
  }

  function optionsFor(crew, path) {
    const slot = getSlot(crew, path);
    if (isDice(path)) {
      const range = rng.diceRange(slot.notation);
      const out = [];
      for (let v = range.min; v <= range.max; v++) out.push({ value: v, label: String(v) });
      return out;
    }
    const t = rng.getTable(tableFor(crew, path));
    return t.rows.map((r) => ({ value: r.id, label: r[t.labelColumn], range: r.ranges ? r.ranges.weight : null }));
  }

  function setFixed(campaign, path, value) {
    const crew = campaign.crew;
    const slot = getSlot(crew, path);
    if (!slot || !optionsFor(crew, path).some((o) => o.value === value)) return false;
    slot.mode = 'fixed';
    slot.value = value;
    sync(campaign);
    return true;
  }

  function setRandom(campaign, path) {
    const slot = getSlot(campaign.crew, path);
    if (!slot) return false;
    slot.mode = 'random';
    sync(campaign);
    return true;
  }

  /** Switch a Military roll to High-tech or back; each needs a character with a Savvy increase. */
  function setHighTech(campaign, index, on) {
    const crew = campaign.crew;
    const slot = crew.equipment[index];
    if (!slot || slot.group !== 'military') return false;
    const wantTable = on ? HIGH_TECH : MILITARY;
    if (slot.table === wantTable) return true;
    if (on && highTechUsed(crew) >= summarize(campaign).savvyCount) return false;
    slot.table = wantTable;
    slot.mode = 'random';
    slot.value = null;
    sync(campaign);
    return true;
  }

  function highTechUsed(crew) {
    return crew.equipment.filter((s) => s.table === HIGH_TECH).length;
  }

  function setLeader(campaign, characterId) {
    const crew = campaign.crew;
    crew.leaderId = characterId && campaign.characters.some((c) => c.id === characterId) ? characterId : null;
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Summary                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Totals across the whole crew:
   *   members, credits { perMember, rolled, total }, storyPoints, patrons,
   *   rivals, rumors, savvyCount, highTechUsed,
   *   characterItems [{ character, table, row }], xp [{ character, xp }],
   *   ship { row, hull, debt, traits [{ name, text }] } | null,
   *   warnings [string]
   */
  function summarize(campaign) {
    const crew = campaign.crew;
    const characters = campaign.characters;
    const out = {
      members: characters.length,
      credits: { perMember: characters.length, rolled: 0, total: 0 },
      storyPoints: 0,
      patrons: 0,
      rivals: 0,
      rumors: 0,
      savvyCount: 0,
      highTechUsed: highTechUsed(crew),
      characterItems: [],
      xp: [],
      ship: null,
      warnings: []
    };

    for (const character of characters) {
      const r = C.resolve(character, { isLeader: crew.leaderId === character.id });
      out.credits.rolled += r.credits;
      out.storyPoints += r.storyPoints;
      out.patrons += r.patrons;
      out.rivals += r.rivals;
      out.rumors += r.rumors;
      if (r.savvyIncrease) out.savvyCount++;
      for (const item of r.items) out.characterItems.push({ character: character, table: item.table, row: item.row });
      out.xp.push({ character: character, xp: r.xp });
    }
    out.credits.total = out.credits.perMember + out.credits.rolled;

    if (out.highTechUsed > out.savvyCount) {
      out.warnings.push(out.highTechUsed + ' Military rolls use the High-tech table, but only ' +
        out.savvyCount + (out.savvyCount === 1 ? ' character has' : ' characters have') + ' a Savvy increase.');
    }

    const shipRow = crew.ship.value ? C.findRow(SHIP, crew.ship.value) : null;
    if (shipRow) {
      const traits = String(shipRow.traits).split(',').map((t) => t.trim()).filter((t) => t && t !== '-');
      out.ship = {
        row: shipRow,
        hull: parseInt(shipRow.hull, 10),
        debt: crew.ship.debt ? crew.ship.debt.value : null,
        traits: traits.map((name) => ({ name: name, text: SHIP_TRAITS[name] || '' }))
      };
    }
    return out;
  }

  LP.crew = {
    EQUIPMENT_LAYOUT,
    SHIP_TRAITS,
    HIGH_TECH,
    MILITARY,
    ensure,
    sync,
    getSlot,
    isDice,
    tableFor,
    generate,
    canReroll,
    reroll,
    optionsFor,
    setFixed,
    setRandom,
    setHighTech,
    setLeader,
    summarize
  };
})(window.LP);
