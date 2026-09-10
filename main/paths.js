'use strict';
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Everything Neutrino writes lives under ~/.neutrino — settings, session,
// filter caches, extensions, history. Set as early as possible in main.js.
function init() {
  const data = path.join(app.getPath('home'), '.neutrino');
  app.setPath('userData', data); // Chromium profile, caches, cookies, local storage
  app.setPath('sessionData', path.join(data, 'chromium-session'));
  const dirs = {
    data,
    filtersCache: path.join(data, 'filters', 'cache'),
    extensions: path.join(data, 'extensions'),
    uiRoot: path.join(__dirname, '..', 'ui'),
    bundledFilters: path.join(__dirname, '..', 'filters'),
  };
  for (const d of [dirs.data, dirs.filtersCache, dirs.extensions]) {
    fs.mkdirSync(d, { recursive: true });
  }
  dirs.sessionFile = path.join(dirs.data, 'session.json');
  dirs.historyFile = path.join(dirs.data, 'history.json');
  dirs.settingsFile = path.join(dirs.data, 'settings.json');
  return dirs;
}

module.exports = { init };
