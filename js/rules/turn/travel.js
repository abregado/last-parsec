(function (LP) {
  'use strict';

  /* Start of turn and Step 1: Travel (pp.68-75). */

  const T = LP.turn;
  const L = T.line;
  const rng = LP.rng;

  const WORLD_TRAITS = 'World Traits Table';

  function traitRow(id) {
    return rng.getTable(WORLD_TRAITS).rows.find((r) => r.id === id) || null;
  }

  function hasTrait(ctx, id) {
    return (ctx.facts.worldTraits || []).includes(id);
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  /** Planets are in use (every saved campaign has them; bare test campaigns may not). */
  function planetsOn(ctx) {
    return !!(LP.planets && Array.isArray(ctx.campaign.planets));
  }

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  function archetypeOptions(campaign) {
    return [{ value: 'random', label: 'Random archetype' }].concat((campaign.archetypes || []).map((a) => ({ value: a.id, label: a.name })));
  }

  function traitList(ids) {
    return ids.length ? ids.map((id) => traitRow(id).trait).join(', ') : 'None';
  }

  /* ---------------------------------------------------------------------- */
  /* 0. Start of turn                                                       */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'start',
    step: 'start',
    number: '0.5',
    title: 'Start of turn',
    page: 68,
    fields(ctx) {
      const first = !ctx.memory.hasPlayed;
      const traitOptions = rng.getTable(WORLD_TRAITS).rows.map((r) => ({ value: r.id, label: r.trait, hint: r.description }));
      if (planetsOn(ctx)) {
        const planet = ctx.planet;
        const fields = [{ key: 'firstTurn', type: 'yesno', label: 'Is this the first turn of the campaign?', value: first }];
        fields.push(
          { key: 'startArchetype', type: 'select', label: 'Starting world: archetype', options: archetypeOptions(ctx.campaign), value: 'random', showIf: (v) => v.firstTurn },
          { key: 'startName', type: 'text', label: 'Starting world: name', placeholder: 'Random name', value: '', showIf: (v) => v.firstTurn },
          {
            key: 'generateWorld', type: 'yesno', value: true,
            label: 'Roll its licence and world traits (New World Arrival)?',
            help: 'Optional on the first turn (p.68). Choose No to start on a world with no special rules.',
            showIf: (v) => v.firstTurn
          }
        );
        if (planet) {
          const archetype = LP.planets.archetypeOf(ctx.campaign, planet);
          const inv = planet.invasion && planet.invasion.status === 'invaded';
          fields.push({
            key: 'here', type: 'info', showIf: (v) => !v.firstTurn,
            text: 'You are on ' + planet.name + ' (' + (archetype ? archetype.name : 'no archetype') + '). Traits: ' + traitList(planet.worldTraits) + '.' +
              (inv ? ' This world is being Invaded' + (planet.invasion.enemy ? ' by ' + LP.archetypes.enemyName(planet.invasion.enemy) : '') + '!' : '')
          });
        } else {
          fields.push(
            { key: 'saveNote', type: 'info', text: 'There is no current planet yet: your current world will be saved as one (with placeholder names for the Rivals and Patrons you remember).', showIf: (v) => !v.firstTurn },
            { key: 'worldName', type: 'text', label: 'Name of the world you are on', placeholder: 'Current world', value: '', showIf: (v) => !v.firstTurn },
            { key: 'invaded', type: 'yesno', value: !!ctx.memory.invadedNext, label: 'Is this world being Invaded?', showIf: (v) => !v.firstTurn },
            { key: 'worldTraits', type: 'multiselect', value: ctx.memory.worldTraits || [], label: 'Traits of the world you are on', options: traitOptions, showIf: (v) => !v.firstTurn }
          );
        }
        return fields;
      }
      return [
        { key: 'firstTurn', type: 'yesno', label: 'Is this the first turn of the campaign?', value: first },
        {
          key: 'generateWorld', type: 'yesno', value: true,
          label: 'Generate the starting world with the New World Arrival steps?',
          help: 'Optional on the first turn (p.68). Choose No to start on a world with no special rules.',
          showIf: (v) => v.firstTurn
        },
        {
          key: 'invaded', type: 'yesno', value: !!ctx.memory.invadedNext,
          label: 'Is this world being Invaded?',
          help: 'From last turn’s Check for Invasion (p.121).',
          showIf: (v) => !v.firstTurn
        },
        {
          key: 'worldTraits', type: 'multiselect', value: ctx.memory.worldTraits || [],
          label: 'Traits of the world you are on',
          help: 'Several traits change rolls during the turn.',
          options: traitOptions,
          showIf: (v) => !(v.firstTurn && v.generateWorld)
        }
      ];
    },
    resolve(input, ctx) {
      const first = !!input.firstTurn;
      const data = { newPlanet: null, traits: input.worldTraits || [], invaded: !first && !!input.invaded };
      const items = [
        ['Difficulty', LP.settings.difficultyLabel(ctx.settings.difficulty)],
        ['Campaign crew size', String(ctx.settings.crewSize)],
        ['Campaign turn', String(LP.roster.turnNumber(ctx.campaign))]
      ];
      if (LP.roster.hasCrew(ctx.campaign)) {
        const crew = LP.roster.members(ctx.campaign);
        items.push(['Crew', plural(crew.length, 'member', 'members') + ' (from the Crew tab)']);
      }

      if (planetsOn(ctx)) {
        if (first) {
          data.archetypeId = LP.planets.pickArchetype(ctx.campaign, input.startArchetype).id;
          data.name = input.startName && input.startName.trim() ? input.startName.trim() : LP.planets.randomName(ctx.campaign);
          data.traits = [];
          if (!input.generateWorld) {
            data.newPlanet = { id: newId(), name: data.name, archetypeId: data.archetypeId, worldTraits: [] };
          }
          items.push(['Starting world', data.name + ' (' + LP.archetypes.get(ctx.campaign, data.archetypeId).name + ')']);
        } else if (ctx.planet) {
          data.traits = ctx.planet.worldTraits.slice();
          data.invaded = !!(ctx.planet.invasion && ctx.planet.invasion.status === 'invaded');
          items.push(['Planet', ctx.planet.name]);
        } else {
          data.newPlanet = {
            id: newId(),
            name: input.worldName && input.worldName.trim() ? input.worldName.trim() : 'Current world',
            archetypeId: ctx.campaign.archetypes[0].id,
            worldTraits: data.traits,
            importRivals: ctx.memory.rivals || 0,
            importPatrons: ctx.memory.patrons || 0,
            invaded: data.invaded
          };
          items.push(['Planet', data.newPlanet.name + ' (saved)']);
        }
      }
      items.push(['World traits', first && input.generateWorld ? 'Rolled in New World Arrival' : traitList(data.traits)]);
      const lines = [L.facts(items)];
      if (data.invaded) lines.push(L.text('This world is being Invaded: you must try to flee.', 'bad'));
      if (first) lines.push(L.text('First turn: skip the Travel steps' + (input.generateWorld ? ', but roll up the starting world.' : '.'), 'note'));
      return { output: { headline: first ? 'First campaign turn' : 'New campaign turn', lines, data } };
    },
    facts(input, output) {
      const first = !!input.firstTurn;
      const d = output.data || {};
      return {
        firstTurn: first,
        generateWorld: first && !!input.generateWorld,
        invaded: !!d.invaded,
        worldTraits: first && input.generateWorld ? [] : (d.traits || input.worldTraits || []),
        startArchetype: d.archetypeId || null,
        startName: d.name || null
      };
    },
    remember(input, output) {
      const keep = { hasPlayed: true, invadedNext: false };
      if (!(input.firstTurn && input.generateWorld)) keep.worldTraits = (output.data && output.data.traits) || input.worldTraits || [];
      return keep;
    },
    apply(input, output, ctx) {
      const np = output.data && output.data.newPlanet;
      if (!np || !planetsOn(ctx)) return;
      const planet = LP.planets.normalizePlanet({ id: np.id, name: np.name, archetypeId: np.archetypeId, worldTraits: np.worldTraits });
      for (let i = 1; i <= (np.importRivals || 0); i++) planet.rivals.push({ id: np.id + '-r' + i, entryId: null, name: 'Rival ' + i, enemy: null, uniques: [], hates: false, notes: 'Remembered from before planets were tracked.' });
      for (let i = 1; i <= (np.importPatrons || 0); i++) planet.patrons.push({ id: np.id + '-p' + i, entryId: null, name: 'Patron ' + i, patronType: null, persistent: false, oneTimeContract: false, benefit: null, forces: [], uniques: [], notes: 'Remembered from before planets were tracked.' });
      if (np.invaded) LP.planets.startInvasion(planet, null);
      if (input.firstTurn) LP.planets.addStartingContacts(ctx.campaign, planet);
      ctx.campaign.planets.push(planet);
      ctx.campaign.currentPlanetId = planet.id;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 1.1 Flee Invasion                                                      */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'flee-invasion',
    step: 'travel',
    number: '1.1',
    title: 'Flee Invasion',
    page: 69,
    applies(ctx) {
      return ctx.facts.invaded ? true : 'This world is not being Invaded.';
    },
    fields(ctx) {
      return [
        { key: 'hasShip', type: 'yesno', label: 'Do you have a ship?', value: ctx.memory.hasShip !== false }
      ];
    },
    resolve(input) {
      const roll = L.roll('2D6', {
        label: 'Get safely off-world',
        target: 8,
        successText: 'You make it off-world and must travel to a new planet.',
        failText: 'No time to get away.'
      });
      const lines = [roll];
      if (roll.success) {
        lines.push(L.text('All Rivals, Patrons and other contacts on this world are lost. No payment, purchases or Campaign Events while you flee, but you may roll a Character Event.'));
        if (input.hasShip) {
          lines.push(L.text('Fuel costs 5 credits. If you can’t pay, sell gear at a loss (1 credit per two items) or abandon the ship and take evacuation passage.'));
        } else {
          lines.push(L.roll('1D6', {
            label: 'Items lost on the evacuation ship',
            text: 'You lose all your credits and this many items from your Stash and equipment (your choice).'
          }));
        }
      } else {
        lines.push(L.text('During the World step you can only Assign Equipment. Then you MUST fight an Invasion Battle (p.92). If you survive it, you escape and travel next.', 'bad'));
      }
      return {
        output: {
          headline: roll.success ? 'Escaped the invasion' : 'Trapped: Invasion Battle',
          tone: roll.success ? 'good' : 'bad',
          lines
        }
      };
    },
    facts(input, output) {
      const success = output.lines[0].success;
      return { fled: success, fleeFailed: !success, hasShip: !!input.hasShip };
    },
    remember(input, output) {
      const keep = { hasShip: !!input.hasShip };
      if (output.lines[0].success) Object.assign(keep, { rivals: 0, patrons: 0 });
      return keep;
    },
    apply(input, output, ctx) {
      // Rivals, Patrons and other contacts on an invaded world are lost (p.69).
      if (output.lines[0].success && ctx.planet) {
        ctx.planet.rivals = [];
        ctx.planet.patrons = [];
      }
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 1.2 Decide whether to travel                                           */
  /* ---------------------------------------------------------------------- */

  function travelOutcome(record, paid) {
    const lines = record.output.lines.slice();
    const bribe = record.output.data.bribe;
    if (paid) {
      lines.push(L.text('You pay the ' + bribe + '-credit bribe and leave.', 'good'));
    } else {
      lines.push(L.text('You stay this turn. You may try to leave again next campaign turn.', 'bad'));
    }
    return {
      output: {
        headline: paid ? 'Leaving (bribe paid)' : 'Delayed: staying this turn',
        tone: paid ? 'good' : 'bad',
        lines,
        data: Object.assign({}, record.output.data, { traveling: paid })
      }
    };
  }

  T.register({
    id: 'travel',
    todo(input, output) {
      const d = output.data;
      return d.traveling ? ['Pay ' + plural(d.cost + (d.bribe || 0), 'credit', 'credits') + ' for travel' + (d.bribe ? ' (including the bribe)' : '') + '.'] : [];
    },
    step: 'travel',
    number: '1.2',
    title: 'Decide whether to travel',
    page: 69,
    applies(ctx) {
      if (ctx.facts.firstTurn) return 'First turn of the campaign: you start on your world.';
      if (ctx.facts.fleeFailed) return 'You failed to flee: survive the Invasion Battle first.';
      return true;
    },
    fields(ctx) {
      const fled = !!ctx.facts.fled;
      const hasShip = ctx.facts.hasShip !== undefined ? ctx.facts.hasShip : ctx.memory.hasShip !== false;
      const options = [];
      if (!fled) options.push({ value: 'stay', label: 'Stay on this world' });
      options.push({ value: 'ship', label: 'Travel in your own ship' });
      options.push({ value: 'commercial', label: 'Buy commercial passage' });
      return [
        {
          key: 'mode', type: 'select', label: fled ? 'How are you leaving?' : 'Travel to a new world?',
          options, value: fled ? (hasShip ? 'ship' : 'commercial') : 'stay'
        },
        LP.roster.hasCrew(ctx.campaign) ? null : {
          key: 'crewCount', type: 'number', label: 'Crew members', min: 1, max: 30,
          value: ctx.memory.crewCount || ctx.settings.crewSize,
          help: 'Commercial passage costs 1 credit per crew member.',
          showIf: (v) => v.mode === 'commercial'
        }
      ].concat(planetsOn(ctx) ? [
        {
          key: 'destination', type: 'select', label: 'Destination', value: 'new',
          options: [{ value: 'new', label: 'A new world' }].concat(ctx.campaign.planets
            .filter((p) => p.id !== ctx.campaign.currentPlanetId && LP.planets.canVisit(p))
            .map((p) => ({ value: p.id, label: 'Return to ' + p.name }))),
          showIf: (v) => v.mode !== 'stay'
        },
        { key: 'destArchetype', type: 'select', label: 'New world: archetype', options: archetypeOptions(ctx.campaign), value: 'random', showIf: (v) => v.mode !== 'stay' && v.destination === 'new' },
        { key: 'destName', type: 'text', label: 'New world: name', placeholder: 'Random name', value: '', showIf: (v) => v.mode !== 'stay' && v.destination === 'new' }
      ] : []);
    },
    validate(input, ctx) {
      if (ctx.facts.fled && input.mode === 'stay') return 'You must leave: the world is being Invaded.';
      return null;
    },
    resolve(input, ctx) {
      if (input.mode === 'stay') {
        return {
          output: {
            headline: 'Staying on this world',
            lines: [L.text('No travel this turn. Continue with the World steps.')],
            data: { traveling: false, mode: 'stay' }
          }
        };
      }

      const lines = [];
      let cost;
      if (input.mode === 'ship') {
        cost = hasTrait(ctx, 'fuel-refinery') ? 3 : 5;
        const costNotes = [hasTrait(ctx, 'fuel-refinery') ? 'Fuel refinery: 3 credits' : 'Fuel: 5 credits'];
        if (hasTrait(ctx, 'fuel-shortage')) {
          const shortage = L.roll('1D3', { label: 'Fuel shortage', text: 'Extra credits for fuel.' });
          cost += shortage.total;
          lines.push(shortage);
          costNotes.push('Fuel shortage +' + shortage.total);
        }
        lines.push(L.facts([['Travel cost', cost + ' credits'], ['Breakdown', costNotes.join(', ')]]));
        lines.push(L.text('If your ship has Hull damage, taking off is dangerous: see p.59.', 'note'));
      } else {
        cost = LP.roster.crewCount(ctx, input.crewCount);
        lines.push(L.facts([['Travel cost', plural(cost, 'credit', 'credits') + ' (1 per crew member)']]));
        lines.push(L.text('No packages or other cargo can be carried, and there is no Starship Travel Event.', 'note'));
      }

      const data = { traveling: true, mode: input.mode, cost };
      if (hasTrait(ctx, 'bureaucratic-mess')) {
        const red = L.roll('2D6', { label: 'Bureaucratic mess (leave on 5+)', target: 5, successText: 'No delay.' });
        lines.push(red);
        if (!red.success) {
          data.bribe = red.total;
          red.text = 'Delayed: you can’t leave this turn without a bribe of ' + plural(red.total, 'credit', 'credits') + '.';
          return {
            output: { headline: 'Delayed by bureaucracy', tone: 'bad', lines, data: Object.assign(data, { traveling: false }) },
            pending: {
              prompt: 'Pay the ' + red.total + '-credit bribe and leave anyway?',
              options: [{ value: 'pay', label: 'Pay and leave' }, { value: 'stay', label: 'Stay this turn' }]
            }
          };
        }
      }
      return {
        output: { headline: input.mode === 'ship' ? 'Travelling by ship' : 'Travelling by commercial passage', tone: 'good', lines, data }
      };
    },
    choose(record, value) {
      return travelOutcome(record, value === 'pay');
    },
    facts(input, output) {
      return {
        traveling: !!output.data.traveling,
        travelMode: output.data.mode,
        destination: input.destination || 'new',
        destArchetype: input.destArchetype || 'random',
        destName: input.destName || ''
      };
    },
    remember(input) {
      return input.mode === 'commercial' && input.crewCount ? { crewCount: input.crewCount } : {};
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 1.3 Starship travel event                                              */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'travel-event',
    step: 'travel',
    number: '1.3',
    title: 'Starship travel event',
    page: 70,
    ledger: true,
    applies(ctx) {
      if (!ctx.facts.traveling) return 'Not travelling this turn.';
      if (ctx.facts.travelMode !== 'ship') return 'Commercial passage: no Starship Travel Event.';
      return true;
    },
    fields(ctx) {
      return [{
        key: 'note', type: 'info',
        text: 'An event is rolled from the Starship Travel Events. It picks from your ' + plural(LP.roster.members(ctx.campaign).length, 'crew member', 'crew members') + ' and lists what it changes for you to apply.'
      }];
    },
    resolve(input, ctx) {
      return T.eventStage.start(ctx, [{ table: 'travel' }], { source: 'a starship travel event' });
    },
    choose(record, value, ctx) {
      return T.eventStage.choose(record, value, ctx);
    },
    facts(input, output) {
      return {
        travelEvent: T.eventStage.firstEvent(output),
        travelGains: { rumors: T.eventStage.gained(output, 'rumors'), storyPoints: T.eventStage.gained(output, 'storyPoints') }
      };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 1.4 New world arrival                                                  */
  /* ---------------------------------------------------------------------- */

  const ALIEN_RESTRICTED = [
    { max: 1, name: 'Engineer' },
    { max: 4, name: 'K’Erin' },
    { max: 5, name: 'Soulless' },
    { max: 6, name: 'Precursor' },
    { max: 9, name: 'Feral' },
    { max: 10, name: 'Swift' }
  ];

  /**
   * World trait roll plus any dice the trait itself calls for.
   * rolled: { natural, id } from LP.planets.rollWorld, or nothing to roll here.
   */
  function rollTrait(label, rolled) {
    let line;
    if (rolled) {
      const row = traitRow(rolled.id);
      line = { type: 'table', table: WORLD_TRAITS, die: 'D100', natural: rolled.natural, modifier: 0, total: rolled.natural, rowId: row.id, title: row.trait, text: row.description, label: label };
    } else {
      line = L.table(WORLD_TRAITS, { textColumn: 'description', label });
    }
    line.children = [];
    if (line.rowId === 'alien-species-restricted') {
      const d = L.roll('1D10', { label: 'Restricted species' });
      d.text = ALIEN_RESTRICTED.find((a) => d.total <= a.max).name + ' characters can’t be hired here and can’t take crew tasks.';
      line.children.push(d);
    } else if (line.rowId === 'interdiction') {
      const d = L.roll('1D3', { label: 'Approved stay' });
      d.text = 'You may stay ' + plural(d.total, 'campaign turn', 'campaign turns') + '. To extend, obtain a license: 2D6, 8+.';
      line.children.push(d);
    }
    return line;
  }

  /** The worlds a "Locked in the library" event offered, if that condition is in play. */
  function offeredWorlds(ctx) {
    const inst = LP.conditions.active(ctx.campaign).find((c) => c.type === 'destinations');
    return inst ? (inst.params.planetIds || []).map((id) => LP.planets.get(ctx.campaign, id)).filter(Boolean) : [];
  }

  /** New world arrival fields when planets are in use. */
  function planetFields(ctx) {
    const offered = offeredWorlds(ctx);
    if (offered.length) {
      return [{
        key: 'pickDestination', type: 'select', label: 'Which of the worlds you looked up will you visit?', value: offered[0].id,
        options: offered.map((p) => ({ value: p.id, label: p.name + ' (' + traitList(p.worldTraits) + ')' }))
      }].concat(LP.conditions.fields(ctx.campaign, 'arrive'));
    }
    const revisit = !ctx.facts.firstTurn && ctx.facts.destination && ctx.facts.destination !== 'new';
    if (revisit) {
      const dest = LP.planets.get(ctx.campaign, ctx.facts.destination);
      return [{ key: 'note', type: 'info', text: 'Returning to ' + (dest ? dest.name : 'a saved world') + '. Its traits, licence, Patrons and Rivals are as you left them.' }].concat(LP.conditions.fields(ctx.campaign, 'arrive'));
    }
    return [{
      key: 'wildGalaxy', type: 'yesno', value: !!ctx.memory.wildGalaxy,
      label: 'Use the Wild Galaxy optional rule (roll twice for world traits)?'
    }].concat(LP.conditions.fields(ctx.campaign, 'arrive'));
  }

  /** New world arrival with planets: Rivals follow by name, then a new or saved world. */
  function arrive(input, ctx) {
    const P = LP.planets;
    const lines = [];
    const from = ctx.facts.firstTurn ? null : ctx.planet;
    const data = { fromId: from ? from.id : null, followIds: [], persistentIds: [], licence: null, traits: [], newPlanet: null, destinationId: null };

    if (from) {
      if (!from.rivals.length) {
        lines.push(L.text('1. Check for Rivals: you have no Rivals.'));
      } else {
        const rolls = from.rivals.map((r) => {
          const roll = L.roll('1D6', { label: r.name, target: 5, successText: 'Follows you.', failText: 'Stays behind on ' + from.name + '.', invert: true });
          if (roll.success) data.followIds.push(r.id);
          return roll;
        });
        lines.push(Object.assign(L.text('1. Check for Rivals: ' + data.followIds.length + ' of ' + from.rivals.length + ' follow you.', data.followIds.length ? 'bad' : 'good'), { children: rolls }));
      }
      const persistent = from.patrons.filter((p) => p.persistent);
      data.persistentIds = persistent.map((p) => p.id);
      lines.push(L.text('2. Dismiss Patrons: ' + (persistent.length ? persistent.map((p) => p.name).join(', ') + ' (Persistent) come with you; the rest stay behind.' : 'all Patrons stay behind on ' + from.name + '.')));
    }

    const looked = input.pickDestination ? P.get(ctx.campaign, input.pickDestination) : null;
    const revisit = looked || (!ctx.facts.firstTurn && ctx.facts.destination && ctx.facts.destination !== 'new' ? P.get(ctx.campaign, ctx.facts.destination) : null);
    if (revisit) {
      data.destinationId = revisit.id;
      data.traits = revisit.worldTraits.slice();
      lines.push(L.text((looked ? 'You choose ' : 'Back on ') + revisit.name + ': ' + plural(revisit.patrons.length, 'Patron', 'Patrons') + ' and ' + plural(revisit.rivals.length, 'Rival', 'Rivals') + ' were waiting here.'));
      lines.push(L.facts([
        ['Traits', traitList(revisit.worldTraits)],
        ['License', revisit.licence.required ? (revisit.licence.owned ? 'Owned' : 'Required (' + revisit.licence.cost + ' credits)') : 'Not needed']
      ]));
      return { output: { headline: 'Returned to ' + revisit.name, lines, data } };
    }

    const archetype = P.pickArchetype(ctx.campaign, ctx.facts.firstTurn ? ctx.facts.startArchetype : ctx.facts.destArchetype);
    const world = P.rollWorld(archetype, { wildGalaxy: input.wildGalaxy });
    const typed = ctx.facts.firstTurn ? ctx.facts.startName : (ctx.facts.destName || '').trim();
    data.newPlanet = { id: newId(), name: typed || P.randomName(ctx.campaign), archetypeId: archetype.id, worldTraits: world.traits, licence: world.licence };
    data.destinationId = data.newPlanet.id;
    data.traits = world.traits;

    lines.push(L.facts([['World', data.newPlanet.name], ['Archetype', archetype.name]]));
    const licence = { type: 'roll', label: '3. Licensing requirements', notation: '1D6', dice: [world.rolls.licence], base: world.rolls.licence, modifiers: [], total: world.rolls.licence };
    if (world.licence.required) {
      licence.text = 'This world requires a Freelancer License for Patron jobs.';
      licence.children = [{ type: 'roll', label: 'Freelancer License cost', notation: '1D6', dice: [world.rolls.cost], base: world.rolls.cost, modifiers: [], total: world.rolls.cost, text: 'Credits to buy the License. Once bought it lasts for good.' }];
      data.licence = world.rolls.cost;
    } else {
      licence.text = 'No License needed.';
    }
    lines.push(licence);
    world.rolls.traits.forEach((t, i) => {
      const line = rollTrait(i === 0 ? '4. World trait' : 'Wild Galaxy: second trait', t);
      if (i > 0) line.children.push(L.text(t.id === world.rolls.traits[0].id ? 'Same trait again: no extra effect.' : 'If this contradicts the first trait, ignore it.', 'note'));
      lines.push(line);
    });

    const output = { headline: 'New world: ' + data.newPlanet.name + ' (' + traitList(world.traits) + ')', lines, data };
    if (data.licence !== null) {
      return {
        output,
        pending: {
          prompt: 'Try to obtain a forged License? One attempt only: 1D6 + Savvy, 6+ gets it free; a natural 1 adds a Rival.',
          options: [{ value: 'forge', label: 'Try forging' }, { value: 'skip', label: 'No, pay or go without' }]
        }
      };
    }
    return { output };
  }

  T.register({
    id: 'new-world',
    step: 'travel',
    number: '1.4',
    title: 'New world arrival',
    page: 72,
    applies(ctx) {
      if (ctx.facts.firstTurn) return ctx.facts.generateWorld ? true : 'Starting on a world with no special rules.';
      return ctx.facts.traveling ? true : 'Not travelling to a new world.';
    },
    fields(ctx) {
      if (planetsOn(ctx)) return planetFields(ctx);
      const fields = [];
      if (!ctx.facts.firstTurn) {
        fields.push({
          key: 'rivals', type: 'number', label: 'Rivals you have now', min: 0, max: 30,
          value: ctx.memory.rivals || 0, help: 'Each rolls 1D6: on 5+ they follow you.'
        });
      }
      fields.push({
        key: 'wildGalaxy', type: 'yesno', value: !!ctx.memory.wildGalaxy,
        label: 'Use the Wild Galaxy optional rule (roll twice for world traits)?'
      });
      return fields;
    },
    resolve(input, ctx) {
      if (planetsOn(ctx)) return arrive(input, ctx);
      const lines = [];
      // rivalsBase: Rivals after arrival, before any forged-License Rival.
      const data = { followers: null, licence: null, traits: [], rivalsBase: ctx.memory.rivals || 0 };

      if (!ctx.facts.firstTurn) {
        const rivals = input.rivals || 0;
        if (rivals === 0) {
          lines.push(L.text('1. Check for Rivals: you have no Rivals.'));
          data.followers = 0;
          data.rivalsBase = 0;
        } else {
          const rolls = [];
          for (let i = 0; i < rivals; i++) rolls.push(L.roll('1D6', { label: 'Rival ' + (i + 1), target: 5, successText: 'Follows you.', failText: 'Stays behind.', invert: true }));
          data.followers = rolls.filter((r) => r.success).length;
          data.rivalsBase = data.followers;
          lines.push(Object.assign(L.text('1. Check for Rivals: ' + data.followers + ' of ' + rivals + ' follow you.', data.followers ? 'bad' : 'good'), { children: rolls }));
        }
        lines.push(L.text('2. Dismiss Patrons: all Patrons stay behind unless they are Persistent.'));
      }

      const licence = L.roll('1D6', { label: '3. Licensing requirements' });
      if (licence.total >= 5) {
        const cost = L.roll('1D6', { label: 'Freelancer License cost', text: 'Credits to buy the License. Once bought it lasts for good, even if you come back later.' });
        licence.text = 'This world requires a Freelancer License for Patron jobs.';
        licence.children = [cost];
        data.licence = cost.total;
      } else {
        licence.text = 'No License needed.';
      }
      lines.push(licence);

      const first = rollTrait('4. World trait');
      data.traits.push(first.rowId);
      lines.push(first);
      if (input.wildGalaxy) {
        const second = rollTrait('Wild Galaxy: second trait');
        if (second.rowId === first.rowId) {
          second.children.push(L.text('Same trait again: no extra effect.', 'note'));
        } else {
          second.children.push(L.text('If this contradicts the first trait, ignore it.', 'note'));
          data.traits.push(second.rowId);
        }
        lines.push(second);
      }

      const output = { headline: 'New world: ' + data.traits.map((id) => traitRow(id).trait).join(' + '), lines, data };
      if (data.licence !== null) {
        return {
          output,
          pending: {
            prompt: 'Try to obtain a forged License? One attempt only: 1D6 + Savvy, 6+ gets it free; a natural 1 adds a Rival.',
            options: [{ value: 'forge', label: 'Try forging' }, { value: 'skip', label: 'No, pay or go without' }]
          }
        };
      }
      return { output };
    },
    choose(record, value) {
      const output = JSON.parse(JSON.stringify(record.output));
      if (value === 'forge') {
        const forge = L.roll('1D6', { label: 'Forged License (1D6 + Savvy, needs 6+)' });
        if (forge.dice[0] === 1) {
          forge.success = false;
          forge.text = 'Natural 1: the forgery is spotted. Add a Rival on this world.';
          output.data.forgeRival = 1;
        } else {
          forge.text = L.savvyNote(forge.dice[0], 6) + ' Otherwise pay ' + plural(output.data.licence, 'credit', 'credits') + ' or work without Patron jobs.';
        }
        output.lines.push(forge);
      } else {
        output.lines.push(L.text('No forgery attempt: pay ' + plural(output.data.licence, 'credit', 'credits') + ' for the License, or skip Patron jobs here.'));
      }
      return { output };
    },
    facts(input, output) {
      return { worldTraits: output.data.traits, newWorld: true, licenceCost: output.data.licence };
    },
    apply(input, output, ctx) {
      const d = output.data;
      if (!planetsOn(ctx) || !d.destinationId) return;
      const P = LP.planets;
      if (d.newPlanet && !P.get(ctx.campaign, d.newPlanet.id)) {
        const planet = P.normalizePlanet(d.newPlanet);
        ctx.campaign.planets.push(planet);
        if (ctx.facts.firstTurn) P.addStartingContacts(ctx.campaign, planet);
      }
      const dest = P.get(ctx.campaign, d.destinationId);
      const from = d.fromId ? P.get(ctx.campaign, d.fromId) : null;
      if (from && dest && from !== dest) P.moveContacts(from, dest, d.followIds || [], d.persistentIds || []);
      if (dest) {
        P.setCurrent(ctx.campaign, dest.id);
        if (d.forgeRival) P.newRival(ctx.campaign, dest, { notes: 'Came after you for using a forged Freelancer License, on turn ' + LP.roster.turnNumber(ctx.campaign) + '.' });
      }
    },
    remember(input, output) {
      const keep = { worldTraits: output.data.traits };
      if (input.wildGalaxy !== undefined) keep.wildGalaxy = !!input.wildGalaxy;
      if (output.data.rivalsBase !== undefined) keep.rivals = output.data.rivalsBase + (output.data.forgeRival || 0);
      return keep;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Conditions                                                             */
  /* ---------------------------------------------------------------------- */

  /** What conditions do when the crew stays or leaves: lines and ops for the ledger. */
  function departureHooks(input, ctx) {
    const C = LP.conditions;
    const out = { lines: [], ops: [] };
    if (!ctx.facts.fled) {
      const check = C.travelCheck(ctx.campaign, input);
      out.lines.push(...check.lines);
      out.ops.push(...check.ops);
    }
    const depart = C.run(ctx.campaign, 'depart', input);
    out.lines.push(...depart.lines);
    out.ops.push(...depart.ops);
    const cost = C.modifiers(ctx.campaign, 'cost.travel', { input });
    if (cost.set !== undefined) {
      out.lines.push(L.text('Travel costs ' + plural(cost.set, 'credit', 'credits') + ' instead.', 'good'));
      out.cost = cost.set;
      out.ops.push(...C.consumeOps(cost.used));
    }
    return out;
  }

  function applyHooks(result, hooks) {
    const output = result.output;
    output.lines = output.lines.concat(hooks.lines);
    output.ops = (output.ops || []).concat(hooks.ops);
    if (hooks.cost !== undefined) output.data.cost = hooks.cost;
  }

  const travelStage = T.getStage('travel');
  const travelFieldsBase = travelStage.fields;
  const travelResolveBase = travelStage.resolve;
  const travelChooseBase = travelStage.choose;
  const travelValidateBase = travelStage.validate;
  travelStage.ledger = true;
  travelStage.fields = function (ctx) {
    const notStay = (v) => v.mode !== 'stay';
    const extra = (ctx.facts.fled ? [] : LP.conditions.travelFields(ctx.campaign)).concat(LP.conditions.fields(ctx.campaign, 'depart'));
    return travelFieldsBase(ctx).concat(extra.map((f) => Object.assign(f, { showIf: notStay })));
  };
  travelStage.validate = function (input, ctx) {
    const error = travelValidateBase(input, ctx);
    if (error) return error;
    if (input.mode === 'stay' || ctx.facts.fled) return null;
    return LP.conditions.travelCheck(ctx.campaign, input).error || null;
  };
  travelStage.resolve = function (input, ctx) {
    const result = travelResolveBase(input, ctx);
    if (input.mode === 'stay') {
      applyHooks(result, LP.conditions.run(ctx.campaign, 'stay', input));
    } else if (result.pending) {
      // Delayed by bureaucracy: what happens waits for the bribe decision.
      result.output.data.held = { depart: departureHooks(input, ctx), stay: LP.conditions.run(ctx.campaign, 'stay', input) };
    } else {
      applyHooks(result, departureHooks(input, ctx));
    }
    return result;
  };
  travelStage.choose = function (record, value, ctx) {
    const result = travelChooseBase(record, value, ctx);
    const held = record.output.data.held;
    if (held) applyHooks(result, value === 'pay' ? held.depart : held.stay);
    return result;
  };

  // Arriving: package, trade goods and other conditions that act on arrival, and the
  // conditions that count arrivals. The hooks see the world arrived at as the current one.
  const arriveStage = T.getStage('new-world');
  const arriveFieldsBase = arriveStage.fields;
  const arriveResolveBase = arriveStage.resolve;
  arriveStage.ledger = true;
  arriveStage.fields = function (ctx) {
    const fields = arriveFieldsBase(ctx);
    if (planetsOn(ctx)) return fields;
    return fields.concat(LP.conditions.fields(ctx.campaign, 'arrive'));
  };
  arriveStage.resolve = function (input, ctx) {
    const result = arriveResolveBase(input, ctx);
    if (!planetsOn(ctx)) return result;
    const d = result.output.data || {};
    const view = LP.snapshot.scratch(ctx.campaign);
    const planet = d.newPlanet ? LP.planets.normalizePlanet(d.newPlanet) : LP.planets.get(view, d.destinationId);
    if (planet) {
      if (!LP.planets.get(view, planet.id)) view.planets.push(planet);
      view.currentPlanetId = planet.id;
    }
    const hooks = LP.conditions.run(view, 'arrive', input);
    applyHooks(result, { lines: hooks.lines, ops: hooks.ops.concat(LP.conditions.arrivalTicks(view)) });
    return result;
  };
})(window.LP);
