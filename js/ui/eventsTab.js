(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const E = LP.events;
  const K = E.packs;

  /*
   * The Events tab (Edit mode): every event and condition of the base pack and the campaign's own
   * packs, with an editor for the campaign's own and a read-only view of the locked base ones.
   * Views: Events, Conditions, Packs, Reference.
   */

  // Per page visit, for each campaign: the view, the open event or condition, the filters.
  const memory = {};

  function mem(campaign) {
    if (!memory[campaign.id]) memory[campaign.id] = { view: 'events', event: null, condition: null, kind: '', search: '', exporting: false, picked: new Set() };
    return memory[campaign.id];
  }

  const VIEWS = [['events', 'Events'], ['conditions', 'Conditions'], ['packs', 'Packs'], ['reference', 'Reference']];

  function eventRows(campaign, m) {
    const rows = [];
    for (const pack of K.all(campaign)) {
      const locked = K.isLocked(campaign, pack.pack.id);
      for (const e of pack.events || []) {
        rows.push({ id: pack.pack.id + ':' + e.id, event: e, pack: pack, locked: locked });
      }
    }
    const q = m.search.trim().toLowerCase();
    return rows.filter((r) => (!m.kind || r.event.table === m.kind) &&
      (!q || (r.event.title + ' ' + (r.event.text || '') + ' ' + r.event.id + ' ' + r.pack.pack.name).toLowerCase().indexOf(q) >= 0));
  }

  function eventItem(state, m, row) {
    const { campaign } = state;
    const off = K.isDisabled(campaign, row.id);
    const problems = row.locked ? [] : K.eventProblems(campaign, row.id);
    const box = el('input', { type: 'checkbox', checked: !off, 'aria-label': 'Can happen: ' + row.event.title, 'data-focus': 'ev-on:' + row.id });
    box.addEventListener('change', () => { K.setEnabled(campaign, row.id, box.checked); LP.storage.touchCampaign(campaign); state.redraw(); });
    const pick = m.exporting ? el('input', { type: 'checkbox', checked: m.picked.has(row.id), 'aria-label': 'Export ' + row.event.title, 'data-focus': 'ev-pick:' + row.id }) : null;
    if (pick) pick.addEventListener('change', () => { if (pick.checked) m.picked.add(row.id); else m.picked.delete(row.id); state.redraw(); });
    return el('li', { class: 'ev-item' + (m.event === row.id ? ' is-selected' : '') + (off ? ' is-off' : '') },
      pick, box,
      el('button', { type: 'button', class: 'ev-pick', 'data-focus': 'ev-open:' + row.id, onclick: () => state.select(row.id) },
        el('span', { class: 'ev-title' }, row.event.title),
        el('span', { class: 'field-detail' }, 'weight ' + row.event.weight + (row.pack.pack.id === 'base' ? '' : ' · ' + row.pack.pack.name)),
        problems.length ? el('span', { class: 'ev-warn', title: problems[0] }, '⚠') : null,
        row.locked ? el('span', { class: 'ev-lock', 'aria-label': 'Locked' }, '🔒') : null));
  }

  function eventsView(state, m) {
    const { campaign } = state;
    const rows = eventRows(campaign, m);
    const kinds = m.kind ? [m.kind] : LP.ui.eventKinds.map((k) => k.value);

    const kind = el('select', { class: 'input select', 'aria-label': 'Table', 'data-focus': 'ev-kind' },
      el('option', { value: '' }, 'All tables'), LP.ui.eventKinds.map((k) => el('option', { value: k.value }, k.label)));
    kind.value = m.kind;
    kind.addEventListener('change', () => { m.kind = kind.value; state.redraw(); });
    const search = el('input', { class: 'input', type: 'search', placeholder: 'Search events', 'aria-label': 'Search events', 'data-focus': 'ev-search' });
    search.value = m.search;
    search.addEventListener('input', () => { m.search = search.value; });
    search.addEventListener('change', () => state.redraw());
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') state.redraw(); });

    const exportBtn = m.exporting
      ? el('button', {
        type: 'button', class: 'btn btn-sm btn-primary', disabled: !m.picked.size, 'data-focus': 'ev-export-go',
        onclick: async () => {
          const name = await LP.ui.prompt({ title: 'Export events', label: 'Name for the pack file', value: 'Selected events', confirmLabel: 'Export' });
          if (!name) return;
          const pack = K.exportEvents(campaign, Array.from(m.picked), name);
          LP.dom.downloadJson('last-parsec-events-' + pack.pack.id + '.json', pack);
          m.exporting = false;
          m.picked.clear();
          state.redraw();
        }
      }, 'Export ' + m.picked.size + ' selected')
      : null;

    const list = el('div', { class: 'ev-list-wrap' },
      el('div', { class: 'ev-filters' }, kind, search),
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button', class: 'btn btn-sm btn-primary', 'data-focus': 'ev-new',
          onclick: async () => {
            const values = await LP.ui.form({
              title: 'New event', message: 'It is added to your “My events” pack. Its steps are added in the editor.',
              fields: [{ key: 'title', label: 'Title', type: 'text', value: '' }, { key: 'table', label: 'Table', value: m.kind || 'character', options: LP.ui.eventKinds }],
              confirmLabel: 'Create'
            });
            if (!values) return;
            const pack = K.defaultPack(campaign);
            const id = K.addEvent(campaign, pack.pack.id, values.table, (values.title || '').trim() || 'New event');
            LP.storage.touchCampaign(campaign);
            m.kind = '';
            state.select(id);
          }
        }, '+ New event'),
        el('button', { type: 'button', class: 'btn btn-sm', 'data-focus': 'ev-export', onclick: () => { m.exporting = !m.exporting; m.picked.clear(); state.redraw(); } }, m.exporting ? 'Cancel export' : 'Export events…'),
        exportBtn),
      kinds.map((k) => {
        const mine = rows.filter((r) => r.event.table === k);
        if (!mine.length) return null;
        return el('div', { class: 'ev-group' },
          el('h4', null, (LP.ui.eventKinds.find((x) => x.value === k) || {}).label + ' (' + mine.length + ')'),
          el('ul', { class: 'ev-list' }, mine.map((r) => eventItem(state, m, r))));
      }),
      !rows.length ? el('p', { class: 'muted' }, 'No events match.') : null
    );

    return el('div', { class: 'characters-layout ev-layout' }, list, LP.ui.eventEditor(state, m.event));
  }

  function conditionRows(campaign) {
    const rows = [];
    for (const pack of K.all(campaign)) {
      const locked = K.isLocked(campaign, pack.pack.id);
      for (const type of pack.conditions || []) rows.push({ id: pack.pack.id + ':' + type.id, pack: pack, type: type, locked: locked });
    }
    return rows;
  }

  function conditionsView(state, m) {
    const { campaign } = state;
    const rows = conditionRows(campaign);
    const open = rows.find((r) => r.id === m.condition);
    const list = el('div', { class: 'ev-list-wrap' },
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button', class: 'btn btn-sm btn-primary', 'data-focus': 'ct-new',
          onclick: async () => {
            const name = await LP.ui.prompt({ title: 'New condition', label: 'Name', confirmLabel: 'Create' });
            if (!name) return;
            const pack = K.defaultPack(campaign);
            const type = K.addConditionType(campaign, pack.pack.id, name);
            LP.storage.touchCampaign(campaign);
            state.selectCondition(pack.pack.id + ':' + type.id);
          }
        }, '+ New condition')),
      el('ul', { class: 'ev-list' }, rows.map((r) => el('li', { class: 'ev-item' + (m.condition === r.id ? ' is-selected' : '') },
        el('button', { type: 'button', class: 'ev-pick', 'data-focus': 'ct-open:' + r.id, onclick: () => state.selectCondition(r.id) },
          el('span', { class: 'ev-title' }, r.type.name),
          el('span', { class: 'field-detail' }, r.type.scope + (r.pack.pack.id === 'base' ? '' : ' · ' + r.pack.pack.name)),
          r.locked ? el('span', { class: 'ev-lock', 'aria-label': 'Locked' }, '🔒') : null)))));
    return el('div', { class: 'characters-layout ev-layout' }, list,
      open ? LP.ui.conditionTypeEditor(state, open.pack, open.type, open.locked)
        : el('div', { class: 'empty-state' }, el('h2', { text: 'Pick a condition' }), el('p', { text: 'Conditions are lasting state events leave behind: a character away, a grounded ship, a single-use item.' })));
  }

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;
    const { container, campaign } = state;
    const m = mem(campaign);
    clear(container);

    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, 'Events decide what turns up on your journeys. The base events are locked: switch them off or duplicate them to make your own.'),
      el('div', { class: 'toolbar ev-views', role: 'tablist' }, VIEWS.map(([id, label]) => el('button', {
        type: 'button', class: 'btn btn-sm' + (m.view === id ? ' btn-primary' : ''), role: 'tab', 'aria-selected': m.view === id ? 'true' : 'false', 'data-focus': 'ev-view:' + id,
        onclick: () => { m.view = id; draw(state); }
      }, label)))
    ));

    if (m.view === 'events') container.appendChild(eventsView(state, m));
    else if (m.view === 'conditions') container.appendChild(conditionsView(state, m));
    else if (m.view === 'packs') container.appendChild(LP.ui.packsPanel(state));
    else container.appendChild(LP.ui.eventsReference());

    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  LP.tabs.events = function render(container, campaign) {
    const m = mem(campaign);
    const state = {
      container, campaign,
      redraw: () => draw(state),
      select: (id) => { m.event = id; m.view = 'events'; draw(state); },
      selectCondition: (id) => { m.condition = id; m.view = 'conditions'; draw(state); }
    };
    if (m.event && !K.find(campaign, m.event)) m.event = null;
    draw(state);
  };
})(window.LP);
