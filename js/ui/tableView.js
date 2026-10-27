(function (LP) {
  'use strict';

  /*
   * The table view: a reference and Out tracker for use at the table, opened from the Battle tab.
   * It draws the model the Battle tab passed in the URL hash (see js/rules/tableModel.js) and keeps only its own
   * marks: which figures are Out, and the Battle Events rolled here.
   */

  const { el, clear } = LP.dom;
  const THEME_KEY = 'lastParsec.theme';
  const SKULL = 'M12 2C6.9 2 3 5.7 3 10.5c0 3 1.5 5.2 3.5 6.5V20a1 1 0 0 0 1 1H9v-2h2v2h2v-2h2v2h.5a1 1 0 0 0 1-1v-3c2-1.3 3.5-3.5 3.5-6.5C21 5.7 17.1 2 12 2zM8.5 12.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM12 14l1.2 2.2h-2.4L12 14z';

  let model = null;
  let marks = null;
  let root = null;

  function skull() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', SKULL);
    svg.appendChild(path);
    return svg;
  }

  function ruleLine(rule) {
    return el('div', { class: 'rule' },
      rule.name ? el('b', null, rule.name) : null,
      rule.name && rule.text ? ' — ' : null,
      rule.text);
  }

  function rulesBlock(rules) {
    return rules.length ? el('div', { class: 'rules' }, rules.map(ruleLine)) : null;
  }

  function unitRow(unit, team) {
    const out = !!marks.out[unit.id];
    const button = el('button', {
      type: 'button', class: 'btn-out' + (out ? ' on' : ''), 'aria-pressed': out ? 'true' : 'false', 'aria-label': 'Out of action: ' + unit.name,
      onclick: () => {
        if (marks.out[unit.id]) delete marks.out[unit.id];
        else marks.out[unit.id] = true;
        LP.tableStore.saveMarks(marks);
        const now = !!marks.out[unit.id];
        button.classList.toggle('on', now);
        button.setAttribute('aria-pressed', now ? 'true' : 'false');
        row.classList.toggle('out', now);
        counts();
      }
    }, skull());
    const row = el('div', { class: 'row unit' + (out ? ' out' : ''), 'data-team': team },
      el('div', { class: 'left' },
        el('div', { class: 'name' }, el('b', null, unit.name), el('span', null, unit.sub)),
        unit.stats.map((s) => el('div', { class: 'stat' }, s)),
        rulesBlock(unit.rules)
      ),
      el('div', { class: 'right' },
        unit.weapons.length ? unit.weapons.map((w) => [
          el('div', { class: 'wn' }, w.name),
          el('div', { class: 'wv' }, w.range),
          el('div', { class: 'wv' }, w.shots),
          el('div', { class: 'wv' }, w.damage),
          rulesBlock(w.rules)
        ]) : el('div', { class: 'wn muted' }, 'Unarmed')
      ),
      el('div', { class: 'act' }, button)
    );
    return row;
  }

  function teamSection(id, title, team) {
    const grid = el('div', { class: 'grid', style: '--stats:' + team.heads.length },
      el('div', { class: 'row head' },
        el('div', { class: 'left' }, el('div', { class: 'l' }, title), team.heads.map((h) => el('div', null, h))),
        el('div', { class: 'right' }, el('div', { class: 'l' }, 'Weapon'), el('div', null, 'Range'), el('div', null, 'Shots'), el('div', null, 'Dmg')),
        el('div', null)
      ),
      team.units.map((u) => unitRow(u, id))
    );
    return el('section', { id: id },
      el('h2', null, title, el('small', { id: id + '-count' })),
      team.rules.length ? el('div', { class: 'team' }, team.rules.map(ruleLine)) : null,
      team.note ? el('p', { class: 'muted' }, team.note) : null,
      team.units.length ? el('div', { class: 'tablewrap' }, grid) : null
    );
  }

  function eventsSection() {
    const table = LP.rng.getTable('Battle Events Table');
    const one = (round) => {
      const ev = marks.events[round];
      const row = ev ? table.rows.find((x) => x.id === ev.rowId) : null;
      return el('div', { class: 'event' },
        el('button', {
          type: 'button', class: 'btn btn-primary',
          onclick: () => {
            const r = LP.rng.rollOn('Battle Events Table');
            marks.events[round] = { rowId: r.row.id, natural: r.natural };
            LP.tableStore.saveMarks(marks);
            draw();
          }
        }, (row ? 'Reroll' : 'Roll') + ': end of round ' + round),
        row
          ? el('div', null, el('span', { class: 'dice' }, 'D100: ' + ev.natural), el('h3', null, row.title), el('p', null, row.effect))
          : el('span', { class: 'muted' }, 'Not rolled yet')
      );
    };
    return el('section', { id: 'events' },
      el('h2', null, 'Battle events', el('small', { class: 'muted' }, 'optional rule, p.116')),
      el('div', { class: 'events' }, one(2), one(4)),
      el('p', { class: 'muted small' }, 'If the two events contradict each other, discard the second.')
    );
  }

  function briefSection() {
    return el('section', { id: 'brief' },
      el('h2', null, 'Battle'),
      el('dl', { class: 'brief' }, model.brief.map((b) => el('div', null, el('dt', null, b.label), b.lines.map((l) => el('dd', null, l)))))
    );
  }

  function counts() {
    for (const [id, team] of [['crew', model.crew], ['enemies', model.enemies]]) {
      const target = document.getElementById(id + '-count');
      if (!target || !team.units.length) continue;
      const gone = team.units.filter((u) => marks.out[u.id]).length;
      target.textContent = (team.units.length - gone) + ' of ' + team.units.length + ' in action';
    }
  }

  function header() {
    return el('header', { class: 'bar' },
      el('div', { class: 'grow' }, el('h1', null, model.title), el('div', { class: 'sub' }, model.subtitle)),
      el('button', { type: 'button', class: 'btn', 'aria-label': 'Switch between light and dark', onclick: toggleTheme }, '◐'),
      el('button', { type: 'button', class: 'btn', onclick: () => window.close() }, 'Close')
    );
  }

  function empty() {
    return el('main', { class: 'empty' },
      el('h1', null, 'No battle to show'),
      el('p', null, 'Generate a battle on the Battle tab, then press Table view.'));
  }

  function draw() {
    const y = window.scrollY;
    clear(root);
    if (!model) {
      document.title = 'Last Parsec · Table view';
      root.appendChild(empty());
      return;
    }
    document.title = model.title + ' · Table view';
    root.appendChild(header());
    root.appendChild(el('main', null,
      briefSection(),
      teamSection('crew', 'Your crew', model.crew),
      teamSection('enemies', 'Enemy force', model.enemies),
      eventsSection()
    ));
    counts();
    window.scrollTo(0, y);
  }

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* the theme just won't persist */ }
  }

  /** Read the model from the URL hash and the stored marks, then draw. */
  function load() {
    model = LP.tableStore.decode(location.hash);
    marks = model ? LP.tableStore.loadMarks(model) : null;
    draw();
  }

  LP.tableView = {
    start(container) {
      root = container;
      load();
      // The Battle tab sets a new hash when the battle changes; follow it.
      window.addEventListener('hashchange', load);
    }
  };
})(window.LP);
