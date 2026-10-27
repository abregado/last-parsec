(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const N = LP.names;

  const selected = {}; // campaign id -> selected table id

  function commit(state) {
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  async function newTable(state) {
    const name = await LP.ui.prompt({ title: 'New name table', label: 'Name', confirmLabel: 'Create' });
    if (!name) return;
    selected[state.campaign.id] = N.addTable(state.campaign, name).id;
    commit(state);
  }

  async function renameTable(state, table) {
    const name = await LP.ui.prompt({ title: 'Rename name table', label: 'Name', value: table.name, confirmLabel: 'Rename' });
    if (!name) return;
    N.renameTable(state.campaign, table.id, name);
    commit(state);
  }

  async function deleteTable(state, table) {
    const users = N.usedBy(state.campaign, table.id);
    const ok = await LP.ui.confirm({
      title: 'Delete "' + table.name + '"?',
      message: (users.length ? 'It is removed from ' + users.map((s) => s.name).join(', ') + ', and any of them left with no table use the generic names. ' : '') + 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    N.deleteTable(state.campaign, table.id);
    delete selected[state.campaign.id];
    commit(state);
  }

  function tableCard(state, table, active) {
    return el('li', null,
      el('button', {
        type: 'button',
        class: 'btn name-table-btn' + (active ? ' btn-primary' : ''),
        'aria-current': active ? 'true' : null,
        'data-focus': 'names-table:' + table.id,
        onclick: () => { selected[state.campaign.id] = table.id; draw(state); }
      }, el('span', null, table.name), el('span', { class: 'models-count' }, String(table.names.length)))
    );
  }

  function entriesPanel(state, table) {
    const { campaign } = state;
    const input = el('input', { class: 'input', type: 'text', placeholder: 'One name, or several separated by commas', autocomplete: 'off', 'data-focus': 'names-add' });
    const add = () => {
      if (!input.value.trim()) return;
      const added = N.addNames(campaign, table.id, input.value);
      if (!added) LP.ui.notify('Nothing new to add: those names are already in the table.', 'info');
      commit(state);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    const users = N.usedBy(campaign, table.id);

    return el('div', { class: 'panel name-editor' },
      el('div', { class: 'arch-title' },
        el('h2', null, table.name),
        el('div', { class: 'toolbar' },
          el('button', { type: 'button', class: 'btn btn-sm', onclick: () => renameTable(state, table) }, 'Rename'),
          el('button', {
            type: 'button', class: 'btn btn-sm btn-danger', disabled: table.id === N.GENERIC,
            title: table.id === N.GENERIC ? 'Species with no name table use the generic table, so it can’t be deleted' : null,
            onclick: () => deleteTable(state, table)
          }, 'Delete')
        ),
        el('p', { class: 'field-detail' }, users.length ? 'Used by ' + users.map((s) => s.name).join(', ') + '.' : 'No species use this table yet. Add it to a species on the Species tab.')
      ),
      el('div', { class: 'toolbar names-add' }, input, el('button', { type: 'button', class: 'btn btn-sm', onclick: add }, 'Add')),
      el('p', { class: 'field-detail' }, 'Commas are not allowed in names; they separate several names typed at once.'),
      table.names.length
        ? el('ul', { class: 'name-chips' }, table.names.map((name, i) => el('li', null,
          el('span', null, name),
          el('button', {
            type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove ' + name,
            disabled: table.id === N.GENERIC && table.names.length <= 1,
            onclick: () => { N.removeName(campaign, table.id, i); commit(state); }
          }, '×'))))
        : el('p', { class: 'muted' }, 'This table is empty, so species that use it get no name from it.')
    );
  }

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;
    const { container, campaign } = state;
    clear(container);

    let table = N.getTable(campaign, selected[campaign.id]) || campaign.nameTables[0] || null;
    if (table) selected[campaign.id] = table.id;

    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, 'Name tables for generated characters. A species draws one name from each of its tables (set on the Species tab) and joins them with a space. A species with no table uses the Generic names.'),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'names-new', onclick: () => newTable(state) }, '+ New table'))
    ));

    container.appendChild(el('div', { class: 'characters-layout' },
      el('nav', { class: 'crew-list-wrap', 'aria-label': 'Name tables' },
        el('ul', { class: 'name-table-list' }, campaign.nameTables.map((t) => tableCard(state, t, t === table)))
      ),
      table ? entriesPanel(state, table) : el('p', { class: 'muted' }, 'No name tables. Add one to start.')
    ));

    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  LP.tabs.names = function render(container, campaign) {
    N.ensure(campaign);
    draw({ container, campaign });
  };
})(window.LP);
