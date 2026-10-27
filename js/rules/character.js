(function (LP) {
  'use strict';

  /*
   * Character model and rules.
   *
   * A character is stored as plain JSON:
   *   {
   *     id, name,
   *     generated: false,               // true once Generate has run
   *     species: { mode, value },       // value = species id
   *     fields: {                       // keyed by field key, see fieldsFor()
   *       background: Slot, motivation: Slot, class: Slot, ...
   *     }
   *   }
   * Slot      = { mode, value, credits: DiceSlot[], items: ItemSlot[] }
   * DiceSlot  = { mode, notation, value }      value = rolled total
   * ItemSlot  = { mode, table, value }         value = row id in `table`
   * mode      = 'random' | 'fixed' | 'forced'  (forced = set by species, locked)
   *
   * Child slots (credits, items) come from the parent row's effects and are
   * rebuilt whenever the parent changes. Profiles and totals are never
   * stored: resolve() works them out from the slots every time.
   *
   * Slots are addressed by path:
   *   ['species'], ['fields', 'background'],
   *   ['fields', 'background', 'credits', 0], ['fields', 'class', 'items', 0]
   */

  const rng = LP.rng;
  const effects = LP.effects;
  const speciesData = LP.data.species;

  const STATS = ['reactions', 'speed', 'combat', 'toughness', 'savvy'];
  const STAT_LABELS = { reactions: 'Reactions', speed: 'Speed', combat: 'Combat Skill', toughness: 'Toughness', savvy: 'Savvy', luck: 'Luck' };

  const BACKGROUND = 'Background Table';
  const MOTIVATION = 'Motivation Table';
  const CLASS = 'Class Table';
  const MINOR_ABILITY = 'Minor Alien Ability Table';

  function table(name) {
    return rng.getTable(name);
  }

  function findRow(tableName, id) {
    return table(tableName).rows.find((r) => r.id === id) || null;
  }

  function rowLabel(tableName, row) {
    return row ? row[table(tableName).labelColumn] : '';
  }

  /* ---------------------------------------------------------------------- */
  /* Species odds                                                           */
  /* ---------------------------------------------------------------------- */

  // Which Crew Type row leads to each subtable.
  const SUBTABLE_PARENT = {
    'Primary Alien Table': 'primary-alien',
    'Strange Character Table': 'strange-character'
  };

  let speciesRowsCache = null;

  /**
   * One flat weighted list for the two-step roll (Crew Type, then subtable).
   * weight = crew type weight x subtable weight, so the odds match the book
   * and "reroll without repeating" can simply exclude the current species.
   */
  function speciesRows() {
    if (speciesRowsCache) return speciesRowsCache;
    const crewTypes = table('Crew Type Table');
    speciesRowsCache = speciesData.list.map((s) => {
      let weight;
      if (s.sourceTable === 'Crew Type Table') {
        weight = findRow('Crew Type Table', s.sourceRow).weight * 100;
      } else {
        const parent = crewTypes.rows.find((r) => r.id === SUBTABLE_PARENT[s.sourceTable]);
        weight = parent.weight * findRow(s.sourceTable, s.sourceRow).weight;
      }
      return { id: s.id, weight: weight };
    });
    return speciesRowsCache;
  }

  function getSpecies(id) {
    return speciesData.byId[id] || null;
  }

  /* ---------------------------------------------------------------------- */
  /* Fields                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * The origin fields a species has, in display/roll order. Each spec:
   *   key, label, table, forced (row id or null), classMap, noEffects,
   *   excludeKeys (other fields whose values this one must not repeat),
   *   excludeIds (row ids never allowed)
   * With no species chosen yet, the standard three fields are returned.
   */
  function fieldsFor(species, basic) {
    const s = species || {};
    if (s.noOrigins || basic) return [];
    const forced = s.forced || {};
    const double = s.double || {};
    const specs = [];

    specs.push({ key: 'background', label: 'Background', table: BACKGROUND, forced: forced.background || null, excludeKeys: double.background ? ['background2'] : [], excludeIds: [] });
    if (double.background) {
      specs.push({ key: 'background2', label: 'Background (second)', table: BACKGROUND, forced: null, excludeKeys: ['background'], excludeIds: [] });
    }

    const motivationExclude = s.extraMotivation ? [s.extraMotivation] : [];
    specs.push({ key: 'motivation', label: 'Motivation', table: MOTIVATION, forced: forced.motivation || null, excludeKeys: double.motivation ? ['motivation2'] : [], excludeIds: motivationExclude });
    if (double.motivation) {
      specs.push({ key: 'motivation2', label: 'Motivation (second)', table: MOTIVATION, forced: null, excludeKeys: ['motivation'], excludeIds: motivationExclude });
    }
    if (s.extraMotivation) {
      specs.push({ key: 'motivationExtra', label: 'Motivation (always)', table: MOTIVATION, forced: s.extraMotivation, excludeKeys: [], excludeIds: [] });
    }

    specs.push({ key: 'class', label: 'Class', table: CLASS, forced: forced['class'] || null, classMap: s.classMap || null, excludeKeys: [], excludeIds: [] });

    if (s.minorAbility) {
      specs.push({ key: 'minorAbility', label: 'Cheaper ability', table: MINOR_ABILITY, forced: null, noEffects: true, excludeKeys: [], excludeIds: [] });
    }
    return specs;
  }

  function currentSpecies(character) {
    return getSpecies(character.species.value);
  }

  function specsOf(character) {
    return fieldsFor(currentSpecies(character), character.basic);
  }

  function specByKey(character, key) {
    return specsOf(character).find((s) => s.key === key) || null;
  }

  /** The row that actually applies (e.g. Hulker's Technician counts as Primitive). */
  function effectiveId(spec, id) {
    return spec.classMap && spec.classMap[id] ? spec.classMap[id] : id;
  }

  /** Row ids this field may not take, given the other fields' values. */
  function excludedIds(character, spec) {
    const ids = spec.excludeIds.slice();
    for (const key of spec.excludeKeys) {
      const other = character.fields[key];
      if (other && other.value) ids.push(other.value);
    }
    return ids;
  }

  /* ---------------------------------------------------------------------- */
  /* Creating and syncing                                                   */
  /* ---------------------------------------------------------------------- */

  function newSlot() {
    return { mode: 'random', value: null, credits: [], items: [] };
  }

  function newCharacter() {
    const character = {
      id: LP.storage ? LP.storage.newId() : String(Date.now()),
      name: '',
      generated: false,
      species: { mode: 'random', value: null },
      fields: {}
    };
    sync(character);
    return character;
  }

  /** The child rolls a field's current row asks for. */
  function childSpecFor(character, spec, slot) {
    const none = { credits: [], items: [] };
    if (spec.noEffects || !slot.value) return none;
    const row = findRow(spec.table, effectiveId(spec, slot.value));
    if (!row) return none;
    const parsed = effects.parseRow(row);
    const species = currentSpecies(character);
    const creditsIgnored = species && species.ignoreBackgroundCredits && spec.table === BACKGROUND;
    return {
      credits: creditsIgnored ? [] : parsed.credits.dice,
      items: parsed.items
    };
  }

  function rollFieldValue(character, spec, slot, different) {
    const exclude = excludedIds(character, spec);
    const current = different ? effectiveId(spec, slot.value) : null;
    const row = rng.weightedPick(table(spec.table).rows, {
      exclude: (r) => exclude.includes(r.id) || (current !== null && effectiveId(spec, r.id) === current)
    });
    return row ? row.id : null;
  }

  /** Rebuild child slots to match the parent row, keeping still-valid ones. */
  function syncChildren(character, spec, slot) {
    const want = childSpecFor(character, spec, slot);
    const rollEmpty = character.generated;

    slot.credits = want.credits.map((notation, i) => {
      const existing = slot.credits[i];
      const child = existing && existing.notation === notation ? existing : { mode: 'random', notation: notation, value: null };
      if (rollEmpty && child.mode === 'random' && child.value === null) child.value = rng.roll(notation).total;
      return child;
    });

    slot.items = want.items.map((tableName, i) => {
      const existing = slot.items[i];
      const child = existing && existing.table === tableName ? existing : { mode: 'random', table: tableName, value: null };
      if (rollEmpty && child.mode === 'random' && child.value === null) child.value = rng.rollTable(tableName).id;
      return child;
    });
  }

  /**
   * Match the fields to the species (forced results, allowed values, child slots).
   * Once generated, empty Random slots are rolled straight away.
   */
  function sync(character) {
    if (!character.fields) character.fields = {};
    if (character.species.value && !getSpecies(character.species.value)) {
      character.species = { mode: 'random', value: null };
    }

    const specs = specsOf(character);
    const fields = {};

    for (const spec of specs) {
      const slot = character.fields[spec.key] || newSlot();
      fields[spec.key] = slot;
      character.fields[spec.key] = slot; // visible to later specs' exclusions

      if (spec.forced) {
        slot.mode = 'forced';
        slot.value = spec.forced;
      } else {
        if (slot.mode === 'forced') {
          slot.mode = 'random';
          slot.value = null;
        }
        if (slot.value !== null && (!findRow(spec.table, slot.value) || excludedIds(character, spec).includes(slot.value))) {
          slot.mode = 'random';
          slot.value = null;
        }
        if (character.generated && slot.mode === 'random' && slot.value === null) {
          slot.value = rollFieldValue(character, spec, slot, false);
        }
      }
      syncChildren(character, spec, slot);
    }

    character.fields = fields;
    return character;
  }

  /* ---------------------------------------------------------------------- */
  /* Paths                                                                  */
  /* ---------------------------------------------------------------------- */

  function getSlot(character, path) {
    if (path[0] === 'species') return character.species;
    if (path[0] !== 'fields') return null;
    const slot = character.fields[path[1]];
    if (!slot || path.length === 2) return slot || null;
    const list = slot[path[2]];
    return list ? list[path[3]] || null : null;
  }

  /** What a slot is: 'species' | 'field' | 'credits' | 'item'. */
  function slotKind(path) {
    if (path[0] === 'species') return 'species';
    if (path.length === 2) return 'field';
    return path[2] === 'credits' ? 'credits' : 'item';
  }

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  /** Roll every Random slot (fresh rolls, repeats allowed). Fixed and forced slots are kept. */
  function generate(character) {
    character.generated = true;
    if (character.species.mode === 'random') {
      character.species.value = rng.weightedPick(speciesRows()).id;
    }
    // Clear all Random values so exclusions only see kept values, then let
    // sync() roll the empty slots in field order (it also adds new fields).
    for (const slot of Object.values(character.fields)) {
      if (slot.mode === 'random') slot.value = null;
      for (const child of slot.credits.concat(slot.items)) {
        if (child.mode === 'random') child.value = null;
      }
    }
    return sync(character);
  }

  /** Random, rolled, and another result exists. */
  function canReroll(character, path) {
    const slot = getSlot(character, path);
    if (!slot || slot.mode !== 'random' || slot.value === null) return false;
    return rerollOptions(character, path) > 0;
  }

  /** How many different results a reroll could give. */
  function rerollOptions(character, path) {
    const slot = getSlot(character, path);
    switch (slotKind(path)) {
      case 'species':
        return rng.eligibleCount(speciesRows(), { exclude: slot.value });
      case 'field': {
        const spec = specByKey(character, path[1]);
        const exclude = excludedIds(character, spec);
        const current = effectiveId(spec, slot.value);
        return rng.eligibleCount(table(spec.table).rows, {
          exclude: (r) => exclude.includes(r.id) || effectiveId(spec, r.id) === current
        });
      }
      case 'credits': {
        const range = rng.diceRange(slot.notation);
        return range.max - range.min;
      }
      default:
        return rng.eligibleCount(table(slot.table).rows, { exclude: slot.value });
    }
  }

  /** Reroll one Random slot to a different result. Returns false if it can't. */
  function reroll(character, path) {
    if (!canReroll(character, path)) return false;
    const slot = getSlot(character, path);

    switch (slotKind(path)) {
      case 'species':
        slot.value = rng.weightedPick(speciesRows(), { exclude: slot.value }).id;
        break;
      case 'field': {
        const spec = specByKey(character, path[1]);
        slot.value = rollFieldValue(character, spec, slot, true);
        break;
      }
      case 'credits':
        slot.value = rng.rerollDice(slot.notation, slot.value).total;
        break;
      default:
        slot.value = rng.rerollTable(slot.table, slot.value).id;
    }
    sync(character);
    return true;
  }

  /** Pick a specific value from the dropdown. Not allowed on forced slots. */
  function setFixed(character, path, value) {
    const slot = getSlot(character, path);
    if (!slot || slot.mode === 'forced') return false;
    const options = optionsFor(character, path);
    const flat = slotKind(path) === 'species' ? options.flatMap((g) => g.options) : options;
    if (!flat.some((o) => o.value === value)) return false;
    slot.mode = 'fixed';
    slot.value = value;
    sync(character);
    return true;
  }

  /** Choose "Random" in the dropdown. The current value stays until the next Generate or reroll. */
  function setRandom(character, path) {
    const slot = getSlot(character, path);
    if (!slot || slot.mode === 'forced') return false;
    slot.mode = 'random';
    sync(character);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Dropdown options                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Options for a slot's dropdown (Random is added by the UI).
   *   species -> [{ group, label, options: [{ value, label }] }]
   *   field   -> [{ value, label, range }]
   *   credits -> [{ value, label }]
   *   item    -> [{ value, label, range }]
   */
  function optionsFor(character, path) {
    const slot = getSlot(character, path);
    switch (slotKind(path)) {
      case 'species':
        return speciesData.GROUPS.map((g) => ({
          group: g.id,
          label: g.label,
          options: speciesData.list.filter((s) => s.group === g.id).map((s) => ({ value: s.id, label: s.name }))
        }));
      case 'field': {
        const spec = specByKey(character, path[1]);
        const exclude = excludedIds(character, spec);
        const t = table(spec.table);
        return t.rows.filter((r) => !exclude.includes(r.id)).map((r) => {
          const mapped = effectiveId(spec, r.id);
          const label = r[t.labelColumn] + (mapped !== r.id ? ' → ' + rowLabel(spec.table, findRow(spec.table, mapped)) : '');
          return { value: r.id, label: label, range: r.ranges ? r.ranges.weight : null };
        });
      }
      case 'credits': {
        const range = rng.diceRange(slot.notation);
        const out = [];
        for (let v = range.min; v <= range.max; v++) out.push({ value: v, label: String(v) });
        return out;
      }
      default: {
        const t = table(slot.table);
        return t.rows.map((r) => ({ value: r.id, label: r[t.labelColumn], range: r.ranges ? r.ranges.weight : null }));
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Resolution                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Work out everything about a character from its slots.
   *   options.isLeader  adds the Leader's Luck point (not for Bots)
   * Returns:
   *   species, complete, profile {reactions..luck}, xp,
   *   origins [{ key, label, table, row, effectiveRow }],
   *   credits, storyPoints, patrons, rivals, rumors,
   *   items [{ table, row }], savvyIncrease, notes [string], rules [string]
   */
  function resolve(character, options) {
    const opts = options || {};
    const species = currentSpecies(character);
    const specs = fieldsFor(species, character.basic);
    const notes = [];
    let complete = !!species;

    const origins = [];
    const parsed = [];
    let originCredits = 0;
    const items = [];

    for (const spec of specs) {
      const slot = character.fields[spec.key];
      if (!slot || !slot.value) {
        complete = false;
        continue;
      }
      const row = findRow(spec.table, slot.value);
      const effective = findRow(spec.table, effectiveId(spec, slot.value));
      origins.push({ key: spec.key, label: spec.label, table: spec.table, row: row, effectiveRow: effective });

      if (effective !== row) {
        notes.push(rowLabel(spec.table, row) + ' counts as ' + rowLabel(spec.table, effective) + ' (' + species.name + ').');
      }
      if (spec.noEffects) continue;

      const e = effects.parseRow(effective);
      parsed.push(e);
      for (const text of e.unknown) notes.push('Not applied automatically: "' + text + '".');

      const creditsIgnored = species && species.ignoreBackgroundCredits && spec.table === BACKGROUND;
      if (creditsIgnored) {
        if (e.credits.dice.length || e.credits.flat) notes.push('Background credits ignored (' + species.name + ').');
      } else {
        originCredits += e.credits.flat;
      }
      for (const child of slot.credits) {
        if (child.value === null) complete = false;
        else originCredits += child.value;
      }
      for (const child of slot.items) {
        if (child.value === null) {
          complete = false;
          continue;
        }
        items.push({ table: child.table, row: findRow(child.table, child.value) });
      }
    }

    const total = effects.merge(...parsed);
    const s = species || {};

    // Story points and credits from origin rolls, with species adjustments.
    let storyPoints = total.storyPoints;
    if (s.ignoreStoryPoints && storyPoints > 0) {
      notes.push(storyPoints + ' origin story point' + (storyPoints === 1 ? '' : 's') + ' ignored (' + s.name + ').');
      storyPoints = 0;
    }
    if (s.storyPointPenalty && storyPoints > 0) {
      const cut = Math.min(s.storyPointPenalty, storyPoints);
      storyPoints -= cut;
      notes.push('Story points reduced by ' + cut + ' (' + s.name + ').');
    }
    let credits = originCredits;
    if (s.creditPenalty && credits > 0) {
      const cut = Math.min(s.creditPenalty, credits);
      credits -= cut;
      notes.push('Credits reduced by ' + cut + ' (' + s.name + ').');
    }

    const bonus = s.bonus || {};
    storyPoints += bonus.storyPoints || 0;

    const base = species ? species.profile : speciesData.byId['baseline-human'].profile;
    const caps = species ? species.caps : speciesData.DEFAULT_CAPS;
    const profile = {};
    for (const stat of STATS) {
      let delta = total.stats[stat];
      if (stat === 'savvy' && s.fixedSavvy && delta > 0) {
        notes.push('Savvy increase ignored (' + s.name + ' Savvy can never be improved).');
        delta = 0;
      }
      let value = base[stat] + delta;
      if (value > caps[stat]) {
        notes.push(STAT_LABELS[stat] + ' capped at ' + caps[stat] + '.');
        value = caps[stat];
      }
      profile[stat] = value;
    }

    let luck = base.luck + total.stats.luck + (bonus.luck || 0);
    if (opts.isLeader) {
      if (s.bot) notes.push('Bots get no Luck for being Leader.');
      else luck += 1;
    }
    if (species && luck > caps.luck) {
      notes.push(caps.luck === 0 ? s.name + ' can never have Luck.' : caps.luck === 1 ? 'Only Humans can have more than 1 Luck.' : 'Luck capped at ' + caps.luck + '.');
      luck = caps.luck;
    }
    profile.luck = luck;

    return {
      species: species,
      complete: complete,
      profile: profile,
      xp: total.xp,
      origins: origins,
      credits: credits,
      storyPoints: storyPoints,
      patrons: total.patrons,
      rivals: total.rivals + (bonus.rivals || 0),
      rumors: total.rumors + (bonus.rumors || 0),
      items: items,
      savvyIncrease: profile.savvy > base.savvy,
      notes: notes,
      rules: species ? species.rules : []
    };
  }

  LP.character = {
    STAT_LABELS,
    speciesRows,
    getSpecies,
    fieldsFor,
    newCharacter,
    sync,
    generate,
    getSlot,
    slotKind,
    canReroll,
    rerollOptions,
    reroll,
    setFixed,
    setRandom,
    optionsFor,
    resolve,
    rowLabel,
    findRow
  };
})(window.LP);
