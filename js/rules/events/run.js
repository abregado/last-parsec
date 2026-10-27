(function (LP) {
  'use strict';

  /*
   * The event runner: plays an event's steps, planning every change as an op
   * (see effects.js) without touching the campaign. The player reads the ledger
   * and presses Apply; js/rules/events/ledger.js commits the ops.
   *
   * state is plain JSON, so a run paused on a prompt survives a reload:
   *   { vars, ops, lines, stack: [{ steps, path, table?, event?, fallback?, depth }],
   *     pending: null | prompt, answers: { question: bool }, done }
   * env (given on every call, not stored):
   *   { packs: [pack], disabled: [packId:eventId], allowed?: (fullId) -> bool,
   *     turn: { casualtyIds, mission }, vars: { actor: ref }, followup: env for roll tables }
   *
   * Steps (one kind per object):
   *   { roll: '1D6', as?, label?, add?: [{ label, value }], target?, keep?: 'highest',
   *     outcomes?: [{ natural | range | min/max, steps?, text?, tone? }], pass?: [steps], fail?: [steps] }
   *   { select: selector, as, label?, required?, list? }      pick people or things (selectors.js); list: $as is a list even for one
   *   { if: predicate, then?: [steps], else?: [steps] }
   *   { ask: 'yesno' | 'options' | 'number' | 'pickList' | 'offer' | 'recruit', prompt, ... }   pauses
   *   { table: 'character' | 'Loot Table', as?, label?, actor? }   an event table, or a roll table;
   *                                 actor: '$who' makes that person $actor for the event it starts
   *   { again: true }              roll again on the table of the event being played
   *   { rollGroup: 'escape-pod' }   { call: 'fragment' }   { alternatives: { n, table } }
   *   { forEach: '$who', steps }   { repeat: { times } | { max, until }, steps }
   *   { group: 'Trade: Ava', actor?: '$who', steps }   a heading over steps, optionally about someone else
   *   { effect: 'xp', ...settings, say? }   { say: 'text {actor}', tone? }   { manual: 'text' }
   * A step that has nobody to act on (a missing $variable) is skipped.
   */

  const E = LP.events;
  const MAX_DEPTH = 8;
  const EVENT_TABLES = ['travel', 'character', 'exploration', 'trade', 'campaign'];
  const TABLE_LABELS = { travel: 'Starship Travel Events', character: 'Character Events', exploration: 'Exploration', trade: 'Trade', campaign: 'Campaign Events' };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /* ---------------------------------------------------------------------- */
  /* Runtime: the state plus a preview campaign that already has the ops    */
  /* ---------------------------------------------------------------------- */

  function runtime(campaign, state, env) {
    const view = LP.snapshot.scratch(campaign);
    E.ledger.commit(view, state.ops);
    const rt = { state, env, view, scope: null };
    rt.scope = E.makeScope(view, { vars: state.vars, answers: state.answers, turn: env.turn || {} });
    return rt;
  }

  function container(state, path) {
    let list = state.lines;
    for (const index of path) {
      const line = list[index];
      if (!line.children) line.children = [];
      list = line.children;
    }
    return list;
  }

  function append(rt, path, line) {
    const list = container(rt.state, path);
    list.push(line);
    return path.concat(list.length - 1);
  }

  function text(t, tone) {
    return tone ? { type: 'text', text: t, tone: tone } : { type: 'text', text: t };
  }

  function push(rt, steps, path, extra) {
    if (steps && steps.length) rt.state.stack.push(Object.assign({ steps: clone(steps), path: path }, extra));
  }

  function nameOf(rt, value) {
    if (E.isRef(value)) return E.nameOfRef(rt.view, value);
    return String(value);
  }

  /** "{actor} gets {roll}": variables in text. */
  function fmt(rt, template) {
    return String(template).replace(/\{([\w.]+)\}/g, (match, path) => {
      const parts = path.split('.');
      if (!(parts[0] in rt.state.vars)) return match;
      const base = rt.state.vars[parts[0]];
      if (parts.length === 1) {
        if (Array.isArray(base)) return base.map((v) => nameOf(rt, v)).join(', ');
        if (base && typeof base === 'object' && 'total' in base) return String(base.total);
        return nameOf(rt, base);
      }
      const value = rt.scope.resolve('$' + path);
      return value === undefined || value === null ? match : String(value);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Dice                                                                   */
  /* ---------------------------------------------------------------------- */

  function substitute(rt, notation) {
    return String(notation).replace(/\$[A-Za-z_][\w.]*/g, (m) => String(Number(rt.scope.resolve(m)))).replace(/\+\s*-/g, '-');
  }

  /** A number, or dice rolled now (a roll line is added to `lines`). */
  function amountOf(rt, value, label, lines) {
    if (typeof value === 'number') return value;
    let expr = substitute(rt, value).trim();
    let sign = 1;
    if (expr.charAt(0) === '-') { sign = -1; expr = expr.slice(1); }
    if (/^\d+$/.test(expr)) return sign * Number(expr);
    const r = LP.rng.roll(expr);
    lines.push({ type: 'roll', label: label || '', notation: (sign < 0 ? '-' : '') + r.notation, dice: r.dice, base: sign * r.total, modifiers: [], total: sign * r.total });
    return sign * r.total;
  }

  function inRange(total, outcome, natural) {
    if (outcome.natural !== undefined) return natural === outcome.natural;
    if (outcome.range !== undefined) {
      const r = LP.rng.parseRange(outcome.range);
      return !!r && total >= r.min && total <= r.max;
    }
    const min = outcome.min !== undefined ? outcome.min : -Infinity;
    const max = outcome.max !== undefined ? outcome.max : Infinity;
    return total >= min && total <= max;
  }

  /* ---------------------------------------------------------------------- */
  /* Events                                                                 */
  /* ---------------------------------------------------------------------- */

  function candidates(rt, filter) {
    const out = [];
    for (const pack of rt.env.packs || []) {
      for (const ev of pack.events || []) {
        if (!filter(ev)) continue;
        const full = pack.pack.id + ':' + ev.id;
        if ((rt.env.disabled || []).includes(full)) continue;
        if (rt.env.allowed && !rt.env.allowed(full)) continue;
        if (ev.requires) {
          let ok;
          try { ok = LP.predicate.evaluate(ev.requires, rt.scope); } catch (e) { ok = false; }
          if (!ok) continue;
        }
        out.push({ id: full, weight: ev.weight, event: ev });
      }
    }
    return out;
  }

  function startEvent(rt, frame, picked, tableKey) {
    const ev = picked.event;
    const line = { type: 'table', table: TABLE_LABELS[ev.table] || tableKey, die: null, natural: null, rowId: picked.id, title: ev.title, text: ev.text || '' };
    const path = append(rt, frame.path, line);
    push(rt, ev.steps, path, { event: picked.id, fallback: ev.fallback || null, table: ev.table, depth: (frame.depth || 0) + 1 });
  }

  function rollEventTable(rt, frame, tableKey) {
    if ((frame.depth || 0) >= MAX_DEPTH) {
      append(rt, frame.path, text('Stopped: too many events in a row.', 'note'));
      return;
    }
    const picked = LP.rng.weightedPick(candidates(rt, (ev) => ev.table === tableKey));
    if (!picked) {
      append(rt, frame.path, text('No ' + (TABLE_LABELS[tableKey] || tableKey) + ' event can happen right now.', 'note'));
      return;
    }
    startEvent(rt, frame, picked, tableKey);
  }

  /** Give up on the event this frame belongs to and run its fallback instead. */
  function impossible(rt) {
    const stack = rt.state.stack;
    while (stack.length) {
      const frame = stack.pop();
      if (frame.event) {
        push(rt, frame.fallback && frame.fallback.length ? frame.fallback : [{ say: 'Nothing comes of it.' }], frame.path, { depth: frame.depth });
        return;
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Prompts                                                                */
  /* ---------------------------------------------------------------------- */

  function pause(rt, frame, step, prompt) {
    rt.state.pending = Object.assign({ step: step, path: frame.path, depth: frame.depth || 0 }, prompt);
  }

  /** Evaluate a condition, first asking any Yes/No it needs. Returns undefined while paused. */
  function evaluate(rt, frame, step, tree) {
    for (const question of LP.predicate.asks(tree)) {
      if (!(question in rt.state.answers)) {
        frame.steps.unshift(step);
        pause(rt, frame, step, { kind: 'question', prompt: question, question: question, options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] });
        return undefined;
      }
    }
    return LP.predicate.evaluate(tree, rt.scope);
  }

  function labelOf(rt, ref) {
    const p = rt.scope.props(ref);
    if (ref.ref === 'item') return p.name + (p.damaged ? ' (damaged)' : '') + (p.carrierId ? ', carried by ' + E.nameOfRef(rt.view, { ref: 'member', id: p.carrierId }) : ', in the Stash');
    return p.name;
  }

  function ask(rt, frame, step) {
    switch (step.ask) {
      case 'yesno': {
        const cost = step.cost ? amountOf(rt, step.cost.amount, '', []) : 0;
        const have = step.cost ? (rt.view.roster.resources[step.cost.key] || 0) : 0;
        pause(rt, frame, step, {
          kind: 'yesno', prompt: step.prompt, cost: step.cost ? { key: step.cost.key, amount: cost } : null,
          options: [{ value: true, label: step.yesLabel || 'Yes', disabled: step.cost ? have < cost : false }, { value: false, label: step.noLabel || 'No' }]
        });
        return;
      }
      case 'options':
        pause(rt, frame, step, { kind: 'options', prompt: step.prompt, options: step.options.map((o) => ({ value: o.value, label: o.label })) });
        return;
      case 'number': {
        let max = step.max;
        if (step.per) max = Math.min(max, Math.floor((rt.view.roster.resources[step.per.key] || 0) / step.per.amount));
        pause(rt, frame, step, { kind: 'number', prompt: step.prompt, min: step.min || 0, max: Math.max(step.min || 0, max), per: step.per || null });
        return;
      }
      case 'pickList':
        pause(rt, frame, step, {
          kind: 'pickList', prompt: step.prompt, k: step.k || 1, repeats: !!step.repeats,
          options: step.list.map((o) => ({ value: o.value, label: o.label }))
        });
        return;
      case 'offer': {
        const picked = E.select(Object.assign({}, step.select, { offer: step.select.offer || 2 }), rt.scope);
        if (!picked.refs.length) {
          if (step.required) impossible(rt);
          else push(rt, step.empty || [], frame.path, { depth: frame.depth });
          return;
        }
        pause(rt, frame, step, {
          kind: 'offer', prompt: step.prompt, allowDecline: step.allowDecline !== false, refs: picked.refs,
          options: picked.refs.map((ref) => ({ value: ref.id, label: labelOf(rt, ref) }))
        });
        return;
      }
      case 'recruit':
        pause(rt, frame, step, { kind: 'recruit', prompt: step.prompt || 'A new character wants to join.', variant: step.variant || {}, allowDecline: true });
        return;
      default:
        throw new Error('Unknown prompt ' + step.ask);
    }
  }

  /** The prompt the run is waiting on, or null. */
  function prompt(state) {
    return state.pending;
  }

  /** "Gained on Ruhr during a campaign event on turn 4." for items an event hands out. */
  function itemSource(rt) {
    const planet = rt.view.planets && LP.planets ? LP.planets.current(rt.view) : null;
    return LP.items.sourceText(rt.env.source || 'an event', planet ? planet.name : null, LP.roster.turnNumber(rt.view));
  }

  function emit(rt, path, result) {
    for (const line of result.lines || []) append(rt, path, line);
    for (const op of result.ops || []) {
      if (op.effect === 'item.add' && !op.item.source) op.item.source = itemSource(rt);
      rt.state.ops.push(op);
      E.ledger.commit(rt.view, [op]);
      fireHooks(rt, path, op);
    }
    if (result.vars) Object.assign(rt.state.vars, result.vars);
  }

  /** An 'any' setting with its $variables filled in (objects and lists are searched). */
  function deepResolve(rt, value) {
    if (typeof value === 'string') {
      let found;
      try { found = rt.scope.raw(value); } catch (e) { return undefined; }
      return found && typeof found === 'object' && 'total' in found && 'natural' in found ? found.total : found;
    }
    if (Array.isArray(value)) return value.map((v) => deepResolve(rt, v));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = deepResolve(rt, v);
      return out;
    }
    return value;
  }

  // Effects that tell conditions something happened ("a Rival was gained").
  const FIRES = {
    'rival.add': (op) => ({ trigger: 'rivalGained', vars: { rival: { ref: 'rival', id: op.contact.id } } }),
    'condition.add': (op) => (op.condition.type === 'on-quest' ? { trigger: 'questGained', vars: {} } : null)
  };

  function fireHooks(rt, path, op) {
    const fire = FIRES[op.effect] && FIRES[op.effect](op);
    if (!fire) return;
    const hooks = LP.conditions.run(rt.view, fire.trigger, {}, { vars: fire.vars, turn: rt.env.turn || {} });
    for (const line of hooks.lines) append(rt, path, line);
    for (const o of hooks.ops) { rt.state.ops.push(o); E.ledger.commit(rt.view, [o]); }
  }

  function planEffect(rt, frame, step) {
    const def = E.effects.get(step.effect);
    if (!def) throw new Error('Unknown effect ' + step.effect);
    const p = {};
    const lines = [];
    for (const [key, spec] of Object.entries(def.params || {})) {
      if (step[key] === undefined) continue;
      if (spec.type === 'ref') {
        const v = step[key];
        let value = null;
        if (LP.registry.isVariable(v)) {
          let base = null;
          try { base = rt.scope.raw(v); } catch (e) { /* a variable nothing set: nobody to act on */ }
          value = Array.isArray(base) ? base[0] : base;
        } else if (E.isRef(v)) {
          value = v;
        }
        if (!E.isRef(value)) {
          if (spec.optional) continue;
          return null;
        }
        p[key] = value;
      } else if (spec.type === 'any') {
        p[key] = deepResolve(rt, step[key]);
      } else if (spec.type === 'steps' || spec.type === 'dice') {
        p[key] = step[key];
      } else {
        p[key] = rt.scope.resolve(step[key]);
      }
    }
    const util = { amount: (v, label) => amountOf(rt, v, label, lines), text: text };
    const built = def.build({ campaign: rt.view, vars: rt.state.vars, resolve: rt.scope.resolve, ref: rt.scope.ref }, p, util);
    const result = built.effect ? { ops: [built], lines: lines } : Object.assign({}, built, { lines: (built.lines || []).concat(lines) });
    emit(rt, frame.path, result);
    if (result.impossible) { impossible(rt); return result; }
    if (result.steps && result.steps.length) push(rt, result.steps, frame.path, { depth: frame.depth });
    return result;
  }

  /** Apply the player's answer to the pending prompt and carry on. */
  function answer(campaign, state, env, value) {
    const pending = state.pending;
    if (!pending) return { error: 'Nothing is waiting for an answer.' };
    const rt = runtime(campaign, state, env);
    const step = pending.step;
    const frame = { steps: [], path: pending.path, depth: pending.depth };
    const follow = (steps) => push(rt, steps, pending.path, { depth: pending.depth });
    const pay = (key, amount) => {
      if (amount > 0) planEffect(rt, frame, { effect: 'resource', key: key, amount: -amount });
    };

    switch (pending.kind) {
      case 'question':
        state.answers[pending.question] = !!value;
        break;
      case 'yesno': {
        const yes = !!value;
        if (yes && pending.options[0].disabled) return { error: 'The crew can’t afford that.' };
        append(rt, pending.path, text('→ ' + (yes ? pending.options[0].label : pending.options[1].label)));
        if (step.as) state.vars[step.as] = yes;
        if (yes && pending.cost) pay(pending.cost.key, pending.cost.amount);
        follow(yes ? step.yes : step.no);
        break;
      }
      case 'options': {
        const option = step.options.find((o) => o.value === value);
        if (!option) return { error: 'Unknown choice.' };
        append(rt, pending.path, text('→ ' + option.label));
        if (step.as) state.vars[step.as] = option.value;
        follow(option.steps);
        break;
      }
      case 'number': {
        const n = Number(value);
        if (!Number.isInteger(n) || n < pending.min || n > pending.max) return { error: 'Choose a number from ' + pending.min + ' to ' + pending.max + '.' };
        append(rt, pending.path, text('→ ' + n));
        if (step.as) state.vars[step.as] = n;
        if (pending.per) pay(pending.per.key, n * pending.per.amount);
        follow(n ? step.steps : step.none);
        break;
      }
      case 'pickList': {
        const picks = Array.isArray(value) ? value : [];
        if (picks.length !== pending.k) return { error: 'Pick ' + plural(pending.k, 'option', 'options') + '.' };
        if (!pending.repeats && new Set(picks).size !== picks.length) return { error: 'Pick each option once.' };
        const chosen = picks.map((v) => step.list.find((o) => o.value === v));
        if (chosen.some((o) => !o)) return { error: 'Unknown choice.' };
        append(rt, pending.path, text('→ ' + chosen.map((o) => o.label).join(', ')));
        for (const o of chosen.slice().reverse()) follow(o.steps);
        break;
      }
      case 'offer': {
        if (value === null || value === false) {
          if (!pending.allowDecline) return { error: 'Choose one.' };
          append(rt, pending.path, text('→ No deal'));
          follow(step.declined);
        } else {
          const ref = pending.refs.find((r) => r.id === value);
          if (!ref) return { error: 'Unknown choice.' };
          append(rt, pending.path, text('→ ' + labelOf(rt, ref)));
          if (step.as) state.vars[step.as] = ref;
          follow(step.chosen);
        }
        break;
      }
      case 'recruit': {
        if (value && value.accepted && value.member) {
          append(rt, pending.path, text('→ ' + (value.member.name || 'A new character') + ' joins the crew.'));
          planEffect(rt, frame, { effect: 'member.add', member: value.member, items: value.items || [] });
          follow(step.accept);
        } else {
          append(rt, pending.path, text('→ They don’t join.'));
          follow(step.decline);
        }
        break;
      }
      case 'alternatives': {
        const chosen = pending.alternatives[Number(value)];
        if (!chosen) return { error: 'Unknown choice.' };
        for (const line of chosen.lines) container(state, pending.path).push(line);
        for (const op of chosen.ops) {
          state.ops.push(op);
          E.ledger.commit(rt.view, [op]);
        }
        break;
      }
      default:
        return { error: 'Unknown prompt.' };
    }
    state.pending = null;
    resume(rt);
    return { ok: true };
  }

  /* ---------------------------------------------------------------------- */
  /* Steps                                                                  */
  /* ---------------------------------------------------------------------- */

  function runRoll(rt, frame, step) {
    const notation = substitute(rt, step.roll);
    const r = LP.rng.roll(notation);
    const modifiers = (step.add || []).map((m) => ({ label: m.label, value: Number(rt.scope.resolve(m.value)) || 0 })).filter((m) => m.value);
    const added = modifiers.reduce((sum, m) => sum + m.value, 0);
    const line = { type: 'roll', label: step.label || '', notation: r.notation, dice: r.dice, base: r.total, modifiers: modifiers, total: r.total + added };
    if (step.keep === 'highest') { line.keep = 'highest'; line.total = Math.max(...r.dice) + added; }
    if (step.floor !== undefined && line.total < step.floor) {
      line.modifiers.push({ label: step.floorLabel || 'at least ' + step.floor, value: step.floor - line.total });
      line.total = step.floor;
    }
    if (step.target !== undefined) {
      line.target = step.target;
      line.success = line.total >= step.target;
    }
    let follow = [];
    if (step.outcomes) {
      const outcome = step.outcomes.find((o) => inRange(line.total, o, r.dice[0]));
      if (outcome) {
        const parts = [];
        if (outcome.text) parts.push(fmt(rt, outcome.text));
        if (outcome.tone) line.tone = outcome.tone;
        if (parts.length) line.text = parts.join(' ');
        follow = outcome.steps || [];
      }
    }
    if (step.text && !line.text) line.text = fmt(rt, step.text);
    if (step.as) rt.state.vars[step.as] = { total: line.total, natural: r.dice[0], success: line.success };
    const path = append(rt, frame.path, line);
    const branch = line.success === true ? step.pass : line.success === false ? step.fail : null;
    push(rt, follow.concat(branch || []), path, { depth: frame.depth });
    return path;
  }

  /** Run a roll table that has its own scripts (Loot, Injury...) through the follow-up runner. */
  /** `actor: '$who'` on a table or group step: the event it starts is about someone else; $actor comes back after. */
  function actingAs(rt, frame, step) {
    if (!step.actor) return;
    const prev = rt.state.vars.actor === undefined ? null : rt.state.vars.actor;
    rt.state.vars.actor = rt.scope.raw(step.actor);
    push(rt, [{ __bind: { name: 'actor', value: prev } }], frame.path, { depth: frame.depth });
  }

  function runRollTable(rt, frame, step) {
    const run = LP.followup.start([{ table: step.table, label: step.label, note: step.note, damaged: step.damaged }], rt.env.followup || {});
    if (run.pending) {
      append(rt, frame.path, text('This ' + step.table + ' result needs a choice the event runner can’t ask yet.', 'bad'));
      return;
    }
    for (const line of run.lines) append(rt, frame.path, line);
    const first = run.lines.find((l) => l.type === 'table');
    if (step.as && first) rt.state.vars[step.as] = { total: first.total, natural: first.natural, rowId: first.rowId };
    const gains = run.gains || {};
    const effect = (e) => planEffect(rt, frame, e);
    if (gains.storyPoints) effect({ effect: 'resource', key: 'storyPoints', amount: gains.storyPoints });
    if (gains.rumors) effect({ effect: 'resource', key: 'rumors', amount: gains.rumors });
    for (let i = 0; i < (gains.rivals || 0); i++) effect({ effect: 'rival.add' });
    for (let i = 0; i < (gains.patrons || 0); i++) effect({ effect: 'patron.add' });
    for (const entry of LP.items.linesIn({ lines: run.lines })) {
      if (entry.manual) continue;
      effect({ effect: 'item.add', table: entry.line.table, row: entry.line.rowId, damaged: entry.damaged });
    }
  }

  function runAlternatives(rt, frame, step) {
    const alternatives = [];
    for (let i = 0; i < step.alternatives.n; i++) {
      const child = newState(rt.state.vars);
      child.stack.push({ steps: [{ table: step.alternatives.table }], path: [], depth: (frame.depth || 0) + 1 });
      const crt = runtime(rt.view, child, rt.env);
      resume(crt);
      if (child.pending) {
        append(rt, frame.path, text('An alternative asked a question, which isn’t supported inside "alternatives".', 'bad'));
        return;
      }
      alternatives.push({ ops: child.ops, lines: child.lines });
    }
    pause(rt, frame, step, {
      kind: 'alternatives', prompt: step.prompt || 'Keep which result?',
      alternatives: alternatives,
      options: alternatives.map((a, i) => ({
        value: i,
        label: (a.lines[0] ? a.lines[0].title || a.lines[0].text : 'Result') + (a.ops.length ? ' — ' + E.ledger.preview(rt.view, a.ops).map((l) => l.text).join('; ') : '')
      }))
    });
  }

  function runStep(rt, frame, step) {
    const state = rt.state;
    if (step.__bind) { state.vars[step.__bind.name] = step.__bind.value; return; }
    if (step.__until) {
      const done = evaluate(rt, frame, step, step.__until.until);
      if (done === undefined) return;
      if (!done && step.__until.left > 0) {
        frame.steps.unshift(...clone(step.__until.steps), { __until: Object.assign({}, step.__until, { left: step.__until.left - 1 }) });
      }
      return;
    }

    if (step.roll !== undefined) return runRoll(rt, frame, step);

    if (step.ask) return ask(rt, frame, step);

    if (step.effect) {
      const result = planEffect(rt, frame, step);
      if (result && step.say) append(rt, frame.path, text(fmt(rt, step.say), step.tone));
      return;
    }

    if (step.select) {
      const picked = E.select(step.select, rt.scope);
      if (!picked.refs.length) {
        if (step.required) { impossible(rt); return; }
        if (step.as) state.vars[step.as] = step.list || E.countOf(step.select, rt.scope) > 1 ? [] : null;
        return;
      }
      if (step.as) state.vars[step.as] = step.list || E.countOf(step.select, rt.scope) > 1 ? picked.refs : picked.refs[0];
      if (step.label) append(rt, frame.path, text(step.label + ': ' + picked.refs.map((r) => labelOf(rt, r)).join(', ') + '.'));
      return;
    }

    if (step.group) {
      const path = append(rt, frame.path, text(step.group + ':', 'note'));
      actingAs(rt, frame, step);
      push(rt, step.steps, path, { depth: frame.depth });
      return;
    }

    if (step.if) {
      const result = evaluate(rt, frame, step, step.if);
      if (result === undefined) return;
      push(rt, result ? step.then : step.else, frame.path, { depth: frame.depth });
      return;
    }

    if (step.table) {
      if (EVENT_TABLES.includes(step.table)) {
        actingAs(rt, frame, step);
        return rollEventTable(rt, frame, step.table);
      }
      return runRollTable(rt, frame, step);
    }
    if (step.again) {
      let owner = null;
      for (let i = state.stack.length - 1; i >= 0 && !owner; i--) if (state.stack[i].table) owner = state.stack[i];
      if (owner) rollEventTable(rt, frame, owner.table);
      return;
    }

    if (step.rollGroup) {
      if ((frame.depth || 0) >= MAX_DEPTH) { append(rt, frame.path, text('Stopped: too many events in a row.', 'note')); return; }
      const picked = LP.rng.weightedPick(candidates(rt, (ev) => ev.group === step.rollGroup));
      if (picked) {
        actingAs(rt, frame, step);
        startEvent(rt, frame, picked, picked.event.table);
      }
      return;
    }

    if (step.call) {
      const fragment = (rt.env.packs || []).reduce((found, pack) => found || (pack.fragments || []).find((f) => f.id === step.call), null);
      if (!fragment) throw new Error('Unknown fragment ' + step.call);
      push(rt, fragment.steps, frame.path, { depth: frame.depth });
      return;
    }

    if (step.alternatives) return runAlternatives(rt, frame, step);

    if (step.forEach) {
      const base = state.vars[step.forEach.slice(1)];
      const list = Array.isArray(base) ? base : base ? [base] : [];
      const expanded = [];
      for (const ref of list) expanded.push({ __bind: { name: 'each', value: ref } }, ...clone(step.steps));
      frame.steps.unshift(...expanded);
      return;
    }

    if (step.repeat) {
      if (step.repeat.times) {
        const expanded = [];
        const times = Math.max(0, Math.floor(Number(rt.scope.resolve(step.repeat.times)) || 0));
        for (let i = 1; i <= times; i++) expanded.push({ __bind: { name: 'i', value: i } }, ...clone(step.steps));
        frame.steps.unshift(...expanded);
      } else {
        frame.steps.unshift(...clone(step.steps), { __until: { until: step.repeat.until, left: step.repeat.max - 1, steps: step.steps } });
      }
      return;
    }

    if (step.say) { append(rt, frame.path, text(fmt(rt, step.say), step.tone)); return; }
    if (step.manual) { append(rt, frame.path, Object.assign(text(fmt(rt, step.manual), 'note'), { manual: true })); return; }

    throw new Error('Unknown step: ' + JSON.stringify(step).slice(0, 80));
  }

  /* ---------------------------------------------------------------------- */
  /* Public                                                                 */
  /* ---------------------------------------------------------------------- */

  function newState(vars) {
    return { vars: clone(vars || {}), ops: [], lines: [], stack: [], pending: null, answers: {}, done: false };
  }

  function resume(rt) {
    const state = rt.state;
    let guard = 0;
    while (!state.pending && state.stack.length) {
      if (++guard > 5000) throw new Error('This event keeps going. Check it for a loop.');
      const frame = state.stack[state.stack.length - 1];
      if (!frame.steps.length) { state.stack.pop(); continue; }
      runStep(rt, frame, frame.steps.shift());
    }
    state.done = !state.pending && !state.stack.length;
    return state;
  }

  /** Start a run of `steps`. Returns the state (check state.pending for a prompt). */
  function start(campaign, steps, env) {
    const state = newState(env && env.vars);
    state.stack.push({ steps: clone(steps), path: [], depth: 0 });
    return resume(runtime(campaign, state, env || {}));
  }

  /** Continue a run restored from JSON. */
  function run(campaign, state, env) {
    return resume(runtime(campaign, state, env || {}));
  }

  /* ---------------------------------------------------------------------- */
  /* Validation                                                             */
  /* ---------------------------------------------------------------------- */

  const KINDS = ['roll', 'ask', 'effect', 'select', 'group', 'if', 'table', 'again', 'rollGroup', 'call', 'alternatives', 'forEach', 'repeat', 'effect', 'say', 'manual'];

  function tableExists(name) {
    try { return !!LP.rng.getTable(name); } catch (e) { return false; }
  }

  function validateSteps(steps, path, ctx) {
    const problems = [];
    if (!Array.isArray(steps)) return [path + ' must be a list of steps'];
    steps.forEach((step, i) => {
      const where = path + '[' + (i + 1) + ']';
      if (!step || typeof step !== 'object') { problems.push(where + ' must be an object'); return; }
      const kind = KINDS.find((k) => step[k] !== undefined);
      if (!kind) { problems.push(where + ' is not a known kind of step'); return; }
      const sub = (list, name) => problems.push(...validateSteps(list || [], where + '.' + name, ctx));
      switch (kind) {
        case 'roll':
          if (typeof step.roll !== 'string' && typeof step.roll !== 'number') problems.push(where + ': roll needs dice such as "1D6"');
          else if (!/\$/.test(String(step.roll)) && !LP.rng.parseDice(String(step.roll))) problems.push(where + ': "' + step.roll + '" is not dice notation');
          (step.outcomes || []).forEach((o, j) => sub(o.steps, 'outcomes[' + (j + 1) + '].steps'));
          sub(step.pass, 'pass'); sub(step.fail, 'fail');
          break;
        case 'select':
          problems.push(...E.validateSelector(step.select, where + '.select'));
          if (!step.as) problems.push(where + ': select needs "as" to name the pick');
          for (const key of ['where', 'prefer']) {
            if (step.select && step.select[key]) {
              problems.push(...LP.predicate.validate(step.select[key], E.facts, where + '.select.' + key));
              if (LP.predicate.asks(step.select[key]).length) problems.push(where + '.select.' + key + ': questions to the player aren’t allowed here');
            }
          }
          break;
        case 'if':
          problems.push(...LP.predicate.validate(step.if, E.facts, where + '.if'));
          sub(step.then, 'then'); sub(step.else, 'else');
          break;
        case 'ask':
          if (!['yesno', 'options', 'number', 'pickList', 'offer', 'recruit'].includes(step.ask)) problems.push(where + ': unknown prompt "' + step.ask + '"');
          if (step.ask === 'yesno') { sub(step.yes, 'yes'); sub(step.no, 'no'); }
          if (step.ask === 'options') {
            if (!Array.isArray(step.options) || !step.options.length) problems.push(where + ': options needs a list');
            else step.options.forEach((o, j) => sub(o.steps, 'options[' + (j + 1) + '].steps'));
          }
          if (step.ask === 'number') {
            if (!Number.isInteger(step.max)) problems.push(where + ': number needs a whole "max"');
            sub(step.steps, 'steps'); sub(step.none, 'none');
          }
          if (step.ask === 'pickList') {
            if (!Array.isArray(step.list) || !step.list.length) problems.push(where + ': pickList needs a list');
            else step.list.forEach((o, j) => sub(o.steps, 'list[' + (j + 1) + '].steps'));
          }
          if (step.ask === 'offer') {
            problems.push(...E.validateSelector(step.select, where + '.select'));
            sub(step.chosen, 'chosen'); sub(step.declined, 'declined');
          }
          if (step.ask === 'recruit') { sub(step.accept, 'accept'); sub(step.decline, 'decline'); }
          break;
        case 'table':
          if (typeof step.table !== 'string') problems.push(where + ': table needs a name');
          else if (!EVENT_TABLES.includes(step.table) && !tableExists(step.table)) problems.push(where + ': no roll table called "' + step.table + '"');
          break;
        case 'rollGroup':
          if (ctx && ctx.groups && !ctx.groups.includes(step.rollGroup)) problems.push(where + ': no event group called "' + step.rollGroup + '"');
          break;
        case 'call':
          if (ctx && ctx.fragments && !ctx.fragments.includes(step.call)) problems.push(where + ': no fragment called "' + step.call + '"');
          break;
        case 'alternatives':
          if (!step.alternatives || !Number.isInteger(step.alternatives.n) || step.alternatives.n < 2) problems.push(where + ': alternatives needs "n" of 2 or more');
          break;
        case 'group':
          sub(step.steps, 'steps');
          break;
        case 'forEach': case 'repeat':
          sub(step.steps, 'steps');
          if (kind === 'repeat' && !step.repeat.times && !(step.repeat.max && step.repeat.until)) problems.push(where + ': repeat needs "times", or "max" and "until"');
          break;
        case 'effect': {
          const given = {};
          for (const key of Object.keys(step)) if (!['effect', 'say', 'tone'].includes(key)) given[key] = step[key];
          problems.push(...E.effects.validate(step.effect, given).map((p) => where + ': ' + p));
          const def = E.effects.get(step.effect);
          if (def && def.check) problems.push(...def.check(given).map((p) => where + ': ' + p));
          break;
        }
        default:
      }
    });
    return problems;
  }

  E.run = { start, run, answer, prompt, newState, validateSteps, EVENT_TABLES, TABLE_LABELS };
})(window.LP);
