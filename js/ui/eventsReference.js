(function (LP) {
  'use strict';

  const { el } = LP.dom;
  const E = LP.events;
  const S = E.schema;
  const C = LP.conditions;

  /**
   * The authoring reference: everything the editor can offer, listed from the registries and the
   * schema, so it is never out of date. (The guide for writing packs is docs/event-authoring.md.)
   *   LP.ui.eventsReference() -> element
   */

  function table(heads, rows) {
    return el('table', { class: 'ref-table' },
      el('thead', null, el('tr', null, heads.map((h) => el('th', null, h)))),
      el('tbody', null, rows.map((r) => el('tr', null, r.map((cell, i) => el('td', { class: i === 0 ? 'ref-key' : null }, cell))))));
  }

  function section(title, intro, body) {
    return el('section', { class: 'panel ref-section' }, el('h3', null, title), intro ? el('p', { class: 'field-detail' }, intro) : null, body);
  }

  function settings(def) {
    const entries = Object.entries(def.params || {});
    if (!entries.length) return 'none';
    return entries.map(([k, s]) => k + (s.required ? '*' : '') + ': ' + s.type + (s.options ? ' (' + s.options.join(', ') + ')' : '')).join('; ');
  }

  function fieldList(fields) {
    return fields.map((f) => f.key + ' (' + f.type + ')').join(', ');
  }

  function eventsReference() {
    const effects = E.effects.list().filter((d) => !S.HIDDEN_EFFECTS.includes(d.id)).sort((a, b) => a.id.localeCompare(b.id));
    return el('div', { class: 'reference' },
      section('How an event works', 'Read this first.', el('ul', null,
        el('li', null, 'An event is rolled from its table by weight, and plays its steps in order. Nothing changes until the player presses Apply.'),
        el('li', null, 'Steps name people and things with $variables: $actor is who the event is about; a step that says "Call it who" makes $who for later steps. $who.savvy reads a property.'),
        el('li', null, 'Text can use {actor} or {who} to put names in. {roll} puts in a rolled total.'),
        el('li', null, 'Anything that lasts (a character away for two turns, a single-use item) is a condition. Add one with a "Change something → condition.add" step.'),
        el('li', null, 'Nothing here starts a battle out of turn. Use conditions that act in the turn’s own battle step instead.'))),
      section('Steps', 'The kinds of step you can add.', table(['Step', 'What it does', 'Fields'],
        S.STEP_KINDS.map((k) => [k.label, k.hint, k.id === 'effect' ? 'see Changes' : k.id === 'ask' ? 'see Questions' : fieldList(k.fields)]))),
      section('Changes (effects)', 'What a "Change something" step can do. * means required.', table(['Effect', 'Settings'], effects.map((d) => [d.id, settings(d)]))),
      section('Questions (prompts)', 'What "Ask the player" can ask.', table(['Question', 'Fields'], S.PROMPTS.map((p) => [p.label, fieldList(p.fields)]))),
      section('Picking people and things', 'The options of a "Pick" step.', table(['Option', 'Meaning'], S.SELECTOR_FIELDS.map((f) => [f.label, f.key + ' (' + f.type + ')' + (f.hint ? ' — ' + f.hint : '')]))),
      section('Conditions you can test (facts)', 'Used in "If", "Only when" and picks. * means required.', table(['Fact', 'Settings'],
        E.facts.list().sort((a, b) => a.id.localeCompare(b.id)).map((d) => [d.id + (d.entity ? ' (about a ' + d.entity + ')' : ''), settings(d)]))),
      section('Comparisons', null, table(['Word', 'Means'], S.OPERATORS.map((o) => [o.value || '(none)', o.label]))),
      section('Conditions (lasting state)', 'What a condition type can use.', table(['Part', 'Values'], [
        ['About', C.SCOPES.join(', ')],
        ['Hooks and questions happen when', C.TRIGGERS.join(', ')],
        ['Can stop', C.BLOCKS.join(', ')],
        ['Can grant', C.GRANTS.join(', ')],
        ['Can change', C.MODIFIER_TARGETS.join(', ') + ', roll.{params.roll}']
      ]))
    );
  }

  LP.ui.eventsReference = eventsReference;
})(window.LP);
