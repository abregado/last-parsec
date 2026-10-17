(function (LP) {
  'use strict';

  /* Step 4: Post-Battle Sequence (pp.119-128). */

  const T = LP.turn;
  const L = T.line;
  const F = LP.followup;

  const BATTLE_TYPES = [
    { value: 'opportunity', label: 'Opportunity mission' },
    { value: 'patron', label: 'Patron job' },
    { value: 'quest', label: 'Quest mission' },
    { value: 'quest-finale', label: 'Quest finale' },
    { value: 'rival', label: 'Attack a Rival (tracked)' },
    { value: 'rival-attack', label: 'Rival attack' },
    { value: 'invasion', label: 'Invasion battle' }
  ];

  const CATEGORIES = [
    { value: 'criminal-elements', label: 'Criminal Elements' },
    { value: 'hired-muscle', label: 'Hired Muscle' },
    { value: 'interested-parties', label: 'Interested Parties' },
    { value: 'roving-threats', label: 'Roving Threats' }
  ];

  const COURSES = [
    ['Pilot Training', 20], ['Mechanic training', 15], ['Medical school', 20], ['Merchant school', 10],
    ['Security training', 10], ['Broker training', 15], ['Bot technician', 10]
  ];

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function hasTrait(ctx, id) {
    return (ctx.facts.worldTraits || ctx.memory.worldTraits || []).includes(id);
  }

  /** Post-battle facts from stage 4.0. */
  function pb(ctx) {
    return ctx.facts.post || null;
  }

  function isRivalFight(p) {
    return p.type === 'rival' || p.type === 'rival-attack';
  }

  function hasObjective(type) {
    return ['opportunity', 'patron', 'quest', 'quest-finale'].includes(type);
  }

  /** Was this a turn spent fleeing an invasion (no pay, purchases or Campaign Events)? */
  function fleeing(ctx) {
    return !!(ctx.facts.fled || ctx.facts.fleeFailed);
  }

  function env(ctx, extra) {
    return Object.assign({
      crewSize: ctx.settings.crewSize,
      crewCount: ctx.facts.crewCount || ctx.memory.crewCount || ctx.settings.crewSize,
      disabled: ctx.campaign && ctx.campaign.models ? ctx.campaign.models.disabled : {}
    }, extra);
  }

  function runOutput(headline, run, lines) {
    return { output: { headline: headline, lines: lines || [], fu: run }, pending: F.pendingChoice(run) };
  }

  function chooseInRun(record, value) {
    const run = JSON.parse(JSON.stringify(record.output.fu));
    F.choose(run, value);
    return { output: Object.assign({}, record.output, { fu: run }), pending: F.pendingChoice(run) };
  }

  function needs(ctx) {
    return pb(ctx) ? true : 'Enter the battle result first.';
  }

  /** Battle summary from the Battle tab, if one has been generated. */
  function battleSummary(ctx) {
    const c = ctx.campaign;
    if (!c || !c.battle || !c.battle.generated || !LP.battle) return null;
    try {
      return LP.battle.summary(LP.battle.normalize(JSON.parse(JSON.stringify(c.battle)), { settings: c.settings, campaign: c }), { settings: c.settings, campaign: c });
    } catch (e) {
      return null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 4.0 Battle result                                                      */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'battle-result',
    step: 'post',
    number: '4.0',
    title: 'Battle result',
    page: 119,
    fields(ctx) {
      const s = battleSummary(ctx);
      const fromTurn = ctx.facts.battleType && LP.battle ? LP.battle.FROM_TURN[ctx.facts.battleType] : null;
      const type = fromTurn || (s && s.mission) || 'opportunity';
      const isType = (...types) => (v) => types.includes(v.type);
      const fielded = ctx.campaign && ctx.campaign.battle && ctx.campaign.battle.options ? ctx.campaign.battle.options.crewFielded : ctx.settings.crewSize;
      return [
        {
          key: 'note', type: 'info',
          text: s ? 'Pre-filled from the battle generated on the Battle tab (' + (s.enemyName || 'enemy') + '). Check it matches what you played.' : 'Fight your battle, then record how it went.'
        },
        { key: 'type', type: 'select', label: 'Battle type', options: BATTLE_TYPES, value: type },
        { key: 'category', type: 'select', label: 'Enemy category', options: CATEGORIES, value: (s && s.enemyCategory) || 'criminal-elements', showIf: (v) => v.type !== 'invasion' },
        { key: 'heldField', type: 'yesno', label: 'Did you Hold the Field?', value: true },
        { key: 'won', type: 'yesno', label: 'Did you Win (complete the objective)?', value: true, showIf: (v) => hasObjective(v.type) },
        { key: 'invasionThreat', type: 'yesno', label: 'Was the enemy an Invasion Threat?', value: !!(s && s.invasionThreat), showIf: (v) => v.type !== 'invasion' },
        { key: 'uniqueKilled', type: 'yesno', label: 'Did you kill a Unique Individual?', value: false },
        { key: 'participants', type: 'number', label: 'Crew who took part', min: 1, max: 12, value: fielded || ctx.settings.crewSize },
        { key: 'casualties', type: 'number', label: 'Casualties (not Bots or Soulless)', min: 0, max: 12, value: 0, help: 'Knocked out (3 Stuns at once) doesn’t count.' },
        { key: 'botCasualties', type: 'number', label: 'Bot and Soulless casualties', min: 0, max: 12, value: 0 },
        { key: 'firstBlood', type: 'yesno', label: 'Did one of your crew inflict the first casualty?', value: true },
        { key: 'dangerPay', type: 'number', label: 'Danger Pay (credits)', min: 0, max: 10, value: 0, showIf: isType('patron') },
        { key: 'payTwice', type: 'yesno', label: 'Danger Pay lets you roll twice for pay (10+ result)?', value: false, showIf: isType('patron') },
        { key: 'hotJob', type: 'yesno', label: 'Was it a Hot Job (enemies become Rivals on 1–2)?', value: false, showIf: isType('patron') },
        { key: 'questRumors', type: 'number', label: 'Quest Rumors gathered on this Quest', min: 0, max: 30, value: ctx.memory.rumors || 0, showIf: isType('quest') },
        { key: 'bounty', type: 'number', label: 'Criminal bounty (credits, if any)', min: 0, max: 3, value: s && s.bounty ? s.bounty : 0, showIf: (v) => v.category === 'criminal-elements' && v.type !== 'invasion' }
      ];
    },
    validate(input) {
      if ((input.casualties || 0) + (input.botCasualties || 0) > input.participants) return 'More casualties than crew who took part.';
      return null;
    },
    resolve(input, ctx) {
      const type = BATTLE_TYPES.find((t) => t.value === input.type).label;
      const items = [['Battle', type]];
      if (input.type !== 'invasion') items.push(['Enemy', CATEGORIES.find((c) => c.value === input.category).label]);
      items.push(['Held the Field', input.heldField ? 'Yes' : 'No']);
      if (hasObjective(input.type)) items.push(['Won', input.won ? 'Yes' : 'No']);
      items.push(['Casualties', String((input.casualties || 0) + (input.botCasualties || 0))]);
      return { output: { headline: type + (input.heldField ? ': held the field' : ': driven off'), lines: [L.facts(items)] } };
    },
    facts(input, output, ctx) {
      const s = battleSummary(ctx) || {};
      return {
        post: {
          type: input.type,
          category: input.type === 'invasion' ? null : input.category,
          heldField: !!input.heldField,
          won: hasObjective(input.type) ? !!input.won : false,
          invasionThreat: input.type !== 'invasion' && !!input.invasionThreat,
          uniqueKilled: !!input.uniqueKilled,
          participants: input.participants,
          casualties: input.casualties || 0,
          botCasualties: input.botCasualties || 0,
          firstBlood: !!input.firstBlood,
          dangerPay: input.dangerPay || 0,
          payTwice: !!input.payTwice,
          hotJob: !!input.hotJob,
          questRumors: input.questRumors || 0,
          bounty: input.bounty || 0,
          extraLoot: !!s.extraLoot,
          extraFinds: !!s.extraFinds
        }
      };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 1. Rival status                                                        */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'rival-status',
    step: 'post',
    number: '4.1',
    title: 'Resolve Rival status',
    page: 119,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      if (p.type === 'invasion') return 'Skipped after Invasion battles.';
      if (p.category === 'roving-threats') return 'Roving Threats never become Rivals.';
      if (!p.heldField) return 'You didn’t Hold the Field.';
      return true;
    },
    fields(ctx) {
      const p = pb(ctx);
      return [{ key: 'rivals', type: 'number', label: 'Rivals you have now', min: 0, max: 30, value: ctx.memory.rivals || 0, showIf: () => isRivalFight(p) }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      const data = { gained: 0, removed: 0, hate: false };
      if (isRivalFight(p)) {
        const roll = L.roll('1D6', {
          label: 'Chase off the Rival (4+)',
          target: 4,
          modifiers: [
            { label: 'tracked them', value: p.type === 'rival' && ctx.facts.tracked ? 1 : 0 },
            { label: 'killed a Unique Individual', value: p.uniqueKilled ? 1 : 0 }
          ],
          successText: 'They’ve had enough: remove them from your Rivals.',
          failText: 'They’ll be back.'
        });
        data.removed = roll.success ? 1 : 0;
        data.rivals = Math.max(0, (input.rivals || 0) - data.removed);
        const lines = [roll, L.text('Vigilantes are Persistent: −1 to this roll against them.', 'note')];
        return { output: { headline: roll.success ? 'Rival removed' : 'The Rival remains', tone: roll.success ? 'good' : undefined, lines, data } };
      }

      const threshold = hasTrait(ctx, 'vendetta-system') || p.hotJob ? 2 : 1;
      const why = threshold === 2 ? (p.hotJob ? ' (Hot Job)' : ' (Vendetta system)') : '';
      const lines = [];
      if (p.category === 'criminal-elements' && !hasTrait(ctx, 'heavily-enforced')) {
        const roll = L.roll('2D6', { label: 'Do the criminals hold a grudge? (Rivals on a ' + (threshold === 2 ? '1–2' : '1') + ' on either die' + why + ')' });
        const hits = roll.dice.filter((d) => d <= threshold).length;
        data.gained = hits ? 1 : 0;
        data.hate = roll.dice.every((d) => d === 1);
        roll.success = !hits;
        roll.text = data.hate ? 'Double 1s: they hate you! They become Rivals and add +1 to their numbers in every battle.'
          : (hits ? 'They become your Rivals on this world.' : 'Business is business: they leave you alone.');
        lines.push(roll);
      } else {
        const roll = L.roll('1D6', { label: 'Do they hold a grudge? (Rivals on a ' + (threshold === 2 ? '1–2' : '1') + why + ')' });
        data.gained = roll.total <= threshold ? 1 : 0;
        roll.success = !data.gained;
        roll.text = data.gained ? 'They become your Rivals on this world.' : 'They’ve had enough, or decided business is business.';
        lines.push(roll);
        if (p.category === 'criminal-elements') lines.push(L.text('Heavily enforced: Criminal Elements only roll a single die here.', 'note'));
      }
      return { output: { headline: data.gained ? 'New Rival!' : 'No new Rival', tone: data.gained ? 'bad' : 'good', lines, data } };
    },
    remember(input, output, ctx) {
      const d = output.data;
      if (d.rivals !== undefined) return { rivals: d.rivals };
      return { rivals: (ctx.memory.rivals || 0) + d.gained };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 2. Patron status                                                       */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'patron-status',
    step: 'post',
    number: '4.2',
    title: 'Resolve Patron status',
    page: 119,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      return p.type === 'patron' ? true : 'Not a Patron job.';
    },
    fields(ctx) {
      return pb(ctx).won
        ? [{ key: 'oneTime', type: 'yesno', label: 'Was it a One-time Contract?', value: false }]
        : [{ key: 'note', type: 'info', text: 'The job wasn’t a success.' }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      const added = p.won && !input.oneTime;
      return {
        output: {
          headline: added ? 'New Patron contact' : 'No new contact',
          lines: [L.text(added
            ? 'Add the Patron to your contacts on this world. Patrons stay behind when you travel unless they are Persistent.'
            : (p.won ? 'One-time Contract: they can’t be kept as a contact.' : 'Failed jobs don’t earn a contact. A Vengeful Patron becomes a Rival.'))],
          data: { added }
        }
      };
    },
    remember(input, output, ctx) {
      return output.data.added ? { patrons: (ctx.memory.patrons || 0) + 1 } : {};
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 3. Quest progress                                                      */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'quest-progress',
    step: 'post',
    number: '4.3',
    title: 'Determine Quest progress',
    page: 120,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      return p.type === 'quest' || p.type === 'quest-finale' ? true : 'Not a Quest mission.';
    },
    fields() {
      return [{ key: 'note', type: 'info', text: 'Roll for your progress on the Quest.' }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      if (p.type === 'quest-finale') {
        return {
          output: {
            headline: p.won ? 'Quest complete!' : 'The finale failed',
            tone: p.won ? 'good' : 'bad',
            lines: [L.text(p.won
              ? 'You finished the Quest. Pay rolls twice (pick the better, +1), you get three Loot rolls, and every crew member in the battle earns +1 XP.'
              : 'You didn’t complete the final mission. You can try the finale again later.')],
            data: { done: p.won, finaleNext: !p.won, rumorGained: 0 }
          }
        };
      }
      const roll = L.roll('1D6', {
        label: 'Quest progress',
        modifiers: [{ label: 'Quest Rumors', value: p.questRumors }, { label: 'not Won', value: p.won ? 0 : -2 }]
      });
      const data = { done: false, finaleNext: false, rumorGained: 0 };
      const lines = [roll];
      if (roll.total <= 3) {
        roll.text = 'A dead end. The Quest continues.';
      } else if (roll.total <= 6) {
        roll.text = 'A step closer: gain a Quest Rumor.';
        data.rumorGained = 1;
      } else {
        roll.text = 'The end is in sight: your next Quest mission is the finale (a Straight-up Fight with +1 enemy, who are Fearless).';
        data.finaleNext = true;
      }
      if (roll.total >= 4) {
        const where = L.roll('1D6', { label: 'Where next?' });
        where.text = where.total >= 5 ? 'The next step is on another world: you must travel before you can progress (no hurry).' : 'The next step is on this world.';
        lines.push(where);
      }
      return { output: { headline: data.finaleNext ? 'Finale next!' : (data.rumorGained ? 'A step closer' : 'Dead end'), lines, data } };
    },
    facts(input, output) {
      return { questDone: !!output.data.done };
    },
    remember(input, output, ctx) {
      const d = output.data;
      if (d.done) return { onQuest: false, rumors: 0, questFinaleNext: false };
      return { onQuest: true, rumors: (pb(ctx).questRumors || 0) + d.rumorGained, questFinaleNext: d.finaleNext };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 4. Get paid                                                            */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'get-paid',
    step: 'post',
    number: '4.4',
    title: 'Get paid',
    page: 120,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      if (p.type === 'invasion') return 'No payment after an Invasion battle.';
      if (fleeing(ctx)) return 'No payment while fleeing an invasion.';
      return true;
    },
    fields() {
      return [{ key: 'note', type: 'info', text: 'Roll 1D6 credits in pay, loot, bounty or salvage.' }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      const finale = p.type === 'quest-finale' && p.won;
      const twice = finale || p.payTwice;
      const booming = hasTrait(ctx, 'booming-economy');
      const rolls = [];
      for (let i = 0; i < (twice ? 2 : 1); i++) {
        let r = LP.rng.roll('1D6').total;
        const first = r;
        while (booming && r === 1) r = LP.rng.roll('1D6').total;
        rolls.push({ first, value: r });
      }
      const best = Math.max(...rolls.map((r) => r.value));
      const floor = p.won && !isRivalFight(p) && best <= 2 ? 3 - best : 0;
      const mods = [
        { label: 'Won: a 1–2 counts as 3', value: floor },
        { label: 'Quest finale', value: finale ? 1 : 0 },
        { label: 'Easy', value: ctx.settings.difficulty === 'easy' ? 1 : 0 },
        { label: 'Danger Pay', value: p.type === 'patron' ? p.dangerPay : 0 },
        { label: 'Criminal bounty', value: p.heldField ? p.bounty : 0 }
      ].filter((m) => m.value);
      const total = best + mods.reduce((sum, m) => sum + m.value, 0);

      const notes = [];
      if (twice) notes.push('Rolled ' + rolls.map((r) => r.value).join(' and ') + '; kept the better.');
      if (booming && rolls.some((r) => r.first === 1)) notes.push('Booming economy: 1s rerolled.');
      const line = {
        type: 'roll', label: 'Pay (credits)', notation: '1D6', dice: [best],
        base: best, modifiers: mods, total: total, text: notes.join(' ')
      };
      const lines = [line];
      if (p.type === 'patron') lines.push(L.text('Danger Pay is paid even if the mission failed (unless the job was Demanding). Benefits only pay out on success.', 'note'));
      lines.push(L.text('Credits from Notable Sights picked up during the battle are on top of this.', 'note'));
      return { output: { headline: plural(total, 'credit', 'credits'), tone: 'good', lines } };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 5. Battlefield finds                                                   */
  /* ---------------------------------------------------------------------- */

  const EVIDENCE = ['curious-data-stick-invasion-evidence', 'vital-info-invasion-evidence'];

  T.register({
    id: 'battlefield-finds',
    step: 'post',
    number: '4.5',
    title: 'Battlefield finds',
    page: 120,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      if (p.type === 'invasion') return 'No finds after an Invasion battle.';
      if (!p.heldField) return 'You didn’t Hold the Field.';
      return true;
    },
    fields(ctx) {
      return [{ key: 'note', type: 'info', text: 'Search the battlefield: roll D100 on the Battlefield Finds Table.' + (pb(ctx).extraFinds ? ' Raiders: roll twice.' : '') }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      const steps = [{ table: 'Battlefield Finds Table', label: p.extraFinds ? 'First find' : undefined }];
      if (p.extraFinds) steps.push({ table: 'Battlefield Finds Table', label: 'Second find (Raiders)' });
      const run = F.start(steps, env(ctx));
      const found = run.lines.filter((l) => l.type === 'table').map((l) => l.rowId);
      const evidence = p.invasionThreat ? found.filter((id) => EVIDENCE.includes(id)).length : 0;
      const lines = [];
      if (evidence) lines.push(L.text('Invasion Evidence! Earn +1 credit, and +1 when checking for Invasion' + (evidence > 1 ? ' (twice)' : '') + '.', 'bad'));
      run.data = { evidence };
      return runOutput(found.length ? run.lines.map((l) => l.title).join(' + ') : 'Nothing', run, lines);
    },
    choose: chooseInRun,
    facts(input, output) {
      return { evidence: output.fu.data ? output.fu.data.evidence : 0 };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 6. Check for Invasion                                                  */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'invasion-check',
    step: 'post',
    number: '4.6',
    title: 'Check for Invasion!',
    page: 121,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      if (!p.invasionThreat) return 'The enemy wasn’t an Invasion Threat.';
      if (hasTrait(ctx, 'unity-safe-sector')) return 'Unity safe sector: this world can’t be Invaded.';
      if (ctx.facts.travelEvent === 'patrol-ship') return 'The Unity patrol ship means this world can’t be Invaded.';
      return true;
    },
    fields() {
      return [{ key: 'warRumors', type: 'yesno', label: 'Are there rumors of war on this world (Campaign Event, +2)?', value: false }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      const d = ctx.settings.difficulty;
      const roll = L.roll('2D6', {
        label: 'Is the world Invaded? (9+)',
        target: 9,
        invert: true,
        modifiers: [
          { label: 'Invasion Evidence', value: ctx.facts.evidence || 0 },
          { label: 'Held the Field', value: p.heldField ? -1 : 0 },
          { label: 'Hardcore', value: d === 'hardcore' ? 2 : 0 },
          { label: 'Insanity', value: d === 'insanity' ? 3 : 0 },
          { label: 'Invasion risk', value: hasTrait(ctx, 'invasion-risk') ? 1 : 0 },
          { label: 'Imminent invasion', value: hasTrait(ctx, 'imminent-invasion') ? 2 : 0 },
          { label: 'Military outpost', value: hasTrait(ctx, 'military-outpost') ? 2 : 0 },
          { label: 'Rumors of war', value: input.warRumors ? 2 : 0 }
        ],
        successText: 'The world is about to be Invaded! Next campaign turn you must try to Flee Invasion.',
        failText: 'No invasion this time.'
      });
      return { output: { headline: roll.success ? 'Invasion coming!' : 'No invasion', tone: roll.success ? 'bad' : 'good', lines: [roll], data: { invaded: roll.success } } };
    },
    remember(input, output) {
      return output.data.invaded ? { invadedNext: true } : {};
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 7. Gather the loot                                                     */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'loot',
    step: 'post',
    number: '4.7',
    title: 'Gather the loot',
    page: 121,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      return p.type === 'invasion' ? 'No Loot after an Invasion battle.' : true;
    },
    fields(ctx) {
      const p = pb(ctx);
      const extra = p.extraLoot && p.heldField;
      return [{
        key: 'rolls', type: 'number', label: 'Loot Table rolls', min: 0, max: 10,
        value: (ctx.facts.questDone ? 3 : 1) + (extra ? 1 : 0),
        help: 'One roll; three after a Quest finale' + (extra ? '; +1 for this enemy’s extra Loot' : '') + '. Add any bonus rolls (e.g. from Raided).'
      }];
    },
    resolve(input, ctx) {
      if (!input.rolls) return { output: { headline: 'No loot', lines: [L.text('No Loot rolls.')] } };
      const steps = [];
      for (let i = 1; i <= input.rolls; i++) steps.push({ table: 'Loot Table', label: input.rolls > 1 ? 'Loot ' + i : undefined });
      const run = F.start(steps, env(ctx));
      return runOutput(plural(input.rolls, 'Loot roll', 'Loot rolls'), run);
    },
    choose: chooseInRun
  });

  /* ---------------------------------------------------------------------- */
  /* 8. Injuries                                                            */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'injuries',
    step: 'post',
    number: '4.8',
    title: 'Determine injuries and recovery',
    page: 121,
    applies(ctx) {
      const p = pb(ctx);
      if (!p) return needs(ctx);
      return p.casualties + p.botCasualties > 0 ? true : 'No casualties.';
    },
    fields(ctx) {
      const p = pb(ctx);
      return [{ key: 'note', type: 'info', text: 'Rolling for ' + plural(p.casualties, 'casualty', 'casualties') + (p.botCasualties ? ' and ' + plural(p.botCasualties, 'Bot or Soulless casualty', 'Bot or Soulless casualties') : '') + '.' }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      const steps = [];
      for (let i = 1; i <= p.casualties; i++) steps.push({ group: 'Casualty ' + i, steps: [{ table: 'Injury Table' }] });
      for (let i = 1; i <= p.botCasualties; i++) steps.push({ group: 'Bot/Soulless casualty ' + i, steps: [{ table: 'Bot Injury Table' }] });
      steps.push({ text: 'A character with Luck who would die survives instead, but loses ALL Luck. Otherwise spent Luck comes back now. Medical school lets one casualty roll twice and keep the better.', tone: 'note' });
      const run = F.start(steps, env(ctx));
      return runOutput(plural(p.casualties + p.botCasualties, 'injury roll', 'injury rolls'), run);
    },
    choose: chooseInRun
  });

  /* ---------------------------------------------------------------------- */
  /* 9. Experience                                                          */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'experience',
    step: 'post',
    number: '4.9',
    title: 'Experience and character upgrades',
    page: 123,
    submitLabel: 'Done',
    applies: needs,
    fields() {
      return [{ key: 'note', type: 'info', text: 'Award XP to everyone who took part (Bots don’t earn XP).' }];
    },
    resolve(input, ctx) {
      const p = pb(ctx);
      const won = p.won;
      const items = [
        ['Became a casualty', '+1 XP'],
        ['Survived', won ? '+3 XP (Won)' : '+2 XP']
      ];
      if (p.firstBlood) items.push(['First to inflict a casualty', '+1 XP']);
      if (p.uniqueKilled) items.push(['Killed the Unique Individual', '+1 XP']);
      if (ctx.settings.difficulty === 'easy') items.push(['Easy mode', '+1 XP each']);
      if (ctx.facts.questDone) items.push(['Completed the Quest', '+1 XP each']);
      return {
        output: {
          headline: 'XP awarded',
          lines: [
            L.facts(items),
            L.text('Characters who fled in the first 2 rounds get no XP. Upgrade costs: Reactions 7, Combat Skill 7, Speed 5, Savvy 5, Toughness 6, Luck 10 (max 1, or 3 for Humans). Engineers can’t raise Toughness above 4.', 'note')
          ]
        }
      };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 10. Advanced training                                                  */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'advanced-training',
    step: 'post',
    number: '4.10',
    title: 'Invest in Advanced Training',
    page: 124,
    applies: needs,
    fields(ctx) {
      const fee = hasTrait(ctx, 'expensive-education') ? 3 : 1;
      return [{ key: 'apply', type: 'yesno', label: 'Send a crew member to apply (' + plural(fee, 'credit', 'credits') + ' fee)?', value: false, help: 'One attempt per campaign turn.' }];
    },
    resolve(input, ctx) {
      if (!input.apply) return { output: { headline: 'No application', lines: [L.text('Nobody applies this turn.')] } };
      const target = hasTrait(ctx, 'restricted-education') ? 6 : 4;
      const roll = L.roll('2D6', {
        label: 'Application (' + target + '+)',
        target: target,
        successText: 'Approved! Pay the course cost in XP, credits or both (Bots pay credits only).',
        failText: 'Rejected. You can try again on a later turn.'
      });
      return {
        output: {
          headline: roll.success ? 'Approved' : 'Rejected',
          tone: roll.success ? 'good' : 'bad',
          lines: [roll, L.facts(COURSES.map(([name, cost]) => [name, String(cost)]))]
        }
      };
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 11. Purchase items                                                     */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'purchase',
    step: 'post',
    number: '4.11',
    title: 'Purchase items',
    page: 125,
    applies(ctx) {
      if (!pb(ctx)) return needs(ctx);
      return fleeing(ctx) ? 'No purchases while fleeing an invasion.' : true;
    },
    fields() {
      return [
        { key: 'military', type: 'number', label: 'Military Weapon Table rolls (3 credits each)', min: 0, max: 10, value: 0 },
        { key: 'gear', type: 'number', label: 'Gear Table rolls (3 credits each)', min: 0, max: 10, value: 0 },
        { key: 'gadget', type: 'number', label: 'Gadget Table rolls (3 credits each)', min: 0, max: 10, value: 0 }
      ];
    },
    resolve(input, ctx) {
      const steps = [];
      const add = (n, table) => { for (let i = 0; i < n; i++) steps.push({ table }); };
      add(input.military, 'Military Weapon Table');
      add(input.gear, 'Gear Table');
      add(input.gadget, 'Gadget Table');
      const notes = [L.text('You can also buy any number of Handguns, Blades, Colony Rifles or Shotguns for 1 credit each, and sell up to 3 undamaged items for 1 credit each.', 'note')];
      if (!steps.length) return { output: { headline: 'No purchases', lines: notes } };
      const cost = 3 * steps.length;
      const run = F.start(steps, env(ctx));
      return runOutput(plural(steps.length, 'purchase', 'purchases') + ' (' + cost + ' credits)', run, notes);
    },
    choose: chooseInRun
  });

  /* ---------------------------------------------------------------------- */
  /* 12. Campaign event                                                     */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'campaign-event',
    step: 'post',
    number: '4.12',
    title: 'Roll for a Campaign Event',
    page: 125,
    applies(ctx) {
      if (!pb(ctx)) return needs(ctx);
      return fleeing(ctx) ? 'No Campaign Events while fleeing an invasion.' : true;
    },
    fields() {
      return [{ key: 'note', type: 'info', text: 'Roll D100 on the Campaign Events Table. If an event makes no sense, adjust or ignore it.' }];
    },
    resolve(input, ctx) {
      const run = F.start([{ table: 'Campaign Events Table' }], env(ctx));
      return runOutput(run.lines[0].title, run);
    },
    choose: chooseInRun,
    remember(input, output, ctx) {
      const g = output.fu.gains || {};
      const keep = {};
      if (g.rivals) keep.rivals = (ctx.memory.rivals || 0) + g.rivals;
      if (g.patrons) keep.patrons = (ctx.memory.patrons || 0) + g.patrons;
      if (g.rumors) keep.rumors = (ctx.memory.rumors || 0) + g.rumors;
      return keep;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 13. Character event                                                    */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'character-event',
    step: 'post',
    number: '4.13',
    title: 'Roll for a Character Event',
    page: 126,
    applies: needs,
    fields(ctx) {
      return [{
        key: 'eligible', type: 'number', label: 'Crew members who aren’t Bots or Soulless', min: 1, max: 30,
        value: ctx.memory.crewCount || ctx.settings.crewSize,
        help: 'Anyone else in the crew is eligible, even in Sick Bay.'
      }];
    },
    resolve(input, ctx) {
      const steps = [
        { randomCrew: true, label: 'The event happens to' },
        { table: 'Character Events Table' },
        { when: 'If the character is a Precursor, you may roll a second event and choose either', steps: [{ table: 'Character Events Table', label: 'Alternative' }] }
      ];
      const run = F.start(steps, env(ctx, { crewCount: input.eligible }));
      const first = run.lines.find((l) => l.type === 'table');
      return runOutput(first ? first.title : 'Character Event', run, [L.text('If an event is impossible, the character gets +1 XP instead.', 'note')]);
    },
    choose: chooseInRun,
    remember(input, output, ctx) {
      const g = output.fu.gains || {};
      const keep = {};
      if (g.rivals) keep.rivals = (ctx.memory.rivals || 0) + g.rivals;
      if (g.patrons) keep.patrons = (ctx.memory.patrons || 0) + g.patrons;
      if (g.rumors) keep.rumors = (ctx.memory.rumors || 0) + g.rumors;
      return keep;
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 14. Galactic War progress                                              */
  /* ---------------------------------------------------------------------- */

  T.register({
    id: 'galactic-war',
    step: 'post',
    number: '4.14',
    title: 'Check for Galactic War progress',
    page: 126,
    applies: needs,
    fields(ctx) {
      const leftBehind = ctx.facts.fled || ctx.facts.fleeFailed ? 1 : 0;
      return [{
        key: 'planets', type: 'number', label: 'Invaded planets you are tracking', min: 0, max: 20,
        value: (ctx.memory.invadedPlanets || 0) + leftBehind,
        help: leftBehind ? 'Includes the world you fled this turn.' : 'Planets you left while they were being Invaded.'
      }];
    },
    resolve(input) {
      if (!input.planets) return { output: { headline: 'No invaded planets', lines: [L.text('Nothing to track.')], data: { planets: 0 } } };
      const steps = [];
      for (let i = 1; i <= input.planets; i++) steps.push({ group: 'Planet ' + i, steps: [{ table: 'Galactic War Progress Table' }] });
      steps.push({ text: 'Add +1 for each earlier Making Ground result on that planet; +2 if it has a Military outpost; −1 if its invasion was Imminent.', tone: 'note' });
      const run = F.start(steps, {});
      return runOutput(plural(input.planets, 'planet', 'planets') + ' checked', run);
    },
    choose: chooseInRun,
    remember(input) {
      return { invadedPlanets: input.planets || 0 };
    }
  });
})(window.LP);
