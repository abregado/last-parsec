(function (LP) {
  'use strict';

  /*
   * What event data can ask about: the fact registry, the people and things a
   * run points at ("refs"), and the scope that predicates and steps evaluate in.
   *
   *   ref   = { ref: 'member' | 'item' | 'rival' | 'patron', id }
   *   vars  = { name: ref | [ref] | number | string | { total, natural, success } }
   *   scope = makeScope(campaign, { vars, answers, turn })
   *     turn: what earlier stages this turn found: { casualtyIds, mission }
   *
   * Variables are written $name, and $name.property reads a property of what
   * it points at (props() lists them): $actor.savvy, $roll.natural.
   */

  const R = LP.roster;
  const facts = LP.registry.create('fact');
  const STAT_KEYS = ['reactions', 'speed', 'combat', 'toughness', 'savvy', 'luck'];

  /* ---------------------------------------------------------------------- */
  /* Refs                                                                   */
  /* ---------------------------------------------------------------------- */

  function isRef(value) {
    return !!value && typeof value === 'object' && typeof value.ref === 'string' && 'id' in value;
  }

  function planetOf(campaign) {
    return LP.planets && Array.isArray(campaign.planets) ? LP.planets.current(campaign) : null;
  }

  /** The live object a ref points at, or null. */
  function entity(campaign, ref) {
    if (!isRef(ref)) return null;
    switch (ref.ref) {
      case 'member': return R.getMember(campaign, ref.id);
      case 'item': return R.roster(campaign).items.find((i) => i.id === ref.id) || null;
      case 'rival': return findContact(campaign, 'rivals', ref.id);
      case 'patron': return findContact(campaign, 'patrons', ref.id);
      default: return null;
    }
  }

  function findContact(campaign, key, id) {
    const offKey = 'disabled' + key.charAt(0).toUpperCase() + key.slice(1);
    for (const planet of campaign.planets || []) {
      const found = (planet[key] || []).find((x) => x.id === id) || (planet[offKey] || []).find((x) => x.id === id);
      if (found) return found;
    }
    return null;
  }

  function motivations(member) {
    const out = [];
    for (const o of member.origins || []) {
      if (o.table === 'Motivation Table' && o.row) out.push(o.row);
      else if (!o.table && /motivation/i.test(o.label)) {
        const row = LP.rng.getTable('Motivation Table').rows.find((r) => r.motivation === o.value);
        if (row) out.push(row.id);
      }
    }
    return out;
  }

  /** Properties of a ref, as plain values. */
  function props(campaign, ref) {
    const e = entity(campaign, ref);
    if (!e) return {};
    if (ref.ref === 'member') {
      const out = Object.assign({}, e.profile, {
        id: e.id,
        name: R.nameOf(e),
        species: e.speciesId,
        xp: e.xp,
        status: e.status,
        inSickBay: e.status === 'sick-bay',
        sickBayTurns: e.sickBayTurns,
        isEngineer: R.isEngineer(e),
        isMachine: R.isMachine(e),
        isLeader: R.roster(campaign).leaderId === e.id,
        motivations: motivations(e)
      });
      return out;
    }
    if (ref.ref === 'item') {
      return {
        id: e.id,
        name: e.name,
        damaged: !!e.damaged,
        category: LP.items.categoryOf(e.table),
        carrier: e.carrierId || 'stash',
        carrierId: e.carrierId || null
      };
    }
    return Object.assign({}, e, { disabled: !!e.disabled });
  }

  function nameOfRef(campaign, ref) {
    const p = props(campaign, ref);
    return p.name || '';
  }

  /* ---------------------------------------------------------------------- */
  /* Scope                                                                  */
  /* ---------------------------------------------------------------------- */

  function makeScope(campaign, extras) {
    const scope = Object.assign({ campaign: campaign, vars: {}, answers: {}, turn: {} }, extras);

    /** What a $variable path points at, as is (a ref stays a ref). */
    scope.raw = function (value) {
      if (!LP.registry.isVariable(value)) return value;
      const parts = value.slice(1).split('.');
      if (!(parts[0] in scope.vars)) throw new Error('Unknown variable ' + value);
      let base = scope.vars[parts[0]];
      for (const key of parts.slice(1)) {
        if (isRef(base)) base = props(campaign, base)[key];
        else if (Array.isArray(base)) base = base[Number(key)];
        else if (base && typeof base === 'object') base = base[key];
        else base = undefined;
      }
      return base;
    };

    /** The value a $variable path stands for (a ref becomes its id; a roll its total). */
    scope.resolve = function (value) {
      if (!LP.registry.isVariable(value)) return value;
      const base = scope.raw(value);
      if (isRef(base)) return base.id;
      if (base && typeof base === 'object' && !Array.isArray(base) && 'total' in base) return base.total;
      return base;
    };

    /** The ref a $variable (or this/actor default) points at. */
    scope.ref = function (value) {
      const name = value === undefined ? (scope.vars.this ? '$this' : '$actor') : value;
      if (!LP.registry.isVariable(name)) return null;
      const base = scope.vars[name.slice(1).split('.')[0]];
      return isRef(base) ? base : null;
    };

    scope.fact = function (id, settings, of) {
      const def = facts.get(id);
      if (!def) throw new Error('Unknown fact ' + id);
      const ref = of !== undefined ? scope.ref(of) : (def.entity ? scope.ref() : null);
      return def.get(scope, settings || {}, ref);
    };

    scope.props = (ref) => props(campaign, ref);
    return scope;
  }

  /* ---------------------------------------------------------------------- */
  /* Facts                                                                  */
  /* ---------------------------------------------------------------------- */

  const STAT = { stat: { type: 'enum', options: STAT_KEYS, required: true } };

  function memberFact(id, get, params) {
    facts.register({ id: 'member.' + id, entity: 'member', params: params || {}, get: (scope, settings, ref) => {
      const p = ref ? props(scope.campaign, ref) : null;
      return p && Object.keys(p).length ? get(p, settings, scope) : undefined;
    } });
  }

  memberFact('species', (p) => p.species);
  memberFact('inSickBay', (p) => p.inSickBay);
  memberFact('sickBayTurns', (p) => p.sickBayTurns);
  memberFact('xp', (p) => p.xp);
  memberFact('isEngineer', (p) => p.isEngineer);
  memberFact('isMachine', (p) => p.isMachine);
  memberFact('isLeader', (p) => p.isLeader);
  memberFact('motivations', (p) => p.motivations);
  memberFact('stat', (p, s) => p[s.stat], STAT);
  memberFact('canGain', (p, s) => p[s.stat] < LP.data.species.capFor(p.species, s.stat), STAT);
  memberFact('raised', (p, s, scope) => {
    const member = R.getMember(scope.campaign, p.id);
    return member.profile[s.stat] > member.baseProfile[s.stat];
  }, STAT);

  function itemFact(id, get) {
    facts.register({ id: 'item.' + id, entity: 'item', params: {}, get: (scope, settings, ref) => {
      const p = ref ? props(scope.campaign, ref) : null;
      return p && Object.keys(p).length ? get(p) : undefined;
    } });
  }
  itemFact('damaged', (p) => p.damaged);
  itemFact('category', (p) => p.category);
  itemFact('carrier', (p) => p.carrier);

  function plain(id, get, params) {
    facts.register({ id, params: params || {}, get: (scope, settings) => get(scope, settings) });
  }

  plain('ship.hullDamaged', (scope) => {
    const ship = R.roster(scope.campaign).ship;
    return !!ship && ship.hull < ship.hullMax;
  });
  plain('ship.hull', (scope) => { const ship = R.roster(scope.campaign).ship; return ship ? ship.hull : 0; });
  plain('ship.debt', (scope) => { const ship = R.roster(scope.campaign).ship; return ship ? ship.debt : 0; });
  plain('resource', (scope, s) => R.roster(scope.campaign).resources[s.key] || 0,
    { key: { type: 'enum', options: R.RESOURCES.map((r) => r.key), required: true } });
  plain('stash.count', (scope) => R.itemsOf(scope.campaign, null).length);
  plain('items.damaged', (scope) => R.roster(scope.campaign).items.filter((i) => i.damaged).length);
  plain('crew.count', (scope) => R.members(scope.campaign).length);
  plain('crew.has', (scope, s) => R.members(scope.campaign).some((m) => m.speciesId === s.species),
    { species: { type: 'string', required: true } });
  plain('crew.inSickBay', (scope) => R.members(scope.campaign).filter((m) => m.status === 'sick-bay').length);
  plain('planet.rivals', (scope) => { const p = planetOf(scope.campaign); return p ? p.rivals.length : 0; });
  plain('planet.patrons', (scope) => { const p = planetOf(scope.campaign); return p ? p.patrons.length : 0; });
  plain('planet.disabledRivals', (scope) => { const p = planetOf(scope.campaign); return p ? p.disabledRivals.length : 0; });
  facts.register({
    id: 'condition.has',
    params: { type: { type: 'string', required: true } },
    get: (scope, s, ref) => (scope.campaign.conditions || []).some((c) => c.type === s.type && (!ref || c.targetId === ref.id))
  });
  plain('turn.casualtyIds', (scope) => scope.turn.casualtyIds || []);
  plain('turn.casualtyCount', (scope) => (scope.turn.casualtyIds || []).length);
  plain('turn.mission', (scope) => scope.turn.mission || null);

  LP.events = LP.events || {};
  Object.assign(LP.events, { facts, makeScope, entity, props, isRef, nameOfRef, planetOf, motivations, STAT_KEYS });
})(window.LP);
