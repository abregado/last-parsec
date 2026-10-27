(function (LP) {
  'use strict';

  /*
   * The ledger: the ops a run planned, shown to the player and then applied.
   *
   *   preview(campaign, ops) -> [{ text, effect, destructive }]   nothing is changed
   *   commit(campaign, ops)                                       applies them for real
   *   replay(campaign, snapshot, ops)                             puts the snapshot back first,
   *                                                               so applying twice gives the same result
   */

  const E = LP.events;
  const DESTRUCTIVE = ['member.remove', 'item.remove', 'item.damage', 'rival.disable', 'patron.disable'];

  function def(op) {
    const d = E.effects.get(op.effect);
    if (!d) throw new Error('Unknown effect ' + op.effect);
    return d;
  }

  function preview(campaign, ops) {
    const scratch = LP.snapshot.scratch(campaign);
    const out = [];
    for (const op of ops) {
      const d = def(op);
      out.push({ text: d.describe(scratch, op), effect: op.effect, destructive: DESTRUCTIVE.includes(op.effect) });
      d.apply(scratch, op);
    }
    return out;
  }

  function commit(campaign, ops) {
    for (const op of ops) def(op).apply(campaign, op);
  }

  function replay(campaign, snapshot, ops) {
    LP.snapshot.restore(campaign, snapshot);
    commit(campaign, ops);
  }

  E.ledger = { preview, commit, replay, DESTRUCTIVE };
})(window.LP);
