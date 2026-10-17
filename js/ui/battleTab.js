(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const B = LP.battle;
  const rng = LP.rng;

  let flash = null;

  function signed(n) {
    return n >= 0 ? '+' + n : '−' + Math.abs(n);
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function ctxOf(campaign) {
    return { settings: campaign.settings, campaign: campaign };
  }

  /** The mission chosen in the current Campaign Turn (stage 2.6), if any. */
  function turnMission(campaign) {
    if (!LP.turn || !campaign.turn) return null;
    const facts = LP.turn.context(campaign, LP.turn.ensure(campaign).records).facts;
    return facts.battleType ? B.FROM_TURN[facts.battleType] || null : null;
  }

  /** The named Rival chosen in the current Campaign Turn, if any. */
  function turnRival(campaign) {
    if (!LP.turn || !campaign.turn) return null;
    return LP.turn.context(campaign, LP.turn.ensure(campaign).records).facts.rivalId || null;
  }

  /** Use the turn's choice: mission and named Rival. */
  function useTurn(battle, ctx, campaign) {
    const mission = turnMission(campaign);
    if (!mission) return;
    battle.options.rivalId = turnRival(campaign);
    B.setMission(battle, ctx, mission);
  }

  /* ---------------------------------------------------------------------- */
  /* Field rows                                                             */
  /* ---------------------------------------------------------------------- */

  function describe(state, spec, slot, r) {
    const value = slot ? slot.value : null;
    if (spec.kind === 'dice') {
      const option = spec.options.find((o) => o.value === value);
      let detail = '';
      if (spec.key === 'numbers' && slot.dice) {
        const rerolled = slot.first && slot.first.some((d, i) => d !== slot.dice[i]);
        detail = 'Dice: ' + slot.dice.join(', ') + (rerolled ? ' (first rolled ' + slot.first.join(', ') + ')' : '') + '. Total with modifiers: ' + r.force.total + '.';
      } else if (spec.key === 'uniqueCheck' && value !== null) {
        if (state.ctx.settings.difficulty === 'insanity') {
          detail = value >= 11 ? 'Two Unique Individuals!' : 'One Unique Individual (always on Insanity).';
        } else {
          const mods = r.uniqueMods.map((m) => signed(m.value) + ' ' + m.label).join(' ');
          detail = (mods ? value + ' ' + mods + ' = ' + r.uniqueTotal + ': ' : '') + (r.uniques.length ? 'a Unique Individual is present.' : 'none this time.');
        }
      } else if (spec.key === 'bounty' && value !== null) {
        detail = value <= 3 ? plural(value, 'bonus credit', 'bonus credits') + ' if you Hold the Field.' : 'No bounty.';
      }
      return { value: option ? option.label : '', detail };
    }
    const row = value ? spec.rows.find((x) => x.id === value) : null;
    let detail = '';
    if (spec.key === 'deployment' && r.deployment) detail = r.deployment.text;
    if (spec.key === 'sight' && r.sight) detail = r.sight.text;
    if (spec.key === 'objective' && r.objective) detail = r.objective.text;
    if (spec.key === 'rivalAttack' && r.rivalAttack) detail = r.rivalAttack.text;
    return { value: row ? row.label : '', detail };
  }

  function fieldRow(state, spec, r) {
    const { battle, ctx } = state;
    if (spec.kind === 'locked') {
      return LP.ui.rollField({
        id: 'battle-' + spec.key, focusKey: 'battle.' + spec.key, label: spec.label,
        mode: 'forced', valueText: spec.key === 'objective' ? r.objective.title : '', detail: spec.text,
        choices: [], selected: '', showReroll: false
      });
    }
    const slot = battle.slots[spec.key];
    const info = describe(state, spec, slot, r);
    const key = 'battle.' + spec.key;
    const change = (action) => {
      if (action() !== false) {
        flash = key;
        commit(state);
      }
    };
    const choices = spec.kind === 'dice'
      ? spec.options
      : spec.rows.map((row) => ({ value: row.id, label: row.label, range: row.range }));
    return LP.ui.rollField({
      id: 'battle-' + spec.key,
      focusKey: key,
      label: spec.label,
      mode: slot.mode,
      valueText: info.value,
      detail: info.detail,
      lockedBy: slot.mode === 'forced' && spec.lockedBy ? 'Set by: ' + spec.lockedBy : null,
      choices: choices,
      selected: slot.mode === 'random' ? '' : String(slot.value),
      showReroll: battle.generated && slot.mode === 'random' && slot.value !== null,
      rerollEnabled: B.canReroll(battle, ctx, spec.key),
      onReroll: () => change(() => B.reroll(battle, ctx, spec.key)),
      onSelect: (raw) => {
        if (raw === '') change(() => B.setRandom(battle, ctx, spec.key));
        else change(() => B.setFixed(battle, ctx, spec.key, spec.kind === 'dice' ? parseInt(raw, 10) : raw));
      },
      flash: flash === key
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Panels                                                                 */
  /* ---------------------------------------------------------------------- */

  function checkbox(label, checked, onChange, focus) {
    const input = el('input', { type: 'checkbox', checked: checked, 'data-focus': focus });
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { class: 'check' }, input, ' ' + label);
  }

  function missionPanel(state) {
    const { battle, ctx, campaign } = state;
    const select = el('select', { id: 'battle-mission', class: 'input select', 'data-focus': 'battle.mission' },
      B.MISSIONS.map((m) => el('option', { value: m.id }, m.label))
    );
    select.value = battle.mission;
    select.addEventListener('change', () => {
      B.setMission(battle, ctx, select.value);
      commit(state);
    });

    const crew = el('input', { id: 'battle-crew', class: 'input input-number', type: 'number', min: '1', max: '12', 'data-focus': 'battle.crew' });
    crew.value = String(battle.options.crewFielded);
    crew.addEventListener('change', () => {
      const n = parseInt(crew.value, 10);
      if (!isNaN(n) && n > 0) {
        B.setOption(battle, ctx, 'crewFielded', n);
        commit(state);
      }
    });

    const fromTurn = turnMission(campaign);
    const planet = B.planetOf(ctx);
    const rival = B.namedRival(battle, ctx);
    let rivalPicker = null;
    if (planet && (battle.mission === 'rival' || battle.mission === 'rival-attack') && planet.rivals.length) {
      rivalPicker = el('select', { id: 'battle-rival', class: 'input select', 'data-focus': 'battle.rival' },
        el('option', { value: '' }, 'Unknown Rival (roll the enemy)'),
        planet.rivals.map((r) => el('option', { value: r.id }, r.name)));
      rivalPicker.value = battle.options.rivalId || '';
      rivalPicker.addEventListener('change', () => {
        B.setOption(battle, ctx, 'rivalId', rivalPicker.value || null);
        commit(state);
      });
    }
    const option = (key, label) => checkbox(label, !!battle.options[key], (v) => {
      B.setOption(battle, ctx, key, v);
      commit(state);
    }, 'battle.opt.' + key);

    return el('section', { class: 'panel battle-mission' },
      planet ? el('p', { class: 'field-detail' }, 'On ' + planet.name + (planet.worldTraits.length ? ' \u00b7 traits: ' + planet.worldTraits.map((id) => rng.getTable('World Traits Table').rows.find((r) => r.id === id).trait).join(', ') : '')) : null,
      el('div', { class: 'battle-mission-row' },
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Mission'), select),
        rivalPicker ? el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Rival'), rivalPicker) : null,
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Crew in the field'), crew)
      ),
      rival && !rival.enemy ? el('p', { class: 'field-detail' }, rival.name + ' has no enemy type yet: roll it, then set it on the Planets tab.') : null,
      fromTurn && fromTurn !== battle.mission
        ? el('p', { class: 'turn-link' },
          'This turn’s choice: ' + B.missionLabel(fromTurn) + '. ',
          el('button', {
            type: 'button', class: 'btn btn-sm',
            onclick: () => {
              useTurn(battle, ctx, campaign);
              commit(state);
            }
          }, 'Use it'))
        : (fromTurn ? el('p', { class: 'field-detail' }, 'From this turn’s choice.') : null),
      battle.mission === 'patron'
        ? el('div', { class: 'battle-options' },
          el('span', { class: 'field-detail' }, 'Job hazards and benefits that change enemy numbers:'),
          option('dangerousJob', 'Dangerous Job (+1)'),
          option('securityTeam', 'Security Team (−1)'),
          option('lowPriority', 'Low Priority (−1)'))
        : null,
      el('div', { class: 'battle-options' }, option('varied', 'Varied Armaments (optional rule, p.104)'))
    );
  }

  function statLine(items) {
    return el('dl', { class: 'stat-grid enemy-stats' },
      items.map(([name, value]) => el('div', { class: 'stat' }, el('dt', null, name), el('dd', null, String(value))))
    );
  }

  function enemyCard(state, r) {
    const e = r.enemy;
    const f = r.force;
    if (!r.complete) {
      return el('section', { class: 'panel enemy-card' },
        el('h3', null, 'Enemy'),
        el('p', { class: 'muted' }, state.battle.generated ? 'Choose or roll the enemy.' : 'Press Generate to roll the battle.'));
    }
    const w = r.weapons;
    const parts = [];
    const regularCount = f.regulars;
    if (state.battle.options.varied && w.regular2) {
      const a = Math.ceil(regularCount / 2);
      if (a) parts.push(a + ' × ' + w.regular);
      if (regularCount - a) parts.push((regularCount - a) + ' × ' + w.regular2);
    } else if (regularCount) {
      parts.push(regularCount + ' × ' + (w.regular || 'weapon not rolled'));
    }
    if (f.specialists) parts.push(plural(f.specialists, 'Specialist', 'Specialists') + ' × ' + (w.specialist || 'weapon not rolled'));
    if (f.lieutenant) parts.push('1 ' + (e.beast ? 'pack leader' : 'Lieutenant') + ': ' + (e.beast ? w.regular : w.lieutenant) + ', CS ' + signed(e.combat + 1));

    const breakdown = 'Base ' + f.base + f.modifiers.map((m) => ' ' + signed(m.value) + ' ' + m.label).join('') + ' = ' + f.total;

    return el('section', { class: 'panel enemy-card' },
      el('div', { class: 'enemy-head' },
        el('h3', null, f.total + ' × ' + e.name),
        el('span', { class: 'badge' }, e.table)
      ),
      el('p', { class: 'field-detail' }, breakdown),
      statLine([
        ['Panic', e.panic],
        ['Speed', e.speed],
        ['Combat', signed(e.combat)],
        ['Toughness', e.toughness],
        ['AI', e.aiName],
        ['Save', e.save || '—']
      ]),
      el('div', { class: 'summary-block' }, el('h4', null, 'Force'), el('ul', { class: 'summary-list' }, parts.map((p) => el('li', null, p)))),
      w.notes.length ? el('p', { class: 'field-detail' }, w.notes.join(' ')) : null,
      e.notes ? el('div', { class: 'summary-block' }, el('h4', null, 'Special rules'), el('p', { class: 'line-text' }, e.notes)) : null,
      el('div', { class: 'summary-block' }, el('h4', null, e.table + ' rules'), el('ul', { class: 'summary-list' }, r.categoryRules.map((t) => el('li', null, t)))),
      r.uniques.map((u) => el('div', { class: 'unique-card' },
        el('h4', null, 'Unique Individual: ' + u.name),
        statLine([['Speed', u.speed], ['Combat', signed(u.combat)], ['Toughness', u.toughness], ['AI', u.aiName], ['Luck', u.luck], ['Save', u.save || '—']]),
        el('p', { class: 'line-text' }, 'Weapons: ' + u.weapons + '. ' + u.notes),
        el('p', { class: 'field-detail' }, 'In addition to the numbers above. Fearless: not affected by Morale.' + (u.guardian ? ' Guardian AI: attach them to the Lieutenant (or a random non-Specialist).' : ''))
      )),
      !r.uniques.length && r.uniqueReason ? el('p', { class: 'field-detail' }, r.uniqueReason) : null
    );
  }

  function setupPanel(state, r) {
    if (!r.complete) return null;
    const items = [];
    if (r.edge) items.push(['Battlefield edges', 'You enter from the ' + r.edge.mine + ' edge; the enemy from the ' + r.edge.theirs + '.']);
    items.push(['Enemy deployment (' + r.enemy.aiName + ')', r.deploymentPattern + ' No figures within 18" of the other side at the start.']);
    if (r.sightPlacement) items.push(['Notable sight', r.sightPlacement + '. Grab it by moving into contact and giving up other actions that round.']);
    items.push(['Terrain (p.109)', '2×2 ft: 2 large, 4 small, 2 linear · 2.5×2.5 ft: 2 large, 5 small, 4 linear · 3×3 ft: 3 large, 6 small, 3 linear. Put a feature at the centre.']);
    return el('section', { class: 'panel battle-setup' },
      el('h3', null, 'Setting up'),
      el('dl', { class: 'setup-list' }, items.map(([k, v]) => el('div', null, el('dt', null, k), el('dd', null, v))))
    );
  }

  function seizePanel(state, r) {
    if (!r.complete) return null;
    const { battle, ctx } = state;
    const s = battle.seize;
    const mods = B.seizeModifiers(battle, ctx);

    const savvy = el('input', { id: 'seize-savvy', class: 'input input-number', type: 'number', min: '0', max: '5', 'data-focus': 'seize.savvy' });
    savvy.value = String(s.savvy || 0);
    savvy.addEventListener('change', () => {
      const n = parseInt(savvy.value, 10);
      s.savvy = isNaN(n) ? 0 : Math.max(0, Math.min(5, n));
      s.result = null;
      commit(state);
    });
    const autoOut = (r.force.total + r.uniques.length) > (battle.options.crewFielded || ctx.settings.crewSize);
    const outnumbered = s.outnumbered !== null ? s.outnumbered : autoOut;
    const set = (key) => (v) => {
      s[key] = v;
      s.result = null;
      commit(state);
    };

    const res = s.result;
    return el('section', { class: 'panel battle-seize' },
      el('h3', null, 'Seize the Initiative (p.112)'),
      mods.cannot
        ? el('p', { class: 'warning' }, mods.cannot)
        : [
          el('div', { class: 'battle-options' },
            el('label', { class: 'field inline-field' }, el('span', { class: 'field-label' }, 'Highest Savvy in the crew'), savvy),
            checkbox('Outnumbered' + (s.outnumbered === null ? ' (worked out)' : ''), outnumbered, set('outnumbered'), 'seize.out'),
            checkbox('Feral in the crew (ignore enemy penalties)', !!s.feral, set('feral'), 'seize.feral'),
            checkbox('Motion tracker or Scanner bot (+1)', !!s.gadget, set('gadget'), 'seize.gadget')
          ),
          el('p', { class: 'field-detail' }, mods.unmodified
            ? 'This enemy makes the roll unmodified (only your Savvy counts).'
            : 'Modifiers: ' + mods.modifiers.map((m) => signed(m.value) + ' ' + m.label).join(', ')),
          el('div', { class: 'toolbar' },
            el('button', {
              type: 'button', class: 'btn btn-primary', 'data-focus': 'seize.roll',
              onclick: () => {
                B.rollSeize(battle, ctx);
                commit(state);
              }
            }, res ? 'Roll again' : 'Roll 2D6')
          ),
          res
            ? el('p', { class: 'seize-result ' + (res.success ? 'pass' : 'fail') },
              el('span', { class: 'dice' }, '2D6: ' + res.dice.join(' + ') + res.modifiers.map((m) => ' ' + signed(m.value)).join('') + ' = ' + res.total),
              ' ',
              res.success
                ? 'Seized! Before round 1, each crew member may Move or fire (shots only Hit on a natural 6).'
                : 'Not this time (needs 10+).')
            : null
        ]
    );
  }

  function eventsPanel(state, r) {
    if (!r.complete) return null;
    const { battle } = state;
    const table = rng.getTable('Battle Events Table');
    const forRound = (round) => {
      const ev = battle.events.find((x) => x.round === round);
      const row = ev ? table.rows.find((x) => x.id === ev.rowId) : null;
      return el('div', { class: 'event-row' },
        el('button', {
          type: 'button', class: 'btn btn-sm', 'data-focus': 'event.' + round,
          onclick: () => {
            B.rollEvent(battle, round);
            commit(state);
          }
        }, (row ? 'Reroll' : 'Roll') + ': end of round ' + round),
        row
          ? el('div', { class: 'event-result' },
            el('span', { class: 'dice' }, 'D100: ' + ev.natural), ' ', el('strong', null, row.title),
            el('p', { class: 'line-text' }, row.effect))
          : el('span', { class: 'muted' }, 'Not rolled yet')
      );
    };
    return el('section', { class: 'panel battle-events' },
      el('h3', null, 'Battle Events (optional, p.116)'),
      forRound(2),
      forRound(4),
      el('p', { class: 'field-detail' }, 'If the two events contradict each other, discard the second.')
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  function commit(state) {
    state.campaign.battle = state.battle;
    LP.storage.touchCampaign(state.campaign);
    draw(state);
  }

  function draw(state) {
    const active = document.activeElement;
    const focusKey = active && state.container.contains(active) && active.dataset ? active.dataset.focus : null;
    const { container, battle, ctx } = state;
    const r = B.resolve(battle, ctx);
    clear(container);

    const awaitingResult = LP.turn && state.campaign.turn && (LP.turn.walk(state.campaign).current || {}).id === 'battle-result';
    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, battle.generated ? 'Battle generated ' + LP.dom.formatDate(battle.createdAt) : 'No battle generated yet.'),
      el('div', { class: 'toolbar' },
        awaitingResult && battle.generated
          ? el('a', { class: 'btn', href: LP.router.campaignPath(state.campaign.id, 'turn') }, 'Record the result →')
          : null,
        el('button', {
          type: 'button', class: 'btn btn-primary', 'data-focus': 'battle.generate',
          onclick: () => {
            B.generate(battle, ctx);
            flash = null;
            commit(state);
          }
        }, battle.generated ? 'Generate new battle' : 'Generate battle')
      )
    ));

    container.appendChild(missionPanel(state));
    container.appendChild(el('section', { class: 'panel battle-fields' },
      el('ul', { class: 'field-list' }, B.fields(battle, ctx).map((spec) => fieldRow(state, spec, r)))
    ));
    container.appendChild(enemyCard(state, r));
    const setup = setupPanel(state, r);
    if (setup) container.appendChild(setup);
    const seize = seizePanel(state, r);
    if (seize) container.appendChild(seize);
    const events = eventsPanel(state, r);
    if (events) container.appendChild(events);

    flash = null;
    if (focusKey) {
      const target = container.querySelector('[data-focus="' + CSS.escape(focusKey) + '"]');
      if (target && !target.disabled) target.focus();
    }
  }

  LP.tabs.battle = function render(container, campaign) {
    const ctx = ctxOf(campaign);
    let battle = B.normalize(campaign.battle, ctx);
    if (!battle) {
      battle = B.newBattle(ctx, 'opportunity');
      useTurn(battle, ctx, campaign);
    } else if (!battle.generated) {
      useTurn(battle, ctx, campaign);
    }
    campaign.battle = battle;
    draw({ container, campaign, battle, ctx });
  };
})(window.LP);
