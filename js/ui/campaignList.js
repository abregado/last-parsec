(function (LP) {
  'use strict';

  const { el, formatDate, downloadJson, pickTextFile } = LP.dom;
  const storage = LP.storage;
  const ui = LP.ui;

  function fileSlug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'campaign';
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  async function newCampaign() {
    const name = await ui.prompt({ title: 'New campaign', label: 'Campaign name', confirmLabel: 'Create' });
    if (name === null) return;
    const campaign = storage.createCampaign(name);
    LP.router.go(LP.router.campaignPath(campaign.id));
  }

  async function renameCampaign(campaign, rerender) {
    const name = await ui.prompt({
      title: 'Rename campaign',
      label: 'Campaign name',
      value: campaign.name,
      confirmLabel: 'Rename'
    });
    if (name === null || name === campaign.name) return;
    storage.renameCampaign(campaign.id, name);
    rerender();
  }

  function duplicateCampaign(campaign, rerender) {
    const copy = storage.duplicateCampaign(campaign.id);
    if (copy) ui.notify('Created "' + copy.name + '".', 'success');
    rerender();
  }

  async function deleteCampaign(campaign, rerender) {
    const ok = await ui.confirm({
      title: 'Delete campaign?',
      message: '"' + campaign.name + '" and everything in it will be removed from this browser. This cannot be undone. Export it first if you might want it back.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    storage.deleteCampaign(campaign.id);
    ui.notify('Deleted "' + campaign.name + '".');
    rerender();
  }

  function exportCampaign(campaign) {
    downloadJson('last-parsec-' + fileSlug(campaign.name) + '-' + today() + '.json', storage.exportCampaign(campaign.id));
  }

  function exportAll() {
    downloadJson('last-parsec-backup-' + today() + '.json', storage.exportAll());
  }

  async function importFile(rerender) {
    const text = await pickTextFile('.json,application/json');
    if (text === null) return;

    let campaigns;
    try {
      campaigns = storage.parseImport(text);
    } catch (e) {
      ui.notify('Import failed: ' + e.message, 'error');
      return;
    }

    const count = campaigns.length === 1 ? '1 campaign' : campaigns.length + ' campaigns';
    let mode = 'merge';
    if (storage.listCampaigns().length) {
      mode = await ui.choose({
        title: 'Import ' + count,
        message: 'Add the imported campaigns alongside your current ones, or replace everything currently stored in this browser?',
        choices: [
          { label: 'Add to current', value: 'merge' },
          { label: 'Replace all', value: 'replace', danger: true }
        ]
      });
      if (!mode) return;
    }

    storage.importCampaigns(campaigns, mode);
    ui.notify('Imported ' + count + '.', 'success');
    rerender();
  }

  /* ---------------------------------------------------------------------- */
  /* Rendering                                                              */
  /* ---------------------------------------------------------------------- */

  function campaignCard(campaign, rerender) {
    const count = campaign.characters.length;
    const href = LP.router.campaignPath(campaign.id);

    return el('li', { class: 'campaign-card' },
      el('div', { class: 'campaign-main' },
        el('a', { class: 'campaign-name', href: href, text: campaign.name }),
        el('p', { class: 'campaign-meta' },
          (count === 1 ? '1 character' : count + ' characters') + ' · Updated ' + formatDate(campaign.updatedAt)
        )
      ),
      el('div', { class: 'campaign-actions' },
        el('a', { class: 'btn btn-sm btn-primary', href: href }, 'Open'),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => renameCampaign(campaign, rerender) }, 'Rename'),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => duplicateCampaign(campaign, rerender) }, 'Duplicate'),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: () => exportCampaign(campaign) }, 'Export'),
        el('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => deleteCampaign(campaign, rerender) }, 'Delete')
      )
    );
  }

  function render(container) {
    const rerender = () => {
      LP.dom.clear(container);
      render(container);
    };
    const campaigns = storage.listCampaigns();

    container.appendChild(el('div', { class: 'page-header' },
      el('div', null,
        el('h1', { text: 'Campaigns' }),
        el('p', { class: 'lede', text: 'Generators for Five Parsecs From Home. Record the results on your printed sheets.' })
      ),
      el('div', { class: 'toolbar' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: newCampaign }, '+ New campaign'),
        el('button', { type: 'button', class: 'btn', onclick: () => importFile(rerender) }, 'Import'),
        el('button', { type: 'button', class: 'btn', disabled: !campaigns.length, onclick: exportAll }, 'Export all')
      )
    ));

    if (!campaigns.length) {
      container.appendChild(el('div', { class: 'empty-state' },
        el('h2', { text: 'No campaigns yet' }),
        el('p', { text: 'Create a campaign to start generating your crew, or import a file you exported earlier.' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: newCampaign }, '+ New campaign')
      ));
      return;
    }

    container.appendChild(el('ul', { class: 'campaign-list' },
      campaigns.map((campaign) => campaignCard(campaign, rerender))
    ));
  }

  LP.views.campaignList = { render };
})(window.LP);
