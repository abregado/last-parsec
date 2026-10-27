(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /*
   * Form widgets for editing event data in place (steps, predicates, condition types).
   * Every widget edits a plain object through a dotted key ("cost.amount"), removing empty
   * values so the data stays tidy, and tells the editor to save. Text boxes update the data as you
   * type and save when you leave them; structural changes ask the editor to draw again.
   *
   *   ctx = { campaign, variables() -> ["$actor", ...], fragments() -> [ids], save(), redraw(), focus: 'prefix' }
   *
   *   F.fieldRow(field, obj, ctx, path) -> element   field is from js/rules/events/schema.js
   */

  function getPath(obj, key) {
    return key.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
  }

  function isEmpty(value) {
    return value === undefined || value === null || value === '' || value === false ||
      (Array.isArray(value) && !value.length) ||
      (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length);
  }

  /** Set a dotted key, or remove it (and parents left empty) when the value is empty. */
  function setPath(obj, key, value) {
    const parts = key.split('.');
    const chain = [obj];
    for (let i = 0; i < parts.length - 1; i++) {
      if (value !== undefined && (chain[i][parts[i]] === undefined || typeof chain[i][parts[i]] !== 'object')) chain[i][parts[i]] = {};
      if (chain[i][parts[i]] === undefined) return;
      chain.push(chain[i][parts[i]]);
    }
    const leaf = chain[chain.length - 1];
    if (isEmpty(value) && value !== 0) delete leaf[parts[parts.length - 1]];
    else leaf[parts[parts.length - 1]] = value;
    for (let i = parts.length - 2; i >= 0; i--) {
      if (isEmpty(chain[i][parts[i]]) && typeof chain[i][parts[i]] === 'object') delete chain[i][parts[i]];
    }
  }

  /** A number, dice or $variable typed by hand: whole numbers become numbers. */
  function toDice(text) {
    const t = String(text).trim();
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    return t;
  }

  function focusKey(ctx, path, key) {
    return (ctx.focus || 'ev') + ':' + path + ':' + key;
  }

  function label(field, input, hint) {
    return el('label', { class: 'field ef-field ef-' + field.type },
      el('span', { class: 'field-label' }, field.label),
      input,
      hint || field.hint ? el('span', { class: 'field-detail' }, hint || field.hint) : null
    );
  }

  /** A text-like input bound to obj[key]; convert(text) gives the stored value. */
  function textInput(field, obj, ctx, path, convert, extra) {
    const input = el('input', Object.assign({ class: 'input', type: 'text', autocomplete: 'off', 'data-focus': focusKey(ctx, path, field.key) }, extra));
    const current = getPath(obj, field.key);
    input.value = current === undefined || current === null ? '' : String(current);
    input.addEventListener('input', () => setPath(obj, field.key, convert ? convert(input.value) : input.value));
    input.addEventListener('change', () => { ctx.save(); ctx.redraw(); });
    return input;
  }

  function enumInput(field, obj, ctx, path) {
    const select = el('select', { class: 'input select', 'data-focus': focusKey(ctx, path, field.key) },
      field.options.map((o) => el('option', { value: String(o.value) }, o.label)));
    const current = getPath(obj, field.key);
    select.value = current === undefined || current === null ? '' : String(current);
    if (select.value !== (current === undefined || current === null ? '' : String(current)) && field.options.length) select.selectedIndex = 0;
    select.addEventListener('change', () => {
      setPath(obj, field.key, select.value);
      ctx.save();
      ctx.redraw();
    });
    return select;
  }

  function boolInput(field, obj, ctx, path) {
    const current = getPath(obj, field.key);
    const on = current === undefined ? field.defaultValue === true : !!current;
    const box = el('input', { type: 'checkbox', checked: on, 'data-focus': focusKey(ctx, path, field.key) });
    box.addEventListener('change', () => {
      if (field.defaultValue === true) setPath(obj, field.key, box.checked ? undefined : false);
      else setPath(obj, field.key, box.checked ? true : undefined);
      ctx.save();
      ctx.redraw();
    });
    return el('label', { class: 'multi-option ef-bool' }, box, el('span', null, field.label));
  }

  function varInput(field, obj, ctx, path) {
    const id = 'vars-' + Math.random().toString(36).slice(2, 8);
    const input = textInput(field, obj, ctx, path, (t) => t.trim(), { list: id, placeholder: field.hint || '$name' });
    const list = el('datalist', { id: id }, ctx.variables().map((n) => el('option', { value: n })));
    return el('span', { class: 'ef-var' }, input, list);
  }

  function nameInput(field, obj, ctx, path) {
    return textInput(field, obj, ctx, path, (t) => t.replace(/^\$/, '').replace(/[^\w]/g, ''), { placeholder: 'name' });
  }

  function tableInput(field, obj, ctx, path) {
    const id = 'tables-' + Math.random().toString(36).slice(2, 8);
    const names = ['travel', 'character', 'exploration', 'trade', 'campaign'].concat(Object.keys(LP.data.tables).filter((n) => LP.items.isItemTable(n) || /Loot|Subtable|Rewards|Table$/.test(n)).sort());
    const input = textInput(field, obj, ctx, path, (t) => t.trim(), { list: id, placeholder: 'Loot Table, trade…' });
    return el('span', { class: 'ef-var' }, input, el('datalist', { id: id }, names.map((n) => el('option', { value: n }))));
  }

  function fragmentInput(field, obj, ctx, path) {
    const options = [{ value: '', label: '—' }].concat(ctx.fragments().map((id) => ({ value: id, label: id })));
    return enumInput(Object.assign({}, field, { options: options }), obj, ctx, path);
  }

  /** Tick boxes for a list of strings: obj[key] is an array. */
  function multiInput(field, obj, ctx, path) {
    const current = getPath(obj, field.key) || [];
    return el('div', { class: 'check-grid' }, field.options.map((o) => {
      const box = el('input', { type: 'checkbox', checked: current.includes(o.value), 'data-focus': focusKey(ctx, path, field.key + o.value) });
      box.addEventListener('change', () => {
        const now = getPath(obj, field.key) || [];
        setPath(obj, field.key, box.checked ? now.concat(o.value) : now.filter((x) => x !== o.value));
        ctx.save();
        ctx.redraw();
      });
      return el('label', { class: 'multi-option', title: o.hint || null }, box, el('span', null, o.label));
    }));
  }

  /** A list of variable names, typed with commas. */
  function varListInput(field, obj, ctx, path) {
    const input = el('input', { class: 'input', type: 'text', placeholder: '$a, $b', 'data-focus': focusKey(ctx, path, field.key) });
    input.value = (getPath(obj, field.key) || []).join(', ');
    input.addEventListener('input', () => setPath(obj, field.key, input.value.split(',').map((t) => t.trim()).filter(Boolean)));
    input.addEventListener('change', () => { ctx.save(); ctx.redraw(); });
    return input;
  }

  /** Key and value rows for an object of settings (the params of a condition). */
  function pairsInput(field, obj, ctx, path) {
    const current = getPath(obj, field.key) || {};
    const rows = Object.entries(current).map(([k, val]) => {
      const keyBox = el('input', { class: 'input', type: 'text', value: k, 'aria-label': 'Name', 'data-focus': focusKey(ctx, path, field.key + ':k:' + k) });
      const valBox = el('input', { class: 'input', type: 'text', 'aria-label': 'Value', placeholder: '$variable or a number', 'data-focus': focusKey(ctx, path, field.key + ':v:' + k) });
      valBox.value = typeof val === 'object' ? JSON.stringify(val) : String(val);
      const commit = () => {
        const next = {};
        for (const [kk, vv] of Object.entries(getPath(obj, field.key) || {})) if (kk !== k) next[kk] = vv;
        if (keyBox.value.trim()) next[keyBox.value.trim()] = toDice(valBox.value);
        setPath(obj, field.key, next);
        ctx.save();
        ctx.redraw();
      };
      keyBox.addEventListener('change', commit);
      valBox.addEventListener('change', commit);
      return el('div', { class: 'ef-pair' }, keyBox, valBox,
        el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove', onclick: () => { const next = Object.assign({}, getPath(obj, field.key)); delete next[k]; setPath(obj, field.key, next); ctx.save(); ctx.redraw(); } }, '✕'));
    });
    return el('div', { class: 'ef-pairs' }, rows,
      el('button', {
        type: 'button', class: 'btn btn-sm',
        onclick: () => { const next = Object.assign({}, getPath(obj, field.key)); next['setting' + (Object.keys(next).length + 1)] = ''; setPath(obj, field.key, next); ctx.save(); ctx.redraw(); }
      }, '+ Add a setting'));
  }

  /** A list of small objects (options, outcomes, extra modifiers...). */
  function listInput(field, obj, ctx, path) {
    const list = getPath(obj, field.key) || [];
    return el('div', { class: 'ef-list' },
      list.map((item, i) => el('div', { class: 'ef-item' },
        el('div', { class: 'ef-item-tools' },
          el('strong', null, field.label.replace(/s$/, '') + ' ' + (i + 1)),
          el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove', onclick: () => { list.splice(i, 1); setPath(obj, field.key, list); ctx.save(); ctx.redraw(); } }, '✕')),
        field.item.map((f) => fieldRow(f, item, ctx, path + '.' + field.key + '[' + i + ']'))
      )),
      el('button', { type: 'button', class: 'btn btn-sm', onclick: () => { list.push({}); setPath(obj, field.key, list); ctx.save(); ctx.redraw(); } }, '+ Add ' + field.label.toLowerCase().replace(/s$/, ''))
    );
  }

  function fieldRow(field, obj, ctx, path) {
    switch (field.type) {
      case 'bool': return boolInput(field, obj, ctx, path);
      case 'enum': return label(field, enumInput(field, obj, ctx, path));
      case 'number': return label(field, textInput(field, obj, ctx, path, (t) => { const n = parseFloat(t); return isNaN(n) ? undefined : n; }, { inputmode: 'decimal', class: 'input input-number' }));
      case 'dice': return label(field, textInput(field, obj, ctx, path, toDice, { placeholder: '1D6, 2 or $name' }));
      case 'var': return label(field, varInput(field, obj, ctx, path));
      case 'name': return label(field, nameInput(field, obj, ctx, path));
      case 'table': return label(field, tableInput(field, obj, ctx, path));
      case 'fragment': return label(field, fragmentInput(field, obj, ctx, path));
      case 'multi': return label(field, multiInput(field, obj, ctx, path));
      case 'varlist': return label(field, varListInput(field, obj, ctx, path));
      case 'pairs': return label(field, pairsInput(field, obj, ctx, path));
      case 'list': return el('div', { class: 'ef-block' }, el('span', { class: 'field-label' }, field.label), listInput(field, obj, ctx, path));
      case 'steps': {
        const existing = getPath(obj, field.key);
        const steps = Array.isArray(existing) ? existing : [];
        // An empty list isn't stored; it is attached once a step is added, and dropped again when emptied.
        return el('div', { class: 'ef-block' }, el('span', { class: 'field-label' }, field.label), LP.ui.stepList(steps, ctx, path + '.' + field.key, () => setPath(obj, field.key, steps)));
      }
      case 'predicate': return el('div', { class: 'ef-block' }, el('span', { class: 'field-label' }, field.label),
        LP.ui.predicateEditor(getPath(obj, field.key), ctx, (value) => { setPath(obj, field.key, value); ctx.save(); ctx.redraw(); }, path + '.' + field.key));
      case 'selector': {
        const spec = getPath(obj, field.key) || {};
        return el('fieldset', { class: 'ef-selector' }, el('legend', null, field.label),
          LP.events.schema.SELECTOR_FIELDS.map((f) => (f.key === 'exclude' ? fieldRow(Object.assign({}, f, { type: 'varlist' }), spec, ctx, path + '.' + field.key) : fieldRow(f, spec, ctx, path + '.' + field.key))));
      }
      default: {
        const input = field.multiline
          ? el('textarea', { class: 'input', rows: '3', 'data-focus': focusKey(ctx, path, field.key) })
          : null;
        if (input) {
          input.value = getPath(obj, field.key) || '';
          input.addEventListener('input', () => setPath(obj, field.key, input.value));
          input.addEventListener('change', () => { ctx.save(); ctx.redraw(); });
          return label(field, input);
        }
        return label(field, textInput(field, obj, ctx, path));
      }
    }
  }

  LP.ui = LP.ui || {};
  LP.ui.eventForm = { getPath, setPath, fieldRow, isEmpty, toDice };
})(window.LP);
