(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /**
   * Open a modal dialog. Resolves to { value, text, fields } where `value` is
   * the clicked choice's value ('' when cancelled), `text` the text input's
   * contents, and `fields` the select values keyed by field key.
   *
   * options.fields: [{ key, label, value, options: [{ value, label }] }]
   *
   * The first choice is the default (pressing Enter picks it), so put the
   * safest/most likely choice first.
   */
  function openDialog(options) {
    return new Promise((resolve) => {
      let input = null;

      const choiceButtons = options.choices.map((choice) =>
        el('button', {
          type: 'submit',
          value: choice.value,
          class: 'btn ' + (choice.danger ? 'btn-danger btn-solid' : 'btn-primary')
        }, choice.label)
      );

      if (options.input) {
        input = el('input', {
          class: 'input',
          type: 'text',
          maxlength: '80',
          required: true,
          autocomplete: 'off'
        });
        input.value = options.input.value || '';
      }

      const selects = (options.fields || []).map((field) => {
        const select = el('select', { class: 'input select' },
          field.options.map((o) => el('option', { value: String(o.value) }, o.label))
        );
        select.value = String(field.value);
        return { field, select };
      });

      const form = el('form', { class: 'dialog-form', method: 'dialog' },
        el('h2', { id: 'dialog-title', text: options.title }),
        options.message ? el('p', { class: 'dialog-message', text: options.message }) : null,
        input ? el('label', { class: 'field' },
          el('span', { class: 'field-label', text: options.input.label }),
          input
        ) : null,
        selects.map(({ field, select }) => el('label', { class: 'field' },
          el('span', { class: 'field-label', text: field.label }),
          select
        )),
        el('div', { class: 'dialog-actions' },
          el('button', { type: 'button', class: 'btn', onclick: () => close('') }, 'Cancel'),
          choiceButtons
        )
      );

      const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': 'dialog-title' }, form);

      let result = '';
      function close(value) {
        result = value;
        dialog.close();
      }

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (input && !input.value.trim()) {
          input.focus();
          return;
        }
        const submitter = event.submitter || choiceButtons[0];
        close(submitter.value);
      });

      dialog.addEventListener('close', () => {
        dialog.remove();
        const fields = {};
        for (const { field, select } of selects) fields[field.key] = select.value;
        resolve({ value: result, text: input ? input.value.trim() : '', fields });
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      if (input) {
        input.focus();
        input.select();
      } else if (selects.length) {
        selects[0].select.focus();
      }
    });
  }

  /** Text prompt; resolves to the trimmed text, or null if cancelled. */
  async function prompt({ title, label, value, confirmLabel }) {
    const result = await openDialog({
      title,
      input: { label, value },
      choices: [{ label: confirmLabel || 'OK', value: 'ok' }]
    });
    return result.value === 'ok' ? result.text : null;
  }

  /** Yes/no confirmation; resolves to a boolean. */
  async function confirm({ title, message, confirmLabel, danger }) {
    const result = await openDialog({
      title,
      message,
      choices: [{ label: confirmLabel || 'OK', value: 'ok', danger }]
    });
    return result.value === 'ok';
  }

  /** Pick one of several choices; resolves to its value, or null if cancelled. */
  async function choose({ title, message, choices }) {
    const result = await openDialog({ title, message, choices });
    return result.value || null;
  }

  /** Form of dropdowns; resolves to { key: valueString } or null if cancelled. */
  async function form({ title, message, fields, confirmLabel }) {
    const result = await openDialog({
      title,
      message,
      fields,
      choices: [{ label: confirmLabel || 'Save', value: 'ok' }]
    });
    return result.value === 'ok' ? result.fields : null;
  }

  Object.assign(LP.ui, { prompt, confirm, choose, form });
})(window.LP);
