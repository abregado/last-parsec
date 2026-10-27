(function (LP) {
  'use strict';

  /*
   * Event packs: the file format for sharing events, and the checks that keep a
   * hand-written or imported pack from breaking a run.
   *
   *   pack = {
   *     format: 'last-parsec-events', version: 1,
   *     pack: { id, name, author?, version?, description? },
   *     events:     [{ id, table, weight, title, text?, group?, requires?, steps, fallback? }],
   *     conditions: [type],                      // condition types (see js/rules/conditions.js)
   *     fragments:  [{ id, steps }]
   *   }
   * An event's full id is "packId:eventId"; that is what archetypes and the disabled list store.
   * `table` is travel, character, exploration, trade or campaign.
   */

  const E = LP.events;
  const FORMAT = 'last-parsec-events';
  const VERSION = 1;
  const SLUG = /^[a-z0-9][a-z0-9-]*$/;

  function fullId(pack, event) {
    return pack.pack.id + ':' + event.id;
  }

  /** Every problem with a pack, worded for the person who wrote it. Empty means it is fine. */
  function validate(pack) {
    if (!pack || typeof pack !== 'object') return ['This is not an event pack.'];
    if (pack.format !== FORMAT) return ['This file is not a Last Parsec event pack.'];
    if (pack.version !== VERSION) return ['This pack is version ' + pack.version + '; this app reads version ' + VERSION + '.'];
    const problems = [];
    const meta = pack.pack || {};
    if (!SLUG.test(meta.id || '')) problems.push('The pack needs an id of lower-case letters, numbers and dashes.');
    if (typeof meta.name !== 'string' || !meta.name.trim()) problems.push('The pack needs a name.');

    const events = Array.isArray(pack.events) ? pack.events : [];
    const fragments = Array.isArray(pack.fragments) ? pack.fragments : [];
    const ctx = {
      groups: Array.from(new Set(events.map((e) => e.group).filter(Boolean))),
      fragments: fragments.map((f) => f.id)
    };

    const seen = new Set();
    events.forEach((ev, i) => {
      const where = 'Event ' + (ev && ev.id ? '"' + ev.id + '"' : '#' + (i + 1));
      if (!ev || typeof ev !== 'object') { problems.push(where + ' must be an object.'); return; }
      if (!SLUG.test(ev.id || '')) problems.push(where + ' needs an id of lower-case letters, numbers and dashes.');
      else if (seen.has(ev.id)) problems.push(where + ' is used twice.');
      seen.add(ev.id);
      if (!E.run.EVENT_TABLES.includes(ev.table)) problems.push(where + ': table must be ' + E.run.EVENT_TABLES.join(', ') + '.');
      if (typeof ev.weight !== 'number' || !(ev.weight > 0)) problems.push(where + ' needs a weight above 0.');
      if (typeof ev.title !== 'string' || !ev.title.trim()) problems.push(where + ' needs a title.');
      if (ev.group !== undefined && typeof ev.group !== 'string') problems.push(where + ': group must be text.');
      if (ev.requires) {
        problems.push(...LP.predicate.validate(ev.requires, E.facts, 'requires').map((p) => where + ': ' + p));
        if (LP.predicate.asks(ev.requires).length) problems.push(where + ': requires can’t ask the player a question.');
      }
      problems.push(...E.run.validateSteps(ev.steps || [], 'steps', ctx).map((p) => where + ': ' + p));
      if (ev.fallback) problems.push(...E.run.validateSteps(ev.fallback, 'fallback', ctx).map((p) => where + ': ' + p));
    });

    const seenFragments = new Set();
    fragments.forEach((f) => {
      if (!f || !SLUG.test(f.id || '')) problems.push('A fragment needs an id of lower-case letters, numbers and dashes.');
      else if (seenFragments.has(f.id)) problems.push('Fragment "' + f.id + '" is used twice.');
      else seenFragments.add(f.id);
      problems.push(...E.run.validateSteps(f && f.steps, 'Fragment "' + (f && f.id) + '" steps', ctx));
    });

    const seenTypes = new Set();
    for (const c of Array.isArray(pack.conditions) ? pack.conditions : []) {
      if (c && seenTypes.has(c.id)) problems.push('Condition "' + c.id + '" is used twice.');
      seenTypes.add(c && c.id);
      problems.push(...LP.conditions.validateType(c));
    }
    return problems;
  }

  /**
   * Add an imported pack on top of the ones a campaign has. A pack id that is
   * already taken gets a numbered suffix. Returns { pack, renamedFrom } (renamedFrom null if not renamed).
   */
  function importPack(existing, incoming) {
    const problems = validate(incoming);
    if (problems.length) throw new Error(problems[0] + (problems.length > 1 ? ' (and ' + (problems.length - 1) + ' more problems)' : ''));
    const taken = new Set(existing.map((p) => p.pack.id));
    const copy = JSON.parse(JSON.stringify(incoming));
    const original = copy.pack.id;
    let id = original;
    for (let n = 2; taken.has(id); n++) id = original + '-' + n;
    copy.pack.id = id;
    return { pack: copy, renamedFrom: id === original ? null : original };
  }

  /**
   * What a turn stage hands the runner: the campaign's packs, the events it has switched off, what the
   * current planet's archetype allows, and the env for the roll tables inside events (Loot and so on).
   * options: { archetype, turn, vars, source (what to credit items to: "a campaign event") }
   */
  function env(campaign, options) {
    const o = options || {};
    const planet = LP.planets && Array.isArray(campaign.planets) ? LP.planets.current(campaign) : null;
    const archetype = o.archetype !== undefined ? o.archetype : (planet ? LP.planets.archetypeOf(campaign, planet) : null);
    // Events of the campaign's own packs that don't validate are left out rather than breaking a roll.
    const broken = [];
    for (const p of campaign.eventPacks || []) {
      for (const problem of validate(p)) {
        const m = /^Event "([^"]+)"/.exec(problem);
        if (m) broken.push(p.pack.id + ':' + m[1]);
      }
    }
    return {
      packs: LP.conditions.packs(campaign),
      disabled: (campaign.eventsDisabled || []).concat(broken),
      allowed: LP.archetypes.eventFilter(campaign, archetype),
      turn: o.turn || {},
      vars: o.vars || {},
      source: o.source || null,
      followup: {
        crewSize: campaign.settings.crewSize,
        disabled: LP.archetypes.disabledMap(campaign, archetype),
        speciesWeights: LP.archetypes.speciesWeights(archetype),
        rivalNames: planet ? planet.rivals.map((r) => r.name) : null
      }
    };
  }

  E.pack = { FORMAT, VERSION, validate, importPack, fullId, env };
})(window.LP);
