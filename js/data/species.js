(function (LP) {
  'use strict';

  /*
   * Crew species, written by hand from the rulebook (pp.15-23).
   *
   * Fields (all optional except id/name/group/profile):
   *   group            'human' | 'bot' | 'primary-alien' | 'strange'
   *   sourceTable/Row  the subtable row this species comes from (for odds)
   *   human            may hold more than 1 Luck (only Humans can, p.12)
   *   bot              Bot rules: no Luck from being Leader, no XP
   *   profile          starting abilities: reactions, speed ("), combat, toughness, savvy, luck
   *   rules            short summaries shown with the character
   *   noOrigins        does not roll Background / Motivation / Class
   *   forced           { background|motivation: rowId } fixed results
   *   extraMotivation  a motivation the character also always has (rowId)
   *   double           { background|motivation: true } roll twice, apply both
   *   classMap         { rolledClassId: effectiveClassId }
   *   ignoreStoryPoints        bonus story points from origins are ignored
   *   ignoreBackgroundCredits  credits from the Background roll are ignored
   *   creditPenalty / storyPointPenalty  reduce origin bonuses by N (not below 0)
   *   minorAbility     roll on the Minor Alien Ability Table
   *   bonus            { luck, storyPoints, questRumors, rivals } added at creation
   *   caps             per-ability maximums overriding the defaults
   *   fixedSavvy       Savvy can never be improved
   *   noLuck           can never have Luck
   */

  const HUMAN_PROFILE = { reactions: 1, speed: 4, combat: 0, toughness: 3, savvy: 0, luck: 0 };
  const BOT_PROFILE = { reactions: 2, speed: 4, combat: 1, toughness: 4, savvy: 2, luck: 0 };

  function profile(overrides) {
    return Object.assign({}, HUMAN_PROFILE, overrides);
  }

  const SPECIES = [
    /* ---------------------------------------------------------------- */
    {
      id: 'baseline-human',
      name: 'Baseline Human',
      group: 'human',
      sourceTable: 'Crew Type Table',
      sourceRow: 'baseline-human',
      human: true,
      profile: profile(),
      rules: ['The only species that can have more than 1 Luck.']
    },
    {
      id: 'bot',
      name: 'Bot',
      group: 'bot',
      sourceTable: 'Crew Type Table',
      sourceRow: 'bot',
      bot: true,
      noOrigins: true,
      profile: Object.assign({}, BOT_PROFILE),
      rules: [
        '6+ Armor Saving Throw.',
        'Does not earn XP; upgraded with credits instead.',
        'Cannot use implants or consumables in battle.',
        'Uses the Bot Injury Table. Never the subject of a Character Event.'
      ]
    },

    /* ---------------------------------------------------------------- */
    /* Primary Aliens (pp.16-18)                                         */
    {
      id: 'engineer',
      name: 'Engineer',
      group: 'primary-alien',
      sourceTable: 'Primary Alien Table',
      sourceRow: 'engineer',
      profile: profile({ toughness: 2, savvy: 1 }),
      caps: { toughness: 4 },
      rules: [
        '+1 when rolling to repair a damaged item.',
        'Toughness can never exceed 4, even with equipment.'
      ]
    },
    {
      id: 'kerin',
      name: 'K’Erin',
      group: 'primary-alien',
      sourceTable: 'Primary Alien Table',
      sourceRow: 'kerin',
      profile: profile({ toughness: 4 }),
      rules: [
        'Rolls twice when Brawling and picks the better die.',
        'Must move to Brawl an enemy within base movement at the start of its round.'
      ]
    },
    {
      id: 'soulless',
      name: 'Soulless',
      group: 'primary-alien',
      sourceTable: 'Primary Alien Table',
      sourceRow: 'soulless',
      profile: profile({ toughness: 4, savvy: 1 }),
      rules: [
        '6+ Armor Saving Throw.',
        'Cannot use consumables or receive implants. Uses the Bot Injury Table.',
        'Earns XP normally. May install Bot Upgrades at 1.5× cost (rounded up).'
      ]
    },
    {
      id: 'precursor',
      name: 'Precursor',
      group: 'primary-alien',
      sourceTable: 'Primary Alien Table',
      sourceRow: 'precursor',
      profile: profile({ speed: 5, toughness: 2 }),
      rules: [
        'Character Events: roll 2 and pick one, or spend 1 story point to avoid both.'
      ]
    },
    {
      id: 'feral',
      name: 'Feral',
      group: 'primary-alien',
      sourceTable: 'Primary Alien Table',
      sourceRow: 'feral',
      profile: profile(),
      rules: [
        'In battle, enemy-imposed penalties to Seize the Initiative are ignored.',
        'If the Reaction Roll has a single 1, it must go to a Feral if possible.'
      ]
    },
    {
      id: 'swift',
      name: 'Swift',
      group: 'primary-alien',
      sourceTable: 'Primary Alien Table',
      sourceRow: 'swift',
      profile: profile({ speed: 5 }),
      rules: [
        'Can glide down with a Move action; leaps gaps up to 4"; jumps from any height safely.',
        'Must fire every shot of a multi-shot weapon at the same target.'
      ]
    },

    /* ---------------------------------------------------------------- */
    /* Strange Characters (pp.19-23)                                     */
    {
      id: 'de-converted',
      name: 'De-converted',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'de-converted',
      human: true,
      profile: profile(),
      forced: { motivation: 'revenge' },
      fixedSavvy: true,
      rules: [
        '6+ Armor Saving Throw.',
        'Can be fitted with up to 3 implants.',
        'Savvy can never be improved.'
      ]
    },
    {
      id: 'unity-agent',
      name: 'Unity Agent',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'unity-agent',
      human: true,
      profile: profile({ reactions: 2 }),
      forced: { motivation: 'order' },
      rules: [
        'Call in a Favor: each campaign turn, may roll 2D6. 10-12: remove a Rival, gain a Quest Rumor, or gain a Patron. 2-4: must travel to the next planet immediately, or lose this trait permanently.'
      ]
    },
    {
      id: 'mysterious-past',
      name: 'Mysterious Past',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'mysterious-past',
      human: true,
      profile: profile(),
      double: { background: true },
      ignoreStoryPoints: true,
      rules: ['Rolls twice on the Background Table. Bonus story points from origin rolls are ignored.']
    },
    {
      id: 'hakshan',
      name: 'Hakshan',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'hakshan',
      profile: profile(),
      extraMotivation: 'truth',
      rules: ['Always has the Truth motivation, in addition to the rolled one.']
    },
    {
      id: 'stalker',
      name: 'Stalker',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'stalker',
      human: true,
      profile: profile(),
      rules: [
        'Alternative Movement: teleport 1D6" and act normally.',
        'Can be improved twice with XP (4 XP each, +1" each).'
      ]
    },
    {
      id: 'hulker',
      name: 'Hulker',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'hulker',
      human: true,
      profile: profile({ combat: 1, toughness: 5 }),
      classMap: { technician: 'primitive', scientist: 'primitive', hacker: 'primitive' },
      rules: [
        'When shooting, Combat Skill is always +0 with no bonuses from weapons, sights or mods.',
        'Ignores the Clumsy and Heavy weapon traits.',
        'Technician, Scientist or Hacker class results count as Primitive.'
      ]
    },
    {
      id: 'hopeful-rookie',
      name: 'Hopeful Rookie',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'hopeful-rookie',
      human: true,
      profile: profile(),
      bonus: { luck: 1 },
      rules: [
        'Begins with 1 Luck. Gains 1 bonus XP each game they are not a casualty.',
        'The first time they become a casualty without Luck to save them, they lose all Luck permanently and the bonus XP.'
      ]
    },
    {
      id: 'genetic-uplift',
      name: 'Genetic Uplift',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'genetic-uplift',
      human: true,
      profile: profile({ reactions: 2, speed: 5, combat: 1, toughness: 4, savvy: 1 }),
      ignoreBackgroundCredits: true,
      bonus: { rivals: 1 },
      rules: ['Background credits are ignored. The crew gains 1 additional Rival.']
    },
    {
      id: 'mutant',
      name: 'Mutant',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'mutant',
      human: true,
      profile: profile(),
      forced: { background: 'lower-megacity-class' },
      rules: ['Cannot be sent on Recruit or Find a Patron tasks.']
    },
    {
      id: 'assault-bot',
      name: 'Assault Bot',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'assault-bot',
      bot: true,
      noOrigins: true,
      profile: Object.assign({}, BOT_PROFILE, { savvy: 0 }),
      fixedSavvy: true,
      rules: [
        'As a Bot, but Savvy is +0 and cannot be upgraded.',
        '5+ Armor Saving Throw.',
        'Ignores the Clumsy and Heavy weapon traits.'
      ]
    },
    {
      id: 'manipulator',
      name: 'Manipulator',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'manipulator',
      profile: profile({ reactions: 2, savvy: 1 }),
      forced: { background: 'bureaucrat' },
      rules: [
        'Cannot enter a Brawl voluntarily. May fire 2 Pistols in the same round at separate targets.',
        'Whenever the crew earns story points, roll 1D6 per Manipulator: each 6 grants a bonus story point.'
      ]
    },
    {
      id: 'primitive',
      name: 'Primitive',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'primitive',
      human: true,
      profile: profile(),
      forced: { background: 'primitive-or-regressed-world' },
      rules: [
        'Cannot benefit from gun sights or fire beyond 8".',
        'All Melee weapons count as Elegant.'
      ]
    },
    {
      id: 'feeler',
      name: 'Feeler',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'feeler',
      human: true,
      profile: profile(),
      double: { motivation: true },
      rules: [
        'Rolls twice on the Motivation Table and gets both.',
        'If they ever fight another crew member, they break down and leave the crew for good.'
      ]
    },
    {
      id: 'emo-suppressed',
      name: 'Emo-suppressed',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'emo-suppressed',
      human: true,
      profile: profile(),
      forced: { motivation: 'survival' },
      noLuck: true,
      rules: [
        'Never leaves the crew voluntarily; may ignore events forcing a fight with a local or crew member.',
        'Can never have Luck.'
      ]
    },
    {
      id: 'minor-alien',
      name: 'Minor Alien',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'minor-alien',
      profile: profile(),
      creditPenalty: 1,
      storyPointPenalty: 1,
      minorAbility: true,
      rules: [
        'Origin credits and story points are each reduced by 1.',
        'Increasing the ability rolled on the Minor Alien Ability Table costs 1 less XP.'
      ]
    },
    {
      id: 'traveler',
      name: 'Traveler',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'traveler',
      human: true,
      profile: profile({ reactions: 3, toughness: 4, savvy: 2 }),
      forced: { motivation: 'truth' },
      bonus: { storyPoints: 2, questRumors: 2 },
      rules: [
        'Begins with +2 story points and 2 Quest Rumors.',
        'Speed +2" when moving directly away from a visible enemy.',
        'After every battle roll 2D6: on 2 they vanish (claim 2 story points); on 11-12 the crew gains a Quest.'
      ]
    },
    {
      id: 'empath',
      name: 'Empath',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'empath',
      human: true,
      profile: profile(),
      rules: [
        '+1 to Recruit and Find a Patron rolls.',
        'Loses this ability if given implants.'
      ]
    },
    {
      id: 'bio-upgrade',
      name: 'Bio-upgrade',
      group: 'strange',
      sourceTable: 'Strange Character Table',
      sourceRow: 'bio-upgrade',
      human: true,
      profile: profile(),
      creditPenalty: 2,
      rules: [
        'May have up to 4 implants, and can benefit from 2 of the same implant.',
        'Origin credits are reduced by 2.'
      ]
    }
  ];

  const GROUPS = [
    { id: 'human', label: 'Human' },
    { id: 'bot', label: 'Bot' },
    { id: 'primary-alien', label: 'Primary Aliens' },
    { id: 'strange', label: 'Strange Characters' }
  ];

  const byId = {};
  for (const s of SPECIES) byId[s.id] = s;

  LP.data = LP.data || {};
  LP.data.species = { list: SPECIES, byId, GROUPS };
})(window.LP);
