(function (LP) {
  'use strict';

  /*
   * What the event editor and the authoring reference know about the step language: each kind of
   * step with its fields, the prompts, the comparison operators, and plain-English summaries.
   * The step interpreter is js/rules/events/run.js; this describes the same language for people.
   * Effects and facts describe their own settings in their registries (effects.js, facts.js).
   *
   *   field = { key, label, type, ... }  (dotted keys like "alternatives.n" reach into an object)
   *   types: text, dice (number, dice or $variable), number, bool, enum (options), var ($variable),
   *          name (a new variable's name), steps, predicate, selector, list (item: [fields]), pairs (key/value)
   */

  const E = LP.events;

  const TONES = [{ value: '', label: 'Plain' }, { value: 'good', label: 'Good news' }, { value: 'bad', label: 'Bad news' }, { value: 'note', label: 'A note' }];
  const OUTCOME_FIELDS = [
    { key: 'natural', label: 'First die is', type: 'number' },
    { key: 'range', label: 'Total is (e.g. 3-4)', type: 'text' },
    { key: 'min', label: 'Total at least', type: 'number' },
    { key: 'max', label: 'Total at most', type: 'number' },
    { key: 'text', label: 'Text', type: 'text' },
    { key: 'tone', label: 'Tone', type: 'enum', options: TONES },
    { key: 'steps', label: 'Then', type: 'steps' }
  ];

  const PROMPTS = [
    { id: 'yesno', label: 'Yes or No', fields: [
      { key: 'prompt', label: 'Question', type: 'text' }, { key: 'yesLabel', label: 'Yes button', type: 'text' }, { key: 'noLabel', label: 'No button', type: 'text' },
      { key: 'cost.key', label: 'Costs (resource)', type: 'enum', options: [{ value: '', label: 'Nothing' }, { value: 'credits', label: 'Credits' }, { value: 'storyPoints', label: 'Story points' }] },
      { key: 'cost.amount', label: 'Cost', type: 'number' },
      { key: 'as', label: 'Call the answer', type: 'name' },
      { key: 'yes', label: 'If Yes', type: 'steps' }, { key: 'no', label: 'If No', type: 'steps' }
    ] },
    { id: 'options', label: 'Choose one option', fields: [
      { key: 'prompt', label: 'Question', type: 'text' }, { key: 'as', label: 'Call the answer', type: 'name' },
      { key: 'options', label: 'Options', type: 'list', item: [{ key: 'value', label: 'Id', type: 'text' }, { key: 'label', label: 'Button', type: 'text' }, { key: 'steps', label: 'Then', type: 'steps' }] }
    ] },
    { id: 'number', label: 'Choose a number', fields: [
      { key: 'prompt', label: 'Question', type: 'text' }, { key: 'min', label: 'At least', type: 'number' }, { key: 'max', label: 'At most', type: 'number' },
      { key: 'per.key', label: 'Each costs (resource)', type: 'enum', options: [{ value: '', label: 'Nothing' }, { value: 'credits', label: 'Credits' }] },
      { key: 'per.amount', label: 'Cost each', type: 'number' }, { key: 'as', label: 'Call the number', type: 'name' },
      { key: 'steps', label: 'Then', type: 'steps' }, { key: 'none', label: 'If none', type: 'steps' }
    ] },
    { id: 'pickList', label: 'Pick from a list', fields: [
      { key: 'prompt', label: 'Question', type: 'text' }, { key: 'k', label: 'How many', type: 'number' }, { key: 'repeats', label: 'The same one twice is fine', type: 'bool' },
      { key: 'list', label: 'The list', type: 'list', item: [{ key: 'value', label: 'Id', type: 'text' }, { key: 'label', label: 'Name', type: 'text' }, { key: 'steps', label: 'Then', type: 'steps' }] }
    ] },
    { id: 'offer', label: 'Offer random candidates', fields: [
      { key: 'prompt', label: 'Question', type: 'text' }, { key: 'select', label: 'Candidates', type: 'selector' }, { key: 'as', label: 'Call the choice', type: 'name' },
      { key: 'allowDecline', label: 'They may decline', type: 'bool' }, { key: 'chosen', label: 'If one is chosen', type: 'steps' }, { key: 'declined', label: 'If declined', type: 'steps' }
    ] },
    { id: 'recruit', label: 'Offer a recruit', fields: [
      { key: 'prompt', label: 'Text', type: 'text' },
      { key: 'variant.species', label: 'Species (an id, or blank)', type: 'text' }, { key: 'variant.feral', label: 'Feral', type: 'bool' },
      { key: 'variant.baseProfileOnly', label: 'Base profile only (no origin rolls)', type: 'bool' }, { key: 'variant.equipment', label: 'Brings equipment', type: 'bool', defaultValue: true },
      { key: 'variant.xp', label: 'Unspent XP', type: 'number' },
      { key: 'accept', label: 'If they join', type: 'steps' }, { key: 'decline', label: 'If they don’t', type: 'steps' }
    ] }
  ];

  const SELECTOR_FIELDS = [
    { key: 'from', label: 'Pick from', type: 'enum', options: [{ value: 'crew', label: 'The crew' }, { value: 'items', label: 'Items' }, { value: 'rivals', label: 'Rivals here' }, { value: 'patrons', label: 'Patrons here' }] },
    { key: 'count', label: 'How many', type: 'dice' },
    { key: 'best', label: 'Highest of (a stat)', type: 'enum', options: [{ value: '', label: 'A random one' }].concat(['reactions', 'speed', 'combat', 'toughness', 'savvy', 'luck'].map((s) => ({ value: s, label: s }))) },
    { key: 'carrier', label: 'Items carried by', type: 'var', hint: '$actor, "stash" or blank for any' },
    { key: 'disabled', label: 'Set-aside ones only', type: 'bool' },
    { key: 'offer', label: 'Offer this many to choose from', type: 'number' },
    { key: 'where', label: 'Only if', type: 'predicate' },
    { key: 'prefer', label: 'Prefer, if any', type: 'predicate' },
    { key: 'exclude', label: 'Leave out (variables)', type: 'text', list: true }
  ];

  const STEP_KINDS = [
    { id: 'roll', label: 'Roll dice', hint: 'Dice with a modifier, a target, and what follows.', blank: () => ({ roll: '1D6' }), fields: [
      { key: 'roll', label: 'Dice', type: 'dice' }, { key: 'label', label: 'Label', type: 'text' }, { key: 'as', label: 'Call the result', type: 'name' },
      { key: 'add', label: 'Plus', type: 'list', item: [{ key: 'label', label: 'What', type: 'text' }, { key: 'value', label: 'Value', type: 'dice' }] },
      { key: 'keep', label: 'Keep', type: 'enum', options: [{ value: '', label: 'The total' }, { value: 'highest', label: 'The highest die' }] },
      { key: 'target', label: 'Needs at least', type: 'number' },
      { key: 'pass', label: 'If it succeeds', type: 'steps' }, { key: 'fail', label: 'If it fails', type: 'steps' },
      { key: 'outcomes', label: 'Outcomes by result', type: 'list', item: OUTCOME_FIELDS }
    ] },
    { id: 'effect', label: 'Change something', hint: 'Credits, XP, Sick Bay, items, Rivals, conditions…', blank: () => ({ effect: 'resource', key: 'credits', amount: 1 }), fields: [] },
    { id: 'select', label: 'Pick someone or something', hint: 'A random crew member, item, Rival or Patron.', blank: () => ({ select: { from: 'crew' }, as: 'who' }), fields: [
      { key: 'select', label: 'Pick', type: 'selector' }, { key: 'as', label: 'Call it', type: 'name' }, { key: 'label', label: 'Say who', type: 'text' },
      { key: 'required', label: 'The event can’t happen without one', type: 'bool' }, { key: 'list', label: 'Keep as a list', type: 'bool' }
    ] },
    { id: 'if', label: 'If…', hint: 'Do something only when a condition holds.', blank: () => ({ if: { fact: 'crew.count', gte: 2 }, then: [] }), fields: [
      { key: 'if', label: 'If', type: 'predicate' }, { key: 'then', label: 'Then', type: 'steps' }, { key: 'else', label: 'Otherwise', type: 'steps' }
    ] },
    { id: 'ask', label: 'Ask the player', hint: 'A choice, a number, a pick, a recruit…', blank: () => ({ ask: 'yesno', prompt: 'Do it?', yes: [], no: [] }), fields: [] },
    { id: 'table', label: 'Roll on a table', hint: 'An event table, or Loot and other roll tables.', blank: () => ({ table: 'Loot Table' }), fields: [
      { key: 'table', label: 'Table', type: 'table' }, { key: 'actor', label: 'Event is about (variable)', type: 'var' }, { key: 'as', label: 'Call the result', type: 'name' },
      { key: 'label', label: 'Label', type: 'text' }, { key: 'damaged', label: 'Items are damaged', type: 'bool' }
    ] },
    { id: 'again', label: 'Roll again', hint: 'Another event from the same table.', blank: () => ({ again: true }), fields: [] },
    { id: 'rollGroup', label: 'Play an event of a group', hint: 'Pick by weight among events sharing a group name.', blank: () => ({ rollGroup: '' }), fields: [
      { key: 'rollGroup', label: 'Group', type: 'text' }, { key: 'actor', label: 'Event is about (variable)', type: 'var' }
    ] },
    { id: 'call', label: 'Run a fragment', hint: 'Steps the pack shares between events.', blank: () => ({ call: '' }), fields: [{ key: 'call', label: 'Fragment', type: 'fragment' }] },
    { id: 'alternatives', label: 'Roll twice and choose', hint: 'Roll a table n times; the player keeps one.', blank: () => ({ alternatives: { n: 2, table: 'trade' } }), fields: [
      { key: 'alternatives.n', label: 'Rolls', type: 'number' }, { key: 'alternatives.table', label: 'Table', type: 'table' }, { key: 'prompt', label: 'Question', type: 'text' }
    ] },
    { id: 'forEach', label: 'For each…', hint: 'Repeat steps for each person or item picked as a list.', blank: () => ({ forEach: '$who', steps: [] }), fields: [
      { key: 'forEach', label: 'For each of (variable)', type: 'var' }, { key: 'steps', label: 'Do', type: 'steps' }
    ] },
    { id: 'repeat', label: 'Repeat', hint: 'A set number of times, or until something happens.', blank: () => ({ repeat: { times: 3 }, steps: [] }), fields: [
      { key: 'repeat.times', label: 'Times (a number or variable)', type: 'dice' }, { key: 'repeat.max', label: 'Or at most', type: 'number' },
      { key: 'repeat.until', label: 'Stop when', type: 'predicate' }, { key: 'steps', label: 'Do', type: 'steps' }
    ] },
    { id: 'group', label: 'Group steps under a heading', hint: 'A heading, optionally about someone else.', blank: () => ({ group: 'Heading', steps: [] }), fields: [
      { key: 'group', label: 'Heading', type: 'text' }, { key: 'actor', label: 'About (variable)', type: 'var' }, { key: 'steps', label: 'Do', type: 'steps' }
    ] },
    { id: 'say', label: 'Say something', hint: 'A line of result text. {actor} and other variables fill in.', blank: () => ({ say: '' }), fields: [
      { key: 'say', label: 'Text', type: 'text' }, { key: 'tone', label: 'Tone', type: 'enum', options: TONES }
    ] },
    { id: 'manual', label: 'Leave it to the player', hint: 'A note for something the app can’t do.', blank: () => ({ manual: '' }), fields: [{ key: 'manual', label: 'Text', type: 'text' }] }
  ];

  // Effects authors shouldn't pick by hand: the app plans them itself.
  const HIDDEN_EFFECTS = ['member.add', 'item.restore', 'condition.tick', 'stat.raiseRandom'];

  const OPERATORS = [
    { value: '', label: 'is true' }, { value: 'eq', label: 'is' }, { value: 'ne', label: 'is not' }, { value: 'gt', label: 'is more than' },
    { value: 'gte', label: 'is at least' }, { value: 'lt', label: 'is less than' }, { value: 'lte', label: 'is at most' },
    { value: 'in', label: 'is one of' }, { value: 'includes', label: 'includes' }
  ];

  /* ---------------------------------------------------------------------- */
  /* Kinds and blanks                                                       */
  /* ---------------------------------------------------------------------- */

  const ORDER = ['roll', 'ask', 'effect', 'select', 'group', 'if', 'table', 'again', 'rollGroup', 'call', 'alternatives', 'forEach', 'repeat', 'say', 'manual'];

  /** The kind of a step (the first key it has, in the order the runner looks). */
  function kindOf(step) {
    const id = ORDER.find((k) => step && step[k] !== undefined);
    return STEP_KINDS.find((k) => k.id === id) || null;
  }

  function blank(kindId) {
    const kind = STEP_KINDS.find((k) => k.id === kindId);
    return kind ? kind.blank() : null;
  }

  function promptOf(id) {
    return PROMPTS.find((p) => p.id === id) || null;
  }

  /** Editor field type for a setting a registry declares. */
  const REGISTRY_TYPES = { number: 'number', dice: 'dice', string: 'text', boolean: 'bool', enum: 'enum', ref: 'var', steps: 'steps', predicate: 'predicate', any: 'pairs' };

  /** The fields to edit an effect step: its registry settings (the effect itself is chosen separately). */
  function effectFields(effectId) {
    const def = E.effects.get(effectId);
    if (!def) return [];
    const fields = Object.entries(def.params || {}).map(([key, spec]) => {
      const field = { key: key, label: key, type: REGISTRY_TYPES[spec.type] || 'text', required: !!spec.required };
      if (spec.type === 'enum') field.options = spec.options.map((o) => ({ value: o, label: o }));
      if (key === 'as') { field.type = 'name'; field.label = 'Call it'; }
      return field;
    });
    fields.push({ key: 'say', label: 'Say (optional)', type: 'text' });
    return fields;
  }

  /** The fields for a step, filling in the ones that depend on the effect or prompt chosen. */
  function fieldsFor(step) {
    const kind = kindOf(step);
    if (!kind) return [];
    if (kind.id === 'effect') return effectFields(step.effect);
    if (kind.id === 'ask') {
      const prompt = promptOf(step.ask);
      return prompt ? prompt.fields : [];
    }
    return kind.fields;
  }

  /* ---------------------------------------------------------------------- */
  /* Variables                                                              */
  /* ---------------------------------------------------------------------- */

  /** Every variable name an event's steps bind (plus the ones a run always has), as "$name". */
  function variablesIn(steps) {
    const names = new Set(['$actor', '$each', '$i', '$this']);
    (function walk(value) {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (!value || typeof value !== 'object') return;
      if (typeof value.as === 'string' && value.as) names.add('$' + value.as);
      for (const v of Object.values(value)) walk(v);
    })(steps);
    return Array.from(names);
  }

  /* ---------------------------------------------------------------------- */
  /* Summaries                                                              */
  /* ---------------------------------------------------------------------- */

  function signed(n) {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  }

  function v(value) {
    if (value === undefined || value === null) return '…';
    return typeof value === 'string' && value.charAt(0) === '$' ? value.slice(1) : String(value);
  }

  const RESOURCE_NAMES = { credits: 'credits', storyPoints: 'story points', rumors: 'Rumors', fuel: 'fuel', shipParts: 'ship parts' };

  const EFFECT_TEXT = {
    resource: (s) => v(String(s.amount).charAt(0) === '-' ? s.amount : '+' + s.amount) + ' ' + (RESOURCE_NAMES[s.key] || s.key),
    pay: (s) => 'Pay ' + v(s.amount) + ' credits (or something else happens)',
    xp: (s) => v(s.target) + ' ' + (Number(s.amount) < 0 ? '' : '+') + v(s.amount) + ' XP',
    stat: (s) => v(s.target) + ' ' + signed(Number(s.amount)) + ' ' + s.stat,
    sickBay: (s) => v(s.target) + (Number(s.turns) < 0 ? ' recovers ' + Math.abs(s.turns) + ' sooner' : ' goes to Sick Bay for ' + v(s.turns) + ' turns'),
    hull: (s) => 'Hull ' + (String(s.amount).charAt(0) === '-' ? '' : '+') + v(s.amount),
    debt: (s) => 'Ship debt ' + (String(s.amount).charAt(0) === '-' ? '' : '+') + v(s.amount),
    injuryRoll: (s) => v(s.target) + ' rolls on the Injury Table',
    'item.add': (s) => 'Gain ' + (s.name || (s.table + ' ' + s.row)) + (s.damaged ? ' (damaged)' : '') + (s.to ? ' for ' + v(s.to) : ' in the Stash'),
    'item.remove': (s) => 'Lose ' + v(s.target),
    'item.damage': (s) => v(s.target) + ' is damaged',
    'item.repair': (s) => v(s.target) + ' is repaired',
    'item.hold': (s) => v(s.target) + ' goes missing (' + s.type + ')',
    'rival.add': (s) => 'A new Rival' + (s.bindTo ? ' tied to ' + v(s.bindTo) : ''),
    'rival.disable': (s) => v(s.target) + ' is set aside',
    'rival.enable': (s) => v(s.target) + ' is back',
    'patron.add': () => 'A new Patron',
    'patron.disable': (s) => v(s.target) + ' is set aside',
    'patron.enable': (s) => v(s.target) + ' is back',
    'member.remove': (s) => v(s.target) + ' leaves the crew',
    'leader.set': (s) => v(s.target) + ' becomes captain',
    'motivation.set': (s) => v(s.target) + ' takes a new motivation',
    'planets.generate': (s) => v(s.count) + ' new worlds',
    'condition.add': (s) => 'Start condition ' + s.type + (s.target ? ' on ' + v(s.target) : ''),
    'condition.remove': (s) => 'End condition ' + (s.type || s.id || '')
  };

  /** One line saying what a predicate means. */
  function describePredicate(p) {
    if (!p || typeof p !== 'object') return 'always';
    if (p.all) return p.all.map(describePredicate).join(' and ');
    if (p.any) return p.any.map(describePredicate).join(' or ');
    if (p.not) return 'not (' + describePredicate(p.not) + ')';
    if (p.ask !== undefined) return 'the player says yes to “' + p.ask + '”';
    const op = LP.predicate.OPS.find((o) => p[o] !== undefined) || null;
    const opLabel = op ? OPERATORS.find((o) => o.value === op).label : 'is true';
    const subject = p.var !== undefined ? v(p.var) : (p.fact + (p.of ? ' of ' + v(p.of) : ''));
    return subject + ' ' + opLabel + (op ? ' ' + (Array.isArray(p[op]) ? p[op].join(', ') : v(p[op])) : '');
  }

  function describeSteps(steps) {
    return (steps || []).map(describeStep);
  }

  /** One line saying what a step does. */
  function describeStep(step) {
    const kind = kindOf(step);
    if (!kind) return 'Unknown step';
    switch (kind.id) {
      case 'roll': return 'Roll ' + step.roll + (step.target !== undefined ? ', needs ' + step.target + '+' : '') + (step.label ? ' (' + step.label + ')' : '') + (step.as ? ' → ' + step.as : '');
      case 'effect': return (EFFECT_TEXT[step.effect] ? EFFECT_TEXT[step.effect](step) : step.effect);
      case 'select': return 'Pick ' + ((step.select && step.select.count) ? step.select.count + ' ' : 'a ') + (step.select ? step.select.from : '…') + ' → ' + (step.as || '…') +
        (step.select && step.select.best ? ' (highest ' + step.select.best + ')' : '') + (step.select && step.select.offer ? ' (offer ' + step.select.offer + ')' : '');
      case 'if': return 'If ' + describePredicate(step.if);
      case 'ask': return 'Ask: ' + (step.prompt || step.ask) + ' (' + (promptOf(step.ask) ? promptOf(step.ask).label.toLowerCase() : step.ask) + ')';
      case 'table': return 'Roll on ' + step.table + (step.actor ? ' for ' + v(step.actor) : '') + (step.damaged ? ' (damaged)' : '');
      case 'again': return 'Roll again on this table';
      case 'rollGroup': return 'Play an event from group "' + step.rollGroup + '"';
      case 'call': return 'Run fragment ' + step.call;
      case 'alternatives': return 'Roll ' + step.alternatives.n + ' times on ' + step.alternatives.table + '; keep one';
      case 'forEach': return 'For each of ' + v(step.forEach);
      case 'repeat': return step.repeat.times ? 'Repeat ' + v(step.repeat.times) + ' times' : 'Repeat up to ' + step.repeat.max + ' times until ' + describePredicate(step.repeat.until);
      case 'group': return 'Under “' + step.group + '”' + (step.actor ? ' for ' + v(step.actor) : '');
      case 'say': return 'Say: ' + step.say;
      case 'manual': return 'By hand: ' + step.manual;
      default: return kind.label;
    }
  }

  E.schema = {
    STEP_KINDS, PROMPTS, SELECTOR_FIELDS, OPERATORS, TONES, HIDDEN_EFFECTS,
    kindOf, blank, promptOf, effectFields, fieldsFor, variablesIn, describeStep, describeSteps, describePredicate
  };
})(window.LP);
