(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /*
   * Small badges for the conditions in play (see js/rules/conditions.js).
   *   LP.ui.conditionBadges(campaign, filter, onChange) -> element, or null when nothing matches
   *   filter(instance) -> bool picks which conditions to show; onChange() runs after one is removed by hand.
   */

  function timeLeft(campaign, inst) {
    if (inst.activeFrom > LP.roster.turnNumber(campaign)) return 'starts next turn';
    if (inst.remaining === null) return '';
    return inst.remaining + (inst.remaining === 1 ? ' turn left' : ' turns left');
  }

  function conditionBadges(campaign, filter, onChange) {
    const C = LP.conditions;
    const shown = C.instances(campaign).filter((i) => C.typeOf(campaign, i.type) && filter(i));
    if (!shown.length) return null;
    return el('div', { class: 'condition-badges' }, shown.map((inst) => {
      const type = C.typeOf(campaign, inst.type);
      const detail = timeLeft(campaign, inst);
      return el('span', { class: 'condition-badge' + (inst.activeFrom > LP.roster.turnNumber(campaign) ? ' pending' : ''), title: C.fill(type.text || '', campaign, inst) },
        type.name + (detail ? ' · ' + detail : ''),
        el('button', {
          type: 'button', 'aria-label': 'Remove ' + type.name,
          onclick: () => {
            campaign.conditions = campaign.conditions.filter((c) => c.id !== inst.id);
            LP.storage.touchCampaign(campaign);
            onChange();
          }
        }, '×')
      );
    }));
  }

  LP.ui = LP.ui || {};
  LP.ui.conditionBadges = conditionBadges;
})(window.LP);
