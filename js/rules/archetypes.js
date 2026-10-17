(function (LP) {
  'use strict';

  /*
   * Planet archetypes: what can turn up on a kind of world.
   *
   * campaign.archetypes = [{
   *   id, name,
   *   worldTraits: [traitId],                 allowed World Traits
   *   species: { speciesId: weight },         recruit weights on the combined species table
   *   events: { campaign, character, exploration, trade, travel: [rowId] },
   *   patrons: [{ id, name, patronType | null, forces: ['Table|rowId'], uniques: [uniqueId] }],
   *   rivals:  [{ id, name, forces: ['Table|rowId'], uniques: [uniqueId] }]
   * }]
   *
   * Lists hold what is ALLOWED. An empty list falls back to the full table
   * (with a warning), so a half-built archetype never blocks a roll.
   */

  const rng = LP.rng;

  const WORLD_TRAITS = 'World Traits Table';
  const FORCE_TABLES = ['Criminal Elements', 'Hired Muscle', 'Interested Parties'];
  const EVENT_TABLES = {
    campaign: 'Campaign Events Table',
    character: 'Character Events Table',
    exploration: 'Exploration Table',
    trade: 'Trade Table',
    travel: 'Starship Travel Events Table'
  };
  const EVENT_LABELS = {
    campaign: 'Campaign Events',
    character: 'Character Events',
    exploration: 'Exploration',
    trade: 'Trade',
    travel: 'Starship Travel Events'
  };

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  function ids(tableName) {
    return rng.getTable(tableName).rows.map((r) => r.id);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* ---------------------------------------------------------------------- */
  /* Species: one combined table                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * All 26 species with the book's two-step odds as one weight
   * (Crew Type weight x subtable weight, out of 10,000).
   * Returns [{ id, name, group, weight, how }].
   */
  function speciesTable() {
    const crewTypes = rng.getTable('Crew Type Table');
    const parentOf = { 'Primary Alien Table': 'primary-alien', 'Strange Character Table': 'strange-character' };
    const weights = {};
    for (const r of LP.character.speciesRows()) weights[r.id] = r.weight;
    return LP.data.species.list.map((s) => {
      let how;
      if (s.sourceTable === 'Crew Type Table') {
        const row = crewTypes.rows.find((r) => r.id === s.sourceRow);
        how = row.crew_type + ' ' + row.weight + ' × 100';
      } else {
        const parent = crewTypes.rows.find((r) => r.id === parentOf[s.sourceTable]);
        const sub = rng.getTable(s.sourceTable).rows.find((r) => r.id === s.sourceRow);
        how = parent.crew_type + ' ' + parent.weight + ' × ' + s.name + ' ' + sub.weight;
      }
      return { id: s.id, name: s.name, group: s.group, weight: weights[s.id], how: how };
    });
  }

  function defaultSpeciesWeights() {
    const out = {};
    for (const s of speciesTable()) out[s.id] = s.weight;
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* Building archetypes                                                    */
  /* ---------------------------------------------------------------------- */

  function allForces() {
    const out = [];
    for (const t of FORCE_TABLES) for (const id of ids(t)) out.push(t + '|' + id);
    return out;
  }

  function enemyName(ref) {
    const i = ref.indexOf('|');
    const row = rng.getTable(ref.slice(0, i)).rows.find((r) => r.id === ref.slice(i + 1));
    return row ? row.enemy : ref;
  }

  /** The "All options" archetype: plays exactly like the rules as written. */
  function defaultArchetype() {
    const uniques = ids('Unique Individuals');
    const forces = allForces();
    const events = {};
    for (const [key, table] of Object.entries(EVENT_TABLES)) events[key] = ids(table);
    return {
      id: newId(),
      name: 'All options',
      worldTraits: ids(WORLD_TRAITS),
      species: defaultSpeciesWeights(),
      events: events,
      patrons: rng.getTable('Patron Table').rows.map((r) => ({
        id: newId(), name: r.patron_is, patronType: r.id, forces: forces.slice(), uniques: uniques.slice()
      })),
      rivals: forces.map((ref) => ({ id: newId(), name: enemyName(ref), forces: [ref], uniques: uniques.slice() }))
    };
  }

  /** A blank archetype: nothing allowed yet (rolls fall back to full tables). */
  function emptyArchetype(name) {
    const species = {};
    for (const s of LP.data.species.list) species[s.id] = 0;
    return {
      id: newId(),
      name: name || 'New archetype',
      worldTraits: [],
      species: species,
      events: { campaign: [], character: [], exploration: [], trade: [], travel: [] },
      patrons: [],
      rivals: []
    };
  }

  function copyArchetype(source) {
    const copy = clone(source);
    copy.id = newId();
    copy.name = source.name + ' (copy)';
    for (const p of copy.patrons) p.id = newId();
    for (const r of copy.rivals) r.id = newId();
    return copy;
  }

  /* ---------------------------------------------------------------------- */
  /* Normalizing                                                            */
  /* ---------------------------------------------------------------------- */

  function validIds(list, allowed) {
    return Array.isArray(list) ? list.filter((id) => allowed.includes(id)) : [];
  }

  function normalizeEntry(raw, withType) {
    const forces = allForces();
    const uniques = ids('Unique Individuals');
    const patronTypes = ids('Patron Table');
    const e = raw && typeof raw === 'object' ? raw : {};
    const entry = {
      id: typeof e.id === 'string' && e.id ? e.id : newId(),
      name: typeof e.name === 'string' && e.name.trim() ? e.name.trim() : 'Unnamed',
      forces: validIds(e.forces, forces),
      uniques: validIds(e.uniques, uniques)
    };
    if (withType) entry.patronType = patronTypes.includes(e.patronType) ? e.patronType : null;
    return entry;
  }

  function normalize(raw) {
    const a = raw && typeof raw === 'object' ? raw : {};
    const species = {};
    const defaults = defaultSpeciesWeights();
    for (const id of Object.keys(defaults)) {
      const w = a.species && typeof a.species === 'object' ? Number(a.species[id]) : NaN;
      species[id] = isFinite(w) && w >= 0 ? Math.round(w) : 0;
    }
    const events = {};
    for (const [key, table] of Object.entries(EVENT_TABLES)) {
      events[key] = validIds(a.events && a.events[key], ids(table));
    }
    return {
      id: typeof a.id === 'string' && a.id ? a.id : newId(),
      name: typeof a.name === 'string' && a.name.trim() ? a.name.trim() : 'Unnamed archetype',
      worldTraits: validIds(a.worldTraits, ids(WORLD_TRAITS)),
      species: species,
      events: events,
      patrons: Array.isArray(a.patrons) ? a.patrons.map((p) => normalizeEntry(p, true)) : [],
      rivals: Array.isArray(a.rivals) ? a.rivals.map((r) => normalizeEntry(r, false)) : []
    };
  }

  /** Make sure the campaign has archetypes (adds the default one if none). */
  function ensure(campaign) {
    const list = Array.isArray(campaign.archetypes) ? campaign.archetypes.map(normalize) : [];
    campaign.archetypes = list.length ? list : [defaultArchetype()];
    return campaign.archetypes;
  }

  function get(campaign, id) {
    return (campaign.archetypes || []).find((a) => a.id === id) || null;
  }

  /* ---------------------------------------------------------------------- */
  /* Rolling with an archetype                                              */
  /* ---------------------------------------------------------------------- */

  /** Rows of a table this archetype doesn't allow ([] when its list is empty: full table). */
  function excluded(allowed, tableName) {
    if (!allowed || !allowed.length) return [];
    return ids(tableName).filter((id) => !allowed.includes(id));
  }

  function excludedTraits(archetype) {
    return archetype ? excluded(archetype.worldTraits, WORLD_TRAITS) : [];
  }

  /**
   * A `disabled` map for follow-up runs: Models-tab exclusions plus this
   * archetype's event restrictions.
   */
  function disabledMap(campaign, archetype) {
    const out = {};
    const models = campaign && campaign.models && campaign.models.disabled ? campaign.models.disabled : {};
    for (const [table, list] of Object.entries(models)) out[table] = list.slice();
    if (archetype) {
      for (const [key, table] of Object.entries(EVENT_TABLES)) {
        out[table] = (out[table] || []).concat(excluded(archetype.events[key], table));
      }
    }
    return out;
  }

  /** Species weights to roll with: the archetype's, or the defaults when all are 0 or there is none. */
  function speciesWeights(archetype) {
    if (archetype && Object.values(archetype.species).some((w) => w > 0)) return archetype.species;
    return defaultSpeciesWeights();
  }

  /** Roll a species with an archetype's weights. Returns the species definition. */
  function rollSpecies(archetype) {
    const weights = speciesWeights(archetype);
    const rows = Object.entries(weights).map(([id, weight]) => ({ id, weight }));
    const pick = rng.weightedPick(rows);
    return pick ? LP.data.species.byId[pick.id] : null;
  }

  /** Problems worth showing in the editor. */
  function warnings(archetype) {
    const out = [];
    if (!archetype.worldTraits.length) out.push('No world traits ticked: new planets roll on the full World Traits Table.');
    if (!Object.values(archetype.species).some((w) => w > 0)) out.push('All species weights are 0: recruits use the default species table.');
    for (const [key, list] of Object.entries(archetype.events)) {
      if (!list.length) out.push('No ' + EVENT_LABELS[key] + ' ticked: those rolls use the full table.');
    }
    if (!archetype.rivals.length) out.push('No Rivals: new Rivals are named after the enemy you fought.');
    if (!archetype.patrons.length) out.push('No Patrons: new Patrons are named after their Patron type.');
    for (const r of archetype.rivals) if (!r.forces.length) out.push('Rival "' + r.name + '" has no forces.');
    return out;
  }

  LP.archetypes = {
    WORLD_TRAITS, FORCE_TABLES, EVENT_TABLES, EVENT_LABELS,
    speciesTable, defaultSpeciesWeights, allForces, enemyName,
    defaultArchetype, emptyArchetype, copyArchetype, normalize, ensure, get,
    excludedTraits, disabledMap, speciesWeights, rollSpecies, warnings
  };
})(window.LP);
