(function (LP) {
  'use strict';

  /*
   * A named list of definitions that code registers and data refers to by id.
   * The event system has registries for effects, facts, triggers, modifiers and
   * prompts. Each definition says what parameters it takes, so the pack validator
   * and the editor are built from the registry instead of being written by hand.
   *
   *   def = { id, label?, params: { key: { type, required?, options?, label? } }, ...whatever the owner needs }
   *   param types: 'number', 'dice' (number, dice notation or $variable), 'string', 'boolean',
   *                'enum' (options), 'ref' ($variable), 'steps', 'predicate', 'any'
   */

  const TYPES = ['number', 'dice', 'string', 'boolean', 'enum', 'ref', 'steps', 'predicate', 'any'];

  function isVariable(value) {
    return typeof value === 'string' && value.charAt(0) === '$';
  }

  function checkParam(spec, value, label) {
    if (isVariable(value) && spec.type !== 'steps' && spec.type !== 'predicate') return null;
    switch (spec.type) {
      case 'number': return typeof value === 'number' && isFinite(value) ? null : label + ' must be a number';
      case 'dice': return typeof value === 'number' || (typeof value === 'string' && LP.rng.parseDice(value.replace(/^-/, '').replace(/\$[\w.]+/g, '1'))) ? null : label + ' must be a number or dice (such as 1D6+1)';
      case 'string': return typeof value === 'string' ? null : label + ' must be text';
      case 'boolean': return typeof value === 'boolean' ? null : label + ' must be true or false';
      case 'enum': return (spec.options || []).includes(value) ? null : label + ' must be one of ' + (spec.options || []).join(', ');
      case 'ref': return null;
      case 'steps': return Array.isArray(value) ? null : label + ' must be a list of steps';
      case 'predicate': return value && typeof value === 'object' ? null : label + ' must be a condition';
      default: return null;
    }
  }

  function create(name) {
    const defs = new Map();

    function register(def) {
      if (!def || typeof def.id !== 'string' || !def.id) throw new Error(name + ': a definition needs an id.');
      if (defs.has(def.id)) throw new Error(name + ': duplicate id ' + def.id);
      for (const [key, spec] of Object.entries(def.params || {})) {
        if (!TYPES.includes(spec.type)) throw new Error(name + ' ' + def.id + ': unknown type ' + spec.type + ' for ' + key);
      }
      defs.set(def.id, def);
      return def;
    }

    function get(id) {
      return defs.get(id) || null;
    }

    function list() {
      return Array.from(defs.values());
    }

    /** Problems with `params` for definition `id` (an empty list when fine). */
    function validate(id, params) {
      const def = defs.get(id);
      if (!def) return ['Unknown ' + name + ' "' + id + '"'];
      const problems = [];
      const given = params || {};
      const spec = def.params || {};
      for (const key of Object.keys(given)) {
        if (!(key in spec) && !(def.open || []).includes(key)) problems.push(id + ': unknown setting "' + key + '"');
      }
      for (const [key, s] of Object.entries(spec)) {
        if (given[key] === undefined) {
          if (s.required) problems.push(id + ': "' + key + '" is required');
          continue;
        }
        const problem = checkParam(s, given[key], id + ' "' + key + '"');
        if (problem) problems.push(problem);
      }
      return problems;
    }

    return { name, register, get, list, validate };
  }

  LP.registry = { create, isVariable };
})(window.LP);
