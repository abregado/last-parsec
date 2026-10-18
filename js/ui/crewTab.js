(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const R = LP.roster;
  const I = LP.items;

  const STAT_SHORT = [
    ['reactions', 'Reactions', 'R'],
    ['speed', 'Speed', 'Sp'],
    ['combat', 'Combat Skill', 'CS'],
    ['toughness', 'Toughness', 'T'],
    ['savvy', 'Savvy', 'Sv'],
    ['luck', 'Luck', 'Lk']
  ];

  // The table picked in the Add item form, per campaign (page visit only).
  const addTableByCampaign = {};

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                                */
  /* ---------------------------------------------------------------------- */

  /** Save without redrawing (text being typed keeps its focus). */
  function save(state) {
    LP.storage.touchCampaign(state.campaign);
  }

  function commit(state) {
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  function numberInput(value, focus, onChange, attrs) {
    const input = el('input', Object.assign({ class: 'input input-number', type: 'number', inputmode: 'numeric', 'data-focus': focus }, attrs || {}));
    input.value = String(value);
    input.addEventListener('change', () => {
      const n = parseInt(input.value, 10);
      if (!isNaN(n)) onChange(n);
    });
    return input;
  }

  function textInput(value, focus, onInput, attrs) {
    const input = el('input', Object.assign({ class: 'input', type: 'text', autocomplete: 'off', 'data-focus': focus }, attrs || {}));
    input.value = value || '';
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function textArea(value, focus, onInput, attrs) {
    const area = el('textarea', Object.assign({ class: 'input crew-notes', rows: '2', 'data-focus': focus }, attrs || {}));
    area.value = value || '';
    area.addEventListener('input', () => onInput(area.value));
    return area;
  }

  /* ---------------------------------------------------------------------- */
  /* Items                                                                  */
  /* ---------------------------------------------------------------------- */

  async function removeItem(state, item) {
    const ok = await LP.ui.confirm({
      title: 'Remove item?',
      message: '"' + item.name + '" will be removed from the crew (sold, lost or destroyed).',
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    R.removeItem(state.campaign, item.id);
    commit(state);
  }

  function itemRow(state, item) {
    const campaign = state.campaign;
    const where = el('select', { class: 'input select item-move', 'aria-label': 'Where ' + item.name + ' is', 'data-focus': 'item-move:' + item.id },
      el('option', { value: '' }, 'Stash'),
      R.members(campaign).map((m) => el('option', { value: m.id }, R.nameOf(m)))
    );
    where.value = item.carrierId || '';
    where.addEventListener('change', () => {
      R.moveItem(campaign, item.id, where.value || null);
      commit(state);
    });

    const damaged = el('input', { type: 'checkbox', checked: item.damaged, 'data-focus': 'item-damaged:' + item.id });
    damaged.addEventListener('change', () => {
      item.damaged = damaged.checked;
      commit(state);
    });

    const category = I.categoryOf(item.table);
    return el('li', { class: 'item-row' + (item.damaged ? ' damaged' : '') },
      el('div', { class: 'item-head' },
        el('strong', { class: 'item-name' }, item.name),
        category ? el('span', { class: 'badge item-cat' }, I.categoryLabel(category)) : null,
        el('label', { class: 'check item-damaged' }, damaged, ' Damaged'),
        where,
        el('button', {
          type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove ' + item.name, title: 'Remove',
          'data-focus': 'item-remove:' + item.id, onclick: () => removeItem(state, item)
        }, '✕')
      ),
      textInput(item.source, 'item-source:' + item.id, (v) => {
        item.source = v;
        save(state);
      }, { class: 'input item-source', maxlength: '200', 'aria-label': 'Where ' + item.name + ' came from', placeholder: 'Where it came from' })
    );
  }

  function itemList(state, items, emptyText) {
    return items.length
      ? el('ul', { class: 'item-list' }, items.map((item) => itemRow(state, item)))
      : el('p', { class: 'muted' }, emptyText);
  }

  /** Inline form: pick a table and a result, and add it to the Stash. */
  function addItemForm(state) {
    const campaign = state.campaign;
    const tables = Object.keys(I.ITEM_TABLES);
    const tableName = addTableByCampaign[campaign.id] || tables[0];
    const tableSelect = el('select', { class: 'input select', 'aria-label': 'Item table', 'data-focus': 'add-table' },
      tables.map((t) => el('option', { value: t }, t.replace(/ (Table|Subtable)$/, '')))
    );
    tableSelect.value = tableName;
    tableSelect.addEventListener('change', () => {
      addTableByCampaign[campaign.id] = tableSelect.value;
      draw(state);
    });
    const table = LP.rng.getTable(tableName);
    const rowSelect = el('select', { class: 'input select', 'aria-label': 'Item', 'data-focus': 'add-row' },
      table.rows.map((r) => el('option', { value: r.id }, r[table.labelColumn]))
    );
    const source = textInput('', 'add-source', () => {}, { maxlength: '200', placeholder: 'Bought / found / gift… (optional)', 'aria-label': 'Where it came from' });

    return el('div', { class: 'add-item' },
      el('span', { class: 'field-label' }, 'Add an item to the Stash'),
      el('div', { class: 'add-item-row' },
        tableSelect,
        rowSelect,
        source,
        el('button', {
          type: 'button', class: 'btn', 'data-focus': 'add-item',
          onclick: () => {
            const turn = R.turnNumber(campaign);
            const item = R.addItem(campaign, {
              table: tableName, rowId: rowSelect.value, turn: turn,
              source: source.value.trim() || 'Added by hand on turn ' + turn + '.'
            });
            LP.ui.notify(item.name + ' added to the Stash.', 'success');
            commit(state);
          }
        }, 'Add')
      )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Members                                                                */
  /* ---------------------------------------------------------------------- */

  async function removeMember(state, member) {
    const ok = await LP.ui.confirm({
      title: 'Remove ' + R.nameOf(member) + '?',
      message: 'They leave the crew (killed, left or dismissed). Anything they carry goes to the Stash.',
      confirmLabel: 'Remove from crew',
      danger: true
    });
    if (!ok) return;
    R.removeMember(state.campaign, member.id);
    commit(state);
  }

  function memberCard(state, member) {
    const campaign = state.campaign;
    const roster = campaign.roster;
    const species = R.species(member);
    const isLeader = roster.leaderId === member.id;

    const status = el('select', { class: 'input select', 'aria-label': 'Status', 'data-focus': 'status:' + member.id },
      R.STATUSES.map((s) => el('option', { value: s.id }, s.label)));
    status.value = member.status;
    status.addEventListener('change', () => {
      member.status = status.value;
      if (member.status !== 'sick-bay') member.sickBayTurns = 0;
      commit(state);
    });

    const stats = STAT_SHORT.map(([key, label, short]) => el('label', { class: 'stat crew-stat', title: label },
      el('span', { class: 'crew-stat-name' }, short),
      numberInput(member.profile[key], 'stat:' + member.id + ':' + key, (n) => {
        member.profile[key] = n;
        commit(state);
      }, { 'aria-label': label, min: key === 'combat' || key === 'savvy' ? '-3' : '0', max: '15' })
    ));
    stats.push(el('label', { class: 'stat crew-stat', title: 'Experience points' },
      el('span', { class: 'crew-stat-name' }, 'XP'),
      numberInput(member.xp, 'xp:' + member.id, (n) => {
        member.xp = Math.max(0, n);
        commit(state);
      }, { 'aria-label': 'XP', min: '0', max: '999' })
    ));

    const carried = R.itemsOf(campaign, member.id);
    return el('li', { class: 'panel member-card' + (member.status === 'sick-bay' ? ' sick' : '') },
      el('div', { class: 'member-head' },
        textInput(member.name, 'member-name:' + member.id, (v) => {
          member.name = v;
          save(state);
        }, { class: 'input member-name', maxlength: '60', placeholder: 'Unnamed character', 'aria-label': 'Name' }),
        isLeader
          ? el('span', { class: 'leader-badge' }, 'Leader')
          : el('button', {
            type: 'button', class: 'btn btn-sm', 'data-focus': 'leader:' + member.id,
            onclick: () => {
              roster.leaderId = member.id;
              commit(state);
            }
          }, 'Make leader'),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-danger', 'data-focus': 'remove:' + member.id,
          onclick: () => removeMember(state, member)
        }, 'Remove')
      ),
      el('p', { class: 'member-meta' },
        el('strong', null, species ? species.name : 'Unknown species'),
        member.origins.length ? ' · ' + member.origins.map((o) => o.value).join(' · ') : '',
        ' · joined ' + (member.joinedTurn ? 'on turn ' + member.joinedTurn : 'at crew creation')
      ),
      el('div', { class: 'member-status' },
        el('label', { class: 'field inline-field' }, el('span', { class: 'field-label' }, 'Status'), status),
        member.status === 'sick-bay'
          ? el('label', { class: 'field inline-field' }, el('span', { class: 'field-label' }, 'Turns left'),
            numberInput(member.sickBayTurns, 'sick:' + member.id, (n) => {
              member.sickBayTurns = Math.max(0, n);
              commit(state);
            }, { min: '0', max: '20', 'aria-label': 'Turns left in Sick Bay' }))
          : null
      ),
      el('div', { class: 'stat-grid crew-stats' }, stats),
      species && species.rules && species.rules.length
        ? el('details', { class: 'member-rules' }, el('summary', null, 'Species rules'), el('ul', null, species.rules.map((r) => el('li', null, r))))
        : null,
      el('h4', { class: 'member-sub' }, 'Carrying'),
      itemList(state, carried, 'Nothing. Move items here from the Stash.'),
      textArea(member.notes, 'member-notes:' + member.id, (v) => {
        member.notes = v;
        save(state);
      }, { placeholder: 'Notes (injuries, upgrades…)', 'aria-label': 'Notes for ' + R.nameOf(member) })
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Ship and crew info                                                     */
  /* ---------------------------------------------------------------------- */

  function shipPanel(state) {
    const roster = state.campaign.roster;
    const ship = roster.ship;
    if (!ship) {
      return el('section', { class: 'panel crew-ship' },
        el('h3', null, 'Ship'),
        el('p', { class: 'muted' }, 'No ship.'),
        el('button', {
          type: 'button', class: 'btn btn-sm', onclick: () => {
            roster.ship = { name: '', rowId: null, type: '', hull: 20, hullMax: 20, debt: 0, traits: [] };
            commit(state);
          }
        }, 'Add a ship')
      );
    }
    return el('section', { class: 'panel crew-ship' },
      el('h3', null, 'Ship'),
      el('div', { class: 'ship-fields' },
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Name'),
          textInput(ship.name, 'ship-name', (v) => {
            ship.name = v;
            save(state);
          }, { maxlength: '60', placeholder: 'Unnamed ship' })),
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Hull Points'),
          el('span', { class: 'hull-pair' },
            numberInput(ship.hull, 'ship-hull', (n) => {
              ship.hull = Math.max(0, n);
              commit(state);
            }, { min: '0', max: '99', 'aria-label': 'Hull Points left' }),
            ' of ',
            numberInput(ship.hullMax, 'ship-hull-max', (n) => {
              ship.hullMax = Math.max(0, n);
              commit(state);
            }, { min: '0', max: '99', 'aria-label': 'Hull Points' }))),
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Debt (credits)'),
          numberInput(ship.debt, 'ship-debt', (n) => {
            ship.debt = Math.max(0, n);
            commit(state);
          }, { min: '0', max: '999' }))
      ),
      el('p', { class: 'field-detail' }, (ship.type || 'Ship') + (ship.traits.length ? ' · ' + ship.traits.join(', ') : '')),
      el('p', { class: 'field-detail' }, 'The turn’s Upkeep stage remembers debt and Hull damage from turn to turn; these values are where it starts.')
    );
  }

  function infoPanel(state) {
    const roster = state.campaign.roster;
    const start = roster.start;
    const facts = [];
    if (roster.metThrough) facts.push(['We met through', roster.metThrough]);
    if (roster.characterizedAs) facts.push(['Best characterized as', roster.characterizedAs]);
    if (start) {
      facts.push(['Starting credits', String(start.credits)]);
      facts.push(['Starting story points', String(start.storyPoints)]);
      if (start.patrons) facts.push(['Starting Patrons', String(start.patrons)]);
      if (start.rivals) facts.push(['Starting Rivals', String(start.rivals)]);
      if (start.questRumors) facts.push(['Starting Quest Rumors', String(start.questRumors)]);
    }
    return el('section', { class: 'panel crew-info' },
      el('h3', null, 'Crew'),
      facts.length ? el('dl', { class: 'line-facts crew-facts' }, facts.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v)))) : null,
      textArea(roster.notes, 'crew-notes', (v) => {
        roster.notes = v;
        save(state);
      }, { rows: '3', placeholder: 'Crew notes (credits, story points, Rumors…)', 'aria-label': 'Crew notes' })
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;
    const { container, campaign } = state;
    clear(container);

    if (!R.hasCrew(campaign)) {
      container.appendChild(el('div', { class: 'empty-state' },
        el('h2', { text: 'No crew yet' }),
        el('p', { text: 'Generate your characters, starting equipment and ship on the Characters tab, then press Finalize crew. They move here, and turns and battles use them.' }),
        el('a', { class: 'btn btn-primary', href: LP.router.campaignPath(campaign.id, 'characters') }, 'Go to Characters')
      ));
      return;
    }

    const roster = campaign.roster;
    const stash = R.itemsOf(campaign, null);
    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' },
        el('strong', null, 'Turn ' + R.turnNumber(campaign)), ' · ',
        roster.members.length + (roster.members.length === 1 ? ' crew member' : ' crew members') + ' · ' +
        roster.items.length + (roster.items.length === 1 ? ' item' : ' items')),
      el('div', { class: 'toolbar' },
        el('a', { class: 'btn', href: LP.router.campaignPath(campaign.id, 'characters') }, '+ Recruit')
      )
    ));

    container.appendChild(el('ul', { class: 'member-grid' }, roster.members.map((m) => memberCard(state, m))));

    container.appendChild(el('section', { class: 'panel crew-stash' },
      el('div', { class: 'models-head' },
        el('h3', null, 'Stash'),
        el('span', { class: 'models-count' }, stash.length + (stash.length === 1 ? ' item' : ' items') + (roster.ship ? '' : ' (no ship: 5 at most)'))
      ),
      itemList(state, stash, 'The Stash is empty.'),
      addItemForm(state)
    ));

    container.appendChild(el('div', { class: 'crew-bottom' }, shipPanel(state), infoPanel(state)));

    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus();
    }
  }

  LP.tabs.crew = function render(container, campaign) {
    R.ensure(campaign);
    draw({ container, campaign });
  };
})(window.LP);
