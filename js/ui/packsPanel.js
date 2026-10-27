(function (LP) {
  'use strict';

  const { el } = LP.dom;
  const E = LP.events;
  const K = E.packs;

  /**
   * The Packs view of the Events tab: the base pack (locked) and the campaign's own packs, with
   * their details, fragments, export, import and delete.
   *   LP.ui.packsPanel(state) -> element     state = { campaign, redraw(), select(fullId), selectCondition(id) }
   */

  function fileName(pack) {
    return 'last-parsec-events-' + pack.pack.id + '.json';
  }

  /** Read a pack file, say what it holds, and add it if the player agrees. */
  async function importPack(state) {
    const { campaign } = state;
    const text = await LP.dom.pickTextFile('.json,application/json');
    if (text === null) return;
    const preview = K.previewImport(campaign, text);
    if (preview.problems.length) {
      LP.ui.notify('Can’t import this file: ' + preview.problems.slice(0, 3).join(' ') + (preview.problems.length > 3 ? ' (and ' + (preview.problems.length - 3) + ' more problems)' : ''), 'error');
      return;
    }
    const pack = preview.pack;
    const message = '“' + pack.pack.name + '”' + (pack.pack.author ? ' by ' + pack.pack.author : '') + ': ' + pack.events.length + ' events, ' +
      pack.conditions.length + ' conditions, ' + (pack.fragments || []).length + ' fragments.' +
      (preview.renamedFrom ? ' Its id “' + preview.renamedFrom + '” is taken, so it will be called “' + pack.pack.id + '”.' : '') +
      ' It is added as a pack of its own, and its events join the “All options” archetype.';
    const ok = await LP.ui.confirm({ title: 'Add this pack?', message: message, confirmLabel: 'Add pack' });
    if (!ok) return;
    K.importText(campaign, text);
    LP.storage.touchCampaign(campaign);
    LP.ui.notify('Added “' + pack.pack.name + '”.', 'success');
    state.redraw();
  }

  function metaField(state, pack, key, label, multiline) {
    const input = multiline ? el('textarea', { class: 'input', rows: '2' }) : el('input', { class: 'input', type: 'text', maxlength: '120' });
    input.setAttribute('data-focus', 'pack:' + pack.pack.id + ':' + key);
    input.value = pack.pack[key] || '';
    input.addEventListener('change', () => {
      K.updatePack(state.campaign, pack.pack.id, { [key]: input.value });
      LP.storage.touchCampaign(state.campaign);
      state.redraw();
    });
    return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), input);
  }

  function fragmentsBlock(state, pack) {
    const { campaign } = state;
    const save = () => LP.storage.touchCampaign(campaign);
    const ctx = {
      campaign, focus: 'frag:' + pack.pack.id, save, redraw: state.redraw,
      variables: () => ['$actor'].concat(LP.events.schema.variablesIn(pack.fragments || [])),
      fragments: () => (pack.fragments || []).map((f) => f.id),
      validation: () => ({ groups: [], fragments: (pack.fragments || []).map((f) => f.id) })
    };
    return el('div', { class: 'pack-fragments' },
      el('h4', null, 'Fragments'),
      el('p', { class: 'field-detail' }, 'Steps several events share. An event uses one with a “run a fragment” step.'),
      (pack.fragments || []).map((f) => el('details', { class: 'pack-fragment' },
        el('summary', null, f.id),
        LP.ui.stepList(f.steps, ctx, 'fragment-' + f.id),
        el('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => { K.deleteFragment(campaign, pack.pack.id, f.id); save(); state.redraw(); } }, 'Delete fragment'))),
      el('button', {
        type: 'button', class: 'btn btn-sm',
        onclick: async () => {
          const name = await LP.ui.prompt({ title: 'New fragment', label: 'Name', confirmLabel: 'Create' });
          if (!name) return;
          K.addFragment(campaign, pack.pack.id, name);
          save();
          state.redraw();
        }
      }, '+ Add a fragment'));
  }

  function userPack(state, pack) {
    const { campaign } = state;
    const id = pack.pack.id;
    return el('section', { class: 'panel pack-card' },
      el('div', { class: 'ev-head-top' }, el('h3', null, pack.pack.name), el('span', { class: 'badge' }, 'id: ' + id)),
      el('p', { class: 'field-detail' }, pack.events.length + ' events · ' + pack.conditions.length + ' conditions · ' + (pack.fragments || []).length + ' fragments'),
      el('div', { class: 'ev-row' },
        metaField(state, pack, 'name', 'Name'), metaField(state, pack, 'author', 'Author'), metaField(state, pack, 'version', 'Version')),
      metaField(state, pack, 'description', 'Description', true),
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button', class: 'btn btn-sm btn-primary', 'data-focus': 'pack-event:' + id,
          onclick: async () => {
            const values = await LP.ui.form({
              title: 'New event', message: 'Give it a title and say which table it belongs to. Its steps are added in the editor.',
              fields: [{ key: 'title', label: 'Title', type: 'text', value: '' }, { key: 'table', label: 'Table', value: 'character', options: LP.ui.eventKinds }],
              confirmLabel: 'Create'
            });
            if (!values) return;
            const fullId = K.addEvent(campaign, id, values.table, (values.title || '').trim() || 'New event');
            LP.storage.touchCampaign(campaign);
            state.select(fullId);
          }
        }, '+ New event'),
        el('button', {
          type: 'button', class: 'btn btn-sm', 'data-focus': 'pack-condition:' + id,
          onclick: async () => {
            const name = await LP.ui.prompt({ title: 'New condition', label: 'Name', confirmLabel: 'Create' });
            if (!name) return;
            const type = K.addConditionType(campaign, id, name);
            LP.storage.touchCampaign(campaign);
            state.selectCondition(id + ':' + type.id);
          }
        }, '+ New condition'),
        el('button', { type: 'button', class: 'btn btn-sm', 'data-focus': 'pack-export:' + id, onclick: () => LP.dom.downloadJson(fileName(pack), K.exportPack(campaign, id)) }, 'Export pack'),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-danger', 'data-focus': 'pack-delete:' + id,
          onclick: async () => {
            const ok = await LP.ui.confirm({ title: 'Delete this pack?', message: '“' + pack.pack.name + '” and its ' + pack.events.length + ' events, ' + pack.conditions.length + ' conditions and fragments are removed from this campaign. Export it first if you might want it back.', confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            K.deletePack(campaign, id);
            LP.storage.touchCampaign(campaign);
            state.redraw();
          }
        }, 'Delete')),
      fragmentsBlock(state, pack)
    );
  }

  function packsPanel(state) {
    const { campaign } = state;
    const base = LP.data.basePack;
    return el('div', { class: 'packs' },
      el('div', { class: 'toolbar' },
        el('button', {
          type: 'button', class: 'btn btn-primary', 'data-focus': 'pack-new',
          onclick: async () => {
            const name = await LP.ui.prompt({ title: 'New pack', label: 'Pack name', confirmLabel: 'Create' });
            if (!name) return;
            K.createPack(campaign, name);
            LP.storage.touchCampaign(campaign);
            state.redraw();
          }
        }, '+ New pack'),
        el('button', { type: 'button', class: 'btn', 'data-focus': 'pack-import', onclick: () => importPack(state) }, 'Import a pack')),
      el('section', { class: 'panel pack-card' },
        el('div', { class: 'ev-head-top' }, el('h3', null, '🔒 ' + base.pack.name), el('span', { class: 'badge' }, 'id: base')),
        el('p', { class: 'field-detail' }, base.events.length + ' events · ' + base.conditions.length + ' conditions · ' + base.fragments.length + ' fragments. ' + base.pack.description),
        el('p', { class: 'field-detail' }, 'The base pack can’t be changed. Switch events off, or duplicate one into a pack of your own to edit it.')),
      K.mine(campaign).map((p) => userPack(state, p)),
      !K.mine(campaign).length ? el('p', { class: 'muted' }, 'No packs of your own yet. Duplicate a base event, press New pack, or import a pack file.') : null
    );
  }

  LP.ui.packsPanel = packsPanel;
})(window.LP);
