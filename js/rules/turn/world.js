(function (LP) {
  'use strict';

  /* Step 2: World (pp.76-85). */

  const T = LP.turn;
  const L = T.line;
  const F = LP.followup;

  function hasTrait(ctx, id) {
    return (ctx.facts.worldTraits || ctx.memory.worldTraits || []).includes(id);
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function trapped(ctx) {
    return ctx.facts.fleeFailed ? 'Trapped by the invasion: you can only Assign Equipment this turn.' : true;
  }

  const R = LP.roster;

  function crewDefault(ctx) {
    return R.crewCount(ctx);
  }

  function hasCrew(ctx) {
    return R.hasCrew(ctx.campaign);
  }

  /** Crew members free for tasks this turn (from Upkeep), when there is a crew. */
  function availableMembers(ctx) {
    const ids = ctx.facts.availableIds;
    return ids ? ids.map((id) => R.getMember(ctx.campaign, id)).filter(Boolean) : R.available(ctx.campaign);
  }

  /** Number of crew in Sick Bay from the Upkeep input. */
  function sickCount(input) {
    return input.sickBayIds ? input.sickBayIds.length : input.sickBay || 0;
  }

  /** Env for follow-up runs: Models and archetype restrictions, species weights, Rival names. */
  function env(ctx, extra) {
    const archetype = ctx.planet && LP.planets ? LP.planets.archetypeOf(ctx.campaign, ctx.planet) : null;
    return Object.assign({
      crewSize: ctx.settings.crewSize,
      disabled: LP.archetypes ? LP.archetypes.disabledMap(ctx.campaign, archetype) : (ctx.campaign && ctx.campaign.models ? ctx.campaign.models.disabled : {}),
      speciesWeights: LP.archetypes ? LP.archetypes.speciesWeights(archetype) : null,
      rivalNames: ctx.planet ? ctx.planet.rivals.map((r) => r.name) : null
    }, extra);
  }

  /** Named Rivals and Patrons gained from follow-ups (Pick a fight, events...). */
  function addGained(ctx, gains) {
    if (!ctx.planet || !gains) return;
    for (let i = 0; i < (gains.rivals || 0); i++) LP.planets.newRival(ctx.campaign, ctx.planet);
    for (let i = 0; i < (gains.patrons || 0); i++) LP.planets.newPatron(ctx.campaign, ctx.planet);
  }

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  /** Shared resolve/choose for stages whose output is one follow-up run. */
  function runOutput(headline, run, lines) {
    return {
      output: { headline: headline, lines: lines || [], fu: run },
      pending: F.pendingChoice(run)
    };
  }

  function chooseInRun(record, value) {
    const run = JSON.parse(JSON.stringify(record.output.fu));
    F.choose(run, value);
    return { output: Object.assign({}, record.output, { fu: run }), pending: F.pendingChoice(run) };
  }

  /* ---------------------------------------------------------------------- */
  /* 2.1 Upkeep and ship repairs                                            */
  /* ---------------------------------------------------------------------- */

  /** 1 credit for up to 6 crew, +1 per crew member past 6 (p.76). */
  function upkeepCost(crew) {
    if (crew <= 0) return 0;
    return 1 + Math.max(0, crew - 6);
  }

  T.register({
    id: 'upkeep',
    step: 'world',
    number: '2.1',
    title: 'Upkeep and ship repairs',
    page: 76,
    applies: trapped,
    fields(ctx) {
      const ship = hasCrew(ctx) ? ctx.campaign.roster.ship : null;
      const hasShip = ctx.facts.hasShip !== undefined ? ctx.facts.hasShip : ctx.memory.hasShip !== undefined ? ctx.memory.hasShip !== false : !hasCrew(ctx) || !!ship;
      const debt = ctx.memory.debt !== undefined ? ctx.memory.debt : ship ? ship.debt : 0;
      const hull = ctx.memory.hullDamage !== undefined ? ctx.memory.hullDamage : ship ? Math.max(0, ship.hullMax - ship.hull) : 0;
      const crewFields = hasCrew(ctx)
        ? [{
          key: 'sickBayIds', type: 'multiselect', label: 'In Sick Bay (including Bots under repair)',
          options: R.memberOptions(R.members(ctx.campaign)),
          value: R.members(ctx.campaign).filter((m) => m.status === 'sick-bay').map((m) => m.id),
          help: 'They don’t count for Upkeep and can’t take tasks. Pre-filled from the Crew tab.'
        }]
        : [
          { key: 'crewCount', type: 'number', label: 'Crew members', min: 1, max: 30, value: crewDefault(ctx) },
          { key: 'sickBay', type: 'number', label: 'In Sick Bay (including Bots under repair)', min: 0, max: 30, value: 0, help: 'They don’t count for Upkeep and can’t take tasks.' }
        ];
      return crewFields.concat([
        { key: 'hasShip', type: 'yesno', label: 'Do you have a ship?', value: hasShip },
        { key: 'debt', type: 'number', label: 'Ship debt (credits)', min: 0, max: 999, value: debt || 0, showIf: (v) => v.hasShip },
        { key: 'payment', type: 'number', label: 'Paying off the debt this turn (credits)', min: 0, max: 999, value: 0, showIf: (v) => v.hasShip && v.debt > 0 },
        { key: 'hullDamage', type: 'number', label: 'Hull damage (points)', min: 0, max: 99, value: hull || 0, showIf: (v) => v.hasShip }
      ]);
    },
    validate(input, ctx) {
      if (sickCount(input) > R.crewCount(ctx, input.crewCount)) return 'More crew in Sick Bay than in the crew.';
      if (input.payment > input.debt) return 'You can’t pay more than you owe.';
      return null;
    },
    resolve(input, ctx) {
      const lines = [];
      const data = { seized: false, debt: input.hasShip ? input.debt || 0 : 0, hullDamage: input.hasShip ? input.hullDamage || 0 : 0 };

      // Upkeep
      const paying = R.crewCount(ctx, input.crewCount) - sickCount(input);
      const highCost = hasTrait(ctx, 'high-cost');
      const cost = upkeepCost(paying + (highCost ? 2 : 0));
      lines.push(L.facts([
        ['Upkeep', plural(cost, 'credit', 'credits')],
        ['Counted crew', paying + (highCost ? ' (+2 for High cost)' : '')]
      ]));
      lines.push(L.text('For each credit you are short, one crew member refuses to do a task this turn. You may sell items for 1 credit of Upkeep each. Basic supplies (Trade) skip Upkeep once. You may also kick out a crew member now.', 'note'));

      // Debt
      if (input.hasShip && input.debt > 0) {
        const remaining = input.debt - (input.payment || 0);
        if (remaining <= 0) {
          lines.push(L.text('Ship debt paid off!', 'good'));
          data.debt = 0;
        } else {
          const interest = remaining >= 31 ? 2 : 1;
          data.debt = remaining + interest;
          lines.push(L.facts([
            ['Ship debt', input.debt + (input.payment ? ' − ' + input.payment + ' paid' : '') + ' + ' + interest + ' interest = ' + data.debt + ' credits']
          ]));
          if (data.debt >= 75) {
            const seize = L.roll('2D6', {
              label: 'Debt of 75+: do they come for the ship? (seized on 2–6)',
              target: 7,
              successText: 'Not this time.',
              failText: 'Your ship is seized and lost permanently.'
            });
            lines.push(seize);
            data.seized = !seize.success;
          }
        }
      }

      // Hull
      if (input.hasShip && !data.seized && input.hullDamage > 0) {
        data.hullDamage = input.hullDamage - 1;
        lines.push(L.text('1 Hull Point repaired for free: ' + plural(data.hullDamage, 'point', 'points') + ' of damage left. Each credit spent repairs 1 more point' +
          (hasTrait(ctx, 'lacks-starship-facilities') ? ' (no more than 3 credits per turn on this world).' : '.')));
      }

      // Medical care
      if (sickCount(input) > 0) {
        const price = hasTrait(ctx, 'medical-science') ? 3 : 4;
        if (input.sickBayIds) lines.push(L.facts([['In Sick Bay', R.listText(R.namesOf(ctx.campaign, input.sickBayIds))]]));
        lines.push(L.text('Medical care: pay ' + price + ' credits to take 1 campaign turn off one character’s recovery, as often as you can afford. Everyone in Sick Bay now marks off one turn; those who finish can fight this turn but take no task.'));
      }

      return {
        output: {
          headline: data.seized ? 'Ship seized!' : 'Upkeep: ' + plural(cost, 'credit', 'credits'),
          tone: data.seized ? 'bad' : undefined,
          lines,
          data
        }
      };
    },
    facts(input, output, ctx) {
      const count = R.crewCount(ctx, input.crewCount);
      const facts = {
        crewCount: count,
        available: count - sickCount(input),
        hasShip: input.hasShip && !output.data.seized
      };
      if (input.sickBayIds) facts.availableIds = R.members(ctx.campaign).filter((m) => !input.sickBayIds.includes(m.id)).map((m) => m.id);
      return facts;
    },
    remember(input, output) {
      const keep = input.crewCount ? { crewCount: input.crewCount } : {};
      return Object.assign(keep, {
        hasShip: !!input.hasShip && !output.data.seized,
        debt: output.data.seized ? 0 : output.data.debt,
        hullDamage: output.data.seized ? 0 : output.data.hullDamage
      });
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 2.2 Crew tasks                                                         */
  /* ---------------------------------------------------------------------- */

  const TASKS = [
    { key: 'patron', label: 'Find a Patron', hint: '1D6 + searchers + known Patrons' },
    { key: 'train', label: 'Train', hint: '+1 XP each' },
    { key: 'trade', label: 'Trade', hint: 'A Trade Table roll each' },
    { key: 'recruit', label: 'Recruit', hint: 'Add new crew' },
    { key: 'explore', label: 'Explore', hint: 'An Exploration Table roll each' },
    { key: 'track', label: 'Track', hint: 'Find a Rival to fight' },
    { key: 'repair', label: 'Repair your kit', hint: 'Fix damaged items' },
    { key: 'decoy', label: 'Decoy', hint: 'Help avoid Rivals' }
  ];

  const RECRUIT_NOTE = 'Basic profile for their type, armed with a Handgun. No Background, Motivation or Class rolls.';

  /** Crew per task: { taskKey: count }, from named assignments or plain counts. */
  function tasksOf(input) {
    if (input.assign) {
      const counts = {};
      for (const task of Object.values(input.assign)) if (task) counts[task] = (counts[task] || 0) + 1;
      return counts;
    }
    return input.tasks || {};
  }

  /** The named crew members on a task (empty without a crew). */
  function onTask(input, ctx, key) {
    if (!input.assign) return [];
    return Object.keys(input.assign).filter((id) => input.assign[id] === key).map((id) => R.getMember(ctx.campaign, id)).filter(Boolean);
  }

  T.register({
    id: 'crew-tasks',
    step: 'world',
    number: '2.2',
    title: 'Assign and resolve crew tasks',
    page: 76,
    itemSource: 'crew tasks',
    applies: trapped,
    fields(ctx) {
      const available = ctx.facts.available !== undefined ? ctx.facts.available : crewDefault(ctx);
      const n = (key) => (v) => tasksOf(v)[key] > 0;
      const restricted = hasTrait(ctx, 'travel-restricted') ? ' Travel restricted: only one crew member may Explore.' : '';
      return [
        hasCrew(ctx)
          ? {
            key: 'assign', type: 'assign', label: 'Who does what?', perTask: 2,
            members: R.memberOptions(availableMembers(ctx)), tasks: TASKS, value: {},
            help: 'Up to two crew per task. Crew in Sick Bay aren’t listed.' + restricted
          }
          : {
            key: 'tasks', type: 'tasks', label: 'How many crew on each task?', perTask: 2, total: available,
            help: 'Up to two crew per task. Crew can also sit this turn out.' + restricted,
            tasks: TASKS, value: {}
          },
        { key: 'patrons', type: 'number', label: 'Patrons you already know', min: 0, max: 20, value: ctx.memory.patrons || 0, showIf: n('patron'), help: 'Each adds +1 to the Patron search.' },
        { key: 'patronCredits', type: 'number', label: 'Credits spent on the Patron search', min: 0, max: 50, value: 0, showIf: n('patron'), help: '+1 per credit.' },
        { key: 'extraTrades', type: 'number', label: 'Extra Trade rolls bought (3 credits each)', min: 0, max: 10, value: 0, showIf: n('trade') },
        { key: 'rivals', type: 'number', label: 'Rivals you have', min: 0, max: 30, value: ctx.memory.rivals || 0, showIf: (v) => n('track')(v) || n('explore')(v) },
        { key: 'trackCredits', type: 'number', label: 'Credits spent on Tracking', min: 0, max: 50, value: 0, showIf: n('track'), help: '+1 per credit.' },
        { key: 'repairCredits', type: 'number', label: 'Credits on spare parts, per Repair attempt', min: 0, max: 20, value: 0, showIf: n('repair'), help: '+1 per credit.' }
      ];
    },
    validate(input, ctx) {
      const t = tasksOf(input);
      const available = ctx.facts.available !== undefined ? ctx.facts.available : crewDefault(ctx);
      const used = TASKS.reduce((sum, task) => sum + (t[task.key] || 0), 0);
      const over = TASKS.find((task) => (t[task.key] || 0) > 2);
      if (over) return over.label + ': at most 2 crew per task.';
      if (!input.assign && used > available) return 'Only ' + available + ' crew are available for tasks.';
      if (hasTrait(ctx, 'travel-restricted') && (t.explore || 0) > 1) return 'Travel restricted: only one crew member may Explore on this world.';
      return null;
    },
    resolve(input, ctx) {
      const t = tasksOf(input);
      const crewCount = ctx.facts.crewCount || crewDefault(ctx);
      const rivals = input.rivals !== undefined ? input.rivals : (ctx.memory.rivals || 0);
      const steps = [];
      const who = (key) => onTask(input, ctx, key);
      const names = (key) => R.listText(who(key).map(R.nameOf));

      if (t.patron) {
        steps.push({
          group: 'Find a Patron (' + (input.assign ? names('patron') : plural(t.patron, 'crew member', 'crew')) + ')',
          steps: [{
            roll: '1D6', label: 'Patron search',
            add: [
              { label: 'searchers', value: t.patron },
              { label: 'known Patrons', value: input.patrons || 0 },
              { label: 'credits', value: input.patronCredits || 0 },
              { label: 'Opportunities', value: hasTrait(ctx, 'opportunities') ? 1 : 0 },
              { label: 'Corporate state', value: hasTrait(ctx, 'corporate-state') ? 2 : 0 }
            ],
            outcomes: [
              { max: 4, text: 'No Patron found.', tone: 'bad' },
              { min: 5, max: 5, text: 'A Patron offers you a job.', tone: 'good', gain: { patronOffers: 1 } },
              { min: 6, text: 'Two Patrons offer jobs: you may take either.', tone: 'good', gain: { patronOffers: 2 } }
            ]
          }].concat(hasTrait(ctx, 'corporate-state') ? [{ text: 'Corporate state: Patrons here are always Corporations, and failing a mission blacklists you.', tone: 'note' }] : [])
        });
      }

      if (t.train) {
        const trainees = input.assign ? names('train') : 'the ' + plural(t.train, 'crew member', 'crew') + ' training';
        steps.push({ group: 'Train', steps: [{ text: '+1 XP for ' + (input.assign ? trainees : 'each of ' + trainees) + '. If that allows a Character Upgrade (p.123), resolve it now.' }] });
      }

      const trades = (t.trade || 0) + (t.trade ? input.extraTrades || 0 : 0);
      const traders = who('trade');
      for (let i = 1; i <= trades; i++) {
        const trader = i <= t.trade ? traders[i - 1] : null;
        steps.push({
          group: trader ? 'Trade: ' + R.nameOf(trader) : i <= t.trade ? 'Trader ' + i : 'Bought Trade roll ' + (i - t.trade),
          source: trader ? 'a trade roll by ' + R.nameOf(trader) : i <= t.trade ? 'a trade roll' : 'a bought trade roll',
          who: trader ? R.who(trader) : undefined,
          steps: [{ table: 'Trade Table' }]
        });
      }
      if (t.trade && hasTrait(ctx, 'free-trade-zone')) {
        steps.push({ when: 'Free trade zone: one trader may roll twice and keep either result', steps: [{ table: 'Trade Table', label: 'Second roll' }] });
      }
      if (t.trade && hasTrait(ctx, 'busy-markets')) {
        steps.push({ text: 'Busy markets: you may also pay 2 credits once for another Trade Table roll.', tone: 'note' });
      }

      if (t.recruit) {
        const recruitSteps = [];
        if (crewCount < 6) {
          const auto = Math.min(t.recruit, 6 - crewCount);
          recruitSteps.push({ text: 'Fewer than 6 crew: ' + plural(auto, 'recruit joins', 'recruits join') + ' automatically.' });
          for (let i = 1; i <= auto; i++) recruitSteps.push({ group: 'Recruit ' + i, steps: [{ species: true }] });
        } else {
          recruitSteps.push({
            roll: '1D6', label: 'Recruiting', target: 6,
            add: [
              { label: 'recruiters', value: t.recruit },
              { label: 'Easy recruiting', value: hasTrait(ctx, 'easy-recruiting') ? 1 : 0 }
            ],
            outcomes: [
              { min: 6, text: 'A new recruit joins:', tone: 'good', then: [{ species: true }] },
              { max: 5, text: 'Nobody suitable this time. (A Luxury trinket would add +2.)' }
            ]
          });
        }
        recruitSteps.push({ text: RECRUIT_NOTE, tone: 'note' });
        if (hasTrait(ctx, 'adventurous-population')) recruitSteps.push({ text: 'Adventurous population: roll up one extra character and choose who to hire.', tone: 'note' });
        if (hasTrait(ctx, 'alien-species-restricted')) recruitSteps.push({ text: 'Alien species restricted: a recruit of the restricted species counts as a Baseline Human instead.', tone: 'note' });
        steps.push({ group: 'Recruit' + (input.assign ? ' (' + names('recruit') + ')' : ''), steps: recruitSteps });
      }

      const explorers = who('explore');
      for (let i = 1; i <= (t.explore || 0); i++) {
        const explorer = explorers[i - 1];
        steps.push({
          group: explorer ? 'Explore: ' + R.nameOf(explorer) : 'Explorer ' + i,
          source: explorer ? 'exploration by ' + R.nameOf(explorer) : 'exploration',
          who: explorer ? R.who(explorer) : undefined,
          steps: [{ table: 'Exploration Table' }]
        });
      }

      if (t.track) {
        steps.push({
          group: 'Track' + (input.assign ? ' (' + names('track') + ')' : ''),
          steps: rivals > 0
            ? [{
              roll: '1D6', label: 'Tracking', target: 6,
              add: [{ label: 'trackers', value: t.track }, { label: 'credits', value: input.trackCredits || 0 }],
              outcomes: [
                { min: 6, text: 'You locate a Rival of your choice: you may fight them this turn.', tone: 'good', gain: { tracked: 1 } },
                { max: 5, text: 'No trace of them.' }
              ]
            }]
            : [{ text: 'You have no Rivals to track.' }]
        });
      }

      const repairers = who('repair');
      for (let i = 1; i <= (t.repair || 0); i++) {
        const repairer = repairers[i - 1];
        steps.push({
          group: repairer ? 'Repair: ' + R.nameOf(repairer) : 'Repair ' + i,
          steps: [{
            roll: '1D6', label: 'Repair (1D6 + Savvy, needs 6+)', savvy: true, engineer: true, target: 6,
            who: repairer ? R.who(repairer) : undefined,
            add: [
              { label: 'spare parts', value: input.repairCredits || 0 },
              { label: 'Technical knowledge', value: hasTrait(ctx, 'technical-knowledge') ? 1 : 0 }
            ],
            outcomes: [{ natural: 1, final: true, fail: true, text: 'Natural 1: the item is beyond fixing.', tone: 'bad' }]
          }]
        });
      }

      if (t.decoy) {
        steps.push({ group: 'Decoy' + (input.assign ? ' (' + names('decoy') + ')' : ''), steps: [{ text: '+' + t.decoy + ' when checking whether your Rivals find you (stage 2.6).' }] });
      }

      if (!steps.length) steps.push({ text: 'Nobody took a task this turn.' });

      const run = F.start(steps, env(ctx, Object.assign(R.crewEnv(ctx, crewCount), { rivals: rivals })));
      const busy = TASKS.filter((task) => t[task.key]).map((task) => task.label + ' ' + t[task.key]);
      return runOutput(busy.length ? busy.join(' · ') : 'No tasks', run);
    },
    choose: chooseInRun,
    facts(input, output, ctx) {
      const gains = output.fu.gains || {};
      const travel = ctx.facts.travelGains || {};
      return {
        decoys: tasksOf(input).decoy || 0,
        tracked: (gains.tracked || 0) > 0,
        patronOffers: gains.patronOffers || 0,
        rumorsGained: (travel.rumors || 0) + (gains.rumors || 0),
        rivalsGained: gains.rivals || 0
      };
    },
    remember(input, output, ctx) {
      const keep = {};
      if (input.patrons !== undefined) keep.patrons = input.patrons;
      const base = input.rivals !== undefined ? input.rivals : (ctx.memory.rivals || 0);
      keep.rivals = base + ((output.fu.gains || {}).rivals || 0);
      return keep;
    },
    apply(input, output, ctx) {
      addGained(ctx, { rivals: (output.fu.gains || {}).rivals || 0 });
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 2.3 Job offers                                                         */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'job-offers',
    itemSource: 'a job offer',
    step: 'world',
    number: '2.3',
    title: 'Determine job offers',
    page: 83,
    applies: trapped,
    fields(ctx) {
      if (ctx.planet) {
        return [
          {
            key: 'offers', type: 'number', label: 'Offers from new Patrons', min: 0, max: 6,
            value: ctx.facts.patronOffers || 0,
            help: 'Pre-filled from this turn’s Patron search and Exploration. Each becomes a named Patron on ' + ctx.planet.name + '.'
          },
          {
            key: 'known', type: 'select', label: 'Is a Patron you know offering a job?', value: '',
            options: [{ value: '', label: 'No' }].concat(ctx.planet.patrons.map((p) => ({ value: p.id, label: p.name + (p.patronType ? ' (' + LP.planets.patronTypeName(p.patronType) + ')' : '') })))
          }
        ];
      }
      return [{
        key: 'offers', type: 'number', label: 'Job offers to generate', min: 0, max: 6,
        value: ctx.facts.patronOffers || 0,
        help: 'Pre-filled from this turn’s Patron search and Exploration. Add one if a Patron you know is offering a job.'
      }];
    },
    resolve(input, ctx) {
      if (ctx.planet) return namedOffers(input, ctx);
      if (!input.offers) {
        return { output: { headline: 'No job offers', lines: [L.text('No Patron jobs this turn.')] } };
      }
      const steps = [];
      for (let i = 1; i <= input.offers; i++) steps.push({ group: 'Job offer ' + i, steps: [{ table: 'Patron Table', label: 'Patron' }] });
      steps.push({ text: 'Benefits are only paid if the mission succeeds. You may turn any job down after seeing the details.', tone: 'note' });
      const run = F.start(steps, env(ctx, {}));
      return runOutput(plural(input.offers, 'job offer', 'job offers'), run);
    },
    choose: chooseInRun,
    facts(input, output) {
      const d = output.data || {};
      const ids = (d.patronIds || []).slice();
      return { jobsOffered: (input.offers || 0) + (input.known ? 1 : 0), jobPatronIds: ids };
    },
    apply(input, output, ctx) {
      const d = output.data || {};
      if (!ctx.planet || !d.newPatrons) return;
      for (const p of d.newPatrons) if (!ctx.planet.patrons.some((x) => x.id === p.id)) ctx.planet.patrons.push(JSON.parse(JSON.stringify(p)));
    }
  });

  /**
   * Job offers from named Patrons: new ones are created from the archetype,
   * a known one keeps its Patron type. Each offer rolls Danger Pay, Time Frame
   * and Benefits/Hazards/Conditions for that type.
   */
  function namedOffers(input, ctx) {
    const P = LP.planets;
    const scratch = JSON.parse(JSON.stringify(ctx.planet));
    const offers = [];
    if (input.known) {
      const known = ctx.planet.patrons.find((p) => p.id === input.known);
      if (known) offers.push(known);
    }
    const newPatrons = [];
    for (let i = 0; i < (input.offers || 0); i++) {
      const p = P.newPatron(ctx.campaign, scratch);
      newPatrons.push(p);
      offers.push(p);
    }
    if (!offers.length) {
      return { output: { headline: 'No job offers', lines: [L.text('No Patron jobs this turn.')], data: { patronIds: [], newPatrons: [] } } };
    }
    const steps = offers.map((p) => {
      const type = p.patronType || LP.rng.rollTable('Patron Table').id;
      return {
        group: p.name + ' (' + P.patronTypeName(type) + (newPatrons.includes(p) ? ', new' : '') + ')',
        steps: F.scriptFor('Patron Table', type)
      };
    });
    steps.push({ text: 'Benefits are only paid if the mission succeeds. You may turn any job down after seeing the details.', tone: 'note' });
    const run = F.start(steps, env(ctx, {}));
    const result = runOutput(plural(offers.length, 'job offer', 'job offers') + ': ' + offers.map((p) => p.name).join(', '), run);
    result.output.data = { patronIds: offers.map((p) => p.id), newPatrons: newPatrons };
    return result;
  }

  /* ---------------------------------------------------------------------- */
  /* 2.4 Assign equipment                                                   */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'assign-equipment',
    step: 'world',
    number: '2.4',
    title: 'Assign equipment',
    page: 85,
    submitLabel: 'Done',
    fields(ctx) {
      const where = hasCrew(ctx) ? 'Swap items between characters and the Stash on the Crew tab now.' : 'Swap items between characters and the Stash now.';
      return [{ key: 'note', type: 'info', text: where + ' What each character carries is what they take into battle. Without a ship, the Stash holds only 5 items (duplicate consumables count as one).' }];
    },
    resolve(input, ctx) {
      if (!hasCrew(ctx)) return { output: { headline: 'Equipment assigned', lines: [] } };
      const names = (list) => list.length ? list.map((i) => i.name + (i.damaged ? ' (damaged)' : '')).join(', ') : 'Nothing';
      const items = R.members(ctx.campaign).map((m) => [R.nameOf(m), names(R.itemsOf(ctx.campaign, m.id))]);
      items.push(['Stash', names(R.itemsOf(ctx.campaign, null))]);
      return { output: { headline: 'Equipment assigned', lines: [L.facts(items)] } };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 2.5 Resolve Rumors                                                     */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'rumors',
    step: 'world',
    number: '2.5',
    title: 'Resolve any Rumors',
    page: 85,
    applies: trapped,
    fields(ctx) {
      return [
        { key: 'onQuest', type: 'yesno', label: 'Are you on a Quest?', value: !!ctx.memory.onQuest },
        {
          key: 'rumors', type: 'number', label: 'Rumors you have', min: 0, max: 30,
          value: (ctx.memory.rumors || 0) + (ctx.facts.rumorsGained || 0),
          help: 'Includes ' + plural(ctx.facts.rumorsGained || 0, 'Rumor', 'Rumors') + ' gained this turn.',
          showIf: (v) => !v.onQuest
        }
      ];
    },
    resolve(input) {
      if (input.onQuest) {
        return { output: { headline: 'On a Quest', lines: [L.text('While the Quest lasts, any Rumor you gain is a Quest Rumor instead (p.120).')], data: { quest: false } } };
      }
      if (!input.rumors) {
        return { output: { headline: 'No Rumors', lines: [L.text('Nothing to follow up.')], data: { quest: false } } };
      }
      const roll = L.roll('1D6', { label: 'Rumors (a Quest on a roll of ' + input.rumors + ' or less)' });
      const quest = roll.total <= input.rumors;
      roll.success = quest;
      roll.text = quest ? 'You have a Quest! Remove all Rumors; you may pursue it right away.' : 'The Rumors don’t lead anywhere yet.';
      return {
        output: { headline: quest ? 'New Quest!' : 'No Quest yet', tone: quest ? 'good' : undefined, lines: [roll], data: { quest } }
      };
    },
    facts(input, output) {
      return { onQuest: !!input.onQuest || !!output.data.quest };
    },
    remember(input, output, ctx) {
      const quest = !!output.data.quest;
      let rumors;
      if (input.onQuest) rumors = ctx.memory.rumors || 0; // count not asked while on a Quest
      else rumors = quest ? 0 : input.rumors || 0;
      return { onQuest: !!input.onQuest || quest, rumors: rumors };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 2.6 Choose your battle                                                 */
  /* ---------------------------------------------------------------------- */

  const BATTLES = {
    opportunity: 'Opportunity mission',
    rival: 'Attack a Rival',
    quest: 'Continue a Quest',
    patron: 'Patron job'
  };

  T.register({
    id: 'choose-battle',
    step: 'world',
    number: '2.6',
    title: 'Choose your battle',
    page: 85,
    fields(ctx) {
      if (ctx.facts.fleeFailed) {
        return [{ key: 'note', type: 'info', text: 'You failed to flee the invasion: this turn’s battle is an Invasion Battle.' }];
      }
      if (ctx.planet) {
        return [
          { key: 'rivalsInfo', type: 'info', text: ctx.planet.rivals.length ? 'Rivals on ' + ctx.planet.name + ': ' + ctx.planet.rivals.map((r) => r.name).join(', ') + '.' : 'You have no Rivals on ' + ctx.planet.name + '.' },
          {
            key: 'privateTransport', type: 'yesno', value: false,
            label: 'Are you taking a Patron job with the Private Transport hazard?',
            help: 'If so, Rivals can’t find you this turn.',
            showIf: () => ctx.planet.rivals.length > 0 && (ctx.facts.jobsOffered || 0) > 0
          },
          { key: 'patronJob', type: 'yesno', value: (ctx.facts.jobsOffered || 0) > 0, label: 'Do you have a Patron job you can take?' }
        ];
      }
      return [
        { key: 'rivals', type: 'number', label: 'Rivals you have', min: 0, max: 30, value: ctx.memory.rivals || 0 },
        {
          key: 'privateTransport', type: 'yesno', value: false,
          label: 'Are you taking a Patron job with the Private Transport hazard?',
          help: 'If so, Rivals can’t find you this turn.',
          showIf: (v) => v.rivals > 0 && (ctx.facts.jobsOffered || 0) > 0
        },
        {
          key: 'patronJob', type: 'yesno', value: (ctx.facts.jobsOffered || 0) > 0,
          label: 'Do you have a Patron job you can take?'
        }
      ];
    },
    resolve(input, ctx) {
      if (ctx.facts.fleeFailed) {
        return {
          output: {
            headline: 'Invasion Battle', tone: 'bad',
            lines: [L.text('Fight an Invasion Battle (p.92). If you survive, you escape and travel next turn.')],
            data: { battle: 'invasion' }
          }
        };
      }

      const lines = [];
      const named = ctx.planet ? ctx.planet.rivals : null;
      const rivals = named ? named.length : (input.rivals || 0);
      const decoys = ctx.facts.decoys || 0;
      if (rivals > 0 && input.privateTransport) {
        lines.push(L.text('Private Transport: your Rivals can’t track you this turn.', 'good'));
      } else if (rivals > 0) {
        const check = L.roll('1D6', {
          label: 'Do your Rivals find you? (found on ' + rivals + ' or less)',
          modifiers: [{ label: 'Decoys', value: decoys }]
        });
        const found = check.total <= rivals;
        check.success = !found;
        check.text = found ? 'A Rival has tracked you down.' : 'You slip past your Rivals.';
        lines.push(check);
        if (found) {
          const which = LP.rng.int(rivals);
          const who = named ? named[which].name : 'Rival ' + (which + 1) + ' of ' + rivals + ' (in your list order)';
          lines.push(L.text(who + ' attacks. Patron jobs fail if their time runs out; Quests and Rumors wait.', 'bad'));
          return { output: { headline: 'Rival attack!' + (named ? ' ' + named[which].name : ''), tone: 'bad', lines, data: { battle: 'rival-attack', rivalId: named ? named[which].id : null } } };
        }
      } else {
        lines.push(L.text('No Rivals to worry about.'));
      }

      const options = [{ value: 'opportunity', label: BATTLES.opportunity }];
      if (ctx.facts.tracked && named && named.length) {
        for (const r of named) options.push({ value: 'rival:' + r.id, label: 'Attack ' + r.name });
      } else if (ctx.facts.tracked) {
        options.push({ value: 'rival', label: BATTLES.rival });
      }
      if (ctx.facts.onQuest || ctx.memory.onQuest) options.push({ value: 'quest', label: BATTLES.quest });
      if (input.patronJob) options.push({ value: 'patron', label: BATTLES.patron });
      lines.push(L.text('If an Exploration result (Got yourself noticed) forces a Rival fight, take that instead.', 'note'));

      if (options.length === 1) {
        lines.push(L.text('Your only option is an Opportunity mission.'));
        return { output: { headline: 'Battle: ' + BATTLES.opportunity, lines, data: { battle: 'opportunity' } } };
      }
      return {
        output: { headline: 'Choose your battle', lines, data: { battle: null } },
        pending: { prompt: 'Which battle will you fight?', options }
      };
    },
    choose(record, value) {
      const output = JSON.parse(JSON.stringify(record.output));
      if (value.startsWith('rival:')) {
        const option = record.pending.options.find((o) => o.value === value);
        output.headline = 'Battle: ' + option.label;
        output.data.battle = 'rival';
        output.data.rivalId = value.slice(6);
      } else {
        output.headline = 'Battle: ' + BATTLES[value];
        output.data.battle = value;
      }
      return { output };
    },
    facts(input, output) {
      return { battleType: output.data.battle, rivalId: output.data.rivalId || null };
    },
    remember(input) {
      return input.rivals !== undefined ? { rivals: input.rivals } : {};
    }
  });
})(window.LP);
