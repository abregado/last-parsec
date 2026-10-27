(function (LP) {
  'use strict';

  const { el } = LP.dom;
  const E = LP.events;
  const K = E.packs;
  const S = E.schema;
  const F = LP.ui.eventForm;

  const KINDS = [
    { value: 'travel', label: 'Starship Travel' }, { value: 'character', label: 'Character' }, { value: 'campaign', label: 'Campaign' },
    { value: 'exploration', label: 'Exploration' }, { value: 'trade', label: 'Trade' }
  ];

  /**
   * The detail pane of the Events tab for one event: read-only for a locked (base) event, a form for
   * one of the campaign's own, with the checks, and the test roll underneath.
   *   LP.ui.eventEditor(state, fullId) -> element       state = { campaign, redraw(), select(fullId|null) }
   */
  function eventEditor(state, fullId) {
    const { campaign } = state;
    const found = K.find(campaign, fullId);
    if (!found) return el('div', { class: 'empty-state' }, el('h2', { text: 'Pick an event' }), el('p', { text: 'Choose an event on the left to read it, or press New event.' }));
    const event = found.event;
    const save = () => {
      // Tidy empty parts so the saved event stays clean.
      if (event.fallback && !event.fallback.length) delete event.fallback;
      if (event.requires && F.isEmpty(event.requires)) delete event.requires;
      LP.storage.touchCampaign(campaign);
    };
    const packLabel = found.pack.pack.name;

    const ctx = {
      campaign, focus: 'ev', save, redraw: state.redraw, readOnly: found.locked,
      variables: () => S.variablesIn((event.steps || []).concat(event.fallback || [])),
      fragments: () => (found.pack.fragments || []).map((f) => f.id),
      validation: () => ({ groups: Array.from(new Set((found.pack.events || []).map((e) => e.group).filter(Boolean))), fragments: (found.pack.fragments || []).map((f) => f.id) })
    };

    const enabled = el('input', { type: 'checkbox', checked: !K.isDisabled(campaign, fullId), 'data-focus': 'ev-enabled' });
    enabled.addEventListener('change', () => { K.setEnabled(campaign, fullId, enabled.checked); save(); state.redraw(); });

    const actions = [
      el('label', { class: 'multi-option' }, enabled, el('span', null, 'Can happen')),
      el('button', {
        type: 'button', class: 'btn btn-sm', 'data-focus': 'ev-duplicate',
        onclick: () => { const id = K.duplicateEvent(campaign, fullId); save(); LP.ui.notify('Copied into ' + K.find(campaign, id).pack.pack.name + '.', 'success'); state.select(id); }
      }, 'Duplicate')
    ];
    if (found.locked) {
      actions.push(el('button', {
        type: 'button', class: 'btn btn-sm', 'data-focus': 'ev-replace',
        onclick: async () => {
          const ok = await LP.ui.confirm({ title: 'Replace this event?', message: 'The original is switched off and an editable copy takes its place. You can switch the original back on any time.', confirmLabel: 'Replace it' });
          if (!ok) return;
          const id = K.replaceOriginal(campaign, fullId);
          save();
          state.select(id);
        }
      }, 'Replace with an editable copy'));
    } else {
      const packs = K.mine(campaign);
      if (packs.length > 1) {
        const move = el('select', { class: 'input select', 'aria-label': 'Move to pack', 'data-focus': 'ev-move' },
          el('option', { value: '' }, 'Move to…'),
          packs.filter((p) => p !== found.pack).map((p) => el('option', { value: p.pack.id }, p.pack.name)));
        move.addEventListener('change', () => { if (!move.value) return; const id = K.moveEvent(campaign, fullId, move.value); save(); state.select(id); });
        actions.push(move);
      }
      actions.push(el('button', {
        type: 'button', class: 'btn btn-sm btn-danger', 'data-focus': 'ev-delete',
        onclick: async () => {
          const ok = await LP.ui.confirm({ title: 'Delete this event?', message: '“' + event.title + '” is removed from ' + packLabel + ' and from every archetype.', confirmLabel: 'Delete', danger: true });
          if (!ok) return;
          K.deleteEvent(campaign, fullId);
          save();
          state.select(null);
        }
      }, 'Delete'));
    }

    const head = el('div', { class: 'panel ev-head' },
      el('div', { class: 'ev-head-top' },
        el('h2', null, event.title || 'Untitled event'),
        el('span', { class: 'badge' }, found.locked ? '🔒 ' + packLabel : packLabel)),
      el('div', { class: 'toolbar' }, actions),
      found.locked ? el('p', { class: 'field-detail' }, 'Base events can’t be changed. Duplicate one to edit a copy, or switch it off.') : null
    );

    if (found.locked) {
      return el('div', { class: 'ev-editor' },
        head,
        el('div', { class: 'panel' },
          el('p', { class: 'field-detail' }, 'Table: ' + (KINDS.find((k) => k.value === event.table) || {}).label + ' · weight ' + event.weight + (event.group ? ' · group ' + event.group : '')),
          event.text ? el('p', null, event.text) : null,
          event.requires ? el('p', { class: 'field-detail' }, 'Only when: ' + S.describePredicate(event.requires)) : null,
          el('h3', null, 'What happens'),
          event.steps.length ? LP.ui.stepOutline(event.steps) : el('p', { class: 'field-detail' }, 'Nothing: the rule text is all there is.'),
          event.fallback ? [el('h3', null, 'If it can’t happen'), LP.ui.stepOutline(event.fallback)] : null
        ),
        LP.ui.eventTester(campaign, fullId)
      );
    }

    const problems = K.eventProblems(campaign, fullId);
    const fallback = event.fallback || [];
    const text = el('textarea', { class: 'input', rows: '4', 'data-focus': 'ev:text' });
    text.value = event.text || '';
    text.addEventListener('input', () => { event.text = text.value; });
    text.addEventListener('change', save);
    const tokens = ctx.variables().filter((n) => !['$each', '$i', '$this'].includes(n) || ctx.variables().length < 8).map((n) => el('button', {
      type: 'button', class: 'btn btn-sm btn-ghost', title: 'Add {' + n.slice(1) + '} to the text',
      onclick: () => { event.text = (event.text || '') + '{' + n.slice(1) + '}'; save(); state.redraw(); }
    }, '{' + n.slice(1) + '}'));

    return el('div', { class: 'ev-editor' },
      head,
      problems.length ? el('div', { class: 'panel ev-problems', role: 'alert' },
        el('strong', null, 'This event has problems and won’t be rolled until they are fixed:'),
        el('ul', null, problems.map((p) => el('li', null, p.replace(/^Event "[^"]*":?\s*/, ''))))) : null,
      el('div', { class: 'panel ev-form' },
        F.fieldRow({ key: 'title', label: 'Title', type: 'text' }, event, ctx, 'event'),
        el('div', { class: 'ev-row' },
          F.fieldRow({ key: 'table', label: 'Table', type: 'enum', options: KINDS }, event, ctx, 'event'),
          F.fieldRow({ key: 'weight', label: 'Weight (how often, relative to the others)', type: 'number' }, event, ctx, 'event'),
          F.fieldRow({ key: 'group', label: 'Group (optional)', type: 'text', hint: 'Events with the same group can be played together by a "play an event of a group" step.' }, event, ctx, 'event')),
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Rule text (shown above what happens)'), text),
        el('div', { class: 'ev-tokens' }, el('span', { class: 'field-detail' }, 'Insert: '), tokens),
        el('h3', null, 'Only when'),
        LP.ui.predicateEditor(event.requires, ctx, (value) => { F.setPath(event, 'requires', value); save(); state.redraw(); }, 'requires'),
        el('h3', null, 'What happens'),
        LP.ui.stepList(event.steps, ctx, 'steps'),
        el('h3', null, 'If it can’t happen'),
        el('p', { class: 'field-detail' }, 'Used when a step the event can’t do without has nobody to act on (for example, a pick marked "can’t happen without one").'),
        LP.ui.stepList(fallback, ctx, 'fallback', () => F.setPath(event, 'fallback', fallback))
      ),
      LP.ui.eventTester(campaign, fullId)
    );
  }

  LP.ui.eventEditor = eventEditor;
  LP.ui.eventKinds = KINDS;
})(window.LP);
