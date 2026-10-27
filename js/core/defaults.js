(function (LP) {
  'use strict';

  /*
   * What every new campaign starts from, set up on the campaigns screen and kept in
   * this browser, apart from any campaign:
   *   { models: LP.models shape, presets: [Character preset] }
   * holder() is a campaign-shaped object the Models and Characters editors can work on
   * directly (`models`, `characters` = the presets, name tables for rolled names).
   * seed() hands a new campaign its own copy.
   */

  const KEY = 'lastParsec.defaults';

  let holder = null;
  let saveTimer = null;
  let errorHandler = (message) => console.error(message);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function build(stored) {
    const object = {
      id: 'defaults',
      name: 'New campaign defaults',
      models: LP.models.normalize(stored && stored.models),
      characters: LP.presets.normalize(stored && stored.presets),
      crew: {},
      roster: { members: [] },
      settings: LP.settings.normalize(null)
    };
    LP.names.ensure(object);
    LP.crew.ensure(object);
    return object;
  }

  /** The editable defaults, loaded on first use. */
  function get() {
    if (!holder) holder = build(read());
    return holder;
  }

  function writeNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!holder) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ models: holder.models, presets: holder.characters }));
    } catch (e) {
      errorHandler('Could not save your defaults (' + e.name + '). Smaller pictures take less space.');
    }
  }

  /** Call after changing the defaults. */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 300);
  }

  function flush() {
    if (saveTimer !== null) writeNow();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  /** A copy of the defaults for a new campaign: { models, presets }. */
  function seed() {
    const d = get();
    return { models: clone(d.models), presets: clone(d.characters) };
  }

  /** Throw away the loaded defaults and start again from what is stored (tests use this with their own holder). */
  function reset(stored) {
    clearTimeout(saveTimer);
    saveTimer = null;
    holder = build(stored);
    return holder;
  }

  LP.defaults = { get, save, flush, seed, reset, onError(handler) { errorHandler = handler; } };
})(window.LP);
