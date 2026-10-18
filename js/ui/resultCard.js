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

  function rollLine(line, opts) {
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
        children(line, opts)
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
      children(line, opts)
    );
  }

  function tableLine(line, opts) {
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
        el('span', { class: 'line-source' }, line.table),
        itemBadge(line, opts)
      ),
      line.text ? el('p', { class: 'line-text' }, line.text) : null,
      children(line, opts)
    );
  }

  function textLine(line, opts) {
    return el('div', { class: 'line line-text-only' + (line.tone ? ' tone-' + line.tone : '') },
      el('p', null, line.text),
      children(line, opts)
    );
  }

  function factsLine(line) {
    return el('dl', { class: 'line line-facts' },
      line.items.map(([label, value]) => el('div', null, el('dt', null, label), el('dd', null, value)))
    );
  }

  function children(line, opts) {
    if (!line.children || !line.children.length) return null;
    return el('div', { class: 'line-children' }, line.children.map((child) => renderLine(child, opts)));
  }

  function renderLine(line, opts) {
    switch (line.type) {
      case 'roll': return rollLine(line, opts);
      case 'table': return tableLine(line, opts);
      case 'facts': return factsLine(line);
      default: return textLine(line, opts);
    }
  }

  /** "→ Stash" for an item that went into the Stash; a button for one the player confirms. */
  function itemBadge(line, opts) {
    if (!line.item || !opts.crew) return null;
    if (line.item === 'stash') return el('span', { class: 'item-badge', title: line.itemSource || null }, '→ Stash');
    if (opts.isAdded && opts.isAdded(line)) return el('span', { class: 'item-badge', title: line.itemSource || null }, 'Added to Stash');
    if (!opts.onAddItem) return null;
    return el('button', {
      type: 'button', class: 'btn btn-sm item-add', title: 'Only if it applies: ' + (line.itemSource || ''),
      onclick: () => opts.onAddItem(line)
    }, '+ Stash');
  }

  /**
   * A stage's output. options.onChoose(value) is called when a pending
   * choice button is pressed. With options.crew, item lines show whether
   * they went into the Stash; conditional ones get a button calling
   * options.onAddItem(line) (options.isAdded(line) says if it was pressed).
   */
  function resultCard(output, pending, options) {
    const opts = options || {};
    return el('div', { class: 'result-card' + (output.tone ? ' tone-' + output.tone : '') },
      output.headline ? el('p', { class: 'result-headline' }, output.headline) : null,
      el('div', { class: 'result-lines' }, (output.lines || []).concat(output.fu ? output.fu.lines : []).map((line) => renderLine(line, opts))),
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
