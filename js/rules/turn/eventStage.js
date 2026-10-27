(function (LP) {
  'use strict';

  /*
   * Turn stages that play events from the event packs (js/rules/events). A stage starts a run
   * with start() and answers its prompts with choose(); the run's JSON state is kept in the record:
   *
   *   output = { headline, lines: [], ops, run: <run state>, envOptions: { turn } }
   *   pending = null | { kind, prompt, options?, free?, ...what the prompt widget needs }
   *
   * The lines shown are output.run.lines (the result card reads them there). output.ops are what
   * Apply commits (ledger stages). Prompts that are a plain choice (Yes/No, options, a question)
   * use `options` like any stage choice; the rest are `free` and checked by the run itself.
   */


  const PLAIN = ['question', 'yesno', 'options'];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function envFor(ctx, options) {
    const o = options || {};
    return LP.events.pack.env(ctx.campaign, { turn: o.turn || {}, vars: o.vars || {}, source: o.source || null });
  }

  /** The prompt a run is waiting on, in the shape the turn and result card use. */
  function pendingOf(state) {
    const p = LP.events.run.prompt(state);
    if (!p) return null;
    const out = { kind: p.kind, prompt: p.prompt, free: !PLAIN.includes(p.kind) };
    for (const key of ['options', 'min', 'max', 'per', 'k', 'repeats', 'allowDecline', 'variant', 'cost']) if (p[key] !== undefined) out[key] = p[key];
    return out;
  }

  function title(lines) {
    const first = (lines || []).find((l) => l.type === 'table' && l.title);
    return first ? first.title : 'Event';
  }

  function result(state, options) {
    return {
      output: { headline: title(state.lines), lines: [], ops: state.ops, run: state, envOptions: options || {} },
      pending: pendingOf(state)
    };
  }

  /** Begin a run of `steps`. options: { vars: { actor: ref }, turn: { casualtyIds, mission }, source: "a campaign event" }. */
  function start(ctx, steps, options) {
    const state = LP.events.run.start(ctx.campaign, steps, envFor(ctx, options));
    return result(state, options);
  }

  /** Answer the waiting prompt. Returns { output, pending } or { error }. */
  function choose(record, value, ctx) {
    const state = clone(record.output.run);
    const options = record.output.envOptions || {};
    const answered = LP.events.run.answer(ctx.campaign, state, envFor(ctx, options), value);
    if (answered.error) return { error: answered.error };
    return result(state, options);
  }

  /** The ops a run has planned, for a stage's facts. */
  function opsOf(output) {
    return (output && output.ops) || [];
  }

  /** The id (without its pack) of the first event a run played, or null. */
  function firstEvent(output) {
    const line = ((output && output.run && output.run.lines) || []).find((l) => l.type === 'table' && l.rowId);
    return line ? line.rowId.replace(/^[^:]*:/, '') : null;
  }

  /** Total of a resource the ops change (for facts like "Rumors gained"). */
  function gained(output, key) {
    return opsOf(output).filter((o) => o.effect === 'resource' && o.key === key).reduce((sum, o) => sum + o.amount, 0);
  }

  LP.turn.eventStage = { start, choose, pendingOf, opsOf, firstEvent, gained };
})(window.LP);
