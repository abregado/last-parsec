(function (LP) {
  'use strict';

  /*
   * The table view's data: everything the Battle tab generates, laid out for the
   * reference screen (table.html). Plain JSON, so the screen needs none of the rules code.
   *
   *   Model = {
   *     battleId,                       // the battle's createdAt; the screen resets its Out marks when it changes
   *     campaign, title, subtitle,
   *     brief: [{ label, lines: [string] }],
   *     crew:    Team, enemies: Team,
   *     consumables: [{ name, count, text }],   // the crew's shared Consumables stash
   *     events: [{ round, rowId, natural }]   // already rolled on the Battle tab
   *   }
   *   Team = { heads: [string],         // stat column labels
   *            rules: [Rule],           // rules for the whole team, shown above its table
   *            units: [Unit], note }
   *   Unit = { id, name, sub, stats: [string], rules: [Rule], weapons: [Weapon] }
   *   Weapon = { name, range, shots, damage, rules: [Rule] }
   *   Rule = { name, text }             // name may be empty
   *
   * Weapon stats and gear text come from js/data/gear.js (built from the rulebook).
   */

  const B = LP.battle;
  const R = LP.roster;
  const E = LP.enemies;

  const TERRAIN = '2×2 ft: 2 large, 4 small, 2 linear · 2.5×2.5 ft: 2 large, 5 small, 4 linear · 3×3 ft: 3 large, 6 small, 3 linear.';
  const SEIZED = 'Before round 1, each crew member may Move or fire (shots only Hit on a natural 6).';

  function signed(n) {
    return n >= 0 ? '+' + n : '−' + Math.abs(n);
  }

  function gear() {
    return LP.data.gear;
  }

  /** The key gear.js uses: lowercase letters and digits only. */
  function keyOf(name) {
    return String(name || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '');
  }

  /** Split text into sentences, so each rule gets its own line. */
  function sentences(text) {
    return String(text || '').split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  }

  function traitRules(traits) {
    return traits.map((t) => ({ name: t, text: gear().traits[t] || '' }));
  }

  /** A weapon's stat line and the rules of its traits. count > 1 for a stack of grenades. */
  function weaponOf(name, count) {
    const label = name + (count > 1 ? ' ×' + count : '');
    const w = gear().weapons[keyOf(name.replace(/\s*\(.*\)\s*$/, ''))];
    if (!w) return { name: label, range: '—', shots: '—', damage: '—', rules: [] };
    return {
      name: label,
      range: w.range,
      shots: w.shots === null ? '—' : String(w.shots),
      damage: w.damage === 'NA' ? '—' : (/^\d+$/.test(w.damage) ? signed(parseInt(w.damage, 10)) : w.damage),
      rules: traitRules(w.traits)
    };
  }

  /** What a non-weapon item does, from the rulebook ('' when unknown). */
  function itemText(item) {
    const entry = gear().items[keyOf(item.name)];
    return entry ? entry.text : '';
  }

  /** Rule lines for a non-weapon item. */
  function itemRule(item) {
    return { name: item.name + (item.damaged ? ' (damaged: needs Repair)' : ''), text: itemText(item) };
  }

  /** Items typed in by hand have no table; a name the weapon list knows still counts. */
  function isWeapon(item) {
    return LP.items.categoryOf(item.table) === 'weapon' || (!item.table && !!gear().weapons[keyOf(item.name)]);
  }

  /** A weapon's stats on one line, traits named but not explained; '' when the weapon is unknown. */
  function weaponLine(item) {
    const w = weaponOf(item.name, 1);
    if (w.range === '—') return '';
    const parts = [w.range === 'Brawl' ? 'Brawl' : 'Range ' + w.range];
    if (w.shots !== '—') parts.push('Shots ' + w.shots);
    if (w.damage !== '—') parts.push('Damage ' + w.damage);
    return parts.concat(w.rules.map((r) => r.name)).join(' · ');
  }

  function groupByName(items) {
    const out = [];
    for (const item of items) {
      const found = out.find((g) => g.name === item.name && g.damaged === item.damaged);
      if (found) found.count += 1;
      else out.push({ name: item.name, damaged: item.damaged, count: 1, item });
    }
    return out;
  }

  /** A crew member as a unit: profile, species and equipment rules, weapons. */
  function crewUnit(campaign, member) {
    const species = R.species(member);
    const cls = R.classOf(member);
    const p = member.profile;
    const items = groupByName(R.itemsOf(campaign, member.id));
    const weapons = [];
    const rules = [];
    rules.push(...R.abilities(member));
    for (const group of items) {
      const weapon = isWeapon(group.item);
      if (weapon && !group.damaged) weapons.push(weaponOf(group.name, group.count));
      else if (weapon) rules.push({ name: group.name + ' (damaged: needs Repair)', text: '' });
      else rules.push(itemRule(group.item));
    }
    return {
      id: 'c-' + member.id,
      name: R.nameOf(member),
      sub: [species ? species.name : '', cls ? cls.name : '', member.id === campaign.roster.leaderId ? 'Leader' : ''].filter(Boolean).join(' · '),
      stats: [String(p.reactions), p.speed + '"', signed(p.combat), String(p.toughness), signed(p.savvy), String(p.luck)],
      rules: rules,
      weapons: weapons
    };
  }

  /** "Blade + Blade", "Hand gun", "Claws (Damage +1)" → weapon lines. */
  function enemyWeapons(text) {
    const names = String(text || '').split(/\s+\+\s+/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    for (const name of names) {
      const second = /^(.*?)\s*\(and a second (.*)\)$/i.exec(name);
      if (second) out.push(weaponOf(second[1], 1), weaponOf(second[2], 1));
      else out.push(weaponOf(name, 1));
    }
    return out;
  }

  function enemyUnits(r, battle) {
    const e = r.enemy;
    const f = r.force;
    const w = r.weapons;
    const base = [e.panic, e.speed, signed(e.combat), String(e.toughness), e.save || '—'];
    const units = [];
    const add = (name, sub, stats, weaponText, rules) => {
      units.push({ id: 'e-' + units.length, name: name, sub: sub, stats: stats, rules: rules || [], weapons: enemyWeapons(weaponText) });
    };
    const half = battle.options.varied && w.regular2 ? Math.ceil(f.regulars / 2) : f.regulars;
    for (let i = 1; i <= f.regulars; i++) add('Regular ' + i, e.name, base, i <= half ? w.regular : w.regular2);
    for (let i = 1; i <= f.specialists; i++) add('Specialist ' + i, e.name, base, w.specialist);
    if (f.lieutenant) {
      add(e.beast ? 'Pack leader' : 'Lieutenant', e.name, [e.panic, e.speed, signed(e.combat + 1), String(e.toughness), e.save || '—'],
        e.beast ? w.regular : w.lieutenant, [{ name: e.beast ? 'Pack leader' : 'Lieutenant', text: '+1 Combat Skill.' }]);
    }
    for (const u of r.uniques) {
      const parts = E.splitNotes(u.notes);
      const rules = [{ name: 'Fearless', text: 'Not affected by Morale.' }, { name: 'Luck ' + u.luck, text: '' }];
      if (parts.description) rules.push({ name: '', text: parts.description });
      for (const a of parts.abilities) rules.push({ name: a.name, text: a.text });
      if (u.guardian) rules.push({ name: 'Guardian AI', text: 'Attach them to the Lieutenant (or a random non-Specialist).' });
      add(u.name, 'Unique Individual', ['—', u.speed, signed(u.combat), String(u.toughness), u.save || '—'], u.weapons.replace(/\.$/, ''), rules);
    }
    return units;
  }

  function enemyRules(r) {
    const e = r.enemy;
    const out = [{ name: e.aiName + ' AI', text: r.deploymentPattern + ' No figures within 18" of the other side at the start.' }];
    for (const text of r.categoryRules) out.push({ name: '', text: text });
    // The enemy's description is flavour; only its abilities are rules.
    for (const a of E.splitNotes(e.notes).abilities) out.push({ name: a.name, text: a.text });
    for (const note of r.weapons.notes) out.push({ name: '', text: note });
    return out;
  }

  function briefOf(battle, ctx, r) {
    const brief = [];
    const add = (label, lines) => {
      const flat = [].concat(...lines.filter(Boolean).map(sentences));
      if (flat.length) brief.push({ label: label, lines: flat });
    };
    if (r.objective) add('Objective', [r.objective.title + ': ' + r.objective.text]);
    if (r.rivalAttack) add('Rival attack', [r.rivalAttack.title + ': ' + r.rivalAttack.text]);
    add('Deployment', [
      r.deployment ? r.deployment.title + ': ' + r.deployment.text : '',
      r.edge ? 'You enter from the ' + r.edge.mine + ' edge; the enemy from the ' + r.edge.theirs + '.' : ''
    ]);
    if (r.sight) add('Notable sight', [r.sight.title + ': ' + r.sight.text, r.sightPlacement ? r.sightPlacement + '.' : '']);
    add('Terrain', [TERRAIN + ' Put a feature at the centre.']);
    if (r.bounty) add('Bounty', [r.bounty + (r.bounty === 1 ? ' bonus credit' : ' bonus credits') + ' if you Hold the Field.']);
    return brief;
  }

  function consumablesOf(campaign) {
    return groupByName(R.hasCrew(campaign) ? R.consumables(campaign) : []).map((g) => ({ name: g.name, count: g.count, text: itemText(g.item) }));
  }

  /** The table view's model for the current battle, or null before a battle is generated. */
  function build(campaign, battle, ctx) {
    const r = B.resolve(battle, ctx);
    if (!battle.generated || !r.complete) return null;
    const planet = B.planetOf(ctx);
    const deployed = Array.isArray(battle.options.deployedIds) ? battle.options.deployedIds : B.defaultDeployed(ctx);
    const members = R.hasCrew(campaign) ? deployed.map((id) => R.getMember(campaign, id)).filter(Boolean) : [];
    const units = enemyUnits(r, battle);

    const seize = battle.seize && battle.seize.result;
    const crewRules = [];
    if (seize && seize.success) crewRules.push({ name: 'Seized the Initiative', text: SEIZED });

    return {
      battleId: battle.createdAt,
      campaign: campaign.name,
      title: r.missionLabel + (planet ? ' · ' + planet.name : ''),
      subtitle: [r.enemy.name + ' (' + r.enemy.table + ')',
        r.force.total + (r.uniques.length ? ' + ' + r.uniques.length + ' Unique' : '') + ' vs ' + (members.length || battle.options.crewFielded),
        seize ? (seize.success ? 'Seized the Initiative' : 'Did not seize the Initiative') : ''].filter(Boolean).join(' · '),
      brief: briefOf(battle, ctx, r),
      crew: {
        heads: ['React', 'Speed', 'Combat', 'Tough', 'Savvy', 'Luck'],
        rules: crewRules,
        units: members.map((m) => crewUnit(campaign, m)),
        note: members.length ? '' : 'No crew on the roster. Field ' + battle.options.crewFielded + ' figures.'
      },
      consumables: consumablesOf(campaign),
      enemies: { heads: ['Panic', 'Speed', 'Combat', 'Tough', 'Save'], rules: enemyRules(r), units: units, note: '' },
      events: battle.events.map((ev) => ({ round: ev.round, rowId: ev.rowId, natural: ev.natural }))
    };
  }

  LP.tableModel = { build, weaponOf, weaponLine, isWeapon, itemText, enemyWeapons, keyOf };
})(window.LP);
