'use strict';
// Channel names shared by preload.js and main/ipc.js. A tiny module instead
// of require-ing ipc.js from the sandboxed preload (which would drag electron
// modules into it).
const INVOKE_CHANNELS = [
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
];

const PUSH_CHANNELS = ['ui:tabs', 'ui:nav', 'ui:adblock', 'ui:mem', 'ui:maximized',
  'ui:find', 'ui:notice', 'ui:omniboxFocus', 'ui:openSettings', 'ui:openPalette', 'ui:themeChanged',
  'ui:ctxmenu', 'ui:openShortcuts'];

module.exports = { INVOKE_CHANNELS, PUSH_CHANNELS };
