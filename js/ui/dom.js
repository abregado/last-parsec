(function (LP) {
  'use strict';

  /**
   * Create an element.
   *   el('button', { class: 'btn', type: 'button', onclick: fn }, 'Label')
   * Attributes: `class`, `text`, `on<event>` handlers, booleans (true adds the
   * attribute, false/null/undefined skips it), anything else via setAttribute.
   * Children may be nodes, strings, numbers, arrays, or null (skipped).
   */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);

    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key.startsWith('on') && typeof value === 'function') {
          node.addEventListener(key.slice(2), value);
        } else if (value === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, value);
        }
      }
    }

    append(node, children);
    return node;
  }

  function append(parent, children) {
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) {
        append(parent, child);
      } else if (child instanceof Node) {
        parent.appendChild(child);
      } else {
        parent.appendChild(document.createTextNode(String(child)));
      }
    }
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function formatDate(iso) {
    const date = new Date(iso);
    return isNaN(date) ? 'unknown' : dateFormat.format(date);
  }

  /** Save `data` as a downloaded JSON file. */
  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Ask the user to choose a file; resolves to its text, or null if cancelled. */
  function pickTextFile(accept) {
    return new Promise((resolve) => {
      const input = el('input', { type: 'file', accept: accept, class: 'visually-hidden' });
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) return resolve(null);
        file.text().then(resolve, () => resolve(null));
      });
      input.addEventListener('cancel', () => {
        input.remove();
        resolve(null);
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  /** Short-lived notice; errors stay until dismissed. */
  function notify(message, type) {
    const region = document.getElementById('notices');
    const kind = type || 'info';
    const notice = el('div', {
      class: 'notice notice-' + kind,
      role: kind === 'error' ? 'alert' : 'status'
    },
      el('span', { class: 'notice-text', text: message }),
      el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        'aria-label': 'Dismiss',
        onclick: () => notice.remove()
      }, '✕')
    );
    region.appendChild(notice);
    if (kind !== 'error') {
      setTimeout(() => notice.remove(), 4000);
    }
  }

  LP.dom = { el, clear, formatDate, downloadJson, pickTextFile };
  LP.ui.notify = notify;
})(window.LP);
