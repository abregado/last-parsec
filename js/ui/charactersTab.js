(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const C = LP.character;

  // Which character is open in each campaign (per page visit only).
  const selectedByCampaign = {};
  // Slot path to highlight after the next draw (just rerolled / changed).
  let flash = null;

  const GROUP_NAMES = {
    'human': 'Human',
    'bot': 'Bot',
    'primary-alien': 'Primary Alien',
    'strange': 'Strange Character'
  };

  /* ---------------------------------------------------------------------- */
  /* Text helpers                                                           */
  /* ---------------------------------------------------------------------- */

  function signed(n) {
    return n >= 0 ? '+' + n : String(n);
  }

  function isEmptyCell(text) {
    return text === undefined || text === null || ['', '-', '–', '—'].includes(String(text).trim());
  }

  /** "+1 Savvy · +1D6 credits · +1 High-tech Weapon" for an origin row. */
  function rowEffects(row) {
    if (!row) return '';
    return ['effect', 'resources', 'starting']
      .map((col) => row[col])
      .filter((text) => !isEmptyCell(text))
      .join(' · ');
  }

  function tableShortName(tableName) {
    return tableName.replace(/ Table$/, '');
  }

  function pathKey(path) {
    return path.join('.');
  }

  function characterName(character) {
    return character.name.trim() || 'Unnamed character';
  }

  function shortStats(result) {
    const p = result.profile;
    return 'R ' + p.reactions + ' · Sp ' + p.speed + '" · CS ' + signed(p.combat) +
      ' · T ' + p.toughness + ' · Sv ' + signed(p.savvy);
  }

  /* ---------------------------------------------------------------------- */
  /* Slot descriptions                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * Everything a row needs to show a slot:
   *   label, value (display text of the current result, '' if none),
   *   detail (secondary line), lockedBy (species name if forced)
   */
  function describe(character, path, spec) {
    const slot = C.getSlot(character, path);
    const kind = C.slotKind(path);
    const species = C.getSpecies(character.species.value);

    if (kind === 'species') {
      return {
        label: 'Species',
        value: species ? species.name : '',
        detail: species ? GROUP_NAMES[species.group] : ''
      };
    }

    if (kind === 'field') {
      const row = slot.value ? C.findRow(spec.table, slot.value) : null;
      const mapped = row && spec.classMap && spec.classMap[row.id];
      const effective = mapped ? C.findRow(spec.table, mapped) : row;
      let detail = spec.noEffects
        ? (row ? 'Raising ' + row[LP.rng.getTable(spec.table).labelColumn] + ' costs 1 less XP' : '')
        : rowEffects(effective);
      if (mapped) detail = 'Counts as ' + C.rowLabel(spec.table, effective) + (detail ? ' · ' + detail : '');
      return {
        label: spec.label,
        value: row ? C.rowLabel(spec.table, row) : '',
        detail: detail,
        lockedBy: slot.mode === 'forced' && species ? species.name : null
      };
    }

    if (kind === 'credits') {
      return {
        label: 'Credits (' + slot.notation + ')',
        value: slot.value === null ? '' : slot.value + ' credits',
        detail: ''
      };
    }

    const itemRow = slot.value ? C.findRow(slot.table, slot.value) : null;
    return {
      label: tableShortName(slot.table),
      value: itemRow ? C.rowLabel(slot.table, itemRow) : '',
      detail: ''
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Field row (dropdown + result + reroll)                                 */
  /* ---------------------------------------------------------------------- */

  function fieldRow(state, character, path, spec, isChild) {
    const slot = C.getSlot(character, path);
    const info = describe(character, path, spec);
    const key = pathKey(path);
    const kind = C.slotKind(path);

    const change = (action) => {
      if (action() !== false) {
        flash = key;
        commit(state);
      }
    };

    return LP.ui.rollField({
      id: 'f-' + character.id + '-' + path.join('-'),
      focusKey: key,
      label: info.label,
      mode: slot.mode,
      valueText: info.value,
      detail: info.detail,
      lockedBy: info.lockedBy ? 'Set by ' + info.lockedBy : null,
      choices: slot.mode === 'forced' ? [] : C.optionsFor(character, path),
      grouped: kind === 'species',
      selected: slot.mode === 'random' ? '' : String(slot.value),
      showReroll: character.generated && slot.mode === 'random' && slot.value !== null,
      rerollEnabled: C.canReroll(character, path),
      onReroll: () => change(() => C.reroll(character, path)),
      onSelect: (raw) => {
        if (raw === '') change(() => C.setRandom(character, path));
        else change(() => C.setFixed(character, path, kind === 'credits' ? parseInt(raw, 10) : raw));
      },
      isChild: isChild,
      flash: flash === key
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Editor                                                                 */
  /* ---------------------------------------------------------------------- */

  function summaryList(title, items, emptyText) {
    return el('div', { class: 'summary-block' },
      el('h4', { text: title }),
      items.length
        ? el('ul', { class: 'summary-list' }, items.map((text) => el('li', null, text)))
        : el('p', { class: 'muted', text: emptyText })
    );
  }

  function isLeader(state, character) {
    return !!state.campaign.crew && state.campaign.crew.leaderId === character.id;
  }

  function summary(state, character) {
    const r = C.resolve(character, { isLeader: isLeader(state, character) });
    const p = r.profile;

    const stats = [
      ['Reactions', p.reactions],
      ['Speed', p.speed + '"'],
      ['Combat Skill', signed(p.combat)],
      ['Toughness', p.toughness],
      ['Savvy', signed(p.savvy)],
      ['Luck', p.luck],
      ['XP', r.xp]
    ];

    const resources = [];
    if (r.credits) resources.push(r.credits + ' credits');
    if (r.storyPoints) resources.push(r.storyPoints + (r.storyPoints === 1 ? ' story point' : ' story points'));
    if (r.patrons) resources.push(r.patrons + (r.patrons === 1 ? ' Patron' : ' Patrons'));
    if (r.rivals) resources.push(r.rivals + (r.rivals === 1 ? ' Rival' : ' Rivals'));
    if (r.questRumors) resources.push(r.questRumors + (r.questRumors === 1 ? ' Quest Rumor' : ' Quest Rumors'));

    const items = r.items.map((i) => C.rowLabel(i.table, i.row) + ' (' + tableShortName(i.table) + ')');

    return el('section', { class: 'summary', 'aria-label': 'Result' },
      el('div', { class: 'summary-head' },
        el('h3', { text: 'Result' }),
        r.complete ? null : el('span', { class: 'muted' }, character.generated ? 'Some results are missing.' : 'Press Generate to roll every Random field.')
      ),
      el('dl', { class: 'stat-grid' },
        stats.map(([name, value]) => el('div', { class: 'stat' },
          el('dt', null, name),
          el('dd', null, String(value))
        ))
      ),
      el('div', { class: 'summary-columns' },
        summaryList('Resources', resources, 'None'),
        summaryList('Starting items', items, 'None')
      ),
      r.rules.length ? summaryList('Species rules', r.rules, '') : null,
      r.notes.length ? summaryList('Adjustments', r.notes, '') : null
    );
  }

  function editor(state, character) {
    const species = C.getSpecies(character.species.value);
    const rows = [fieldRow(state, character, ['species'], null, false)];

    for (const spec of C.fieldsFor(species)) {
      const path = ['fields', spec.key];
      rows.push(fieldRow(state, character, path, spec, false));
      const slot = C.getSlot(character, path);
      slot.credits.forEach((_, i) => rows.push(fieldRow(state, character, path.concat('credits', i), spec, true)));
      slot.items.forEach((_, i) => rows.push(fieldRow(state, character, path.concat('items', i), spec, true)));
    }

    const nameInput = el('input', {
      id: 'name-' + character.id,
      class: 'input',
      type: 'text',
      maxlength: '60',
      placeholder: 'Unnamed character',
      autocomplete: 'off',
      'data-focus': 'name'
    });
    nameInput.value = character.name;
    nameInput.addEventListener('input', () => {
      character.name = nameInput.value;
      LP.storage.touchCampaign(state.campaign);
      const selector = '[data-card-name="' + character.id + '"], [data-name-of="' + character.id + '"]';
      state.container.querySelectorAll(selector).forEach((node) => {
        node.textContent = characterName(character);
      });
    });

    return el('section', { class: 'editor', 'aria-label': 'Character editor' },
      el('div', { class: 'editor-head' },
        el('label', { class: 'field editor-name' },
          el('span', { class: 'field-label' }, 'Name'),
          nameInput
        ),
        el('button', {
          type: 'button',
          class: 'btn btn-primary',
          'data-focus': 'generate',
          onclick: () => {
            C.generate(character);
            flash = null;
            commit(state);
          }
        }, 'Generate')
      ),
      el('ul', { class: 'field-list' }, rows),
      summary(state, character)
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Crew list                                                              */
  /* ---------------------------------------------------------------------- */

  function crewCard(state, character, selected) {
    const result = C.resolve(character, { isLeader: isLeader(state, character) });
    const species = result.species;

    return el('li', { class: 'crew-card' + (selected ? ' selected' : '') },
      el('button', {
        type: 'button',
        class: 'crew-card-main',
        'aria-current': selected ? 'true' : null,
        'data-focus': 'card:' + character.id,
        onclick: () => {
          selectedByCampaign[state.campaign.id] = character.id;
          draw(state);
          // When the editor is stacked below the list, bring it into view.
          if (window.matchMedia('(max-width: 860px)').matches) {
            const editorEl = state.container.querySelector('.editor');
            if (editorEl) editorEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
          }
        }
      },
        el('span', { class: 'crew-card-name' },
          el('span', { 'data-card-name': character.id }, characterName(character)),
          isLeader(state, character) ? el('span', { class: 'leader-badge' }, 'Leader') : null
        ),
        el('span', { class: 'crew-card-species' }, species ? species.name : 'Random species'),
        character.generated ? el('span', { class: 'crew-card-stats' }, shortStats(result)) : null
      ),
      el('div', { class: 'crew-card-actions' },
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          'data-focus': 'card-generate:' + character.id,
          'aria-label': 'Generate ' + characterName(character),
          onclick: () => {
            C.generate(character);
            flash = null;
            commit(state);
          }
        }, 'Generate'),
        el('button', {
          type: 'button',
          class: 'btn btn-sm btn-ghost',
          'aria-label': 'Delete ' + characterName(character),
          onclick: () => deleteCharacter(state, character)
        }, 'Delete')
      )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  function addCharacter(state) {
    const character = C.newCharacter();
    state.campaign.characters.push(character);
    selectedByCampaign[state.campaign.id] = character.id;
    commit(state);
    const name = state.container.querySelector('[data-focus="name"]');
    if (name) name.focus();
  }

  function generateAll(state) {
    state.campaign.characters.forEach((c) => C.generate(c));
    flash = null;
    commit(state);
    LP.ui.notify('Generated ' + state.campaign.characters.length + ' characters.', 'success');
  }

  async function deleteCharacter(state, character) {
    const ok = await LP.ui.confirm({
      title: 'Delete character?',
      message: '"' + characterName(character) + '" will be removed from this campaign.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    const list = state.campaign.characters;
    const index = list.indexOf(character);
    if (index >= 0) list.splice(index, 1);
    if (selectedByCampaign[state.campaign.id] === character.id) {
      const next = list[Math.min(index, list.length - 1)];
      selectedByCampaign[state.campaign.id] = next ? next.id : null;
    }
    commit(state);
  }

  function commit(state) {
    LP.crew.sync(state.campaign);
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;

    const { container, campaign } = state;
    const characters = campaign.characters;
    clear(container);

    let selected = characters.find((c) => c.id === selectedByCampaign[campaign.id]);
    if (!selected && characters.length) {
      selected = characters[0];
      selectedByCampaign[campaign.id] = selected.id;
    }

    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, characters.length === 1 ? '1 character' : characters.length + ' characters'),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'add', onclick: () => addCharacter(state) }, '+ Add character'),
        el('button', { type: 'button', class: 'btn', 'data-focus': 'generate-all', disabled: !characters.length, onclick: () => generateAll(state) }, 'Generate all')
      )
    ));

    if (!characters.length) {
      container.appendChild(el('div', { class: 'empty-state' },
        el('h2', { text: 'No characters yet' }),
        el('p', { text: 'Add a character, choose any results you already know, and press Generate to roll the rest.' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => addCharacter(state) }, '+ Add character')
      ));
    } else {
      container.appendChild(el('div', { class: 'characters-layout' },
        el('nav', { class: 'crew-list-wrap', 'aria-label': 'Characters' },
          el('ul', { class: 'crew-list' }, characters.map((c) => crewCard(state, c, c === selected)))
        ),
        editor(state, selected)
      ));
      container.appendChild(LP.ui.crewSection(campaign, {
        flashKey: flash,
        commit: (key) => {
          flash = key;
          commit(state);
        }
      }));
    }

    flash = null;

    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus();
    }
  }

  LP.tabs.characters = function render(container, campaign) {
    // Bring stored data in line with the current rules/data.
    campaign.characters.forEach((c) => C.sync(c));
    LP.crew.ensure(campaign);
    draw({ container, campaign });
  };
})(window.LP);
