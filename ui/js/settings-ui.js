'use strict';
// Settings drawer. Opens over the right side of the window; the page view is
// narrowed while it's open (see ui:layout rightInset).
(function () {
  const $ = (sel) => document.querySelector(sel);
  const { icon } = window.NTICONS;
  const DRAWER_W = 400;

  let openState = false;

  function switchRow(label, checked, onchange, sub) {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <div class="grow">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</div>
      <label class="switch"><input type="checkbox" ${checked ? 'checked' : ''}><span class="track"></span></label>`;
    row.querySelector('input').addEventListener('change', (e) => onchange(e.target.checked));
    return row;
  }

  function selectRow(label, options, value, onchange, sub) {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <div class="grow">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</div>
      <select>${options.map(o => `<option value="${o[0]}" ${o[0] === value ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
    row.querySelector('select').addEventListener('change', (e) => onchange(e.target.value));
    return row;
  }

  function section(title, id) {
    const s = document.createElement('div');
    s.className = 'set-section';
    if (id) s.id = 'sec-' + id;
    s.innerHTML = `<h3>${title}</h3>`;
    return s;
  }

  function render() {
    const body = $('#settings-body');
    const st = NT.S.settings;
    body.innerHTML = '';

    // ---- Appearance ----
    const app = section('Appearance', 'appearance');
    const themes = document.createElement('div');
    themes.className = 'set-row';
    themes.innerHTML = `
      <div class="grow" style="display:flex;flex-direction:column;gap:8px;width:100%">
        <div class="theme-cards">
          <button class="theme-card ${st.theme === 'liquid' ? 'selected' : ''}" data-t="liquid">
            <span class="swatch liquid"></span><span class="t-name">Liquid Glass</span>
          </button>
          <button class="theme-card ${st.theme === 'galaxy' ? 'selected' : ''}" data-t="galaxy">
            <span class="swatch galaxy"></span><span class="t-name">Galaxy</span>
          </button>
        </div>
      </div>`;
    themes.querySelectorAll('.theme-card').forEach(b => b.addEventListener('click', () => NT.saveSettings({ theme: b.dataset.t })));
    app.appendChild(themes);

    app.appendChild(switchRow('Show top bar', st.topBar, v => NT.saveSettings({ topBar: v }), 'Address bar & buttons above the page'));

    const accent = document.createElement('div');
    accent.className = 'set-row';
    accent.innerHTML = `<div class="grow">Accent color</div><input type="color" value="${st.accent}">`;
    accent.querySelector('input').addEventListener('input', (e) => NT.saveSettings({ accent: e.target.value }));
    app.appendChild(accent);

    app.appendChild(switchRow('Show tab names', st.tabLabels, v => NT.saveSettings({ tabLabels: v }), 'Off = icon-only tabs'));
    app.appendChild(switchRow('Compact density', st.compact, v => NT.saveSettings({ compact: v })));
    app.appendChild(switchRow('Reduce motion', st.reduceMotion, v => NT.saveSettings({ reduceMotion: v })));

    const width = document.createElement('div');
    width.className = 'set-row';
    width.innerHTML = `<div class="grow">Sidebar width <span class="sub">${st.sidebarWidth}px — or drag the divider</span></div>
      <input type="range" min="210" max="460" step="2" value="${st.sidebarWidth}">`;
    width.querySelector('input').addEventListener('change', (e) => NT.saveSettings({ sidebarWidth: +e.target.value }));
    app.appendChild(width);

    app.appendChild(selectRow('Tab sidebar position',
      [['left', 'Left'], ['right', 'Right']], st.sidebarSide === 'right' ? 'right' : 'left',
      v => NT.saveSettings({ sidebarSide: v }), 'Which side of the window the tabs live on'));

    const glassRow = document.createElement('div');
    glassRow.className = 'set-row';
    glassRow.innerHTML = `<div class="grow">Glass transparency <span class="sub">${st.glassOpacity ?? 52}% opacity</span></div>
      <input type="range" min="20" max="90" step="2" value="${st.glassOpacity ?? 52}">`;
    glassRow.querySelector('input').addEventListener('input', (e) => {
      document.body.style.setProperty('--glass-a', String(e.target.value / 100));
    });
    glassRow.querySelector('input').addEventListener('change', (e) => NT.saveSettings({ glassOpacity: +e.target.value }));
    app.appendChild(glassRow);

    const radiusRow = document.createElement('div');
    radiusRow.className = 'set-row';
    radiusRow.innerHTML = `<div class="grow">Corner roundness <span class="sub">${st.cornerRadius ?? 14}px</span></div>
      <input type="range" min="4" max="22" step="1" value="${st.cornerRadius ?? 14}">`;
    radiusRow.querySelector('input').addEventListener('input', (e) => {
      document.documentElement.style.setProperty('--radius', e.target.value + 'px');
    });
    radiusRow.querySelector('input').addEventListener('change', (e) => NT.saveSettings({ cornerRadius: +e.target.value }));
    app.appendChild(radiusRow);

    app.appendChild(selectRow('Interface size',
      [['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.25', '125%']], String(st.uiScale || 1),
      v => NT.saveSettings({ uiScale: +v }), 'Sidebar and top bar'));
    app.appendChild(selectRow('Default page zoom',
      [['0.75', '75%'], ['0.9', '90%'], ['1', '100%'], ['1.1', '110%'], ['1.25', '125%'], ['1.5', '150%']],
      String(st.pageZoom || 1), v => NT.saveSettings({ pageZoom: +v }), 'Applies to every site'));
    app.appendChild(switchRow('Show clock on new-tab page', st.ntpShowClock !== false, v => NT.saveSettings({ ntpShowClock: v })));

    const ql = section('New-tab quick links');
    for (const [i, l] of st.quickLinks.entries()) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span class="name">${NT.escapeHtml(l.title)}</span><span class="meta">${NT.escapeHtml(l.url.replace(/^https?:\/\//, ''))}</span>
        <button class="btn sm danger" data-i="${i}">Remove</button>`;
      row.querySelector('button').addEventListener('click', () => {
        const links = [...st.quickLinks]; links.splice(i, 1); NT.saveSettings({ quickLinks: links });
      });
      ql.appendChild(row);
    }
    const addForm = document.createElement('div');
    addForm.className = 'set-row';
    addForm.innerHTML = `
      <input type="text" placeholder="Name" style="width:90px">
      <input type="text" placeholder="https://…" style="flex:1;max-width:none">
      <button class="btn sm">Add</button>`;
    addForm.querySelector('button').addEventListener('click', () => {
      const t = addForm.querySelectorAll('input')[0].value.trim() || 'Link';
      const u = addForm.querySelectorAll('input')[1].value.trim();
      if (!u) return;
      NT.saveSettings({ quickLinks: [...st.quickLinks, { title: t, url: u }] });
    });
    ql.appendChild(addForm);
    app.appendChild(ql);
    body.appendChild(app);

    // ---- Tabs & memory ----
    const mem = section('Tabs & memory', 'memory');
    const susp = document.createElement('div');
    susp.className = 'set-row';
    const mins = st.suspendAfterMin;
    susp.innerHTML = `<div class="grow">Suspend background tabs after <span class="sub">${mins ? mins + ' min idle — frees their renderer memory' : 'never'}</span></div>
      <input type="range" min="0" max="60" step="1" value="${mins}">`;
    susp.querySelector('input').addEventListener('change', (e) => NT.saveSettings({ suspendAfterMin: +e.target.value }));
    mem.appendChild(susp);
    mem.appendChild(switchRow('Suspend tabs that are playing audio', st.suspendAudible, v => NT.saveSettings({ suspendAudible: v }), 'Off by default — audio keeps a tab alive'));
    mem.appendChild(switchRow('Lazy session restore', st.lazyRestore, v => NT.saveSettings({ lazyRestore: v }), 'Tabs reload one by one as you click them'));
    mem.appendChild(switchRow('Notify me when tabs are put to sleep', st.suspendToasts !== false, v => NT.saveSettings({ suspendToasts: v })));
    mem.appendChild(selectRow('Renderer process cap', [['0', 'Off'], ['2', '2 processes'], ['4', '4 processes'], ['8', '8 processes']], String(st.processCap), v => NT.saveSettings({ processCap: +v })));

    const now = document.createElement('div');
    now.className = 'set-row';
    now.innerHTML = `<button class="btn primary">Suspend all background tabs now</button>`;
    now.querySelector('button').addEventListener('click', async () => {
      const n = await NT.invoke('tabs:suspendAll');
      NT.toast('zap', `${n} tabs suspended`);
    });
    mem.appendChild(now);

    const stats = document.createElement('div');
    stats.className = 'stat-block';
    stats.id = 'mem-stats';
    mem.appendChild(stats);
    updateMemStats(stats);
    body.appendChild(mem);

    // ---- Downloads ----
    const dl = section('Downloads', 'downloads');
    dl.appendChild(switchRow('Ask where to save each file', st.downloads.askWhere === true,
      v => NT.saveSettings({ downloads: { askWhere: v } }), 'Off = saves straight to your Downloads folder'));
    const dlRow = document.createElement('div');
    dlRow.className = 'set-row';
    dlRow.innerHTML = `<button class="btn">Open downloads folder</button>`;
    dlRow.querySelector('button').addEventListener('click', () => NT.invoke('app:openDownloads'));
    dl.appendChild(dlRow);
    body.appendChild(dl);

    // ---- Blocking & privacy ----
    const blk = section('Blocking & privacy', 'blocking');
    const ab = st.adblock;
    blk.appendChild(switchRow('Built-in ad & tracker blocker', ab.enabled, v => NT.saveSettings({ adblock: { enabled: v } })));
    blk.appendChild(switchRow('Cosmetic filtering (hide ad slots)', ab.cosmetic, v => NT.saveSettings({ adblock: { cosmetic: v } })));
    blk.appendChild(switchRow('Strict tracking protection', ab.strictTracking, v => NT.saveSettings({ adblock: { strictTracking: v } }), 'Blocks third-party cookies (restart to apply)'));

    const counters = document.createElement('div');
    counters.className = 'set-row';
    counters.innerHTML = `<div class="grow">Blocked so far <span class="sub">${NT.S.blocked.toLocaleString()} requests</span></div>`;
    blk.appendChild(counters);

    for (const l of ab.lists) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <label class="switch"><input type="checkbox" ${l.enabled ? 'checked' : ''}><span class="track"></span></label>
        <span class="name">${NT.escapeHtml(l.name)}</span>
        ${l.updatedAt ? `<span class="meta">upd ${new Date(l.updatedAt).toLocaleDateString()}</span>` : ''}
        ${l.builtin ? '' : `<button class="btn sm danger" data-x>✕</button>`}`;
      row.querySelector('input').addEventListener('change', (e) => NT.invoke('adblock:setList', { id: l.id, enabled: e.target.checked }));
      row.querySelector('[data-x]')?.addEventListener('click', () => NT.invoke('adblock:removeList', { id: l.id }));
      blk.appendChild(row);
    }
    const addList = document.createElement('div');
    addList.className = 'set-row';
    addList.innerHTML = `
      <input type="text" placeholder="List name" style="width:100px">
      <input type="text" placeholder="https://easylist.to/… (EasyList URL)" style="flex:1;max-width:none">
      <button class="btn sm">Add</button>`;
    addList.querySelector('button').addEventListener('click', async () => {
      const name = addList.querySelectorAll('input')[0].value.trim();
      const url = addList.querySelectorAll('input')[1].value.trim();
      if (!/^https?:\/\//.test(url)) return;
      await NT.invoke('adblock:addList', { name, url });
      NT.toast('shield', 'Filter list added');
      setTimeout(render, 400);
    });
    blk.appendChild(addList);
    const upd = document.createElement('div');
    upd.className = 'set-row';
    upd.innerHTML = `<button class="btn">Update all filter lists</button>`;
    upd.querySelector('button').addEventListener('click', async () => {
      await NT.invoke('adblock:updateAll');
      render();
    });
    blk.appendChild(upd);
    body.appendChild(blk);

    // ---- Extensions ----
    const extSec = section('Extensions', 'extensions');
    const extHelp = document.createElement('div');
    extHelp.className = 'set-row';
    extHelp.innerHTML = `<div class="grow">Drop <b>unpacked</b> Chrome extension folders into <code>~/.neutrino/extensions</code> and restart. uBlock Origin works well for YouTube ads.</div>`;
    extSec.appendChild(extHelp);
    const extRows = document.createElement('div');
    extRows.innerHTML = `<div class="set-row"><span class="grow" style="color:var(--text-faint)">Loading…</span></div>`;
    extSec.appendChild(extRows);
    NT.invoke('ext:list').then(list => {
      extRows.innerHTML = '';
      if (!list.length) {
        extRows.innerHTML = `<div class="set-row"><span class="grow" style="color:var(--text-faint)">No extensions installed</span></div>`;
      }
      for (const x of list) {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `
          <span class="name">${NT.escapeHtml(x.name)} <span class="meta">v${x.version}</span></span>
          ${x.error ? `<span class="meta" style="color:var(--danger)">${NT.escapeHtml(x.error)}</span>` : ''}
          ${x.hasOptions ? '<button class="btn sm" data-opt>Options</button>' : ''}
          <button class="btn sm" data-rel>Reload</button>`;
        row.querySelector('[data-opt]')?.addEventListener('click', () => NT.invoke('ext:openOptions', { id: x.id }));
        row.querySelector('[data-rel]').addEventListener('click', async () => { await NT.invoke('ext:reload', { id: x.id }); render(); });
        extRows.appendChild(row);
      }
    });
    const openDir = document.createElement('div');
    openDir.className = 'set-row';
    openDir.innerHTML = `<button class="btn">Open extensions folder</button>`;
    openDir.querySelector('button').addEventListener('click', () => NT.invoke('ext:openFolder'));
    extSec.appendChild(openDir);
    body.appendChild(extSec);

    // ---- Categories ----
    const catSec = section('Categories', 'categories');
    for (const c of st.categories) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <input type="color" value="${c.color}" title="Color" style="width:30px;height:24px">
        <input type="text" value="${NT.escapeHtml(c.name)}" style="flex:1;max-width:none;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--glass-input)">
        <span class="meta">${c.waste ? 'waste' : ''}</span>
        <button class="btn sm danger" data-del>✕</button>`;
      row.querySelector('input[type=color]').addEventListener('change', (e) => {
        const cats = st.categories.map(x => x.id === c.id ? { ...x, color: e.target.value } : x);
        NT.saveSettings({ categories: cats });
      });
      row.querySelector('input[type=text]').addEventListener('change', (e) => {
        const cats = st.categories.map(x => x.id === c.id ? { ...x, name: e.target.value } : x);
        NT.saveSettings({ categories: cats });
      });
      row.querySelector('[data-del]').addEventListener('click', () => {
        if (c.waste) { NT.toast('trash', 'The Waste category cannot be deleted'); return; }
        const cats = st.categories.filter(x => x.id !== c.id);
        NT.saveSettings({ categories: cats });
      });
      catSec.appendChild(row);
    }
    const addCat = document.createElement('div');
    addCat.className = 'set-row';
    addCat.innerHTML = `
      <input type="text" placeholder="New category name" style="flex:1;max-width:none">
      <button class="btn sm">Add</button>`;
    addCat.querySelector('button').addEventListener('click', () => {
      const name = addCat.querySelector('input').value.trim();
      if (!name) return;
      const palette = ['#7aa2ff', '#4fd1a5', '#e8b45a', '#e88ab5', '#b7a5ff', '#7fd1e8'];
      const id = 'c' + Date.now().toString(36);
      NT.saveSettings({ categories: [...st.categories, { id, name, color: palette[st.categories.length % palette.length] }] });
    });
    catSec.appendChild(addCat);
    catSec.appendChild(selectRow('Default category for new tabs',
      st.categories.filter(c => !c.waste).map(c => [c.id, c.name]), st.defaultCategory,
      v => NT.saveSettings({ defaultCategory: v })));
    catSec.insertAdjacentHTML('beforeend',
      `<div class="set-row"><div class="grow" style="font-size:11.5px;color:var(--text-faint)">Tabs in <b>Waste</b> stay listed after a restart but never load — click one to wake it.</div></div>`);
    body.appendChild(catSec);

    // ---- Startup & search ----
    const start = section('Startup & search', 'startup');
    start.appendChild(switchRow('Reopen tabs on startup', st.restoreSession, v => NT.saveSettings({ restoreSession: v })));
    const restoreCats = document.createElement('div');
    restoreCats.className = 'set-row';
    restoreCats.innerHTML = `<div class="grow">Categories to restore <span class="sub">Waste is never restored</span></div>`;
    const rcWrap = document.createElement('div');
    rcWrap.style.display = 'flex'; rcWrap.style.gap = '4px'; rcWrap.style.flexWrap = 'wrap';
    for (const c of st.categories.filter(x => !x.waste)) {
      const sel = st.restoreCategories === null || st.restoreCategories.includes(c.id);
      const b = document.createElement('button');
      b.className = 'btn sm' + (sel ? ' primary' : '');
      b.textContent = c.name;
      b.addEventListener('click', () => {
        const cur = st.restoreCategories === null ? st.categories.filter(x => !x.waste).map(x => x.id) : [...st.restoreCategories];
        const i = cur.indexOf(c.id);
        if (i >= 0) cur.splice(i, 1); else cur.push(c.id);
        NT.saveSettings({ restoreCategories: cur });
      });
      rcWrap.appendChild(b);
    }
    restoreCats.appendChild(rcWrap);
    start.appendChild(restoreCats);

    NT.invoke('settings:engines').then(({ engines }) => {
      start.appendChild(selectRow('Search engine',
        Object.entries(engines).map(([k, v]) => [k, v.name]), st.searchEngine,
        v => NT.saveSettings({ searchEngine: v })));
      const custom = document.createElement('div');
      custom.className = 'set-row';
      custom.innerHTML = `<div class="grow">Custom engine URL <span class="sub">use %s for the query</span></div>
        <input type="text" placeholder="https://example.com/search?q=%s" value="${NT.escapeHtml(st.customEngine)}" style="width:190px">`;
      custom.querySelector('input').addEventListener('change', (e) => NT.saveSettings({ customEngine: e.target.value }));
      start.appendChild(custom);
    });
    body.appendChild(start);

    // ---- Developer / MCP ----
    const dev = section('Developer · MCP server for AI', 'developer');
    const mcpHelp = document.createElement('div');
    mcpHelp.className = 'set-row';
    mcpHelp.innerHTML = `<div class="grow">Expose this browser as an <b>MCP server</b> so local AI models/agents can list, open, read and screenshot tabs. Binds to <code>127.0.0.1</code> only; every request needs the token.</div>`;
    dev.appendChild(mcpHelp);

    const mcpToggleRow = switchRow('Enable MCP server', st.mcp.enabled, async v => {
      await NT.saveSettings({ mcp: { enabled: v } });
      const s = await NT.invoke('mcp:apply');
      NT.toast('bot', s.running ? `MCP server on ${s.endpoint}` : 'MCP server stopped');
      render();
    });
    dev.appendChild(mcpToggleRow);
    dev.appendChild(switchRow('Read-only mode', st.mcp.readOnly === true, async v => {
      await NT.saveSettings({ mcp: { readOnly: v } });
      await NT.invoke('mcp:apply');
      NT.toast('bot', v ? 'MCP read-only: AI can look but not touch' : 'MCP read-only off');
      render();
    }, 'AI can list and read tabs, but not open, close or navigate'));
    body.appendChild(dev);

    // Quick documentation, also viewable any time in Settings → Developer.
    const DOC_TOOLS = [
      ['list_tabs', '— every open tab: id, title, url, category, active/asleep/parked'],
      ['get_active_tab', '— the tab currently on screen'],
      ['read_page', '— visible text of a tab (up to ~20k chars)', 'read'],
      ['screenshot', '— PNG screenshot of a tab', 'read'],
      ['search_history', '— search browsing history', 'read'],
      ['get_stats', '— memory, tab counts, blocked-ad counter', 'read'],
      ['open_tab', '— open a URL (normalizes like the address bar)', 'write'],
      ['navigate', '— send the active tab to a URL', 'write'],
      ['activate_tab', '— focus / wake a tab', 'write'],
      ['close_tab', '— close a tab', 'write'],
      ['run_command', '— back, reload, zoom, mute, suspendAll, clearParked…', 'write'],
    ];
    const doc = document.createElement('details');
    doc.className = 'mcp-doc';
    doc.innerHTML = `
      <summary>Quick documentation</summary>
      <div class="doc-body">
        <p><b>What is this?</b> MCP (Model Context Protocol) is an open standard that lets AI apps call tools.
        With the server enabled, any MCP-capable app on this machine can drive Neutrino — list tabs, open and
        read pages, take screenshots, search history — instead of you copy-pasting URLs around.</p>

        <p><b>Connect a client in 3 steps</b></p>
        <ol>
          <li>Turn on <b>Enable MCP server</b> above.</li>
          <li>Copy the endpoint URL and the bearer token (buttons above).</li>
          <li>Add this to your AI client's MCP config, replacing TOKEN:</li>
        </ol>
        <pre>{
  "mcpServers": {
    "neutrino": {
      "url": "http://127.0.0.1:47629/mcp",
      "headers": { "Authorization": "Bearer TOKEN" }
    }
  }
}</pre>
        <p>The client discovers the tools automatically (JSON-RPC over HTTP —
        <code>initialize</code>, <code>tools/list</code>, <code>tools/call</code>).
        No npm, no extra installs.</p>

        <p><b>Tools</b> <span class="doc-tag">${st.mcp.readOnly ? 'read-only mode: write tools are hidden & blocked' : 'all 11 tools exposed'}</span></p>
        <div class="doc-tools">
          ${DOC_TOOLS.map(([n, d, kind]) => `
            <div class="doc-tool${kind === 'write' && st.mcp.readOnly ? ' doc-off' : ''}">
              <code>${n}</code><span>${d}${kind === 'write' && st.mcp.readOnly ? ' (blocked in read-only)' : ''}</span>
            </div>`).join('')}
        </div>

        <p><b>Try asking your AI</b></p>
        <ul>
          <li>"List my open tabs and tell me what's worth reading."</li>
          <li>"Open the Hacker News front page in Work and summarize the top five stories."</li>
          <li>"Screenshot the active tab."</li>
          <li>"Find the tab about invoices and close everything else in that category."</li>
        </ul>

        <p><b>Security</b></p>
        <ul>
          <li>Listens on <code>127.0.0.1</code> only — never exposed to the network.</li>
          <li>Every request must carry the bearer token; regenerate it if it leaks.</li>
          <li>Anyone with the token can read your pages and browsing history — treat it like a password.</li>
          <li>Read-only mode caps the damage an over-eager agent can do.</li>
        </ul>
      </div>`;
    dev.appendChild(doc);

    NT.invoke('mcp:status').then(ms => {
      // keep fetched rows above the docs block
      const docEl = dev.querySelector('.mcp-doc');
      const add = (row) => dev.insertBefore(row, docEl);

      const portRow = document.createElement('div');
      portRow.className = 'set-row';
      portRow.innerHTML = `<div class="grow">Port</div><input type="text" value="${ms.port || 47629}" style="width:90px">`;
      portRow.querySelector('input').addEventListener('change', async (e) => {
        const port = parseInt(e.target.value, 10) || 47629;
        await NT.saveSettings({ mcp: { port } });
        const s = await NT.invoke('mcp:apply');
        if (st.mcp.enabled) NT.toast('bot', `MCP server on ${s.endpoint}`);
        render();
      });
      add(portRow);

      if (ms.token) {
        const tokRow = document.createElement('div');
        tokRow.className = 'set-row';
        tokRow.innerHTML = `
          <div class="grow">Bearer token <span class="sub" style="font-family:var(--mono)">${ms.token.slice(0, 8)}…${ms.token.slice(-4)}</span></div>
          <button class="btn sm" data-copy>Copy</button>
          <button class="btn sm" data-regen>Regenerate</button>`;
        tokRow.querySelector('[data-copy]').addEventListener('click', () => {
          NT.invoke('clipboard:write', { text: ms.token });
          NT.toast('check', 'Token copied');
        });
        tokRow.querySelector('[data-regen]').addEventListener('click', async () => {
          await NT.invoke('mcp:regenerateToken');
          NT.toast('bot', 'Token regenerated — update your clients');
          render();
        });
        add(tokRow);
      }

      if (ms.running) {
        const ep = document.createElement('div');
        ep.className = 'stat-block';
        ep.innerHTML = `
          Endpoint <b>${ms.endpoint}</b><br>
          Header <b>Authorization: Bearer &lt;token&gt;</b><br>
          Tools <b>${ms.tools.join(', ')}</b><br>
          Calls served <b>${ms.calls}</b><br><br>
          MCP client config:<br>
          <code style="font-size:10px">{"mcpServers":{"neutrino":{"url":"${ms.endpoint}","headers":{"Authorization":"Bearer &lt;token&gt;"}}}}</code>`;
        add(ep);
      }
    });

    // ---- Updates ----
    const updSec = section('Updates', 'updates');
    const updStatus = document.createElement('div');
    updStatus.className = 'stat-block';
    updStatus.textContent = 'Checking…';
    updSec.appendChild(updStatus);
    const updRow = document.createElement('div');
    updRow.className = 'set-row';
    updRow.innerHTML = `
      <button class="btn" data-check>Check for updates</button>
      <button class="btn primary" data-apply hidden></button>`;
    updRow.querySelector('[data-check]').addEventListener('click', async () => {
      updStatus.textContent = 'Checking…';
      const s = await NT.invoke('update:check');
      fillUpdStatus(updStatus, updRow.querySelector('[data-apply]'), s);
    });
    updRow.querySelector('[data-apply]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      NT.toast('zap', 'Applying update — Neutrino will restart');
      await NT.invoke('update:apply');
    });
    updSec.appendChild(updRow);
    updSec.appendChild(switchRow('Check for updates automatically', st.updates.autoCheck !== false,
      v => NT.saveSettings({ updates: { autoCheck: v } }), 'Once a day'));
    updSec.appendChild(switchRow('Install updates automatically', st.updates.autoInstall === true,
      v => NT.saveSettings({ updates: { autoInstall: v } }), 'Restarts Neutrino shortly after launch when a new version is out'));
    body.appendChild(updSec);
    NT.invoke('update:status').then(s => fillUpdStatus(updStatus, updRow.querySelector('[data-apply]'), s));

    // ---- Data ----
    const data = section('Data & privacy', 'data');
    const exitSec = document.createElement('div');
    exitSec.className = 'set-row';
    exitSec.innerHTML = `<div class="grow">Clear on exit <span class="sub">wipes the chosen data every time you quit</span></div>`;
    data.appendChild(exitSec);
    data.appendChild(switchRow('…cache on exit', st.clearOnExit.cache === true, v => NT.saveSettings({ clearOnExit: { cache: v } })));
    data.appendChild(switchRow('…cookies on exit', st.clearOnExit.cookies === true, v => NT.saveSettings({ clearOnExit: { cookies: v } })));
    data.appendChild(switchRow('…history on exit', st.clearOnExit.history === true, v => NT.saveSettings({ clearOnExit: { history: v } })));
    const dataRow = document.createElement('div');
    dataRow.className = 'set-row';
    dataRow.innerHTML = `
      <button class="btn sm" data-c>Clear cache</button>
      <button class="btn sm" data-k>Clear cookies</button>
      <button class="btn sm" data-h>Clear history</button>
      <button class="btn sm" data-d>Open data folder</button>`;
    dataRow.querySelector('[data-c]').addEventListener('click', () => { NT.invoke('data:clear', { cache: true }); NT.toast('trash', 'Cache cleared'); });
    dataRow.querySelector('[data-k]').addEventListener('click', () => { NT.invoke('data:clear', { cookies: true }); NT.toast('trash', 'Cookies cleared'); });
    dataRow.querySelector('[data-h]').addEventListener('click', () => { NT.invoke('data:clear', { history: true }); NT.toast('trash', 'History cleared'); });
    dataRow.querySelector('[data-d]').addEventListener('click', () => NT.invoke('app:openDataDir'));
    data.appendChild(dataRow);
    data.insertAdjacentHTML('beforeend',
      `<div class="stat-block">Neutrino 0.1 · Chromium via Electron<br>All data lives in <b>~/.neutrino</b></div>`);
    body.appendChild(data);
  }

  function fillUpdStatus(el, applyBtn, s) {
    if (!el) return;
    let line = `Current version <b>v${s.current}</b>`;
    if (s.updateAvailable) line += ` · update to <b>v${s.latest}</b> available`;
    else if (s.latest) line += ` · up to date`;
    if (s.busy) line += ' · working…';
    if (s.error) line += `<br><span style="color:var(--danger)">check failed: ${NT.escapeHtml(s.error)}</span>`;
    if (s.lastCheck) line += `<br><span style="color:var(--text-faint)">last checked ${new Date(s.lastCheck).toLocaleString()}</span>`;
    if (!s.managed) line += `<br><span style="color:var(--text-faint)">manual install — updates open the releases page instead</span>`;
    el.innerHTML = line;
    if (applyBtn) {
      applyBtn.hidden = !s.updateAvailable;
      applyBtn.textContent = `Update to v${s.latest}`;
      applyBtn.disabled = false;
    }
  }

  function updateMemStats(el) {
    const m = NT.S.mem || {};
    el.innerHTML = `
      Live tabs <b>${m.live ?? 0}</b> · asleep <b>${m.asleep ?? 0}</b> · parked <b>${m.parked ?? 0}</b><br>
      Browser memory <b>${m.totalMB ?? 0} MB</b><br>
      Reclaimed by suspension <b>${m.savedMB ?? 0} MB</b>`;
  }

  function openDrawer(sectionId) {
    openState = true;
    const d = $('#settings-drawer');
    d.hidden = false;
    $('#settings-close').innerHTML = icon('close');
    render();
    if (sectionId) setTimeout(() => $('#sec-' + sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    NT.invoke('ui:layout', { rightInset: DRAWER_W + 16 });
  }

  function closeDrawer() {
    openState = false;
    $('#settings-drawer').hidden = true;
    NT.invoke('ui:layout', { rightInset: 0 });
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#settings-close').addEventListener('click', closeDrawer);
    document.addEventListener('mousedown', (e) => {
      if (!openState) return;
      if (e.target.closest('#settings-drawer') || e.target.closest('#btn-settings') || e.target.closest('#btn-menu')) return;
      if (e.target.closest('.mi') || e.target.closest('#ctx-menu')) return;
      closeDrawer();
    });
    // keep stats fresh while open
    setInterval(() => { if (openState) { const el = $('#mem-stats'); if (el) updateMemStats(el); } }, 2000);
  });

  window.NTSETTINGS = { open: openDrawer, close: closeDrawer, isOpen: () => openState, render };
})();
