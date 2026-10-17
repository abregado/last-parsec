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

  /* ---------------------------------------------------------------------- */
  /* 0. Start of turn                                                       */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'start',
    step: 'start',
    number: '0',
    title: 'Start of turn',
    page: 68,
    fields(ctx) {
      const first = !ctx.memory.hasPlayed;
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
          options: rng.getTable(WORLD_TRAITS).rows.map((r) => ({ value: r.id, label: r.trait, hint: r.description })),
          showIf: (v) => !(v.firstTurn && v.generateWorld)
        }
      ];
    },
    resolve(input, ctx) {
      const first = !!input.firstTurn;
      const traits = input.worldTraits || [];
      const lines = [
        L.facts([
          ['Difficulty', LP.settings.difficultyLabel(ctx.settings.difficulty)],
          ['Campaign crew size', String(ctx.settings.crewSize)],
          ['World traits', first && input.generateWorld ? 'Rolled in New World Arrival' : (traits.length ? traits.map((id) => traitRow(id).trait).join(', ') : 'None')]
        ])
      ];
      if (!first && input.invaded) lines.push(L.text('This world is being Invaded: you must try to flee.', 'bad'));
      if (first) lines.push(L.text('First turn: skip the Travel steps' + (input.generateWorld ? ', but roll up the starting world.' : '.'), 'note'));
      return { output: { headline: first ? 'First campaign turn' : 'New campaign turn', lines } };
    },
    facts(input) {
      const first = !!input.firstTurn;
      return {
        firstTurn: first,
        generateWorld: first && !!input.generateWorld,
        invaded: !first && !!input.invaded,
        worldTraits: first && input.generateWorld ? [] : (input.worldTraits || [])
      };
    },
    remember(input) {
      const keep = { hasPlayed: true, invadedNext: false };
      if (!(input.firstTurn && input.generateWorld)) keep.worldTraits = input.worldTraits || [];
      return keep;
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
        {
          key: 'crewCount', type: 'number', label: 'Crew members', min: 1, max: 30,
          value: ctx.memory.crewCount || ctx.settings.crewSize,
          help: 'Commercial passage costs 1 credit per crew member.',
          showIf: (v) => v.mode === 'commercial'
        }
      ];
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
        cost = input.crewCount;
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
      return { traveling: !!output.data.traveling, travelMode: output.data.mode };
    },
    remember(input) {
      return input.mode === 'commercial' ? { crewCount: input.crewCount } : {};
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
    applies(ctx) {
      if (!ctx.facts.traveling) return 'Not travelling this turn.';
      if (ctx.facts.travelMode !== 'ship') return 'Commercial passage: no Starship Travel Event.';
      return true;
    },
    fields(ctx) {
      return [{
        key: 'crewCount', type: 'number', label: 'Crew members', min: 1, max: 30,
        value: ctx.memory.crewCount || ctx.settings.crewSize,
        help: 'Used when an event picks random crew members (by their order on your roster).'
      }];
    },
    resolve(input, ctx) {
      const run = LP.followup.start([{ table: 'Starship Travel Events Table' }], {
        crewCount: input.crewCount,
        crewSize: ctx.settings.crewSize,
        disabled: ctx.campaign.models ? ctx.campaign.models.disabled : {}
      });
      return {
        output: { headline: run.lines[0].title, lines: [], fu: run },
        pending: LP.followup.pendingChoice(run)
      };
    },
    choose(record, value) {
      const run = JSON.parse(JSON.stringify(record.output.fu));
      LP.followup.choose(run, value);
      return {
        output: Object.assign({}, record.output, { fu: run }),
        pending: LP.followup.pendingChoice(run)
      };
    },
    facts(input, output) {
      return { travelEvent: output.fu.lines[0].rowId, travelGains: output.fu.gains };
    },
    remember(input) {
      return { crewCount: input.crewCount };
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

  /** World trait roll plus any dice the trait itself calls for. */
  function rollTrait(label) {
    const line = L.table(WORLD_TRAITS, { textColumn: 'description', label });
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
    remember(input, output) {
      return {
        worldTraits: output.data.traits,
        wildGalaxy: !!input.wildGalaxy,
        rivals: output.data.rivalsBase + (output.data.forgeRival || 0)
      };
    }
  });
})(window.LP);
