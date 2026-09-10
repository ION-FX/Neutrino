'use strict';
const fs = require('fs');

// Loaded synchronously at require-time so main.js can apply process-level
// switches (renderer caps) before app 'ready'. Saved with a debounce.

const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google:     { name: 'Google',     url: 'https://www.google.com/search?q=%s' },
  bing:       { name: 'Bing',       url: 'https://www.bing.com/search?q=%s' },
  brave:      { name: 'Brave',      url: 'https://search.brave.com/search?q=%s' },
  startpage:  { name: 'Startpage',  url: 'https://www.startpage.com/sp/search?query=%s' },
  ecosia:     { name: 'Ecosia',     url: 'https://www.ecosia.org/search?q=%s' },
  custom:     { name: 'Custom…',    url: '' },
};

const DEFAULTS = {
  theme: 'liquid',            // 'liquid' | 'galaxy'
  accent: '#7aa2ff',
  tabLabels: true,            // false = icon-only tabs
  topBar: true,               // omnibox + nav buttons in a bar above the page
  sidebarWidth: 268,
  compact: false,
  reduceMotion: false,
  contextMenu: true,          // right-click menu on pages
  uiScale: 1,                 // chrome UI zoom (0.9 – 1.25)
  pageZoom: 1,                // default zoom factor for web pages
  ntpShowClock: true,         // clock + greeting on the new-tab page
  suspendToasts: true,        // toast when background tabs are put to sleep

  downloads: { askWhere: false },            // ask where to save each file
  clearOnExit: { cache: false, cookies: false, history: false },

  suspendAfterMin: 10,        // 0 = never auto-suspend background tabs
  suspendAudible: false,      // if true, even audible tabs may sleep
  lazyRestore: true,          // restored tabs load on first click
  processCap: 0,              // >0 caps renderer process count (restart)

  restoreSession: true,
  restoreCategories: null,    // null = everything except waste

  searchEngine: 'duckduckgo',
  customEngine: '',

  adblock: {
    enabled: true,
    cosmetic: true,
    strictTracking: true,     // strip cookies/referrer on third-party requests
    lists: [
      { id: 'core', name: 'Neutrino Core (bundled)', url: '', enabled: true, builtin: true },
    ],
  },

  categories: [
    { id: 'main',     name: 'Main',     color: '#7aa2ff' },
    { id: 'work',     name: 'Work',     color: '#4fd1a5' },
    { id: 'research', name: 'Research', color: '#e8b45a' },
    { id: 'waste',    name: 'Waste',    color: '#8b93a5', waste: true },
  ],
  defaultCategory: 'main',
  collapsedCategories: [],

  homePage: 'neutrino://newtab/',
  quickLinks: [
    { title: 'YouTube',   url: 'https://www.youtube.com' },
    { title: 'GitHub',    url: 'https://github.com' },
    { title: 'Wikipedia', url: 'https://wikipedia.org' },
    { title: 'Hacker News', url: 'https://news.ycombinator.com' },
  ],

  // Power users / AI: local MCP (Model Context Protocol) server so agents can
  // drive the browser. Bound to 127.0.0.1 only, guarded by a bearer token.
  mcp: {
    enabled: false,
    readOnly: false,          // expose only read tools (no opening/closing)
    port: 47629,
    token: '',                // generated on first enable
  },
};

function load(file) {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  const merged = { ...DEFAULTS, ...stored };
  merged.adblock = { ...DEFAULTS.adblock, ...(stored.adblock || {}) };
  merged.adblock.lists = Array.isArray(stored.adblock?.lists) && stored.adblock.lists.length
    ? stored.adblock.lists
    : DEFAULTS.adblock.lists;
  merged.mcp = { ...DEFAULTS.mcp, ...(stored.mcp || {}) };
  merged.downloads = { ...DEFAULTS.downloads, ...(stored.downloads || {}) };
  merged.clearOnExit = { ...DEFAULTS.clearOnExit, ...(stored.clearOnExit || {}) };
  if (!Array.isArray(stored.categories) || !stored.categories.length) {
    merged.categories = DEFAULTS.categories;
  }
  if (!merged.categories.some(c => c.waste)) merged.categories.push(DEFAULTS.categories[3]);
  return merged;
}

class SettingsStore {
  constructor(file) {
    this.file = file;
    this.state = load(file);
    this._timer = null;
    this._listeners = new Set();
  }
  get() { return this.state; }
  set(patch) {
    // shallow merge with nested handling for grouped settings
    const next = { ...this.state, ...patch };
    if (patch.adblock) next.adblock = { ...this.state.adblock, ...patch.adblock };
    if (patch.mcp) next.mcp = { ...this.state.mcp, ...patch.mcp };
    if (patch.downloads) next.downloads = { ...this.state.downloads, ...patch.downloads };
    if (patch.clearOnExit) next.clearOnExit = { ...this.state.clearOnExit, ...patch.clearOnExit };
    this.state = next;
    this._save();
    for (const fn of this._listeners) { try { fn(this.state); } catch {} }
  }
  onChange(fn) { this._listeners.add(fn); }
  _save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      try { fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2)); } catch {}
    }, 250);
  }
  flush() {
    clearTimeout(this._timer);
    try { fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2)); } catch {}
  }
}

function engineUrlFor(settings) {
  if (settings.searchEngine === 'custom' && settings.customEngine) {
    return settings.customEngine.includes('%s')
      ? settings.customEngine : settings.customEngine + '?q=%s';
  }
  return (SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.duckduckgo).url;
}

module.exports = { SettingsStore, SEARCH_ENGINES, engineUrlFor };
