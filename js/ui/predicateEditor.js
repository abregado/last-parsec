(function (LP) {
  'use strict';

  const { el } = LP.dom;
  const E = LP.events;
  const S = E.schema;

  /*
   * Edits a condition ("predicate"): a fact compared with a value, a variable, a question for the
   * player, or all / any / not of others.
   *   LP.ui.predicateEditor(predicate, ctx, set, path) -> element
   *     set(newValue) replaces the whole predicate (undefined removes it); ctx as in eventForm.js
   */

  const TYPES = [
    { value: 'fact', label: 'Something about the crew or ship' },
    { value: 'var', label: 'A variable' },
    { value: 'ask', label: 'Ask the player' },
    { value: 'all', label: 'All of these' },
    { value: 'any', label: 'Any of these' },
    { value: 'not', label: 'Not this' }
  ];

  const OPS = LP.predicate.OPS;

  function typeOf(p) {
    if (!p) return null;
    if (p.all) return 'all';
    if (p.any) return 'any';
    if (p.not) return 'not';
    if (p.ask !== undefined) return 'ask';
    if (p.var !== undefined) return 'var';
    return 'fact';
  }

  function blank(type) {
    switch (type) {
      case 'all': return { all: [{ fact: 'crew.count', gte: 1 }] };
      case 'any': return { any: [{ fact: 'crew.count', gte: 1 }] };
      case 'not': return { not: { fact: 'ship.hullDamaged' } };
      case 'ask': return { ask: 'Is it so?' };
      case 'var': return { var: '$roll', gte: 1 };
      default: return { fact: 'crew.count', gte: 1 };
    }
  }

  /** What a typed comparison value means: a number, true or false, a list (for "is one of"), or text. */
  function parseValue(text, op) {
    const t = String(text).trim();
    if (op === 'in') return t.split(',').map((x) => x.trim()).filter(Boolean).map(scalar);
    return scalar(t);
  }

  function scalar(t) {
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    return t;
  }

  function showValue(value) {
    return Array.isArray(value) ? value.join(', ') : String(value);
  }

  function select(options, current, onChange, focus, label) {
    const box = el('select', { class: 'input select', 'aria-label': label || null, 'data-focus': focus },
      options.map((o) => el('option', { value: o.value }, o.label)));
    box.value = current;
    box.addEventListener('change', () => onChange(box.value));
    return box;
  }

  function leaf(p, ctx, replace, path) {
    const facts = E.facts.list().map((d) => ({ value: d.id, label: d.id }));
    const def = p.fact !== undefined ? E.facts.get(p.fact) : null;
    const op = OPS.find((o) => p[o] !== undefined) || '';
    const set = (mutate) => { mutate(p); replace(p); };
    const parts = [];

    if (p.fact !== undefined) {
      parts.push(select(facts, p.fact, (v) => replace(Object.assign({ fact: v }, v === 'crew.count' ? { gte: 1 } : {})), path + ':fact', 'Fact'));
      if (def && def.entity) {
        const id = 'pv-' + Math.random().toString(36).slice(2, 7);
        const of = el('input', { class: 'input ef-short', type: 'text', placeholder: '$actor', list: id, 'aria-label': 'About', 'data-focus': path + ':of' });
        of.value = p.of || '';
        of.addEventListener('change', () => set((q) => { if (of.value.trim()) q.of = of.value.trim(); else delete q.of; }));
        parts.push(el('span', null, ' of ', of, el('datalist', { id: id }, ctx.variables().map((n) => el('option', { value: n })))));
      }
      for (const [key, spec] of Object.entries((def && def.params) || {})) {
        if (spec.type === 'enum') {
          parts.push(select(spec.options.map((o) => ({ value: o, label: o })), p[key] || spec.options[0], (v) => set((q) => { q[key] = v; }), path + ':' + key, key));
        } else {
          const box = el('input', { class: 'input ef-short', type: 'text', placeholder: key, 'aria-label': key, 'data-focus': path + ':' + key });
          box.value = p[key] === undefined ? '' : String(p[key]);
          box.addEventListener('change', () => set((q) => { if (box.value.trim()) q[key] = box.value.trim(); else delete q[key]; }));
          parts.push(box);
        }
      }
    } else {
      const id = 'pv-' + Math.random().toString(36).slice(2, 7);
      const box = el('input', { class: 'input ef-short', type: 'text', placeholder: '$roll', list: id, 'aria-label': 'Variable', 'data-focus': path + ':var' });
      box.value = p.var;
      box.addEventListener('change', () => set((q) => { q.var = box.value.trim() || '$roll'; }));
      parts.push(box, el('datalist', { id: id }, ctx.variables().map((n) => el('option', { value: n }))));
    }

    parts.push(select(S.OPERATORS, op, (v) => set((q) => {
      const old = OPS.find((o) => q[o] !== undefined);
      const value = old ? q[old] : 1;
      if (old) delete q[old];
      if (v) q[v] = v === 'in' ? [].concat(value) : (Array.isArray(value) ? value[0] : value);
    }), path + ':op', 'Compare'));
    if (op) {
      const box = el('input', { class: 'input ef-short', type: 'text', 'aria-label': 'Value', placeholder: op === 'in' ? 'a, b, c' : 'value', 'data-focus': path + ':value' });
      box.value = showValue(p[op]);
      box.addEventListener('change', () => set((q) => { q[op] = parseValue(box.value, op); }));
      parts.push(box);
    }
    return el('div', { class: 'pred-leaf' }, parts);
  }

  function node(p, ctx, replace, path, remove) {
    const type = typeOf(p);
    const header = select(TYPES, type, (v) => { replace(blank(v)); }, path + ':type', 'Kind of condition');
    const removeBtn = remove ? el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove condition', onclick: remove }, '✕') : null;
    let body;
    if (type === 'all' || type === 'any') {
      const list = p[type];
      body = el('div', { class: 'pred-children' },
        list.map((child, i) => node(child, ctx, (v) => { list[i] = v; replace(p); }, path + '.' + type + '[' + i + ']', () => { list.splice(i, 1); if (!list.length) replace(undefined); else replace(p); })),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => { list.push(blank('fact')); replace(p); } }, '+ Add a condition'));
    } else if (type === 'not') {
      body = el('div', { class: 'pred-children' }, node(p.not, ctx, (v) => { if (v === undefined) replace(undefined); else { p.not = v; replace(p); } }, path + '.not', null));
    } else if (type === 'ask') {
      const box = el('input', { class: 'input', type: 'text', 'aria-label': 'Question', 'data-focus': path + ':ask' });
      box.value = p.ask;
      box.addEventListener('change', () => { p.ask = box.value; replace(p); });
      body = el('div', { class: 'pred-leaf' }, box, el('span', { class: 'field-detail' }, 'The player answers Yes or No.'));
    } else {
      body = leaf(p, ctx, replace, path);
    }
    return el('div', { class: 'pred-node pred-' + type }, el('div', { class: 'pred-head' }, header, removeBtn), body);
  }

  function predicateEditor(predicate, ctx, set, path) {
    const where = (ctx.focus || 'ev') + ':' + path;
    if (!predicate) {
      return ctx.readOnly ? el('p', { class: 'field-detail' }, 'Always.')
        : el('div', { class: 'pred' }, el('button', { type: 'button', class: 'btn btn-sm', 'data-focus': where + ':add', onclick: () => set(blank('fact')) }, '+ Add a condition'));
    }
    if (ctx.readOnly) return el('p', { class: 'field-detail' }, S.describePredicate(predicate));
    return el('div', { class: 'pred' },
      node(predicate, ctx, set, where, () => set(undefined)),
      el('p', { class: 'field-detail' }, S.describePredicate(predicate)));
  }

  LP.ui.predicateEditor = predicateEditor;
})(window.LP);
