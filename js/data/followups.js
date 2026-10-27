(function (LP) {
  'use strict';

  /*
   * Follow-up scripts: the dice each table result calls for, written by hand
   * from the rulebook. See js/core/followup.js for the step language.
   * The row's own rule text is always shown above these, so steps only add
   * rolls and short outcome notes.
   */

  const DAMAGED = 'Damaged: needs Repair before it can be used.';

  const followups = {
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
    'company-store': [{ text: 'Roll once on the Trade Table, by hand, if the mission succeeds.', tone: 'note' }],
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

  LP.data = LP.data || {};
  LP.data.followups = followups;
})(window.LP);
