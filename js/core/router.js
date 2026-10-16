(function (LP) {
  'use strict';

  /**
   * Hash routes:
   *   #/                          -> { name: 'home' }
   *   #/campaign/<id>             -> { name: 'campaign', id, tab: null }
   *   #/campaign/<id>/<tab>       -> { name: 'campaign', id, tab }
   * Anything else falls back to home.
   */
  function parse(hash) {
    const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'campaign' && parts[1]) {
      return { name: 'campaign', id: parts[1], tab: parts[2] || null };
    }
    return { name: 'home' };
  }

  function campaignPath(id, tab) {
    return '#/campaign/' + encodeURIComponent(id) + (tab ? '/' + encodeURIComponent(tab) : '');
  }

  function go(path) {
    if (location.hash === path) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      location.hash = path;
    }
  }

  /** Replace the current history entry (no extra Back step). */
  function redirect(path) {
    location.replace(path); // fires hashchange; works on file:// too
  }

  function start(render) {
    const handle = () => render(parse(location.hash));
    window.addEventListener('hashchange', handle);
    handle();
  }

  LP.router = { start, go, redirect, campaignPath, homePath: '#/' };
})(window.LP);
