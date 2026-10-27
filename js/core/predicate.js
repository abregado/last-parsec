(function (LP) {
  'use strict';

  /*
   * Conditions in event data ("predicates"): a tree of
   *   { all: [p, ...] }   { any: [p, ...] }   { not: p }
   * and leaves
   *   { fact: 'crew.count', gte: 2 }                       a registered fact (js/rules/events/facts.js)
   *   { fact: 'member.species', of: '$actor', eq: 'kerin' } facts about a person or item name it in `of`
   *   { fact: 'resource', key: 'credits', gte: '$cost' }   other keys are the fact's own settings
   *   { var: '$roll', lt: 3 }                              a variable the run bound
   *   { ask: 'Was Ava hurt this turn?' }                   something the app can't know: a Yes/No
   * A leaf with no comparison is true when the value is truthy.
   * Comparisons: eq, ne, gt, gte, lt, lte, in (list), includes (value is a list).
   *
   * scope = { resolve(value) -> plain value ($variables become their value),
   *           fact(id, settings, of) -> value, answers: { question: bool } }
   */

  const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'includes'];
  const RESERVED = ['fact', 'of', 'var', 'ask'].concat(OPS);

  function compare(op, left, right) {
    switch (op) {
      case 'eq': return left === right;
      case 'ne': return left !== right;
      case 'gt': return left > right;
      case 'gte': return left >= right;
      case 'lt': return left < right;
      case 'lte': return left <= right;
      case 'in': return Array.isArray(right) && right.includes(left);
      case 'includes': return Array.isArray(left) && left.includes(right);
      default: return !!left;
    }
  }

  function leaf(tree, scope) {
    if (tree.ask !== undefined) {
      if (!scope.answers || !(tree.ask in scope.answers)) throw new Error('Unanswered question: ' + tree.ask);
      return !!scope.answers[tree.ask];
    }
    let value;
    if (tree.fact !== undefined) {
      const settings = {};
      for (const key of Object.keys(tree)) if (!RESERVED.includes(key)) settings[key] = scope.resolve(tree[key]);
      value = scope.fact(tree.fact, settings, tree.of !== undefined ? tree.of : undefined);
    } else if (tree.var !== undefined) {
      value = scope.resolve(tree.var);
    } else {
      throw new Error('A condition needs fact, var, ask, all, any or not.');
    }
    const op = OPS.find((o) => tree[o] !== undefined);
    return op ? compare(op, value, scope.resolve(tree[op])) : !!value;
  }

  function evaluate(tree, scope) {
    if (tree === undefined || tree === null) return true;
    if (tree.all) return tree.all.every((t) => evaluate(t, scope));
    if (tree.any) return tree.any.some((t) => evaluate(t, scope));
    if (tree.not) return !evaluate(tree.not, scope);
    return leaf(tree, scope);
  }

  /** Every `ask` question in a tree, so the run can put the Yes/No prompts up first. */
  function asks(tree, out) {
    const list = out || [];
    if (!tree || typeof tree !== 'object') return list;
    if (tree.ask !== undefined && !list.includes(tree.ask)) list.push(tree.ask);
    for (const t of tree.all || []) asks(t, list);
    for (const t of tree.any || []) asks(t, list);
    if (tree.not) asks(tree.not, list);
    return list;
  }

  /** Problems with a tree: unknown facts and bad shapes. `facts` is the facts registry. */
  function validate(tree, facts, path) {
    const where = path || 'condition';
    if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return [where + ' must be an object'];
    const problems = [];
    for (const key of ['all', 'any']) {
      if (tree[key]) {
        if (!Array.isArray(tree[key])) problems.push(where + '.' + key + ' must be a list');
        else tree[key].forEach((t, i) => problems.push(...validate(t, facts, where + '.' + key + '[' + i + ']')));
      }
    }
    if (tree.not) problems.push(...validate(tree.not, facts, where + '.not'));
    if (tree.all || tree.any || tree.not) return problems;
    if (tree.ask !== undefined) {
      if (typeof tree.ask !== 'string' || !tree.ask) problems.push(where + ': ask needs a question');
    } else if (tree.fact !== undefined) {
      const def = facts && facts.get(tree.fact);
      if (!def) problems.push(where + ': unknown fact "' + tree.fact + '"');
      else {
        const settings = {};
        for (const key of Object.keys(tree)) if (!RESERVED.includes(key)) settings[key] = tree[key];
        problems.push(...facts.validate(tree.fact, settings).map((p) => where + ': ' + p));
      }
    } else if (tree.var === undefined) {
      problems.push(where + ': needs fact, var, ask, all, any or not');
    }
    return problems;
  }

  LP.predicate = { evaluate, asks, validate, OPS };
})(window.LP);
