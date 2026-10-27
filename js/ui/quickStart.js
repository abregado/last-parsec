(function (LP) {
  'use strict';

  /** Quick Start button action: confirm, run LP.quickStart, and open Step 2 on the Campaign Turn tab. */
  async function quickStart(campaign) {
    const R = LP.roster;
    const crew = R.hasCrew(campaign);
    const left = crew ? 0 : LP.presets.unused(campaign).length;
    const size = campaign.settings.crewSize;
    const ok = await LP.ui.confirm({
      title: 'Quick Start "' + campaign.name + '"?',
      message: (crew
        ? 'Your crew is already set up. '
        : 'The crew is filled up to ' + size + ' characters (' + (left ? Math.min(left, size) + ' from your presets, the rest random' : 'all random') +
          '), then everyone, the equipment and the ship are rolled and a random Leader is chosen. Characters and rolls you already made are kept. ') +
        'The first turn’s Start and Travel steps are played with their defaults, and you land at Step 2, World.',
      confirmLabel: 'Quick Start'
    });
    if (!ok) return;

    const result = LP.quickStart.run(campaign);
    LP.storage.touchCampaign(campaign);
    if (result.error) {
      LP.ui.notify('Quick Start stopped: ' + result.error, 'error');
      LP.router.go(LP.router.campaignPath(campaign.id, R.hasCrew(campaign) ? 'crew' : 'characters'));
      return;
    }
    LP.ui.notify('Crew and first turn are ready.', 'success');
    LP.router.go(LP.router.campaignPath(campaign.id, 'turn'));
  }

  LP.ui.quickStart = quickStart;
})(window.LP);
