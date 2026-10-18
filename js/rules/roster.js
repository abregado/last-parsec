(function (LP) {
  'use strict';

  /*
   * The crew as it is now (the Crew tab). The Characters tab generates
   * characters; Finalize turns them into roster members and their rolled
   * equipment into items.
   *
   *   campaign.roster = {
   *     members: [Member],
   *     items: [Item],              // LP.items; carrierId null = Stash
   *     ship: Ship | null,
   *     leaderId: string | null,
   *     metThrough, characterizedAs: string | null,   // labels from crew creation
   *     start: { credits, storyPoints, patrons, rivals, questRumors } | null,
   *     notes: string
   *   }
   *   Member = {
   *     id, name, speciesId, origins: [{ label, value }],
   *     profile: { reactions, speed, combat, toughness, savvy, luck },
   *     xp, status: 'active' | 'sick-bay', sickBayTurns, joinedTurn, notes
   *   }
   *   Ship = { name, rowId, type, hull, hullMax, debt, traits: [string] }
   *
   *   campaign.turnNumber: the campaign turn being played (1 = the first).
   */

  const STATS = ['reactions', 'speed', 'combat', 'toughness', 'savvy', 'luck'];
  const STATUSES = [
    { id: 'active', label: 'Active' },
    { id: 'sick-bay', label: 'In Sick Bay' }
  ];

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  function int(value, fallback) {
    const n = parseInt(value, 10);
    return isNaN(n) ? fallback : n;
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  /* ---------------------------------------------------------------------- */
  /* Structure                                                              */
  /* ---------------------------------------------------------------------- */

  function normalizeMember(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const profile = {};
    for (const stat of STATS) profile[stat] = int(raw.profile && raw.profile[stat], 0);
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
      name: text(raw.name),
      speciesId: typeof raw.speciesId === 'string' ? raw.speciesId : null,
      origins: Array.isArray(raw.origins) ? raw.origins.filter((o) => o && o.label).map((o) => ({ label: String(o.label), value: text(o.value) })) : [],
      profile: profile,
      xp: Math.max(0, int(raw.xp, 0)),
      status: STATUSES.some((s) => s.id === raw.status) ? raw.status : 'active',
      sickBayTurns: Math.max(0, int(raw.sickBayTurns, 0)),
      joinedTurn: int(raw.joinedTurn, 0),
      notes: text(raw.notes)
    };
  }

  function normalizeShip(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const hullMax = Math.max(0, int(raw.hullMax, 0));
    return {
      name: text(raw.name),
      rowId: typeof raw.rowId === 'string' ? raw.rowId : null,
      type: text(raw.type),
      hull: Math.max(0, int(raw.hull, hullMax)),
      hullMax: hullMax,
      debt: Math.max(0, int(raw.debt, 0)),
      traits: Array.isArray(raw.traits) ? raw.traits.map(String) : []
    };
  }

  /** Fill in or repair campaign.roster (and campaign.turnNumber). Returns the roster. */
  function ensure(campaign) {
    const raw = campaign.roster && typeof campaign.roster === 'object' ? campaign.roster : {};
    const members = (Array.isArray(raw.members) ? raw.members : []).map(normalizeMember).filter(Boolean);
    const ids = new Set(members.map((m) => m.id));
    const items = (Array.isArray(raw.items) ? raw.items : []).map(LP.items.normalize).filter(Boolean);
    for (const item of items) if (item.carrierId && !ids.has(item.carrierId)) item.carrierId = null;
    const start = raw.start && typeof raw.start === 'object' ? raw.start : null;
    campaign.roster = {
      members: members,
      items: items,
      ship: normalizeShip(raw.ship),
      leaderId: ids.has(raw.leaderId) ? raw.leaderId : null,
      metThrough: typeof raw.metThrough === 'string' ? raw.metThrough : null,
      characterizedAs: typeof raw.characterizedAs === 'string' ? raw.characterizedAs : null,
      start: start ? {
        credits: int(start.credits, 0), storyPoints: int(start.storyPoints, 0), patrons: int(start.patrons, 0),
        rivals: int(start.rivals, 0), questRumors: int(start.questRumors, 0)
      } : null,
      notes: text(raw.notes)
    };
    campaign.turnNumber = Math.max(1, int(campaign.turnNumber, 1));
    return campaign.roster;
  }

  function roster(campaign) {
    return campaign.roster && Array.isArray(campaign.roster.members) ? campaign.roster : ensure(campaign);
  }

  /** True once a crew has been finalized: the turn and battle then use named characters. */
  function hasCrew(campaign) {
    return !!(campaign && campaign.roster && Array.isArray(campaign.roster.members) && campaign.roster.members.length);
  }

  function turnNumber(campaign) {
    return Math.max(1, int(campaign && campaign.turnNumber, 1));
  }

  /* ---------------------------------------------------------------------- */
  /* Members                                                                */
  /* ---------------------------------------------------------------------- */

  function species(member) {
    return member && member.speciesId ? LP.data.species.byId[member.speciesId] || null : null;
  }

  function isBot(member) {
    const s = species(member);
    return !!(s && s.bot);
  }

  /** Bots and Soulless use the Bot Injury Table and have no Character Events. */
  function isMachine(member) {
    return isBot(member) || (member && member.speciesId === 'soulless');
  }

  function isEngineer(member) {
    return !!member && member.speciesId === 'engineer';
  }

  function nameOf(member) {
    return member && member.name.trim() ? member.name.trim() : 'Unnamed character';
  }

  function getMember(campaign, id) {
    return id ? roster(campaign).members.find((m) => m.id === id) || null : null;
  }

  function members(campaign) {
    return hasCrew(campaign) ? roster(campaign).members : [];
  }

  /** Crew who can take tasks and fight (not in Sick Bay). */
  function available(campaign) {
    return members(campaign).filter((m) => m.status !== 'sick-bay');
  }

  /** { value, label, hint } options for stage fields. */
  function memberOptions(list) {
    return list.map((m) => {
      const s = species(m);
      return { value: m.id, label: nameOf(m), hint: (s ? s.name : '') + (m.status === 'sick-bay' ? ' · Sick Bay' : '') };
    });
  }

  function namesOf(campaign, ids) {
    return (ids || []).map((id) => getMember(campaign, id)).filter(Boolean).map(nameOf);
  }

  /** "Ava, Bren and Cole". */
  function listText(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /** Who a Savvy roll is for: { name, savvy, engineer } (followup `who`). */
  function who(member) {
    return { name: nameOf(member), savvy: member.profile.savvy, engineer: isEngineer(member) };
  }

  /** Add a crew member by hand (fields as Member). Returns the member. */
  function addMember(campaign, fields) {
    const member = normalizeMember(Object.assign({ joinedTurn: turnNumber(campaign) }, fields));
    roster(campaign).members.push(member);
    return member;
  }

  function removeMember(campaign, id) {
    const r = roster(campaign);
    r.members = r.members.filter((m) => m.id !== id);
    for (const item of r.items) if (item.carrierId === id) item.carrierId = null;
    if (r.leaderId === id) r.leaderId = null;
  }

  /* ---------------------------------------------------------------------- */
  /* Turn helpers                                                           */
  /* ---------------------------------------------------------------------- */

  /** The crew size a stage uses: the roster's, or the number the player typed. */
  function crewCount(ctx, typed) {
    if (hasCrew(ctx.campaign)) return members(ctx.campaign).length;
    return typed || ctx.memory.crewCount || ctx.settings.crewSize;
  }

  /** Follow-up env values for picking random crew: names when there is a crew. */
  function crewEnv(ctx, typed, list) {
    if (!hasCrew(ctx.campaign)) return { crewCount: typed || ctx.memory.crewCount || ctx.settings.crewSize };
    const pool = list || members(ctx.campaign);
    return { crewCount: pool.length, crewNames: pool.map(nameOf) };
  }

  /* ---------------------------------------------------------------------- */
  /* Items                                                                  */
  /* ---------------------------------------------------------------------- */

  function itemsOf(campaign, carrierId) {
    return roster(campaign).items.filter((i) => (i.carrierId || null) === (carrierId || null));
  }

  function addItem(campaign, fields) {
    const item = LP.items.make(fields);
    roster(campaign).items.push(item);
    return item;
  }

  function removeItem(campaign, id) {
    const r = roster(campaign);
    r.items = r.items.filter((i) => i.id !== id);
  }

  function moveItem(campaign, id, carrierId) {
    const item = roster(campaign).items.find((i) => i.id === id);
    if (!item) return false;
    item.carrierId = carrierId && getMember(campaign, carrierId) ? carrierId : null;
    return true;
  }

  /** Take back the items a turn stage added (exact tag, or every tag starting with prefix). */
  function removeTagged(campaign, tag, prefix) {
    if (!campaign.roster || !Array.isArray(campaign.roster.items)) return;
    campaign.roster.items = campaign.roster.items.filter((i) => !i.tag || (prefix ? !i.tag.startsWith(tag) : i.tag !== tag));
  }

  /**
   * Put a stage's gained items in the Stash (only when there is a crew).
   * The same roll (same key and row) keeps its item, so moves and edits
   * survive a choice being made or undone. Marks each line with
   * line.item = 'stash' (added) or 'manual' (the player adds it if it applies).
   */
  function syncStageItems(campaign, tag, output, what) {
    const found = LP.items.linesIn(output);
    for (const f of found) {
      f.line.item = f.manual ? 'manual' : 'stash';
      f.line.itemKey = f.key;
      f.line.itemSource = LP.items.sourceText(f.what || what.label, what.planet, what.turn);
      if (f.damaged) f.line.itemDamaged = true;
    }
    if (!hasCrew(campaign)) return;
    const r = roster(campaign);
    const old = r.items.filter((i) => i.tag === tag);
    r.items = r.items.filter((i) => i.tag !== tag);
    for (const f of found) {
      if (f.manual) continue;
      const kept = old.find((i) => i.key === f.key && i.rowId === f.line.rowId);
      if (kept) {
        r.items.push(kept);
        continue;
      }
      r.items.push(LP.items.make({ table: f.line.table, rowId: f.line.rowId, damaged: f.damaged, source: f.line.itemSource, turn: what.turn, tag: tag, key: f.key }));
    }
  }

  /** Add an item the player confirmed from a result card (a "manual" line). */
  function addFromLine(campaign, tag, line) {
    if (!hasCrew(campaign)) return null;
    return addItem(campaign, {
      table: line.table, rowId: line.rowId, damaged: !!line.itemDamaged, source: line.itemSource || '',
      turn: turnNumber(campaign), tag: tag + '#manual', key: line.itemKey
    });
  }

  function hasManual(campaign, tag, line) {
    return hasCrew(campaign) && roster(campaign).items.some((i) => i.tag === tag + '#manual' && i.key === line.itemKey);
  }

  /* ---------------------------------------------------------------------- */
  /* Finalize                                                               */
  /* ---------------------------------------------------------------------- */

  /** Why the Characters tab can't be finalized yet, or null. */
  function finalizeProblem(campaign) {
    const chars = campaign.characters;
    if (!chars.length) return 'Add at least one character first.';
    const incomplete = chars.filter((c) => !LP.character.resolve(c).complete);
    if (incomplete.length) return incomplete.length === 1 ? 'One character still has missing results.' : incomplete.length + ' characters still have missing results.';
    if (!hasCrew(campaign)) {
      const crew = campaign.crew;
      if (!crew.generated || crew.equipment.some((s) => !s.value) || !crew.ship.value) return 'Generate the crew’s starting equipment and ship first.';
    }
    return null;
  }

  function memberFrom(character, isLeader, turn) {
    const r = LP.character.resolve(character, { isLeader: isLeader });
    return normalizeMember({
      id: character.id,
      name: character.name,
      speciesId: r.species ? r.species.id : null,
      origins: r.origins.map((o) => ({ label: o.label, value: LP.character.rowLabel(o.table, o.row) })),
      profile: r.profile,
      xp: r.xp,
      joinedTurn: turn
    });
  }

  /**
   * Move the Characters tab into the crew. The first time, the crew's
   * starting equipment goes to the Stash and the ship is set up; later
   * finalizes add recruits. The generator is emptied afterwards.
   * Returns { added, error }.
   */
  function finalize(campaign) {
    const problem = finalizeProblem(campaign);
    if (problem) return { error: problem };
    const r = roster(campaign);
    const first = !hasCrew(campaign);
    const turn = first ? 0 : turnNumber(campaign);
    const crew = campaign.crew;
    const added = [];

    for (const character of campaign.characters) {
      const isLeader = first && crew.leaderId === character.id;
      const member = memberFrom(character, isLeader, turn);
      if (r.members.some((m) => m.id === member.id)) member.id = newId();
      r.members.push(member);
      added.push(member);
      const res = LP.character.resolve(character, { isLeader: isLeader });
      for (const it of res.items) {
        addItem(campaign, {
          table: it.table, rowId: it.row.id, carrierId: member.id, turn: turn,
          source: first ? 'Starting item from ' + nameOf(member) + '’s origin rolls, at crew creation.' : 'Brought by ' + nameOf(member) + ' when they joined on turn ' + turn + '.'
        });
      }
      if (isLeader) r.leaderId = member.id;
    }

    if (first) {
      const summary = LP.crew.summarize(campaign);
      for (const slot of crew.equipment) {
        addItem(campaign, { table: slot.table, rowId: slot.value, turn: 0, source: 'Starting crew equipment, rolled at crew creation.' });
      }
      if (summary.ship) {
        const row = summary.ship.row;
        r.ship = normalizeShip({
          name: '', rowId: row.id, type: row[LP.rng.getTable('Ship Table').labelColumn],
          hull: summary.ship.hull, hullMax: summary.ship.hull, debt: summary.ship.debt || 0,
          traits: summary.ship.traits.map((t) => t.name)
        });
      }
      const label = (table, id) => id ? LP.character.rowLabel(table, LP.character.findRow(table, id)) : null;
      r.metThrough = label('We Met Through Table', crew.metThrough.value);
      r.characterizedAs = label('We Are Best Characterized As Table', crew.characterizedAs.value);
      r.start = {
        credits: summary.credits.total, storyPoints: summary.storyPoints, patrons: summary.patrons,
        rivals: summary.rivals, questRumors: summary.questRumors
      };
    }

    // Empty the generator, ready for recruits.
    campaign.characters = [];
    campaign.crew = {};
    LP.crew.ensure(campaign);
    return { added: added };
  }

  LP.roster = {
    STATS,
    STATUSES,
    ensure,
    hasCrew,
    turnNumber,
    species,
    isBot,
    isMachine,
    isEngineer,
    nameOf,
    getMember,
    members,
    available,
    memberOptions,
    namesOf,
    listText,
    who,
    addMember,
    removeMember,
    itemsOf,
    addItem,
    removeItem,
    moveItem,
    removeTagged,
    syncStageItems,
    addFromLine,
    hasManual,
    crewCount,
    crewEnv,
    finalizeProblem,
    finalize
  };
})(window.LP);
