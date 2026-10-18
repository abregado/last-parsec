(function (LP) {
  'use strict';

  const { el } = LP.dom;

  // State tabs show the campaign as it is now; config tabs set it up and
  // only show in Edit mode.
  const TABS = [
    { id: 'crew', label: 'Crew' },
    { id: 'planets', label: 'Planets' },
    { id: 'turn', label: 'Campaign Turn' },
    { id: 'battle', label: 'Battle' },
    { id: 'characters', label: 'Characters', config: true },
    { id: 'models', label: 'Models', config: true },
    { id: 'species', label: 'Species', config: true },
    { id: 'archetypes', label: 'Archetypes', config: true },
    { id: 'equipment', label: 'Equipment', config: true }
  ];

  const MODE_KEY = 'lastParsec.mode';

  /** 'edit' (every tab) or 'play' (state tabs only); kept per browser. */
  function getMode() {
    try {
      return localStorage.getItem(MODE_KEY) === 'play' ? 'play' : 'edit';
    } catch (e) {
      return 'edit';
    }
  }

  function setMode(mode) {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch (e) { /* the toggle still works for this page */ }
    fallbackMode = mode;
  }

  let fallbackMode = null;

  function mode() {
    return fallbackMode || getMode();
  }

  /** Where a campaign opens: the generator until there is a crew. */
  function defaultTab(campaign) {
    return LP.roster && LP.roster.hasCrew(campaign) || mode() === 'play' ? 'crew' : 'characters';
  }

  function renderNotFound(container) {
    container.appendChild(el('div', { class: 'empty-state' },
      el('h2', { text: 'Campaign not found' }),
      el('p', { text: 'It may have been deleted, or the link came from another browser.' }),
      el('a', { class: 'btn btn-primary', href: LP.router.homePath }, 'Back to campaigns')
    ));
  }

  async function editSettings(campaign, container, route) {
    const values = await LP.ui.form({
      title: 'Campaign settings',
      message: 'These change several rolls: invasion checks, pay, XP and enemy numbers (pp.63–65).',
      fields: [
        {
          key: 'difficulty',
          label: 'Difficulty mode',
          value: campaign.settings.difficulty,
          options: LP.settings.DIFFICULTIES.map((d) => ({ value: d.id, label: d.label }))
        },
        {
          key: 'crewSize',
          label: 'Campaign crew size',
          value: campaign.settings.crewSize,
          options: LP.settings.CREW_SIZES.map((n) => ({ value: n, label: String(n) }))
        }
      ]
    });
    if (!values) return;
    campaign.settings = LP.settings.normalize({
      difficulty: values.difficulty,
      crewSize: parseInt(values.crewSize, 10)
    });
    LP.storage.touchCampaign(campaign);
    LP.dom.clear(container);
    render(container, route);
  }

  function render(container, route) {
    const campaign = LP.storage.getCampaign(route.id);
    if (!campaign) {
      document.title = 'Last Parsec';
      renderNotFound(container);
      return;
    }

    const tab = TABS.find((t) => t.id === route.tab);
    if (!tab) {
      LP.router.redirect(LP.router.campaignPath(campaign.id, defaultTab(campaign)));
      return;
    }
    const playing = mode() === 'play';
    const shown = TABS.filter((t) => !playing || !t.config || t.id === tab.id);

    document.title = campaign.name + ' · ' + tab.label + ' · Last Parsec';

    container.appendChild(el('a', { class: 'back-link', href: LP.router.homePath }, '← All campaigns'));
    container.appendChild(el('div', { class: 'page-header' },
      el('h1', { text: campaign.name }),
      el('div', { class: 'campaign-settings' },
        el('span', { class: 'badge', title: 'Difficulty mode and campaign crew size' }, LP.settings.summary(campaign.settings)),
        el('button', {
          type: 'button',
          class: 'btn btn-sm',
          onclick: () => editSettings(campaign, container, route)
        }, 'Settings')
      )
    ));

    const toggle = el('button', {
      type: 'button',
      class: 'btn btn-sm mode-toggle',
      'aria-pressed': playing ? 'true' : 'false',
      title: playing ? 'Show the setup tabs (Characters, Models, Species, Archetypes, Equipment)' : 'Hide the setup tabs while you play',
      onclick: () => {
        setMode(playing ? 'edit' : 'play');
        // Leaving Edit mode on a setup tab: go to the crew.
        if (!playing && tab.config) {
          LP.router.go(LP.router.campaignPath(campaign.id, 'crew'));
          return;
        }
        LP.dom.clear(container);
        render(container, route);
      }
    }, playing ? '▶ Play mode' : '✎ Edit mode');

    container.appendChild(el('nav', { class: 'tab-bar', 'aria-label': 'Campaign tools' },
      el('ul', { class: 'tabs' },
        shown.map((t, i) => el('li', { class: t.config && (i === 0 || !shown[i - 1].config) ? 'tab-config-first' : null },
          el('a', {
            class: 'tab' + (t.config ? ' tab-config' : ''),
            href: LP.router.campaignPath(campaign.id, t.id),
            'aria-current': t.id === tab.id ? 'page' : null
          }, t.label)
        ))
      ),
      toggle
    ));

    // On narrow screens the tab bar scrolls: bring the active tab into view.
    const tabList = container.querySelector('.tabs');
    const activeTab = tabList && tabList.querySelector('[aria-current="page"]');
    if (tabList && activeTab && tabList.scrollWidth > tabList.clientWidth) {
      tabList.scrollLeft = Math.max(0, activeTab.offsetLeft - tabList.offsetLeft - 16);
    }

    const panel = el('div', { class: 'tab-panel' });
    container.appendChild(panel);
    if (LP.tabs[tab.id]) LP.tabs[tab.id](panel, campaign);
    else panel.appendChild(el('p', { class: 'muted' }, 'Coming soon.'));
  }

  LP.views.campaign = { render, TABS, mode };
})(window.LP);
