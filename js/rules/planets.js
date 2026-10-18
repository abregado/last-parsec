(function (LP) {
  'use strict';

  /*
   * Planet instances.
   *
   * campaign.planets = [{
   *   id, name, archetypeId, createdAt,
   *   worldTraits: [traitId],
   *   licence: { required, cost, owned },
   *   patrons: [{ id, entryId, name, patronType, persistent, oneTimeContract, benefit, forces, uniques, notes }],
   *   rivals:  [{ id, entryId, name, enemy: 'Table|rowId' | null, uniques: [uniqueId], hates, notes }],
   *   invasion: null | { status: 'invaded' | 'lost' | 'liberated', enemy: 'Table|rowId' | null, makingGround },
   *   notes
   * }]
   * campaign.currentPlanetId
   */

  const rng = LP.rng;
  const A = LP.archetypes;

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------------------------------------------------------------- */
  /* Names                                                                  */
  /* ---------------------------------------------------------------------- */

  const START = ['Ka', 'Ve', 'Or', 'Tal', 'Mor', 'Zen', 'Ar', 'Qua', 'Hel', 'Dra', 'Ny', 'Sol', 'Ix', 'Cor', 'Bel', 'Rho', 'Tyr', 'Ul', 'Var', 'Esh'];
  const MIDDLE = ['ra', 'lo', 'ni', 'the', 'ven', 'dor', 'si', 'ka', 'mu', 'rin', 'tes', 'an', 'ol', 'ze'];
  const END = ['n', 'x', 'th', 'ra', 'on', 'is', 'ar', 'ia', 'os', 'um', 'el', 'ek'];
  const SUFFIX = ['', '', '', '', ' Prime', ' IV', ' II', ' Minor', ' Station', ' Reach', ' VII'];

  function pick(list) {
    return list[rng.int(list.length)];
  }

  /** A random planet name not already used in the campaign. */
  function randomName(campaign) {
    const used = new Set((campaign && campaign.planets || []).map((p) => p.name));
    for (let i = 0; i < 50; i++) {
      const name = pick(START) + (rng.int(2) ? pick(MIDDLE) : '') + pick(END) + pick(SUFFIX);
      if (!used.has(name)) return name;
    }
    return 'World ' + ((campaign && campaign.planets || []).length + 1);
  }

  /** "Pirates", or "Pirates (2)" if the name is already taken in `existing`. */
  function uniqueName(base, existing) {
    const taken = new Set(existing);
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(base + ' (' + n + ')')) return base + ' (' + n + ')';
  }

  /* ---------------------------------------------------------------------- */
  /* Campaign helpers                                                       */
  /* ---------------------------------------------------------------------- */

  function withNotes(contact) {
    return Object.assign(contact, { notes: typeof contact.notes === 'string' ? contact.notes : '' });
  }

  function normalizePlanet(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const inv = p.invasion && typeof p.invasion === 'object' ? p.invasion : null;
    return {
      id: typeof p.id === 'string' && p.id ? p.id : newId(),
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Unnamed world',
      archetypeId: typeof p.archetypeId === 'string' ? p.archetypeId : null,
      createdAt: p.createdAt || new Date().toISOString(),
      worldTraits: Array.isArray(p.worldTraits) ? p.worldTraits.filter((t) => typeof t === 'string') : [],
      licence: Object.assign({ required: false, cost: 0, owned: false }, p.licence || {}),
      patrons: Array.isArray(p.patrons) ? p.patrons.filter((x) => x && typeof x === 'object').map(withNotes) : [],
      rivals: Array.isArray(p.rivals) ? p.rivals.filter((x) => x && typeof x === 'object').map(withNotes) : [],
      invasion: inv && ['invaded', 'lost', 'liberated'].includes(inv.status)
        ? { status: inv.status, enemy: inv.enemy || null, makingGround: inv.makingGround || 0 } : null,
      notes: typeof p.notes === 'string' ? p.notes : ''
    };
  }

  /** Normalize planets and fix references to missing archetypes. */
  function ensure(campaign) {
    A.ensure(campaign);
    const fallback = campaign.archetypes[0].id;
    campaign.planets = Array.isArray(campaign.planets) ? campaign.planets.map(normalizePlanet) : [];
    for (const p of campaign.planets) if (!A.get(campaign, p.archetypeId)) p.archetypeId = fallback;
    if (!campaign.planets.some((p) => p.id === campaign.currentPlanetId)) campaign.currentPlanetId = null;
    return campaign.planets;
  }

  function get(campaign, id) {
    return (campaign.planets || []).find((p) => p.id === id) || null;
  }

  function current(campaign) {
    return get(campaign, campaign.currentPlanetId);
  }

  function archetypeOf(campaign, planet) {
    return planet ? A.get(campaign, planet.archetypeId) : null;
  }

  function setCurrent(campaign, id) {
    campaign.currentPlanetId = get(campaign, id) ? id : null;
  }

  function remove(campaign, id) {
    campaign.planets = campaign.planets.filter((p) => p.id !== id);
    if (campaign.currentPlanetId === id) campaign.currentPlanetId = null;
  }

  function canVisit(planet) {
    return !(planet.invasion && planet.invasion.status === 'lost');
  }

  /* ---------------------------------------------------------------------- */
  /* Creating worlds                                                        */
  /* ---------------------------------------------------------------------- */

  /** Pick an archetype: by id, or one at random (equally likely). */
  function pickArchetype(campaign, id) {
    if (id && id !== 'random') return A.get(campaign, id) || campaign.archetypes[0];
    return campaign.archetypes[rng.int(campaign.archetypes.length)];
  }

  /**
   * Roll a world's licence and traits from an archetype (p.72).
   * Returns { traits, licence, rolls: { licence, cost, traits: [{ natural, id }] } }.
   */
  function rollWorld(archetype, options) {
    const opts = options || {};
    const licenceRoll = rng.roll('1D6').total;
    const required = licenceRoll >= 5;
    const costRoll = required ? rng.roll('1D6').total : null;
    const exclude = A.excludedTraits(archetype);
    const traitRolls = [];
    const first = rng.rollOn(A.WORLD_TRAITS, { exclude });
    traitRolls.push({ natural: first.natural, id: first.row.id });
    if (opts.wildGalaxy) {
      const second = rng.rollOn(A.WORLD_TRAITS, { exclude });
      traitRolls.push({ natural: second.natural, id: second.row.id });
    }
    const traits = [];
    for (const t of traitRolls) if (!traits.includes(t.id)) traits.push(t.id);
    return {
      traits: traits,
      licence: { required: required, cost: costRoll || 0, owned: false },
      rolls: { licence: licenceRoll, cost: costRoll, traits: traitRolls }
    };
  }

  /** Create and store a planet (not made current). Returns { planet, world }. */
  function createPlanet(campaign, options) {
    const opts = options || {};
    const archetype = pickArchetype(campaign, opts.archetypeId);
    const world = rollWorld(archetype, opts);
    const planet = normalizePlanet({
      id: newId(),
      name: opts.name && opts.name.trim() ? opts.name.trim() : randomName(campaign),
      archetypeId: archetype.id,
      worldTraits: opts.worldTraits || world.traits,
      licence: world.licence
    });
    campaign.planets.push(planet);
    return { planet: planet, world: world, archetype: archetype };
  }

  /* ---------------------------------------------------------------------- */
  /* Patrons and Rivals                                                     */
  /* ---------------------------------------------------------------------- */

  function enemyEnabled(campaign, ref) {
    const i = ref.indexOf('|');
    return LP.models.isEnabled(campaign, ref.slice(0, i), ref.slice(i + 1));
  }

  /** One of an entry's forces, preferring enemies that have models. */
  function pickForce(campaign, forces) {
    if (!forces || !forces.length) return null;
    const enabled = forces.filter((f) => enemyEnabled(campaign, f));
    return pick(enabled.length ? enabled : forces);
  }

  function patronTypeName(id) {
    const row = rng.getTable('Patron Table').rows.find((r) => r.id === id);
    return row ? row.patron_is : id;
  }

  /** New named Patron from the planet's archetype; the type comes from the entry or the Patron Table. */
  function newPatron(campaign, planet, options) {
    const opts = options || {};
    const archetype = archetypeOf(campaign, planet);
    const entries = archetype ? archetype.patrons : [];
    const usedEntries = planet.patrons.map((p) => p.entryId);
    let entry = opts.entryId ? entries.find((e) => e.id === opts.entryId) : null;
    if (!entry && entries.length) {
      const fresh = entries.filter((e) => !usedEntries.includes(e.id));
      entry = pick(fresh.length ? fresh : entries);
    }
    const patronType = (entry && entry.patronType) || opts.patronType || rng.rollTable('Patron Table').id;
    const baseName = entry ? entry.name : patronTypeName(patronType);
    const patron = {
      id: newId(),
      entryId: entry ? entry.id : null,
      name: uniqueName(baseName, planet.patrons.map((p) => p.name)),
      patronType: patronType,
      persistent: false,
      oneTimeContract: false,
      benefit: null,
      forces: entry ? entry.forces.slice() : A.allForces(),
      uniques: entry ? entry.uniques.slice() : [],
      notes: opts.notes || ''
    };
    planet.patrons.push(patron);
    return patron;
  }

  /** New named Rival; with options.enemy (someone you just fought) an entry listing that enemy is preferred. */
  function newRival(campaign, planet, options) {
    const opts = options || {};
    const archetype = archetypeOf(campaign, planet);
    const entries = archetype ? archetype.rivals : [];
    let entry = null;
    let enemy = opts.enemy || null;
    if (opts.entryId) entry = entries.find((e) => e.id === opts.entryId) || null;
    if (!entry && enemy) {
      const matching = entries.filter((e) => e.forces.includes(enemy));
      entry = matching.length ? pick(matching) : null;
    } else if (!entry && entries.length) {
      const used = planet.rivals.map((r) => r.entryId);
      const fresh = entries.filter((e) => !used.includes(e.id) && e.forces.length);
      const withForces = entries.filter((e) => e.forces.length);
      entry = fresh.length ? pick(fresh) : (withForces.length ? pick(withForces) : null);
    }
    if (!enemy) enemy = entry ? pickForce(campaign, entry.forces) : pickForce(campaign, A.allForces());
    const baseName = entry ? entry.name : (enemy ? A.enemyName(enemy) : 'Rival');
    const rival = {
      id: newId(),
      entryId: entry ? entry.id : null,
      name: uniqueName(baseName, planet.rivals.map((r) => r.name)),
      enemy: enemy,
      uniques: entry ? entry.uniques.slice() : [],
      hates: !!opts.hates,
      notes: opts.notes || ''
    };
    planet.rivals.push(rival);
    return rival;
  }

  /** A Vengeful Patron turns on you: they become a Rival using their own forces. */
  function patronToRival(campaign, planet, patronId, notes) {
    const patron = planet.patrons.find((p) => p.id === patronId);
    if (!patron) return null;
    planet.patrons = planet.patrons.filter((p) => p.id !== patronId);
    const rival = {
      id: newId(),
      entryId: null,
      name: uniqueName(patron.name, planet.rivals.map((r) => r.name)),
      enemy: pickForce(campaign, patron.forces),
      uniques: patron.uniques.slice(),
      hates: false,
      notes: [patron.notes, notes].filter(Boolean).join(' ')
    };
    planet.rivals.push(rival);
    return rival;
  }

  function removeRival(planet, rivalId) {
    planet.rivals = planet.rivals.filter((r) => r.id !== rivalId);
  }

  function removePatron(planet, patronId) {
    planet.patrons = planet.patrons.filter((p) => p.id !== patronId);
  }

  /** Move Rivals (by id) and Patrons (by id) from one planet to another. */
  function moveContacts(from, to, rivalIds, patronIds) {
    const rivals = from.rivals.filter((r) => rivalIds.includes(r.id));
    const patrons = from.patrons.filter((p) => patronIds.includes(p.id));
    from.rivals = from.rivals.filter((r) => !rivalIds.includes(r.id));
    from.patrons = from.patrons.filter((p) => !patronIds.includes(p.id));
    for (const r of rivals) {
      r.name = uniqueName(r.name, to.rivals.map((x) => x.name));
      to.rivals.push(r);
    }
    for (const p of patrons) {
      p.name = uniqueName(p.name, to.patrons.map((x) => x.name));
      to.patrons.push(p);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Invasions                                                              */
  /* ---------------------------------------------------------------------- */

  function startInvasion(planet, enemy) {
    planet.invasion = { status: 'invaded', enemy: enemy || null, makingGround: 0 };
  }

  /** Apply a Galactic War Progress result (row id) to an invaded planet. */
  function applyWarResult(planet, resultId) {
    if (!planet.invasion || planet.invasion.status !== 'invaded') return;
    if (resultId === 'lost-to-unity') planet.invasion.status = 'lost';
    else if (resultId === 'making-ground') planet.invasion.makingGround += 1;
    else if (resultId === 'unity-victorious') planet.invasion.status = 'liberated';
  }

  /** Planets still being fought over, other than `exceptId`. */
  function invadedPlanets(campaign, exceptId) {
    return (campaign.planets || []).filter((p) => p.invasion && p.invasion.status === 'invaded' && p.id !== exceptId);
  }

  /* ---------------------------------------------------------------------- */
  /* Migration from the old remembered counts                               */
  /* ---------------------------------------------------------------------- */

  /** Save the pre-planets remembered world as the current planet, with placeholder contacts. */
  const NOTE_REMEMBERED = 'Remembered from before planets were tracked.';

  /** Where a contact came from: "Met during a campaign event on turn 4." */
  function contactNote(what, campaign) {
    const turn = LP.roster && campaign ? LP.roster.turnNumber(campaign) : null;
    return 'Met during ' + what + (turn ? ' on turn ' + turn : '') + '.';
  }

  /** Starting Rivals and Patrons from crew creation, on the first planet. */
  function addStartingContacts(campaign, planet) {
    const start = campaign.roster && campaign.roster.start;
    if (!start) return;
    for (let i = 0; i < start.rivals; i++) newRival(campaign, planet, { notes: 'Starting Rival from crew creation.' });
    for (let i = 0; i < start.patrons; i++) newPatron(campaign, planet, { notes: 'Starting Patron from crew creation.' });
  }

  function fromMemory(campaign, name) {
    ensure(campaign);
    const m = campaign.turnMemory || {};
    const planet = normalizePlanet({
      id: newId(),
      name: name && name.trim() ? name.trim() : 'Current world',
      archetypeId: campaign.archetypes[0].id,
      worldTraits: m.worldTraits || []
    });
    for (let i = 1; i <= (m.rivals || 0); i++) planet.rivals.push({ id: newId(), entryId: null, name: 'Rival ' + i, enemy: null, uniques: [], hates: false, notes: NOTE_REMEMBERED });
    for (let i = 1; i <= (m.patrons || 0); i++) planet.patrons.push({ id: newId(), entryId: null, name: 'Patron ' + i, patronType: null, persistent: false, oneTimeContract: false, benefit: null, forces: [], uniques: [], notes: NOTE_REMEMBERED });
    if (m.invadedNext) startInvasion(planet, null);
    campaign.planets.push(planet);
    campaign.currentPlanetId = planet.id;
    return planet;
  }

  LP.planets = {
    randomName, uniqueName, normalizePlanet, ensure, get, current, archetypeOf, setCurrent, remove, canVisit,
    pickArchetype, rollWorld, createPlanet, pickForce, patronTypeName,
    newPatron, newRival, patronToRival, removeRival, removePatron, moveContacts,
    startInvasion, applyWarResult, invadedPlanets, fromMemory, contactNote, addStartingContacts
  };
})(window.LP);
