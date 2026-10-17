(function (LP) {
  'use strict';

  const KEY = 'lastParsec';
  const VERSION = 1;
  const APP_ID = 'last-parsec';
  const SAVE_DELAY_MS = 300;

  let state = { version: VERSION, campaigns: [] };
  let saveTimer = null;
  let errorHandler = (message) => console.error(message);

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function now() {
    return new Date().toISOString();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** { disabled: {...}, invasion: {...} } keyed by table — older saves stored an empty array here. */
  function normalizeModels(raw) {
    const idLists = (source) => {
      const out = {};
      if (source && typeof source === 'object') {
        for (const [table, ids] of Object.entries(source)) {
          if (Array.isArray(ids)) out[table] = ids.filter((id) => typeof id === 'string');
        }
      }
      return out;
    };
    const models = raw && typeof raw === 'object' ? raw : {};
    // invasion: tables the player has customised; other tables use the book defaults.
    return { disabled: idLists(models.disabled), invasion: idLists(models.invasion) };
  }

  /** Fill in any missing fields so older or hand-edited data is safe to use. */
  function normalizeCampaign(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Campaign entry is not an object.');
    if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('Campaign is missing a name.');
    const created = typeof raw.createdAt === 'string' ? raw.createdAt : now();
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
      name: raw.name.trim(),
      createdAt: created,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : created,
      characters: Array.isArray(raw.characters) ? raw.characters : [],
      settings: LP.settings.normalize(raw.settings),
      crew: raw.crew && typeof raw.crew === 'object' ? raw.crew : {},
      models: normalizeModels(raw.models),
      turn: raw.turn && typeof raw.turn === 'object' && !Array.isArray(raw.turn) ? raw.turn : null,
      turnMemory: raw.turnMemory && typeof raw.turnMemory === 'object' && !Array.isArray(raw.turnMemory) ? raw.turnMemory : {},
      battle: raw.battle && typeof raw.battle === 'object' && !Array.isArray(raw.battle) ? raw.battle : null
    };
  }

  /** Validate a stored or imported document and upgrade it to VERSION. */
  function migrate(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.campaigns)) {
      throw new Error('This is not Last Parsec data.');
    }
    if (typeof data.version !== 'number' || data.version > VERSION) {
      throw new Error('This data was saved by a newer version of Last Parsec.');
    }
    // Future versions: step data.version up to VERSION here.
    return { version: VERSION, campaigns: data.campaigns.map(normalizeCampaign) };
  }

  /* ---------------------------------------------------------------------- */
  /* Load / save                                                            */
  /* ---------------------------------------------------------------------- */

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      errorHandler('Browser storage is unavailable, so changes will not be saved. Use Export to keep your data.');
      return;
    }
    if (raw === null) return;

    try {
      state = migrate(JSON.parse(raw));
    } catch (e) {
      // Keep the unreadable data under a backup key instead of overwriting it.
      const backupKey = KEY + '.unreadable-' + Date.now();
      try { localStorage.setItem(backupKey, raw); } catch (ignored) { /* nothing more we can do */ }
      errorHandler('Saved data could not be read (' + e.message + '). It was kept in storage as "' + backupKey + '" and the app started empty.');
    }
  }

  function writeNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      errorHandler('Could not save to browser storage (' + e.name + '). Export your data to avoid losing changes.');
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, SAVE_DELAY_MS);
  }

  function flush() {
    if (saveTimer !== null) writeNow();
  }

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  /* ---------------------------------------------------------------------- */
  /* Campaigns                                                              */
  /* ---------------------------------------------------------------------- */

  function listCampaigns() {
    return state.campaigns.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  function getCampaign(id) {
    return state.campaigns.find((c) => c.id === id) || null;
  }

  function createCampaign(name) {
    const campaign = normalizeCampaign({ id: newId(), name, createdAt: now() });
    state.campaigns.push(campaign);
    scheduleSave();
    return campaign;
  }

  /** Call after changing a campaign in place. */
  function touchCampaign(campaign) {
    campaign.updatedAt = now();
    scheduleSave();
  }

  function renameCampaign(id, name) {
    const campaign = getCampaign(id);
    if (!campaign) return;
    campaign.name = name;
    touchCampaign(campaign);
  }

  function duplicateCampaign(id) {
    const source = getCampaign(id);
    if (!source) return null;
    const copy = clone(source);
    copy.id = newId();
    copy.name = source.name + ' (copy)';
    copy.createdAt = copy.updatedAt = now();
    state.campaigns.push(copy);
    scheduleSave();
    return copy;
  }

  function deleteCampaign(id) {
    state.campaigns = state.campaigns.filter((c) => c.id !== id);
    scheduleSave();
  }

  /* ---------------------------------------------------------------------- */
  /* Export / import                                                        */
  /* ---------------------------------------------------------------------- */

  function exportDocument(campaigns) {
    return {
      app: APP_ID,
      version: VERSION,
      exportedAt: now(),
      campaigns: clone(campaigns)
    };
  }

  function exportAll() {
    return exportDocument(state.campaigns);
  }

  function exportCampaign(id) {
    const campaign = getCampaign(id);
    return campaign ? exportDocument([campaign]) : null;
  }

  /** Parse an export file. Returns the campaigns or throws a readable Error. */
  function parseImport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('The file is not valid JSON.');
    }
    if (data && data.app !== undefined && data.app !== APP_ID) {
      throw new Error('This file was not exported from Last Parsec.');
    }
    const campaigns = migrate(data).campaigns;
    if (!campaigns.length) throw new Error('The file contains no campaigns.');
    return campaigns;
  }

  /**
   * mode 'merge': add the campaigns. Any whose id already exists gets a new id
   * and an "(imported)" suffix, so nothing is overwritten.
   * mode 'replace': discard all current campaigns first.
   */
  function importCampaigns(campaigns, mode) {
    if (mode === 'replace') {
      state.campaigns = [];
    }
    const ids = new Set(state.campaigns.map((c) => c.id));
    for (const campaign of campaigns) {
      if (ids.has(campaign.id)) {
        campaign.id = newId();
        campaign.name += ' (imported)';
      }
      ids.add(campaign.id);
      state.campaigns.push(campaign);
    }
    writeNow();
  }

  LP.storage = {
    VERSION,
    onError(handler) { errorHandler = handler; },
    load,
    flush,
    newId,
    listCampaigns,
    getCampaign,
    createCampaign,
    touchCampaign,
    renameCampaign,
    duplicateCampaign,
    deleteCampaign,
    exportAll,
    exportCampaign,
    parseImport,
    importCampaigns
  };
})(window.LP);
