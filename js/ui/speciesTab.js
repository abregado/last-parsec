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

  /** The species' name tables: ordered chips with move and remove, an add dropdown, and a reset. */
  function namesCell(state, speciesId) {
    const { campaign } = state;
    const N = LP.names;
    const ids = N.tablesFor(campaign, speciesId);
    const save = (list) => {
      N.setSpeciesTables(campaign, speciesId, list);
      LP.storage.touchCampaign(campaign);
      draw(state);
    };
    const move = (i, d) => {
      const list = ids.slice();
      [list[i], list[i + d]] = [list[i + d], list[i]];
      save(list);
    };
    const available = campaign.nameTables.filter((t) => !ids.includes(t.id));
    const add = el('select', { class: 'input select select-sm', 'aria-label': 'Add a name table', 'data-focus': 'sp-add:' + speciesId },
      el('option', { value: '' }, '+ Add table'),
      available.map((t) => el('option', { value: t.id }, t.name)));
    add.addEventListener('change', () => { if (add.value) save(ids.concat(add.value)); });
    return el('div', { class: 'species-names' },
      ids.length ? ids.map((id, i) => el('span', { class: 'badge name-pill' },
        N.getTable(campaign, id).name,
        el('button', { type: 'button', class: 'btn-ghost', 'aria-label': 'Move earlier', disabled: i === 0, onclick: () => move(i, -1) }, '‹'),
        el('button', { type: 'button', class: 'btn-ghost', 'aria-label': 'Move later', disabled: i === ids.length - 1, onclick: () => move(i, 1) }, '›'),
        el('button', { type: 'button', class: 'btn-ghost', 'aria-label': 'Remove', onclick: () => save(ids.filter((x) => x !== id)) }, '×')))
        : el('span', { class: 'muted' }, 'No name'),
      available.length ? add : null,
      N.isOverridden(campaign, speciesId)
        ? el('button', { type: 'button', class: 'btn btn-sm btn-ghost', title: 'Back to the built-in tables', onclick: () => { N.resetSpecies(campaign, speciesId); LP.storage.touchCampaign(campaign); draw(state); } }, 'Reset')
        : null
    );
  }

  function draw(state) {
    const { container, campaign } = state;
    const active = document.activeElement;
    const focusKey = active && container.contains(active) && active.dataset ? active.dataset.focus : null;
    clear(container);
    const table = LP.archetypes.speciesTable();
    const total = table.reduce((s, r) => s + r.weight, 0);

    container.appendChild(el('p', { class: 'muted models-intro' },
      'All 26 species as one table. Each weight is the Crew Type weight × the subtable weight (p.14), so one roll gives the book’s two-step odds. Archetypes set their own weight per species; this is the default they reset to. Random species in the Characters tab rolls this table. Each species draws its name from the name tables listed (edit them on the Names tab).'));

    const rows = [];
    for (const g of GROUPS) {
      const members = table.filter((r) => r.group === g.id);
      const groupWeight = members.reduce((s, r) => s + r.weight, 0);
      rows.push(el('tr', { class: 'group-row' },
        el('th', { colspan: '2', scope: 'rowgroup' }, g.label),
        el('td', null),
        el('td', { class: 'col-num col-weight' }, String(groupWeight)),
        el('td', { class: 'col-num col-chance' }, percent(groupWeight, total))
      ));
      for (const r of members) {
        rows.push(el('tr', null,
          el('td', { class: 'col-name' }, el('span', { class: 'enemy-name' }, r.name)),
          el('td', { class: 'field-detail' }, r.how),
          el('td', null, namesCell(state, r.id)),
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
          el('th', null, 'Name tables'),
          el('th', { class: 'col-num col-weight' }, 'Weight'),
          el('th', { class: 'col-num col-chance' }, 'Chance')
        )),
        el('tbody', null, rows)
      )
    ));

    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  LP.tabs.species = function render(container, campaign) {
    LP.names.ensure(campaign);
    draw({ container, campaign });
  };
})(window.LP);
