#!/usr/bin/env node
// Kills running SwitchHosts processes, runs the freshly built x64 NSIS installer
// silently, then relaunches the newly installed app.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')

function log(msg) {
  console.log(`[install-local] ${msg}`)
}

function fail(msg) {
  console.error(`[install-local] ERROR: ${msg}`)
  process.exit(1)
}

if (process.platform !== 'win32') {
  fail('release:local only supports Windows. Use make:win on Windows hosts.')
}

const version = JSON.parse(readFileSync(resolve(rootDir, 'src/version.json'), 'utf8'))
const fullVersion = version.join('.')
const installerName = `SwitchHosts-v${fullVersion}-win-x64-installer.exe`
const installerPath = resolve(rootDir, 'dist', installerName)
const installDir = 'C:\\Program Files\\SwitchHosts'
const installedExe = `${installDir}\\SwitchHosts.exe`

if (!existsSync(installerPath)) {
  fail(`installer not found: ${installerPath}. Run "npm run make:win" first.`)
}
log(`found installer: ${installerName}`)

log(`running installer — closing app + UAC prompt now, install ~30s...`)
// Kill running instance IMMEDIATELY before invoking installer to minimize
// downtime. /F = forced kill, releases file locks instantly on Windows.
const killResult = spawnSync('taskkill', ['/F', '/IM', 'SwitchHosts.exe'], {
  stdio: 'pipe',
  encoding: 'utf8',
})
if (killResult.status !== 0 && !/not found|nu a fost/i.test(killResult.stderr || '')) {
  log(`taskkill exited with code ${killResult.status}; continuing anyway`)
}

// NSIS flags: /S = silent, /D=<dir> = install directory (no quotes, must be last)
const installArgs = ['/S', `/D=${installDir}`]
const installResult = spawnSync(installerPath, installArgs, {
  stdio: 'inherit',
  windowsHide: false,
})

if (installResult.status !== 0) {
  fail(`installer exited with code ${installResult.status}`)
}
log('install completed successfully')

if (!existsSync(installedExe)) {
  fail(`expected exe not found after install: ${installedExe}`)
}

log(`launching ${installedExe}...`)
// ELECTRON_RUN_AS_NODE=1 (often set by Claude Code, some shells, or CI agents)
// forces Electron to run as plain Node — crashes the app at startup with
// "Cannot read properties of undefined (reading 'getPath')". Strip it from
// the child env so the relaunch behaves like a normal user-initiated start.
const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE

const child = spawn(installedExe, [], {
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
  env: childEnv,
})
child.unref()

log(`done — SwitchHosts v${fullVersion} installed and launched`)
