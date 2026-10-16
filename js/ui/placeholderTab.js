(function (LP) {
  'use strict';

  const { el } = LP.dom;

  /** Builds a tab renderer that shows a "coming soon" panel. */
  function placeholder(title, description) {
    return function render(container) {
      container.appendChild(el('section', { class: 'placeholder' },
        el('span', { class: 'badge', text: 'Coming soon' }),
        el('h2', { text: title }),
        el('p', { text: description })
      ));
    };
  }

  LP.tabs.models = placeholder(
    'Models',
    'Add models from your collection and match them to the Roving Threats, Hired Muscle, Criminal Elements and Interested Parties entries.'
  );
  LP.tabs.turn = placeholder(
    'Campaign turn',
    'Generate the events for a campaign turn.'
  );
  LP.tabs.battle = placeholder(
    'Battle',
    'Generate a battle: enemies, deployment conditions, notable sights and more.'
  );
})(window.LP);
