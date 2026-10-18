(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const T = LP.turn;

  const STEP_HEADINGS = {
    start: 'Start',
    travel: 'Step 1 · Travel',
    world: 'Step 2 · World',
    post: 'Step 4 · Post-Battle'
  };

  function stageHeader(def, extra) {
    return el('div', { class: 'stage-head' },
      el('span', { class: 'stage-number' }, def.number),
      el('h3', { class: 'stage-title' }, def.title),
      el('span', { class: 'stage-page' }, 'p.' + def.page),
      extra || null
    );
  }

  // Result cards showing their full working out (page visit only).
  const showWorking = new Set();

  function workingKey(state, record) {
    return state.campaign.turn.startedAt + '/' + record.id;
  }

  function commit(state, after) {
    LP.storage.touchCampaign(state.campaign);
    draw(state, after);
  }

  function stageItem(state, item) {
    const { def, status } = item;

    if (status === 'skipped') {
      return el('li', { class: 'stage skipped' },
        stageHeader(def, el('span', { class: 'stage-skip' }, 'Skipped: ' + item.reason))
      );
    }

    if (status === 'done' || status === 'pending') {
      return el('li', { class: 'stage ' + status, 'data-stage': def.id },
        stageHeader(def),
        LP.ui.resultCard(item.record.output, item.record.pending, {
          todo: item.record.todo,
          full: showWorking.has(workingKey(state, item.record)),
          onToggle: () => {
            const key = workingKey(state, item.record);
            if (showWorking.has(key)) showWorking.delete(key);
            else showWorking.add(key);
            draw(state);
          },
          crew: LP.roster.hasCrew(state.campaign),
          isAdded: (line) => LP.roster.hasManual(state.campaign, T.itemTag(state.campaign, item.record), line),
          onAddItem: (line) => {
            const added = LP.roster.addFromLine(state.campaign, T.itemTag(state.campaign, item.record), line);
            if (added) LP.ui.notify(added.name + ' added to the Stash.', 'success');
            commit(state);
          },
          onChoose: (value) => {
            const result = T.choose(state.campaign, value);
            if (result.error) LP.ui.notify(result.error, 'error');
            commit(state, 'current');
          }
        })
      );
    }

    const fields = T.currentFields(state.campaign);
    return el('li', { class: 'stage current', 'data-stage': def.id },
      stageHeader(def),
      def.id === 'battle-result'
        ? el('p', { class: 'turn-link' },
          'Time to fight. ',
          el('a', { class: 'btn btn-sm btn-primary', href: LP.router.campaignPath(state.campaign.id, 'battle') }, 'Generate this battle'),
          ' Then come back here to record the result.')
        : null,
      LP.ui.stageForm(fields, {
        idBase: 'stage-' + def.id,
        submitLabel: def.submitLabel,
        onSubmit: (values) => {
          const result = T.confirm(state.campaign, values);
          if (result.error) return result.error;
          commit(state, 'current');
          return null;
        }
      })
    );
  }

  async function restart(state) {
    const ok = await LP.ui.confirm({
      title: 'Restart this turn?',
      message: 'All results from this turn are thrown away, and remembered values go back to how they were when the turn began.',
      confirmLabel: 'Restart turn',
      danger: true
    });
    if (!ok) return;
    T.restart(state.campaign);
    commit(state, 'current');
  }

  function draw(state, focusTarget) {
    const { container, campaign } = state;
    const turn = T.ensure(campaign);
    const w = T.walk(campaign);
    clear(container);

    container.appendChild(el('div', { class: 'tab-toolbar' },
      el('p', { class: 'muted' }, el('strong', null, 'Turn ' + LP.roster.turnNumber(campaign)), ' · started ' + LP.dom.formatDate(turn.startedAt)),
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button',
          class: 'btn',
          disabled: !T.canUndo(campaign),
          onclick: () => {
            T.undo(campaign);
            commit(state, 'current');
          }
        }, '↶ Undo last stage'),
        el('button', {
          type: 'button',
          class: 'btn btn-danger',
          disabled: !turn.records.length,
          onclick: () => restart(state)
        }, 'Restart turn')
      )
    ));

    const list = el('ol', { class: 'turn-stages' });
    let lastStep = null;
    for (const item of w.items) {
      if (item.def.step !== lastStep) {
        lastStep = item.def.step;
        list.appendChild(el('li', { class: 'step-heading', 'aria-hidden': 'true' }, STEP_HEADINGS[lastStep] || lastStep));
      }
      list.appendChild(stageItem(state, item));
    }
    container.appendChild(list);

    if (w.finished) {
      container.appendChild(el('section', { class: 'panel turn-end' },
        el('h3', null, 'Turn complete'),
        el('p', { class: 'muted' }, 'Copy anything you still need onto your sheets' + (LP.roster.hasCrew(campaign) ? ' and the Crew tab (XP, injuries, credits)' : '') + '. Starting the next turn keeps what this turn remembered (world traits, Rivals, Patrons, Rumors, debt and so on).'),
        el('div', { class: 'toolbar' },
          el('button', {
            type: 'button',
            class: 'btn btn-primary',
            onclick: () => {
              T.nextTurn(campaign);
              commit(state, 'current');
            }
          }, 'Start turn ' + (LP.roster.turnNumber(campaign) + 1))
        )
      ));
    }

    if (focusTarget === 'current') {
      const current = container.querySelector('.stage.current, .stage.pending');
      if (current) {
        current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const first = current.querySelector('.choice button, input:not([type=hidden]), select, details, button');
        if (first) first.focus({ preventScroll: true });
      }
    }
  }

  LP.tabs.turn = function render(container, campaign) {
    draw({ container, campaign });
  };
})(window.LP);
