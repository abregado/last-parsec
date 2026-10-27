(function (LP) {
  'use strict';

  /*
   * Selectors pick who or which for an event, always at random unless told otherwise.
   *
   *   { from: 'crew' | 'items' | 'rivals' | 'patrons',
   *     where?:    predicate on each candidate (the candidate is $this),
   *     carrier?:  items only: '$actor' (a member), 'stash', or 'any' (default)
   *     disabled?: rivals and patrons only: true picks among the set-aside ones
   *     count?:    how many (default 1; never the same one twice); a number or a $variable
   *     exclude?:  ['$a', ...] variables whose picks are left out
   *     prefer?:   predicate; if anyone matches, only they are considered
   *     best?:     a stat; take the highest instead of a random pick (ties are random)
   *     offer?:    N: draw N candidates for the player to choose from (see the offer prompt) }
   *
   * select(spec, scope) -> { refs: [ref], offer: bool }; refs is empty when nobody qualifies.
   */

  const E = LP.events;
  const R = LP.roster;

  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = LP.rng.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function candidates(spec, scope) {
    const campaign = scope.campaign;
    switch (spec.from) {
      case 'crew':
        return R.members(campaign)
          .filter((m) => !LP.conditions.blocked(campaign, 'event-target', { memberId: m.id }))
          .map((m) => ({ ref: 'member', id: m.id }));
      case 'items': {
        const carrier = spec.carrier === undefined ? 'any' : spec.carrier;
        const owner = carrier === 'any' || carrier === 'stash' ? carrier : scope.resolve(carrier);
        return R.roster(campaign).items
          .filter((i) => owner === 'any' || (owner === 'stash' ? !i.carrierId : i.carrierId === owner))
          .map((i) => ({ ref: 'item', id: i.id }));
      }
      case 'rivals':
      case 'patrons': {
        const planet = E.planetOf(campaign);
        if (!planet) return [];
        const key = spec.from;
        const list = spec.disabled ? planet['disabled' + key.charAt(0).toUpperCase() + key.slice(1)] : planet[key];
        return list.map((x) => ({ ref: key.slice(0, -1), id: x.id }));
      }
      default:
        throw new Error('Unknown selector source ' + spec.from);
    }
  }

  function idsOf(scope, name) {
    const base = scope.vars[name.slice(1)];
    const list = Array.isArray(base) ? base : [base];
    return list.filter(E.isRef).map((r) => r.id);
  }

  function matching(list, predicate, scope) {
    const saved = scope.vars.this;
    try {
      return list.filter((ref) => {
        scope.vars.this = ref;
        return LP.predicate.evaluate(predicate, scope);
      });
    } finally {
      if (saved === undefined) delete scope.vars.this;
      else scope.vars.this = saved;
    }
  }

  /** How many a selector asks for (its count may be a $variable). */
  function countOf(spec, scope) {
    if (spec.offer) return spec.offer;
    if (spec.count === undefined) return 1;
    return Math.max(0, Math.floor(Number(scope.resolve(spec.count)) || 0));
  }

  function select(spec, scope) {
    let list = candidates(spec, scope);
    if (spec.where) list = matching(list, spec.where, scope);
    if (spec.exclude && spec.exclude.length) {
      const skip = new Set();
      for (const name of spec.exclude) idsOf(scope, name).forEach((id) => skip.add(id));
      list = list.filter((ref) => !skip.has(ref.id));
    }
    if (spec.prefer) {
      const preferred = matching(list, spec.prefer, scope);
      if (preferred.length) list = preferred;
    }
    const count = countOf(spec, scope);
    if (spec.best) {
      const stat = spec.best;
      list = shuffle(list).sort((a, b) => (E.props(scope.campaign, b)[stat] || 0) - (E.props(scope.campaign, a)[stat] || 0));
      return { refs: list.slice(0, count), offer: false };
    }
    return { refs: shuffle(list).slice(0, count), offer: !!spec.offer };
  }

  /** Problems with a selector's shape (for the pack validator). */
  function validate(spec, path) {
    const where = path || 'select';
    if (!spec || typeof spec !== 'object') return [where + ' must be an object'];
    const problems = [];
    if (!['crew', 'items', 'rivals', 'patrons'].includes(spec.from)) problems.push(where + ': "from" must be crew, items, rivals or patrons');
    if (spec.best && !E.STAT_KEYS.includes(spec.best)) problems.push(where + ': "best" must be a stat');
    if (spec.best && spec.from !== 'crew') problems.push(where + ': "best" only works on crew');
    if (spec.offer !== undefined && (!Number.isInteger(spec.offer) || spec.offer < 2)) problems.push(where + ': "offer" must be a whole number of 2 or more');
    if (spec.count !== undefined && !LP.registry.isVariable(spec.count) && (!Number.isInteger(spec.count) || spec.count < 1)) problems.push(where + ': "count" must be a whole number of 1 or more');
    if (spec.disabled && !['rivals', 'patrons'].includes(spec.from)) problems.push(where + ': "disabled" only works on rivals and patrons');
    return problems;
  }

  E.select = select;
  E.countOf = countOf;
  E.validateSelector = validate;
})(window.LP);
