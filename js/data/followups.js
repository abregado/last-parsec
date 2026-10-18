(function (LP) {
  'use strict';

  /*
   * Follow-up scripts: the dice each table result calls for, written by hand
   * from the rulebook. See js/core/followup.js for the step language.
   * The row's own rule text is always shown above these, so steps only add
   * rolls and short outcome notes.
   */

  const DAMAGED = 'Damaged: needs Repair before it can be used.';

  /* Escape pod's rescue roll, reused by Distress call (3-4). p.71 */
  const ESCAPE_POD_ROLL = {
    roll: '1D6',
    label: 'Who is in the pod?',
    outcomes: [
      {
        range: '1',
        text: 'A wanted criminal.',
        then: [{
          choice: {
            prompt: 'Let them go at the next world, or turn them in?',
            options: [
              { value: 'let-go', label: 'Let them go', then: [{ text: 'They may return the favor: the next time you gain a Rival, roll 1D6. On 4+ that Rival is removed.' }] },
              {
                value: 'turn-in', label: 'Turn them in',
                then: [{ roll: '1D6', label: 'Reward (credits)', text: 'You also gain a Rival from their old gang.', gain: { rivals: 1 } }]
              }
            ]
          }
        }]
      },
      {
        range: '2-3',
        text: 'They pay you when you reach the nearest world:',
        then: [
          { roll: '1D3', label: 'Credits' },
          { table: 'Loot Table', label: 'Loot' }
        ]
      },
      { range: '4', text: 'No money, but interesting information: +1 Quest Rumor and +1 story point.', gain: { rumors: 1, storyPoints: 1 } },
      { range: '5', text: 'They want to join: roll up a new character with no equipment, or they leave at the next world.' },
      { range: '6', text: 'They want to join: roll up a new character with no equipment and 10 unspent XP, or they leave at the next world.' }
    ]
  };

  const THROUGH_ASTEROIDS = [
    { text: 'One crew member pilots: three rolls of 1D6 + Savvy, each needing 4+.' },
    {
      roll: '1D6', label: 'Piloting', times: 3, savvy: true, target: 4,
      ifFail: [{ roll: '1D6', label: 'Hull damage' }]
    }
  ];

  const followups = {
    /* ------------------------------------------------------------------ */
    /* Starship Travel Events (pp.70-72)                                   */
    'Starship Travel Events Table': {
      'asteroids': [{
        choice: {
          prompt: 'Try to avoid the asteroid field, or go straight through?',
          options: [
            {
              value: 'avoid', label: 'Try to avoid it',
              then: [{
                roll: '1D6', label: 'Chart a safe path', target: 5,
                outcomes: [
                  { min: 5, text: 'Safe path found.', then: [{ rollAgain: true, label: 'New travel event' }] },
                  { max: 4, text: 'No way around: you have to go through.', then: THROUGH_ASTEROIDS }
                ]
              }]
            },
            { value: 'through', label: 'Go through', then: THROUGH_ASTEROIDS }
          ]
        }
      }],
      'navigation-trouble': [
        { text: 'Lose 1 story point.', gain: { storyPoints: -1 } },
        { when: 'If your ship has Hull damage', steps: [{ randomCrew: true, label: 'Injured' }, { table: 'Injury Table', label: 'Injury' }] },
        { rollAgain: true, label: 'New travel event' }
      ],
      'raided': [
        { roll: '1D6', label: 'Intimidate (1D6 + Savvy, needs 6+)', savvy: true, target: 6 },
        {
          when: 'If intimidation fails: fight in cramped territory, no objective',
          steps: [
            { table: 'Criminal Elements', label: 'Pirates', showText: false },
            { enemyNumbers: true, plus: 1 },
            { text: 'Win: normal Opportunity mission rewards (p.120) plus a bonus Loot Table roll. Lose: lose all credits and your whole Stash (you keep the ship). This battle doesn’t count as this turn’s main battle.' }
          ]
        }
      ],
      'deep-space-wreckage': [
        { table: 'Gear Subtable', label: 'Salvage', times: 2, note: DAMAGED }
      ],
      'drive-trouble': [
        { text: 'Three crew members each roll 1D6 + Savvy, needing 6+.' },
        {
          roll: '1D6', label: 'Drive repair', times: 3, savvy: true, target: 6,
          ifFail: [{ text: 'Grounded one more campaign turn on the next world while the drive resets. Taking off early: 2D6 Hull damage.' }]
        }
      ],
      'down-time': [
        { text: 'Pick a crew member: +1 XP. Repair 1 damaged item with no roll.' }
      ],
      'distress-call': [{
        choice: {
          prompt: 'Go to their aid?',
          options: [
            {
              value: 'aid', label: 'Answer the call',
              then: [{
                roll: '1D6', label: 'What you find',
                outcomes: [
                  { range: '1', text: 'The drive detonates as you approach.', tone: 'bad', then: [{ roll: '1D6+1', label: 'Hull damage' }] },
                  { range: '2', text: 'Only drifting wreckage.' },
                  { range: '3-4', text: 'You rescue a crew member (as the Escape pod event).', then: [ESCAPE_POD_ROLL] },
                  {
                    range: '5-6', text: 'Help save the ship: one crew member rolls 1D6 + Savvy, needing 7+, with up to three attempts.',
                    then: [
                      { roll: '1D6', label: 'Attempt', times: 3, savvy: true, target: 7 },
                      { when: 'If any attempt succeeds: the grateful crew give you three Gear loot rolls', steps: [{ table: 'Gear Subtable', label: 'Reward', times: 3 }] },
                      { when: 'If all three fail: the drive detonates', steps: [{ roll: '1D6+1', label: 'Hull damage' }] }
                    ]
                  }
                ]
              }]
            },
            { value: 'ignore', label: 'Keep going', then: [{ text: 'You fly on.' }] }
          ]
        }
      }],
      'patrol-ship': [
        {
          roll: '1D6-3', label: 'Confiscated', times: 2,
          outcomes: [
            { max: 0, text: 'Nothing taken.' },
            { min: 1, text: 'That many items are confiscated as contraband (your choice, carried or Stashed).', tone: 'bad' }
          ]
        },
        { text: 'The next world you visit can’t be Invaded.', tone: 'good' }
      ],
      'cosmic-phenomenon': [
        { randomCrew: true, label: 'Sees it' },
        { text: 'They gain +1 Luck if they can. This only happens once per campaign: if it has happened before, nothing happens.' },
        { when: 'If you have a Precursor in the crew', steps: [{ text: 'A good omen: +1 story point.' }] }
      ],
      'escape-pod': [{
        choice: {
          prompt: 'Rescue whoever is in the pod?',
          options: [
            { value: 'rescue', label: 'Rescue them', then: [ESCAPE_POD_ROLL] },
            { value: 'leave', label: 'Leave it', then: [{ text: 'You leave the pod drifting.' }] }
          ]
        }
      }],
      'accident': [
        { randomCrew: true, label: 'Injured' },
        { text: 'They rest for one campaign turn, and one item they carry is damaged.' }
      ],
      'time-to-reflect': [
        { gain: { storyPoints: 1 } }
      ],
      'time-to-read-a-book': [{
        roll: '1D6', label: 'Who reads',
        outcomes: [
          { range: '1-2', text: 'One crew member earns +3 XP.', then: [{ randomCrew: true, label: '+3 XP' }] },
          { range: '3-4', text: 'One earns +2 XP and another +1 XP.', then: [{ randomCrew: true, count: 2, label: 'First +2 XP, second +1 XP' }] },
          { range: '5-6', text: 'Three crew members each earn +1 XP.', then: [{ randomCrew: true, count: 3, label: '+1 XP each' }] }
        ]
      }],
      'locked-in-the-library-data-by-night': [1, 2, 3].map((n) => ({
        group: 'World ' + n,
        steps: [
          {
            roll: '1D6', label: 'Licensing',
            outcomes: [
              { max: 4, text: 'No License needed.' },
              { min: 5, text: 'Freelancer License required:', then: [{ roll: '1D6', label: 'License cost (credits)' }] }
            ]
          },
          { table: 'World Traits Table', label: 'Trait' }
        ]
      })).concat([{ text: 'Pick one of the three to visit. All three stay in the campaign and can be visited later.' }])
    },

    /* ------------------------------------------------------------------ */
    /* Trade Table (pp.79-80)                                              */
    'Trade Table': {
      'a-personal-weapon': [{ table: 'Low-tech Weapon Table' }],
      'find-something-useful': [{ table: 'Gear Table' }],
      'worthless-trinket': [{ roll: '1D6', label: 'Worth anything?', outcomes: [{ max: 5, text: 'Just junk.' }, { min: 6, text: '+1 story point.', tone: 'good', gain: { storyPoints: 1 } }] }],
      'luxury-trinket': [
        { text: 'A Swift who finds this keeps it instead (+2 XP).', tone: 'note' },
        {
          choice: {
            prompt: 'Keep it as a Recruiting gift (+2), or sell it?',
            options: [
              { value: 'keep', label: 'Keep as a gift', then: [{ text: 'Use it for +2 on a Recruit roll. Single-use.' }] },
              { value: 'sell', label: 'Sell it', then: [{ text: 'Roll twice on the Trade Table and keep the result you prefer.' }, { rollAgain: true, label: 'Option A' }, { rollAgain: true, label: 'Option B' }] }
            ]
          }
        }
      ],
      'contraband': [{
        choice: {
          prompt: 'Accept the contraband?',
          options: [
            {
              value: 'accept', label: 'Accept',
              then: [{
                roll: '1D6', label: 'Credits from selling it',
                outcomes: [
                  { max: 3, text: 'No trouble.', tone: 'good' },
                  { min: 4, text: 'You also gain a Rival.', tone: 'bad', gain: { rivals: 1 } }
                ]
              }]
            },
            { value: 'decline', label: 'Turn it down', then: [{ text: 'You pass on it.' }] }
          ]
        }
      }],
      'useless-trinket': [{ roll: '1D6', label: 'Worth anything?', outcomes: [{ max: 5, text: 'Just junk.' }, { min: 6, text: '+1 story point.', tone: 'good', gain: { storyPoints: 1 } }] }],
      'something-interesting': [{ table: 'Loot Table' }],
      'fuel': [{ roll: '1D6', label: 'Fuel (credits)', text: 'Use it to offset travel costs.' }],
      'tourist-garbage': [{ roll: '1D6', label: 'Worth anything?', outcomes: [{ max: 4, text: 'Nothing.' }, { min: 5, text: '+1 story point.', tone: 'good', gain: { storyPoints: 1 } }] }],
      'dont-usually-see-these-for-sale': [{
        choice: {
          prompt: 'Pay 3 credits for a Loot Table roll?',
          options: [
            { value: 'pay', label: 'Pay 3 credits', then: [{ table: 'Loot Table', note: 'The crew member who went trading must use it.' }] },
            { value: 'pass', label: 'No thanks', then: [{ text: 'You pass.' }] }
          ]
        }
      }],
      'odd-device': [{
        choice: {
          prompt: 'Pay 1 credit for the odd device?',
          options: [
            {
              value: 'pay', label: 'Pay 1 credit',
              then: [{ roll: '1D6', label: 'Is it any good?', outcomes: [{ max: 5, text: 'Complete garbage.', tone: 'bad' }, { min: 6, text: 'It works:', tone: 'good', then: [{ table: 'Loot Table' }] }] }]
            },
            { value: 'pass', label: 'No thanks', then: [{ text: 'You pass.' }] }
          ]
        }
      }],
      'hot-tip': [{ gain: { rumors: 1 } }],
      'a-lot-of-blinking-lights': [{ table: 'Gear Subtable' }],
      'gently-used': [{ table: 'Gear Subtable', note: DAMAGED }],
      'pre-owned': [{ table: 'Loot Table', note: DAMAGED }],
      'starship-repair-parts': [{ roll: '1D6', label: 'Worth (credits of Hull repair)', text: 'Single-use.' }]
    },

    /* ------------------------------------------------------------------ */
    /* Exploration Table (pp.80-82)                                        */
    'Exploration Table': {
      'i-know-a-good-deal-when-i-see-one': [{ table: 'Trade Table', label: 'Trade instead' }],
      'meet-a-patron': [{ gain: { patronOffers: 1 } }],
      'meet-someone-interesting': [
        { gain: { rumors: 1 } },
        { when: 'If the character is a Precursor', steps: [{ roll: '1D6', label: 'Second Rumor', target: 5, successText: 'Gain a second Rumor.', failText: 'No second Rumor.' }] }
      ],
      'had-a-nice-chat': [{ roll: '1D6', label: 'Chat (1D6 + Savvy, needs 5+)', savvy: true, target: 5, text: 'On a success: +1 story point.' }],
      'possible-bargain': [{
        choice: {
          prompt: 'Give up a weapon of your choice for a chance at a bargain?',
          options: [
            {
              value: 'trade', label: 'Give up a weapon',
              then: [{ roll: '1D6', label: 'Bargain', outcomes: [{ max: 5, text: 'You get 1 credit.' }, { min: 6, text: 'A real bargain:', tone: 'good', then: [{ table: 'Loot Table' }] }] }]
            },
            { value: 'pass', label: 'Keep it', then: [{ text: 'You keep your weapon.' }] }
          ]
        }
      }],
      'alien-merchant': [{
        choice: {
          prompt: 'Give the merchant any item for a Loot Table roll?',
          options: [
            { value: 'trade', label: 'Trade an item', then: [{ table: 'Loot Table' }] },
            { value: 'pass', label: 'No deal', then: [{ text: 'You walk away.' }] }
          ]
        }
      }],
      'got-yourself-noticed': [{ randomRival: true }, { text: 'If you have Rivals, you must fight that one this campaign turn.' }],
      'completely-lost': [
        { roll: '1D6', label: 'Find the way back (1D6 + Savvy, needs 4+)', savvy: true, target: 4, ifFail: [{ text: 'They miss this campaign turn’s battle.' }] },
        { rollAgain: true, label: 'What they find while wandering' }
      ],
      'a-tech-fanatic-offers-to-help-out': [
        { roll: '1D6', label: 'Fix a damaged item', target: 5, successText: 'Fixed for free.', failText: 'Not fixed.' },
        { when: 'If the character is an Engineer', steps: [{ text: 'They talk shop instead: +2 XP (no repair).' }] }
      ],
      'overheard-some-talk': [{ gain: { rumors: 1 } }],
      'pick-a-fight': [{ gain: { rivals: 1 } }],
      'just-needs-a-little-love': [{ table: 'Gadget Table', note: 'Damaged: needs Repair, unless the character is an Engineer, who gets it working right away.' }],
      'get-in-a-bad-fight': [{ roll: '1D3', label: 'Campaign turns in Sick Bay', text: 'They also lose one carried item (your choice).' }]
    },

    /* ------------------------------------------------------------------ */
    /* Loot (pp.131-134)                                                    */
    'Loot Table': {
      'weapon': [{ table: 'Weapon Category Subtable' }],
      'damaged-weapons': [{ table: 'Weapon Category Subtable', times: 2, note: DAMAGED }],
      'damaged-gear': [{ table: 'Gear Subtable', times: 2, note: DAMAGED }],
      'gear': [{ table: 'Gear Subtable' }],
      'odds-and-ends': [{ table: 'Odd and Ends Table' }],
      'rewards': [{ table: 'Rewards Table' }]
    },
    'Weapon Category Subtable': {
      'slug-weapons': [{ table: 'Slug Weapons Subtable' }],
      'energy-weapons': [{ table: 'Energy Weapons Subtable' }],
      'special-weapons': [{ table: 'Special Weapons Subtable' }],
      'melee-weapons': [{ table: 'Melee Weapons Subtable' }],
      'grenades': [{ table: 'Grenades Subtable' }]
    },
    'Gear Subtable': {
      'gun-mods': [{ table: 'Gun Mods Subtable' }],
      'gun-sights': [{ table: 'Gun Sights Subtable' }],
      'protective-items': [{ table: 'Protective Items Subtable' }],
      'utility-items': [{ table: 'Utility Items Subtable' }]
    },
    'Odd and Ends Table': {
      'consumables-2-uses': [{ table: 'Consumables Subtable' }],
      'implants': [{ table: 'Implants Subtable' }],
      'ship-items': [{ table: 'Ship Items Subtable' }]
    },
    'Rewards Table': {
      'documents': [{ gain: { rumors: 1 } }],
      'data-files': [{ gain: { rumors: 2 } }],
      'cargo-crate': [{ roll: '1D6', label: 'Credits' }],
      'valuable-materials': [{ roll: '1D6+2', label: 'Credits' }],
      'rare-substance': [{ roll: '2D6', keep: 'highest', label: 'Credits (highest die)' }],
      'ship-parts': [{ roll: '1D6', label: 'Discount (credits)' }],
      'military-ship-part': [{ roll: '1D6+2', label: 'Discount (credits)' }],
      'mysterious-items': [{ gain: { storyPoints: 2 } }],
      'personal-item': [{ gain: { storyPoints: 3 } }]
    }
  };

  /* ------------------------------------------------------------------ */
  /* Recruits: the random method's two-step species roll (p.14)          */
  followups['Crew Type Table'] = {
    'primary-alien': [{ table: 'Primary Alien Table' }],
    'strange-character': [{ table: 'Strange Character Table' }]
  };

  /* ------------------------------------------------------------------ */
  /* Patron jobs (pp.83-84)                                              */
  /*
   * Each Patron type gets its own script: Danger Pay (+1 Corporation),
   * Time Frame (+1 Secretive Group), then a D10 per BHC category against
   * that type's target number from the BHC table.
   */
  const BHC = LP.data.tables['Benefits, Hazards, and Conditions (BHC) Table'];
  const BHC_COLUMN = {
    'corporation': 'corporation',
    'local-government': 'local_government',
    'sector-government': 'sector_government',
    'wealthy-individual': 'wealthy_individual',
    'private-organization': 'private_organisation',
    'secretive-group': 'secretive_group'
  };
  const BHC_SUBTABLES = { benefits: 'Benefits Subtable', hazards: 'Hazards Subtable', conditions: 'Conditions Subtable' };

  function jobScript(patronId) {
    const column = BHC_COLUMN[patronId];
    const steps = [
      { table: 'Danger Pay Table', label: 'Danger Pay', modifier: patronId === 'corporation' ? 1 : 0 },
      { table: 'Time Frame Table', label: 'Time frame', modifier: patronId === 'secretive-group' ? 1 : 0 }
    ];
    for (const row of BHC.rows) {
      const target = parseInt(row[column], 10);
      steps.push({
        roll: '1D10',
        label: row.category + ' (' + target + '+)',
        target: target,
        invert: row.id !== 'benefits',
        outcomes: [
          { min: target, text: row.id === 'benefits' ? 'The Patron offers a Benefit:' : (row.id === 'hazards' ? 'The job carries a Hazard:' : 'There are Conditions:'), then: [{ table: BHC_SUBTABLES[row.id] }] },
          { max: target - 1, text: 'None.' }
        ]
      });
    }
    return steps;
  }

  followups['Patron Table'] = {};
  for (const id of Object.keys(BHC_COLUMN)) followups['Patron Table'][id] = jobScript(id);

  followups['Benefits Subtable'] = {
    'fringe-benefit': [{ table: 'Loot Table', conditional: true, note: 'Only paid out if the mission succeeds.' }],
    'connections': [{ gain: { rumors: 1 } }],
    'company-store': [{ table: 'Trade Table', note: 'Only paid out if the mission succeeds.' }],
    'negotiable': [{ table: 'Danger Pay Table', label: 'Second Danger Pay roll (keep the better)', note: 'Corporation jobs add +1 to this roll too.' }]
  };

  /* ------------------------------------------------------------------ */
  /* Post-Battle (pp.120-128)                                            */

  followups['Battlefield Finds Table'] = {
    'usable-goods': [{ table: 'Consumables Subtable', note: 'You get 1 dose.' }],
    'curious-data-stick-invasion-evidence': [{ text: 'Against an Invasion Threat this is Invasion Evidence instead (handled in Check for Invasion).', tone: 'note' }],
    'vital-info-invasion-evidence': [{ text: 'Against an Invasion Threat this is Invasion Evidence instead (handled in Check for Invasion).', tone: 'note' }],
    'debris': [{ roll: '1D3', label: 'Credits' }]
  };

  followups['Injury Table'] = {
    'crippling-wound': [
      { roll: '1D6', label: 'Campaign turns in Sick Bay' },
      { roll: '1D6', label: 'Surgery cost (credits)', text: 'Pay now, or lose 1 from the higher of Speed and Toughness for good.' }
    ],
    'serious-injury': [{ roll: '1D3+1', label: 'Campaign turns in Sick Bay' }],
    'minor-injuries': [{ text: '1 campaign turn in Sick Bay.' }],
    'school-of-hard-knocks': [{ text: '+1 XP.' }]
  };

  followups['Bot Injury Table'] = {
    'severe-damage': [{ roll: '1D6', label: 'Campaign turns of repair' }],
    'minor-damage': [{ text: '1 campaign turn of repair.' }]
  };

  followups['Campaign Events Table'] = {
    'the-life-support-system-on-the-ship-needs-upgrading-badly': [{ roll: '1D6', label: 'Upgrade cost (credits)', text: 'Subtract 1 if you have an Engineer. The ship can’t fly until it’s paid.' }],
    'youve-made-friends-among-the-locals': [{ gain: { storyPoints: 1 } }],
    'you-managed-to-mouth-off-to-the-wrong-people': [{ gain: { rivals: 1 } }],
    'a-shady-character-offers-you-a-deal': [{
      choice: {
        prompt: 'Give him an item for a Trade Table roll?',
        options: [
          { value: 'deal', label: 'Make the deal', then: [{ table: 'Trade Table' }] },
          { value: 'pass', label: 'No deal', then: [{ text: 'You pass.' }] }
        ]
      }
    }],
    'you-sell-off-some-cargo-you-acquired-on-the-last-planet': [{ roll: '1D6', label: 'Credits' }],
    'one-of-the-crew-overheard-something-interesting': [{ gain: { rumors: 1 } }],
    'an-alien-merchant-offers-you-some-strange-device': [{
      choice: {
        prompt: 'Pay 4 credits for a Loot Table roll?',
        options: [
          { value: 'buy', label: 'Pay 4 credits', then: [{ table: 'Loot Table' }] },
          { value: 'pass', label: 'No thanks', then: [{ text: 'You pass.' }] }
        ]
      }
    }],
    'the-tax-man-is-taking-an-interest-in-your-business-conduct': [{ roll: '2D6', keep: 'highest', label: 'Tax (credits, the higher die)' }],
    'the-crew-has-decided-its-time-for-a-new-person-to-be-in-charge': [{
      roll: '1D6', label: 'Does the old captain stay?',
      outcomes: [{ max: 1, text: 'The old captain leaves for good, taking what they carry.', tone: 'bad' }, { min: 2, text: 'The old captain stays.' }]
    }],
    'youve-made-some-business-contacts': [{ gain: { patrons: 1 } }],
    'during-routine-maintenance-the-gravitational-adjuster-got-knocked-out-of-alignment': [{ roll: '1D6', label: 'Hull damage' }],
    'the-crew-spends-a-night-drinking-watching-movies-and-playing-cards': [{ gain: { storyPoints: 1 } }],
    'you-renegotiate-some-old-debts': [{ roll: '1D6+1', label: 'Debt reduction (credits)', text: 'If you owe nothing, earn 2 credits instead.' }],
    'a-bit-of-time-on-your-hands': [
      { randomCrew: true, count: 2, label: 'Exploring' },
      { table: 'Exploration Table', label: 'First explorer' },
      { table: 'Exploration Table', label: 'Second explorer' }
    ],
    'you-got-noticed-by-someone-youd-rather-avoid': [{ gain: { rivals: 1 } }]
  };

  followups['Character Events Table'] = {
    'all-this-endless-violence-is-depressing-you': [{ when: 'Unless the character is K’Erin', steps: [{ text: '+1 story point.' }] }],
    'you-have-some-business-to-attend-to-elsewhere': [
      { text: 'When they return:' },
      { roll: '1D6', label: 'XP' },
      { table: 'Loot Table' }
    ],
    'you-are-starting-to-wonder-if-it-is-time-to-move-on': [{ when: 'If they are in Sick Bay', steps: [{ roll: '1D6', label: 'Leave?', text: 'They leave if this is equal to or below their remaining recovery turns.' }] }],
    'you-get-a-letter-from-home': [{
      roll: '1D6', label: 'News from home',
      outcomes: [{ max: 4, text: 'Just news.' }, { min: 5, text: 'You immediately receive a Quest!', tone: 'good' }]
    }],
    'you-get-in-a-scrap-with-another-crew-member': [
      { randomCrew: true, label: 'Opponent (reroll if it’s the same character; a K’Erin must be chosen if you have one)' },
      { roll: '1D6', label: 'This character (add Combat Skill)' },
      { roll: '1D6', label: 'Opponent (add Combat Skill)' },
      { text: 'The lower score spends a campaign turn in Sick Bay; on a draw, both do.' }
    ],
    'you-are-not-sure-you-are-really-the-same-person-any-longer': [{ table: 'Motivation Table', label: 'New motivation' }],
    'overhear-something-useful': [{ gain: { rumors: 1 } }],
    'have-a-heart-to-heart-talk-with-a-crew-member': [{ randomCrew: true, label: 'Talks with' }],
    'you-pick-up-an-unusual-hobby': [{ gain: { storyPoints: 1 } }],
    'youve-had-time-to-reflect-on-your-adventures': [{ roll: '1D3', label: 'XP' }],
    'you-have-finally-found-true-love-in-this-bleak-universe': [
      { gain: { storyPoints: 1 } },
      { when: 'If their motivation was True Love', steps: [{ roll: '1D6', label: 'XP' }] }
    ],
    'a-personal-enemy-has-tracked-you-down': [{ gain: { rivals: 1 } }],
    'someone-has-sent-you-a-gift': [{ table: 'Loot Table' }],
    'you-know-someone-who-knows-someone': [{ gain: { patrons: 1 } }]
  };

  LP.data = LP.data || {};
  LP.data.followups = followups;
})(window.LP);
