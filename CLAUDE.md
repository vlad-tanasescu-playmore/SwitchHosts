# SwitchHosts — CLAUDE.md

## What is this project

SwitchHosts is an open-source **Electron desktop app** for managing the system `hosts` file.
It allows creating multiple hosts profiles and switching between them instantly.

- Homepage: https://switchhosts.vercel.app
- GitHub (original): https://github.com/oldj/SwitchHosts
- GitHub (this fork): https://github.com/vlad-tanasescu-playmore/SwitchHosts

**Usage on this workstation:** Used to redirect production domains (e.g. `catena.ro`, `tonica.ro`) to
the box2 development server (`10.0.52.232`) for local testing without changing DNS.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Desktop shell | Electron | 39 |
| UI framework | React | 19 |
| UI components | Mantine | 8 |
| State management | Jotai | 2 |
| Local HTTP server | Hono + @hono/node-server | 4.x |
| Storage / DB | potdb | 2.x |
| Build tool | Vite | 7 |
| Tests | Vitest | 3 |
| Language | TypeScript | 5.9 |
| Styling | SCSS modules | — |
| Routing (renderer) | react-router (hash-based) | 7 |
| Icons | Tabler Icons + react-icons | — |

---

## Project Structure

```
switchhosts/
├── src/
│   ├── main/                  # Electron main process (Node.js context)
│   │   ├── main.ts            # App entry point — BrowserWindow, app lifecycle
│   │   ├── preload.ts         # Preload bridge (contextBridge → window._agent)
│   │   ├── actions/           # IPC action handlers (called from renderer via _agent.call)
│   │   │   ├── index.ts       # Exports all actions
│   │   │   ├── config/        # Read/write app configuration (get, set, update, all)
│   │   │   ├── hosts/         # Hosts file operations (get/set content, system hosts, history)
│   │   │   ├── list/          # Hosts list CRUD (getList, setList, getItem, move to trashcan)
│   │   │   ├── trashcan/      # Trashcan operations
│   │   │   ├── cmd/           # Run shell command after hosts apply
│   │   │   ├── find/          # Find-in-hosts actions
│   │   │   ├── migrate/       # Data migration across versions
│   │   │   └── *.ts           # Other actions: ping, update check, tray, etc.
│   │   ├── core/              # Core services
│   │   │   ├── agent.ts       # IPC router — receives x_action, x_broadcast, x_popup_menu
│   │   │   ├── message.ts     # Event broadcast to all renderer windows
│   │   │   ├── popupMenu.ts   # Context menu handler
│   │   │   └── updater.ts     # Auto-update logic (electron-updater)
│   │   ├── data/
│   │   │   └── index.ts       # PotDb instances: localdb, cfgdb, swhdb (3 separate DBs)
│   │   ├── http/              # Optional local HTTP API (Hono server, port 50761)
│   │   │   ├── index.ts       # Server start/stop, middleware
│   │   │   └── api/
│   │   │       ├── index.ts   # Route registration
│   │   │       ├── list.ts    # GET /api/list — returns all hosts items (flattened)
│   │   │       └── toggle.ts  # GET /api/toggle?id=XXX — toggle a hosts item on/off
│   │   ├── libs/              # Utilities for main process
│   │   │   ├── cron.ts        # Background timer: refresh remote hosts, check updates
│   │   │   ├── getIndex.ts    # Returns renderer HTML URL (dev: localhost, prod: file://)
│   │   │   ├── isDev.ts       # Detect development mode
│   │   │   ├── tracer.ts      # Usage analytics (opt-in)
│   │   │   ├── request.ts     # Axios wrapper for fetching remote hosts
│   │   │   ├── safePSWD.ts    # Sudo password helpers (macOS/Linux)
│   │   │   ├── getDataDir.ts  # Resolve ~/.SwitchHosts/data path
│   │   │   └── getConfigDir.ts
│   │   └── ui/                # Window/tray/menu creation (main process side)
│   │       ├── menu.ts        # Native app menu
│   │       ├── tray.ts        # System tray icon
│   │       └── find.ts        # Separate find window (BrowserWindow)
│   │
│   ├── renderer/              # React UI (browser context, runs in Electron renderer)
│   │   ├── index.tsx          # App root — MantineProvider + hash router
│   │   ├── index.html         # HTML template
│   │   ├── pages/             # Route pages
│   │   │   ├── index.tsx      # Main window (/)
│   │   │   ├── find.tsx       # Find panel (/find)
│   │   │   └── tray.tsx       # Tray mini-window (/tray)
│   │   ├── components/        # UI components
│   │   │   ├── LeftPanel/     # Sidebar with hosts list tree
│   │   │   ├── MainPanel/     # Editor panel (right side)
│   │   │   ├── TopBar/        # Top toolbar
│   │   │   ├── Tree/          # Tree view component
│   │   │   ├── Editor/        # CodeJar-based hosts editor with syntax highlight
│   │   │   ├── List/          # Hosts list items
│   │   │   ├── Pref/          # Preferences dialog
│   │   │   ├── About/         # About dialog
│   │   │   ├── History.tsx    # Hosts edit history viewer
│   │   │   ├── HostsViewer.tsx
│   │   │   ├── SwitchButton.tsx
│   │   │   ├── Transfer.tsx   # Import/export
│   │   │   └── ...
│   │   ├── stores/            # Jotai atoms (global state)
│   │   │   ├── configs.ts     # configs_atom — app configuration
│   │   │   ├── hosts_data.ts  # hosts_data_atom, current_hosts_atom
│   │   │   └── i18n.ts
│   │   ├── models/            # Custom hooks that use atoms
│   │   │   ├── useConfigs.ts  # Read/write configs via IPC
│   │   │   ├── useHostsData.ts
│   │   │   └── useI18n.ts
│   │   ├── core/
│   │   │   ├── agent.ts       # window._agent wrapper (typed IPC calls)
│   │   │   ├── PopupMenu.ts
│   │   │   └── useOnBroadcast.ts
│   │   ├── utils/
│   │   │   └── css-var.ts
│   │   └── styles/
│   │       └── global.scss
│   │
│   └── common/                # Shared between main and renderer
│       ├── constants.ts       # URLs, http_api_port (50761)
│       ├── data.d.ts          # Core interfaces: IHostsListObject, IHostsContentObject, etc.
│       ├── default_configs.ts # All config keys with defaults (ConfigsType)
│       ├── events.ts          # Event name constants (used for IPC broadcast)
│       ├── hostsFn.ts         # Pure functions: flatten, findItemById, updateOneItem, etc.
│       ├── normalize.ts       # Hosts content normalization
│       ├── newlines.ts        # Line ending handling
│       ├── tree.ts            # Tree node utilities
│       ├── update.ts          # Version comparison helpers
│       └── i18n/              # Translations (en, zh-Hans, zh-Hant, etc.)
│
├── test/                      # Vitest tests
│   ├── setup.ts               # Test setup (tmp dir cleanup)
│   ├── common/                # Tests for src/common/
│   └── main/                  # Tests for src/main/
│
├── assets/                    # App icons (PNG)
├── scripts/                   # Build scripts (version-up, make, upload-release)
├── vite.main.config.mts       # Vite config for main process (CJS output → build/)
├── vite.render.config.mts     # Vite config for renderer (ESM output → build/)
├── vitest.config.mts          # Vitest config
├── tsconfig.json              # TypeScript config
└── package.json
```

---

## IPC Architecture

Electron enforces strict process separation. Communication works like this:

```
Renderer (React)
  → window._agent.call('actionName', ...params)    [preload.ts: ipcRenderer.send('x_action')]
  → Main process: core/agent.ts ipcMain.on('x_action')
  → Calls the matching function from src/main/actions/
  → Returns result via ipcRenderer.send(callback, err, data)

Broadcast (main → all renderers):
  core/message.ts → broadcast(event, ...args) → ipcMain sends 'y_broadcast' to all windows
  → preload.ts EventEmitter emits the event
  → renderer: window._agent.on(event, handler) / useOnBroadcast(event, handler)
```

IPC channel names: `x_action`, `x_broadcast`, `x_popup_menu`, `x_reg`, `x_unreg`, `y_broadcast`

---

## Data Model

**Core types** (`src/common/data.d.ts`):

```typescript
type HostsType = 'local' | 'remote' | 'group' | 'folder'

interface IHostsListObject {
  id: string
  title?: string
  on?: boolean           // enabled/disabled
  type?: HostsType
  url?: string           // remote: fetch URL
  refresh_interval?: number // remote: auto-refresh (seconds)
  include?: string[]     // group: list of included item IDs
  folder_mode?: 0|1|2    // folder: 0=default, 1=single-select, 2=multi-select
  children?: IHostsListObject[]
}
```

**Three PotDb databases** (`src/main/data/index.ts`):
| Database | Path | Content |
|----------|------|---------|
| `swhdb` | `~/.SwitchHosts/data/` | Hosts list + content + trashcan |
| `cfgdb` | `~/.SwitchHosts/config/` | App configuration |
| `localdb` | `Electron userData/swh_local/` | Local preferences (e.g. data_dir override) |

---

## Configuration Keys

All config keys with defaults (`src/common/default_configs.ts`):

| Key | Default | Description |
|-----|---------|-------------|
| `write_mode` | `'append'` | How to write to system hosts: `overwrite` or `append` |
| `theme` | `'light'` | UI theme: `light`, `dark`, `system` |
| `locale` | `undefined` | Language (auto-detect if undefined) |
| `history_limit` | `50` | Max entries in hosts edit history |
| `http_api_on` | `false` | Enable local HTTP API on port 50761 |
| `http_api_only_local` | `true` | Bind HTTP API to 127.0.0.1 only |
| `auto_download_update` | `true` | Background update check (NOT auto-download) |
| `cmd_after_hosts_apply` | `''` | Shell command to run after hosts are applied |
| `use_proxy` | `false` | Use proxy for remote hosts fetch |
| `send_usage_data` | `false` | Anonymous usage analytics |
| `hide_at_launch` | `false` | Start hidden in system tray |
| `tray_mini_window` | `true` | Show mini popup from tray click |

---

## HTTP API

When enabled in preferences (port **50761**):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /` | GET | Health check — returns "Hello SwitchHosts!" |
| `GET /remote-test` | GET | Test remote hosts fetch |
| `GET /api/list` | GET | Returns all hosts items (flattened, JSON) |
| `GET /api/toggle?id=<id>` | GET | Toggle a hosts item on/off by ID |

Only accessible locally by default (`http_api_only_local: true`).

---

## Dev Commands

```bash
npm run dev          # Start in dev mode (main + renderer concurrently, hot reload)
npm run dev:main     # Main process only (vite --watch)
npm run dev:renderer # Renderer only (vite dev server)

npm run test         # Run Vitest tests (watch=false)
npm run typecheck    # TypeScript check without emit

npm run build        # Full production build (bumps version + compiles main + renderer)
npm run build:release # Build without version bump
npm run make:win     # Package for Windows (NSIS installer + portable)
npm run make:linux   # Package for Linux
npm run make:dev     # Dev build (no notarization)

npm run version:up   # Bump patch version in src/version.json
```

---

## Path Aliases (both Vite configs)

| Alias | Resolves to |
|-------|------------|
| `@` or `@src` | `src/` |
| `@root` | project root |
| `@assets` | `assets/` |
| `@common` | `src/common/` |
| `@main` | `src/main/` |
| `@renderer` | `src/renderer/` |

---

## Build Output

| Build step | Output | Format |
|-----------|--------|--------|
| `build:main` | `build/main.js`, `build/preload.js` | CJS (Node.js) |
| `build:renderer` | `build/index.html` + assets | ESM (browser) |
| `make` | `dist/` | Platform-specific installer |

---

## Vitest Notes

- `fileParallelism: false` — tests run **sequentially** (hosts file operations must not overlap)
- `setupFiles: ['./test/setup.ts']` — cleans `test/tmp/` before each run
- Test environment: `node` (not jsdom — tests cover main process logic, not UI)

---

## Fork & Upstream Sync

This is a personal fork of [oldj/SwitchHosts](https://github.com/oldj/SwitchHosts).
Custom modifications and improvements are made here while staying in sync with upstream.

**Remotes:**
```
origin    git@github.com:vlad-tanasescu-playmore/SwitchHosts.git  (this fork)
upstream  git@github.com:oldj/SwitchHosts.git                      (original repo)
```

**Sync workflow (to receive upstream updates):**
```bash
# Fetch latest from original repo
git fetch upstream

# Merge into our master
git checkout master
git merge upstream/master

# Resolve conflicts if any, then push
git push origin master
```

**Rules for custom changes:**
- All custom work goes directly to `master`
- On merge conflicts: prefer upstream for core functionality, keep our customizations
- NEVER push to `upstream` — fetch/merge only
- After syncing, check `CHANGELOG` or `git log upstream/master` to understand what changed

---

## Key Architecture Notes

- **Two separate Vite configs**: `vite.main.config.mts` (Node/CJS) and `vite.render.config.mts` (browser/ESM) — they are independent build targets
- **contextIsolation: true** — renderer cannot access Node.js APIs directly; everything goes through `window._agent` (exposed via `contextBridge`)
- **Closing the window hides it** (doesn't quit) — only "Quit" from tray/menu actually exits; `global.is_will_quit` tracks this
- **Single instance lock** — second instance brings the first one to focus instead of launching a new window
- **Cron runs every 60s**: checks if remote hosts need refresh + checks for app updates (max 1x/hour)
- This project is NOT synced to box2 — it's a local desktop app only
