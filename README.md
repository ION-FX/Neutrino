# Neutrino

A memory-conscious Chromium browser with the tabs on the left, a built-in
adblocker, real extension support, and two themes: **dark Liquid Glass** and
**Galaxy**.

Built on Electron (Chromium). **Zero npm packages** — no `node_modules`, no
dependency resolution, nothing executes from the npm registry. The runtime is
downloaded straight from the official `electron/electron` GitHub release
artifacts, and every line of app code is dependency-free vanilla JS.

## Quick start (Linux)

One-liner install (no npm, no root — grabs the latest release, links the
`neutrino` command, pre-fetches the Electron runtime so the first launch is
instant):

```bash
curl -fsSL https://raw.githubusercontent.com/ION-FX/Neutrino/main/install.sh | bash
```

Or from a clone of this repo:

```bash
./run.sh
```

First run fetches the Electron runtime (~120 MB) from GitHub releases into
`.runtime/`. After that it's fully offline. System requirements: GTK3, NSS,
ALSA, libgbm — the usual set (`libgtk-3-0 libnss3 libasound2 libgbm1` on
Debian/Ubuntu).

macOS / Windows: download the Electron zip yourself from
https://github.com/electron/electron/releases, then run
`NEUTRINO_ELECTRON=/path/to/electron ./run.sh` (or `electron .` on Windows).

## Updates

Installed via the one-liner? Neutrino keeps itself fresh:

- Checks GitHub releases once a day, or on demand via
  **Settings → Updates → Check for updates** (also in the ⋯ menu and the
  Ctrl+K palette).
- When an update is found it downloads the release tarball, stages it next to
  the install, carries the cached Electron runtime across, swaps the
  directories atomically (rollback on failure) and relaunches.
- Your data is untouched — it all lives in `~/.neutrino`.
- Not a managed install (dev checkout)? The check still works, but "update"
  opens the releases page instead of touching your files.

## The memory story

Chrome-family browsers keep a renderer alive for *every* tab. Neutrino treats
memory as the scarce resource it is:

- **Tab suspension** — background tabs idle for 10 minutes (configurable)
  are put to sleep: the renderer process is destroyed and only
  `{url, title, favicon}` is kept. Click the tab and it reloads. Tabs playing
  audio are exempt by default.
- **Lazy session restore** — on startup, restored tabs don't load. They sit in
  the sidebar (moon icon) and load the moment you click them.
- **Waste category, parked tabs** — tabs in *Waste* are "parked": they are
  saved with the session, stay visible and findable (Ctrl+K), but never load
  on restart. Click one to wake it.
- **Renderer process cap** — optional Chromium switch to share fewer
  renderer processes between sites (Settings → Tabs & memory).
- Live stats in the sidebar footer: asleep count, RSS, and cumulative MB
  reclaimed by suspension.

Honest note: a foreground YouTube tab still uses what YouTube uses — no
browser can change that. What Neutrino fixes is the *other* thirty tabs.

## Built-in adblocker + normal add-ons

- The built-in blocker ships with a curated core list and understands
  EasyList syntax (`||host^`, exceptions, `$options`, cosmetic `##` rules).
  Add EasyList or any ABP-compatible list in Settings → Blocking & privacy.
- Strict tracking protection strips third-party cookies/referrers.
- For everything else, drop **unpacked** Chrome extension folders into
  `~/.neutrino/extensions/` and restart — content scripts and webRequest
  blockers work (uBlock Origin is the classic choice, and is the right tool
  for YouTube's same-domain video ads). Manage them in Settings → Extensions.

## Design

- Tabs on the left in a floating glass rail; categories group them
  (Main / Work / Research / Waste — fully customizable, rename/recolor/add).
- A slim **top bar** above the page holds the address bar and back/forward/
  reload/palette/menu (turn it off in Settings → Appearance if you prefer the
  Arc-style no-bar look; everything then lives in the sidebar).
- Window controls (– □ ✕) always float at the window's top-right corner,
  whatever the layout; the whole chip is a drag handle.
- Tab names can be turned off entirely (Settings → Appearance) for an
  icon-only rail.
- **Liquid Glass**: dark translucent panels, blur, drifting color fields.
- **Galaxy**: nebula gradients, twinkling starfield, shooting stars.
- Customizable: accent color, density, sidebar width, motion, themes.
- Ctrl+Shift+D toggles themes. Ctrl+K opens the everything-palette. F1 shows
  the keyboard/mouse cheat sheet.

## Fully usable with keyboard only — or mouse only

- **Keyboard**: Ctrl+K palette runs everything (type a URL to "go to", or pick
  from tabs / parked tabs / history / 17 commands). Ctrl+1–9 jump to tabs,
  Alt+↑/↓ or Ctrl+Tab cycle them, Ctrl+F finds in page, Ctrl+M mutes,
  Ctrl+=/-/0 zoom, F1 cheat sheet.
- **Mouse**: right-click a page for the context menu (back/forward/reload,
  open link in new tab or straight into Waste, copy, zoom, suspend, close),
  mouse thumb buttons navigate back/forward, middle-click closes tabs, and
  every sidebar/palette action is clickable.

## Settings overview

- **Appearance** — Liquid Glass / Galaxy themes, accent color, **tab sidebar
  position (left or right)**, top bar on/off, glass transparency slider,
  corner roundness, tab names (icon-only mode), compact density, reduce
  motion, interface size (90–125%), default page zoom, sidebar width,
  new-tab clock.
- **Quick links** — the tiles on the new-tab page.
- **Tabs & memory** — auto-suspend timer, suspend-audible, lazy restore,
  renderer process cap, sleep notifications, suspend-now button, live stats.
- **Downloads** — ask where to save each file, or auto-save to Downloads.
- **Blocking & privacy** — built-in blocker, cosmetic filtering, strict
  tracking protection, filter-list manager (add any ABP-compatible list).
- **Extensions** — manage unpacked Chrome extensions.
- **Categories** — rename, recolor, add, delete; default category.
- **Startup & search** — session restore, which categories restore, search
  engine, custom engine URL.
- **Data & privacy** — clear cache/cookies/history now or automatically on
  exit; open the data folder.
- **Developer** — the MCP server (above).

## MCP server for AI models (Settings → Developer)

Flip on **Enable MCP server** and Neutrino exposes itself as a local
[Model Context Protocol](https://modelcontextprotocol.io) server so agents
(Claude, custom scripts, any MCP client) can drive the browser:

- Endpoint `http://127.0.0.1:<port>/mcp` (loopback only), bearer token
  auto-generated, regenerable, shown in Settings → Developer.
- Tools: `list_tabs`, `get_active_tab`, `open_tab`, `navigate`,
  `activate_tab`, `close_tab`, `read_page` (visible text), `screenshot`
  (PNG), `search_history`, `run_command` (back/reload/zoom/mute/suspend
  all/clear parked…), `get_stats` (memory + blocked counts).
- **Read-only mode** restricts agents to the read tools (list, read,
  screenshot, history, stats) — they can't open, close or navigate.
- A quick documentation panel lives right in Settings → Developer: what MCP
  is, 3-step client setup with a copy-paste config, the tool reference, and
  security notes.
- Client config snippet and a live "calls served" counter are in the panel.

```bash
curl http://127.0.0.1:47629/mcp \
  -H "Authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Keyboard

| Shortcut | Action |
|---|---|
| Ctrl+T / Ctrl+W | new tab / close tab |
| Ctrl+Shift+T | duplicate tab |
| Ctrl+Tab / Ctrl+Shift+Tab, Alt+↑/↓ | next / previous tab |
| Ctrl+1 … Ctrl+9 | jump to tab 1–9 |
| Ctrl+L | focus address bar |
| Ctrl+K | palette (tabs, parked, history, commands, "go to …") |
| Ctrl+F | find in page (typed in the omnibox, Enter/Shift+Enter to jump) |
| Ctrl+R / Ctrl+Shift+R | reload / hard reload |
| Ctrl+= / Ctrl+- / Ctrl+0 | zoom in / out / reset |
| Ctrl+M | mute / unmute tab |
| Ctrl+, | settings |
| Ctrl+Shift+D | toggle theme |
| F1 | keyboard & mouse cheat sheet |
| F12 / Ctrl+Shift+I | devtools of the page |

## Layout of the repo

```
main/        main process (tabs, suspension, session, adblock engine,
             extensions, IPC, protocol handler)
ui/          chrome renderer (sidebar, themes, palette, settings drawer)
ui/ntp/      the neutrino://newtab page
filters/     bundled filter list
preload.js   contextBridge (allowlisted IPC only)
run.sh       launcher (fetches runtime from GitHub, never npm)
scripts/     dev helpers (headless CI setup for this repo's VM)
```

All user data lives in `~/.neutrino` (settings, session, history, filter
caches, extensions, Chromium profile).

## Limitations (v0.1)

- Extensions load from unpacked folders; toolbar popups of extensions are not
  wired to a browser toolbar (options pages work).
- Suspending a tab drops its back-history (it restores by URL).
- Drag-resizing only the sidebar, not repositioning it, in this version.

MIT licensed. "Chromium" and "Electron" belong to their respective projects;
Neutrino is an independent browser shell built on them.
