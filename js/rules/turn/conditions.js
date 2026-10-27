(function (LP) {
  'use strict';

  /*
   * Step 0: Conditions. Runs first every turn, when any condition is due.
   * Rolls checks, counts timers (rules in js/rules/conditions.js, step0()), plays expiry and
   * turn-start hooks, and puts what changes in the ledger for the player to Apply.
   */

  const T = LP.turn;

  T.register({
    id: 'conditions',
    step: 'start',
    number: '0',
    title: 'Conditions',
    ledger: true,
    applies(ctx) {
      // Only at the very start: a condition an event adds later in the turn waits for the next one.
      if (ctx.campaign.turn && ctx.campaign.turn.records.length > 0) return 'No conditions were due at the start of the turn.';
      const turn = LP.roster.turnNumber(ctx.campaign);
      return LP.conditions.instances(ctx.campaign).some((c) => c.activeFrom <= turn) ? true : 'No conditions are in play.';
    },
    fields(ctx) {
      const turn = LP.roster.turnNumber(ctx.campaign);
      const due = LP.conditions.instances(ctx.campaign).filter((c) => c.activeFrom <= turn).length;
      return [{ key: 'note', type: 'info', text: due + (due === 1 ? ' condition is' : ' conditions are') + ' in play. Confirm to roll their checks, count down their timers and see what ends.' }];
    },
    resolve(input, ctx) {
      const r = LP.conditions.step0(ctx.campaign);
      return { output: { headline: r.ops.length ? 'Conditions change' : 'Conditions checked', lines: r.lines, ops: r.ops } };
    }
  });
})(window.LP);
