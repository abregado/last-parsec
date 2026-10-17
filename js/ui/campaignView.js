(function (LP) {
  'use strict';

  const { el } = LP.dom;

  const TABS = [
    { id: 'characters', label: 'Characters' },
    { id: 'models', label: 'Models' },
    { id: 'species', label: 'Species' },
    { id: 'archetypes', label: 'Archetypes' },
    { id: 'planets', label: 'Planets' },
    { id: 'turn', label: 'Campaign Turn' },
    { id: 'battle', label: 'Battle' }
  ];

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
      LP.router.redirect(LP.router.campaignPath(campaign.id, TABS[0].id));
      return;
    }

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

    container.appendChild(el('nav', { 'aria-label': 'Campaign tools' },
      el('ul', { class: 'tabs' },
        TABS.map((t) => el('li', null,
          el('a', {
            class: 'tab',
            href: LP.router.campaignPath(campaign.id, t.id),
            'aria-current': t.id === tab.id ? 'page' : null
          }, t.label)
        ))
      )
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

  LP.views.campaign = { render };
})(window.LP);
