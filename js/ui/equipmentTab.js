(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;

  /* Read-only view of the equipment tables (pp.28-29, 50-56, 131-133). */

  const SECTIONS = [
    {
      id: 'starting', title: 'Starting and purchased equipment',
      intro: 'Rolled when the crew is created (p.28), and bought for 3 credits a roll in Purchase items (p.125).',
      tables: ['Military Weapon Table', 'High-tech Weapon Table', 'Low-tech Weapon Table', 'Gear Table', 'Gadget Table']
    },
    {
      id: 'loot', title: 'Loot',
      intro: 'The Loot Table points to a subtable; the subtables below give the item.',
      tables: ['Loot Table', 'Weapon Category Subtable', 'Gear Subtable', 'Odd and Ends Table']
    },
    {
      id: 'loot-weapons', title: 'Loot weapons',
      tables: ['Slug Weapons Subtable', 'Energy Weapons Subtable', 'Special Weapons Subtable', 'Melee Weapons Subtable', 'Grenades Subtable']
    },
    {
      id: 'loot-gear', title: 'Loot gear',
      tables: ['Gun Mods Subtable', 'Gun Sights Subtable', 'Protective Items Subtable', 'Utility Items Subtable']
    },
    {
      id: 'odds-and-ends', title: 'Odds and ends',
      tables: ['Consumables Subtable', 'Implants Subtable', 'Ship Items Subtable']
    }
  ];

  function percent(weight, total) {
    const value = (weight / total) * 100;
    return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + '%';
  }

  function slug(name) {
    return 'eq-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  }

  function tablePanel(tableName) {
    const table = LP.rng.getTable(tableName);
    const total = table.rows.reduce((s, r) => s + r.weight, 0);
    const extra = table.columns.filter((c) => !c.startsWith('weight') && c !== table.labelColumn);
    const category = LP.items.categoryOf(tableName);
    return el('section', { class: 'panel models-table equipment-table', id: slug(tableName) },
      el('div', { class: 'models-head' },
        el('h3', null, tableName),
        el('span', { class: 'models-count' }, table.die + (table.pdfPages && table.pdfPages.length ? ' · p.' + table.pdfPages.join(', ') : '') + (category ? ' · ' + LP.items.categoryLabel(category) : ''))
      ),
      el('table', { class: 'models-grid' },
        el('thead', null, el('tr', null,
          el('th', { class: 'col-num' }, 'Roll'),
          el('th', null, 'Result'),
          extra.length ? el('th', null, 'Effect') : null,
          el('th', { class: 'col-num col-chance' }, 'Chance')
        )),
        el('tbody', null, table.rows.map((r) => el('tr', null,
          el('td', { class: 'col-num' }, r.ranges && r.ranges.weight ? r.ranges.weight : ''),
          el('td', { class: 'col-name' }, el('span', { class: 'enemy-name' }, r[table.labelColumn])),
          extra.length ? el('td', { class: 'field-detail' }, extra.map((c) => r[c]).filter((t) => t && t !== '-').join(' · ')) : null,
          el('td', { class: 'col-num col-chance' }, percent(r.weight, total))
        )))
      )
    );
  }

  LP.tabs.equipment = function render(container) {
    clear(container);
    container.appendChild(el('p', { class: 'muted models-intro' },
      'The equipment tables, as printed. These aren’t editable yet. Items rolled on them during a turn go into the Stash on the Crew tab.'));
    container.appendChild(el('nav', { class: 'equipment-jump', 'aria-label': 'Equipment tables' },
      SECTIONS.map((s) => el('a', { class: 'btn btn-sm', href: '#' + slug(s.tables[0]), onclick: (e) => {
        e.preventDefault();
        const target = document.getElementById(slug(s.tables[0]));
        if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } }, s.title))
    ));
    for (const s of SECTIONS) {
      container.appendChild(el('h2', { class: 'equipment-section' }, s.title));
      if (s.intro) container.appendChild(el('p', { class: 'muted' }, s.intro));
      container.appendChild(el('div', { class: 'equipment-grid' }, s.tables.map(tablePanel)));
    }
  };
})(window.LP);
