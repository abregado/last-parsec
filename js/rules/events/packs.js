(function (LP) {
  'use strict';

  /*
   * A campaign's event packs, as the Events tab edits them. The base pack is locked and not stored in
   * the campaign; everything below changes only what the campaign holds:
   *
   *   campaign.eventPacks     the campaign's own packs (see pack.js for the shape)
   *   campaign.eventsDisabled "packId:eventId" of events switched off, from any pack
   *
   * Ids never change once made (titles and names do), so archetype lists and the disabled list stay
   * valid. Removing events cleans them out of those lists.
   */

  const E = LP.events;
  const A = () => LP.archetypes;
  const DEFAULT_PACK = 'my-events';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function slug(text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';
  }

  function unique(base, taken) {
    let id = base;
    for (let n = 2; taken.includes(id); n++) id = base + '-' + n;
    return id;
  }

  /* ---------------------------------------------------------------------- */
  /* Finding things                                                         */
  /* ---------------------------------------------------------------------- */

  function all(campaign) {
    return LP.conditions.packs(campaign);
  }

  function mine(campaign) {
    if (!Array.isArray(campaign.eventPacks)) campaign.eventPacks = [];
    return campaign.eventPacks;
  }

  function isLocked(campaign, packId) {
    return !mine(campaign).some((p) => p.pack.id === packId);
  }

  function getPack(campaign, packId) {
    return all(campaign).find((p) => p.pack.id === packId) || null;
  }

  /** { pack, event, locked } for a "packId:eventId", or null. */
  function find(campaign, fullId) {
    if (typeof fullId !== 'string') return null;
    const i = fullId.indexOf(':');
    const pack = getPack(campaign, fullId.slice(0, i));
    const event = pack ? (pack.events || []).find((e) => e.id === fullId.slice(i + 1)) : null;
    return event ? { pack: pack, event: event, locked: isLocked(campaign, pack.pack.id) } : null;
  }

  function isDisabled(campaign, fullId) {
    return (campaign.eventsDisabled || []).includes(fullId);
  }

  function setEnabled(campaign, fullId, on) {
    const list = (campaign.eventsDisabled || []).filter((id) => id !== fullId);
    if (!on) list.push(fullId);
    campaign.eventsDisabled = list;
  }

  /** Problems with one event, as the pack validator words them. */
  function eventProblems(campaign, fullId) {
    const found = find(campaign, fullId);
    if (!found) return [];
    const prefix = 'Event "' + found.event.id + '"';
    return E.pack.validate(found.pack).filter((p) => p.indexOf(prefix) === 0);
  }

  /* ---------------------------------------------------------------------- */
  /* Packs                                                                  */
  /* ---------------------------------------------------------------------- */

  function createPack(campaign, name, meta) {
    const taken = all(campaign).map((p) => p.pack.id);
    const m = meta || {};
    const pack = {
      format: E.pack.FORMAT, version: E.pack.VERSION,
      pack: { id: unique(slug(name), taken), name: String(name || 'New pack').trim() || 'New pack', author: m.author || '', version: m.version || '1', description: m.description || '' },
      events: [], conditions: [], fragments: []
    };
    mine(campaign).push(pack);
    return pack;
  }

  /** The pack events are copied into by default, made on first use. */
  function defaultPack(campaign) {
    return mine(campaign).find((p) => p.pack.id === DEFAULT_PACK) || createPack(campaign, 'My events');
  }

  function updatePack(campaign, packId, fields) {
    const pack = mine(campaign).find((p) => p.pack.id === packId);
    if (!pack) return false;
    for (const key of ['name', 'author', 'version', 'description']) if (typeof fields[key] === 'string') pack.pack[key] = fields[key];
    if (!pack.pack.name.trim()) pack.pack.name = 'Unnamed pack';
    return true;
  }

  /** Remove a pack of the campaign's, and every reference to its events. */
  function deletePack(campaign, packId) {
    const pack = mine(campaign).find((p) => p.pack.id === packId);
    if (!pack) return false;
    const ids = pack.events.map((e) => packId + ':' + e.id);
    campaign.eventPacks = mine(campaign).filter((p) => p !== pack);
    forget(campaign, ids);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Events                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Take events out of the disabled list and the archetype lists. */
  function forget(campaign, fullIds) {
    campaign.eventsDisabled = (campaign.eventsDisabled || []).filter((id) => !fullIds.includes(id));
    for (const a of campaign.archetypes || []) {
      for (const key of Object.keys(a.events)) a.events[key] = a.events[key].filter((id) => !fullIds.includes(id));
    }
  }

  /** Let "All options" play new events (an archetype with an empty list for that kind already allows everything). */
  function join(campaign, fullIds) {
    if (A()) A().joinDefault(campaign, fullIds);
  }

  function newEventId(pack, title) {
    return unique(slug(title), pack.events.map((e) => e.id));
  }

  function blankEvent(pack, table, title) {
    return { id: newEventId(pack, title || 'New event'), table: table || 'character', weight: 1, title: title || 'New event', text: '', steps: [] };
  }

  /** A new empty event in one of the campaign's packs. Returns its full id. */
  function addEvent(campaign, packId, table, title) {
    const pack = mine(campaign).find((p) => p.pack.id === packId);
    if (!pack) return null;
    const event = blankEvent(pack, table, title);
    pack.events.push(event);
    join(campaign, [packId + ':' + event.id]);
    return packId + ':' + event.id;
  }

  /** A copy of any event (a locked one too) in one of the campaign's packs. Returns its full id. */
  function duplicateEvent(campaign, fullId, toPackId) {
    const found = find(campaign, fullId);
    if (!found) return null;
    const pack = toPackId ? mine(campaign).find((p) => p.pack.id === toPackId) : defaultPack(campaign);
    if (!pack) return null;
    const copy = clone(found.event);
    copy.id = newEventId(pack, found.event.title);
    pack.events.push(copy);
    join(campaign, [pack.pack.id + ':' + copy.id]);
    return pack.pack.id + ':' + copy.id;
  }

  /** Switch an event off and use an editable copy in its place. Returns the copy's full id. */
  function replaceOriginal(campaign, fullId) {
    const copy = duplicateEvent(campaign, fullId);
    if (copy) setEnabled(campaign, fullId, false);
    return copy;
  }

  function deleteEvent(campaign, fullId) {
    const found = find(campaign, fullId);
    if (!found || found.locked) return false;
    found.pack.events = found.pack.events.filter((e) => e !== found.event);
    forget(campaign, [fullId]);
    return true;
  }

  /** Move an editable event to another of the campaign's packs. Returns its new full id. */
  function moveEvent(campaign, fullId, toPackId) {
    const found = find(campaign, fullId);
    const target = mine(campaign).find((p) => p.pack.id === toPackId);
    if (!found || found.locked || !target || target === found.pack) return null;
    found.pack.events = found.pack.events.filter((e) => e !== found.event);
    const id = unique(found.event.id, target.events.map((e) => e.id));
    const moved = Object.assign({}, found.event, { id: id });
    target.events.push(moved);
    const next = toPackId + ':' + id;
    const rename = (list) => list.map((x) => (x === fullId ? next : x));
    campaign.eventsDisabled = rename(campaign.eventsDisabled || []);
    for (const a of campaign.archetypes || []) for (const key of Object.keys(a.events)) a.events[key] = rename(a.events[key]);
    return next;
  }

  /* ---------------------------------------------------------------------- */
  /* Condition types and fragments in a pack                                */
  /* ---------------------------------------------------------------------- */

  function addConditionType(campaign, packId, name) {
    const pack = mine(campaign).find((p) => p.pack.id === packId);
    if (!pack) return null;
    const type = { id: unique(slug(name || 'new condition'), pack.conditions.map((c) => c.id)), name: name || 'New condition', scope: 'character', text: '' };
    pack.conditions.push(type);
    return type;
  }

  function deleteConditionType(campaign, packId, typeId) {
    const pack = mine(campaign).find((p) => p.pack.id === packId);
    if (!pack) return false;
    pack.conditions = pack.conditions.filter((c) => c.id !== typeId);
    return true;
  }

  function addFragment(campaign, packId, name) {
    const pack = mine(campaign).find((p) => p.pack.id === packId);
    if (!pack) return null;
    const fragment = { id: unique(slug(name || 'fragment'), (pack.fragments || []).map((f) => f.id)), steps: [] };
    pack.fragments = (pack.fragments || []).concat(fragment);
    return fragment;
  }

  function deleteFragment(campaign, packId, fragmentId) {
    const pack = mine(campaign).find((p) => p.pack.id === packId);
    if (!pack) return false;
    pack.fragments = (pack.fragments || []).filter((f) => f.id !== fragmentId);
    return true;
  }

  /* ---------------------------------------------------------------------- */
  /* Export and import                                                      */
  /* ---------------------------------------------------------------------- */

  /** Condition type ids and fragment ids a piece of data refers to. */
  function uses(value, found) {
    const out = found || { conditions: new Set(), fragments: new Set() };
    if (Array.isArray(value)) value.forEach((x) => uses(x, out));
    else if (value && typeof value === 'object') {
      if (['condition.add', 'condition.remove', 'item.hold'].includes(value.effect) && typeof value.type === 'string') out.conditions.add(value.type);
      if (value.fact === 'condition.has' && typeof value.type === 'string') out.conditions.add(value.type);
      if (typeof value.call === 'string') out.fragments.add(value.call);
      for (const x of Object.values(value)) uses(x, out);
    }
    return out;
  }

  /** The whole pack, as a file's data. */
  function exportPack(campaign, packId) {
    const pack = getPack(campaign, packId);
    return pack ? clone(pack) : null;
  }

  /** A new pack made of the chosen events and the condition types and fragments they use. */
  function exportEvents(campaign, fullIds, name) {
    const packs = all(campaign);
    const events = [];
    const need = { conditions: new Set(), fragments: new Set() };
    for (const id of fullIds) {
      const found = find(campaign, id);
      if (!found) continue;
      events.push(clone(found.event));
      uses(found.event, need);
    }
    const conditions = [];
    const fragments = [];
    let grew = true;
    while (grew) {
      grew = false;
      for (const id of Array.from(need.conditions)) {
        if (conditions.some((c) => c.id === id)) continue;
        const type = packs.reduce((hit, p) => hit || (p.conditions || []).find((c) => c.id === id), null);
        if (type) { conditions.push(clone(type)); uses(type, need); grew = true; }
      }
      for (const id of Array.from(need.fragments)) {
        if (fragments.some((f) => f.id === id)) continue;
        const fragment = packs.reduce((hit, p) => hit || (p.fragments || []).find((f) => f.id === id), null);
        if (fragment) { fragments.push(clone(fragment)); uses(fragment, need); grew = true; }
      }
    }
    return {
      format: E.pack.FORMAT, version: E.pack.VERSION,
      pack: { id: slug(name || 'selected-events'), name: name || 'Selected events', author: '', version: '1', description: '' },
      events: events, conditions: conditions, fragments: fragments
    };
  }

  function parse(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('This file isn’t valid JSON.');
    }
  }

  /** What importing would do: { problems: [...], pack, renamedFrom }, without changing anything. */
  function previewImport(campaign, text) {
    let data;
    try { data = parse(text); } catch (e) { return { problems: [e.message] }; }
    const problems = E.pack.validate(data);
    if (problems.length) return { problems: problems };
    const taken = all(campaign).map((p) => ({ pack: { id: p.pack.id } }));
    const result = E.pack.importPack(taken, data);
    return { problems: [], pack: result.pack, renamedFrom: result.renamedFrom };
  }

  /** Add a pack from a file on top of the campaign's own. Returns { pack, renamedFrom }; throws a readable error. */
  function importText(campaign, text) {
    const preview = previewImport(campaign, text);
    if (preview.problems.length) throw new Error(preview.problems[0] + (preview.problems.length > 1 ? ' (and ' + (preview.problems.length - 1) + ' more problems)' : ''));
    mine(campaign).push(preview.pack);
    join(campaign, preview.pack.events.map((e) => preview.pack.pack.id + ':' + e.id));
    return { pack: preview.pack, renamedFrom: preview.renamedFrom };
  }

  /* ---------------------------------------------------------------------- */
  /* Trying an event out                                                    */
  /* ---------------------------------------------------------------------- */

  function testEnv(campaign, fullId, actorId) {
    const env = E.pack.env(campaign, {});
    env.disabled = [];
    env.allowed = (id) => id === fullId;
    env.vars = actorId ? { actor: { ref: 'member', id: actorId } } : {};
    return env;
  }

  /** Play an event as it stands, against a copy of the campaign. Returns the run state (check state.pending). */
  function testStart(campaign, fullId, actorId) {
    const found = find(campaign, fullId);
    return E.run.start(campaign, [{ table: found.event.table }], testEnv(campaign, fullId, actorId));
  }

  function testAnswer(campaign, state, fullId, actorId, value) {
    return E.run.answer(campaign, state, testEnv(campaign, fullId, actorId), value);
  }

  E.packs = {
    DEFAULT_PACK, slug, all, mine, isLocked, getPack, find, isDisabled, setEnabled, eventProblems,
    createPack, defaultPack, updatePack, deletePack,
    blankEvent, addEvent, duplicateEvent, replaceOriginal, deleteEvent, moveEvent,
    addConditionType, deleteConditionType, addFragment, deleteFragment,
    exportPack, exportEvents, previewImport, importText, uses,
    testStart, testAnswer
  };
})(window.LP);
