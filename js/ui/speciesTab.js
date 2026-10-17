(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;

  const GROUPS = [
    { id: 'human', label: 'Human' },
    { id: 'bot', label: 'Bot' },
    { id: 'primary-alien', label: 'Primary Aliens' },
    { id: 'strange', label: 'Strange Characters' }
  ];

  function percent(weight, total) {
    const value = (weight / total) * 100;
    return (value >= 10 ? value.toFixed(0) : value >= 1 ? value.toFixed(1) : value.toFixed(2)) + '%';
  }

  LP.tabs.species = function render(container) {
    clear(container);
    const table = LP.archetypes.speciesTable();
    const total = table.reduce((s, r) => s + r.weight, 0);

    container.appendChild(el('p', { class: 'muted models-intro' },
      'All 26 species as one table. Each weight is the Crew Type weight × the subtable weight (p.14), so one roll gives the book’s two-step odds. Archetypes set their own weight per species; this is the default they reset to. Random species in the Characters tab rolls this table.'));

    const rows = [];
    for (const g of GROUPS) {
      const members = table.filter((r) => r.group === g.id);
      const groupWeight = members.reduce((s, r) => s + r.weight, 0);
      rows.push(el('tr', { class: 'group-row' },
        el('th', { colspan: '2', scope: 'rowgroup' }, g.label),
        el('td', { class: 'col-num col-weight' }, String(groupWeight)),
        el('td', { class: 'col-num col-chance' }, percent(groupWeight, total))
      ));
      for (const r of members) {
        rows.push(el('tr', null,
          el('td', { class: 'col-name' }, el('span', { class: 'enemy-name' }, r.name)),
          el('td', { class: 'field-detail' }, r.how),
          el('td', { class: 'col-num col-weight' }, String(r.weight)),
          el('td', { class: 'col-num col-chance' }, percent(r.weight, total))
        ));
      }
    }

    container.appendChild(el('section', { class: 'panel models-table' },
      el('div', { class: 'models-head' },
        el('h3', null, 'Species'),
        el('span', { class: 'models-count' }, 'Total weight ' + total)
      ),
      el('table', { class: 'models-grid species-grid' },
        el('thead', null, el('tr', null,
          el('th', null, 'Species'),
          el('th', null, 'Weight from'),
          el('th', { class: 'col-num col-weight' }, 'Weight'),
          el('th', { class: 'col-num col-chance' }, 'Chance')
        )),
        el('tbody', null, rows)
      )
    ));
  };
})(window.LP);
