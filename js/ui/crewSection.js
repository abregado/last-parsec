(function (LP) {
  'use strict';

  const { el } = LP.dom;
  const C = LP.character;
  const crewRules = LP.crew;

  const GROUP_LABELS = {
    'military': 'Military weapon',
    'low-tech': 'Low-tech weapon',
    'gear': 'Gear',
    'gadget': 'Gadget'
  };

  function characterName(character) {
    return character.name.trim() || 'Unnamed character';
  }

  /** A character's name, kept up to date while the name field is edited. */
  function nameSpan(character) {
    return el('span', { 'data-name-of': character.id }, characterName(character));
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /**
   * Builds the Crew section.
   *   ctx.commit(flashKey)  save + redraw, highlighting the row with that key
   *   ctx.flashKey          row key to highlight in this draw
   */
  function crewSection(campaign, ctx) {
    const crew = campaign.crew;
    const totals = crewRules.summarize(campaign);

    /* -------------------------------------------------------------- */
    /* Rows                                                            */

    function row(path, label, isChild, extra) {
      const slot = crewRules.getSlot(crew, path);
      const key = 'crew.' + path.join('.');
      const dice = crewRules.isDice(path);
      let valueText = '';
      let detail = '';

      if (dice) {
        valueText = slot.value === null ? '' : slot.value + ' credits';
      } else if (slot.value) {
        const tableName = crewRules.tableFor(crew, path);
        const r = C.findRow(tableName, slot.value);
        valueText = C.rowLabel(tableName, r);
        if (path[0] === 'ship') {
          detail = 'Hull ' + r.hull + ' · Debt ' + r.debt + (r.traits && r.traits !== '-' ? ' · ' + r.traits : '');
        }
      }

      const change = (action) => {
        if (action() !== false) ctx.commit(key);
      };

      return LP.ui.rollField({
        id: 'crew-' + path.join('-'),
        focusKey: key,
        label: label,
        mode: slot.mode,
        valueText: valueText,
        detail: detail,
        choices: crewRules.optionsFor(crew, path),
        selected: slot.mode === 'random' ? '' : String(slot.value),
        showReroll: crew.generated && slot.mode === 'random' && slot.value !== null,
        rerollEnabled: crewRules.canReroll(crew, path),
        onReroll: () => change(() => crewRules.reroll(campaign, path)),
        onSelect: (raw) => {
          if (raw === '') change(() => crewRules.setRandom(campaign, path));
          else change(() => crewRules.setFixed(campaign, path, dice ? parseInt(raw, 10) : raw));
        },
        extra: extra,
        isChild: isChild,
        flash: ctx.flashKey === key
      });
    }

    function highTechToggle(index, slot) {
      const isHighTech = slot.table === crewRules.HIGH_TECH;
      const allowed = isHighTech || totals.highTechUsed < totals.savvyCount;
      const input = el('input', {
        type: 'checkbox',
        checked: isHighTech,
        disabled: !allowed,
        'data-focus': 'crew.hightech.' + index
      });
      input.addEventListener('change', () => {
        if (crewRules.setHighTech(campaign, index, input.checked)) ctx.commit('crew.equipment.' + index);
      });
      return el('label', { class: 'check' + (allowed ? '' : ' muted') }, input, ' Roll High-tech instead');
    }

    const counters = {};
    const equipmentRows = crew.equipment.map((slot, i) => {
      counters[slot.group] = (counters[slot.group] || 0) + 1;
      const many = crewRules.EQUIPMENT_LAYOUT.filter((l) => l.group === slot.group).length > 1;
      let label = GROUP_LABELS[slot.group];
      if (slot.group === 'military' && slot.table === crewRules.HIGH_TECH) label = 'High-tech weapon';
      if (many) label += ' ' + counters[slot.group];
      return row(['equipment', i], label, false, slot.group === 'military' ? highTechToggle(i, slot) : null);
    });

    /* -------------------------------------------------------------- */
    /* Leader                                                          */

    const leaderSelect = el('select', { id: 'crew-leader', class: 'input select', 'data-focus': 'crew.leader' },
      el('option', { value: '' }, 'No leader yet'),
      campaign.characters.map((c) => el('option', { value: c.id, selected: c.id === crew.leaderId, 'data-name-of': c.id }, characterName(c)))
    );
    leaderSelect.value = crew.leaderId || '';
    leaderSelect.addEventListener('change', () => {
      crewRules.setLeader(campaign, leaderSelect.value || null);
      ctx.commit(null);
    });

    const leader = campaign.characters.find((c) => c.id === crew.leaderId);
    const leaderSpecies = leader ? C.getSpecies(leader.species.value) : null;
    let leaderNote = 'The Leader gets +1 Luck and never leaves the crew through random events.';
    if (leaderSpecies && leaderSpecies.bot) leaderNote = 'Bots can lead, but get no Luck for it.';
    else if (leaderSpecies && leaderSpecies.noLuck) leaderNote = leaderSpecies.name + ' can never have Luck, so gets none for leading.';

    /* -------------------------------------------------------------- */
    /* Totals                                                          */

    const statTiles = [
      ['Credits', totals.credits.total, totals.credits.perMember + ' crew + ' + totals.credits.rolled + ' rolled'],
      ['Story points', totals.storyPoints, 'from characters'],
      ['Patrons', totals.patrons, ''],
      ['Rivals', totals.rivals, ''],
      ['Quest Rumors', totals.questRumors, '']
    ];

    const ship = totals.ship;

    return el('section', { class: 'crew panel', 'aria-labelledby': 'crew-heading' },
      el('div', { class: 'crew-head' },
        el('div', null,
          el('h2', { id: 'crew-heading', text: 'Crew' }),
          el('p', { class: 'muted', text: 'Shared starting resources, equipment, ship and flavour (pp.24–32).' })
        ),
        el('button', {
          type: 'button',
          class: 'btn btn-primary',
          'data-focus': 'crew.generate',
          onclick: () => {
            crewRules.generate(campaign);
            ctx.commit(null);
          }
        }, 'Generate crew')
      ),

      el('div', { class: 'crew-block' },
        el('h3', { text: 'Leader' }),
        el('div', { class: 'leader-row' },
          el('label', { class: 'visually-hidden', for: 'crew-leader' }, 'Leader'),
          leaderSelect,
          el('span', { class: 'field-detail' }, leaderNote)
        )
      ),

      el('div', { class: 'crew-block' },
        el('h3', { text: 'Totals' }),
        el('dl', { class: 'stat-grid totals-grid' },
          statTiles.map(([name, value, hint]) => el('div', { class: 'stat' },
            el('dt', null, name),
            el('dd', null, String(value)),
            hint ? el('span', { class: 'stat-hint' }, hint) : null
          ))
        ),
        el('div', { class: 'summary-columns' },
          el('div', { class: 'summary-block' },
            el('h4', { text: 'Starting XP' }),
            totals.xp.length
              ? el('ul', { class: 'summary-list' }, totals.xp.map((x) => el('li', null, nameSpan(x.character), ': ' + x.xp + ' XP')))
              : el('p', { class: 'muted', text: 'No characters' })
          ),
          el('div', { class: 'summary-block' },
            el('h4', { text: 'Items from characters' }),
            totals.characterItems.length
              ? el('ul', { class: 'summary-list' }, totals.characterItems.map((i) => el('li', null,
                C.rowLabel(i.table, i.row) + ' (' + i.table.replace(/ Table$/, '') + ') — ', nameSpan(i.character))))
              : el('p', { class: 'muted', text: 'None rolled yet' })
          )
        )
      ),

      el('div', { class: 'crew-block' },
        el('h3', { text: 'Starting equipment' }),
        el('p', { class: 'field-detail' },
          plural(totals.savvyCount, 'character has', 'characters have') + ' a Savvy increase, so up to ' +
          plural(Math.min(3, totals.savvyCount), 'Military roll', 'Military rolls') + ' can use the High-tech table instead.'),
        totals.warnings.map((w) => el('p', { class: 'warning', role: 'note' }, w)),
        el('ul', { class: 'field-list' }, equipmentRows)
      ),

      el('div', { class: 'crew-block' },
        el('h3', { text: 'Ship' }),
        el('ul', { class: 'field-list' },
          row(['ship'], 'Ship', false, null),
          crew.ship.debt ? row(['ship', 'debt'], 'Debt (' + crew.ship.debt.notation + ')', true, null) : null
        ),
        ship && ship.traits.length
          ? el('ul', { class: 'summary-list trait-list' }, ship.traits.map((t) => el('li', null, el('strong', null, t.name + ': '), t.text)))
          : null
      ),

      el('div', { class: 'crew-block' },
        el('h3', { text: 'Flavour' }),
        el('ul', { class: 'field-list' },
          row(['metThrough'], 'We met through', false, null),
          row(['characterizedAs'], 'We are best characterized as', false, null)
        )
      )
    );
  }

  LP.ui.crewSection = crewSection;
})(window.LP);
