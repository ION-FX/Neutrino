'use strict';
// Neutrino chrome renderer. Talks to the main process exclusively through
// window.neutrino (contextBridge, allowlisted channels).
(function () {
  const { icon } = window.NTICONS;
  const $ = (sel) => document.querySelector(sel);
  const invoke = (ch, payload) => window.neutrino.invoke(ch, payload);

  const S = {
    settings: null,
    tabs: [], order: [], activeId: null,
    nav: {},
    blocked: 0,
    mem: {},
    findMode: false,
    maximized: false,
    galaxyDestroy: null,
  };

  // ---------- appearance -------------------------------------------------------

  function applyAppearance() {
    const st = S.settings;
    document.body.dataset.theme = st.theme;
    document.documentElement.style.setProperty('--accent', st.accent);
    document.documentElement.style.setProperty('--sbw', (st.tabLabels ? st.sidebarWidth : 64) + 'px');
    document.body.classList.toggle('no-labels', !st.tabLabels);
    document.body.classList.toggle('compact', !!st.compact);
    document.body.classList.toggle('reduce-motion', !!st.reduceMotion);
    document.body.classList.toggle('topbar', !!st.topBar);
    layoutTopBar(!!st.topBar);
    // UI scale: zoom the sidebar + top bar; the page view offset in the main
    // process must match, so send the effective (scaled) sidebar width too.
    const scale = st.uiScale || 1;
    document.documentElement.style.setProperty('--ui-zoom', String(scale));
    const effWidth = Math.round((st.tabLabels ? st.sidebarWidth : 64) * scale);

    if (st.theme === 'galaxy') {
      if (!S.galaxyDestroy) S.galaxyDestroy = window.NTGALAXY.init($('#galaxy-canvas'), { reduceMotion: st.reduceMotion });
    } else if (S.galaxyDestroy) {
      S.galaxyDestroy(); S.galaxyDestroy = null;
    }
    invoke('ui:layout', { sidebarWidth: effWidth, topBar: !!st.topBar, uiScale: scale });
  }

  // The omnibox + nav row live in the sidebar by default; with the top bar on
  // they are MOVED (same DOM nodes, listeners intact) into the bar above the
  // page area.
  function layoutTopBar(on) {
    const topbar = $('#topbar');
    const omniWrap = $('#omnibox-wrap');
    const navRow = $('#nav-row');
    topbar.hidden = !on;
    if (on) {
      topbar.replaceChildren(omniWrap, navRow);
    } else {
      const sidebar = $('#sidebar');
      sidebar.insertBefore(navRow, $('#sidebar-main'));
      sidebar.insertBefore(omniWrap, navRow);
    }
  }

  async function saveSettings(patch) {
    S.settings = await invoke('settings:set', patch);
    applyAppearance();
    renderTabs();
    if (window.NTSETTINGS && window.NTSETTINGS.isOpen()) window.NTSETTINGS.render();
  }

  // ---------- tab strip ----------------------------------------------------------

  function tabById(id) { return S.tabs.find(t => t.id === id); }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }

  function favHTML(tab) {
    if (tab.crashed) return icon('alert', 'badge-alert');
    if (tab.loading && tab.id === S.activeId) return '<span class="spin"></span>';
    if (tab.favicon) return `<img src="${tab.favicon.replace(/"/g, '&quot;')}" data-letter="${letterFor(tab)}">`;
    return `<span class="letter" style="color:${letterColor(tab)}">${letterFor(tab)}</span>`;
  }

  function letterFor(tab) {
    const host = hostOf(tab.url);
    return (host || 'N')[0].toUpperCase();
  }
  function letterColor(tab) {
    const host = hostOf(tab.url) || 'neutrino';
    const hue = [...host].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return `hsl(${hue} 60% 72%)`;
  }
  // CSP forbids inline onerror= handlers; attach the favicon fallback here.
  function wireFaviconFavallbacks(root) {
    root.querySelectorAll('.fav img[data-letter]').forEach(img => {
      img.addEventListener('error', () => {
        const span = document.createElement('span');
        span.className = 'letter';
        span.textContent = img.dataset.letter;
        span.style.color = letterColor({ url: img.src });
        img.replaceWith(span);
      }, { once: true });
    });
  }

  function badgesHTML(tab) {
    if (tab.crashed) return icon('alert', 'badge-alert');
    if (tab.audible) return icon('volume', 'badge-audio');
    if (tab.parked || !tab.live) return icon('moon', 'badge-moon');
    return '';
  }

  function renderTabs() {
    if (!S.settings) return; // ui:tabs can arrive before settings:get resolves
    const scroll = $('#tabs-scroll');
    const cats = S.settings.categories.filter(c => !c.waste).concat(S.settings.categories.filter(c => c.waste));
    const collapsed = new Set(S.settings.collapsedCategories || []);
    const frag = document.createDocumentFragment();

    for (const cat of cats) {
      const ids = S.order.filter(id => (tabById(id)?.category || 'main') === cat.id);
      const sec = document.createElement('section');
      sec.className = 'category' + (collapsed.has(cat.id) ? ' collapsed' : '');
      sec.dataset.cat = cat.id;
      sec.innerHTML = `
        <header class="cat-head" draggable="false">
          <span class="cat-dot" style="--c:${cat.color}"></span>
          <span class="cat-name">${escapeHtml(cat.name)}</span>
          <span class="cat-count">${ids.length}</span>
          ${cat.waste && ids.length ? '<button class="cat-extra" data-act="clear-waste" title="Clear parked tabs">' + icon('trash') + '</button>' : ''}
          <span class="ic-chev">${icon('chevD')}</span>
        </header>
        <div class="cat-body"></div>`;
      const body = sec.querySelector('.cat-body');

      for (const id of ids) {
        const t = tabById(id);
        if (!t) continue;
        const el = document.createElement('div');
        el.className = 'tab'
          + (id === S.activeId ? ' active' : '')
          + (t.parked ? ' parked' : '');
        el.dataset.id = id;
        el.draggable = true;
        el.title = (t.title || t.url) + (t.parked ? ' — parked (won’t reopen on restart)' : (!t.live ? ' — asleep' : ''));
        el.innerHTML = `
          <span class="fav">${favHTML(t)}</span>
          <span class="t-title">${escapeHtml(t.title || hostOf(t.url) || 'New tab')}</span>
          <span class="t-badges">${badgesHTML(t)}</span>
          <button class="t-close" title="Close tab">${icon('close')}</button>`;
        body.appendChild(el);
      }
      sec.querySelector('.cat-head').addEventListener('click', (e) => {
        if (e.target.closest('.cat-extra')) return;
        toggleCategory(cat.id);
      });
      sec.querySelector('[data-act="clear-waste"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        await invoke('tabs:clearParked');
        toast('trash', 'Parked tabs cleared');
      });
      frag.appendChild(sec);
    }
    scroll.replaceChildren(frag);
    wireFaviconFavallbacks(scroll);
    scroll.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest' });
  }

  function toggleCategory(id) {
    const col = new Set(S.settings.collapsedCategories || []);
    col.has(id) ? col.delete(id) : col.add(id);
    saveSettings({ collapsedCategories: [...col] });
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- tab interactions -----------------------------------------------------

  $('#tabs-scroll').addEventListener('click', async (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;
    if (e.target.closest('.t-close')) { invoke('tabs:close', { id: tabEl.dataset.id }); return; }
    invoke('tabs:activate', { id: tabEl.dataset.id });
  });

  $('#tabs-scroll').addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const tabEl = e.target.closest('.tab');
    if (tabEl) { e.preventDefault(); invoke('tabs:close', { id: tabEl.dataset.id }); }
  });

  $('#tabs-scroll').addEventListener('contextmenu', (e) => {
    const tabEl = e.target.closest('.tab');
    const catEl = e.target.closest('.category');
    if (tabEl) { e.preventDefault(); tabContextMenu(e, tabEl.dataset.id); }
    else if (catEl) { e.preventDefault(); catContextMenu(e, catEl.dataset.cat); }
  });

  function tabContextMenu(e, id) {
    const t = tabById(id);
    const cats = S.settings.categories.filter(c => c.id !== t.category);
    const items = [
      { ic: 'reload', label: 'Reload', fn: () => { invoke('tabs:activate', { id }); invoke('nav:action', { action: 'reloadHard' }); } },
      { ic: 'tab', label: 'Duplicate', fn: () => invoke('tabs:duplicate', { id }) },
      { ic: 'zap', label: t.live ? 'Suspend now' : 'Wake up', fn: () => invoke('tabs:activate', { id }) },
      ...(cats.length ? [{ sep: true }, ...cats.map(c => ({
        ic: 'folder', label: 'Move to ' + c.name, dot: c.color, fn: () => invoke('tabs:move', { id, category: c.id }),
      }))] : []),
      { sep: true },
      { ic: 'close', label: 'Close', danger: true, fn: () => invoke('tabs:close', { id }) },
      { ic: 'trash', label: 'Close others in category', danger: true, fn: () => invoke('tabs:closeOthers', { id }) },
    ];
    showMenu(e.clientX, e.clientY, items);
  }

  function catContextMenu(e, catId) {
    const cat = S.settings.categories.find(c => c.id === catId);
    const items = [
      { ic: 'plus', label: 'New tab here', fn: () => invoke('tabs:create', { category: catId }) },
      ...(cat.waste
        ? [{ ic: 'history', label: 'Wake all parked tabs', fn: async () => { for (const t of S.tabs.filter(x => x.category === catId && x.parked)) await invoke('tabs:activate', { id: t.id }); } }]
        : []),
      { ic: 'gear', label: 'Rename / recolor…', fn: () => { openSettings('categories'); } },
      ...(cat.waste ? [{ ic: 'trash', label: 'Clear parked tabs', danger: true, fn: () => invoke('tabs:clearParked') }] : []),
    ];
    showMenu(e.clientX, e.clientY, items);
  }

  // drag & drop: reorder within/between categories
  let dragId = null;
  $('#tabs-scroll').addEventListener('dragstart', (e) => {
    const tabEl = e.target.closest('.tab');
    if (!tabEl) return;
    dragId = tabEl.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => tabEl.classList.add('dragging'));
  });
  $('#tabs-scroll').addEventListener('dragend', () => {
    dragId = null;
    document.querySelectorAll('.dragging, .drop-before').forEach(el => el.classList.remove('dragging', 'drop-before'));
    document.querySelectorAll('.droptarget').forEach(el => el.classList.remove('droptarget'));
  });
  $('#tabs-scroll').addEventListener('dragover', (e) => {
    const tabEl = e.target.closest('.tab');
    const catHead = e.target.closest('.cat-head');
    document.querySelectorAll('.drop-before, .droptarget').forEach(el => el.classList.remove('drop-before', 'droptarget'));
    if (tabEl && tabEl.dataset.id !== dragId) {
      e.preventDefault();
      const r = tabEl.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) tabEl.classList.add('drop-before');
    } else if (catHead) {
      e.preventDefault();
      catHead.closest('.category').classList.add('droptarget');
    }
  });
  $('#tabs-scroll').addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!dragId) return;
    const tabEl = e.target.closest('.tab');
    const catEl = e.target.closest('.category');
    if (tabEl && tabEl.dataset.id !== dragId) {
      const before = tabEl.classList.contains('drop-before');
      const beforeId = before ? tabEl.dataset.id
        : (S.order[S.order.indexOf(tabEl.dataset.id) + 1] || null);
      await invoke('tabs:move', { id: dragId, category: catEl?.dataset.cat, beforeId });
    } else if (catEl) {
      await invoke('tabs:move', { id: dragId, category: catEl.dataset.cat });
    }
  });

  // ---------- omnibox ----------------------------------------------------------------

  const omni = $('#omnibox'), omniWrap = $('#omnibox-wrap');

  function setOmniFromNav() {
    if (document.activeElement === omni && !S.findMode) return;
    if (S.nav.isNtp) omni.value = '';
    else omni.value = S.nav.url || '';
    omni.placeholder = S.findMode ? 'Find in page' : 'Search or enter address';
    omniWrap.classList.toggle('findmode', S.findMode);
    omniWrap.classList.toggle('secure', !!S.nav.secure && !S.findMode);
    $('#omni-leading').innerHTML = icon(S.findMode ? 'search' : (S.nav.isNtp ? 'search' : S.nav.secure ? 'lock' : 'globe'));
    $('#find-count').hidden = !S.findMode;
    if (!S.findMode) $('#find-count').textContent = '';
    $('#nav-back').disabled = !S.nav.canBack;
    $('#nav-fwd').disabled = !S.nav.canFwd;
    $('#nav-reload').innerHTML = icon(S.nav.loading ? 'stop' : 'reload');
    document.title = (S.nav.title ? S.nav.title + ' — ' : '') + 'Neutrino';
  }

  omni.addEventListener('focus', () => {
    omniWrap.classList.add('expanded');
    omni.select();
    if (S.nav.url && !S.nav.isNtp) omni.value = S.nav.url;
  });
  omni.addEventListener('blur', () => setTimeout(() => omniWrap.classList.remove('expanded'), 120));
  omni.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      if (S.findMode) {
        invoke('find:query', { text: omni.value, forward: !e.shiftKey, next: true });
      } else if (omni.value.trim()) {
        await invoke('nav:goto', { url: omni.value });
        omni.blur();
      }
    } else if (e.key === 'Escape') {
      if (S.findMode) exitFindMode();
      else { setOmniFromNav(); omni.blur(); }
    }
  });
  omni.addEventListener('input', () => {
    if (S.findMode) invoke('find:query', { text: omni.value, forward: true, next: false });
  });

  function enterFindMode() {
    S.findMode = true;
    omni.value = '';
    setOmniFromNav();
    omni.focus();
  }
  function exitFindMode() {
    S.findMode = false;
    invoke('find:stop');
    setOmniFromNav();
    omni.blur();
  }

  // ---------- nav buttons -----------------------------------------------------------

  $('#nav-back').addEventListener('click', () => invoke('nav:action', { action: 'back' }));
  $('#nav-fwd').addEventListener('click', () => invoke('nav:action', { action: 'fwd' }));
  $('#nav-reload').addEventListener('click', () => invoke('nav:action', { action: S.nav.loading ? 'stop' : 'reload' }));
  $('#btn-palette').addEventListener('click', () => window.NTPALETTE.open());
  $('#btn-menu').addEventListener('click', (e) => openMenuPopover(e.currentTarget));
  $('#omni-shield').addEventListener('click', () => openSettings('blocking'));

  function openMenuPopover(btn) {
    const r = btn.getBoundingClientRect();
    showMenu(r.right - 200, r.bottom + 6, [
      { ic: 'plus', label: 'New tab', fn: () => invoke('tabs:create', {}) },
      { ic: 'zap', label: 'Suspend background tabs', fn: async () => { const n = await invoke('tabs:suspendAll'); toast('zap', `${n} tab${n === 1 ? '' : 's'} put to sleep`); } },
      { ic: 'puzzle', label: 'Extensions…', fn: () => openSettings('extensions') },
      { ic: 'sparkle', label: 'Toggle theme', fn: () => toggleTheme() },
      { sep: true },
      { ic: 'keyboard', label: 'Keyboard & mouse (F1)', fn: () => openShortcuts() },
      { ic: 'gear', label: 'Settings', fn: () => openSettings() },
      { ic: 'shield', label: `About Neutrino`, fn: () => openSettings('memory') },
    ]);
  }

  function toggleTheme() {
    saveSettings({ theme: S.settings.theme === 'galaxy' ? 'liquid' : 'galaxy' });
  }
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#new-tab').addEventListener('click', () => invoke('tabs:create', {}));
  $('#nt-icon').innerHTML = icon('plus');
  $('#topbar').addEventListener('dblclick', () => invoke('win:toggleMax'));

  // ---------- keyboard shortcuts overlay (F1) ---------------------------------

  const SHORTCUT_LIST = [
    ['Tabs', [
      ['Ctrl+T / Ctrl+W', 'new tab / close tab'],
      ['Ctrl+Shift+T', 'duplicate tab'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'next / previous tab'],
      ['Alt+↓ / Alt+↑', 'next / previous tab'],
      ['Ctrl+1 … Ctrl+9', 'jump to tab 1–9'],
      ['Middle-click / hover ✕', 'close tab with mouse'],
    ]],
    ['Navigation', [
      ['Ctrl+L', 'focus address bar'],
      ['Ctrl+K', 'palette — tabs, history, commands, "go to"'],
      ['Ctrl+F', 'find in page (Enter / Shift+Enter to jump)'],
      ['Alt+← / Alt+→ or mouse buttons', 'back / forward'],
      ['Ctrl+R / Ctrl+Shift+R', 'reload / hard reload'],
      ['Ctrl+0 / Ctrl+= / Ctrl+-', 'reset / zoom in / zoom out'],
      ['Ctrl+M', 'mute / unmute tab'],
      ['Right-click page', 'context menu (back, reload, links…)'],
    ]],
    ['Browser', [
      ['Ctrl+,', 'settings'],
      ['Ctrl+Shift+D', 'toggle Liquid Glass / Galaxy theme'],
      ['F1', 'this cheat sheet'],
      ['F12 / Ctrl+Shift+I', 'page devtools'],
      ['Esc', 'close overlay / palette / find'],
    ]],
  ];

  function buildShortcutsOverlay() {
    const el = $('#shortcuts-overlay');
    el.innerHTML = `<div class="sc-card">
      <h2>Keyboard &amp; mouse</h2>
      <div class="sc-sub">Everything in Neutrino works with either device alone.</div>
      <div class="sc-grid">${SHORTCUT_LIST.map(([sec, rows]) => `
        <div class="sc-sec">${sec}</div>
        ${rows.map(([k, d]) => `<div class="sc-row"><span>${escapeHtml(d)}</span><kbd>${escapeHtml(k)}</kbd></div>`).join('')}
      `).join('')}</div>
    </div>`;
  }

  function openShortcuts() {
    buildShortcutsOverlay();
    $('#shortcuts-overlay').hidden = false;
  }
  function closeShortcuts() { $('#shortcuts-overlay').hidden = true; }
  $('#shortcuts-overlay').addEventListener('click', (e) => {
    if (!e.target.closest('.sc-card')) closeShortcuts();
  });

  // ---------- page context menu (mouse-only navigation) -------------------------

  function pageContextMenu(p) {
    const items = [
      { ic: 'back', label: 'Back', fn: () => invoke('nav:action', { action: 'back' }) },
      { ic: 'fwd', label: 'Forward', fn: () => invoke('nav:action', { action: 'forward' }) },
      { ic: 'reload', label: 'Reload', fn: () => invoke('nav:action', { action: 'reload' }) },
    ];
    if (p.linkURL) {
      items.push({ sep: true });
      items.push({ ic: 'plus', label: 'Open link in new tab', fn: () => invoke('tabs:create', { url: p.linkURL }) });
      items.push({ ic: 'moon', label: 'Open link in Waste', fn: () => invoke('tabs:create', { url: p.linkURL, category: 'waste' }) });
      items.push({ ic: 'folder', label: 'Copy link address', fn: () => invoke('clipboard:write', { text: p.linkURL }) });
    }
    if (p.hasSelection) {
      items.push({ ic: 'folder', label: 'Copy selection', fn: () => invoke('nav:action', { action: 'copySelection' }) });
    }
    items.push(
      { sep: true },
      { ic: 'zoom', label: 'Zoom in', fn: () => invoke('nav:action', { action: 'zoomIn' }) },
      { ic: 'zoom', label: 'Reset zoom', fn: () => invoke('nav:action', { action: 'zoomReset' }) },
      { sep: true },
      { ic: 'tab', label: 'Duplicate tab', fn: () => invoke('tabs:duplicate', { id: p.tabId }) },
      { ic: 'zap', label: 'Suspend this tab', fn: () => invoke('tabs:suspend', { id: p.tabId }) },
      { ic: 'gear', label: 'Inspect (devtools)', fn: () => invoke('app:devtools') },
      { ic: 'close', label: 'Close tab', danger: true, fn: () => invoke('tabs:close', { id: p.tabId }) },
    );
    showMenu(p.x, p.y, items);
  }

  // ---------- menus / toasts ---------------------------------------------------------

  function showMenu(x, y, items) {
    const menu = $('#ctx-menu');
    menu.innerHTML = items.map((it, i) => it.sep
      ? '<div class="mi-sep"></div>'
      : `<div class="mi${it.danger ? ' danger' : ''}" data-i="${i}">${it.dot ? `<span class="cat-dot" style="--c:${it.dot};width:8px;height:8px"></span>` : icon(it.ic)}<span>${escapeHtml(it.label)}</span></div>`
    ).join('');
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = Math.min(x, innerWidth - mw - 8) + 'px';
    menu.style.top = Math.min(y, innerHeight - mh - 8) + 'px';
    menu.querySelectorAll('.mi').forEach(el => el.addEventListener('click', () => {
      hideMenu();
      items[+el.dataset.i].fn?.();
    }));
  }
  function hideMenu() { $('#ctx-menu').hidden = true; }
  document.addEventListener('click', (e) => { if (!e.target.closest('#ctx-menu')) hideMenu(); });
  window.addEventListener('blur', hideMenu);

  function toast(ic, msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${icon(ic)}<span>${escapeHtml(msg)}</span><button class="x">${icon('close')}</button>`;
    el.querySelector('.x').addEventListener('click', () => el.remove());
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 320); }, 4200);
  }

  // ---------- window controls / resize ------------------------------------------------

  $('#wc-min').innerHTML = icon('min');
  $('#wc-max').innerHTML = icon('max');
  $('#wc-close').innerHTML = icon('close');
  $('#logo').innerHTML = window.NTICONS.logo;
  $('#wc-min').addEventListener('click', () => invoke('win:minimize'));
  $('#wc-max').addEventListener('click', () => invoke('win:maximize'));
  $('#wc-close').addEventListener('click', () => invoke('win:close'));
  $('#titlebar').addEventListener('dblclick', () => invoke('win:toggleMax'));

  const resizeBar = $('#sidebar-resize');
  resizeBar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = S.settings.sidebarWidth;
    const zoom = S.settings.uiScale || 1;
    const move = (ev) => {
      const w = Math.max(210, Math.min(460, Math.round(startW + (ev.clientX - startX) / zoom)));
      S.settings.sidebarWidth = w;
      document.documentElement.style.setProperty('--sbw', w + 'px');
      invoke('ui:layout', { sidebarWidth: Math.round(w * zoom) });
    };
    const up = () => {
      removeEventListener('mousemove', move); removeEventListener('mouseup', up);
      saveSettings({ sidebarWidth: S.settings.sidebarWidth });
    };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });

  // ---------- keyboard: escape priorities ---------------------------------------------

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#shortcuts-overlay').hidden) return closeShortcuts();
    if (!$('#ctx-menu').hidden) return hideMenu();
    if (window.NTPALETTE.isOpen()) return window.NTPALETTE.close();
    if (S.findMode) return exitFindMode();
    if (window.NTSETTINGS?.isOpen()) return window.NTSETTINGS.close();
    if (document.activeElement === omni) { setOmniFromNav(); omni.blur(); }
  });

  // ---------- push subscriptions ------------------------------------------------------

  const sub = (ch, fn) => window.neutrino.on(ch, fn);

  sub('ui:tabs', (data) => {
    S.tabs = data.tabs; S.order = data.order; S.activeId = data.activeId;
    if (!window.NTPALETTE.isOpen()) renderTabs();
  });
  sub('ui:nav', (data) => { S.nav = data; setOmniFromNav(); });
  sub('ui:adblock', (stats) => {
    S.blocked = stats.blocked;
    const el = $('#omni-shield');
    el.innerHTML = `${icon('shield')}<span>${fmt(stats.blocked)}</span>`;
    el.classList.toggle('on', stats.blocked > 0);
    el.title = `${stats.blocked.toLocaleString()} requests blocked · ${stats.rules.toLocaleString()} rules`;
  });
  sub('ui:mem', (m) => {
    S.mem = m;
    const bits = [];
    if (m.asleep) bits.push(`⏾ ${m.asleep} asleep`);
    if (m.parked) bits.push(`${m.parked} parked`);
    bits.push(`${m.totalMB} MB`);
    if (m.savedMB) bits.push(`${m.savedMB} MB saved`);
    $('#stat-mem').textContent = bits.join(' · ');
  });
  sub('ui:maximized', (v) => {
    S.maximized = v;
    $('#wc-max').innerHTML = icon(v ? 'restore' : 'max');
  });
  sub('ui:find', (r) => {
    $('#find-count').textContent = r ? `${r.active}/${r.total}` : '';
  });
  sub('ui:notice', (n) => {
    if (n.kind === 'suspend') toast('zap', `${n.count} background tab${n.count > 1 ? 's' : ''} put to sleep — memory released`);
    else if (n.kind === 'download') toast('check', n.msg);
    else toast('sparkle', n.msg || '');
  });
  sub('ui:omniboxFocus', (opts) => {
    if (opts?.palette) window.NTPALETTE.open();
    else if (opts?.find) enterFindMode();
    else { omni.focus(); omni.select(); }
  });
  sub('ui:openSettings', (section) => openSettings(section));
  sub('ui:openPalette', () => window.NTPALETTE.open());
  sub('ui:openShortcuts', () => openShortcuts());
  sub('ui:ctxmenu', pageContextMenu);
  sub('ui:themeChanged', () => { /* settings:set already applied locally */ });

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k';
    return String(n);
  }

  // ---------- boot ---------------------------------------------------------------------

  function openSettings(section) {
    if (window.NTSETTINGS) window.NTSETTINGS.open(section);
  }

  (async function boot() {
    S.settings = await invoke('settings:get');
    applyAppearance();
    $('#nav-back').innerHTML = icon('back');
    $('#nav-fwd').innerHTML = icon('fwd');
    $('#nav-reload').innerHTML = icon('reload');
    $('#btn-palette').innerHTML = icon('cmd');
    $('#btn-menu').innerHTML = icon('dots');
    $('#btn-theme').innerHTML = icon('sparkle');
    $('#btn-settings').innerHTML = icon('gear');
    renderTabs();
    setOmniFromNav();
    window.NT = { S, saveSettings, invoke, toast, toggleTheme, openSettings, escapeHtml };
    window.NTSHORTCUTS = { open: openShortcuts };
  })();
})();
