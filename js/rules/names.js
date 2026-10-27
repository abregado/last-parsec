(function (LP) {
  'use strict';

  /*
   * Random character names from editable name tables.
   *
   *   campaign.nameTables   = [{ id, name, names: [string] }]
   *   campaign.speciesNames = { speciesId: [tableId] }   overrides only; other species use defaultTables()
   *
   * The generic table (data.GENERIC) always exists with at least one name; a species left with no
   * table draws from it. Names never contain commas (the Add box splits on them).
   *
   * A name is one pick from each of the species' tables, joined by a space. A character
   * { name, nameAuto, nameSpecies } keeps nameAuto while the name is the rolled one, so typing
   * a name turns it off and it is never overwritten.
   */

  const rng = LP.rng;
  const data = LP.data.nameTables;
  const AVOID_TRIES = 20;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  function cleanName(n) {
    return typeof n === 'string' ? n.replace(/,/g, ' ').replace(/\s+/g, ' ').trim() : '';
  }

  function cleanNames(list) {
    return (Array.isArray(list) ? list : []).map(cleanName).filter(Boolean);
  }

  /** Seed missing tables, repair shapes, and drop references to tables that no longer exist. */
  function ensure(campaign) {
    if (!Array.isArray(campaign.nameTables)) campaign.nameTables = clone(data.TABLES);
    campaign.nameTables = campaign.nameTables
      .filter((t) => t && typeof t === 'object' && typeof t.id === 'string' && t.id)
      .map((t) => ({ id: t.id, name: typeof t.name === 'string' && t.name.trim() ? t.name.trim() : 'Names', names: cleanNames(t.names) }));
    const generic = campaign.nameTables.find((t) => t.id === data.GENERIC);
    if (!generic) campaign.nameTables.unshift(clone(data.TABLES.find((t) => t.id === data.GENERIC)));
    else if (!generic.names.length) generic.names = data.TABLES.find((t) => t.id === data.GENERIC).names.slice();
    const known = new Set(campaign.nameTables.map((t) => t.id));
    const raw = campaign.speciesNames && typeof campaign.speciesNames === 'object' && !Array.isArray(campaign.speciesNames) ? campaign.speciesNames : {};
    campaign.speciesNames = {};
    for (const [speciesId, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      const kept = list.filter((id, i) => known.has(id) && list.indexOf(id) === i);
      campaign.speciesNames[speciesId] = kept.length ? kept : [data.GENERIC];
    }
    return campaign;
  }

  /** Plain test campaigns skip normalizing; seed them on first use. */
  function ready(campaign) {
    if (!Array.isArray(campaign.nameTables) || !campaign.speciesNames) ensure(campaign);
    return campaign;
  }

  function getTable(campaign, id) {
    return ready(campaign).nameTables.find((t) => t.id === id) || null;
  }

  /** The built-in tables for a species (by id, else by group), before any override. */
  function defaultTables(speciesId) {
    const species = LP.data.species.byId[speciesId];
    return (data.SPECIES[speciesId] || (species && data.GROUPS[species.group]) || []).slice();
  }

  /** The table ids a species draws from: its override, else its default (only tables that still exist). */
  function tablesFor(campaign, speciesId) {
    const list = ready(campaign).speciesNames[speciesId] || defaultTables(speciesId);
    const kept = list.filter((id) => getTable(campaign, id));
    return kept.length ? kept : [data.GENERIC];
  }

  function isOverridden(campaign, speciesId) {
    return !!campaign.speciesNames[speciesId];
  }

  function setSpeciesTables(campaign, speciesId, ids) {
    const kept = ids.filter((id, i) => getTable(campaign, id) && ids.indexOf(id) === i);
    campaign.speciesNames[speciesId] = kept.length ? kept : [data.GENERIC];
  }

  function resetSpecies(campaign, speciesId) {
    delete campaign.speciesNames[speciesId];
  }

  /** Every species that draws from a table. */
  function usedBy(campaign, tableId) {
    return LP.data.species.list.filter((s) => tablesFor(campaign, s.id).includes(tableId));
  }

  /* ---------------------------------------------------------------------- */
  /* Editing                                                                */
  /* ---------------------------------------------------------------------- */

  function addTable(campaign, name) {
    const table = { id: newId(), name: String(name).trim() || 'New names', names: [] };
    campaign.nameTables.push(table);
    return table;
  }

  function renameTable(campaign, id, name) {
    const table = getTable(campaign, id);
    if (table && String(name).trim()) table.name = String(name).trim();
  }

  /** Delete a table and remove it from every species' list (a species left with none uses the generic table). The generic table can't be deleted. */
  function deleteTable(campaign, id) {
    if (id === data.GENERIC) return false;
    for (const species of LP.data.species.list) {
      const ids = tablesFor(campaign, species.id);
      if (ids.includes(id)) campaign.speciesNames[species.id] = ids;
    }
    campaign.nameTables = campaign.nameTables.filter((t) => t.id !== id);
    ensure(campaign);
    return true;
  }

  /** Add names (an array, or text with one name per line or comma). Returns how many were new. */
  function addNames(campaign, id, input) {
    const table = getTable(campaign, id);
    if (!table) return 0;
    const list = Array.isArray(input) ? input : String(input).split(/[\r\n,]+/);
    let added = 0;
    for (const name of cleanNames(list)) {
      if (!table.names.includes(name)) {
        table.names.push(name);
        added++;
      }
    }
    return added;
  }

  /** Remove a name; the generic table keeps its last one. Returns whether it was removed. */
  function removeName(campaign, id, index) {
    const table = getTable(campaign, id);
    if (!table || (id === data.GENERIC && table.names.length <= 1)) return false;
    table.names.splice(index, 1);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Rolling                                                                */
  /* ---------------------------------------------------------------------- */

  /** One name for a species, or '' when its tables are empty. */
  function rollName(campaign, speciesId) {
    const parts = [];
    for (const id of tablesFor(campaign, speciesId)) {
      const table = getTable(campaign, id);
      if (table && table.names.length) parts.push(table.names[rng.int(table.names.length)]);
    }
    return parts.join(' ');
  }

  /** Names already in use: other characters in the generator and the crew. */
  function takenNames(campaign, except) {
    const out = new Set();
    const add = (n) => { if (n && n.trim()) out.add(n.trim().toLowerCase()); };
    for (const c of campaign.characters || []) if (c !== except) add(c.name);
    if (campaign.roster && Array.isArray(campaign.roster.members)) campaign.roster.members.forEach((m) => add(m.name));
    return out;
  }

  /** Roll a name that isn't already used (a few tries, then accept a repeat). */
  function rollUnique(campaign, speciesId, taken) {
    let name = '';
    for (let i = 0; i < AVOID_TRIES; i++) {
      name = rollName(campaign, speciesId);
      if (!name || !taken.has(name.toLowerCase())) break;
    }
    return name;
  }

  /**
   * Give a character a rolled name when it has none or its name is still the rolled one.
   * `force` rerolls even if the species is unchanged (Generate); otherwise it only rolls
   * when the name is empty or the species changed since it was rolled. Returns true if changed.
   */
  function assign(campaign, character, force) {
    const speciesId = character.species && character.species.value;
    if (!speciesId) return false;
    const empty = !character.name || !character.name.trim();
    if (!empty && !character.nameAuto) return false;
    if (!empty && !force && character.nameSpecies === speciesId) return false;
    const name = rollUnique(campaign, speciesId, takenNames(campaign, character));
    if (!name) return false;
    character.name = name;
    character.nameAuto = true;
    character.nameSpecies = speciesId;
    return true;
  }

  /** The reroll button: always rolls a new name, even over a typed one. */
  function reroll(campaign, character) {
    const speciesId = character.species && character.species.value;
    if (!speciesId) return false;
    const name = rollUnique(campaign, speciesId, takenNames(campaign, character));
    if (!name) return false;
    character.name = name;
    character.nameAuto = true;
    character.nameSpecies = speciesId;
    return true;
  }

  LP.names = {
    ensure, getTable, defaultTables, tablesFor, isOverridden, setSpeciesTables, resetSpecies, usedBy,
    GENERIC: data.GENERIC, cleanName, addTable, renameTable, deleteTable, addNames, removeName,
    rollName, assign, reroll
  };
})(window.LP);
