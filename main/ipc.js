'use strict';
// Every IPC channel Neutrino uses. The preload allowlists these exact names,
// so nothing else crosses the context bridge.
const { ipcMain, shell, app, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { SEARCH_ENGINES, engineUrlFor } = require('./settings');
const { INVOKE_CHANNELS } = require('./ipc-channels');

function wire({ win, tabs, settings, paths, engine, adblockCtl, ext, history, mcp, updater }) {
  const ok = (fn) => (_e, payload) => fn(payload);

  ipcMain.handle('win:minimize', () => win.minimize());
  ipcMain.handle('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.handle('win:toggleMax', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.handle('win:close', () => win.close());
  ipcMain.handle('win:isMaximized', () => win.isMaximized());
  win.on('maximize', () => win.webContents.send('ui:maximized', true));
  win.on('unmaximize', () => win.webContents.send('ui:maximized', false));

  ipcMain.handle('tabs:create', ok((p = {}) => tabs.create(p)));
  ipcMain.handle('tabs:activate', ok(({ id }) => tabs.activate(id)));
  ipcMain.handle('tabs:close', ok(({ id }) => tabs.close(id)));
  ipcMain.handle('tabs:closeOthers', ok(({ id }) => tabs.closeOthers(id)));
  ipcMain.handle('tabs:duplicate', ok(({ id }) => tabs.duplicate(id)));
  ipcMain.handle('tabs:move', ok((p) => tabs.move(p)));
  ipcMain.handle('tabs:reorder', ok(({ ids }) => tabs.reorder(ids)));
  ipcMain.handle('tabs:suspend', ok(({ id }) => tabs.suspend(id)));
  ipcMain.handle('tabs:suspendAll', () => tabs.suspendAll());
  ipcMain.handle('tabs:clearParked', () => tabs.clearParked());

  ipcMain.handle('nav:goto', ok(({ url }) => tabs.goto(url)));
  ipcMain.handle('nav:action', ok(({ action }) => tabs.nav(action)));
  ipcMain.handle('nav:normalize', ok(({ text }) => tabs.normalizeInput(text)));

  ipcMain.handle('find:query', ok(({ text, forward, next }) => tabs.find(text, { forward, next })));
  ipcMain.handle('find:stop', () => tabs.stopFind());

  ipcMain.handle('settings:get', () => settings.get());
  ipcMain.handle('settings:engines', () => ({ engines: SEARCH_ENGINES, current: engineUrlFor(settings.get()) }));
  ipcMain.handle('settings:set', ok((patch) => {
    const prevWidth = settings.get().sidebarWidth;
    settings.set(patch);
    const s = settings.get();
    if (patch.sidebarWidth && patch.sidebarWidth !== prevWidth) tabs.setSidebarWidth(patch.sidebarWidth);
    if (patch.pageZoom !== undefined) tabs.setPageZoom(patch.pageZoom);
    if (patch.categories) {
      // keep tabs valid when categories disappear
      const ids = new Set(s.categories.map(c => c.id));
      for (const t of tabs.tabs.values()) if (!ids.has(t.category)) t.category = s.defaultCategory;
      tabs._emitTabs();
    }
    return s;
  }));

  ipcMain.handle('adblock:stats', () => engine.stats);
  ipcMain.handle('adblock:updateAll', () => adblockCtl.updateAll());
  ipcMain.handle('adblock:list', () => settings.get().adblock.lists);
  ipcMain.handle('adblock:setList', ok(({ id, enabled }) => adblockCtl.setListEnabled(id, enabled)));
  ipcMain.handle('adblock:addList', ok(({ name, url }) => adblockCtl.addList(name, url)));
  ipcMain.handle('adblock:removeList', ok(({ id }) => adblockCtl.removeList(id)));

  ipcMain.handle('ext:list', () => ext.list());
  ipcMain.handle('ext:reload', ok(({ id }) => ext.reload(id)));
  ipcMain.handle('ext:openOptions', ok(({ id }) => ext.openOptions(id)));
  ipcMain.handle('ext:openFolder', () => ext.openFolder());

  ipcMain.handle('palette:search', ok(({ q }) => {
    const snap = tabs.snapshot();
    const tabsOut = snap.tabs
      .filter(t => (t.title + ' ' + t.url).toLowerCase().includes(q.toLowerCase()))
      .slice(0, 8)
      .map(t => ({ kind: t.parked ? 'parked' : 'tab', id: t.id, title: t.title || t.url, sub: t.url }));
    const hist = history.search(q, 10).map(h => ({ kind: 'history', id: null, title: h.t || h.u, sub: h.u }));
    return [...tabsOut, ...hist].slice(0, 18);
  }));

  ipcMain.handle('mem:stats', () => {
    let total = 0;
    try {
      for (const m of app.getAppMetrics()) total += m.memory.workingSetSize;
    } catch {}
    const snap = tabs.snapshot();
    return {
      totalMB: Math.round(total / 1024),
      tabs: snap.tabs.length,
      live: snap.tabs.filter(t => t.live).length,
      asleep: snap.tabs.filter(t => !t.live && !t.parked).length,
      parked: snap.tabs.filter(t => t.parked).length,
      savedMB: Math.round(tabs.savedBytes / 1048576),
    };
  });

  ipcMain.handle('app:openDataDir', () => shell.openPath(paths.data));
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:devtools', () => tabs.inspect());

  ipcMain.handle('ui:layout', ok(({ sidebarWidth, rightInset, topBar, uiScale, sidebarSide }) => {
    if (sidebarWidth) tabs.setSidebarWidth(sidebarWidth);
    if (rightInset !== undefined) tabs.setRightInset(rightInset);
    if (topBar !== undefined) tabs.setTopBar(topBar);
    if (uiScale !== undefined) tabs.setUiScale(uiScale);
    if (sidebarSide !== undefined) tabs.setSidebarSide(sidebarSide);
  }));

  ipcMain.handle('app:openDownloads', () => shell.openPath(app.getPath('downloads')));

  ipcMain.handle('mcp:apply', () => mcp ? mcp.apply() : { running: false });
  ipcMain.handle('mcp:regenerateToken', () => mcp ? mcp.regenerateToken() : '');
  ipcMain.handle('mcp:status', () => mcp ? mcp.status() : { running: false });
  ipcMain.handle('clipboard:write', ok(({ text }) => { clipboard.writeText(String(text ?? '')); return true; }));

  ipcMain.handle('update:check', () => updater ? updater.check() : updater_fallback());
  ipcMain.handle('update:apply', () => updater ? updater.apply() : { ok: false });
  ipcMain.handle('update:status', () => updater ? updater.status() : { current: app.getVersion(), managed: false });
  function updater_fallback() { return { current: app.getVersion(), managed: false }; }

  ipcMain.handle('data:clear', ok(async ({ cache, cookies, history: hist }) => {
    const ses = win.webContents.session;
    if (cache) await ses.clearCache();
    if (cookies) await ses.clearStorageData({ storages: ['cookies'] });
    if (hist) history.clear();
    return true;
  }));

  return INVOKE_CHANNELS;
}

module.exports = { wire };
