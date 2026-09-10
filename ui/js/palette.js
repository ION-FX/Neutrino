'use strict';
// Ctrl+K palette — searches open tabs, parked (waste) tabs, history and commands.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const { icon } = window.NTICONS;

  let open = false;
  let results = [];
  let active = 0;
  let debounce = null;

  const el = () => $('#palette');
  const input = () => $('#palette-input');
  const list = () => $('#palette-list');

  const COMMANDS = [
    { ic: 'plus', title: 'New tab', kind: 'command', fn: () => NT.invoke('tabs:create', {}) },
    { ic: 'globe', title: 'Close tab', kind: 'command', fn: () => NT.invoke('tabs:close', { id: NT.S.activeId }) },
    { ic: 'sparkle', title: 'Toggle theme', kind: 'command', fn: () => NT.toggleTheme() },
    { ic: 'tab', title: 'Toggle tab labels (icon-only)', kind: 'command', fn: () => NT.saveSettings({ tabLabels: !NT.S.settings.tabLabels }) },
    { ic: 'cmd', title: 'Toggle top bar', kind: 'command', fn: () => NT.saveSettings({ topBar: !NT.S.settings.topBar }) },
    { ic: 'zap', title: 'Suspend all background tabs', kind: 'command', fn: async () => { const n = await NT.invoke('tabs:suspendAll'); NT.toast('zap', `${n} tabs put to sleep`); } },
    { ic: 'trash', title: 'Clear parked (waste) tabs', kind: 'command', fn: () => NT.invoke('tabs:clearParked') },
    { ic: 'search', title: 'Find in page', kind: 'command', fn: () => NT.invoke('ui:omniboxFocus', { find: true }) },
    { ic: 'reload', title: 'Reload page (hard)', kind: 'command', fn: () => NT.invoke('nav:action', { action: 'reloadHard' }) },
    { ic: 'volume', title: 'Mute / unmute this tab', kind: 'command', fn: () => NT.invoke('nav:action', { action: 'toggleMute' }) },
    { ic: 'zoom', title: 'Zoom in', kind: 'command', fn: () => NT.invoke('nav:action', { action: 'zoomIn' }) },
    { ic: 'zoom', title: 'Zoom out', kind: 'command', fn: () => NT.invoke('nav:action', { action: 'zoomOut' }) },
    { ic: 'zoom', title: 'Reset zoom', kind: 'command', fn: () => NT.invoke('nav:action', { action: 'zoomReset' }) },
    { ic: 'gear', title: 'Settings', kind: 'command', fn: () => NT.openSettings() },
    { ic: 'zap', title: 'Check for updates', kind: 'command', fn: async () => { const s = await NT.invoke('update:check'); NT.toast('zap', s.updateAvailable ? `Neutrino v${s.latest} available` : s.error ? `Update check failed: ${s.error}` : `Up to date (v${s.current})`); } },
    { ic: 'puzzle', title: 'Extensions', kind: 'command', fn: () => NT.openSettings('extensions') },
    { ic: 'cmd', title: 'Keyboard shortcuts (F1)', kind: 'command', fn: () => window.NTSHORTCUTS.open() },
    { ic: 'close', title: 'Quit Neutrino', kind: 'command', fn: () => NT.invoke('app:quit') },
  ];

  function fuzzy(query, text) {
    query = query.toLowerCase(); text = (text || '').toLowerCase();
    if (!query) return 1;
    if (text.includes(query)) return 100 - text.indexOf(query) * 0.05;
    let i = 0;
    for (const ch of text) if (ch === query[i]) i++;
    return i === query.length ? 30 : 0;
  }

  async function refresh() {
    const q = input().value.trim();
    const cmds = COMMANDS.map(c => ({ ...c, score: fuzzy(q, c.title) })).filter(c => c.score > 0);
    let remote = [];
    try {
      remote = q ? await NT.invoke('palette:search', { q }) : [];
    } catch { remote = []; }
    results = [
      ...(q ? [{ ic: 'globe', kind: 'open', title: `Go to “${q}”`, sub: 'Address bar', score: 1000 }] : []),
      ...cmds.sort((a, b) => b.score - a.score).map(c => ({ ...c, sub: 'Command' })),
      ...remote.map(r => ({ ...r, ic: r.kind === 'parked' ? 'moon' : r.kind === 'history' ? 'history' : 'tab', sub: r.sub || r.kind })),
    ].slice(0, 14);
    active = 0;
    renderList();
  }

  function renderList() {
    if (!results.length) {
      list().innerHTML = `<div class="pal-empty">Nothing found</div>`;
      return;
    }
    list().innerHTML = results.map((r, i) => `
      <div class="pal-item${i === active ? ' active' : ''}" data-i="${i}">
        ${icon(r.ic)}
        <div class="pi-main">
          <div class="pi-title">${NT.escapeHtml(r.title)}</div>
          ${r.sub ? `<div class="pi-sub">${NT.escapeHtml(r.sub)}</div>` : ''}
        </div>
        <span class="pi-kind">${r.kind}</span>
      </div>`).join('');
    list().querySelectorAll('.pal-item').forEach(item => {
      item.addEventListener('click', () => execute(+item.dataset.i));
      item.addEventListener('mousemove', () => { active = +item.dataset.i; renderList(); });
    });
  }

  async function execute(i) {
    const r = results[i];
    if (!r) return;
    const q = input().value.trim();
    close();
    if (r.kind === 'command') r.fn();
    else if (r.kind === 'open') NT.invoke('nav:goto', { url: q });
    else if (r.kind === 'tab' || r.kind === 'parked') NT.invoke('tabs:activate', { id: r.id });
    else if (r.kind === 'history') NT.invoke('tabs:create', { url: r.sub });
  }

  function openPalette() {
    if (open) return;
    open = true;
    el().hidden = false;
    input().value = '';
    results = []; active = 0;
    renderList();
    input().focus();
    refresh();
  }

  function close() {
    open = false;
    el().hidden = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    input().addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 110);
    });
    input().addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); renderList(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); renderList(); }
      else if (e.key === 'Enter') { e.preventDefault(); execute(active); }
      else if (e.key === 'Escape') close();
    });
  });

  window.NTPALETTE = { open: openPalette, close, isOpen: () => open };
})();
