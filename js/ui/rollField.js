(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /**
   * One row of the "dropdown + result + reroll" control used for every
   * rollable value (character fields, crew equipment, ship, flavour).
   *
   * options:
   *   id, focusKey     element id / key used to restore focus after redraws
   *   label            row label
   *   mode             'random' | 'fixed' | 'forced'
   *   valueText        display text of the current result ('' if none)
   *   detail           secondary line (effects etc.)
   *   lockedBy         text shown under a forced value ("Set by X")
   *   choices          [{ value, label, range }]  or, with `grouped`,
   *                    [{ label, options: [{ value, label }] }]
   *   grouped          choices are optgroups
   *   selected         current value as a string ('' = Random)
   *   showReroll       show the reroll button
   *   rerollEnabled    false disables it (no other result possible)
   *   onReroll()       reroll handler
   *   onSelect(value)  value is '' for Random, otherwise the option value string
   *   extra            node appended to the result cell
   *   isChild, flash   styling
   */
  function rollField(o) {
    let control;
    if (o.mode === 'forced') {
      control = el('div', { class: 'locked', id: o.id },
        el('span', { class: 'lock-icon', 'aria-hidden': 'true' }, '\u{1F512}'),
        el('span', null, o.valueText)
      );
    } else {
      control = el('select', { id: o.id, class: 'input select', 'data-focus': 'select:' + o.focusKey },
        el('option', { value: '' }, 'Random')
      );
      const addOption = (parent, choice) => {
        const value = String(choice.value);
        const text = choice.range ? choice.range + '  ' + choice.label : choice.label;
        parent.appendChild(el('option', { value: value, selected: value === o.selected }, text));
      };
      if (o.grouped) {
        for (const group of o.choices) {
          const optgroup = el('optgroup', { label: group.label });
          group.options.forEach((choice) => addOption(optgroup, choice));
          control.appendChild(optgroup);
        }
      } else {
        o.choices.forEach((choice) => addOption(control, choice));
      }
      control.value = o.selected;
      control.addEventListener('change', () => o.onSelect(control.value));
    }

    // Random rows show what was rolled; fixed/forced rows already show it in the control.
    const result = el('div', { class: 'field-result' },
      o.mode === 'random'
        ? el('span', { class: 'field-value' + (o.valueText ? '' : ' muted') }, o.valueText || 'Not rolled yet')
        : null,
      o.detail ? el('span', { class: 'field-detail' }, o.detail) : null,
      o.lockedBy ? el('span', { class: 'field-detail' }, o.lockedBy) : null,
      o.extra || null
    );

    const reroll = o.showReroll
      ? el('button', {
        type: 'button',
        class: 'btn btn-sm reroll',
        'data-focus': 'reroll:' + o.focusKey,
        'aria-label': 'Reroll ' + o.label,
        title: o.rerollEnabled ? 'Reroll ' + o.label : 'No other result possible',
        disabled: !o.rerollEnabled,
        onclick: o.onReroll
      }, '↻')
      : null;

    return el('li', { class: 'field-row' + (o.isChild ? ' child' : '') + (o.flash ? ' flash' : '') },
      el('label', { class: 'field-name', for: o.mode === 'forced' ? null : o.id }, o.label),
      el('div', { class: 'field-control' }, control),
      result,
      el('div', { class: 'field-reroll' }, reroll)
    );
  }

  LP.ui.rollField = rollField;
})(window.LP);
