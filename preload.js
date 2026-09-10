'use strict';
// The only bridge between the chrome UI and the main process. Channels are
// allowlisted; arbitrary ipcRenderer access never crosses the context bridge.
// NOTE: this preload runs sandboxed, so it cannot require() local modules —
// the channel lists are inlined here and mirrored in main/ipc-channels.js.
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE_CHANNELS = new Set([
  'win:minimize', 'win:maximize', 'win:toggleMax', 'win:close', 'win:isMaximized',
  'tabs:create', 'tabs:activate', 'tabs:close', 'tabs:closeOthers', 'tabs:duplicate',
  'tabs:move', 'tabs:reorder', 'tabs:suspend', 'tabs:suspendAll', 'tabs:clearParked',
  'nav:goto', 'nav:action', 'nav:normalize',
  'find:query', 'find:stop',
  'settings:get', 'settings:set', 'settings:engines',
  'adblock:stats', 'adblock:updateAll', 'adblock:list', 'adblock:setList',
  'adblock:addList', 'adblock:removeList',
  'ext:list', 'ext:reload', 'ext:openOptions', 'ext:openFolder',
  'palette:search',
  'mem:stats',
  'app:openDataDir', 'app:version', 'app:quit', 'app:devtools',
  'ui:layout',
  'data:clear',
  'mcp:apply', 'mcp:regenerateToken', 'mcp:status',
  'clipboard:write', 'app:openDownloads',
]);

const PUSH_CHANNELS = new Set(['ui:tabs', 'ui:nav', 'ui:adblock', 'ui:mem', 'ui:maximized',
  'ui:find', 'ui:notice', 'ui:omniboxFocus', 'ui:openSettings', 'ui:openPalette', 'ui:themeChanged',
  'ui:ctxmenu', 'ui:openShortcuts']);

contextBridge.exposeInMainWorld('neutrino', {
  invoke: (channel, payload) => {
    if (!INVOKE_CHANNELS.has(channel)) return Promise.reject(new Error(`Unknown channel ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel, cb) => {
    if (!PUSH_CHANNELS.has(channel)) return () => {};
    const listener = (_event, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
