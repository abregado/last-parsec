// Global namespace. Every script attaches its module here, because the app
// must also run from file://, where ES modules are blocked.
window.LP = window.LP || {
  ui: {},
  views: {},
  tabs: {}
};
