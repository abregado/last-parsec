(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const A = LP.archetypes;
  const P = LP.planets;
  const rng = LP.rng;

  // Per page visit: which archetype is open, which sections and entries are expanded.
  const selected = {};
  const openSections = new Set(['traits']);
  const openEntries = new Set();

  const SPECIES_GROUPS = [
    { id: 'human', label: 'Human' },
    { id: 'bot', label: 'Bot' },
    { id: 'primary-alien', label: 'Primary Aliens' },
    { id: 'strange', label: 'Strange Characters' }
  ];

  function percent(chance) {
    if (chance === null) return '—';
    const v = chance * 100;
    return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
  }

  function planetsUsing(campaign, archetype) {
    return (campaign.planets || []).filter((p) => p.archetypeId === archetype.id);
  }

  /* ---------------------------------------------------------------------- */
  /* Small building blocks                                                  */
  /* ---------------------------------------------------------------------- */

  function section(state, key, title, count, body) {
    const open = openSections.has(key);
    return el('section', { class: 'panel arch-section' },
      el('button', {
        type: 'button', class: 'models-toggle', 'aria-expanded': open ? 'true' : 'false', 'data-focus': 'section:' + key,
        onclick: () => {
          if (open) openSections.delete(key);
          else openSections.add(key);
          draw(state);
        }
      },
        el('span', { class: 'models-caret', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
        el('h3', null, title),
        el('span', { class: 'models-count' }, count)
      ),
      open ? body() : null
    );
  }

  function toolbar(buttons) {
    return el('div', { class: 'toolbar' }, buttons.map(([label, onclick, focus, disabled]) =>
      el('button', { type: 'button', class: 'btn btn-sm', onclick, 'data-focus': focus, disabled: !!disabled }, label)));
  }

  /** A grid of tick boxes. items: [{ id, label, hint }]; checked: Set; onToggle(id, on). */
  function checkGrid(items, checked, onToggle, focusPrefix) {
    return el('div', { class: 'check-grid' }, items.map((item) => {
      const box = el('input', { type: 'checkbox', checked: checked.has(item.id), 'data-focus': focusPrefix + item.id });
      box.addEventListener('change', () => onToggle(item.id, box.checked));
      return el('label', { class: 'multi-option', title: item.title || null },
        box,
        el('span', null, el('strong', null, item.label), item.hint ? el('span', { class: 'field-detail' }, ' ' + item.hint) : null)
      );
    }));
  }

  function summarise(names, all) {
    if (!names.length) return 'none';
    if (all && names.length === all) return 'all ' + all;
    return names.length <= 3 ? names.join(', ') : names.slice(0, 3).join(', ') + ' +' + (names.length - 3) + ' more';
  }

  /* ---------------------------------------------------------------------- */
  /* Sections                                                               */
  /* ---------------------------------------------------------------------- */

  function traitsSection(state, a) {
    const table = rng.getTable(A.WORLD_TRAITS);
    const allowed = new Set(a.worldTraits);
    const total = table.rows.filter((r) => allowed.has(r.id)).reduce((s, r) => s + r.weight, 0);
    const set = (ids) => { a.worldTraits = table.rows.map((r) => r.id).filter((id) => ids.includes(id)); commit(state); };
    return section(state, 'traits', 'World traits', a.worldTraits.length + ' of ' + table.rows.length, () => el('div', { class: 'arch-body' },
      toolbar([
        ['All', () => set(table.rows.map((r) => r.id)), 'traits-all'],
        ['None', () => set([]), 'traits-none']
      ]),
      checkGrid(
        table.rows.map((r) => ({
          id: r.id,
          label: r.trait,
          hint: r.ranges.weight + (allowed.has(r.id) ? ' · ' + percent(r.weight / total) : ''),
          title: r.description
        })),
        allowed,
        (id, on) => set(on ? a.worldTraits.concat(id) : a.worldTraits.filter((x) => x !== id)),
        'trait:'
      )
    ));
  }

  function speciesSection(state, a) {
    const table = A.speciesTable();
    const total = Object.values(a.species).reduce((s, w) => s + w, 0);
    const used = Object.values(a.species).filter((w) => w > 0).length;
    return section(state, 'species', 'Species (recruits)', used + ' of 26 possible', () => el('div', { class: 'arch-body' },
      el('p', { class: 'field-detail' }, 'Weights on the combined species table (see the Species tab). 0 means never recruited here.'),
      toolbar([
        ['All to 0', () => { for (const id of Object.keys(a.species)) a.species[id] = 0; commit(state); }, 'species-zero'],
        ['Reset to default', () => { a.species = A.defaultSpeciesWeights(); commit(state); }, 'species-reset']
      ]),
      SPECIES_GROUPS.map((g) => el('div', { class: 'species-group' },
        el('h4', null, g.label),
        el('div', { class: 'species-weights' }, table.filter((s) => s.group === g.id).map((s) => {
          const input = el('input', {
            type: 'number', class: 'input input-number species-weight', min: '0', max: '100000',
            'aria-label': s.name + ' weight', 'data-focus': 'species:' + s.id
          });
          input.value = String(a.species[s.id] || 0);
          input.addEventListener('change', () => {
            const n = parseInt(input.value, 10);
            a.species[s.id] = isNaN(n) || n < 0 ? 0 : n;
            commit(state);
          });
          const w = a.species[s.id] || 0;
          return el('label', { class: 'species-weight-row' + (w ? '' : ' is-off') },
            el('span', { class: 'species-name' }, s.name),
            input,
            el('span', { class: 'col-num field-detail' }, total ? percent(w / total) : '—'),
            el('span', { class: 'field-detail species-default' }, 'default ' + s.weight)
          );
        }))
      ))
    ));
  }

  function eventsSection(state, a) {
    const counts = Object.entries(A.EVENT_TABLES).map(([key, table]) => a.events[key].length + '/' + rng.getTable(table).rows.length);
    return section(state, 'events', 'Events', counts.join(' · '), () => el('div', { class: 'arch-body' },
      Object.entries(A.EVENT_TABLES).map(([key, tableName]) => {
        const table = rng.getTable(tableName);
        const allowed = new Set(a.events[key]);
        const set = (ids) => { a.events[key] = table.rows.map((r) => r.id).filter((id) => ids.includes(id)); commit(state); };
        const subKey = 'events-' + key;
        const open = openSections.has(subKey);
        return el('div', { class: 'event-group' },
          el('div', { class: 'models-head' },
            el('button', {
              type: 'button', class: 'models-toggle', 'aria-expanded': open ? 'true' : 'false', 'data-focus': 'section:' + subKey,
              onclick: () => { if (open) openSections.delete(subKey); else openSections.add(subKey); draw(state); }
            },
              el('span', { class: 'models-caret', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
              el('h4', null, A.EVENT_LABELS[key]),
              el('span', { class: 'models-count' }, allowed.size + ' of ' + table.rows.length)
            ),
            toolbar([
              ['All', () => set(table.rows.map((r) => r.id)), 'ev-all-' + key],
              ['None', () => set([]), 'ev-none-' + key]
            ])
          ),
          open ? checkGrid(
            table.rows.map((r) => ({ id: r.id, label: r[table.labelColumn], hint: r.ranges.weight })),
            allowed,
            (id, on) => set(on ? a.events[key].concat(id) : a.events[key].filter((x) => x !== id)),
            'ev:' + key + ':'
          ) : null
        );
      })
    ));
  }

  /** Grouped enemy options for force lists (Criminal Elements, Hired Muscle, Interested Parties). */
  function forceItems() {
    const out = [];
    for (const t of A.FORCE_TABLES) {
      for (const r of rng.getTable(t).rows) out.push({ id: t + '|' + r.id, label: r.enemy, group: t });
    }
    return out;
  }

  function entryCard(state, a, entry, kind) {
    const key = kind + ':' + entry.id;
    const open = openEntries.has(key);
    const forces = forceItems();
    const uniques = rng.getTable('Unique Individuals').rows;
    const list = kind === 'patron' ? a.patrons : a.rivals;
    const forceNames = forces.filter((f) => entry.forces.includes(f.id)).map((f) => f.label);
    const uniqueNames = uniques.filter((u) => entry.uniques.includes(u.id)).map((u) => u.enemy);

    const name = el('input', { class: 'input', type: 'text', maxlength: '60', 'aria-label': 'Name', 'data-focus': 'entry-name:' + entry.id });
    name.value = entry.name;
    name.addEventListener('change', () => {
      entry.name = name.value.trim() || entry.name;
      commit(state);
    });

    let typeSelect = null;
    if (kind === 'patron') {
      typeSelect = el('select', { class: 'input select', 'aria-label': 'Patron type', 'data-focus': 'entry-type:' + entry.id },
        el('option', { value: '' }, 'Random type'),
        rng.getTable('Patron Table').rows.map((r) => el('option', { value: r.id }, r.patron_is))
      );
      typeSelect.value = entry.patronType || '';
      typeSelect.addEventListener('change', () => {
        entry.patronType = typeSelect.value || null;
        commit(state);
      });
    }

    const toggleList = (field) => (id, on) => {
      entry[field] = on ? entry[field].concat(id) : entry[field].filter((x) => x !== id);
      commit(state);
    };

    return el('li', { class: 'entry-card' + (open ? ' open' : '') },
      el('div', { class: 'entry-head' },
        name,
        typeSelect,
        el('div', { class: 'toolbar' },
          el('button', {
            type: 'button', class: 'btn btn-sm', 'data-focus': 'entry-edit:' + entry.id,
            onclick: () => { if (open) openEntries.delete(key); else openEntries.add(key); draw(state); }
          }, open ? 'Done' : 'Edit'),
          el('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: () => {
              const copy = JSON.parse(JSON.stringify(entry));
              copy.id = LP.storage.newId();
              copy.name = P.uniqueName(entry.name, list.map((x) => x.name));
              list.splice(list.indexOf(entry) + 1, 0, copy);
              commit(state);
            }
          }, 'Copy'),
          el('button', {
            type: 'button', class: 'btn btn-sm btn-ghost',
            onclick: () => { list.splice(list.indexOf(entry), 1); commit(state); }
          }, 'Remove')
        )
      ),
      el('p', { class: 'field-detail' },
        (kind === 'patron' ? 'Forces (if they turn on you): ' : 'Forces: ') + summarise(forceNames, forces.length) +
        ' · Unique Individuals: ' + summarise(uniqueNames, uniques.length)),
      open ? el('div', { class: 'entry-edit' },
        el('div', { class: 'models-head' },
          el('h4', null, kind === 'patron' ? 'Their forces' : 'Forces'),
          toolbar([
            ['All', () => { entry.forces = forces.map((f) => f.id); commit(state); }],
            ['None', () => { entry.forces = []; commit(state); }]
          ])
        ),
        A.FORCE_TABLES.map((t) => el('div', { class: 'force-group' },
          el('span', { class: 'field-detail' }, t),
          checkGrid(forces.filter((f) => f.group === t), new Set(entry.forces), toggleList('forces'), 'force:' + entry.id + ':')
        )),
        el('div', { class: 'models-head' },
          el('h4', null, 'Unique Individuals'),
          toolbar([
            ['All', () => { entry.uniques = uniques.map((u) => u.id); commit(state); }],
            ['None', () => { entry.uniques = []; commit(state); }]
          ])
        ),
        checkGrid(uniques.map((u) => ({ id: u.id, label: u.enemy })), new Set(entry.uniques), toggleList('uniques'), 'unique:' + entry.id + ':')
      ) : null
    );
  }

  function entriesSection(state, a, kind) {
    const list = kind === 'patron' ? a.patrons : a.rivals;
    const title = kind === 'patron' ? 'Patrons' : 'Rivals';
    return section(state, kind + 's', title, String(list.length), () => el('div', { class: 'arch-body' },
      el('p', { class: 'field-detail' }, kind === 'patron'
        ? 'Named Patrons that can be met here. Their forces are used if they turn on you (a Vengeful job failure).'
        : 'Named Rivals that can appear here. A Rival you gain after a battle is matched to the enemy you fought.'),
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button', class: 'btn btn-sm btn-primary', 'data-focus': 'add-' + kind,
          onclick: () => {
            const entry = { id: LP.storage.newId(), name: P.uniqueName(kind === 'patron' ? 'New Patron' : 'New Rival', list.map((x) => x.name)), forces: [], uniques: [] };
            if (kind === 'patron') entry.patronType = null;
            list.push(entry);
            openEntries.add(kind + ':' + entry.id);
            commit(state);
          }
        }, kind === 'patron' ? '+ Add Patron' : '+ Add Rival')
      ),
      list.length
        ? el('ul', { class: 'entry-list' }, list.map((entry) => entryCard(state, a, entry, kind)))
        : el('p', { class: 'muted' }, 'None yet.')
    ));
  }

  /* ---------------------------------------------------------------------- */
  /* Archetype list and actions                                             */
  /* ---------------------------------------------------------------------- */

  async function renameArchetype(state, a) {
    const name = await LP.ui.prompt({ title: 'Rename archetype', label: 'Name', value: a.name, confirmLabel: 'Rename' });
    if (name) { a.name = name; commit(state); }
  }

  async function deleteArchetype(state, a) {
    const { campaign } = state;
    if (campaign.archetypes.length <= 1) return;
    const using = planetsUsing(campaign, a);
    const others = campaign.archetypes.filter((x) => x !== a);
    let replacement = others[0].id;
    if (using.length) {
      const values = await LP.ui.form({
        title: 'Delete "' + a.name + '"?',
        message: using.length + (using.length === 1 ? ' planet uses' : ' planets use') + ' this archetype. Choose an archetype for them instead.',
        fields: [{ key: 'to', label: 'Move planets to', value: replacement, options: others.map((x) => ({ value: x.id, label: x.name })) }],
        confirmLabel: 'Delete'
      });
      if (!values) return;
      replacement = values.to;
    } else {
      const ok = await LP.ui.confirm({ title: 'Delete "' + a.name + '"?', message: 'This can’t be undone.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
    }
    for (const p of using) p.archetypeId = replacement;
    campaign.archetypes = others;
    selected[campaign.id] = replacement;
    commit(state);
  }

  function archetypeCard(state, a, isSelected) {
    const using = planetsUsing(state.campaign, a).length;
    return el('li', { class: 'crew-card' + (isSelected ? ' selected' : '') },
      el('button', {
        type: 'button', class: 'crew-card-main', 'aria-current': isSelected ? 'true' : null, 'data-focus': 'arch:' + a.id,
        onclick: () => { selected[state.campaign.id] = a.id; draw(state); }
      },
        el('span', { class: 'crew-card-name' }, a.name),
        el('span', { class: 'crew-card-stats' }, a.worldTraits.length + ' traits · ' + a.patrons.length + ' Patrons · ' + a.rivals.length + ' Rivals'),
        el('span', { class: 'crew-card-species' }, using ? using + (using === 1 ? ' planet' : ' planets') : 'No planets yet')
      )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  function commit(state) {
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;
    const { container, campaign } = state;
    clear(container);

    let a = A.get(campaign, selected[campaign.id]);
    if (!a) {
      a = campaign.archetypes[0];
      selected[campaign.id] = a.id;
    }

    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, 'Archetypes decide what can turn up on a kind of world: traits, recruits, events, Patrons and Rivals.'),
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button', class: 'btn btn-primary', 'data-focus': 'arch-new',
          onclick: async () => {
            const name = await LP.ui.prompt({ title: 'New archetype', label: 'Name', confirmLabel: 'Create' });
            if (!name) return;
            const created = A.emptyArchetype(name);
            campaign.archetypes.push(created);
            selected[campaign.id] = created.id;
            commit(state);
          }
        }, '+ New archetype'),
        el('button', {
          type: 'button', class: 'btn', 'data-focus': 'arch-copy',
          onclick: () => {
            const copy = A.copyArchetype(a);
            campaign.archetypes.push(copy);
            selected[campaign.id] = copy.id;
            commit(state);
          }
        }, 'Copy')
      )
    ));

    const warnings = A.warnings(a);
    container.appendChild(el('div', { class: 'characters-layout' },
      el('nav', { class: 'crew-list-wrap', 'aria-label': 'Archetypes' },
        el('ul', { class: 'crew-list' }, campaign.archetypes.map((x) => archetypeCard(state, x, x === a)))
      ),
      el('div', { class: 'arch-editor' },
        el('div', { class: 'panel arch-title' },
          el('h2', null, a.name),
          el('div', { class: 'toolbar' },
            el('button', { type: 'button', class: 'btn btn-sm', onclick: () => renameArchetype(state, a) }, 'Rename'),
            el('button', { type: 'button', class: 'btn btn-sm btn-danger', disabled: campaign.archetypes.length <= 1, onclick: () => deleteArchetype(state, a) }, 'Delete')
          ),
          warnings.length ? el('ul', { class: 'summary-list arch-warnings' }, warnings.map((w) => el('li', null, w))) : null
        ),
        traitsSection(state, a),
        speciesSection(state, a),
        eventsSection(state, a),
        entriesSection(state, a, 'patron'),
        entriesSection(state, a, 'rival')
      )
    ));

    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  LP.tabs.archetypes = function render(container, campaign) {
    P.ensure(campaign);
    draw({ container, campaign });
  };
})(window.LP);
