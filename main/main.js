'use strict';
const { app, BrowserWindow, protocol, net, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// -- early init (before app.ready) -------------------------------------------
protocol.registerSchemesAsPrivileged([
  { scheme: 'neutrino', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

const paths = require('./paths').init();
const { SettingsStore, engineUrlFor } = require('./settings');
const settings = new SettingsStore(paths.settingsFile);

// process-level memory switches must happen before ready
if (settings.get().processCap > 0) {
  app.commandLine.appendSwitch('renderer-process-limit', String(settings.get().processCap));
}
// Strict tracking protection via Chromium's own third-party cookie phase-out
// (onBeforeSendHeaders rewriting deadlocks Electron 44 — see adblock.js).
if (settings.get().adblock.strictTracking) {
  app.commandLine.appendSwitch('test-third-party-cookie-phaseout');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let win = null;
let tabs = null;
let history = null;
let engine = null;
let ext = null;
let updater = null;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.txt': 'text/plain', '.md': 'text/markdown',
};

function serveFile(filePath, res) {
  try {
    const data = fs.readFileSync(filePath);
    res(new Response(data, {
      headers: { 'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                 'cache-control': 'no-cache' },
    }));
  } catch {
    res(new Response('Not found', { status: 404 }));
  }
}

// neutrino://newtab/            -> ui/ntp/index.html (with injected data)
// neutrino://chrome/<relpath>   -> ui/<relpath>
// Standard scheme: host carries the first segment ("newtab" / "chrome").
function registerNeutrinoProtocol() {
  protocol.handle('neutrino', (request) => {
    if (process.env.NEUTRINO_DEBUG) console.error('[protocol]', request.url);
    return new Promise((res) => {
      let u;
      try { u = new URL(request.url); } catch { return serveFile('/dev/null', res); }
      const host = (u.host || '').toLowerCase();
      const p = decodeURIComponent(u.pathname).replace(/^\/+/, '');

      if (host === 'newtab' || p === 'newtab' || p.startsWith('newtab/index.html')) {
        // The NTP and its assets must share one origin so the page's
        // CSP `script-src/style-src 'self'` actually admits them.
        if (p && !p.startsWith('newtab')) {
          const rel = p.replace(/\.\./g, '');
          return serveFile(path.join(paths.uiRoot, rel), res);
        }
        const htmlPath = path.join(paths.uiRoot, 'ntp', 'index.html');
        try {
          let html = fs.readFileSync(htmlPath, 'utf8');
          const s = settings.get();
          const engineUrl = engineUrlFor(s);
          const data = {
            theme: s.theme, accent: s.accent, reduceMotion: s.reduceMotion,
            engineUrl, quickLinks: s.quickLinks, showClock: s.ntpShowClock !== false,
          };
          html = html.replace('__NTP_DATA__', JSON.stringify(data).replace(/</g, '\\u003c'));
          res(new Response(html, { headers: { 'content-type': 'text/html', 'cache-control': 'no-cache' } }));
        } catch (e) {
          res(new Response(`Neutrino new-tab error: ${e}`, { status: 500 }));
        }
        return;
      }

      if (host === 'chrome') {
        const rel = p.replace(/\.\./g, '');
        serveFile(path.join(paths.uiRoot, rel), res);
        return;
      }
      res(new Response('Not found', { status: 404 }));
    });
  });
}

// ---- adblock controller ------------------------------------------------------

function makeAdblockController({ session, notify }) {
  const { FilterEngine, attachBlocker } = require('./adblock');
  engine = new FilterEngine();

  const cachePathFor = (list) => {
    const h = require('crypto').createHash('sha1').update(list.url).digest('hex').slice(0, 12);
    return path.join(paths.filtersCache, `${list.id}-${h}.txt`);
  };

  async function loadList(list) {
    if (list.builtin || !list.url) {
      engine.parse(fs.readFileSync(path.join(paths.bundledFilters, 'core.txt'), 'utf8'));
      list.updatedAt = Date.now();
      return { name: list.name, ok: true };
    }
    try {
      const resp = await net.fetch(list.url, { redirect: 'follow' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      fs.writeFileSync(cachePathFor(list), text);
      engine.parse(text);
      list.updatedAt = Date.now();
      return { name: list.name, ok: true, rules: engine.stats.rules };
    } catch (err) {
      // fall back to cache if a remote list can't be fetched
      try {
        const text = fs.readFileSync(cachePathFor(list), 'utf8');
        engine.parse(text);
        return { name: list.name, ok: true, cached: true };
      } catch {}
      return { name: list.name, ok: false, error: String(err.message || err) };
    }
  }

  async function init() {
    const lists = settings.get().adblock.lists.filter(l => l.enabled);
    for (const l of lists) await loadList(l);
    attachBlocker({
      session, engine, settings,
      getSiteHost: (details) => tabs ? tabs.getSiteHost(details) : '',
      onStats: (stats) => { if (win && !win.isDestroyed()) win.webContents.send('ui:adblock', { ...stats }); },
    });
  }

  async function rebuild() {
    engine = new FilterEngine();
    await init();
    tabs.setCosmeticProvider((host) => engine.cosmeticCSS(host));
  }

  return {
    init,
    updateAll: async () => {
      const results = [];
      for (const l of settings.get().adblock.lists) results.push(await loadList(l));
      await rebuild();
      notify(`Filters updated — ${engine.stats.rules.toLocaleString()} rules active`);
      return results;
    },
    setListEnabled: (id, enabled) => {
      const s = settings.get();
      const list = s.adblock.lists.find(l => l.id === id);
      if (list) { list.enabled = !!enabled; settings.set({ adblock: { lists: s.adblock.lists } }); }
      rebuild();
      return true;
    },
    addList: (name, url) => {
      const s = settings.get();
      const id = 'l' + Date.now().toString(36);
      s.adblock.lists.push({ id, name: name || url, url, enabled: true });
      settings.set({ adblock: { lists: s.adblock.lists } });
      rebuild();
      return id;
    },
    removeList: (id) => {
      const s = settings.get();
      s.adblock.lists = s.adblock.lists.filter(l => l.id !== id || l.builtin);
      settings.set({ adblock: { lists: s.adblock.lists } });
      rebuild();
      return true;
    },
  };
}

// ---- window -------------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 940,
    minHeight: 560,
    frame: false,
    show: false,
    backgroundColor: '#0a0d14',
    title: 'Neutrino',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(paths.uiRoot, 'index.html'));
  win.once('ready-to-show', () => win.show());
  if (process.env.NEUTRINO_DEBUG) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.error(`[ui-console:${level}]`, message, `@ ${source}:${line}`);
    });
  }
  return win;
}

// ---- keyboard accelerators (no app menu = no default accelerators) -----------

const SHORTCUTS = {
  't+ctrl': () => tabs.create({}),
  'w+ctrl': () => tabs.close(tabs.activeId),
  't+ctrl+shift': () => tabs.duplicate(tabs.activeId),
  'l+ctrl': () => win.webContents.send('ui:omniboxFocus'),
  'k+ctrl': () => win.webContents.send('ui:omniboxFocus', { selectAll: true, palette: true }),
  'f+ctrl': () => win.webContents.send('ui:omniboxFocus', { find: true }),
  ',+ctrl': () => win.webContents.send('ui:openSettings'),
  'tab+ctrl': () => cycleTab(1),
  'tab+ctrl+shift': () => cycleTab(-1),
  'down+alt': () => cycleTab(1),
  'up+alt': () => cycleTab(-1),
  'r+ctrl': () => tabs.nav('reload'),
  'r+ctrl+shift': () => tabs.nav('reloadHard'),
  '0+ctrl': () => tabs.nav('zoomReset'),
  '=+ctrl': () => tabs.nav('zoomIn'),
  '+ctrl': () => tabs.nav('zoomIn'),
  '-+ctrl': () => tabs.nav('zoomOut'),
  'm+ctrl': () => tabs.nav('toggleMute'),
  'F1': () => win.webContents.send('ui:openShortcuts'),
  'F12': () => tabs.inspect(),
  'i+ctrl+shift': () => tabs.inspect(),
  'j+ctrl': () => win.webContents.send('ui:openPalette'),
  'd+ctrl+shift': () => { const s = settings.get(); settings.set({ theme: s.theme === 'galaxy' ? 'liquid' : 'galaxy' }); win.webContents.send('ui:themeChanged', settings.get().theme); },
};

function cycleTab(dir) {
  const idx = tabs.order.indexOf(tabs.activeId);
  const n = tabs.order.length;
  if (!n) return;
  const next = tabs.order[(idx + dir + n) % n];
  tabs.activate(next);
}

function installAccelerators() {
  const handler = (e, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key;
    const mod = (input.control ? '+ctrl' : '') + (input.shift ? '+shift' : '') + (input.alt ? '+alt' : '');
    let fn = SHORTCUTS[combo0(key, mod)];
    if (!fn && input.control && /^[1-9]$/.test(key)) {
      const idx = Number(key) - 1;
      fn = () => { const id = tabs.order[idx]; if (id) tabs.activate(id); };
    }
    if (fn) { e.preventDefault(); fn(); }
  };
  win.webContents.on('before-input-event', handler);
  // focus may be inside a page view; accelerator handler there too
  tabs.on('view-created', (wc) => wc.on('before-input-event', handler));
}

// keyboard layouts report Ctrl+plus as '=' with shift — accept all spellings
function combo0(key, mod) {
  return SHORTCUTS[key + mod] ? key + mod : null;
}

// ---- screenshot composition for headless testing ------------------------------

async function composeScreenshot(outPath) {
  const uiImg = await win.webContents.capturePage();
  const tab = tabs.activeTab();
  if (!tab?.view) { fs.writeFileSync(outPath, uiImg.toPNG()); return; }
  const viewImg = await tab.view.webContents.capturePage();
  const ws = uiImg.getSize(), vs = viewImg.getSize();
  const b = tabs._lastBounds || { x: Math.round(tabs.sidebarWidth + 14), y: tabs.topBar ? 58 : 8, width: 0, height: 0 };
  if (vs.width === 0 || vs.height === 0) { fs.writeFileSync(outPath, uiImg.toPNG()); return; }
  const scale = Math.min(b.width / vs.width, b.height / vs.height, 1);
  const vw = Math.round(vs.width * scale), vh = Math.round(vs.height * scale);
  const x = b.x, y = b.y;
  const uiBuf = uiImg.toBitmap(); // BGRA
  const vBuf = viewImg.toBitmap();
  const out = Buffer.from(uiBuf);
  for (let yy = 0; yy < vh && y + yy < ws.height; yy++) {
    const srcRow = Math.round(yy / scale) * vs.width;
    const dstRow = (y + yy) * ws.width + x;
    for (let xx = 0; xx < vw && x + xx < ws.width; xx++) {
      const src = (srcRow + Math.round(xx / scale)) * 4;
      const dst = (dstRow + xx) * 4;
      out[dst] = vBuf[src]; out[dst + 1] = vBuf[src + 1];
      out[dst + 2] = vBuf[src + 2]; out[dst + 3] = 255;
    }
  }
  fs.writeFileSync(outPath, nativeImage.createFromBitmap(out, { width: ws.width, height: ws.height }).toPNG());
}

async function runTestHooks() {
  const shoot = process.env.NEUTRINO_SHOOT;
  const scenario = process.env.NEUTRINO_SCENARIO;
  if (scenario === 'update-test') {
    await new Promise(r => setTimeout(r, 3000));
    const st = await updater.check();
    console.log('UPDATE_CHECK', JSON.stringify(st));
    if (st.updateAvailable) {
      console.log('UPDATE_APPLYING v' + st.latest);
      await updater.apply();   // swaps dirs, relaunches, exits
    } else {
      console.log('NO_UPDATE');
      app.exit(0);
    }
    return;
  }
  if (scenario === 'settings') {
    await new Promise(r => setTimeout(r, 2500));
    win.webContents.send('ui:openSettings', process.env.NEUTRINO_SETTINGS_SECTION || 'developer');
    await new Promise(r => setTimeout(r, 1500));
    if (process.env.NEUTRINO_SETTINGS_OPEN_DOC) {
      win.webContents.executeJavaScript("document.querySelector('.mcp-doc')?.setAttribute('open',''); true", false).catch(() => {});
      await new Promise(r => setTimeout(r, 400));
    }
    if (process.env.NEUTRINO_SETTINGS_SCROLL) {
      win.webContents.executeJavaScript(
        "document.getElementById('settings-body').scrollTop = 999999; true", false).catch(() => {});
      await new Promise(r => setTimeout(r, 400));
    }
    const img = await win.webContents.capturePage();
    fs.writeFileSync(process.env.NEUTRINO_SETTINGS_SHOT || '/tmp/settings.png', img.toPNG());
    app.exit(0);
    return;
  }
  if (scenario === 'write') {
    await new Promise(r => setTimeout(r, 2500));
    const main = tabs.create({ url: 'https://example.com', category: 'main', activate: false });
    const work = tabs.create({ url: 'https://www.wikipedia.org', category: 'work', activate: false });
    const waste = tabs.create({ url: 'https://github.com', category: 'waste', activate: false });
    tabs.move({ id: waste, category: 'waste' });
    tabs.activate(waste); // make the waste tab the active one before saving
    await new Promise(r => setTimeout(r, 3500));
    tabs.saveSession();
    settings.flush();
    console.log('SCENARIO_WRITE_DONE', JSON.stringify({ main, work, waste }));
    app.exit(0);
    return;
  }
  if (scenario === 'read') {
    await new Promise(r => setTimeout(r, 2500));
    const snap = tabs.snapshot();
    const out = snap.tabs.map(t => ({ id: t.id, cat: t.category, parked: t.parked, live: t.live, url: t.url }));
    const active = snap.tabs.find(t => t.id === snap.activeId);
    const slept = tabs.suspendAll();
    console.log('SCENARIO_READ', JSON.stringify({
      tabs: out,
      activeId: snap.activeId,
      activeLive: active ? active.live : null,
      suspendAllCount: slept,
    }, null, 1));
    app.exit(0);
    return;
  }
  if (!shoot) return;
  const theme = process.env.NEUTRINO_TEST_THEME || 'liquid';
  settings.set({ theme });
  const webUrl = process.env.NEUTRINO_TEST_URL || 'https://example.com';
  await new Promise(r => setTimeout(r, 3800));
  try { await composeScreenshot(shoot.replace('.png', `-${theme}.png`)); } catch (e) { console.error('shoot1', e); }
  try {
    tabs.goto(webUrl);
    await new Promise(r => setTimeout(r, 4500));
    await composeScreenshot(shoot.replace('.png', `-${theme}-web.png`));
  } catch (e) { console.error('shoot2', e); }
  app.exit(0);
}

// ---- boot ----------------------------------------------------------------------

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerNeutrinoProtocol();

  const { TabManager, HistoryStore } = require('./tabs');
  history = new HistoryStore(paths.historyFile);
  win = createWindow();
  tabs = new TabManager({ win, settings, paths, history });

  const notify = (msg) => { if (!win.isDestroyed()) win.webContents.send('ui:notice', { kind: 'toast', msg }); };
  const adblockCtl = makeAdblockController({ session: win.webContents.session, notify });
  if (!process.env.NEUTRINO_NO_BLOCKER) {
    await adblockCtl.init();
    tabs.setCosmeticProvider((host) => engine.cosmeticCSS(host));
  }

  const { ExtensionManager } = require('./extensions');
  ext = new ExtensionManager({
    session: win.webContents.session, paths,
    tabCreate: (p) => tabs.create(p),
  });
  ext.loadAll().then(list => {
    const good = list.filter(x => !x.error).length;
    if (good) notify(`${good} extension${good > 1 ? 's' : ''} loaded`);
  });

  // Built-in MCP server for AI agents (Settings → Developer).
  const { MCPServer } = require('./mcp');
  const mcp = new MCPServer({ settings, tabs, history, engine, notify });
  if (settings.get().mcp.enabled) mcp.apply();

  // Self-updater via GitHub releases (Settings → Updates).
  const { Updater } = require('./updater');
  updater = new Updater({ settings, notify });
  const autoCheck = setTimeout(async () => {
    const u = settings.get().updates || {};
    if (!u.autoCheck) return;
    if (Date.now() - (u.lastCheck || 0) < 20 * 3600 * 1000) return;
    await updater.check();
    if (win && !win.isDestroyed()) win.webContents.send('ui:update', updater.status());
  }, 45000);
  autoCheck.unref?.();

  const { wire } = require('./ipc');
  wire({ win, tabs, settings, paths, engine, adblockCtl, ext, history, mcp, updater });

  // Mouse-only navigation: back/forward thumb buttons (XButton1/2).
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') tabs.nav('back');
    else if (cmd === 'browser-forward') tabs.nav('forward');
  });

  tabs.restore();
  installAccelerators();

  // downloads: auto-save to ~/Downloads, or let the user pick each time
  win.webContents.session.on('will-download', (_e, item) => {
    if (!settings.get().downloads.askWhere) {
      item.setSavePath(path.join(app.getPath('downloads'), item.getFilename()));
    }
    item.once('done', (_e2, state) => {
      if (!win.isDestroyed()) win.webContents.send('ui:notice',
        { kind: 'download', msg: state === 'completed' ? `Saved ${item.getFilename()}` : `Download ${state}`, path: item.getSavePath() });
    });
  });

  setInterval(() => {
    if (win.isDestroyed()) return;
    let total = 0;
    try { for (const m of app.getAppMetrics()) total += m.memory.workingSetSize; } catch {}
    const snap = tabs.snapshot();
    win.webContents.send('ui:mem', {
      totalMB: Math.round(total / 1024),
      live: snap.tabs.filter(t => t.live).length,
      asleep: snap.tabs.filter(t => !t.live && !t.parked).length,
      parked: snap.tabs.filter(t => t.parked).length,
      savedMB: Math.round(tabs.savedBytes / 1048576),
    });
  }, 5000);

  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      const url = argv.find(a => /^https?:\/\//.test(a));
      if (url) tabs.create({ url });
    }
  });

  app.on('before-quit', () => {
    tabs.saveSession();
    settings.flush();
    history._save();
  });

  // optional privacy scrub on the way out
  let exitScrubbed = false;
  app.on('will-quit', (e) => {
    const c = settings.get().clearOnExit;
    if (exitScrubbed || (!c.cache && !c.cookies && !c.history)) return;
    e.preventDefault();
    exitScrubbed = true;
    const ses = require('electron').session.defaultSession;
    const jobs = [];
    if (c.cache) jobs.push(ses.clearCache());
    if (c.cookies) jobs.push(ses.clearStorageData({ storages: ['cookies'] }));
    if (c.history) { history.clear(); }
    Promise.all(jobs).catch(() => {}).finally(() => app.quit());
  });

  win.on('closed', () => { win = null; });
  runTestHooks();
});

app.on('window-all-closed', () => app.quit());
