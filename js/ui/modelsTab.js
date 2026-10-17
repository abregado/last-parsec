(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const M = LP.models;

  // Collapsed tables (per page visit only).
  const collapsed = new Set();

  function percent(chance) {
    if (chance === null) return '—';
    const value = chance * 100;
    return (value >= 10 || value === 0 ? value.toFixed(0) : value.toFixed(1)) + '%';
  }

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function profileLine(row) {
    const parts = [
      ['Numbers', row.numbers],
      ['Panic', row.panic],
      ['Speed', row.speed],
      ['CS', row.combat_skill],
      ['Toughness', row.tough_ness],
      ['AI', row.ai],
      ['Weapons', row.weapons]
    ].filter(([, value]) => value !== undefined && value !== '');
    return parts.map(([name, value]) => name + ' ' + value).join(' · ');
  }

  function tableSection(state, tableName) {
    const { campaign } = state;
    const o = M.odds(campaign, tableName);
    const total = o.rows.length;
    const open = !collapsed.has(tableName);
    const bodyId = 'models-' + slug(tableName);

    const change = (action) => {
      action();
      commit(state);
    };

    const rows = o.rows.map(({ row, enabled, chance }) => {
      const checkboxId = 'model-' + slug(tableName) + '-' + row.id;
      const checkbox = el('input', {
        type: 'checkbox',
        id: checkboxId,
        checked: enabled,
        'data-focus': 'check:' + tableName + ':' + row.id
      });
      checkbox.addEventListener('change', () => change(() => M.setEnabled(campaign, tableName, row.id, checkbox.checked)));

      const invading = M.isInvasion(campaign, tableName, row.id);
      const invasionBox = el('input', {
        type: 'checkbox',
        checked: invading,
        'aria-label': 'Use ' + row.enemy + ' for invasion forces',
        title: M.isInvasionThreat(row) ? 'Invasion Threat in the book' : null,
        'data-focus': 'invasion:' + tableName + ':' + row.id
      });
      invasionBox.addEventListener('change', () => change(() => M.setInvasion(campaign, tableName, row.id, invasionBox.checked)));

      return el('tr', { class: enabled ? '' : 'is-off' },
        el('td', { class: 'col-check' }, checkbox),
        el('td', { class: 'col-name' },
          el('label', { for: checkboxId, class: 'enemy-name' }, row.enemy),
          el('details', { class: 'enemy-profile' },
            el('summary', null, 'Profile'),
            el('p', { class: 'field-detail' }, profileLine(row)),
            row.notes ? el('p', { class: 'field-detail' }, row.notes) : null
          )
        ),
        el('td', { class: 'col-num' }, row.ranges.weight),
        el('td', { class: 'col-num col-weight' }, String(row.weight)),
        el('td', { class: 'col-num col-chance' }, percent(chance)),
        el('td', { class: 'col-check col-invasion' + (invading && !enabled ? ' is-orphan' : '') }, invasionBox)
      );
    });
    const invasionCount = o.rows.filter(({ row }) => M.isInvasion(campaign, tableName, row.id)).length;

    return el('section', { class: 'panel models-table', 'aria-labelledby': bodyId + '-title' },
      el('div', { class: 'models-head' },
        el('button', {
          type: 'button',
          class: 'models-toggle',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': bodyId,
          'data-focus': 'toggle:' + tableName,
          onclick: () => {
            if (open) collapsed.add(tableName);
            else collapsed.delete(tableName);
            draw(state);
          }
        },
          el('span', { class: 'models-caret', 'aria-hidden': 'true' }, open ? '▾' : '▸'),
          el('h3', { id: bodyId + '-title' }, tableName),
          el('span', { class: 'models-count' + (o.enabledCount ? '' : ' none') }, o.enabledCount + ' of ' + total + ' enabled'),
          invasionCount ? el('span', { class: 'models-count' }, '· ' + invasionCount + ' can invade') : null
        ),
        el('div', { class: 'toolbar' },
          el('button', {
            type: 'button',
            class: 'btn btn-sm',
            disabled: o.enabledCount === total,
            'data-focus': 'all:' + tableName,
            onclick: () => change(() => M.setAll(campaign, tableName, true))
          }, 'All'),
          el('button', {
            type: 'button',
            class: 'btn btn-sm',
            disabled: o.enabledCount === 0,
            'data-focus': 'none:' + tableName,
            onclick: () => change(() => M.setAll(campaign, tableName, false))
          }, 'None')
        )
      ),
      o.enabledCount === 0
        ? el('p', { class: 'warning', role: 'note' }, 'No entries enabled: rolls on ' + tableName + ' are impossible, so this category will be skipped when generating battles.')
        : null,
      open
        ? el('div', { id: bodyId, class: 'models-body' },
          el('table', { class: 'models-grid' },
            el('thead', null, el('tr', null,
              el('th', { class: 'col-check' }, el('span', { class: 'visually-hidden' }, 'Enabled')),
              el('th', null, 'Enemy'),
              el('th', { class: 'col-num' }, 'D100'),
              el('th', { class: 'col-num col-weight' }, 'Weight'),
              el('th', { class: 'col-num col-chance' }, 'Chance'),
              el('th', { class: 'col-check col-invasion', title: 'Can form an invasion force' }, 'Invasion')
            )),
            el('tbody', null, rows)
          )
        )
        : null
    );
  }

  /** Summary of which enemy types can form an invasion force. */
  function invasionPanel(state) {
    const { campaign } = state;
    const candidates = M.invasionCandidates(campaign);
    const orphans = [];
    for (const tableName of M.ENEMY_TABLES) {
      for (const id of M.invasionIds(campaign, tableName)) {
        if (!M.isEnabled(campaign, tableName, id)) {
          const row = LP.rng.getTable(tableName).rows.find((r) => r.id === id);
          if (row) orphans.push(row.enemy);
        }
      }
    }
    const customised = Object.keys(campaign.models.invasion || {}).length > 0;

    return el('section', { class: 'panel invasion-panel', 'aria-labelledby': 'invasion-title' },
      el('div', { class: 'models-head' },
        el('div', null,
          el('h3', { id: 'invasion-title' }, 'Invasion forces'),
          el('p', { class: 'field-detail' }, 'Tick Invasion on any entry that can invade. Invasion battles roll among entries that are ticked for invasions and enabled.')
        ),
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          disabled: !customised,
          'data-focus': 'invasion-reset',
          onclick: () => {
            M.resetInvasion(campaign);
            commit(state);
          }
        }, 'Reset to book defaults')
      ),
      candidates.length
        ? el('p', null, el('strong', null, candidates.length + (candidates.length === 1 ? ' type: ' : ' types: ')), candidates.map((c) => c.row.enemy).join(', '))
        : el('p', { class: 'warning', role: 'note' }, 'No enemy types can invade: tick Invasion on at least one enabled entry, or Invasion battles can’t pick an enemy.'),
      orphans.length
        ? el('p', { class: 'field-detail' }, 'Ticked for invasions but switched off (no models), so never rolled: ' + orphans.join(', ') + '.')
        : null
    );
  }

  function commit(state) {
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;
    // Keep open "Profile" panels open across redraws.
    const openProfiles = new Set([...state.container.querySelectorAll('details.enemy-profile[open]')]
      .map((d) => d.closest('tr').querySelector('input').id));

    clear(state.container);
    state.container.appendChild(el('p', { class: 'muted models-intro' },
      'Untick enemies you don’t have models for. Battle rolls only pick ticked entries, and the remaining entries become more likely. Weights are as printed in the book.'));
    state.container.appendChild(invasionPanel(state));
    for (const name of M.ENEMY_TABLES) state.container.appendChild(tableSection(state, name));

    for (const id of openProfiles) {
      const input = document.getElementById(id);
      if (input) input.closest('tr').querySelector('details.enemy-profile').open = true;
    }
    if (focusKey) {
      const target = state.container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus();
    }
  }

  LP.tabs.models = function render(container, campaign) {
    draw({ container, campaign });
  };
})(window.LP);
