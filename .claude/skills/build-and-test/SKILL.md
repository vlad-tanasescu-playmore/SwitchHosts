---
name: build-and-test
description: Use when building, testing, or launching SwitchHosts locally — covers dev mode, production build, installer packaging, and test execution
---

# SwitchHosts — Build & Test Reference

## Dev Mode (hot reload)

```bash
npm run dev
```

Pornește main process + renderer cu hot reload. Modificările în `src/renderer/` se reflectă instant.

---

## Production Build

```bash
npm run build:release
```

Output așteptat:
- `build/main.js` (~94 kB)
- `build/preload.js` (~1 kB)
- `build/assets/renderer-*.js` (~760 kB)
- `build/index.html`

---

## Lansare app după build

```bash
# CORECT — specifică entry point explicit
npx electron build/main.js

# GREȘIT — eșuează cu "Cannot find module"
npx electron .
```

### ⚠️ Gotcha `ELECTRON_RUN_AS_NODE`

Claude Code (și unele shell-uri / CI agents) setează `ELECTRON_RUN_AS_NODE=1` în env. Asta forțează Electron să ruleze ca Node.js pur — `require('electron')` returnează path-ul către exe (string), iar codul crashează imediat la pornire cu:

```
TypeError: Cannot read properties of undefined (reading 'getPath')
    at build/main.js:1:1035
```

Aplicabil la ORICE lansare Electron din shell-ul curent: `npx electron`, `./node_modules/electron/dist/electron.exe`, `electron build/main.js`, sau `spawn(installerExe)` din scripturi Node. Și installer-ul rezultat din `make:win` instalat și lansat din acest shell pățește la fel — app-ul iese în <1s fără mesaj vizibil.

**Verifică:** `env | grep ELECTRON` → dacă vezi `ELECTRON_RUN_AS_NODE=1`, scoate-o înainte de a lansa Electron.

```bash
# Workaround 1: env curat pentru o singură comandă
unset ELECTRON_RUN_AS_NODE && npx electron build/main.js

# Workaround 2: lansare prin PowerShell Start-Process (Windows) — env separat
powershell.exe -NoProfile -Command "Start-Process 'C:\Program Files\SwitchHosts\SwitchHosts.exe'"

# Workaround 3 (scripts Node): explicit env în spawn
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
spawn(exe, [], { env, detached: true })
```

`scripts/install-local.mjs` aplică Workaround 3 automat la relaunch.

---

## Installer Windows (NSIS)

```bash
npm run make:win
```

Generează în `dist/`:

| Fișier | Arhitectură |
|--------|-------------|
| `SwitchHosts-vX.Y.Z-win-x64-installer.exe` | x64 |
| `SwitchHosts-vX.Y.Z-win-installer.exe` | universal (ia32+x64+arm64) |
| `SwitchHosts-vX.Y.Z-win-x64-portable.exe` | portabil x64 |

Durată: ~3-4 minute (descarcă Electron binaries prima dată).

---

## End-to-end: Build + Make + Install + Launch (one-shot)

```bash
npm run release:local
```

Înlănțuie: `_build` (version bump + clean + compile main + renderer) → `make:win` (toate 5 installer-e NSIS + portable) → `scripts/install-local.mjs` (kill SwitchHosts → silent install x64 cu UAC → relaunch cu env curat).

| Pas | Durată | Observații |
|-----|--------|------------|
| _build | ~15s | Bumpează `src/version.json` + `app/package.json` (rămân necommit-uite în git) |
| make:win | ~3 min | Toate 5 arch în `dist/` (curățat la fiecare run) |
| Install + launch | ~30s | UAC apare o singură dată; app-ul instalat se kill-uiește la ultimul moment |

**Total:** ~4 min, downtime app real ~30s (doar la final).

Folosește când vrei versiunea instalată din `C:\Program Files\SwitchHosts\` actualizată fără pași manuali. Hosts entries active rămân în `C:\Windows\System32\drivers\etc\hosts` pe toată durata (SwitchHosts nu le șterge la quit).

⚠️ După rulare, commit-uiește version bump-ul:
```bash
git add src/version.json app/package.json && git commit -m "<KEY> chore: bump version to X.Y.Z.NNNN"
```

---

## Teste

```bash
npm run test
```

- Rulează Vitest cu `fileParallelism: false` (secvențial — hosts file ops nu se pot suprapune)
- 16 fișiere / 145 tests (toate trec din 2026-05-11 post merge upstream)
- Testele acoperă `src/main/`, `src/common/`, și hosts_highlight.test.ts din renderer

---

## TypeScript Check

```bash
npm run typecheck
```

Clean (0 erori) după fix tsconfig `moduleResolution: bundler` din commit 4663ca8a (2026-05-11). Dacă apar erori din `node_modules/vite/`, înseamnă că tsconfig a fost regresat la `moduleResolution: node`.

---

## Flux complet după modificări

```bash
# Verificare rapidă (~15s)
npm run typecheck && npm run test

# Build + test app manual (~30s + UI)
npm run build:release
unset ELECTRON_RUN_AS_NODE && npx electron build/main.js

# Test pe versiunea instalată (~4 min, end-to-end)
npm run release:local
```
