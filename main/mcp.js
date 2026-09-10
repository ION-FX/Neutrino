'use strict';
// Built-in MCP (Model Context Protocol) server for power users / AI agents.
//
// Transport: streamable-HTTP style — clients POST JSON-RPC to
//   http://127.0.0.1:<port>/mcp
// with `Authorization: Bearer <token>`. Responses are plain JSON (no SSE
// needed; every tool here answers immediately). Bound to 127.0.0.1 only.
//
// Enable it in Settings → Developer. Anyone holding the token can control
// the browser, so the token is generated locally and never leaves the file.

const http = require('http');
const crypto = require('crypto');
const { clipboard } = require('electron');

const PROTOCOL_VERSION = '2025-06-18';
const MAX_TEXT = 20000;

class MCPServer {
  constructor({ settings, tabs, history, engine, notify }) {
    this.settings = settings;
    this.tabs = tabs;
    this.history = history;
    this.engine = engine;   // may be null briefly during startup
    this.notify = notify;
    this.server = null;
    this.calls = 0;
  }

  get config() { return this.settings.get().mcp; }

  running() { return !!this.server; }

  start() {
    if (this.server) return;
    const cfg = this.config;
    if (!cfg.token) {
      // first enable: mint a token and persist it
      this.settings.set({ mcp: { token: crypto.randomBytes(24).toString('hex') } });
    }
    this.server = http.createServer((req, res) => this._route(req, res));
    this.server.on('error', (err) => {
      this.server = null;
      this.notify(`MCP server failed: ${err.message}`);
    });
    this.server.listen(cfg.port, '127.0.0.1', () => {
      this.notify(`MCP server listening on port ${cfg.port}`);
    });
  }

  stop() {
    if (!this.server) return;
    try { this.server.close(); } catch {}
    this.server = null;
  }

  apply() {
    const on = this.config.enabled;
    if (on && !this.server) this.start();
    if (!on && this.server) this.stop();
    return this.status();
  }

  status() {
    const cfg = this.config;
    return {
      running: this.running(),
      enabled: cfg.enabled,
      port: cfg.port,
      endpoint: `http://127.0.0.1:${cfg.port}/mcp`,
      token: cfg.token,
      tools: TOOLS.map(t => t.name),
      calls: this.calls,
    };
  }

  regenerateToken() {
    const token = crypto.randomBytes(24).toString('hex');
    this.settings.set({ mcp: { token } });
    return token;
  }

  _route(req, res) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
      });
      return res.end();
    }
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'POST JSON-RPC to /mcp' }));
    }
    // DNS-rebinding guard: only accept requests addressed to loopback.
    const host = (req.headers.host || '').split(':')[0];
    if (host !== '127.0.0.1' && host !== 'localhost') {
      res.writeHead(403, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'loopback only' }));
    }
    const cfg = this.config;
    const auth = req.headers.authorization || '';
    const want = `Bearer ${cfg.token}`;
    const okLen = auth.length === want.length;
    const okTok = okLen && crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(want));
    if (!okTok) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'bad token' }));
    }

    let body = '';
    let over = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > 1e6) { over = true; req.destroy(); }
    });
    req.on('end', async () => {
      if (over) return;
      let msg;
      try { msg = JSON.parse(body); } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }));
      }
      const result = await this._handle(msg).catch(err => ({
        error: { code: -32603, message: String(err.message || err) },
      }));
      if (msg && typeof msg === 'object' && msg.id === undefined) {
        res.writeHead(202, { 'content-type': 'application/json' });
        return res.end('{}');   // notification — no payload
      }
      res.writeHead(result && result.error ? 400 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg?.id ?? null, ...(result || {}) }));
    });
  }

  async _handle(msg) {
    const { method, params } = msg || {};
    switch (method) {
      case 'initialize':
        return {
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: 'neutrino', version: '0.1.0' },
          },
        };
      case 'notifications/initialized':
        return {};
      case 'ping':
        return { result: {} };
      case 'tools/list': {
        const cfg = this.config;
        const visible = TOOLS.filter(t => !(cfg.readOnly && t.write));
        return {
          result: {
            tools: visible.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        };
      }
      case 'tools/call': {
        const name = params?.name;
        const tool = TOOLS.find(t => t.name === name);
        if (!tool) return { error: { code: -32602, message: `unknown tool ${name}` } };
        if (this.config.readOnly && tool.write) {
          return { result: { content: [{ type: 'text', text: 'Blocked: the server is in read-only mode.' }], isError: true } };
        }
        this.calls++;
        try {
          const out = await tool.handler(params?.arguments || {}, this);
          return { result: out };
        } catch (err) {
          return { result: { content: [{ type: 'text', text: `Error: ${err.message || err}` }], isError: true } };
        }
      }
      default:
        return { error: { code: -32601, message: `method not found: ${method}` } };
    }
  }

  // -- helpers used by tools -------------------------------------------------

  _tab(id) {
    if (id === undefined || id === null || id === '') return this.tabs.activeTab();
    return this.tabs.tabs.get(String(id));
  }

  _tabInfo(t) {
    return {
      id: t.id, title: t.title, url: t.url, category: t.category,
      active: t.id === this.tabs.activeId, asleep: !t.live, parked: t.parked,
      audible: t.audible,
    };
  }
}

const TAB_SHAPE = {
  type: 'object',
  properties: { tabId: { type: 'string', description: 'Tab id; omit for the active tab' } },
};

const TOOLS = [
  {
    name: 'list_tabs',
    description: 'List all open browser tabs with id, title, url, category and state (active/asleep/parked).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: (_args, m) => ({
      content: [{ type: 'text', text: JSON.stringify([...m.tabs.tabs.values()].map(t => m._tabInfo(t)), null, 1) }],
    }),
  },
  {
    name: 'get_active_tab',
    description: 'Get the currently focused tab (title, url, id).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: (_args, m) => {
      const t = m.tabs.activeTab();
      if (!t) return { content: [{ type: 'text', text: 'No active tab' }] };
      return { content: [{ type: 'text', text: JSON.stringify(m._tabInfo(t)) }] };
    },
  },
  {
    name: 'open_tab',
    write: true,
    description: 'Open a URL in a new tab. Optionally set its category ("waste" parks it) and whether to focus it.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'URL or search query (normalized like the address bar)' },
        category: { type: 'string', description: 'Category id, e.g. main/work/research/waste' },
        activate: { type: 'boolean', description: 'Focus the tab (default true)' },
      },
    },
    handler: (args, m) => {
      const url = m.tabs.normalizeInput(String(args.url || ''));
      const id = m.tabs.create({
        url,
        category: args.category || m.settings.get().defaultCategory,
        activate: args.activate !== false,
      });
      return { content: [{ type: 'text', text: JSON.stringify({ tabId: id, url }) }] };
    },
  },
  {
    name: 'navigate',
    write: true,
    description: 'Navigate the active tab to a URL or search query.',
    inputSchema: { type: 'object', required: ['url'], properties: { url: { type: 'string' } } },
    handler: (args, m) => {
      const url = m.tabs.normalizeInput(String(args.url || ''));
      m.tabs.goto(url);
      return { content: [{ type: 'text', text: `Navigating to ${url}` }] };
    },
  },
  {
    name: 'activate_tab',
    write: true,
    description: 'Focus a tab (wakes it if asleep/parked).',
    inputSchema: { type: 'object', required: ['tabId'], properties: { tabId: { type: 'string' } } },
    handler: (args, m) => {
      if (!m.tabs.tabs.has(String(args.tabId))) throw new Error('no such tab');
      m.tabs.activate(String(args.tabId));
      return { content: [{ type: 'text', text: 'activated' }] };
    },
  },
  {
    name: 'close_tab',
    write: true,
    description: 'Close a tab.',
    inputSchema: { type: 'object', required: ['tabId'], properties: { tabId: { type: 'string' } } },
    handler: (args, m) => {
      m.tabs.close(String(args.tabId));
      return { content: [{ type: 'text', text: 'closed' }] };
    },
  },
  {
    name: 'read_page',
    description: 'Read the visible text content of a tab (max ~20k chars). Works on loaded tabs only.',
    inputSchema: TAB_SHAPE,
    handler: async (args, m) => {
      const t = m._tab(args.tabId);
      if (!t) throw new Error('no such tab');
      if (!t.view) throw new Error('tab is asleep — activate_tab first');
      const text = await Promise.race([
        t.view.webContents.executeJavaScript('document.body ? document.body.innerText : ""', false),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]).catch(err => { throw new Error(`read failed: ${err.message}`); });
      const clipped = String(text || '').slice(0, MAX_TEXT);
      return { content: [{ type: 'text', text: `${t.title}\n${t.url}\n\n${clipped}` }] };
    },
  },
  {
    name: 'screenshot',
    description: 'Capture a PNG screenshot of a loaded tab. Returns an image content block.',
    inputSchema: TAB_SHAPE,
    handler: async (args, m) => {
      const t = m._tab(args.tabId);
      if (!t) throw new Error('no such tab');
      if (!t.view) throw new Error('tab is asleep — activate_tab first');
      const img = await t.view.webContents.capturePage();
      const b64 = img.toPNG().toString('base64');
      return { content: [{ type: 'image', data: b64, mimeType: 'image/png' }] };
    },
  },
  {
    name: 'search_history',
    description: 'Search browsing history. Returns title/url/timestamp matches.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
    handler: (args, m) => ({
      content: [{ type: 'text', text: JSON.stringify(m.history.search(String(args.query || ''), 10), null, 1) }],
    }),
  },
  {
    name: 'run_command',
    write: true,
    description: 'Run a browser command: back, forward, reload, reloadHard, stop, home, zoomIn, zoomOut, zoomReset, toggleMute, suspendAll, clearParked.',
    inputSchema: { type: 'object', required: ['action'], properties: { action: { type: 'string' } } },
    handler: (args, m) => {
      const a = String(args.action || '');
      if (a === 'suspendAll') {
        const n = m.tabs.suspendAll();
        return { content: [{ type: 'text', text: `${n} tabs suspended` }] };
      }
      if (a === 'clearParked') { m.tabs.clearParked(); return { content: [{ type: 'text', text: 'parked tabs cleared' }] }; }
      if (['back', 'forward', 'reload', 'reloadHard', 'stop', 'home', 'zoomIn', 'zoomOut', 'zoomReset', 'toggleMute'].includes(a)) {
        m.tabs.nav(a);
        return { content: [{ type: 'text', text: `ran ${a}` }] };
      }
      throw new Error(`unknown action ${a}`);
    },
  },
  {
    name: 'get_stats',
    description: 'Browser stats: memory usage, live/asleep/parked tab counts, ads blocked.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: (_args, m) => {
      const snap = m.tabs.snapshot();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            tabs: snap.tabs.length,
            live: snap.tabs.filter(t => t.live).length,
            parked: snap.tabs.filter(t => t.parked).length,
            blockedRequests: m.engine ? m.engine.stats.blocked : 0,
            filterRules: m.engine ? m.engine.stats.rules : 0,
            categories: m.settings.get().categories.map(c => c.id),
          }, null, 1),
        }],
      };
    },
  },
];

module.exports = { MCPServer };
