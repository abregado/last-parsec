(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /*
   * Renders a stage's input fields as a form.
   *
   * Field: { key, type, label, help?, value, showIf?(values) }
   *   type 'number'      min, max
   *   type 'yesno'       value true/false
   *   type 'select'      options: [{ value, label }]
   *   type 'multiselect' options: [{ value, label, hint? }], value: [..]
   *   type 'info'        text (no value)
   *   type 'text'        free text; placeholder
   *   type 'tasks'       tasks: [{ key, label, hint? }], perTask (max per task),
   *                      total (crew available), value: { taskKey: count }
   *
   * onSubmit(values) receives only the visible fields' values and returns an
   * error message (shown under the form) or nothing.
   */
  function stageForm(fields, options) {
    const opts = options || {};
    const idBase = opts.idBase || 'stage';
    const values = {};
    const wrappers = [];

    for (const field of fields) {
      if (field.type !== 'info') values[field.key] = field.value;
    }

    const errorBox = el('p', { class: 'form-error', role: 'alert', hidden: true });

    function refreshVisibility() {
      for (const { field, node } of wrappers) {
        node.hidden = field.showIf ? !field.showIf(values) : false;
      }
    }

    function control(field) {
      const id = idBase + '-' + field.key;
      switch (field.type) {
        case 'info':
          return el('p', { class: 'stage-info' }, field.text);

        case 'number': {
          const input = el('input', {
            id: id, class: 'input input-number', type: 'number', inputmode: 'numeric',
            min: field.min !== undefined ? String(field.min) : null,
            max: field.max !== undefined ? String(field.max) : null,
            'data-focus': 'field:' + field.key
          });
          input.value = field.value === null || field.value === undefined ? '' : String(field.value);
          input.addEventListener('input', () => {
            const n = parseInt(input.value, 10);
            values[field.key] = isNaN(n) ? null : n;
            refreshVisibility();
          });
          return labelled(field, id, input);
        }

        case 'text': {
          const input = el('input', { id: id, class: 'input', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: field.placeholder || null, 'data-focus': 'field:' + field.key });
          input.value = field.value || '';
          input.addEventListener('input', () => {
            values[field.key] = input.value;
            refreshVisibility();
          });
          return labelled(field, id, input);
        }

        case 'yesno': {
          const name = id;
          const make = (val, text) => {
            const radio = el('input', { type: 'radio', name: name, value: val ? 'yes' : 'no', checked: values[field.key] === val, 'data-focus': 'field:' + field.key + ':' + text });
            radio.addEventListener('change', () => {
              values[field.key] = val;
              refreshVisibility();
            });
            return el('label', { class: 'segment' }, radio, el('span', null, text));
          };
          return el('fieldset', { class: 'field stage-field' },
            el('legend', { class: 'field-label' }, field.label),
            el('div', { class: 'segmented' }, make(true, 'Yes'), make(false, 'No')),
            field.help ? el('span', { class: 'field-detail' }, field.help) : null
          );
        }

        case 'select': {
          const select = el('select', { id: id, class: 'input select', 'data-focus': 'field:' + field.key },
            field.options.map((o) => el('option', { value: String(o.value) }, o.label))
          );
          select.value = String(field.value);
          select.addEventListener('change', () => {
            values[field.key] = select.value;
            refreshVisibility();
          });
          return labelled(field, id, select);
        }

        case 'multiselect': {
          const selected = new Set(field.value || []);
          const summary = el('summary', null);
          const updateSummary = () => {
            const names = field.options.filter((o) => selected.has(o.value)).map((o) => o.label);
            summary.textContent = names.length ? names.join(', ') : 'None selected';
          };
          const boxes = field.options.map((o) => {
            const box = el('input', { type: 'checkbox', checked: selected.has(o.value) });
            box.addEventListener('change', () => {
              if (box.checked) selected.add(o.value);
              else selected.delete(o.value);
              values[field.key] = field.options.map((x) => x.value).filter((v) => selected.has(v));
              updateSummary();
              refreshVisibility();
            });
            return el('label', { class: 'multi-option', title: o.hint || null },
              box,
              el('span', null, el('strong', null, o.label), o.hint ? el('span', { class: 'field-detail' }, ' ' + o.hint) : null)
            );
          });
          updateSummary();
          return el('div', { class: 'field stage-field' },
            el('span', { class: 'field-label' }, field.label),
            el('details', { class: 'multi-select', 'data-focus': 'field:' + field.key }, summary, el('div', { class: 'multi-options' }, boxes)),
            field.help ? el('span', { class: 'field-detail' }, field.help) : null
          );
        }

        case 'tasks': {
          const counts = Object.assign({}, field.value || {});
          values[field.key] = counts;
          const status = el('span', { class: 'field-detail task-total' });
          const updateStatus = () => {
            const used = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
            status.textContent = used + ' of ' + field.total + ' crew assigned' + (used > field.total ? ': too many!' : '');
            status.classList.toggle('over', used > field.total);
          };
          const rows = field.tasks.map((task) => {
            const inputId = id + '-' + task.key;
            const input = el('input', {
              id: inputId, class: 'input input-number task-count', type: 'number', inputmode: 'numeric',
              min: '0', max: String(field.perTask), 'data-focus': 'field:' + field.key + ':' + task.key
            });
            input.value = String(counts[task.key] || 0);
            input.addEventListener('input', () => {
              const n = parseInt(input.value, 10);
              counts[task.key] = isNaN(n) ? 0 : Math.max(0, n);
              updateStatus();
              refreshVisibility();
            });
            return el('div', { class: 'task-row' },
              el('label', { for: inputId, class: 'task-label' }, el('strong', null, task.label), task.hint ? el('span', { class: 'field-detail' }, task.hint) : null),
              input
            );
          });
          updateStatus();
          return el('fieldset', { class: 'field stage-field' },
            el('legend', { class: 'field-label' }, field.label),
            field.help ? el('span', { class: 'field-detail' }, field.help) : null,
            el('div', { class: 'task-grid' }, rows),
            status
          );
        }

        default:
          return el('p', { class: 'form-error' }, 'Unknown field type: ' + field.type);
      }
    }

    function labelled(field, id, input) {
      return el('div', { class: 'field stage-field' },
        el('label', { class: 'field-label', for: id }, field.label),
        input,
        field.help ? el('span', { class: 'field-detail' }, field.help) : null
      );
    }

    const form = el('form', { class: 'stage-form', novalidate: true });
    for (const field of fields) {
      const node = el('div', { class: 'stage-field-wrap' }, control(field));
      wrappers.push({ field, node });
      form.appendChild(node);
    }
    form.appendChild(errorBox);
    form.appendChild(el('div', { class: 'stage-actions' },
      el('button', { type: 'submit', class: 'btn btn-primary', 'data-focus': 'confirm' }, opts.submitLabel || 'Confirm')
    ));
    refreshVisibility();

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const visible = {};
      for (const { field, node } of wrappers) {
        if (node.hidden || field.type === 'info') continue;
        const v = values[field.key];
        if (field.type === 'number') {
          if (v === null || v === undefined) return showError(field.label + ': enter a number.');
          if (field.min !== undefined && v < field.min) return showError(field.label + ': at least ' + field.min + '.');
          if (field.max !== undefined && v > field.max) return showError(field.label + ': at most ' + field.max + '.');
        }
        if (field.type === 'tasks') {
          const used = Object.values(v).reduce((a, b) => a + (b || 0), 0);
          const over = field.tasks.find((t) => (v[t.key] || 0) > field.perTask);
          if (over) return showError(over.label + ': at most ' + field.perTask + ' crew per task.');
          if (used > field.total) return showError('Only ' + field.total + ' crew are available for tasks.');
        }
        visible[field.key] = v;
      }
      const error = opts.onSubmit ? opts.onSubmit(visible) : null;
      if (error) showError(error);
    });

    function showError(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }

    return form;
  }

  LP.ui.stageForm = stageForm;
})(window.LP);
