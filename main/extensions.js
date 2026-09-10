'use strict';
// Support for normal (Chrome) add-ons: drop an *unpacked* extension folder
// into ~/.neutrino/extensions and it loads through Chromium's extension
// system. Content scripts, webRequest-based blockers (uBlock Origin),
// devtools extensions etc. work through Electron's supported subset.
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

class ExtensionManager {
  constructor({ session, paths, tabCreate }) {
    this.session = session;
    this.dir = paths.extensions;
    this.tabCreate = tabCreate;
    this.loaded = new Map(); // id -> {id,name,version,path,manifest}
  }

  async loadAll() {
    let entries = [];
    try { entries = fs.readdirSync(this.dir, { withFileTypes: true }); } catch {}
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const full = path.join(this.dir, ent.name);
      if (!fs.existsSync(path.join(full, 'manifest.json'))) continue;
      await this.load(full);
    }
    return [...this.loaded.values()];
  }

  async load(fullPath) {
    try {
      const ext = await this.session.loadExtension(fullPath, { allowFileAccess: false });
      this.loaded.set(ext.id, {
        id: ext.id, name: ext.name, version: ext.version,
        path: fullPath, manifest: ext.manifest,
      });
      return this.loaded.get(ext.id);
    } catch (err) {
      return { id: path.basename(fullPath), name: path.basename(fullPath),
               version: '', path: fullPath, error: String(err.message || err) };
    }
  }

  async reload(id) {
    const info = this.loaded.get(id);
    if (!info) return;
    try { await this.session.removeExtension(id); } catch {}
    this.loaded.delete(id);
    return this.load(info.path);
  }

  list() {
    return [...this.loaded.values()].map(e => ({
      id: e.id, name: e.name, version: e.version, error: e.error || null,
      hasOptions: !!(e.manifest?.options_ui?.page || e.manifest?.options_page),
    }));
  }

  openOptions(id) {
    const e = this.loaded.get(id);
    if (!e) return;
    const page = e.manifest?.options_ui?.page || e.manifest?.options_page;
    if (!page) return;
    const url = `chrome-extension://${e.id}/${String(page).replace(/^\//, '')}`;
    this.tabCreate({ url });
  }

  openFolder() { shell.openPath(this.dir); }
}

module.exports = { ExtensionManager };
