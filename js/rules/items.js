(function (LP) {
  'use strict';

  /*
   * Items: one piece of equipment rolled on an item table, kept on the Crew
   * tab either in the Stash or carried by a crew member.
   *
   *   Item = {
   *     id, table, rowId, name,
   *     damaged: bool,            // needs Repair before it can be used
   *     source: string,           // "Gained on Ruhr during a trade roll by Ava on turn 11"
   *     turn: number | null,      // campaign turn it was gained on (0 = crew creation)
   *     carrierId: string | null, // crew member carrying it; null = Stash
   *     tag: string | null,       // set when a turn stage added it, so Undo can take it back
   *     key: string | null        // which result line it came from (with tag)
   *   }
   */

  const CATEGORIES = [
    { id: 'weapon', label: 'Weapon' },
    { id: 'gear', label: 'Gear' },
    { id: 'gadget', label: 'Gadget' },
    { id: 'consumable', label: 'Consumable' },
    { id: 'implant', label: 'Implant' },
    { id: 'ship', label: 'Ship item' }
  ];

  /** Every table whose rows are actual items (the Loot routing tables are not). */
  const ITEM_TABLES = {
    'Military Weapon Table': 'weapon',
    'High-tech Weapon Table': 'weapon',
    'Low-tech Weapon Table': 'weapon',
    'Slug Weapons Subtable': 'weapon',
    'Energy Weapons Subtable': 'weapon',
    'Special Weapons Subtable': 'weapon',
    'Melee Weapons Subtable': 'weapon',
    'Grenades Subtable': 'weapon',
    'Gear Table': 'gear',
    'Gun Mods Subtable': 'gear',
    'Gun Sights Subtable': 'gear',
    'Protective Items Subtable': 'gear',
    'Utility Items Subtable': 'gear',
    'Gadget Table': 'gadget',
    'Consumables Subtable': 'consumable',
    'Implants Subtable': 'implant',
    'Ship Items Subtable': 'ship'
  };

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  function isItemTable(tableName) {
    return Object.prototype.hasOwnProperty.call(ITEM_TABLES, tableName);
  }

  function categoryOf(tableName) {
    return ITEM_TABLES[tableName] || null;
  }

  function categoryLabel(id) {
    const c = CATEGORIES.find((x) => x.id === id);
    return c ? c.label : 'Item';
  }

  function rowName(tableName, rowId) {
    const table = LP.rng.getTable(tableName);
    const row = table.rows.find((r) => r.id === rowId);
    return row ? row[table.labelColumn] : null;
  }

  /** What a table row gives: one item, except a pack of grenades, which is that many single grenades. */
  function expandRow(tableName, rowId) {
    const name = tableName && rowId ? rowName(tableName, rowId) : null;
    const m = tableName === 'Grenades Subtable' && name ? /^(\d+)\s+(.+?)\s+grenades?$/i.exec(name) : null;
    if (!m) return [name];
    const single = m[2].charAt(0).toUpperCase() + m[2].slice(1) + ' grenade';
    return Array.from({ length: Number(m[1]) }, () => single);
  }

  /** A new item. fields: { table, rowId, name?, damaged?, source?, turn?, carrierId?, tag?, key? } */
  function make(fields) {
    const f = fields || {};
    return {
      id: newId(),
      table: f.table || null,
      rowId: f.rowId || null,
      name: f.name || (f.table && f.rowId ? rowName(f.table, f.rowId) : null) || 'Item',
      damaged: !!f.damaged,
      source: typeof f.source === 'string' ? f.source : '',
      turn: typeof f.turn === 'number' ? f.turn : null,
      carrierId: f.carrierId || null,
      tag: f.tag || null,
      key: f.key || null
    };
  }

  /** The items a row gives, made with the same fields (see expandRow). */
  function makeAll(fields) {
    return expandRow(fields.table, fields.rowId).map((name) => make(name ? Object.assign({}, fields, { name: name }) : fields));
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const item = make(raw);
    if (typeof raw.id === 'string' && raw.id) item.id = raw.id;
    if (typeof raw.name === 'string' && raw.name.trim()) item.name = raw.name;
    return item;
  }

  /** "Gained on Ruhr during a trade roll by Ava on turn 11." */
  function sourceText(what, planet, turn) {
    let text = 'Gained';
    if (planet) text += ' on ' + planet;
    if (what) text += ' during ' + what;
    if (typeof turn === 'number') text += ' on turn ' + turn;
    return text + '.';
  }

  /**
   * Item lines in a stage's output: [{ line, key, what, manual, damaged }].
   * key: line position. what: nearest group's source. manual: under a condition,
   * so the player confirms it. damaged: set on the line or any line above it.
   */
  function linesIn(output) {
    const out = [];
    const walk = (lines, prefix, what, manual, damaged) => {
      (lines || []).forEach((line, i) => {
        const key = prefix + i;
        const nextWhat = line.source || what;
        const nextManual = manual || !!line.when || !!line.conditional;
        const nextDamaged = damaged || !!line.damaged;
        if (line.type === 'table' && isItemTable(line.table) && line.rowId) {
          out.push({ line, key, what: nextWhat, manual: nextManual, damaged: nextDamaged });
        }
        walk(line.children, key + '.', nextWhat, nextManual, nextDamaged);
      });
    };
    if (output) {
      walk(output.lines, 'l', null, false, false);
      if (output.fu) walk(output.fu.lines, 'f', null, false, false);
    }
    return out;
  }

  LP.items = {
    CATEGORIES,
    ITEM_TABLES,
    isItemTable,
    categoryOf,
    categoryLabel,
    rowName,
    make,
    makeAll,
    expandRow,
    normalize,
    sourceText,
    linesIn
  };
})(window.LP);
