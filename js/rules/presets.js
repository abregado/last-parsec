(function (LP) {
  'use strict';

  /*
   * Character presets: characters set up ahead of time on the campaigns screen.
   *
   * A preset is a Character (see character.js) that has never been generated, plus
   *   portrait: data URL (1:2 JPEG) | null     picture used for the character
   * Its Fixed slots are the pre-selected values; Random slots are rolled when the
   * character is generated.
   *
   * Stored twice: as the defaults every new campaign starts from (LP.defaults), and as
   * campaign.presets, the campaign's own copy. While the crew is being created, adding
   * a character takes the next preset that no character in the generator came from, so
   * each preset is used once. Recruits during the campaign are completely random.
   */

  const C = LP.character;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function newId() {
    return LP.storage ? LP.storage.newId() : 'id-' + Math.random().toString(36).slice(2, 10);
  }

  /** Repair one preset; null if it is not a character at all. */
  function normalizeOne(raw) {
    if (!raw || typeof raw !== 'object' || !raw.species || typeof raw.species !== 'object') return null;
    const preset = clone(raw);
    preset.id = typeof raw.id === 'string' && raw.id ? raw.id : newId();
    preset.name = typeof raw.name === 'string' ? raw.name : '';
    preset.generated = false;
    preset.portrait = typeof raw.portrait === 'string' && raw.portrait.startsWith('data:image/') ? raw.portrait : null;
    preset.species = raw.species.mode === 'fixed' && raw.species.value ? { mode: 'fixed', value: raw.species.value } : { mode: 'random', value: null };
    if (!preset.fields || typeof preset.fields !== 'object') preset.fields = {};
    // Presets are never rolled: a Random slot holds no value.
    for (const slot of Object.values(preset.fields)) {
      if (!slot || typeof slot !== 'object') continue;
      slot.credits = Array.isArray(slot.credits) ? slot.credits : [];
      slot.items = Array.isArray(slot.items) ? slot.items : [];
      if (slot.mode === 'random') slot.value = null;
      for (const child of slot.credits.concat(slot.items)) if (child && child.mode === 'random') child.value = null;
    }
    for (const key of Object.keys(preset.fields)) if (!preset.fields[key] || typeof preset.fields[key] !== 'object') delete preset.fields[key];
    return C.sync(preset);
  }

  function normalize(list) {
    return (Array.isArray(list) ? list : []).map(normalizeOne).filter(Boolean);
  }

  /** A blank preset for the editor. */
  function create() {
    const preset = C.newCharacter();
    preset.portrait = null;
    return preset;
  }

  /** The presets no character in the generator came from yet. */
  function unused(campaign) {
    const taken = new Set((campaign.characters || []).map((c) => c.presetId).filter(Boolean));
    return (campaign.presets || []).filter((p) => !taken.has(p.id));
  }

  /** A fresh generator character built from a preset; its Random slots are still to be rolled. */
  function instantiate(preset) {
    const character = clone(preset);
    character.id = newId();
    character.presetId = preset.id;
    character.generated = false;
    character.nameAuto = false;
    return C.sync(character);
  }

  /**
   * The next unused preset as a new character, or null when there is none or the crew
   * already exists (recruits are random). The caller adds it to campaign.characters.
   */
  function take(campaign) {
    if (LP.roster && LP.roster.hasCrew(campaign)) return null;
    const next = unused(campaign)[0];
    return next ? instantiate(next) : null;
  }

  LP.presets = { normalize, create, unused, instantiate, take };
})(window.LP);
