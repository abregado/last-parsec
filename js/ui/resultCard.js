(function (LP) {
  'use strict';

  const { el } = LP.dom;

  function signed(n) {
    return n >= 0 ? '+' + n : '−' + Math.abs(n);
  }

  function verdict(line) {
    if (line.success === undefined) return null;
    const good = line.invert ? !line.success : line.success;
    return el('span', { class: 'verdict ' + (good ? 'pass' : 'fail') },
      line.success ? '✓' : '✗',
      line.target !== undefined ? ' needs ' + line.target + '+' : ''
    );
  }

  function rollLine(line) {
    // "2D6: 3 + 5 +1 Decoys = 9"; the notation's own modifier (1D6 +20) shows as a plain number.
    const diceSum = line.dice.reduce((a, b) => a + b, 0);
    const flat = line.base - diceSum;
    const modifiers = line.modifiers || [];
    if (line.keep === 'highest') {
      return el('div', { class: 'line line-roll' + (line.tone ? ' tone-' + line.tone : '') },
        el('div', { class: 'line-head' },
          line.label ? el('span', { class: 'line-label' }, line.label) : null,
          el('span', { class: 'dice' }, line.notation + ': ' + line.dice.join(', ') + ' → highest ', el('strong', null, String(line.total))),
          verdict(line)
        ),
        line.text ? el('p', { class: 'line-text' }, line.text) : null,
        children(line)
      );
    }
    const parts = [line.notation + ': ' + (line.dice.length ? line.dice.join(' + ') : String(line.base))];
    if (flat && line.dice.length) parts.push(' ' + signed(flat));
    for (const m of modifiers) parts.push(' ' + signed(m.value) + ' ' + m.label);
    const showTotal = line.dice.length > 1 || flat !== 0 || modifiers.length > 0;
    return el('div', { class: 'line line-roll' + (line.tone ? ' tone-' + line.tone : '') },
      el('div', { class: 'line-head' },
        line.label ? el('span', { class: 'line-label' }, line.label) : null,
        el('span', { class: 'dice' }, parts.join(''), showTotal ? ' = ' : '', showTotal ? el('strong', null, String(line.total)) : null),
        verdict(line)
      ),
      line.text ? el('p', { class: 'line-text' }, line.text) : null,
      children(line)
    );
  }

  function tableLine(line) {
    let dice = null;
    if (line.natural !== null && line.natural !== undefined) {
      const roll = line.modifier ? line.natural + ' ' + signed(line.modifier) + ' = ' + line.total : String(line.natural);
      dice = el('span', { class: 'dice' }, line.die + ': ' + roll);
    }
    return el('div', { class: 'line line-table' },
      el('div', { class: 'line-head' },
        line.label ? el('span', { class: 'line-label' }, line.label) : null,
        dice,
        el('strong', { class: 'line-title' }, line.title),
        el('span', { class: 'line-source' }, line.table)
      ),
      line.text ? el('p', { class: 'line-text' }, line.text) : null,
      children(line)
    );
  }

  function textLine(line) {
    return el('div', { class: 'line line-text-only' + (line.tone ? ' tone-' + line.tone : '') },
      el('p', null, line.text),
      children(line)
    );
  }

  function factsLine(line) {
    return el('dl', { class: 'line line-facts' },
      line.items.map(([label, value]) => el('div', null, el('dt', null, label), el('dd', null, value)))
    );
  }

  function children(line) {
    if (!line.children || !line.children.length) return null;
    return el('div', { class: 'line-children' }, line.children.map(renderLine));
  }

  function renderLine(line) {
    switch (line.type) {
      case 'roll': return rollLine(line);
      case 'table': return tableLine(line);
      case 'facts': return factsLine(line);
      default: return textLine(line);
    }
  }

  /**
   * A stage's output. options.onChoose(value) is called when a pending
   * choice button is pressed.
   */
  function resultCard(output, pending, options) {
    const opts = options || {};
    return el('div', { class: 'result-card' + (output.tone ? ' tone-' + output.tone : '') },
      output.headline ? el('p', { class: 'result-headline' }, output.headline) : null,
      el('div', { class: 'result-lines' }, (output.lines || []).concat(output.fu ? output.fu.lines : []).map(renderLine)),
      pending
        ? el('div', { class: 'choice', role: 'group', 'aria-label': pending.prompt },
          el('p', { class: 'choice-prompt' }, pending.prompt),
          el('div', { class: 'toolbar' },
            pending.options.map((o, i) => el('button', {
              type: 'button',
              class: 'btn ' + (i === 0 ? 'btn-primary' : ''),
              'data-focus': 'choice:' + o.value,
              onclick: () => opts.onChoose && opts.onChoose(o.value)
            }, o.label))
          )
        )
        : null
    );
  }

  LP.ui.resultCard = resultCard;
})(window.LP);
