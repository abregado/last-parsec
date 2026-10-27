(function (LP) {
  'use strict';

  /*
   * Conditions: lasting state an event leaves behind (a crew member away, a grounded
   * ship, a single-use item). A TYPE (data, in a pack) says what it does; an INSTANCE
   * (campaign.conditions) is one in play:
   *
   *   instance = { id, type, scope, targetId, params, activeFrom, remaining, source: { eventId, turn } }
   *     targetId: a member, planet or rival id (null for crew, campaign and ship)
   *     activeFrom: the first turn it counts; remaining: turns left, or null until removed
   *
   *   type = {
   *     id, name, scope, text,
   *     duration?:  { turns, from: 'now' | 'next' }   default for new instances; none = until removed
   *     unique?:    'stack' (default) | 'ignore' (keep the old one) | 'replace' | 'extend' (add the turns to the old one)
   *     check?:     { stat, dice, target }   rolled at Step 0 by the best crew member outside Sick Bay;
   *                                          a pass counts a turn off, a fail leaves it
   *     tickOn?:    'turn' (default, Step 0) | 'arrive' (each arrival at a new world)
   *     blocks?:    [activity]    blockExcept?: { activity: [mission] }    grants?: [grant]
   *     modifiers?: [{ target, add | set | floor, ask? }]   ask: only when the player said yes to that question
   *     asks?:      [{ key, trigger, label }]   Yes/No fields the stage shows when it fires the trigger
   *     on?:        { trigger: [steps] }        played by the event runner; the steps see $actor
   *                                             (the target member), $cond (this instance) and the answers
   *     endsOn? / consumeOn?:  trigger or modifier target that removes it. The stage that rolls decides
   *                            when a roll uses it up (Spare parts: only on a natural 1).
   *     bypass?:    { label, cost?: { key, amount | 'params.cost' }, steps? }   pay to ignore a block
   *   }
   * Text in a type may use {actor} and {params.x}; `roll.{params.roll}` fills in the instance's params.
   *
   * Stages ask this module (see the stage lists in each stage): blocked(), modifiers(), grants(),
   * fields() and run() for hooks, and step0() at the start of every turn.
   */

  const R = LP.roster;
  const SCOPES = ['crew', 'character', 'planet', 'campaign', 'ship', 'rival', 'patron'];
  const TRIGGERS = ['turnStart', 'expire', 'fail', 'stay', 'depart', 'arrive', 'upkeep', 'jobOffers', 'chooseBattle', 'battle',
    'battleResult', 'rivalGained', 'rivalResolved', 'questGained', 'injuryRoll', 'xpAward'];
  const MODIFIER_TARGETS = ['roll.recruit', 'roll.patron', 'roll.rival', 'roll.repair', 'roll.invasion', 'cost.travel', 'cost.upkeep', 'enemies'];
  const BLOCKS = ['upkeep', 'tasks', 'battle', 'xp', 'travel', 'event-target', 'injury'];
  const GRANTS = ['extra-action'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /* ---------------------------------------------------------------------- */
  /* Types and instances                                                    */
  /* ---------------------------------------------------------------------- */

  function packs(campaign) {
    return [LP.data.basePack].concat((campaign && campaign.eventPacks) || []);
  }

  function typeOf(campaign, id) {
    for (const pack of packs(campaign)) {
      const found = (pack.conditions || []).find((t) => t.id === id);
      if (found) return found;
    }
    return null;
  }

  function turnOf(campaign) {
    return R.turnNumber(campaign);
  }

  function instances(campaign) {
    return campaign.conditions || [];
  }

  /** Does the thing it is about still exist? */
  function targetExists(campaign, inst) {
    if (inst.scope === 'character') return !!R.getMember(campaign, inst.targetId);
    if (inst.scope === 'planet') return !!LP.planets.get(campaign, inst.targetId);
    if (inst.scope === 'rival' || inst.scope === 'patron') return !!LP.events.entity(campaign, { ref: inst.scope, id: inst.targetId });
    return true;
  }

  /** In force this turn: begun, not run out, and (for a planet) the crew is there. */
  function isActive(campaign, inst) {
    if (!typeOf(campaign, inst.type)) return false;
    if (inst.activeFrom > turnOf(campaign)) return false;
    if (inst.remaining !== null && inst.remaining <= 0) return false;
    if (!targetExists(campaign, inst)) return false;
    if (inst.scope === 'planet' && inst.targetId !== campaign.currentPlanetId) return false;
    return true;
  }

  function active(campaign) {
    return instances(campaign).filter((i) => isActive(campaign, i));
  }

  function fill(text, campaign, inst) {
    return String(text).replace(/\{([\w.]+)\}/g, (match, path) => {
      if (path === 'actor') return inst.scope === 'character' ? R.nameOf(R.getMember(campaign, inst.targetId)) : match;
      if (path.indexOf('params.') === 0) {
        const value = inst.params[path.slice(7)];
        return value === undefined ? match : String(value);
      }
      return match;
    });
  }

  /** A new instance from a type, with the type's duration unless `turns` is given. */
  function make(campaign, typeId, options) {
    const type = typeOf(campaign, typeId);
    const o = options || {};
    const turn = turnOf(campaign);
    const base = type && type.duration;
    const duration = o.turns !== undefined || o.from !== undefined
      ? { turns: o.turns !== undefined ? o.turns : base && base.turns, from: o.from || (base && base.from) || 'now' }
      : base;
    const scope = o.scope || (type && type.scope);
    let targetId = o.targetId || null;
    if (!targetId && scope === 'planet') targetId = campaign.currentPlanetId || null;
    return {
      id: LP.storage ? LP.storage.newId() : 'cond-' + Math.random().toString(36).slice(2, 10),
      type: typeId,
      scope: scope,
      targetId: targetId,
      params: o.params || {},
      activeFrom: turn + (duration && duration.from === 'next' ? 1 : 0),
      remaining: duration && duration.turns ? duration.turns : null,
      source: { eventId: o.source || null, turn: turn }
    };
  }

  /** What to do about an existing instance of the same type on the same target: 'add', 'skip' or the instance to replace. */
  function duplicateRule(campaign, inst) {
    const type = typeOf(campaign, inst.type);
    const same = instances(campaign).find((i) => i.type === inst.type && i.targetId === inst.targetId);
    if (!same || !type) return { action: 'add' };
    if (type.unique === 'ignore') return { action: 'skip' };
    if (type.unique === 'replace') return { action: 'replace', old: same.id };
    if (type.unique === 'extend') return { action: 'extend', old: same.id };
    return { action: 'add' };
  }

  /** The ops that start a condition: nothing if the type keeps the old one, a longer timer if it extends. */
  function addOps(campaign, typeId, options) {
    const inst = make(campaign, typeId, options);
    const rule = duplicateRule(campaign, inst);
    if (rule.action === 'skip') return [];
    if (rule.action === 'extend') return [{ effect: 'condition.tick', id: rule.old, delta: inst.remaining || 1 }];
    const ops = rule.action === 'replace' ? [{ effect: 'condition.remove', id: rule.old }] : [];
    ops.push({ effect: 'condition.add', condition: inst });
    return ops;
  }

  /** The ops that end every condition of a type. */
  function removeOps(campaign, typeId) {
    return instances(campaign).filter((i) => i.type === typeId).map((i) => ({ effect: 'condition.remove', id: i.id }));
  }

  /* ---------------------------------------------------------------------- */
  /* Reads for stages                                                       */
  /* ---------------------------------------------------------------------- */

  function appliesToMember(inst, memberId) {
    if (inst.scope === 'character') return !!memberId && inst.targetId === memberId;
    return ['crew', 'campaign', 'ship', 'planet'].includes(inst.scope);
  }

  /**
   * The condition that stops `activity`, or null. For something a member does, pass
   * { memberId }; for the ship or crew as a whole, nothing. { mission } is checked against blockExcept.
   */
  function blocked(campaign, activity, options) {
    const o = options || {};
    for (const inst of active(campaign)) {
      const type = typeOf(campaign, inst.type);
      if (!(type.blocks || []).includes(activity)) continue;
      if (((type.blockExcept || {})[activity] || []).includes(o.mission)) continue;
      if (inst.scope === 'character' && !o.memberId) continue;
      if (appliesToMember(inst, o.memberId)) return inst;
    }
    return null;
  }

  function grants(campaign, grant, memberId) {
    return active(campaign).filter((i) => i.scope === 'character' && i.targetId === memberId && (typeOf(campaign, i.type).grants || []).includes(grant)).length;
  }

  function has(campaign, typeId, targetId) {
    return instances(campaign).some((i) => i.type === typeId && (targetId === undefined || i.targetId === targetId));
  }

  function answerKey(inst, key) {
    return 'cond:' + inst.id + ':' + key;
  }

  /**
   * Bonuses a roll or cost picks up. options: { input (the stage's answers), memberId, rivalId }.
   * Returns { mods: [{ label, value, source }], set, floor, used: [ids] }; `used` are the single-use
   * conditions this roll consumes (give them to consumeOps()).
   */
  function modifiers(campaign, target, options) {
    const o = options || {};
    const out = { mods: [], set: undefined, floor: undefined, used: [] };
    for (const inst of active(campaign)) {
      const type = typeOf(campaign, inst.type);
      if (inst.scope === 'character' && inst.targetId !== o.memberId) continue;
      if ((inst.scope === 'rival' || inst.scope === 'patron') && inst.targetId !== o.rivalId) continue;
      let hit = false;
      for (const mod of type.modifiers || []) {
        if (fill(mod.target, campaign, inst) !== target) continue;
        if (mod.ask && !(o.input && o.input[answerKey(inst, mod.ask)])) continue;
        hit = true;
        if (mod.add !== undefined) out.mods.push({ label: type.name, value: mod.add, source: inst.id });
        if (mod.set !== undefined) out.set = mod.set;
        if (mod.floor !== undefined) out.floor = Math.max(out.floor || 0, mod.floor);
      }
      if (hit && type.consumeOn && fill(type.consumeOn, campaign, inst) === target) out.used.push(inst.id);
    }
    return out;
  }

  function consumeOps(ids) {
    return ids.map((id) => ({ effect: 'condition.remove', id: id }));
  }

  /* ---------------------------------------------------------------------- */
  /* Hooks                                                                  */
  /* ---------------------------------------------------------------------- */

  /** Yes/No form fields for the conditions that ask something at this trigger. */
  function fields(campaign, trigger, options) {
    const o = options || {};
    const out = [];
    for (const inst of active(campaign)) {
      if (inst.scope === 'rival' && inst.targetId !== o.rivalId) continue;
      for (const ask of typeOf(campaign, inst.type).asks || []) {
        if (ask.trigger !== trigger) continue;
        out.push({ key: answerKey(inst, ask.key), type: 'yesno', label: fill(ask.label, campaign, inst), value: false });
      }
    }
    return out;
  }

  function memberRef(inst) {
    return inst.scope === 'character' ? { ref: 'member', id: inst.targetId } : null;
  }

  /**
   * Play the hooks for a trigger. options: { input, turn, memberId (only that member's), vars (extra variables, e.g. $rival),
   * only (an instance id) }. Returns { lines, ops } where ops include removing what the trigger uses up.
   */
  function run(campaign, trigger, input, options) {
    const o = options || {};
    const out = { lines: [], ops: [] };
    const view = LP.snapshot.scratch(campaign);
    // `only` names one instance, even one whose last turn has just been counted off.
    const list = o.only ? instances(campaign).filter((i) => i.id === o.only) : active(campaign);
    for (const inst of list) {
      if (!o.only && (inst.scope === 'rival' || inst.scope === 'patron') && inst.targetId !== o.rivalId) continue;
      if (!o.only && o.memberId && inst.scope === 'character' && inst.targetId !== o.memberId) continue;
      const type = typeOf(campaign, inst.type);
      const steps = (type.on || {})[trigger];
      const removes = fill(type.consumeOn || '', campaign, inst) === trigger || type.endsOn === trigger;
      if (!steps && !removes) continue;
      if (steps) {
        const vars = Object.assign({ actor: memberRef(inst), cond: { id: inst.id, type: inst.type, params: inst.params } }, o.vars);
        for (const ask of type.asks || []) if (ask.trigger === trigger) vars[ask.key] = !!(input && input[answerKey(inst, ask.key)]);
        const state = LP.events.run.start(view, steps, { packs: packs(campaign), disabled: [], vars: vars, turn: o.turn || {} });
        if (state.pending) state.lines.push({ type: 'text', text: 'This hook asked a question, which conditions can’t do.', tone: 'bad' });
        if (state.lines.length) out.lines.push({ type: 'text', text: type.name + (memberRef(inst) ? ' (' + R.nameOf(R.getMember(campaign, inst.targetId)) + ')' : '') + ':', tone: 'note', children: state.lines });
        for (const op of state.ops) { out.ops.push(op); LP.events.ledger.commit(view, [op]); }
      }
      if (removes) {
        const op = { effect: 'condition.remove', id: inst.id };
        out.ops.push(op);
        LP.events.ledger.commit(view, [op]);
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* Ship blocks and bypass                                                 */
  /* ---------------------------------------------------------------------- */

  function costOf(inst, bypass) {
    if (!bypass.cost) return 0;
    return bypass.cost.amount === 'params.cost' ? Number(inst.params.cost) || 0 : bypass.cost.amount;
  }

  /** Form fields for each condition that stops the ship leaving and can be paid off. */
  function travelFields(campaign) {
    const out = [];
    for (const inst of active(campaign)) {
      const type = typeOf(campaign, inst.type);
      if (!(type.blocks || []).includes('travel') || !appliesToMember(inst, null)) continue;
      if (!type.bypass) {
        out.push({ key: 'blocked:' + inst.id, type: 'info', text: type.name + ': ' + type.text });
      } else {
        const cost = costOf(inst, type.bypass);
        out.push({ key: 'bypass:' + inst.id, type: 'yesno', value: false, label: type.name + '. ' + type.bypass.label + (cost ? ' (' + cost + ' credits)' : '') + '?' });
      }
    }
    return out;
  }

  /** Does the player's input get past every travel block? Returns { error } or { ops, lines }. */
  function travelCheck(campaign, input) {
    const out = { ops: [], lines: [] };
    const view = LP.snapshot.scratch(campaign);
    for (const inst of active(campaign)) {
      const type = typeOf(campaign, inst.type);
      if (!(type.blocks || []).includes('travel') || !appliesToMember(inst, null)) continue;
      if (!type.bypass || !(input && input['bypass:' + inst.id])) return { error: type.name + ': ' + type.text };
      const cost = costOf(inst, type.bypass);
      const ops = [];
      if (cost) {
        if (view.roster.resources.credits < cost) return { error: type.name + ': the crew can’t pay ' + cost + ' credits.' };
        ops.push({ effect: 'resource', key: 'credits', amount: -cost });
      }
      if (type.bypass.steps) {
        const state = LP.events.run.start(view, type.bypass.steps, { packs: packs(campaign), disabled: [], vars: {} });
        out.lines.push(...state.lines);
        ops.push(...state.ops);
      }
      ops.push({ effect: 'condition.remove', id: inst.id });
      for (const op of ops) { out.ops.push(op); LP.events.ledger.commit(view, [op]); }
      out.lines.push({ type: 'text', text: type.bypass.label + '.', tone: 'note' });
    }
    return out;
  }

  /* ---------------------------------------------------------------------- */
  /* Step 0                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Roll an instance's check: the best stat among crew who are not in Sick Bay and not blocked from tasks. */
  function check(campaign, inst, type) {
    const c = type.check;
    const crew = R.members(campaign).filter((m) => m.status !== 'sick-bay' && !blocked(campaign, 'tasks', { memberId: m.id }));
    const label = type.name + ' check';
    if (!crew.length) {
      return { passed: false, line: { type: 'text', text: label + ': nobody is fit to try, so it fails.', tone: 'bad' } };
    }
    const shuffled = crew.map((m) => ({ m, k: LP.rng.int(1000) })).sort((a, b) => a.k - b.k).map((x) => x.m);
    const best = shuffled.reduce((top, m) => (m.profile[c.stat] > top.profile[c.stat] ? m : top), shuffled[0]);
    const line = LP.turn.line.roll(c.dice, {
      label: label + ' (' + R.nameOf(best) + '’s ' + c.stat + ')',
      modifiers: [{ label: c.stat, value: best.profile[c.stat] }], target: c.target
    });
    return { passed: line.success, line: line, member: best };
  }

  /**
   * Everything Step 0 does: checks, timers, expiry and turn-start hooks.
   * Timers: a condition counts a turn off once it has been active for a turn; a checked
   * condition rolls from its first active turn and counts a turn off on a pass.
   * Returns { lines, ops, any } (any: something to show).
   */
  function step0(campaign, turnFacts) {
    const out = { lines: [], ops: [], any: false };
    const view = LP.snapshot.scratch(campaign);
    const turn = turnOf(campaign);
    const apply = (ops) => { for (const op of ops) { out.ops.push(op); LP.events.ledger.commit(view, [op]); } };
    const hook = (inst, trigger) => {
      const r = run(view, trigger, {}, { only: inst.id, turn: turnFacts });
      out.lines.push(...r.lines);
      apply(r.ops);
    };

    for (const original of clone(instances(campaign))) {
      const inst = instances(view).find((i) => i.id === original.id);
      if (!inst) continue;
      const type = typeOf(campaign, inst.type);
      const who = inst.scope === 'character' && R.getMember(campaign, inst.targetId) ? ' (' + R.nameOf(R.getMember(campaign, inst.targetId)) + ')' : '';
      if (!type) { out.lines.push({ type: 'text', text: 'Unknown condition "' + inst.type + '" ignored.', tone: 'bad' }); out.any = true; continue; }
      if (!targetExists(campaign, inst)) { apply([{ effect: 'condition.remove', id: inst.id }]); continue; }
      if (inst.activeFrom > turn) continue;
      out.any = true;

      let tick = false;
      if (type.check && inst.remaining !== null) {
        const result = check(view, inst, type);
        out.lines.push(result.line);
        if (result.passed) tick = true;
        else if ((type.on || {}).fail) hook(inst, 'fail');
      } else if (inst.activeFrom < turn && inst.remaining !== null && (type.tickOn || 'turn') === 'turn') {
        tick = true;
      }
      const now = instances(view).find((i) => i.id === inst.id);
      if (!now) continue;
      if (tick) apply([{ effect: 'condition.tick', id: inst.id, delta: -1 }]);
      const after = instances(view).find((i) => i.id === inst.id);
      if (after && after.remaining !== null && after.remaining <= 0) {
        out.lines.push({ type: 'text', text: type.name + who + ' ends.', tone: 'note' });
        if ((type.on || {}).expire) hook(after, 'expire');
        apply([{ effect: 'condition.remove', id: inst.id }]);
      } else if (after) {
        out.lines.push({ type: 'text', text: type.name + who + (after.remaining !== null ? ': ' + after.remaining + (after.remaining === 1 ? ' turn' : ' turns') + ' left.' : '.'), tone: 'note' });
        if ((type.on || {}).turnStart) hook(after, 'turnStart');
      }
    }
    return out;
  }

  /** Arrivals count down the conditions that tick on them (Local maps). Returns ops. */
  function arrivalTicks(campaign) {
    const ops = [];
    for (const inst of active(campaign)) {
      const type = typeOf(campaign, inst.type);
      if (type.tickOn !== 'arrive' || inst.remaining === null) continue;
      ops.push({ effect: 'condition.tick', id: inst.id, delta: -1 });
      if (inst.remaining - 1 <= 0) ops.push({ effect: 'condition.remove', id: inst.id });
    }
    return ops;
  }

  /* ---------------------------------------------------------------------- */
  /* Validation                                                             */
  /* ---------------------------------------------------------------------- */

  const SLUG = /^[a-z0-9][a-z0-9-]*$/;

  function hasPrompt(value) {
    return JSON.stringify(value).indexOf('"ask"') >= 0;
  }

  /** Problems with a condition type's data. */
  function validateType(type, path) {
    const where = path || 'Condition "' + (type && type.id) + '"';
    if (!type || typeof type !== 'object') return [where + ' must be an object.'];
    const problems = [];
    const bad = (message) => problems.push(where + ': ' + message);
    if (!SLUG.test(type.id || '')) bad('needs an id of lower-case letters, numbers and dashes.');
    if (typeof type.name !== 'string' || !type.name.trim()) bad('needs a name.');
    if (!SCOPES.includes(type.scope)) bad('scope must be ' + SCOPES.join(', ') + '.');
    if (type.duration) {
      if (!Number.isInteger(type.duration.turns) || type.duration.turns < 1) bad('duration needs "turns" of 1 or more.');
      if (!['now', 'next'].includes(type.duration.from)) bad('duration "from" must be now or next.');
    }
    if (type.unique && !['stack', 'ignore', 'replace', 'extend'].includes(type.unique)) bad('unique must be stack, ignore, replace or extend.');
    if (type.tickOn && !['turn', 'arrive'].includes(type.tickOn)) bad('tickOn must be turn or arrive.');
    if (type.check) {
      if (!LP.events.STAT_KEYS.includes(type.check.stat)) bad('check needs a stat.');
      if (!LP.rng.parseDice(String(type.check.dice))) bad('check needs dice such as "1D6".');
      if (!Number.isInteger(type.check.target)) bad('check needs a target number.');
      if (type.duration === undefined) bad('a check needs a duration (a pass counts a turn off).');
    }
    for (const b of type.blocks || []) if (!BLOCKS.includes(b)) bad('"' + b + '" isn’t something a condition can block (' + BLOCKS.join(', ') + ').');
    for (const g of type.grants || []) if (!GRANTS.includes(g)) bad('"' + g + '" isn’t something a condition can grant.');
    for (const m of type.modifiers || []) {
      const target = String(m.target || '').replace(/\{[^}]+\}/g, 'x');
      if (!MODIFIER_TARGETS.includes(m.target) && !/^roll\.x$/.test(target)) bad('"' + m.target + '" isn’t a roll or cost a condition can change.');
      if (m.add === undefined && m.set === undefined && m.floor === undefined) bad('a modifier needs add, set or floor.');
      if (m.ask && !(type.asks || []).some((a) => a.key === m.ask)) bad('modifier asks "' + m.ask + '", which isn’t one of its questions.');
    }
    for (const a of type.asks || []) {
      if (!a.key || !a.label) bad('each question needs a key and a label.');
      if (!TRIGGERS.includes(a.trigger)) bad('question "' + a.key + '": unknown trigger "' + a.trigger + '".');
    }
    for (const [trigger, steps] of Object.entries(type.on || {})) {
      if (!TRIGGERS.includes(trigger)) { bad('unknown trigger "' + trigger + '" (use ' + TRIGGERS.join(', ') + ').'); continue; }
      problems.push(...LP.events.run.validateSteps(steps, where + '.on.' + trigger, {}));
      if (hasPrompt(steps)) bad('on.' + trigger + ' can’t ask the player anything; use "asks".');
    }
    for (const key of ['endsOn', 'consumeOn']) {
      if (type[key] && !TRIGGERS.includes(type[key]) && !MODIFIER_TARGETS.includes(type[key]) && !/^roll\.\{params\.\w+\}$/.test(type[key])) bad(key + ' "' + type[key] + '" isn’t a trigger or roll.');
    }
    if (type.bypass) {
      if (!type.bypass.label) bad('bypass needs a label.');
      if (type.bypass.steps) problems.push(...LP.events.run.validateSteps(type.bypass.steps, where + '.bypass.steps', {}));
    }
    return problems;
  }

  LP.conditions = {
    SCOPES, TRIGGERS, MODIFIER_TARGETS, BLOCKS, GRANTS,
    packs, typeOf, instances, active, isActive, make, duplicateRule, addOps, removeOps, fill,
    blocked, grants, has, modifiers, consumeOps, answerKey,
    fields, run, travelFields, travelCheck, check, step0, arrivalTicks, validateType
  };
})(window.LP);
