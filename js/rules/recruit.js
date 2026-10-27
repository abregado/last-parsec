(function (LP) {
  'use strict';

  /*
   * A recruit an event offers (the recruit prompt of the event runner). The new character is made
   * on the Characters tab, where the player sees them and accepts or declines:
   *
   *   campaign.pendingRecruit = { characterId, variant }
   *   variant = { species?, feral?, baseProfileOnly?, equipment?: false, xp? }
   *     species / feral   the species is fixed (Feral if the event says so), else rolled with the planet's weights
   *     baseProfileOnly   no Background, Motivation or Class rolls
   *     equipment: false  they bring nothing (the equipment from their origin rolls is dropped)
   *     xp                unspent XP they join with
   *
   * Accepting answers the waiting prompt with { accepted, member, items }; the member joins when the
   * event's ledger is applied.
   */

  const C = LP.character;

  function stillWaiting(campaign) {
    const records = campaign.turn && campaign.turn.records;
    const last = records && records[records.length - 1];
    return !!(last && last.pending && last.pending.kind === 'recruit');
  }

  /** The recruit being made, as { character, variant }, or null (clearing it if the turn no longer wants one). */
  function current(campaign) {
    const pr = campaign.pendingRecruit;
    if (!pr) return null;
    const character = campaign.characters.find((c) => c.id === pr.characterId);
    if (!character || !stillWaiting(campaign)) {
      cancel(campaign);
      return null;
    }
    return { character: character, variant: pr.variant };
  }

  function cancel(campaign) {
    const pr = campaign.pendingRecruit;
    if (pr) campaign.characters = campaign.characters.filter((c) => c.id !== pr.characterId);
    campaign.pendingRecruit = null;
  }

  /** Start (or reopen) the recruit for the waiting prompt. Returns the character. */
  function begin(campaign, variant) {
    const existing = current(campaign);
    if (existing) return existing.character;
    cancel(campaign);
    const planet = LP.planets && Array.isArray(campaign.planets) ? LP.planets.current(campaign) : null;
    const archetype = planet ? LP.planets.archetypeOf(campaign, planet) : null;
    const v = variant || {};
    let speciesId = v.species || (v.feral ? 'feral' : null);
    if (!speciesId) {
      const rolled = LP.archetypes.rollSpecies(archetype);
      speciesId = rolled ? rolled.id : 'baseline-human';
    }
    const character = C.newCharacter();
    character.species = { mode: 'fixed', value: speciesId };
    if (v.baseProfileOnly) character.basic = true;
    C.sync(character);
    C.generate(character);
    LP.names.assign(campaign, character, true);
    campaign.characters.push(character);
    campaign.pendingRecruit = { characterId: character.id, variant: v };
    return character;
  }

  /** What the recruit variant means, in words, for the banner. */
  function describe(variant) {
    const v = variant || {};
    const parts = [];
    if (v.species) parts.push('a ' + (LP.data.species.byId[v.species] ? LP.data.species.byId[v.species].name : v.species));
    if (v.feral) parts.push('Feral');
    parts.push(v.baseProfileOnly ? 'base profile only, no Background, Motivation or Class' : 'rolled up normally');
    if (v.equipment === false) parts.push('no equipment');
    if (v.xp) parts.push(v.xp + ' XP unspent');
    return parts.join(', ');
  }

  /** The answer to give the waiting prompt: { accepted: false }, or the member and their items. */
  function finish(campaign, accepted) {
    const now = current(campaign);
    if (!now) return null;
    let answer = { accepted: false };
    if (accepted) {
      const turn = LP.roster.turnNumber(campaign);
      const member = LP.roster.memberFrom(now.character, false, turn);
      if (now.variant.xp) member.xp += now.variant.xp;
      const items = [];
      if (now.variant.equipment !== false) {
        for (const it of C.resolve(now.character).items) {
          items.push(...LP.items.makeAll({
            table: it.table, rowId: it.row.id, carrierId: member.id, turn: turn,
            source: 'Brought by ' + LP.roster.nameOf(member) + ' when they joined on turn ' + turn + '.'
          }));
        }
      }
      answer = { accepted: true, member: member, items: items };
    }
    cancel(campaign);
    return answer;
  }

  LP.recruit = { begin, current, cancel, finish, describe };
})(window.LP);
