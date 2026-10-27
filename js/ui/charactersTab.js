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
        LP.names.assign(state.campaign, character, false);
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
    if (r.rumors) resources.push(r.rumors + (r.rumors === 1 ? ' Rumor' : ' Rumors'));

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
      character.nameAuto = false;
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
          el('span', { class: 'name-row' },
            nameInput,
            el('button', {
              type: 'button',
              class: 'btn btn-sm',
              'data-focus': 'name-reroll',
              title: 'Roll a random name for this species',
              'aria-label': 'Roll a random name',
              disabled: !character.species.value,
              onclick: () => {
                LP.names.reroll(state.campaign, character);
                commit(state);
              }
            }, '🎲')
          )
        ),
        el('button', {
          type: 'button',
          class: 'btn btn-primary',
          'data-focus': 'generate',
          onclick: () => {
            generate(state, character);
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
            generate(state, character);
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

  /** Generate a character and give it a rolled name unless the player typed one. */
  function generate(state, character) {
    C.generate(character);
    LP.names.assign(state.campaign, character, true);
  }

  function generateAll(state) {
    state.campaign.characters.forEach((c) => generate(state, c));
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

  async function finalize(state) {
    const campaign = state.campaign;
    const problem = LP.roster.finalizeProblem(campaign);
    if (problem) {
      LP.ui.notify(problem, 'error');
      return;
    }
    const first = !LP.roster.hasCrew(campaign);
    const n = campaign.characters.length;
    const who = n === 1 ? '1 character' : n + ' characters';
    const ok = await LP.ui.confirm({
      title: first ? 'Finalize the crew?' : 'Add the recruits to the crew?',
      message: first
        ? who + ', their starting items, the crew’s starting equipment and the ship move to the Crew tab, and this tab is emptied. Turns and battles then use the Crew tab.'
        : who + ' join the crew on the Crew tab (turn ' + LP.roster.turnNumber(campaign) + '), with any items they rolled. This tab is emptied.',
      confirmLabel: first ? 'Finalize crew' : 'Add to crew'
    });
    if (!ok) return;
    const result = LP.roster.finalize(campaign);
    if (result.error) {
      LP.ui.notify(result.error, 'error');
      return;
    }
    selectedByCampaign[campaign.id] = null;
    LP.storage.touchCampaign(campaign);
    LP.ui.notify((result.added.length === 1 ? '1 character' : result.added.length + ' characters') + ' added to the crew.', 'success');
    LP.router.go(LP.router.campaignPath(campaign.id, 'crew'));
  }

  function commit(state) {
    LP.crew.sync(state.campaign);
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  /** The banner while an event is waiting for a recruit: accept, reroll or decline. */
  function recruitBanner(state, recruit) {
    const campaign = state.campaign;
    const answer = (accepted) => {
      const reply = LP.recruit.finish(campaign, accepted);
      if (reply) {
        const result = LP.turn.choose(campaign, reply);
        if (result.error) LP.ui.notify(result.error, 'error');
      }
      LP.storage.touchCampaign(campaign);
      LP.router.go(LP.router.campaignPath(campaign.id, 'turn'));
    };
    return el('section', { class: 'panel recruit-banner' },
      el('h3', null, 'A recruit for the event'),
      el('p', null, 'The event offers a new character: ' + LP.recruit.describe(recruit.variant) + '. Name them if you like, reroll if you want different results, then accept or decline.'),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'recruit-accept', onclick: () => answer(true) }, 'Accept'),
        el('button', { type: 'button', class: 'btn', 'data-focus': 'recruit-reroll', onclick: () => { generate(state, recruit.character); commit(state); } }, 'Reroll'),
        el('button', { type: 'button', class: 'btn btn-danger', 'data-focus': 'recruit-decline', onclick: () => answer(false) }, 'Decline')
      )
    );
  }

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;

    const { container, campaign } = state;
    const recruit = LP.recruit.current(campaign);
    const characters = recruit ? [recruit.character] : campaign.characters;
    const recruiting = LP.roster.hasCrew(campaign);
    clear(container);

    let selected = characters.find((c) => c.id === selectedByCampaign[campaign.id]);
    if (!selected && characters.length) {
      selected = characters[0];
      selectedByCampaign[campaign.id] = selected.id;
    }

    container.appendChild(recruit ? recruitBanner(state, recruit) : el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, characters.length === 1 ? '1 character' : characters.length + ' characters'),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'add', onclick: () => addCharacter(state) }, '+ Add character'),
        el('button', { type: 'button', class: 'btn', 'data-focus': 'generate-all', disabled: !characters.length, onclick: () => generateAll(state) }, 'Generate all'),
        el('button', {
          type: 'button', class: 'btn btn-primary', 'data-focus': 'finalize', disabled: !characters.length,
          title: LP.roster.finalizeProblem(campaign) || null,
          onclick: () => finalize(state)
        }, recruiting ? 'Add to crew' : 'Finalize crew')
      )
    ));

    if (recruiting && !recruit) {
      container.appendChild(el('p', { class: 'muted recruit-note' },
        'Your crew is on the ', el('a', { href: LP.router.campaignPath(campaign.id, 'crew') }, 'Crew tab'),
        '. Characters made here join it as recruits when you press Add to crew.'));
    }

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
      if (!recruiting) container.appendChild(LP.ui.crewSection(campaign, {
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
