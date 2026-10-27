(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /*
   * The prompts an event can ask that aren't a row of buttons (see js/rules/turn/eventStage.js):
   *   number        how many (with a cost per unit)
   *   pickList      k picks from a list
   *   offer         one of a few random candidates, or decline
   *   alternatives  keep one of several rolled results
   *   recruit       open the Characters tab to see and accept a new character
   *
   *   LP.ui.promptPanel(pending, { onAnswer(value), onRecruit(pending) }) -> element
   * Plain choices (Yes/No, options, a question) are drawn by resultCard.js.
   */

  const KINDS = ['number', 'pickList', 'offer', 'alternatives', 'recruit'];

  function shell(pending, body) {
    return el('div', { class: 'choice', role: 'group', 'aria-label': pending.prompt },
      el('p', { class: 'choice-prompt' }, pending.prompt),
      body
    );
  }

  function numberPrompt(pending, opts) {
    const input = el('input', {
      class: 'input input-number', type: 'number', inputmode: 'numeric', min: String(pending.min), max: String(pending.max), 'data-focus': 'prompt-number',
      'aria-label': pending.prompt
    });
    input.value = String(pending.min);
    return shell(pending, el('div', { class: 'prompt-fields' },
      input,
      pending.per ? el('span', { class: 'prompt-cost' }, pending.per.amount + ' ' + (pending.per.key === 'credits' ? 'credits' : pending.per.key) + ' each, up to ' + pending.max) : el('span', { class: 'prompt-cost' }, 'Up to ' + pending.max),
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => opts.onAnswer(parseInt(input.value, 10)) }, 'Confirm')
    ));
  }

  function pickListPrompt(pending, opts) {
    const selects = [];
    for (let i = 0; i < pending.k; i++) {
      const select = el('select', { class: 'input select', 'aria-label': 'Pick ' + (i + 1), 'data-focus': 'prompt-pick:' + i },
        pending.options.map((o) => el('option', { value: o.value }, o.label)));
      select.selectedIndex = pending.repeats ? 0 : Math.min(i, pending.options.length - 1);
      selects.push(select);
    }
    return shell(pending, el('div', { class: 'prompt-fields' },
      selects,
      el('button', { type: 'button', class: 'btn btn-primary', onclick: () => opts.onAnswer(selects.map((s) => s.value)) }, 'Take these')
    ));
  }

  function radioPrompt(pending, opts, declineLabel) {
    const name = 'prompt-' + Math.random().toString(36).slice(2, 8);
    const rows = pending.options.map((o, i) => {
      const input = el('input', { type: 'radio', name: name, value: String(o.value), 'data-focus': 'prompt-radio:' + i });
      if (i === 0) input.checked = true;
      return { o, input, row: el('label', { class: 'prompt-option' }, input, el('span', null, o.label)) };
    });
    const chosen = () => {
      const hit = rows.find((r) => r.input.checked);
      return hit ? hit.o.value : null;
    };
    return shell(pending, el('div', null,
      el('div', { class: 'prompt-list' }, rows.map((r) => r.row)),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => opts.onAnswer(chosen()) }, 'Choose'),
        declineLabel ? el('button', { type: 'button', class: 'btn', onclick: () => opts.onAnswer(null) }, declineLabel) : null
      )
    ));
  }

  function recruitPrompt(pending, opts) {
    return shell(pending, el('div', { class: 'toolbar' },
      el('button', { type: 'button', class: 'btn btn-primary', 'data-focus': 'prompt-recruit', onclick: () => opts.onRecruit && opts.onRecruit(pending) }, 'Generate recruit'),
      el('button', { type: 'button', class: 'btn', onclick: () => opts.onAnswer({ accepted: false }) }, 'They don’t join')
    ));
  }

  function promptPanel(pending, options) {
    const opts = options || {};
    switch (pending.kind) {
      case 'number': return numberPrompt(pending, opts);
      case 'pickList': return pickListPrompt(pending, opts);
      case 'offer': return radioPrompt(pending, opts, pending.allowDecline ? 'No deal' : null);
      case 'alternatives': return radioPrompt(pending, opts, null);
      case 'recruit': return recruitPrompt(pending, opts);
      default: return null;
    }
  }

  promptPanel.KINDS = KINDS;
  LP.ui.promptPanel = promptPanel;
})(window.LP);
