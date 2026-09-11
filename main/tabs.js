'use strict';
// Tab manager. Memory strategy:
//  - Only the active tab's WebContentsView is attached to the window.
//  - Background tabs keep their renderer for a grace period, then are
//    SUSPENDED: the renderer process is destroyed and we keep only
//    {url, title, favicon}. Clicking restores them.
//  - Restored-on-startup tabs (lazy restore) begin suspended and load on
//    first activation.
//  - Waste-category tabs are restored "parked": visible in the sidebar,
//    findable, but never loaded unless clicked — and after a restart they
//    come back parked again.
const { WebContentsView } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');

let NEXT_ID = 1;

class Tab {
  constructor(opts) {
    this.id = opts.id || String(NEXT_ID++);
    if (Number(this.id) >= NEXT_ID) NEXT_ID = Number(this.id) + 1;
    this.url = opts.url || 'neutrino://newtab/';
    this.title = opts.title || '';
    this.favicon = opts.favicon || '';
    this.category = opts.category || 'main';
    this.pinned = !!opts.pinned;
    this.parked = !!opts.parked;     // waste tab restored as dormant
    this.live = false;               // renderer exists
    this.loading = false;
    this.crashed = false;
    this.audible = false;
    this.lastActive = Date.now();
    this.view = null;
  }
}

class TabManager extends require('events').EventEmitter {
  constructor({ win, settings, paths, history }) {
    super();
    this.win = win;
    this.settings = settings;
    this.paths = paths;
    this.history = history;
    this.tabs = new Map();
    this.order = [];
    this.activeId = null;
    this.sidebarWidth = settings.get().sidebarWidth || 268;
    this.topBar = !!settings.get().topBar;
    this.uiScale = settings.get().uiScale || 1;
    this.sidebarSide = settings.get().sidebarSide === 'right' ? 'right' : 'left';
    this.savedBytes = 0;
    this.suspendTimer = setInterval(() => this._sweep(), 30000);
    this._layoutDirty = false;

    win.on('resize', () => this._scheduleLayout());
    win.on('maximize', () => this._scheduleLayout());
    win.on('unmaximize', () => this._scheduleLayout());
    win.on('closed', () => clearInterval(this.suspendTimer));
  }

  // ---- lifecycle ----------------------------------------------------------

  create(opts = {}) {
    const tab = new Tab(opts);
    this.tabs.set(tab.id, tab);
    const after = opts.afterId && this.order.includes(opts.afterId)
      ? this.order.indexOf(opts.afterId) + 1 : this.order.length;
    this.order.splice(after, 0, tab.id);
    if (opts.activate !== false) {
      this.activate(tab.id);
    } else if (opts.loadInBackground) {
      this._ensureView(tab); // caller explicitly wants it warm
      this._scheduleLayout();
    }
    this._emitTabs();
    this._saveSoon();
    return tab.id;
  }

  activate(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const prev = this.activeId !== id ? this.tabs.get(this.activeId) : null;
    this.activeId = id;
    tab.lastActive = Date.now();
    tab.parked = false; // clicking a parked waste tab wakes it (until restart)
    // Detach the outgoing view *before* attaching the new one — attaching
    // while another view is still a child can stall the compositor.
    if (prev && prev.view && prev.view !== tab.view) {
      try { this.win.contentView.removeChildView(prev.view); } catch {}
    }
    this._attach(tab);
    this._scheduleLayout();
    this._emitTabs();
    this._emitNav(tab);
    this._saveSoon();
  }

  close(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const idx = this.order.indexOf(id);
    this._destroyView(tab);
    this.tabs.delete(id);
    this.order = this.order.filter(x => x !== id);
    if (this.activeId === id) {
      const nextId = this.order[Math.min(idx, this.order.length - 1)];
      if (nextId) this.activate(nextId);
      else this.create({ category: tab.category });
    }
    this._emitTabs();
    this._saveSoon();
  }

  closeOthers(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    for (const other of [...this.tabs.values()]) {
      if (other.id !== id && other.category === tab.category) this.close(other.id);
    }
  }

  duplicate(id) {
    const t = this.tabs.get(id);
    if (!t) return;
    this.create({ url: t.url, category: t.category, afterId: id });
  }

  move({ id, category, beforeId }) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (category && this._categoryExists(category)) tab.category = category;
    this.order = this.order.filter(x => x !== id);
    let idx = this.order.length;
    if (beforeId && this.order.includes(beforeId)) idx = this.order.indexOf(beforeId);
    this.order.splice(idx, 0, id);
    this._emitTabs();
    this._saveSoon();
  }
  reorder(ids) {
    const known = ids.filter(x => this.tabs.has(x));
    const rest = this.order.filter(x => !known.includes(x));
    this.order = [...known, ...rest];
    this._saveSoon();
  }

  _categoryExists(id) {
    return this.settings.get().categories.some(c => c.id === id);
  }

  // ---- views ---------------------------------------------------------------

  _webPrefs() {
    return {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      scrollBounce: true,
    };
  }

  _ensureView(tab) {
    if (tab.view) return tab.view;
    const view = new WebContentsView({ webPreferences: this._webPrefs() });
    tab.view = view;
    tab.live = true;
    tab.crashed = false;
    const wc = view.webContents;
    wc.setAudioMuted(false);

    wc.on('did-start-loading', () => { tab.loading = true; this._emitTabs(); this._emitNav(tab); });
    wc.on('did-stop-loading', () => { tab.loading = false; this._emitTabs(); this._emitNav(tab); });
    wc.on('did-navigate', (_e, url) => {
      tab.url = url;
      if (this.history && url.startsWith('http')) this.history.record(url, tab.title);
      this._emitTabs(); this._emitNav(tab); this._saveSoon();
    });
    wc.on('did-navigate-in-page', (_e, url) => {
      tab.url = url; this._emitTabs(); this._emitNav(tab); this._saveSoon();
    });
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title; this._emitTabs(); this._emitNav(tab);
      if (this.history && tab.url.startsWith('http')) this.history.touchTitle(tab.url, title);
    });
    wc.on('page-favicon-updated', (_e, icons) => {
      tab.favicon = icons.find(u => u.startsWith('https:') || u.startsWith('data:')) || icons[0] || '';
      this._emitTabs();
    });
    wc.on('audio-state-changed', () => { tab.audible = wc.isCurrentlyAudible(); this._emitTabs(); });
    wc.on('render-process-gone', () => {
      tab.crashed = true; tab.loading = false; this._emitTabs();
    });
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
      if (isMain && code !== -3) { tab.title = tab.title || 'Could not load'; this._emitTabs(); }
    });
    if (process.env.NEUTRINO_DEBUG) {
      wc.on('console-message', (_e, level, message, line, source) => {
        console.error(`[tab-console:${level}]`, message, `@ ${source}:${line}`);
      });
    }
    // Right-click inside the page → our own context menu (mouse-only control).
    wc.on('context-menu', (_e, params) => {
      if (!this.settings.get().contextMenu) return;
      const b = this._lastBounds || { x: this.sidebarWidth + 14, y: this.topBar ? 58 : 8 };
      this.win.webContents.send('ui:ctxmenu', {
        x: b.x + params.x,
        y: b.y + params.y,
        linkURL: params.linkURL || '',
        hasSelection: !!params.selectionText,
        tabId: tab.id,
      });
    });
    wc.on('found-in-page', (_e, result) => {
      this.win.webContents.send('ui:find', { active: result.activeMatchOrdinal, total: result.matches });
    });

    wc.setWindowOpenHandler(({ url, disposition }) => {
      if (!/^https?:|^neutrino:|^file:/.test(url)) return { action: 'deny' };
      this.create({
        url,
        category: tab.category,
        activate: disposition !== 'background-tab' && disposition !== 'new-window',
        loadInBackground: disposition === 'background-tab',
      });
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      if (url.startsWith('chrome://') || url.startsWith('edge://')) e.preventDefault();
    });

    view.setBackgroundColor('#0b0e14');
    wc.setZoomFactor(this.settings.get().pageZoom || 1);
    wc.loadURL(tab.url).catch(() => {});
    this.emit('view-created', wc);
    return view;
  }

  _attach(tab) {
    const view = this._ensureView(tab);
    try { this.win.contentView.addChildView(view); } catch {}
    this._applyCosmetic(tab);
  }

  _applyCosmetic(tab) {
    const s = this.settings.get();
    if (!s.adblock.enabled || !s.adblock.cosmetic || !tab.view) return;
    let host = '';
    try { host = new URL(tab.url).hostname; } catch {}
    if (!host || host === 'newtab') return;
    const css = this._cosmeticFn ? this._cosmeticFn(host) : '';
    if (css) tab.view.webContents.insertCSS(css, { cssOrigin: 'user' }).catch(() => {});
  }
  setCosmeticProvider(fn) { this._cosmeticFn = fn; }

  _destroyView(tab) {
    if (!tab.view) return;
    try { this.win.contentView.removeChildView(tab.view); } catch {}
    try { tab.view.webContents.forcefullyCrashRenderer(); } catch {}
    try { tab.view.webContents.close(); } catch {}
    tab.view = null;
    tab.live = false;
    tab.loading = false;
    tab.audible = false;
  }

  // ---- suspension ----------------------------------------------------------

  suspend(id) {
    const tab = this.tabs.get(id);
    if (!tab || !tab.view) return false;
    if (id === this.activeId) return false;
    this.savedBytes += this._rendererBytes(tab);
    this._destroyView(tab);
    this._emitTabs();
    return true;
  }

  suspendAll() {
    let n = 0;
    for (const id of this.order) {
      if (id !== this.activeId && this.suspend(id)) n++;
    }
    return n;
  }

  _rendererBytes(tab) {
    try {
      const pid = tab.view.webContents.getOSProcessId();
      const m = require('electron').app.getAppMetrics().find(x => x.pid === pid);
      if (m) return m.memory.workingSetSize * 1024;
    } catch {}
    return 0;
  }

  _sweep() {
    const s = this.settings.get();
    if (!s.suspendAfterMin) return;
    const cutoff = Date.now() - s.suspendAfterMin * 60_000;
    let slept = 0;
    for (const tab of this.tabs.values()) {
      if (tab.id === this.activeId || !tab.view) continue;
      if (tab.audible && !s.suspendAudible) continue;
      if (tab.lastActive < cutoff) { this.suspend(tab.id); slept++; }
    }
    if (slept && this.settings.get().suspendToasts) {
      this.win.webContents.send('ui:notice', {
        kind: 'suspend', count: slept, savedMB: Math.round(this.savedBytes / 1048576),
      });
    }
  }

  // ---- navigation ----------------------------------------------------------

  activeTab() { return this.tabs.get(this.activeId) || null; }

  goto(rawUrl) {
    const tab = this.activeTab();
    if (!tab) return;
    const url = this.normalizeInput(rawUrl);
    tab.url = url;
    if (tab.view) tab.view.webContents.loadURL(url).catch(() => {});
    else { this.activate(tab.id); }
    this._emitNav(tab);
    this._emitTabs();
  }

  normalizeInput(text) {
    const t = (text || '').trim();
    if (!t) return this.settings.get().homePage || 'neutrino://newtab/';
    if (t.startsWith('neutrino://') || t.startsWith('about:')) return t;
    try {
      const u = new URL(t);
      if (u.protocol === 'file:' || u.protocol === 'http:' || u.protocol === 'https:' ||
          /^(localhost|\d+\.\d+\.\d+\.\d+|\[[0-9a-f:]+\])(:\d+)?/.test(u.hostname)) return t;
    } catch { /* not a URL */ }
    if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(t) && !t.includes(' ')) return 'https://' + t;
    const tpl = require('./settings').engineUrlFor(this.settings.get());
    return tpl.replace('%s', encodeURIComponent(t));
  }

  nav(action) {
    const tab = this.activeTab();
    if (!tab) return;
    const wc = tab.view?.webContents;
    switch (action) {
      case 'back': if (wc?.navigationHistory.canGoBack()) wc.goBack(); break;
      case 'forward': if (wc?.navigationHistory.canGoForward()) wc.goForward(); break;
      case 'reload': wc?.reload(); break;
      case 'reloadHard': wc?.reloadIgnoringCache(); break;
      case 'stop': wc?.stop(); break;
      case 'home': this.goto(this.settings.get().homePage || 'neutrino://newtab/'); break;
      case 'zoomIn': wc?.setZoomLevel(Math.min(5, (wc?.getZoomLevel() ?? 0) + 0.5)); break;
      case 'zoomOut': wc?.setZoomLevel(Math.max(-3, (wc?.getZoomLevel() ?? 0) - 0.5)); break;
      case 'zoomReset': wc?.setZoomLevel(0); break;
      case 'toggleMute':
        if (wc) { const m = !wc.isAudioMuted(); wc.setAudioMuted(m); tab.audible = m ? false : tab.audible; this._emitTabs(); }
        break;
      case 'copySelection': wc?.copy(); break;
    }
  }

  find(text, { forward = true, next = false } = {}) {
    const tab = this.activeTab();
    if (!tab?.view) return;
    const wc = tab.view.webContents;
    if (!text) { wc.stopFindInPage('clearSelection'); this.win.webContents.send('ui:find', null); return; }
    wc.findInPage(text, { forward, findNext: next, matchCase: false });
  }
  stopFind() {
    const tab = this.activeTab();
    tab?.view?.webContents.stopFindInPage('clearSelection');
    this.win.webContents.send('ui:find', null);
  }

  inspect() {
    const tab = this.activeTab();
    tab?.view?.webContents.openDevTools({ mode: 'detach' });
  }

  getSiteHost(details) {
    try {
      const wcId = details.webContentsId;
      if (wcId) {
        for (const t of this.tabs.values()) {
          if (t.view && t.view.webContents.id === wcId) {
            return new URL(t.url).hostname;
          }
        }
      }
    } catch {}
    try { return new URL(details.url).hostname; } catch { return ''; }
  }

  // ---- layout ---------------------------------------------------------------

  setSidebarWidth(w) {
    this.sidebarWidth = Math.max(190, Math.min(460, w));
    this._scheduleLayout();
  }

  setTopBar(on) {
    this.topBar = !!on;
    this._scheduleLayout();
  }

  setUiScale(z) {
    this.uiScale = Math.max(0.8, Math.min(1.4, z || 1));
    this._scheduleLayout();
  }

  setSidebarSide(side) {
    this.sidebarSide = side === 'right' ? 'right' : 'left';
    this._scheduleLayout();
  }

  setPageZoom(f) {
    const zoom = Math.max(0.3, Math.min(3, f || 1));
    for (const t of this.tabs.values()) {
      try { t.view?.webContents.setZoomFactor(zoom); } catch {}
    }
  }

  setRightInset(w) {
    this.rightInset = Math.max(0, w | 0);
    this._scheduleLayout();
  }

  _scheduleLayout() {
    if (this._layoutDirty) return;
    this._layoutDirty = true;
    setImmediate(() => {
      this._layoutDirty = false;
      this._layout();
    });
  }

  _layout() {
    const tab = this.activeTab();
    if (!tab?.view) return;
    const [w, h] = this.win.getContentSize();
    // geometry mirrors the chrome UI: 8px outer frame; the rail (scaled) and
    // its 14px gap sit on whichever side Settings puts them; the settings
    // drawer claims overlay space on the opposite side of the page view.
    const eff = Math.round(this.sidebarWidth);
    const overlay = 8 + (this.rightInset || 0);
    let x, width;
    if (this.sidebarSide === 'right') {
      x = overlay;                                   // page view starts at the left edge
      width = Math.max(0, w - x - eff - 14);         // rail + gap on the right
    } else {
      x = Math.round(eff + 14);
      width = Math.max(0, w - x - overlay);
    }
    const y = this.topBar ? 8 + Math.round(50 * this.uiScale) : 8;
    const bounds = { x, y, width, height: Math.max(0, h - y - 8) };
    this._lastBounds = bounds;
    try {
      tab.view.setBounds(bounds);
    } catch {}
  }

  // ---- state sync ------------------------------------------------------------

  _emitTabs() {
    if (this._tabsDirty) return;
    this._tabsDirty = true;
    setTimeout(() => {
      this._tabsDirty = false;
      const payload = this.snapshot();
      if (!this.win.isDestroyed()) this.win.webContents.send('ui:tabs', payload);
    }, 60);
  }

  _emitNav(tab) {
    if (!tab || this.win.isDestroyed()) return;
    let canBack = false, canFwd = false;
    if (tab.view) { const nh = tab.view.webContents.navigationHistory; canBack = nh.canGoBack(); canFwd = nh.canGoForward(); }
    this.win.webContents.send('ui:nav', {
      activeId: this.activeId,
      id: tab.id,
      url: tab.url,
      title: tab.title,
      loading: tab.loading,
      canBack, canFwd,
      favicon: tab.favicon,
      secure: /^https:/i.test(tab.url),
      isNtp: tab.url.startsWith('neutrino://newtab'),
    });
  }

  snapshot() {
    return {
      activeId: this.activeId,
      order: [...this.order],
      tabs: [...this.tabs.values()].map(t => ({
        id: t.id, url: t.url, title: t.title, favicon: t.favicon, category: t.category,
        live: t.live, loading: t.loading, crashed: t.crashed, audible: t.audible,
        parked: t.parked,
      })),
    };
  }

  // ---- session persistence ----------------------------------------------------

  _saveSoon() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => { this._saveTimer = null; this.saveSession(); }, 2000);
  }

  saveSession() {
    const data = {
      v: 1,
      activeId: this.activeId,
      order: this.order,
      tabs: [...this.tabs.values()].map(t => ({
        id: t.id, url: t.url, title: t.title, favicon: t.favicon,
        category: t.category, parked: t.parked || (!t.live && !this.settings.get().lazyRestore),
      })),
    };
    try { fs.writeFileSync(this.paths.sessionFile, JSON.stringify(data, null, 1)); } catch {}
  }

  restore() {
    const s = this.settings.get();
    if (!s.restoreSession) { this.create({ category: s.defaultCategory }); return; }
    let data = null;
    try { data = JSON.parse(fs.readFileSync(this.paths.sessionFile, 'utf8')); } catch {}
    if (!data?.tabs?.length) { this.create({ category: s.defaultCategory }); return; }

    const allow = new Set(
      Array.isArray(s.restoreCategories) ? s.restoreCategories : s.categories.map(c => c.id),
    );
    let firstVisible = null;
    for (const t of data.tabs) {
      if (!this._categoryExists(t.category)) t.category = s.defaultCategory;
      const isWaste = s.categories.find(c => c.id === t.category)?.waste;
      if (isWaste) t.parked = true;                 // waste never auto-loads, ever
      else if (!allow.has(t.category)) t.parked = true;
      const tab = new Tab({ ...t });
      this.tabs.set(tab.id, tab);
      if (!isWaste && !t.parked && !firstVisible) firstVisible = tab.id;
      if (tab.id === data.activeId && !isWaste && !t.parked) firstVisible = tab.id;
    }
    if (Array.isArray(data.order)) {
      const valid = data.order.filter(id => this.tabs.has(id));
      this.order = valid.length ? valid : [...this.tabs.keys()];
      for (const id of this.tabs.keys()) if (!this.order.includes(id)) this.order.push(id);
    } else {
      this.order = [...this.tabs.keys()];
    }
    this.activeId = null;
    if (firstVisible) this.activate(firstVisible);
    else this.create({ category: s.defaultCategory });
  }

  clearParked() {
    for (const [id, t] of [...this.tabs]) if (t.parked && id !== this.activeId) {
      this._destroyView(t); this.tabs.delete(id); this.order = this.order.filter(x => x !== id);
    }
    this._emitTabs(); this._saveSoon();
  }
}

class HistoryStore {
  constructor(file, max = 3000) {
    this.file = file;
    this.max = max;
    this.items = [];
    try { this.items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  }
  record(url, title) {
    const last = this.items[0];
    if (last && last.u === url) return;
    this.items.unshift({ u: url, t: title || '', ts: Date.now() });
    if (this.items.length > this.max) this.items.length = this.max;
    this._save();
  }
  touchTitle(url, title) {
    const hit = this.items.find(x => x.u === url);
    if (hit) { hit.t = title; this._save(); }
  }
  search(q, limit = 12) {
    q = q.toLowerCase();
    if (!q) return this.items.slice(0, limit);
    const scored = [];
    for (const it of this.items) {
      const hay = (it.t + ' ' + it.u).toLowerCase();
      let score = 0;
      if (hay.includes(q)) score = 100 - hay.indexOf(q) * 0.1;
      else {
        let i = 0;
        for (const ch of hay) if (ch === q[i]) i++;
        if (i === q.length) score = 40;
      }
      if (score) scored.push({ ...it, score });
    }
    scored.sort((a, b) => b.score - b.ts / 1e12 - (a.score - a.ts / 1e12));
    return scored.slice(0, limit);
  }
  clear() { this.items = []; this._save(); }
  _save() {
    clearTimeout(this._t);
    this._t = setTimeout(() => {
      try { fs.writeFileSync(this.file, JSON.stringify(this.items)); } catch {}
    }, 500);
  }
}

module.exports = { TabManager, HistoryStore };
