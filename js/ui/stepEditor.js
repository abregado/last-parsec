(function (LP) {
  'use strict';

  const { el } = LP.dom;
  const E = LP.events;
  const S = E.schema;
  const F = LP.ui.eventForm;

  /*
   * The step list editor: one card per step with a one-line summary, and the step's fields when it
   * is open. Nested lists (Then, Otherwise, outcomes...) are the same editor again.
   *   LP.ui.stepList(steps, ctx, path) -> element      ctx is described in eventForm.js; ctx.readOnly shows summaries only
   */

  const open = new Set();

  function cardKey(ctx, path, i) {
    return (ctx.focus || 'ev') + ':' + path + '[' + i + ']';
  }

  function effectOptions() {
    return E.effects.list().filter((d) => !S.HIDDEN_EFFECTS.includes(d.id)).map((d) => ({ value: d.id, label: d.id })).sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Swap a step's contents for a new effect or prompt, keeping what can be kept. */
  function reshape(step, keep, make) {
    const saved = {};
    for (const k of keep) if (step[k] !== undefined) saved[k] = step[k];
    for (const k of Object.keys(step)) delete step[k];
    Object.assign(step, make, saved);
  }

  function kindFields(step, ctx, path) {
    const kind = S.kindOf(step);
    const head = [];
    if (kind.id === 'effect') {
      const select = el('select', { class: 'input select', 'aria-label': 'What changes', 'data-focus': (ctx.focus || 'ev') + ':' + path + ':effect' },
        effectOptions().map((o) => el('option', { value: o.value }, o.label)));
      select.value = step.effect;
      select.addEventListener('change', () => { reshape(step, ['say'], { effect: select.value }); ctx.save(); ctx.redraw(); });
      head.push(el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'What changes'), select));
    }
    if (kind.id === 'ask') {
      const select = el('select', { class: 'input select', 'aria-label': 'Kind of question', 'data-focus': (ctx.focus || 'ev') + ':' + path + ':ask' },
        S.PROMPTS.map((p) => el('option', { value: p.id }, p.label)));
      select.value = step.ask;
      select.addEventListener('change', () => {
        const fresh = { yesno: { yes: [], no: [] }, options: { options: [] }, number: { max: 3, steps: [] }, pickList: { k: 1, list: [] }, offer: { select: { from: 'items', offer: 2 }, chosen: [], declined: [] }, recruit: { accept: [], decline: [] } }[select.value];
        reshape(step, ['prompt'], Object.assign({ ask: select.value }, fresh));
        ctx.save();
        ctx.redraw();
      });
      head.push(el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Kind of question'), select));
    }
    return head.concat(S.fieldsFor(step).map((f) => F.fieldRow(f, step, ctx, path)));
  }

  function card(steps, i, ctx, path, attach) {
    const step = steps[i];
    const key = cardKey(ctx, path, i);
    const kind = S.kindOf(step);
    const isOpen = open.has(key);
    const problems = E.run.validateSteps([step], 'this step', ctx.validation ? ctx.validation() : {}).map((p) => p.replace(/^this step\[1\]:?\s*/, ''));
    const toggle = () => { if (isOpen) open.delete(key); else open.add(key); ctx.redraw(); };
    const move = (by) => {
      const j = i + by;
      if (j < 0 || j >= steps.length) return;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      if (attach) attach();
      ctx.save();
      ctx.redraw();
    };
    return el('div', { class: 'step-card' + (problems.length ? ' has-problem' : '') + (isOpen ? ' is-open' : ''), 'data-kind': kind ? kind.id : 'unknown' },
      el('div', { class: 'step-head' },
        el('button', {
          type: 'button', class: 'step-toggle', 'aria-expanded': isOpen ? 'true' : 'false', 'data-focus': key + ':toggle', onclick: toggle
        },
        el('span', { class: 'models-caret', 'aria-hidden': 'true' }, isOpen ? '▾' : '▸'),
        el('span', { class: 'step-kind' }, kind ? kind.label : 'Unknown'),
        el('span', { class: 'step-summary' }, S.describeStep(step))),
        ctx.readOnly ? null : el('span', { class: 'step-tools' },
          el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(-1) }, '↑'),
          el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Move down', disabled: i === steps.length - 1, onclick: () => move(1) }, '↓'),
          el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Delete step', onclick: () => { steps.splice(i, 1); if (attach) attach(); ctx.save(); ctx.redraw(); } }, '✕'))
      ),
      problems.length ? el('ul', { class: 'step-problems' }, problems.map((p) => el('li', null, p))) : null,
      isOpen && kind ? el('div', { class: 'step-body' }, kind.hint ? el('p', { class: 'field-detail' }, kind.hint) : null, kindFields(step, ctx, path + '[' + i + ']')) : null
    );
  }

  function stepList(steps, ctx, path, attach) {
    const add = ctx.readOnly ? null : el('select', { class: 'input select step-add', 'aria-label': 'Add a step', 'data-focus': (ctx.focus || 'ev') + ':' + path + ':add' },
      el('option', { value: '' }, '+ Add a step…'),
      S.STEP_KINDS.map((k) => el('option', { value: k.id, title: k.hint }, k.label)));
    if (add) {
      add.addEventListener('change', () => {
        const step = S.blank(add.value);
        if (!step) return;
        steps.push(step);
        if (attach) attach();
        open.add(cardKey(ctx, path, steps.length - 1));
        ctx.save();
        ctx.redraw();
      });
    }
    return el('div', { class: 'step-list' },
      steps.length ? steps.map((s, i) => card(steps, i, ctx, path, attach)) : el('p', { class: 'field-detail' }, ctx.readOnly ? 'No steps.' : 'No steps yet.'),
      add
    );
  }

  const SUB_LISTS = [['then', 'Then'], ['else', 'Otherwise'], ['pass', 'If it succeeds'], ['fail', 'If it fails'], ['yes', 'If Yes'], ['no', 'If No'],
    ['none', 'If none'], ['chosen', 'If chosen'], ['declined', 'If declined'], ['accept', 'If they join'], ['decline', 'If they don’t'], ['steps', 'Do']];

  /** A read-only outline of steps, with the steps inside them, for events that can't be edited. */
  function outline(steps) {
    return el('ul', { class: 'outline' }, (steps || []).map((step) => {
      const subs = [];
      for (const [key, label] of SUB_LISTS) {
        if (Array.isArray(step[key]) && step[key].length) subs.push(el('li', { class: 'outline-sub' }, el('span', { class: 'field-detail' }, label + ':'), outline(step[key])));
      }
      for (const key of ['outcomes', 'options', 'list']) {
        (Array.isArray(step[key]) ? step[key] : []).forEach((item) => {
          if (item.steps && item.steps.length) subs.push(el('li', { class: 'outline-sub' }, el('span', { class: 'field-detail' }, (item.label || item.text || item.range || (item.min !== undefined ? item.min + '+' : item.max !== undefined ? 'up to ' + item.max : item.natural !== undefined ? 'a ' + item.natural : key)) + ':'), outline(item.steps)));
        });
      }
      return el('li', null, S.describeStep(step), subs.length ? el('ul', { class: 'outline' }, subs) : null);
    }));
  }

  LP.ui.stepList = stepList;
  LP.ui.stepOutline = outline;
})(window.LP);
