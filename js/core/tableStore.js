(function (LP) {
  'use strict';

  /*
   * The table view (table.html) runs in its own window. Firefox gives each file:// page its own
   * storage, so the Battle tab hands it the model in the URL hash instead of through localStorage.
   * The page never touches the campaign data and keeps only its own marks, in its own localStorage.
   *
   *   model:  LP.tableModel.build() output, encoded into the hash (encode / decode)
   *   marks:  { battleId, out: { unitId: true }, events: { round: { rowId, natural } } }
   */

  const MARKS_KEY = 'lastParsec.tableMarks';

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** The URL hash that carries a model: base64url of its UTF-8 JSON. */
  function encode(model) {
    const bytes = new TextEncoder().encode(JSON.stringify(model));
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return '#m=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /** The model in a hash made by encode(), or null. */
  function decode(hash) {
    const m = /^#m=([A-Za-z0-9_-]+)$/.exec(hash || '');
    if (!m) return null;
    try {
      const binary = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      return null;
    }
  }

  /** The screen's marks for this battle; a different battle starts clean (events rolled on the Battle tab carry over). */
  function loadMarks(model) {
    const saved = read(MARKS_KEY);
    if (saved && saved.battleId === model.battleId) return { battleId: saved.battleId, out: saved.out || {}, events: saved.events || {} };
    const events = {};
    for (const ev of model.events || []) events[ev.round] = { rowId: ev.rowId, natural: ev.natural };
    return { battleId: model.battleId, out: {}, events: events };
  }

  function saveMarks(marks) {
    return write(MARKS_KEY, marks);
  }

  LP.tableStore = { MARKS_KEY, encode, decode, loadMarks, saveMarks };
})(window.LP);
