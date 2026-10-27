(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const A = LP.archetypes;
  const P = LP.planets;
  const rng = LP.rng;

  const selected = {};
  const openSections = new Set();

  const STATUS_LABELS = { invaded: 'Invaded', lost: 'Lost to Unity', liberated: 'Liberated' };

  function traitName(id) {
    const row = rng.getTable(A.WORLD_TRAITS).rows.find((r) => r.id === id);
    return row ? row.trait : id;
  }

  /** All enemy types (four tables) as select options, grouped by table. */
  function enemyOptions(includeRoving) {
    const tables = includeRoving ? LP.models.ENEMY_TABLES : A.FORCE_TABLES;
    return tables.map((t) => ({ label: t, options: rng.getTable(t).rows.map((r) => ({ value: t + '|' + r.id, label: r.enemy })) }));
  }

  function groupedSelect(groups, value, emptyLabel, attrs, onChange) {
    const select = el('select', Object.assign({ class: 'input select' }, attrs),
      el('option', { value: '' }, emptyLabel),
      groups.map((g) => el('optgroup', { label: g.label }, g.options.map((o) => el('option', { value: o.value }, o.label))))
    );
    select.value = value || '';
    select.addEventListener('change', () => onChange(select.value || null));
    return select;
  }

  function checkbox(label, checked, onChange, focus) {
    const input = el('input', { type: 'checkbox', checked: checked, 'data-focus': focus });
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'check' }, input, ' ' + label);
  }

  function badges(campaign, planet) {
    const out = [];
    if (planet.id === campaign.currentPlanetId) out.push(el('span', { class: 'badge badge-accent' }, 'Current'));
    if (planet.invasion) {
      out.push(el('span', { class: 'badge badge-' + planet.invasion.status }, STATUS_LABELS[planet.invasion.status] +
        (planet.invasion.status === 'invaded' && planet.invasion.enemy ? ' by ' + A.enemyName(planet.invasion.enemy) : '')));
    }
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  async function generatePlanet(state) {
    const { campaign } = state;
    const values = await LP.ui.form({
      title: 'Generate planet',
      message: 'Rolls the licence and world traits from the archetype. The planet is saved but you don’t travel there.',
      fields: [
        { key: 'archetype', label: 'Archetype', value: 'random', options: [{ value: 'random', label: 'Random archetype' }].concat(campaign.archetypes.map((a) => ({ value: a.id, label: a.name }))) },
        { key: 'name', label: 'Name (leave empty for a random one)', type: 'text', value: '', placeholder: P.randomName(campaign) },
        { key: 'wild', label: 'Wild Galaxy (roll two traits)', value: 'no', options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] }
      ],
      confirmLabel: 'Generate'
    });
    if (!values) return;
    const { planet } = P.createPlanet(campaign, { archetypeId: values.archetype, name: values.name, wildGalaxy: values.wild === 'yes' });
    selected[campaign.id] = planet.id;
    commit(state);
    LP.ui.notify('Generated ' + planet.name + ': ' + planet.worldTraits.map(traitName).join(', ') + (planet.licence.required ? ' · License required (' + planet.licence.cost + ' credits)' : ''), 'success');
  }

  async function deletePlanet(state, planet) {
    const ok = await LP.ui.confirm({
      title: 'Delete ' + planet.name + '?',
      message: 'Its Patrons, Rivals and invasion record go with it. This can’t be undone.',
      confirmLabel: 'Delete', danger: true
    });
    if (!ok) return;
    P.remove(state.campaign, planet.id);
    selected[state.campaign.id] = null;
    commit(state);
  }

  /* ---------------------------------------------------------------------- */
  /* Editor sections                                                        */
  /* ---------------------------------------------------------------------- */

  function block(title, body) {
    return el('section', { class: 'panel planet-block' }, el('h3', null, title), body);
  }

  function overview(state, planet) {
    const { campaign } = state;
    const name = el('input', { class: 'input', type: 'text', maxlength: '60', 'aria-label': 'Planet name', 'data-focus': 'planet-name' });
    name.value = planet.name;
    name.addEventListener('change', () => { planet.name = name.value.trim() || planet.name; commit(state); });

    const archetype = el('select', { class: 'input select', 'aria-label': 'Archetype', 'data-focus': 'planet-archetype' },
      campaign.archetypes.map((a) => el('option', { value: a.id }, a.name)));
    archetype.value = planet.archetypeId;
    archetype.addEventListener('change', () => { planet.archetypeId = archetype.value; commit(state); });

    const notes = el('textarea', { class: 'input planet-notes', rows: '2', placeholder: 'Notes', 'aria-label': 'Notes', 'data-focus': 'planet-notes' });
    notes.value = planet.notes;
    notes.addEventListener('change', () => { planet.notes = notes.value; commit(state); });

    const isCurrent = planet.id === campaign.currentPlanetId;
    return el('section', { class: 'panel planet-block' },
      el('div', { class: 'planet-head' },
        name,
        el('div', { class: 'toolbar' },
          el('button', {
            type: 'button', class: 'btn btn-sm' + (isCurrent ? '' : ' btn-primary'), disabled: isCurrent || !P.canVisit(planet),
            onclick: () => { P.setCurrent(campaign, planet.id); commit(state); }
          }, isCurrent ? 'Current planet' : 'Make current'),
          el('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => deletePlanet(state, planet) }, 'Delete')
        )
      ),
      el('div', { class: 'battle-mission-row' },
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Archetype'), archetype)
      ),
      el('div', { class: 'planet-badges' }, badges(campaign, planet)),
      LP.ui.conditionBadges(campaign, (c) => c.scope === 'planet' && c.targetId === planet.id, () => commit(state)),
      notes
    );
  }

  function traitsBlock(state, planet) {
    const table = rng.getTable(A.WORLD_TRAITS);
    const open = openSections.has('traits');
    const list = planet.worldTraits.map((id) => {
      const row = table.rows.find((r) => r.id === id);
      return el('li', null, el('strong', null, row ? row.trait : id), row ? ': ' + row.description : '');
    });
    return block('World traits', el('div', { class: 'arch-body' },
      list.length ? el('ul', { class: 'summary-list' }, list) : el('p', { class: 'muted' }, 'No traits.'),
      el('button', {
        type: 'button', class: 'btn btn-sm', 'data-focus': 'traits-edit',
        onclick: () => { if (open) openSections.delete('traits'); else openSections.add('traits'); draw(state); }
      }, open ? 'Done' : 'Edit traits'),
      open ? el('div', { class: 'check-grid' }, table.rows.map((r) => {
        const box = el('input', { type: 'checkbox', checked: planet.worldTraits.includes(r.id), 'data-focus': 'ptrait:' + r.id });
        box.addEventListener('change', () => {
          planet.worldTraits = box.checked ? planet.worldTraits.concat(r.id) : planet.worldTraits.filter((x) => x !== r.id);
          commit(state);
        });
        return el('label', { class: 'multi-option', title: r.description }, box, el('strong', null, r.trait));
      })) : null
    ));
  }

  function licenceBlock(state, planet) {
    const cost = el('input', { class: 'input input-number', type: 'number', min: '0', max: '20', 'aria-label': 'License cost', 'data-focus': 'licence-cost' });
    cost.value = String(planet.licence.cost || 0);
    cost.addEventListener('change', () => { planet.licence.cost = Math.max(0, parseInt(cost.value, 10) || 0); commit(state); });
    return block('Freelancer License', el('div', { class: 'battle-options' },
      checkbox('Required for Patron jobs', planet.licence.required, (v) => { planet.licence.required = v; commit(state); }, 'licence-req'),
      planet.licence.required ? el('label', { class: 'field inline-field' }, el('span', { class: 'field-label' }, 'Cost'), cost) : null,
      planet.licence.required ? checkbox('You own one', planet.licence.owned, (v) => { planet.licence.owned = v; commit(state); }, 'licence-owned') : null
    ));
  }

  /** Where a Rival or Patron came from, plus the player's own notes. Saved as typed. */
  const HAND_NOTE = (campaign) => 'Added on the Planets tab on turn ' + LP.roster.turnNumber(campaign) + '.';

  function contactNotes(state, contact, kind) {
    const area = el('textarea', {
      class: 'input contact-notes', rows: '2', placeholder: 'Where they came from, encounters…',
      'aria-label': 'Notes on ' + contact.name, 'data-focus': kind + '-notes:' + contact.id
    });
    area.value = contact.notes || '';
    area.addEventListener('input', () => {
      contact.notes = area.value;
      LP.storage.touchCampaign(state.campaign);
    });
    return area;
  }

  function patronsBlock(state, planet) {
    const { campaign } = state;
    const archetype = P.archetypeOf(campaign, planet);
    const rows = planet.patrons.map((p) => {
      const name = el('input', { class: 'input', type: 'text', maxlength: '60', 'aria-label': 'Patron name', 'data-focus': 'patron-name:' + p.id });
      name.value = p.name;
      name.addEventListener('change', () => { p.name = name.value.trim() || p.name; commit(state); });
      return el('li', { class: 'entry-card' },
        el('div', { class: 'entry-head' },
          name,
          el('span', { class: 'badge' }, p.patronType ? P.patronTypeName(p.patronType) : 'Type unknown'),
          el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { P.removePatron(planet, p.id); commit(state); } }, 'Remove')
        ),
        el('div', { class: 'battle-options' },
          checkbox('Persistent (follows you)', !!p.persistent, (v) => { p.persistent = v; commit(state); }, 'pp:' + p.id),
          checkbox('One-time Contract', !!p.oneTimeContract, (v) => { p.oneTimeContract = v; commit(state); }, 'po:' + p.id),
          p.benefit ? el('span', { class: 'field-detail' }, 'Benefit: ' + p.benefit) : null
        ),
        contactNotes(state, p, 'patron')
      );
    });
    const addFrom = el('select', { class: 'input select', 'aria-label': 'Add a Patron from the archetype', 'data-focus': 'patron-add-from' },
      el('option', { value: '' }, 'Add a named Patron…'),
      (archetype ? archetype.patrons : []).map((e) => el('option', { value: e.id }, e.name)));
    addFrom.addEventListener('change', () => {
      if (!addFrom.value) return;
      P.newPatron(campaign, planet, { entryId: addFrom.value, notes: HAND_NOTE(campaign) });
      commit(state);
    });
    return block('Patrons (' + planet.patrons.length + ')', el('div', { class: 'arch-body' },
      rows.length ? el('ul', { class: 'entry-list' }, rows) : el('p', { class: 'muted' }, 'No Patrons known here.'),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-sm', 'data-focus': 'patron-gen', onclick: () => { P.newPatron(campaign, planet, { notes: HAND_NOTE(campaign) }); commit(state); } }, '+ Generate Patron'),
        addFrom
      )
    ));
  }

  function rivalsBlock(state, planet) {
    const { campaign } = state;
    const archetype = P.archetypeOf(campaign, planet);
    const rows = planet.rivals.map((r) => {
      const name = el('input', { class: 'input', type: 'text', maxlength: '60', 'aria-label': 'Rival name', 'data-focus': 'rival-name:' + r.id });
      name.value = r.name;
      name.addEventListener('change', () => { r.name = name.value.trim() || r.name; commit(state); });
      return el('li', { class: 'entry-card' },
        el('div', { class: 'entry-head' },
          name,
          groupedSelect(enemyOptions(false), r.enemy, 'Enemy type unknown', { 'aria-label': 'Enemy type', 'data-focus': 'rival-enemy:' + r.id }, (v) => { r.enemy = v; commit(state); }),
          el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { P.removeRival(planet, r.id); commit(state); } }, 'Remove')
        ),
        el('div', { class: 'battle-options' },
          checkbox('They hate you (+1 to their numbers)', !!r.hates, (v) => { r.hates = v; commit(state); }, 'rh:' + r.id),
          el('span', { class: 'field-detail' }, r.uniques.length ? r.uniques.length + ' possible Unique Individuals' : 'Any Unique Individual')
        ),
        contactNotes(state, r, 'rival')
      );
    });
    const addFrom = el('select', { class: 'input select', 'aria-label': 'Add a Rival from the archetype', 'data-focus': 'rival-add-from' },
      el('option', { value: '' }, 'Add a named Rival…'),
      (archetype ? archetype.rivals : []).map((e) => el('option', { value: e.id }, e.name)));
    addFrom.addEventListener('change', () => {
      if (!addFrom.value) return;
      P.newRival(campaign, planet, { entryId: addFrom.value, notes: HAND_NOTE(campaign) });
      commit(state);
    });
    return block('Rivals (' + planet.rivals.length + ')', el('div', { class: 'arch-body' },
      rows.length ? el('ul', { class: 'entry-list' }, rows) : el('p', { class: 'muted' }, 'No Rivals here.'),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-sm', 'data-focus': 'rival-gen', onclick: () => { P.newRival(campaign, planet, { notes: HAND_NOTE(campaign) }); commit(state); } }, '+ Generate Rival'),
        addFrom
      )
    ));
  }

  /** Rivals and Patrons an event set aside, with a way to bring them back. */
  function setAsideBlock(state, planet) {
    const rows = [];
    const entry = (c, kind, enable) => el('li', { class: 'entry-card' },
      el('div', { class: 'entry-head' },
        el('strong', null, c.name),
        el('span', { class: 'field-detail' }, kind + ' · set aside' + (c.disabled && c.disabled.reason ? ' (' + c.disabled.reason + ')' : '') + (c.disabled && c.disabled.turn ? ' on turn ' + c.disabled.turn : '')),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => { enable(planet, c.id); commit(state); } }, 'Bring back')
      )
    );
    for (const r of planet.disabledRivals) rows.push(entry(r, 'Rival', P.enableRival));
    for (const p of planet.disabledPatrons) rows.push(entry(p, 'Patron', P.enablePatron));
    if (!rows.length) return null;
    return block('Set aside (' + rows.length + ')', el('div', { class: 'arch-body' }, el('ul', { class: 'entry-list' }, rows)));
  }

  function invasionBlock(state, planet) {
    const status = el('select', { class: 'input select', 'aria-label': 'Invasion status', 'data-focus': 'inv-status' },
      el('option', { value: '' }, 'Not invaded'),
      Object.entries(STATUS_LABELS).map(([v, label]) => el('option', { value: v }, label)));
    status.value = planet.invasion ? planet.invasion.status : '';
    status.addEventListener('change', () => {
      if (!status.value) planet.invasion = null;
      else if (!planet.invasion) planet.invasion = { status: status.value, enemy: null, makingGround: 0 };
      else planet.invasion.status = status.value;
      commit(state);
    });
    const inv = planet.invasion;
    let ground = null;
    if (inv && inv.status === 'invaded') {
      ground = el('input', { class: 'input input-number', type: 'number', min: '0', max: '20', 'aria-label': 'Making Ground results', 'data-focus': 'inv-ground' });
      ground.value = String(inv.makingGround || 0);
      ground.addEventListener('change', () => { inv.makingGround = Math.max(0, parseInt(ground.value, 10) || 0); commit(state); });
    }
    return block('Invasion', el('div', { class: 'battle-options' },
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Status'), status),
      inv ? el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Invader'),
        groupedSelect(enemyOptions(true), inv.enemy, 'Unknown', { 'aria-label': 'Invading enemy', 'data-focus': 'inv-enemy' }, (v) => { inv.enemy = v; commit(state); })) : null,
      ground ? el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Making Ground (+1 each)'), ground) : null,
      inv && inv.status === 'liberated' ? el('span', { class: 'field-detail' }, 'Future Invasion rolls here are at −2.') : null
    ));
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  function planetCard(state, planet, isSelected) {
    const archetype = P.archetypeOf(state.campaign, planet);
    return el('li', { class: 'crew-card' + (isSelected ? ' selected' : '') },
      el('button', {
        type: 'button', class: 'crew-card-main', 'aria-current': isSelected ? 'true' : null, 'data-focus': 'planet:' + planet.id,
        onclick: () => { selected[state.campaign.id] = planet.id; draw(state); }
      },
        el('span', { class: 'crew-card-name' }, planet.name),
        el('span', { class: 'crew-card-species' }, archetype ? archetype.name : 'No archetype'),
        el('span', { class: 'crew-card-stats' }, planet.worldTraits.map(traitName).join(', ') || 'No traits'),
        el('span', { class: 'planet-badges' }, badges(state.campaign, planet))
      )
    );
  }

  function commit(state) {
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;
    const { container, campaign } = state;
    clear(container);

    const planets = campaign.planets;
    let planet = P.get(campaign, selected[campaign.id]) || P.current(campaign) || planets[0] || null;
    if (planet) selected[campaign.id] = planet.id;

    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, planets.length ? planets.length + (planets.length === 1 ? ' planet' : ' planets') + (P.current(campaign) ? ' · current: ' + P.current(campaign).name : ' · no current planet') : 'No planets yet.'),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'planet-generate', onclick: () => generatePlanet(state) }, '+ Generate planet')
      )
    ));

    if (!planet) {
      container.appendChild(el('div', { class: 'empty-state' },
        el('h2', { text: 'No planets yet' }),
        el('p', { text: 'Planets are created when you arrive on a new world in the Campaign Turn, or you can generate one here.' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => generatePlanet(state) }, '+ Generate planet')
      ));
    } else {
      container.appendChild(el('div', { class: 'characters-layout' },
        el('nav', { class: 'crew-list-wrap', 'aria-label': 'Planets' },
          el('ul', { class: 'crew-list' }, planets.map((p) => planetCard(state, p, p === planet)))
        ),
        el('div', { class: 'arch-editor' },
          overview(state, planet),
          traitsBlock(state, planet),
          licenceBlock(state, planet),
          patronsBlock(state, planet),
          rivalsBlock(state, planet),
          setAsideBlock(state, planet),
          invasionBlock(state, planet)
        )
      ));
    }

    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  LP.tabs.planets = function render(container, campaign) {
    P.ensure(campaign);
    draw({ container, campaign });
  };
})(window.LP);
