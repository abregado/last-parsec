(function (LP) {
  'use strict';

  /*
   * Effects: what an event changes. An effect step is planned while the event runs
   * (dice rolled, people and items picked) into plain "ops" that hold only ids and
   * numbers. The ledger shows the ops, and applies them again to the real campaign
   * when the player presses Apply, so applying is deterministic and can be replayed.
   *
   *   def = { id, params, entity?, build(scope, p, util) -> op | { ops, lines, steps }, describe(campaign, op), apply(campaign, op) }
   *   p      the step's settings with $variables, dice and refs resolved
   *   util   { amount(value, label) -> number (rolls dice and adds a roll line), say(text) }
   *   op     { effect: id, ...ids and numbers }
   *   describe runs before apply on the same state, so it can show "Credits 12 → 9".
   *   apply   must cope with a missing target (they left the crew since).
   */

  const E = LP.events;
  const R = LP.roster;
  const P = LP.planets;
  const effects = LP.registry.create('effect');
  const STATS = E.STAT_KEYS;
  const RESOURCES = R.RESOURCES.map((r) => r.key);

  function name(campaign, kind, id) {
    return E.nameOfRef(campaign, { ref: kind, id: id }) || 'Someone';
  }

  function signed(n) {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function turnOf(campaign) {
    return R.turnNumber(campaign);
  }

  function planetWith(campaign, key, id) {
    const offKey = 'disabled' + key.charAt(0).toUpperCase() + key.slice(1);
    return (campaign.planets || []).find((pl) => pl[key].some((x) => x.id === id) || pl[offKey].some((x) => x.id === id)) || null;
  }

  function define(def) {
    effects.register(def);
  }

  const MEMBER = { type: 'ref', required: true };

  /* ---------------------------------------------------------------------- */
  /* Resources                                                              */
  /* ---------------------------------------------------------------------- */

  define({
    id: 'resource',
    params: { key: { type: 'enum', options: RESOURCES, required: true }, amount: { type: 'dice', required: true } },
    build: (scope, p, util) => ({ effect: 'resource', key: p.key, amount: util.amount(p.amount, R.RESOURCES.find((r) => r.key === p.key).label) }),
    describe(c, op) {
      const label = R.RESOURCES.find((r) => r.key === op.key).label;
      const now = R.roster(c).resources[op.key];
      const next = Math.max(0, now + op.amount);
      return label + ' ' + now + ' → ' + next + ' (' + signed(next - now) + (next - now !== op.amount ? ', all they had' : '') + ')';
    },
    apply(c, op) {
      const r = R.roster(c).resources;
      r[op.key] = Math.max(0, r[op.key] + op.amount);
    }
  });

  // Pay now; if the crew cannot afford it, run `else` instead (usually adding a condition).
  define({
    id: 'pay',
    params: { amount: { type: 'dice', required: true }, else: { type: 'steps' } },
    build(scope, p, util) {
      const cost = Math.abs(util.amount(p.amount, 'Cost'));
      const credits = R.roster(scope.campaign).resources.credits;
      if (credits >= cost) return { effect: 'resource', key: 'credits', amount: -cost };
      return { ops: [], steps: p.else || [], lines: [util.text('The crew can’t pay ' + plural(cost, 'credit', 'credits') + ' (they have ' + credits + ').', 'bad')], vars: { cost: cost } };
    },
    describe: () => '',
    apply: () => {}
  });

  /* ---------------------------------------------------------------------- */
  /* Crew                                                                   */
  /* ---------------------------------------------------------------------- */

  define({
    id: 'xp',
    entity: 'member',
    params: { target: MEMBER, amount: { type: 'dice', required: true } },
    build: (scope, p, util) => ({ effect: 'xp', target: p.target.id, amount: util.amount(p.amount, 'XP') }),
    describe(c, op) {
      const m = R.getMember(c, op.target);
      return name(c, 'member', op.target) + ' ' + signed(op.amount) + ' XP' + (m ? ' (' + m.xp + ' → ' + Math.max(0, m.xp + op.amount) + ')' : '');
    },
    apply(c, op) {
      const m = R.getMember(c, op.target);
      if (m) m.xp = Math.max(0, m.xp + op.amount);
    }
  });

  define({
    id: 'stat',
    entity: 'member',
    params: { target: MEMBER, stat: { type: 'enum', options: STATS, required: true }, amount: { type: 'number', required: true } },
    build(scope, p, util) {
      const member = R.getMember(scope.campaign, p.target.id);
      if (!member) return { ops: [] };
      const cap = LP.data.species.capFor(member.speciesId, p.stat);
      if (p.amount > 0 && member.profile[p.stat] >= cap) {
        return { ops: [], lines: [util.text(R.nameOf(member) + ' can’t gain any more ' + p.stat + ' (the limit is ' + cap + ').', 'note')] };
      }
      return { effect: 'stat', target: p.target.id, stat: p.stat, amount: p.amount, cap: cap };
    },
    describe(c, op) {
      const m = R.getMember(c, op.target);
      return name(c, 'member', op.target) + ' ' + op.stat + ' ' + signed(op.amount) + (m ? ' (' + m.profile[op.stat] + ' → ' + Math.min(op.cap, m.profile[op.stat] + op.amount) + ')' : '');
    },
    apply(c, op) {
      const m = R.getMember(c, op.target);
      if (m) m.profile[op.stat] = op.amount > 0 ? Math.min(op.cap, m.profile[op.stat] + op.amount) : m.profile[op.stat] + op.amount;
    }
  });

  // The personal breakthrough: +1 to a random ability that has never been raised and isn't at its cap.
  define({
    id: 'stat.raiseRandom',
    entity: 'member',
    params: { target: MEMBER },
    build(scope, p, util) {
      const member = R.getMember(scope.campaign, p.target.id);
      if (!member) return { ops: [] };
      const open = STATS.filter((s) => s !== 'luck' && member.profile[s] <= member.baseProfile[s] && member.profile[s] < LP.data.species.capFor(member.speciesId, s));
      if (!open.length) return { ops: [], impossible: true };
      const stat = open[LP.rng.int(open.length)];
      return { ops: [{ effect: 'stat', target: member.id, stat: stat, amount: 1, cap: LP.data.species.capFor(member.speciesId, stat) }], lines: [util.text(R.nameOf(member) + ' improves ' + stat + '.')] };
    },
    describe: () => '',
    apply: () => {}
  });

  // Roll the Injury Table (or the Bot one) for a member and plan what it does. Dice in the table's
  // own columns give the time in Sick Bay; deaths are flagged and a character with Luck survives (p.121).
  define({
    id: 'injuryRoll',
    entity: 'member',
    params: { target: MEMBER, row: { type: 'string' } },
    build(scope, p, util) {
      const c = scope.campaign;
      const member = R.getMember(c, p.target.id);
      if (!member) return { ops: [] };
      const machine = R.isMachine(member);
      const tableName = machine ? 'Bot Injury Table' : 'Injury Table';
      const table = LP.rng.getTable(tableName);
      const line = p.row
        ? { type: 'table', table: tableName, die: null, natural: null, rowId: p.row, title: table.rows.find((r) => r.id === p.row)[table.labelColumn], text: table.rows.find((r) => r.id === p.row).effects }
        : LP.turn.line.table(tableName, { textColumn: 'effects' });
      const row = table.rows.find((r) => r.id === line.rowId);
      const id = member.id;
      const who = R.nameOf(member);
      const ops = [];
      const lines = [line];
      const carried = R.itemsOf(c, id);
      const damageAll = () => carried.forEach((i) => ops.push({ effect: 'item.damage', target: i.id }));
      const dies = (damaging) => {
        if (member.profile.luck > 0) {
          ops.push({ effect: 'stat', target: id, stat: 'luck', amount: -member.profile.luck, cap: 99 });
          lines.push(util.text(who + ' would have died, but Luck saves them. All their Luck is lost.', 'good'));
          return;
        }
        if (damaging) damageAll();
        ops.push({ effect: 'member.remove', target: id });
        lines.push(util.text(who + ' ' + (machine ? 'is destroyed' : 'dies') + '.', 'bad'));
      };
      const turns = row[machine ? 'repair_time' : 'campaign_turns_in_sick_bay'];
      if (/^\d/.test(turns) && turns !== '0') ops.push({ effect: 'sickBay', target: id, turns: util.amount(turns, machine ? 'Turns of repair' : 'Turns in Sick Bay') });
      switch (row.id) {
        case 'gruesome-fate': case 'obliterated': dies(true); break;
        case 'death-or-permanent-injury': case 'destroyed': dies(false); break;
        case 'miraculous-escape': {
          if (member.profile.luck < LP.data.species.capFor(member.speciesId, 'luck')) ops.push({ effect: 'stat', target: id, stat: 'luck', amount: 1, cap: LP.data.species.capFor(member.speciesId, 'luck') });
          carried.forEach((i) => ops.push({ effect: 'item.remove', target: i.id }));
          break;
        }
        case 'equipment-loss':
          if (carried.length) ops.push({ effect: 'item.damage', target: carried[LP.rng.int(carried.length)].id });
          break;
        case 'crippling-wound':
          lines.push(Object.assign(util.text('Pay 1D6 credits for surgery now, or lose 1 from the higher of Speed and Toughness for good. Do this by hand.', 'note'), { manual: true }));
          break;
        case 'school-of-hard-knocks': ops.push({ effect: 'xp', target: id, amount: 1 }); break;
        default:
      }
      return { ops: ops, lines: lines };
    },
    describe: () => '',
    apply: () => {}
  });

  // Positive turns put them in Sick Bay (or add to the time); negative turns shorten it.
  define({
    id: 'sickBay',
    entity: 'member',
    params: { target: MEMBER, turns: { type: 'dice', required: true } },
    build: (scope, p, util) => ({ effect: 'sickBay', target: p.target.id, turns: util.amount(p.turns, 'Sick Bay turns') }),
    describe(c, op) {
      const m = R.getMember(c, op.target);
      const who = name(c, 'member', op.target);
      if (op.turns > 0) return who + ' goes to Sick Bay for ' + plural(op.turns, 'campaign turn', 'campaign turns') + (m && m.status === 'sick-bay' ? ' more' : '');
      return m && m.status === 'sick-bay' ? who + ' recovers faster: ' + m.sickBayTurns + ' → ' + Math.max(0, m.sickBayTurns + op.turns) + ' turns' : who + ' isn’t in Sick Bay';
    },
    apply(c, op) {
      const m = R.getMember(c, op.target);
      if (!m) return;
      if (op.turns > 0) {
        m.sickBayTurns = (m.status === 'sick-bay' ? m.sickBayTurns : 0) + op.turns;
        m.status = 'sick-bay';
      } else if (m.status === 'sick-bay') {
        m.sickBayTurns = Math.max(0, m.sickBayTurns + op.turns);
        if (!m.sickBayTurns) m.status = 'active';
      }
    }
  });

  define({
    id: 'member.remove',
    entity: 'member',
    params: { target: MEMBER },
    build: (scope, p) => ({ effect: 'member.remove', target: p.target.id }),
    describe: (c, op) => name(c, 'member', op.target) + ' leaves the crew; what they carried goes to the Stash',
    apply(c, op) {
      R.removeMember(c, op.target);
      c.conditions = (c.conditions || []).filter((x) => !(x.scope === 'character' && x.targetId === op.target));
      for (const planet of c.planets || []) {
        for (const rival of planet.rivals.filter((r) => r.boundTo === op.target)) P.disableRival(planet, rival.id, { turn: turnOf(c), reason: 'left with the character they were bound to' });
      }
    }
  });

  define({
    id: 'member.add',
    params: { member: { type: 'any', required: true }, items: { type: 'any' } },
    build: (scope, p) => ({ effect: 'member.add', member: p.member, items: p.items || [] }),
    describe: (c, op) => (op.member.name || 'A new character') + ' joins the crew' + ((op.items || []).length ? ', bringing ' + op.items.map((i) => i.name).join(', ') : ''),
    apply(c, op) {
      if (R.getMember(c, op.member.id)) return;
      const member = R.addMember(c, op.member);
      for (const item of op.items || []) {
        const copy = JSON.parse(JSON.stringify(item));
        copy.carrierId = member.id;
        R.roster(c).items.push(copy);
      }
    }
  });

  define({
    id: 'leader.set',
    entity: 'member',
    params: { target: MEMBER },
    build: (scope, p) => ({ effect: 'leader.set', target: p.target.id }),
    describe: (c, op) => name(c, 'member', op.target) + ' becomes the new captain',
    apply(c, op) {
      if (R.getMember(c, op.target)) R.roster(c).leaderId = op.target;
    }
  });

  // The new motivation's ability bonuses are paid as XP instead (p.126).
  define({
    id: 'motivation.set',
    entity: 'member',
    params: { target: MEMBER, row: { type: 'string', required: true } },
    build(scope, p) {
      const table = LP.rng.getTable('Motivation Table');
      const row = table.rows.find((r) => r.id === p.row);
      const bonus = LP.effects.parse(row.effect).stats;
      const xp = STATS.reduce((sum, s) => sum + Math.max(0, bonus[s] || 0), 0);
      return { effect: 'motivation.set', target: p.target.id, row: row.id, label: row[table.labelColumn], xp: xp };
    },
    describe: (c, op) => name(c, 'member', op.target) + '’s motivation becomes ' + op.label + (op.xp ? ' (+' + op.xp + ' XP in place of its ability bonuses)' : ''),
    apply(c, op) {
      const m = R.getMember(c, op.target);
      if (!m) return;
      const existing = m.origins.find((o) => o.table === 'Motivation Table');
      if (existing) Object.assign(existing, { value: op.label, row: op.row });
      else m.origins.push({ label: 'Motivation', value: op.label, table: 'Motivation Table', row: op.row });
      m.xp += op.xp;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Ship                                                                   */
  /* ---------------------------------------------------------------------- */

  define({
    id: 'hull',
    params: { amount: { type: 'dice', required: true } },
    build(scope, p, util) {
      if (!R.roster(scope.campaign).ship) return { ops: [], lines: [util.text('The crew has no ship recorded, so the hull is unchanged.', 'note')] };
      return { effect: 'hull', amount: util.amount(p.amount, 'Hull') };
    },
    describe(c, op) {
      const ship = R.roster(c).ship;
      const next = Math.min(ship.hullMax, Math.max(0, ship.hull + op.amount));
      return 'Hull ' + ship.hull + ' → ' + next + ' (' + signed(op.amount) + ')';
    },
    apply(c, op) {
      const ship = R.roster(c).ship;
      if (ship) ship.hull = Math.min(ship.hullMax, Math.max(0, ship.hull + op.amount));
    }
  });

  define({
    id: 'debt',
    params: { amount: { type: 'dice', required: true } },
    build(scope, p, util) {
      if (!R.roster(scope.campaign).ship) return { ops: [], lines: [util.text('The crew has no ship recorded, so there is no debt to change.', 'note')] };
      return { effect: 'debt', amount: util.amount(p.amount, 'Debt') };
    },
    describe(c, op) {
      const ship = R.roster(c).ship;
      return 'Ship debt ' + ship.debt + ' → ' + Math.max(0, ship.debt + op.amount);
    },
    apply(c, op) {
      const ship = R.roster(c).ship;
      if (ship) ship.debt = Math.max(0, ship.debt + op.amount);
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Items                                                                  */
  /* ---------------------------------------------------------------------- */

  /** The row of `table` with this label, or null. */
  function rowByName(table, name) {
    const t = LP.rng.getTable(table);
    const wanted = String(name).trim().toLowerCase();
    return t.rows.find((r) => String(r[t.labelColumn]).trim().toLowerCase() === wanted) || null;
  }

  function tableExists(name) {
    try { return !!LP.rng.getTable(name); } catch (e) { return false; }
  }

  // An item from a table row (by row id, or by its name in that table), or a plain named item.
  define({
    id: 'item.add',
    params: {
      table: { type: 'string' }, row: { type: 'string' }, name: { type: 'string' },
      damaged: { type: 'boolean' }, to: { type: 'ref', optional: true }, source: { type: 'string' }
    },
    check(p) {
      if (!p.name && !(p.table && p.row)) return ['item.add needs a table and row, a table and name, or a name'];
      if (!p.table) return [];
      if (!tableExists(p.table)) return ['no table called "' + p.table + '"'];
      if (p.row) return LP.rng.getTable(p.table).rows.some((r) => r.id === p.row) ? [] : ['no row "' + p.row + '" in ' + p.table];
      return rowByName(p.table, p.name) ? [] : ['no "' + p.name + '" in ' + p.table];
    },
    build(scope, p) {
      let row = p.row || null;
      if (p.table && !row && p.name) row = rowByName(p.table, p.name).id;
      const fields = {
        table: row ? p.table : null, rowId: row, damaged: !!p.damaged, carrierId: p.to ? p.to.id : null,
        source: p.source || '', turn: turnOf(scope.campaign)
      };
      const items = row ? LP.items.makeAll(fields) : [LP.items.make(Object.assign({ name: p.name }, fields))];
      return { ops: items.map((item) => ({ effect: 'item.add', item: item })) };
    },
    describe: (c, op) => op.item.name + (op.item.damaged ? ' (damaged)' : '') + ' → ' + (op.item.carrierId ? name(c, 'member', op.item.carrierId) : 'Stash'),
    apply(c, op) {
      const roster = R.roster(c);
      if (roster.items.some((i) => i.id === op.item.id)) return;
      const item = JSON.parse(JSON.stringify(op.item));
      if (item.carrierId && !R.getMember(c, item.carrierId)) item.carrierId = null;
      roster.items.push(item);
    }
  });

  function itemEffect(id, verb, change) {
    define({
      id: id,
      entity: 'item',
      params: { target: MEMBER },
      build: (scope, p) => ({ effect: id, target: p.target.id }),
      describe(c, op) {
        const item = R.roster(c).items.find((i) => i.id === op.target);
        return item ? item.name + ' ' + verb : 'An item ' + verb;
      },
      apply(c, op) {
        const roster = R.roster(c);
        const item = roster.items.find((i) => i.id === op.target);
        if (item) change(roster, item);
      }
    });
  }
  itemEffect('item.remove', 'is lost', (roster, item) => { roster.items = roster.items.filter((i) => i.id !== item.id); });
  itemEffect('item.damage', 'is damaged', (roster, item) => { item.damaged = true; });
  itemEffect('item.repair', 'is repaired', (roster, item) => { item.damaged = false; });

  /* ---------------------------------------------------------------------- */
  /* Rivals, Patrons, planets                                               */
  /* ---------------------------------------------------------------------- */

  function contactAdd(kind) {
    const key = kind + 's';
    const make = kind === 'rival' ? P.newRival : P.newPatron;
    define({
      id: kind + '.add',
      params: Object.assign({ as: { type: 'string' } }, kind === 'rival' ? { bindTo: { type: 'ref' } } : {}),
      build(scope, p, util) {
        const planet = P.current(scope.campaign);
        if (!planet) return { ops: [], lines: [util.text('There is no current planet, so no ' + kind + ' is added. Note it down by hand.', 'note')] };
        const scratch = LP.snapshot.scratch(scope.campaign);
        const added = make(scratch, P.get(scratch, planet.id));
        if (p.bindTo) added.boundTo = p.bindTo.id;
        const op = { effect: kind + '.add', planetId: planet.id, contact: added };
        const vars = {};
        if (p.as) vars[p.as] = { ref: kind, id: added.id };
        return { ops: [op], vars: vars };
      },
      describe: (c, op) => 'New ' + kind + ': ' + op.contact.name + (op.contact.boundTo ? ' (follows ' + name(c, 'member', op.contact.boundTo) + ')' : ''),
      apply(c, op) {
        const planet = P.get(c, op.planetId);
        if (planet && !planet[key].some((x) => x.id === op.contact.id)) planet[key].push(JSON.parse(JSON.stringify(op.contact)));
      }
    });
  }
  contactAdd('rival');
  contactAdd('patron');

  function contactSwitch(kind, id, on) {
    const key = kind + 's';
    const set = on ? (kind === 'rival' ? P.enableRival : P.enablePatron) : (kind === 'rival' ? P.disableRival : P.disablePatron);
    define({
      id: kind + '.' + id,
      entity: kind,
      params: Object.assign({ target: MEMBER }, on ? {} : { reason: { type: 'string' } }),
      build: (scope, p) => ({ effect: kind + '.' + id, target: p.target.id, reason: p.reason || '' }),
      describe: (c, op) => {
        const e = E.entity(c, { ref: kind, id: op.target });
        return (e ? e.name : 'A ' + kind) + (on ? ' is back' : ' is set aside' + (op.reason ? ' (' + op.reason + ')' : ''));
      },
      apply(c, op) {
        const planet = planetWith(c, key, op.target);
        if (planet) set(planet, op.target, { turn: turnOf(c), reason: op.reason });
      }
    });
  }
  contactSwitch('rival', 'disable', false);
  contactSwitch('rival', 'enable', true);
  contactSwitch('patron', 'disable', false);
  contactSwitch('patron', 'enable', true);

  // New worlds join the campaign but never become the current planet.
  define({
    id: 'planets.generate',
    params: { count: { type: 'number', required: true }, as: { type: 'string' } },
    build(scope, p, util) {
      if (!Array.isArray(scope.campaign.planets) || !scope.campaign.archetypes) return { ops: [], vars: p.as ? { [p.as]: [] } : {}, lines: [util.text('There are no planets to add worlds to.', 'note')] };
      const scratch = LP.snapshot.scratch(scope.campaign);
      const made = [];
      for (let i = 0; i < p.count; i++) made.push(P.createPlanet(scratch, {}).planet);
      const vars = {};
      if (p.as) vars[p.as] = made.map((pl) => pl.id);
      return { ops: [{ effect: 'planets.generate', planets: made }], vars: vars };
    },
    describe: (c, op) => 'New worlds: ' + op.planets.map((pl) => pl.name).join(', '),
    apply(c, op) {
      for (const pl of op.planets) if (!P.get(c, pl.id)) c.planets.push(JSON.parse(JSON.stringify(pl)));
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Conditions (js/rules/conditions.js)                                    */
  /* ---------------------------------------------------------------------- */

  function condName(c, inst) {
    const type = LP.conditions.typeOf(c, inst.type);
    const member = inst.scope === 'character' ? R.getMember(c, inst.targetId) : null;
    return (type ? type.name : inst.type) + (member ? ' (' + R.nameOf(member) + ')' : '');
  }

  // Unless `turns` is given, the type decides how long it lasts and what happens to a duplicate.
  define({
    id: 'condition.add',
    params: {
      type: { type: 'string', required: true },
      scope: { type: 'enum', options: ['crew', 'character', 'planet', 'campaign', 'ship', 'rival', 'patron'] },
      target: { type: 'ref', optional: true }, params: { type: 'any' },
      turns: { type: 'number' }, from: { type: 'enum', options: ['now', 'next'] }, source: { type: 'string' }
    },
    build(scope, p, util) {
      return { ops: LP.conditions.addOps(scope.campaign, p.type, { scope: p.scope, targetId: p.target ? p.target.id : null, params: p.params, turns: p.turns, from: p.from, source: p.source }) };
    },
    describe: (c, op) => condName(c, op.condition) + ' begins',
    apply(c, op) {
      c.conditions = c.conditions || [];
      if (!c.conditions.some((x) => x.id === op.condition.id)) c.conditions.push(JSON.parse(JSON.stringify(op.condition)));
    }
  });

  // By id, or every condition of a type (on one target, if given).
  define({
    id: 'condition.remove',
    params: { id: { type: 'string' }, type: { type: 'string' }, target: { type: 'ref', optional: true } },
    build: (scope, p) => ({ effect: 'condition.remove', id: p.id || null, type: p.type || null, targetId: p.target ? p.target.id : null }),
    describe(c, op) {
      const inst = (c.conditions || []).find((x) => (op.id ? x.id === op.id : x.type === op.type && (!op.targetId || x.targetId === op.targetId)));
      return (inst ? condName(c, inst) : op.type || 'A condition') + ' ends';
    },
    apply(c, op) {
      c.conditions = (c.conditions || []).filter((x) => !(op.id ? x.id === op.id : x.type === op.type && (!op.targetId || x.targetId === op.targetId)));
    }
  });

  define({
    id: 'condition.tick',
    params: { id: { type: 'string', required: true }, delta: { type: 'number', required: true } },
    build: (scope, p) => ({ effect: 'condition.tick', id: p.id, delta: p.delta }),
    describe(c, op) {
      const inst = (c.conditions || []).find((x) => x.id === op.id);
      return inst ? condName(c, inst) + ': ' + inst.remaining + ' → ' + (inst.remaining + op.delta) + ' turns left' : '';
    },
    apply(c, op) {
      const inst = (c.conditions || []).find((x) => x.id === op.id);
      if (inst && inst.remaining !== null) inst.remaining += op.delta;
    }
  });

  // An item goes missing: it leaves the roster and a condition keeps a copy to give back.
  define({
    id: 'item.hold',
    entity: 'item',
    params: { target: MEMBER, type: { type: 'string', required: true } },
    build(scope, p) {
      const item = R.roster(scope.campaign).items.find((i) => i.id === p.target.id);
      if (!item) return { ops: [] };
      const inst = LP.conditions.make(scope.campaign, p.type, { scope: 'character', targetId: item.carrierId, params: { item: JSON.parse(JSON.stringify(item)) } });
      return { ops: [{ effect: 'item.remove', target: item.id }, { effect: 'condition.add', condition: inst }], lines: [] };
    },
    describe: () => '',
    apply: () => {}
  });

  // The held item comes back to a member, or the Stash if they are gone.
  define({
    id: 'item.restore',
    params: { item: { type: 'any', required: true }, to: { type: 'ref', optional: true } },
    build: (scope, p) => ({ effect: 'item.restore', item: p.item, to: p.to ? p.to.id : null }),
    describe: (c, op) => op.item.name + ' turns up again' + (op.to && R.getMember(c, op.to) ? ' with ' + R.nameOf(R.getMember(c, op.to)) : ' in the Stash'),
    apply(c, op) {
      const roster = R.roster(c);
      if (roster.items.some((i) => i.id === op.item.id)) return;
      const item = JSON.parse(JSON.stringify(op.item));
      item.carrierId = op.to && R.getMember(c, op.to) ? op.to : null;
      roster.items.push(item);
    }
  });

  E.effects = effects;
})(window.LP);
