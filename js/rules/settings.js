(function (LP) {
  'use strict';

  /*
   * Campaign settings (pp.63-65): difficulty mode and campaign crew size.
   * Stored as campaign.settings = { difficulty, crewSize }.
   */

  const DIFFICULTIES = [
    { id: 'easy', label: 'Easy' },
    { id: 'normal', label: 'Normal' },
    { id: 'challenging', label: 'Challenging' },
    { id: 'hardcore', label: 'Hardcore' },
    { id: 'insanity', label: 'Insanity' }
  ];

  const CREW_SIZES = [4, 5, 6];

  const DEFAULTS = { difficulty: 'normal', crewSize: 6 };

  /** Repair missing or invalid values. */
  function normalize(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      difficulty: DIFFICULTIES.some((d) => d.id === s.difficulty) ? s.difficulty : DEFAULTS.difficulty,
      crewSize: CREW_SIZES.includes(s.crewSize) ? s.crewSize : DEFAULTS.crewSize
    };
  }

  function difficultyLabel(id) {
    const found = DIFFICULTIES.find((d) => d.id === id);
    return found ? found.label : id;
  }

  /** "Normal · crew 6" */
  function summary(settings) {
    return difficultyLabel(settings.difficulty) + ' · crew ' + settings.crewSize;
  }

  LP.settings = { DIFFICULTIES, CREW_SIZES, DEFAULTS, normalize, difficultyLabel, summary };
})(window.LP);
