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

## Teste

```bash
npm run test
```

- Rulează Vitest cu `fileParallelism: false` (secvențial — hosts file ops nu se pot suprapune)
- 1 test pre-existent eșuează în `test/common/normalize.test.ts` — ignoră-l, nu e legat de features noi
- Testele acoperă doar `src/main/` și `src/common/` (nu renderer/UI)

---

## TypeScript Check

```bash
npm run typecheck
```

Erori pre-existente din `node_modules/vite/dist/node/` sunt false positives — ignoră-le. Verifică doar erorile din `src/`.

---

## Flux complet după modificări

```bash
# 1. Typecheck
npm run typecheck

# 2. Teste
npm run test

# 3. Build
npm run build:release

# 4. Test manual
npx electron build/main.js

# 5. Installer (opțional)
npm run make:win
```
