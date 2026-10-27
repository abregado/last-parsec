(function (LP) {
  'use strict';

  /*
   * A copy of everything an applied event can change, so Undo and Restart can put
   * it back: the roster (members, items, ship, resources), the planets, and the
   * conditions. turnMemory has its own copy in the turn engine.
   *
   *   snapshot = { roster, planets, currentPlanetId, conditions }
   *
   * Portraits are left out (they are large and a snapshot is stored per applied event).
   * portraitsOf() lists them so the turn can keep one copy, and restore() puts them back
   * on members that still exist or that the map knows.
   */

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function portraitsOf(campaign) {
    const out = {};
    for (const m of (campaign.roster && campaign.roster.members) || []) if (m.portrait) out[m.id] = m.portrait;
    return out;
  }

  function take(campaign) {
    const roster = clone(campaign.roster);
    if (roster && roster.members) for (const m of roster.members) m.portrait = null;
    return {
      roster: roster,
      planets: clone(campaign.planets),
      currentPlanetId: campaign.currentPlanetId || null,
      conditions: clone(campaign.conditions || [])
    };
  }

  function restore(campaign, snap, portraits) {
    if (!snap) return;
    const known = Object.assign({}, portraits, portraitsOf(campaign));
    campaign.roster = clone(snap.roster);
    if (campaign.roster && campaign.roster.members) for (const m of campaign.roster.members) m.portrait = known[m.id] || null;
    campaign.planets = clone(snap.planets);
    campaign.currentPlanetId = snap.currentPlanetId;
    campaign.conditions = clone(snap.conditions);
  }

  /** A throwaway campaign holding a copy of the snapshot's slice, for previews. */
  function scratch(campaign) {
    const copy = Object.assign({}, campaign);
    restore(copy, take(campaign));
    return copy;
  }

  /** Has anything the snapshot covers changed since `snap` was taken? */
  function changedSince(campaign, snap) {
    return JSON.stringify(take(campaign)) !== JSON.stringify(snap);
  }

  LP.snapshot = { take, restore, scratch, changedSince, portraitsOf };
})(window.LP);
