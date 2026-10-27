(function (LP) {
  'use strict';

  /*
   * Which enemy entries the player has models for, and which may invade.
   * Stored as campaign.models = {
   *   disabled: { tableName: [rowId, ...] },   entries without models
   *   invasion: { tableName: [rowId, ...] }    entries that can form an invasion force;
   *                                            a table not listed uses the book's
   *                                            "Invasion Threat" entries
   *   weaponsOff: [weaponName]                 weapons the player has no models for, anywhere
   *                                            they appear in the weapon tables
   * }
   * Weights stay as printed; switching an entry off removes its weight from
   * the table, so every remaining entry becomes proportionally more likely.
   */

  const rng = LP.rng;

  const ENEMY_TABLES = ['Criminal Elements', 'Hired Muscle', 'Interested Parties', 'Roving Threats'];

  function disabledIds(campaign, tableName) {
    return (campaign.models && campaign.models.disabled && campaign.models.disabled[tableName]) || [];
  }

  function isEnabled(campaign, tableName, rowId) {
    return !disabledIds(campaign, tableName).includes(rowId);
  }

  function setEnabled(campaign, tableName, rowId, on) {
    const current = disabledIds(campaign, tableName).filter((id) => id !== rowId);
    if (!on) current.push(rowId);
    campaign.models.disabled[tableName] = current;
  }

  function setAll(campaign, tableName, on) {
    campaign.models.disabled[tableName] = on ? [] : rng.getTable(tableName).rows.map((r) => r.id);
  }

  function enabledRows(campaign, tableName) {
    const off = disabledIds(campaign, tableName);
    return rng.getTable(tableName).rows.filter((r) => !off.includes(r.id));
  }

  /**
   * Each row with its current chance (0-1), or null when switched off.
   * Returns { rows: [{ row, enabled, chance }], enabledCount, total }.
   */
  function odds(campaign, tableName) {
    const off = disabledIds(campaign, tableName);
    const rows = rng.getTable(tableName).rows;
    const total = rows.filter((r) => !off.includes(r.id)).reduce((sum, r) => sum + r.weight, 0);
    return {
      rows: rows.map((row) => {
        const enabled = !off.includes(row.id);
        return { row: row, enabled: enabled, chance: enabled && total > 0 ? row.weight / total : null };
      }),
      enabledCount: rows.length - rows.filter((r) => off.includes(r.id)).length,
      total: total
    };
  }

  /** Roll an enemy from the enabled entries only. Null if all are off. */
  function rollEnemy(campaign, tableName) {
    return rng.weightedPick(rng.getTable(tableName).rows, { exclude: disabledIds(campaign, tableName) });
  }

  /* ---------------------------------------------------------------------- */
  /* Weapons                                                                */
  /* ---------------------------------------------------------------------- */

  const WEAPON_TABLES = {
    basic: { table: 'Varied Armaments Table', column: (n) => 'weapon_' + n },
    specialist: { table: 'Specialists Table', column: (n) => 'specialist_' + String(n).toLowerCase() }
  };

  function weaponsOff(campaign) {
    return (campaign.models && campaign.models.weaponsOff) || [];
  }

  function isWeaponOn(campaign, name) {
    return !weaponsOff(campaign).includes(name);
  }

  function setWeapon(campaign, name, on) {
    const current = weaponsOff(campaign).filter((n) => n !== name);
    if (!on) current.push(name);
    campaign.models.weaponsOff = current;
  }

  /** The distinct weapons in a column, in table order: ['Handgun', 'Colony rifle', ...]. */
  function weaponNames(kind, code) {
    const spec = WEAPON_TABLES[kind];
    const column = spec.column(code);
    const names = [];
    for (const row of rng.getTable(spec.table).rows) {
      if (row[column] && !names.includes(row[column])) names.push(row[column]);
    }
    return names;
  }

  /** A unit's weapon lists, { basic: [...], specialist: [...] }, or null for fixed or melee-only weapons. */
  function weaponsFor(row) {
    const code = /^\s*([123])\s*([ABC])\s*$/.exec(row.weapons || '');
    return code ? { basic: weaponNames('basic', code[1]), specialist: weaponNames('specialist', code[2]) } : null;
  }

  /**
   * Row ids of a weapon table to leave out of a roll in one column because their weapon is switched off.
   * Returns [] when that would leave nothing to roll, so a roll is never blocked.
   */
  function weaponExclude(campaign, kind, code) {
    const spec = WEAPON_TABLES[kind];
    const column = spec.column(code);
    const rows = rng.getTable(spec.table).rows.filter((r) => r[column] && r.weight > 0);
    const off = rows.filter((r) => !isWeaponOn(campaign, r[column])).map((r) => r.id);
    return off.length < rows.length ? off : [];
  }

  /* ---------------------------------------------------------------------- */
  /* Invasion forces                                                        */
  /* ---------------------------------------------------------------------- */

  function isInvasionThreat(row) {
    return /invasion threat/i.test(row.notes || '');
  }

  /** The book's default: entries whose notes say "Invasion Threat". */
  function defaultInvasionIds(tableName) {
    return rng.getTable(tableName).rows.filter(isInvasionThreat).map((r) => r.id);
  }

  function invasionIds(campaign, tableName) {
    const custom = campaign.models && campaign.models.invasion && campaign.models.invasion[tableName];
    return custom || defaultInvasionIds(tableName);
  }

  function isInvasion(campaign, tableName, rowId) {
    return invasionIds(campaign, tableName).includes(rowId);
  }

  function setInvasion(campaign, tableName, rowId, on) {
    if (!campaign.models.invasion) campaign.models.invasion = {};
    const current = invasionIds(campaign, tableName).filter((id) => id !== rowId);
    if (on) current.push(rowId);
    campaign.models.invasion[tableName] = current;
  }

  /** Go back to the book's Invasion Threat entries for every table. */
  function resetInvasion(campaign) {
    campaign.models.invasion = {};
  }

  /** Entries ticked for invasions and enabled: [{ table, row }]. */
  function invasionCandidates(campaign) {
    const out = [];
    for (const tableName of ENEMY_TABLES) {
      const ids = invasionIds(campaign, tableName);
      const off = disabledIds(campaign, tableName);
      for (const row of rng.getTable(tableName).rows) {
        if (ids.includes(row.id) && !off.includes(row.id)) out.push({ table: tableName, row: row });
      }
    }
    return out;
  }

  /** Roll an invasion force across all four tables, weighted as printed. Null if none. */
  function rollInvasion(campaign) {
    const candidates = invasionCandidates(campaign).map((c) => ({ id: c.table + '|' + c.row.id, weight: c.row.weight, candidate: c }));
    const pick = rng.weightedPick(candidates);
    return pick ? pick.candidate : null;
  }

  LP.models = {
    ENEMY_TABLES, isEnabled, setEnabled, setAll, enabledRows, odds, rollEnemy,
    isInvasionThreat, defaultInvasionIds, invasionIds, isInvasion, setInvasion, resetInvasion,
    invasionCandidates, rollInvasion,
    isWeaponOn, setWeapon, weaponNames, weaponsFor, weaponExclude
  };
})(window.LP);
