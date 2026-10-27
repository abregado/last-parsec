(function (LP) {
  'use strict';

  const { el, clear } = LP.dom;
  const E = LP.events;
  const K = E.packs;

  // Per page visit: the actor chosen and the run in progress, for each event.
  const sessions = new Map();

  /** "Try it out": play the event against a copy of the campaign. Nothing is ever applied. */
  function eventTester(campaign, fullId) {
    const host = el('section', { class: 'panel ev-tester' });
    const key = campaign.id + '/' + fullId;
    const members = LP.roster.members(campaign);
    const session = sessions.get(key) || { actorId: members[0] ? members[0].id : null, state: null, error: null };
    sessions.set(key, session);

    function begin() {
      session.error = null;
      try {
        session.state = K.testStart(campaign, fullId, session.actorId);
      } catch (e) {
        session.state = null;
        session.error = e.message;
      }
      render();
    }

    function answer(value) {
      try {
        const result = K.testAnswer(campaign, session.state, fullId, session.actorId, value);
        if (result.error) LP.ui.notify(result.error, 'error');
      } catch (e) {
        session.error = e.message;
      }
      render();
    }

    function render() {
      clear(host);
      host.appendChild(el('h3', null, 'Try it out'));
      if (!members.length) {
        host.appendChild(el('p', { class: 'muted' }, 'Finalize a crew first: events play against your crew, on a copy, so nothing changes.'));
        return;
      }
      const actor = el('select', { class: 'input select', 'aria-label': 'The character it happens to', 'data-focus': 'tester-actor' },
        members.map((m) => el('option', { value: m.id }, LP.roster.nameOf(m))));
      actor.value = session.actorId;
      actor.addEventListener('change', () => { session.actorId = actor.value; });
      host.appendChild(el('div', { class: 'prompt-fields' },
        el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Happens to'), actor),
        el('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'tester-roll', onclick: begin }, session.state ? 'Roll again' : 'Roll it'),
        el('span', { class: 'field-detail' }, 'It plays on a copy of your campaign. Nothing is applied.')
      ));
      if (session.error) host.appendChild(el('p', { class: 'prompt-error' }, session.error));
      const state = session.state;
      if (!state) return;
      const pending = LP.turn.eventStage.pendingOf(state);
      host.appendChild(LP.ui.resultCard(
        { headline: (state.lines.find((l) => l.type === 'table') || {}).title || 'Result', lines: [], run: state },
        pending,
        {
          onChoose: answer,
          onRecruit: () => answer({
            accepted: true,
            member: { id: 'test-recruit', name: 'Test recruit', speciesId: 'baseline-human', profile: { reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 0, luck: 0 } },
            items: []
          })
        }
      ));
      if (!pending && state.ops.length) {
        let lines = [];
        try { lines = E.ledger.preview(campaign, state.ops); } catch (e) { session.error = e.message; }
        host.appendChild(el('div', { class: 'ledger' },
          el('h4', { class: 'ledger-title' }, 'What would happen'),
          el('ul', { class: 'ledger-list' }, lines.map((l) => el('li', { class: l.destructive ? 'ledger-destructive' : null }, l.text)))));
      } else if (!pending) {
        host.appendChild(el('p', { class: 'muted' }, 'Nothing would change.'));
      }
    }

    render();
    return host;
  }

  LP.ui.eventTester = eventTester;
})(window.LP);
