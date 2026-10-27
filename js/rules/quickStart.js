(function (LP) {
  'use strict';

  /*
   * Quick Start: set up a new campaign in one go and begin its first turn.
   *
   * Fills the generator up to the campaign crew size (character presets first, then fully
   * random characters), generates everyone and the crew's equipment and ship, picks a random
   * Leader, finalizes the crew, and plays the first turn's Start and Travel steps with their
   * defaults (the starting world is rolled). The campaign is left at Step 2, World.
   * Characters and crew rolls the player already made are kept.
   */

  const rng = LP.rng;
  const T = LP.turn;
  const C = LP.character;
  const R = LP.roster;

  /** Why Quick Start can't run on this campaign, or null when it can. */
  function problem(campaign) {
    const turn = campaign.turn;
    if (R.turnNumber(campaign) > 1 || (campaign.turnMemory && campaign.turnMemory.hasPlayed) || (turn && turn.records && turn.records.length)) {
      return 'Quick Start is only for campaigns that have not had a turn yet.';
    }
    if (campaign.pendingRecruit) return 'Finish the recruit that is waiting first.';
    return null;
  }

  function available(campaign) {
    return problem(campaign) === null;
  }

  function generateCharacter(campaign, character) {
    C.generate(character);
    LP.names.assign(campaign, character, true);
  }

  /** Fill the generator, roll everything and pick a Leader. */
  function makeCrew(campaign) {
    while (campaign.characters.length < campaign.settings.crewSize) {
      campaign.characters.push(LP.presets.take(campaign) || C.newCharacter());
    }
    for (const character of campaign.characters) {
      if (!character.generated) generateCharacter(campaign, character);
    }
    LP.crew.ensure(campaign);
    LP.crew.generate(campaign);
    if (!campaign.crew.leaderId) {
      const people = campaign.characters.filter((c) => !(C.resolve(c).species || {}).bot);
      const pool = people.length ? people : campaign.characters;
      LP.crew.setLeader(campaign, pool[rng.int(pool.length)].id);
    }
    return R.finalize(campaign);
  }

  function defaultInput(fields) {
    const input = {};
    for (const field of fields) {
      if (field.type !== 'info' && field.value !== undefined) input[field.key] = field.value;
    }
    return input;
  }

  /** Confirm every Start and Travel stage with its defaults, until Step 2 (or Step 4) is next. */
  function firstTurn(campaign) {
    for (let guard = 0; guard < 40; guard++) {
      const w = T.walk(campaign);
      if (w.finished) return null;
      if (!w.current) {
        const record = campaign.turn.records[campaign.turn.records.length - 1];
        if (record.pending) {
          const options = record.pending.options || [];
          const answer = options.find((o) => o.value === 'skip') || options[0];
          const result = T.choose(campaign, answer ? answer.value : '');
          if (result.error) return result.error;
        } else {
          const result = T.applyLedger(campaign);
          if (result.error) return result.error;
        }
        continue;
      }
      if (w.current.step !== 'start' && w.current.step !== 'travel') return null;
      const result = T.confirm(campaign, defaultInput(T.currentFields(campaign)));
      if (result.error) return w.current.title + ': ' + result.error;
    }
    return 'The first turn did not settle.';
  }

  /** Returns { ok: true } or { error }. */
  function run(campaign) {
    const blocked = problem(campaign);
    if (blocked) return { error: blocked };

    if (!R.hasCrew(campaign)) {
      const made = makeCrew(campaign);
      if (made.error) return { error: made.error };
    }
    T.ensure(campaign);
    const error = firstTurn(campaign);
    if (LP.storage) LP.storage.touchCampaign(campaign);
    return error ? { error } : { ok: true };
  }

  LP.quickStart = { problem, available, run };
})(window.LP);
