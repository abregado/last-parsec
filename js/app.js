(function (LP) {
  'use strict';

  const THEME_KEY = 'lastParsec.theme';

  function setupThemeToggle() {
    const button = document.getElementById('theme-toggle');
    const root = document.documentElement;

    const sync = () => {
      button.textContent = root.getAttribute('data-theme') === 'light' ? 'Dark mode' : 'Light mode';
    };

    button.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* theme just won't persist */ }
      sync();
    });

    sync();
  }

  function render(route) {
    const app = document.getElementById('app');
    LP.dom.clear(app);

    if (route.name === 'campaign') {
      LP.views.campaign.render(app, route);
    } else {
      document.title = 'Last Parsec';
      LP.views.campaignList.render(app);
    }

    window.scrollTo(0, 0);
  }

  // Surface unexpected errors instead of failing silently (once per message).
  const reported = new Set();
  function reportError(error) {
    const message = (error && error.message) || String(error);
    console.error(error);
    if (reported.has(message)) return;
    reported.add(message);
    LP.ui.notify('Something went wrong: ' + message + '. Your saved data is safe; try reloading the page.', 'error');
  }
  window.addEventListener('error', (event) => reportError(event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));

  LP.storage.onError((message) => LP.ui.notify(message, 'error'));
  LP.storage.load();
  setupThemeToggle();
  LP.router.start(render);
})(window.LP);
