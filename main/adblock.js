'use strict';
// Neutrino's built-in content blocker. Pure JS, zero dependencies.
// Understands the useful core of Adblock Plus / EasyList syntax:
//   ||host^ anchors, |start / end| anchors, * and ^ wildcards,
//   $options (domain=, third-party, image, script, stylesheet,
//   xmlhttprequest, subdocument, websocket, document, popup),
//   @@exceptions, ##cosmetic and #@#cosmetic-exceptions.
// Rules are bucketed by the literal host after ||, so even huge lists
// (EasyList ~90k rules) match with only a few dozen candidate checks
// per request plus a bounded decision cache.

const SEP = '[^a-zA-Z0-9._%~-]'; // what ^ means in a pattern

const TYPE_MAP = {
  mainFrame: 'document', subFrame: 'subdocument', stylesheet: 'stylesheet',
  script: 'script', image: 'image', fetch: 'xmlhttprequest', xhr: 'xmlhttprequest',
  websocket: 'websocket', font: 'font', media: 'other', other: 'other',
  ping: 'other', covenant: 'other',
};

function hostLabels(host) {
  const parts = host.split('.');
  const out = [];
  for (let i = Math.max(0, parts.length - 6); i < parts.length; i++) {
    out.push(parts.slice(i).join('.'));
  }
  return out;
}

function compilePattern(p) {
  // Returns a RegExp or a literal substring (fast path).
  if (!/[*^|]/.test(p)) return { sub: p.toLowerCase() };
  let src = '';
  for (const ch of p) {
    if (ch === '*') src += '.*';
    else if (ch === '^') src += SEP;
    else src += ch.replace(/[.+?()[\]{}\\$]/g, '\\$&');
  }
  try { return { re: new RegExp(src, 'i') }; } catch { return null; }
}

function parseOptions(optString) {
  const opts = { domains: null, types: null, thirdParty: null };
  for (const raw of optString.split(',')) {
    const o = raw.trim().toLowerCase();
    if (!o) continue;
    const neg = o.startsWith('~');
    const val = neg ? o.slice(1) : o;
    if (val.startsWith('domain=')) {
      opts.domains = { include: [], exclude: [] };
      for (const d of val.slice(7).split('|')) {
        if (!d) continue;
        if (d.startsWith('~')) opts.domains.exclude.push(d.slice(1));
        else opts.domains.include.push(d);
      }
    } else if (val === 'third-party') opts.thirdParty = !neg;
    else if (val === 'first-party') opts.thirdParty = neg;
    else if (TYPE_MAP[val] || val === 'popup' || val === 'genericblock') {
      (opts.types ||= new Set()).add(val === 'popup' ? 'popup' : TYPE_MAP[val]);
    }
    // unknown options (important, redirect=..., csp=...) — treat as generic
  }
  return opts;
}

class Rule {
  constructor(raw, isException) {
    this.raw = raw;
    this.exception = isException;
    let body = raw;
    let options = null;

    const dol = raw.lastIndexOf('$');
    if (dol > 0 && !raw.slice(dol + 1).includes('/')) {
      const maybe = raw.slice(dol + 1);
      if (/^[a-z-]*(=?[a-z0-9.*~|,-]*)?(,[a-z-]+(=[a-z0-9.*~|,-]*)?)*$/i.test(maybe)) {
        body = raw.slice(0, dol);
        options = parseOptions(maybe);
      }
    }
    this.options = options;

    if (body.startsWith('||')) {
      const rest = body.slice(2);
      const slash = rest.search(/[/^*?]/);
      const hostPart = slash === -1 ? rest : rest.slice(0, slash);
      const pathPart = slash === -1 ? '' : rest.slice(slash);
      this.host = hostPart.toLowerCase();
      const pat = compilePattern(pathPart);
      this.path = pat;
    } else {
      let p = body;
      const anchorStart = p.startsWith('|');
      const anchorEnd = p.endsWith('|') && p.length > 1;
      if (anchorStart) p = p.slice(1);
      if (anchorEnd) p = p.slice(0, -1);
      const pat = compilePattern(p);
      if (pat?.sub) {
        if (anchorStart && anchorEnd) this.exactStr = pat.sub;
        else if (anchorStart) this.startStr = pat.sub;
        else if (anchorEnd) this.endStr = pat.sub;
        else this.anyStr = pat.sub;
      } else if (pat?.re) {
        const src = (anchorStart ? '^' : '') + pat.re.source + (anchorEnd ? '$' : '');
        try { this.anyRe = new RegExp(src, 'i'); } catch {}
      }
    }
  }

  test(u) { // u = {href (lowercased), host}
    if (this.host !== undefined) {
      if (!this.host) return true;
      if (u.host !== this.host && !u.host.endsWith('.' + this.host)) return false;
      if (!this.path) return true;
      const tail = u.href.slice(u.href.indexOf(u.host) + u.host.length);
      return this.path.sub !== undefined
        ? tail.includes(this.path.sub)
        : this.path.re ? this.path.re.test(tail) : false;
    }
    if (this.exactStr !== undefined) return u.href === this.exactStr;
    if (this.startStr !== undefined) return u.href.startsWith(this.startStr);
    if (this.endStr !== undefined) return u.href.endsWith(this.endStr);
    if (this.anyStr !== undefined) return u.href.includes(this.anyStr);
    if (this.anyRe) return this.anyRe.test(u.href);
    return false;
  }

  allowsType(t) {
    if (!this.options?.types) return true;
    if (t === 'document' || t === 'popup') return this.options.types.has(t);
    return this.options.types.has(t) || this.options.types.has('popup');
  }

  matchesDomain(siteHost) {
    const d = this.options?.domains;
    if (!d) return true;
    if (d.exclude.some(x => siteHost === x || siteHost.endsWith('.' + x))) return false;
    if (!d.include.length) return true;
    return d.include.some(x => siteHost === x || siteHost.endsWith('.' + x));
  }

  matchesParty(third) {
    if (this.options?.thirdParty === null || this.options?.thirdParty === undefined) return true;
    return this.options.thirdParty === third;
  }

  get valid() {
    if (this.host !== undefined) return !this.path || this.path.sub !== undefined || !!this.path.re;
    return ['exactStr', 'startStr', 'endStr', 'anyStr', 'anyRe'].some(k => this[k] !== undefined);
  }
}

class FilterEngine {
  constructor() {
    this.net = { host: new Map(), generic: [] };      // blocking rules
    this.exc = { host: new Map(), generic: [] };      // exceptions
    this.cosmeticGeneric = [];
    this.cosmeticExcGeneric = [];
    this.cosmetic = new Map();  // host -> selectors[]
    this.cosmeticExc = new Map();
    this.cache = new Map();
    this.stats = { blocked: 0, cosmeticHidden: 0, rules: 0, lastUpdated: null };
  }

  parse(text) {
    for (const rawLine of text.split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;
      if (line.startsWith('##') || line.includes('##') || line.includes('#@#')) {
        this._parseCosmetic(line);
        continue;
      }
      const isExc = line.startsWith('@@');
      if (isExc) line = line.slice(2);
      // unsupported: uBO-specific directives. Bare /…/ rules are ambiguous
      // (pattern vs regex); we treat them as plain substring patterns, which
      // is the safer reading for the lists users actually add.
      if (line.includes('$redirect') || line.includes('$badfilter') || line.startsWith('.*')) continue;
      const rule = new Rule(line, isExc);
      if (!rule.valid) continue;
      const store = isExc ? this.exc : this.net;
      if (rule.host) {
        let b = store.host.get(rule.host);
        if (!b) store.host.set(rule.host, (b = []));
        b.push(rule);
      } else {
        store.generic.push(rule);
      }
      this.stats.rules++;
    }
    this.cache.clear();
  }

  _parseCosmetic(line) {
    let exception = false;
    let sepIdx = line.indexOf('#@#');
    if (sepIdx !== -1) exception = true;
    else sepIdx = line.indexOf('##');
    if (sepIdx === -1) return;
    const domains = line.slice(0, sepIdx).trim();
    const selectors = line.slice(sepIdx + (exception ? 3 : 2)).split(',').map(s => s.trim()).filter(Boolean);
    if (!selectors.length) return;
    if (!domains) {
      (exception ? this.cosmeticExcGeneric : this.cosmeticGeneric).push(...selectors);
      return;
    }
    const map = exception ? this.cosmeticExc : this.cosmetic;
    for (const d of domains.split(',')) {
      const host = d.replace(/^~/, '').trim().toLowerCase();
      if (!host) continue;
      let arr = map.get(host);
      if (!arr) map.set(host, (arr = []));
      arr.push(...selectors);
    }
  }

  _candidates(u) {
    const out = [];
    for (const h of hostLabels(u.host)) {
      const b = this.net.host.get(h);
      if (b) out.push(...b);
    }
    out.push(...this.net.generic);
    return out;
  }

  _exceptions(u) {
    const out = [];
    for (const h of hostLabels(u.host)) {
      const b = this.exc.host.get(h);
      if (b) out.push(...b);
    }
    out.push(...this.exc.generic);
    return out;
  }

  match(rawUrl, reqType, siteHost) {
    if (this.stats.rules === 0) return false;
    const key = `${siteHost}>${reqType}>${rawUrl}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    let url;
    try { url = new URL(rawUrl); } catch { return false; }
    const u = { href: rawUrl.toLowerCase(), host: url.hostname.toLowerCase() };
    const third = !siteHost || u.host !== siteHost && !siteHost.endsWith('.' + u.host) && !u.host.endsWith('.' + siteHost);

    let block = false;
    for (const r of this._candidates(u)) {
      if (r.test(u) && r.allowsType(reqType) && r.matchesDomain(siteHost) && r.matchesParty(third)) {
        block = true;
        break;
      }
    }
    if (block) {
      for (const r of this._exceptions(u)) {
        if (r.test(u) && r.allowsType(reqType) && r.matchesDomain(siteHost) && r.matchesParty(third)) {
          block = false;
          break;
        }
      }
    }
    if (this.cache.size > 40000) this.cache.clear();
    this.cache.set(key, block);
    return block;
  }

  cosmeticCSS(siteHost) {
    const hide = new Set(this.cosmeticGeneric);
    const unhide = new Set(this.cosmeticExcGeneric);
    const grab = (map, host) => {
      for (const h of hostLabels(host)) {
        const arr = map.get(h);
        if (arr) for (const s of arr) (map === this.cosmetic ? hide : unhide).add(s);
      }
    };
    grab(this.cosmetic, siteHost);
    grab(this.cosmeticExc, siteHost);
    for (const s of unhide) hide.delete(s);
    if (!hide.size) return '';
    const sel = [...hide].join(',\n');
    this.stats.cosmeticHidden++;
    return `${sel} { display: none !important; visibility: hidden !important; }`;
  }
}

// ---- webRequest integration -------------------------------------------------
//
// NOTE: only cancel-style blocking (onBeforeRequest) is used here. Rewriting
// request headers via onBeforeSendHeaders deadlocks Electron when a fresh
// renderer loads an external page (verified on Electron 44), so third-party
// cookie blocking is done with Chromium's own network-stack switch instead
// (see main.js, applied at startup).

function attachBlocker({ session, engine, settings, getSiteHost, onStats }) {
  const urlSpec = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };
  let dirty = false;

  const specFor = (details) => {
    const site = getSiteHost(details) || '';
    return site.toLowerCase().replace(/^www\./, '');
  };

  session.webRequest.onBeforeRequest(urlSpec, (details, callback) => {
    // Never answer synchronously from inside the listener — doing so while a
    // renderer is being created can deadlock Electron's IO thread.
    setImmediate(() => {
      const ab = settings.get().adblock;
      if (!ab.enabled || details.resourceType === 'mainFrame') return callback({});
      const type = TYPE_MAP[details.resourceType] || 'other';
      const site = specFor(details);
      if (engine.match(details.url, type, site)) {
        engine.stats.blocked++;
        dirty = true;
        callback({ cancel: true });
      } else {
        callback({});
      }
    });
  });

  setInterval(() => { if (dirty) { dirty = false; onStats(engine.stats); } }, 1500);
  return engine;
}

module.exports = { FilterEngine, attachBlocker, TYPE_MAP };
