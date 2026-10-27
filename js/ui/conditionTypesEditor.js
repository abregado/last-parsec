(function (LP) {
  'use strict';

  const { el } = LP.dom;
  const E = LP.events;
  const K = E.packs;
  const S = E.schema;
  const F = LP.ui.eventForm;
  const C = LP.conditions;

  const opt = (list) => list.map((x) => ({ value: x, label: x }));
  const blankFirst = (list) => [{ value: '', label: '—' }].concat(opt(list));
  const STATS = ['reactions', 'speed', 'combat', 'toughness', 'savvy', 'luck'];
  const ENDS = C.TRIGGERS.concat(C.MODIFIER_TARGETS).concat(['roll.{params.roll}']);

  const FIELDS = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'scope', label: 'About', type: 'enum', options: [
      { value: 'character', label: 'A character' }, { value: 'crew', label: 'The whole crew' }, { value: 'ship', label: 'The ship' },
      { value: 'planet', label: 'A planet (the one it starts on)' }, { value: 'campaign', label: 'The campaign' },
      { value: 'rival', label: 'A Rival' }, { value: 'patron', label: 'A Patron' }
    ] },
    { key: 'text', label: 'What it means (shown on the Crew tab)', type: 'text', multiline: true },
    { key: 'duration.turns', label: 'Lasts this many campaign turns (blank: until it ends another way)', type: 'number' },
    { key: 'duration.from', label: 'Counting from', type: 'enum', options: [{ value: 'now', label: 'The rest of this turn' }, { value: 'next', label: 'The next turn' }] },
    { key: 'unique', label: 'If there is one already', type: 'enum', options: [{ value: '', label: 'Add another' }, { value: 'ignore', label: 'Keep the old one' }, { value: 'replace', label: 'Replace it' }, { value: 'extend', label: 'Add the turns to it' }] },
    { key: 'tickOn', label: 'Counts a turn off', type: 'enum', options: [{ value: '', label: 'At the start of each turn' }, { value: 'arrive', label: 'On each arrival at a new world' }] },
    { key: 'check.stat', label: 'Check: the best crew member’s', type: 'enum', options: blankFirst(STATS) },
    { key: 'check.dice', label: 'Check: dice', type: 'text', hint: 'for example 1D6' },
    { key: 'check.target', label: 'Check: needs at least', type: 'number', hint: 'A pass counts a turn off; a fail leaves it. Needs a duration.' },
    { key: 'blocks', label: 'Stops', type: 'multi', options: C.BLOCKS.map((b) => ({ value: b, label: b })) },
    { key: 'grants', label: 'Grants', type: 'multi', options: C.GRANTS.map((g) => ({ value: g, label: g })) },
    { key: 'endsOn', label: 'Ends when', type: 'enum', options: blankFirst(ENDS) },
    { key: 'consumeOn', label: 'Used up by', type: 'enum', options: blankFirst(ENDS) }
  ];

  const MODIFIER_ITEM = [
    { key: 'target', label: 'Changes', type: 'enum', options: opt(C.MODIFIER_TARGETS.concat(['roll.{params.roll}'])) },
    { key: 'add', label: 'Adds', type: 'number' }, { key: 'set', label: 'Sets it to', type: 'number' }, { key: 'floor', label: 'At least', type: 'number' },
    { key: 'ask', label: 'Only if the player says yes to this question (its key)', type: 'text' }
  ];
  const ASK_ITEM = [
    { key: 'key', label: 'Key', type: 'text' }, { key: 'label', label: 'Question', type: 'text' },
    { key: 'trigger', label: 'Asked when', type: 'enum', options: opt(C.TRIGGERS) }
  ];

  function describe(type) {
    const bits = [];
    if (type.duration) bits.push('lasts ' + type.duration.turns + ' turn' + (type.duration.turns === 1 ? '' : 's') + ' from ' + (type.duration.from === 'next' ? 'next turn' : 'now'));
    if (type.check) bits.push('check ' + type.check.stat + ' ' + type.check.dice + ' needs ' + type.check.target);
    if ((type.blocks || []).length) bits.push('stops ' + type.blocks.join(', '));
    if ((type.grants || []).length) bits.push('grants ' + type.grants.join(', '));
    for (const m of type.modifiers || []) bits.push(m.target + (m.add !== undefined ? ' ' + (m.add > 0 ? '+' : '') + m.add : m.set !== undefined ? ' set to ' + m.set : ' at least ' + m.floor));
    if (type.endsOn) bits.push('ends on ' + type.endsOn);
    if (type.consumeOn) bits.push('used up by ' + type.consumeOn);
    return bits.join(' · ') || 'Nothing by itself.';
  }

  /**
   * One condition type: read-only for the base pack's, a form for the campaign's own.
   *   LP.ui.conditionTypeEditor(state, pack, type, locked) -> element     state = { campaign, redraw(), select() }
   */
  function conditionTypeEditor(state, pack, type, locked) {
    const { campaign } = state;
    const save = () => LP.storage.touchCampaign(campaign);
    const head = el('div', { class: 'panel ev-head' },
      el('div', { class: 'ev-head-top' }, el('h2', null, type.name || 'Unnamed condition'), el('span', { class: 'badge' }, (locked ? '🔒 ' : '') + pack.pack.name)),
      el('p', { class: 'field-detail' }, 'Id: ' + type.id + ' · about ' + type.scope)
    );
    if (locked) {
      return el('div', { class: 'ev-editor' },
        head,
        el('div', { class: 'panel' },
          el('p', null, type.text),
          el('p', { class: 'field-detail' }, describe(type)),
          Object.entries(type.on || {}).map(([trigger, steps]) => el('div', null, el('h3', null, 'When: ' + trigger), LP.ui.stepOutline(steps)))
        ));
    }

    const asks = (type.asks || []).map((a) => '$' + a.key);
    const ctx = {
      campaign, focus: 'ct', save, redraw: state.redraw,
      variables: () => ['$actor', '$cond', '$rival'].concat(asks, S.variablesIn(type.on || {}), S.variablesIn(type.bypass || {})),
      fragments: () => (pack.fragments || []).map((f) => f.id),
      validation: () => ({ groups: [], fragments: (pack.fragments || []).map((f) => f.id) })
    };
    const problems = C.validateType(type).map((p) => p.replace(/^Condition "[^"]*":?\s*/, ''));
    const hookTriggers = C.TRIGGERS.filter((t) => !(type.on || {})[t]);
    const addHook = el('select', { class: 'input select', 'aria-label': 'Add a hook', 'data-focus': 'ct-add-hook' },
      el('option', { value: '' }, '+ Do something when…'),
      hookTriggers.map((t) => el('option', { value: t }, t)));
    addHook.addEventListener('change', () => { if (!addHook.value) return; type.on = type.on || {}; type.on[addHook.value] = []; save(); state.redraw(); });

    return el('div', { class: 'ev-editor' },
      head,
      problems.length ? el('div', { class: 'panel ev-problems', role: 'alert' }, el('strong', null, 'Problems:'), el('ul', null, problems.map((p) => el('li', null, p)))) : null,
      el('div', { class: 'panel ev-form' },
        FIELDS.map((f) => F.fieldRow(f, type, ctx, 'type')),
        (type.blocks || []).includes('battle')
          ? F.fieldRow({ key: 'blockExcept.battle', label: 'Still fights in', type: 'multi', options: [{ value: 'invasion', label: 'Invasion battles' }] }, type, ctx, 'type') : null,
        F.fieldRow({ key: 'modifiers', label: 'Bonuses', type: 'list', item: MODIFIER_ITEM }, type, ctx, 'type'),
        F.fieldRow({ key: 'asks', label: 'Questions', type: 'list', item: ASK_ITEM }, type, ctx, 'type'),
        el('h3', null, 'Pay to ignore a block (optional)'),
        F.fieldRow({ key: 'bypass.label', label: 'Button text', type: 'text' }, type, ctx, 'type'),
        F.fieldRow({ key: 'bypass.cost.key', label: 'Costs', type: 'enum', options: [{ value: '', label: 'Nothing' }, { value: 'credits', label: 'Credits' }] }, type, ctx, 'type'),
        F.fieldRow({ key: 'bypass.cost.amount', label: 'Cost (a number, or params.cost)', type: 'dice' }, type, ctx, 'type'),
        F.fieldRow({ key: 'bypass.steps', label: 'Then', type: 'steps' }, type, ctx, 'type'),
        el('h3', null, 'Hooks'),
        el('p', { class: 'field-detail' }, 'Steps that run when something happens. $actor is the character it is about and $cond is this condition (params are $cond.params.name).'),
        Object.keys(type.on || {}).map((trigger) => el('div', { class: 'ef-block' },
          el('div', { class: 'ef-item-tools' }, el('strong', null, 'When: ' + trigger),
            el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove hook', onclick: () => { delete type.on[trigger]; if (!Object.keys(type.on).length) delete type.on; save(); state.redraw(); } }, '✕')),
          LP.ui.stepList(type.on[trigger], ctx, 'on.' + trigger))),
        addHook
      ),
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button', class: 'btn btn-sm btn-danger', 'data-focus': 'ct-delete',
          onclick: async () => {
            const ok = await LP.ui.confirm({ title: 'Delete this condition?', message: '“' + type.name + '” is removed from ' + pack.pack.name + '. Events that use it will show problems until they are changed.', confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            K.deleteConditionType(campaign, pack.pack.id, type.id);
            save();
            state.selectCondition(null);
          }
        }, 'Delete condition'))
    );
  }

  LP.ui.conditionTypeEditor = conditionTypeEditor;
})(window.LP);
