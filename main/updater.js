'use strict';
// Self-updater. Talks to this project's GitHub releases — same no-npm rule as
// everything else: plain HTTPS + tar, nothing executed from a registry.
//
//  - `check()`  asks api.github.com for the latest release and compares
//    versions with the running app.
//  - `apply()`  works only for MANAGED installs (installed via install.sh,
//    which drops a `.neutrino-managed` marker). It downloads the release
//    tarball, stages it next to the app dir, carries the cached Electron
//    runtime across, swaps the directories with rollback, and relaunches.
//    Manual installs (dev checkouts) just get the releases page opened.

const { app, net, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO = process.env.NEUTRINO_REPO || 'ION-FX/Neutrino';

function parseVersion(v) {
  return String(v).replace(/^v/, '').split(/[.-]/).map(n => parseInt(n, 10) || 0);
}

function isNewer(current, candidate) {
  const a = parseVersion(current), b = parseVersion(candidate);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] || 0) - (a[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

class Updater {
  constructor({ settings, notify }) {
    this.settings = settings;
    this.notify = notify;
    this.last = null;   // last check result
    this.busy = false;
  }

  managed() {
    return fs.existsSync(path.join(app.getAppPath(), '.neutrino-managed'));
  }

  status() {
    return {
      current: app.getVersion(),
      latest: this.last?.version || null,
      updateAvailable: !!(this.last && this.last.updateAvailable),
      managed: this.managed(),
      busy: this.busy,
      lastCheck: this.settings.get().updates?.lastCheck || 0,
      notes: this.last?.notes || '',
      error: this.last?.error || null,
    };
  }

  async check() {
    if (this.busy) return this.status();
    this.busy = true;
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { 'User-Agent': 'Neutrino-Updater', 'Accept': 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const rel = await res.json();
      const version = String(rel.tag_name || '').replace(/^v/, '');
      const asset = (rel.assets || []).find(a => a.name === `neutrino-${version}.tar.gz`);
      this.last = {
        version,
        notes: rel.name || '',
        url: rel.html_url,
        assetUrl: asset?.browser_download_url || null,
        updateAvailable: isNewer(app.getVersion(), version),
      };
      this.settings.set({ updates: { lastCheck: Date.now() } });
      if (this.last.updateAvailable) {
        this.notify(`Neutrino v${version} is available — Settings → Updates`);
      }
      return this.status();
    } catch (err) {
      this.last = { ...(this.last || {}), error: String(err.message || err) };
      return this.status();
    } finally {
      this.busy = false;
    }
  }

  async apply() {
    const info = this.last;
    if (!this.managed()) {
      // dev checkout or unknown install method — send the user to releases
      shell.openExternal(`https://github.com/${REPO}/releases`);
      return { ok: false, manual: true };
    }
    if (!info?.updateAvailable) throw new Error('no update available');
    if (!info.assetUrl) throw new Error('release has no installable asset');
    if (this.busy) throw new Error('update already in progress');
    this.busy = true;
    try {
      const appPath = app.getAppPath();
      const parent = path.dirname(appPath);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neutrino-update-'));

      this.notify(`Downloading Neutrino v${info.version}…`);
      const res = await net.fetch(info.assetUrl);
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
      const tarball = path.join(tmp, 'update.tar.gz');
      fs.writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));

      this.notify('Applying update…');
      const staging = path.join(parent, '.neutrino-update');
      fs.rmSync(staging, { recursive: true, force: true });
      fs.mkdirSync(staging, { recursive: true });
      execSync(`tar -xzf "${tarball}" -C "${staging}"`);
      const newPkg = JSON.parse(fs.readFileSync(path.join(staging, 'package.json'), 'utf8'));
      if (newPkg.version !== info.version) {
        throw new Error(`staged version ${newPkg.version} != expected ${info.version}`);
      }

      // carry the cached Electron runtime across so the next launch is offline-ready
      const runtime = path.join(appPath, '.runtime');
      if (fs.existsSync(runtime)) fs.renameSync(runtime, path.join(staging, '.runtime'));
      fs.writeFileSync(path.join(staging, '.neutrino-managed'), 'managed');

      // swap with rollback
      const backup = path.join(parent, `.neutrino-backup-${Date.now()}`);
      fs.renameSync(appPath, backup);
      try {
        fs.renameSync(staging, appPath);
      } catch (err) {
        fs.renameSync(backup, appPath);
        throw err;
      }
      fs.rmSync(backup, { recursive: true, force: true });
      fs.rmSync(tmp, { recursive: true, force: true });

      this.notify(`Updated to v${info.version} — restarting…`);
      console.log('UPDATE_APPLIED', info.version);
      // relaunch with an absolute app path; carry only real switches across
      // (run.sh execs `electron [--no-sandbox] . <flags>`, so argv[1] may be
      // --no-sandbox and argv[2] is the app path itself)
      const argv = process.argv.slice(1);
      const flags = argv.filter(a => a.startsWith('--'));
      app.relaunch({ args: [appPath, ...new Set(flags)] });
      app.exit(0);
      return { ok: true, version: info.version };
    } finally {
      this.busy = false;
    }
  }
}

module.exports = { Updater, REPO };
