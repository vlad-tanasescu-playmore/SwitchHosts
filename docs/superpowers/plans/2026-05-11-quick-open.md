# Quick Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VSCode-style command palette (`Ctrl+P` / auto-open on window show) that fuzzy-matches hosts items by title AND by content lines, grouped per-item, and jumps the editor to the chosen line on Enter.

**Architecture:** New renderer component `QuickOpen` mounted in the main window, backed by a Jotai-stored content cache fed by a new main-process action `getAllContents`. Fuzzy ranking via `fuse.js` with extended-search AND-token mode. Activation reuses existing events (`select_hosts` for navigation, `show_source` for editor scroll).

**Tech Stack:** React 19, Mantine 8 + `@mantine/spotlight`, Jotai 2, `fuse.js`, TypeScript 5.9, Vitest 3, Electron 39.

**Spec reference:** [docs/superpowers/specs/2026-05-11-quick-open-design.md](../specs/2026-05-11-quick-open-design.md)

---

## File Structure

**New files (7):**
- `src/renderer/components/QuickOpen/QuickOpen.tsx` — Spotlight wrapper, grouping, activation
- `src/renderer/components/QuickOpen/buildIndex.ts` — pure: `(hosts_data, contents) → SearchEntry[]`
- `src/renderer/components/QuickOpen/parseLines.ts` — pure: `(content) → ParsedLine[]`
- `src/renderer/components/QuickOpen/QuickOpen.module.scss` — SCSS module
- `src/main/actions/hosts/getAllContents.ts` — main-process action
- `test/renderer/components/QuickOpen/parseLines.test.ts`
- `test/renderer/components/QuickOpen/buildIndex.test.ts`

**Modified files (~8):**
- `src/common/events.ts` — +1 event key
- `src/common/default_configs.ts` — +2 config keys
- `src/main/actions/index.ts` — +1 export line
- `src/main/main.ts` — emit `open_quick_open` on `win.show()`
- `src/renderer/pages/index.tsx` — mount `<QuickOpen />`
- `src/renderer/components/Pref/*` — new section + checkbox bindings
- `src/common/i18n/languages/en.ts` (+ zh-Hans, zh-Hant, ja, ko etc.) — strings
- `package.json` + lockfile — `@mantine/spotlight` + `fuse.js`

---

## Pre-flight (read before starting)

The renderer is contextIsolated. All main↔renderer communication goes through `window._agent.call(...)` (renderer→main) and `agent.broadcast(event, ...)` (renderer↔renderer + main→renderer-via-message.send). The `Actions` type in `src/common/types.d.ts` is `typeof actions & IActionFunc` — adding a new export to `src/main/actions/index.ts` makes the action **automatically typed and available** on `actions.<name>` in the renderer with no extra plumbing.

`setCurrentHosts(item)` (from `useHostsData()`) sets the selected item directly via Jotai. The existing pattern for "select item from outside the list" is `agent.broadcast(events.select_hosts, item_id)` — `LeftPanel/List/index.tsx:156` listens for it and calls `setCurrentHosts` itself, also handling scroll-into-view. **Use the broadcast**, not direct Jotai access, so the LeftPanel scrolls along.

---

## Task 1: Install dependencies

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Verify Mantine major version is 8.x**

Run: `node -p "require('./package.json').dependencies['@mantine/core']"`
Expected: a string starting with `^8.` or `8.` (writing-time: 8.x).

- [ ] **Step 2: Install `@mantine/spotlight` matching the Mantine core version**

Run: `npm install @mantine/spotlight@^8`
Expected: install succeeds, `package.json` gains `"@mantine/spotlight": "^8.x.x"`.

- [ ] **Step 3: Install `fuse.js`**

Run: `npm install fuse.js@^7`
Expected: install succeeds, `package.json` gains `"fuse.js": "^7.x.x"`.

- [ ] **Step 4: Verify TypeScript still compiles**

Run: `npm run typecheck`
Expected: exits 0 with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @mantine/spotlight and fuse.js for Quick Open"
```

---

## Task 2: `parseLines.ts` — TDD

**Files:**
- Create: `src/renderer/components/QuickOpen/parseLines.ts`
- Test: `test/renderer/components/QuickOpen/parseLines.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `test/renderer/components/QuickOpen/parseLines.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { parseLines, ParsedLine } from '@renderer/components/QuickOpen/parseLines'

describe('parseLines', () => {
  it('parses a basic IP + hostname line', () => {
    const out = parseLines('10.0.52.232 tonica.ro\n')
    expect(out).toEqual<ParsedLine[]>([
      { line_no: 1, ip: '10.0.52.232', hostnames: 'tonica.ro', raw: '10.0.52.232 tonica.ro' },
    ])
  })

  it('captures multiple hostnames on one line', () => {
    const out = parseLines('10.0.52.232   www.foo  foo  bar\n')
    expect(out).toEqual<ParsedLine[]>([
      {
        line_no: 1,
        ip: '10.0.52.232',
        hostnames: 'www.foo foo bar',
        raw: '10.0.52.232   www.foo  foo  bar',
      },
    ])
  })

  it('strips trailing inline comments', () => {
    const out = parseLines('127.0.0.1 dev # local override\n')
    expect(out).toEqual<ParsedLine[]>([
      { line_no: 1, ip: '127.0.0.1', hostnames: 'dev', raw: '127.0.0.1 dev # local override' },
    ])
  })

  it('skips comment-only and blank lines', () => {
    const out = parseLines('# a comment\n\n   \n10.0.0.1 a\n')
    expect(out).toEqual<ParsedLine[]>([
      { line_no: 4, ip: '10.0.0.1', hostnames: 'a', raw: '10.0.0.1 a' },
    ])
  })

  it('handles CRLF line endings', () => {
    const out = parseLines('10.0.0.1 a\r\n10.0.0.2 b\r\n')
    expect(out.map((l) => l.line_no)).toEqual([1, 2])
    expect(out[1]).toMatchObject({ ip: '10.0.0.2', hostnames: 'b' })
  })

  it('rejects malformed lines (single token, no IP)', () => {
    const out = parseLines('justone\nalso bad-line-no-real-ip-shape\n')
    expect(out).toEqual([])
  })

  it('uses 1-based line numbering matching editor convention', () => {
    const out = parseLines('\n10.0.0.1 a\n')
    expect(out[0].line_no).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx vitest run test/renderer/components/QuickOpen/parseLines.test.ts`
Expected: FAIL — `Cannot find module ... parseLines`.

- [ ] **Step 3: Create the parser**

Create `src/renderer/components/QuickOpen/parseLines.ts`:

```typescript
export interface ParsedLine {
  line_no: number
  ip: string
  hostnames: string
  raw: string
}

// First token must look like an IP/host prefix (anything not starting with # and not whitespace).
// We deliberately don't validate IP shape strictly — IPv4, IPv6, and aliases are all accepted.
const LINE_RE = /^[ \t]*([^\s#][^\s]*)[ \t]+([^#\n]+?)[ \t]*(?:#.*)?$/

export function parseLines(content: string): ParsedLine[] {
  const out: ParsedLine[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw_line = lines[i]
    const stripped = raw_line.replace(/\s+$/, '')
    if (!stripped || stripped.trimStart().startsWith('#')) continue

    const m = stripped.match(LINE_RE)
    if (!m) continue

    const [, ip, hostnames_raw] = m
    const hostnames = hostnames_raw.trim().split(/\s+/).join(' ')
    if (!hostnames) continue

    out.push({
      line_no: i + 1,
      ip,
      hostnames,
      raw: stripped,
    })
  }
  return out
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx vitest run test/renderer/components/QuickOpen/parseLines.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/QuickOpen/parseLines.ts test/renderer/components/QuickOpen/parseLines.test.ts
git commit -m "feat: add parseLines parser for QuickOpen indexing"
```

---

## Task 3: `buildIndex.ts` — TDD

**Files:**
- Create: `src/renderer/components/QuickOpen/buildIndex.ts`
- Test: `test/renderer/components/QuickOpen/buildIndex.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `test/renderer/components/QuickOpen/buildIndex.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { buildIndex, SearchEntry } from '@renderer/components/QuickOpen/buildIndex'
import { IHostsListObject } from '@common/data'

describe('buildIndex', () => {
  it('emits one item entry per node (incl. folders/groups)', () => {
    const list: IHostsListObject[] = [
      { id: 'a', title: 'A', type: 'local', on: true },
      { id: 'f', title: 'F', type: 'folder', on: false, children: [
        { id: 'b', title: 'B', type: 'local', on: false },
      ] },
      { id: 'g', title: 'G', type: 'group', on: false, include: ['a'] },
    ]
    const out = buildIndex(list, {})
    const items = out.filter((e) => e.kind === 'item')
    expect(items.map((i) => i.item_id).sort()).toEqual(['a', 'b', 'f', 'g'])
  })

  it('emits no line entries when contents map is empty', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A', type: 'local' }]
    const out = buildIndex(list, {})
    expect(out.filter((e) => e.kind === 'line')).toEqual([])
  })

  it('emits line entries only for local/remote items with content', () => {
    const list: IHostsListObject[] = [
      { id: 'a', title: 'A', type: 'local' },
      { id: 'f', title: 'F', type: 'folder' },
      { id: 'g', title: 'G', type: 'group' },
    ]
    const out = buildIndex(list, {
      a: '10.0.0.1 a-host\n10.0.0.2 b-host\n',
      f: '10.0.0.3 should-be-ignored\n',
      g: '10.0.0.4 should-be-ignored\n',
    })
    const lines = out.filter((e) => e.kind === 'line')
    expect(lines.length).toBe(2)
    expect(lines.every((l) => l.kind === 'line' && l.item_id === 'a')).toBe(true)
  })

  it('denormalizes item_title/item_type/item_on onto line entries', () => {
    const list: IHostsListObject[] = [
      { id: 'a', title: 'tonica.ro', type: 'local', on: true },
    ]
    const out = buildIndex(list, { a: '10.0.52.232 tonica.ro\n' })
    const line = out.find((e) => e.kind === 'line')!
    expect(line).toMatchObject({
      kind: 'line',
      item_id: 'a',
      item_title: 'tonica.ro',
      item_type: 'local',
      item_on: true,
      ip: '10.0.52.232',
      hostnames: 'tonica.ro',
      line_no: 1,
    })
  })

  it('computes line_count on item entries', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A', type: 'local' }]
    const out = buildIndex(list, { a: '10.0.0.1 a\n# comment\n10.0.0.2 b\n\n10.0.0.3 c\n' })
    const item = out.find((e) => e.kind === 'item' && e.item_id === 'a')!
    expect(item.kind === 'item' && item.line_count).toBe(3)
  })

  it('treats missing on as false', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A', type: 'local' }]
    const out = buildIndex(list, {})
    const item = out.find((e) => e.kind === 'item' && e.item_id === 'a')!
    expect(item.kind === 'item' && item.on).toBe(false)
  })

  it('defaults missing type to local', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A' }]
    const out = buildIndex(list, { a: '10.0.0.1 a\n' })
    const line = out.find((e) => e.kind === 'line')!
    expect(line.kind === 'line' && line.item_type).toBe('local')
  })
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `npx vitest run test/renderer/components/QuickOpen/buildIndex.test.ts`
Expected: FAIL — `Cannot find module ... buildIndex`.

- [ ] **Step 3: Create the index builder**

Create `src/renderer/components/QuickOpen/buildIndex.ts`:

```typescript
import { HostsType, IHostsListObject } from '@common/data'
import { parseLines } from './parseLines'

export type SearchEntry =
  | {
      kind: 'item'
      item_id: string
      title: string
      type: HostsType
      on: boolean
      line_count: number
    }
  | {
      kind: 'line'
      item_id: string
      item_title: string
      item_type: HostsType
      item_on: boolean
      line_no: number
      ip: string
      hostnames: string
      raw: string
    }

function walkTree(
  list: IHostsListObject[],
  visit: (node: IHostsListObject) => void,
): void {
  for (const node of list) {
    visit(node)
    if (node.children?.length) {
      walkTree(node.children, visit)
    }
  }
}

export function buildIndex(
  list: IHostsListObject[],
  contents: Record<string, string>,
): SearchEntry[] {
  const out: SearchEntry[] = []

  walkTree(list, (node) => {
    const type: HostsType = node.type ?? 'local'
    const on = node.on ?? false
    const title = node.title ?? ''
    const content = contents[node.id]
    const parsed = type === 'local' || type === 'remote' ? parseLines(content ?? '') : []

    out.push({
      kind: 'item',
      item_id: node.id,
      title,
      type,
      on,
      line_count: parsed.length,
    })

    for (const p of parsed) {
      out.push({
        kind: 'line',
        item_id: node.id,
        item_title: title,
        item_type: type,
        item_on: on,
        line_no: p.line_no,
        ip: p.ip,
        hostnames: p.hostnames,
        raw: p.raw,
      })
    }
  })

  return out
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx vitest run test/renderer/components/QuickOpen/buildIndex.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/QuickOpen/buildIndex.ts test/renderer/components/QuickOpen/buildIndex.test.ts
git commit -m "feat: add buildIndex for QuickOpen search entries"
```

---

## Task 4: Main-process action `getAllContents`

**Files:**
- Create: `src/main/actions/hosts/getAllContents.ts`
- Modify: `src/main/actions/index.ts`

- [ ] **Step 1: Create the action**

Create `src/main/actions/hosts/getAllContents.ts`:

```typescript
import { swhdb } from '@main/data'
import { IHostsContentObject } from '@common/data'
import { normalizeLineEndings } from '@common/newlines'

/**
 * Returns a map of item id → content for every stored hosts content record.
 * Used by the renderer's QuickOpen component to build a searchable index at mount.
 */
const getAllContents = async (): Promise<Record<string, string>> => {
  const all = await swhdb.collection.hosts.all<IHostsContentObject>()
  const out: Record<string, string> = {}
  for (const rec of all) {
    if (rec && typeof rec.id === 'string') {
      out[rec.id] = normalizeLineEndings(rec.content ?? '')
    }
  }
  return out
}

export default getAllContents
```

> If `swhdb.collection.hosts.all<T>()` does not exist on the potdb API used in this codebase, replace with `swhdb.collection.hosts.find<T>(() => true)` — both return arrays of records. Confirm the available method by skimming `src/main/data/index.ts` and the potdb types.

- [ ] **Step 2: Export it from the actions index**

Modify `src/main/actions/index.ts` — add this line in the hosts-actions block (after the existing `setHostsContent` line at the file's hosts-actions section):

```typescript
export { default as getAllContents } from './hosts/getAllContents'
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors. The `Actions` type auto-picks up the new export via `typeof actions` in `src/common/types.d.ts`, so `actions.getAllContents` is now typed in the renderer.

- [ ] **Step 4: Smoke-test via dev console (manual)**

Run: `npm run dev`
In the dev tools console of the main window, run:
```js
window._agent.call('getAllContents').then(console.log)
```
Expected: a plain object whose keys are item ids and values are content strings.

- [ ] **Step 5: Commit**

```bash
git add src/main/actions/hosts/getAllContents.ts src/main/actions/index.ts
git commit -m "feat: add getAllContents main-process action for QuickOpen"
```

---

## Task 5: New event + 2 config keys

**Files:**
- Modify: `src/common/events.ts`
- Modify: `src/common/default_configs.ts`

- [ ] **Step 1: Add the event key**

Modify `src/common/events.ts` — add the line alphabetically between `new_version` and `reload_list`:

```typescript
  open_quick_open: 'open_quick_open',
```

Full neighboring context after the edit:
```typescript
  move_to_trashcan: 'move_to_trashcan',
  new_version: 'new_version',
  open_quick_open: 'open_quick_open',
  reload_list: 'reload_list',
```

- [ ] **Step 2: Add the two config keys**

Modify `src/common/default_configs.ts` — add inside the `// preferences` block, after `tray_mini_window`:

```typescript
  quick_open_on_window_show: true,
  quick_open_search_in_content: true,
```

- [ ] **Step 3: Verify types compile**

Run: `npm run typecheck`
Expected: 0 errors. `ConfigsType` (which is `typeof configs`) automatically picks up the new keys.

- [ ] **Step 4: Commit**

```bash
git add src/common/events.ts src/common/default_configs.ts
git commit -m "feat: add open_quick_open event and QuickOpen config keys"
```

---

## Task 6: `QuickOpen.tsx` — Spotlight UI + grouping + activation

**Files:**
- Create: `src/renderer/components/QuickOpen/QuickOpen.tsx`
- Create: `src/renderer/components/QuickOpen/QuickOpen.module.scss`

This task is bigger; do steps 1→2→3→4 then run typecheck before committing.

- [ ] **Step 1: Create the SCSS module**

Create `src/renderer/components/QuickOpen/QuickOpen.module.scss`:

```scss
.group_header {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.group_header_title_dim {
  color: var(--swh-font-color-weak);
  font-weight: 500;
}

.group_header_meta {
  margin-left: auto;
  font-size: 11px;
  color: var(--swh-font-color-weak);
}

.line_row {
  padding-left: 28px;
  font-family: var(--mantine-font-family-monospace, monospace);
  font-size: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
}

.line_no {
  color: var(--swh-font-color-weak);
  min-width: 48px;
}

.line_text {
  flex: 1;
  white-space: pre;
  overflow: hidden;
  text-overflow: ellipsis;
}

.highlight {
  background-color: rgba(255, 220, 0, 0.35);
  border-radius: 2px;
}

.badge_on,
.badge_off {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
}

.badge_on {
  background-color: var(--swh-primary-color);
  color: white;
}

.badge_off {
  background-color: var(--swh-border-color-0);
  color: var(--swh-font-color-weak);
}
```

- [ ] **Step 2: Create the component**

Create `src/renderer/components/QuickOpen/QuickOpen.tsx`:

```typescript
import events from '@common/events'
import { IFindShowSourceParam } from '@common/types'
import { Spotlight, spotlight } from '@mantine/spotlight'
import '@mantine/spotlight/styles.css'
import { actions, agent } from '@renderer/core/agent'
import useConfigs from '@renderer/models/useConfigs'
import useHostsData from '@renderer/models/useHostsData'
import useI18n from '@renderer/models/useI18n'
import useOnBroadcast from '@renderer/core/useOnBroadcast'
import Fuse from 'fuse.js'
import React, { useEffect, useMemo, useState } from 'react'
import { IoSearch } from 'react-icons/io5'
import { buildIndex, SearchEntry } from './buildIndex'
import styles from './QuickOpen.module.scss'

interface Group {
  item_id: string
  header: Extract<SearchEntry, { kind: 'item' }> | null
  header_matched: boolean
  lines: Extract<SearchEntry, { kind: 'line' }>[]
  best_score: number
}

const MAX_RESULTS = 50
const MAX_LINES_PER_ITEM_DEFAULT = 5

export default function QuickOpen() {
  const { lang } = useI18n()
  const { hosts_data } = useHostsData()
  const { configs } = useConfigs()
  const [contents, setContents] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Load contents once on mount, refresh on hosts events.
  const reload = async () => {
    try {
      const data = await actions.getAllContents()
      setContents(data)
    } catch (e) {
      console.error('QuickOpen: getAllContents failed', e)
    }
  }
  useEffect(() => {
    reload()
  }, [])
  useOnBroadcast(events.hosts_refreshed, reload)
  useOnBroadcast(events.hosts_refreshed_by_id, reload)
  useOnBroadcast(events.reload_list, reload)

  // Auto-open palette when main process broadcasts the event.
  useOnBroadcast(events.open_quick_open, () => {
    if (!configs) return
    if (configs.quick_open_on_window_show === false) return
    spotlight.open()
  })

  const list = hosts_data?.list ?? []
  const search_in_content = configs?.quick_open_search_in_content !== false

  // Build search entries (memoized on list + contents + toggle).
  const entries = useMemo<SearchEntry[]>(() => {
    const all = buildIndex(list, contents)
    return search_in_content ? all : all.filter((e) => e.kind === 'item')
  }, [list, contents, search_in_content])

  // Fuse instance memoized on entries.
  const fuse = useMemo(
    () =>
      new Fuse(entries, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'item_title', weight: 2 },
          { name: 'ip', weight: 1.5 },
          { name: 'hostnames', weight: 1.5 },
          { name: 'raw', weight: 0.5 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeMatches: true,
        includeScore: true,
        useExtendedSearch: true,
        minMatchCharLength: 2,
      }),
    [entries],
  )

  // Run search.
  const grouped: Group[] = useMemo(() => {
    const q = query.trim()
    let hits: { item: SearchEntry; score: number }[]
    if (!q) {
      hits = entries
        .filter((e) => e.kind === 'item')
        .slice(0, MAX_RESULTS)
        .map((item) => ({ item, score: 0 }))
    } else {
      // Strip Fuse extended-search operators except space; let user spaces become AND tokens.
      const safe = q.replace(/[|!^=$']/g, ' ').trim()
      // Quote each whitespace-separated token to force include-match (AND across tokens).
      const expr = safe
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `'${t}`)
        .join(' ')
      const raw = fuse.search(expr, { limit: 500 })
      hits = raw.map((r) => ({ item: r.item, score: r.score ?? 1 }))
    }

    const by_item = new Map<string, Group>()
    for (const { item, score } of hits) {
      const id = item.kind === 'item' ? item.item_id : item.item_id
      let g = by_item.get(id)
      if (!g) {
        g = { item_id: id, header: null, header_matched: false, lines: [], best_score: 1 }
        by_item.set(id, g)
      }
      if (item.kind === 'item') {
        g.header = item
        g.header_matched = true
      } else {
        g.lines.push(item)
      }
      g.best_score = Math.min(g.best_score, score)
    }

    // Ensure every group has a header (synthesize one from any line entry if missing).
    for (const g of by_item.values()) {
      if (!g.header) {
        const any_line = g.lines[0]
        if (any_line) {
          g.header = {
            kind: 'item',
            item_id: any_line.item_id,
            title: any_line.item_title,
            type: any_line.item_type,
            on: any_line.item_on,
            line_count: 0,
          }
        }
      }
    }

    return Array.from(by_item.values())
      .filter((g) => !!g.header)
      .sort((a, b) => a.best_score - b.best_score)
      .slice(0, MAX_RESULTS)
  }, [entries, fuse, query])

  const activate = async (entry: SearchEntry) => {
    spotlight.close()
    if (entry.kind === 'item') {
      agent.broadcast(events.select_hosts, entry.item_id)
      return
    }
    // Line: select + scroll editor.
    agent.broadcast(events.select_hosts, entry.item_id)
    // Small delay so the editor mounts the new content before we ask it to scroll.
    setTimeout(() => {
      const param: IFindShowSourceParam = {
        item_id: entry.item_id,
        start: 0,
        end: entry.raw.length,
        line: entry.line_no,
        line_pos: 0,
        end_line: entry.line_no,
        end_line_pos: entry.raw.length,
        before: '',
        match: entry.raw,
        after: '',
      }
      agent.broadcast(events.show_source, param)
    }, 80)
  }

  return (
    <Spotlight.Root
      shortcut="mod+P"
      onQueryChange={setQuery}
      query={query}
      scrollable
      maxHeight={480}
    >
      <Spotlight.Search
        placeholder={lang?.quick_open_placeholder ?? 'Search items, IPs, hostnames…'}
        leftSection={<IoSearch />}
      />
      <Spotlight.ActionsList>
        {grouped.length === 0 && (
          <Spotlight.Empty>
            {lang?.quick_open_empty ?? 'No matches'}
          </Spotlight.Empty>
        )}
        {grouped.map((g) => {
          const max_lines = expanded[g.item_id] ? g.lines.length : MAX_LINES_PER_ITEM_DEFAULT
          const visible = g.lines.slice(0, max_lines)
          const overflow = g.lines.length - visible.length
          const header = g.header!
          return (
            <Spotlight.ActionsGroup key={g.item_id} label={undefined as unknown as string}>
              <Spotlight.Action onClick={() => activate(header)}>
                <div className={styles.group_header}>
                  <span className={g.header_matched ? '' : styles.group_header_title_dim}>
                    {header.title || '(untitled)'}
                  </span>
                  <span className={header.on ? styles.badge_on : styles.badge_off}>
                    {header.on ? 'on' : 'off'}
                  </span>
                  <span className={styles.group_header_meta}>
                    {header.type} · {header.line_count} {header.line_count === 1 ? 'line' : 'lines'}
                  </span>
                </div>
              </Spotlight.Action>
              {visible.map((line) => (
                <Spotlight.Action
                  key={`${line.item_id}:${line.line_no}`}
                  onClick={() => activate(line)}
                >
                  <div className={styles.line_row}>
                    <span className={styles.line_no}>line {line.line_no}</span>
                    <span className={styles.line_text}>{line.raw}</span>
                  </div>
                </Spotlight.Action>
              ))}
              {overflow > 0 && (
                <Spotlight.Action
                  onClick={() => setExpanded((e) => ({ ...e, [g.item_id]: true }))}
                >
                  <div className={styles.line_row}>
                    <span className={styles.line_no}>…</span>
                    <span className={styles.line_text}>show {overflow} more lines</span>
                  </div>
                </Spotlight.Action>
              )}
            </Spotlight.ActionsGroup>
          )
        })}
      </Spotlight.ActionsList>
    </Spotlight.Root>
  )
}
```

> Notes for the implementer:
> - `Spotlight.Root` is the Mantine 8 API (compound component). If your installed version uses `Spotlight` as a single component with `actions={[]}` prop, fall back to that — confirm by checking `node_modules/@mantine/spotlight/lib/index.d.ts` exports.
> - `IFindShowSourceParam` matches what the existing Find window broadcasts in `pages/find.tsx:171-184`. The editor listens for `events.show_source` and scrolls accordingly. Do not invent a new event.
> - `useConfigs` returns `null` until configs load; guards handle that.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors. If Mantine's compound API isn't `Spotlight.Root` in your version, adjust per the note above.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/QuickOpen/QuickOpen.tsx src/renderer/components/QuickOpen/QuickOpen.module.scss
git commit -m "feat: add QuickOpen component with grouped fuzzy search"
```

---

## Task 7: Mount in main window + auto-open trigger

**Files:**
- Modify: `src/renderer/pages/index.tsx`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Import + mount in `pages/index.tsx`**

Modify `src/renderer/pages/index.tsx`:

1. Add the import alongside the existing component imports near the top:

```typescript
import QuickOpen from '@renderer/components/QuickOpen/QuickOpen'
```

2. Inside the returned JSX, add `<QuickOpen />` next to the other modals — place it right before the closing `</div>` of the root `<div className={styles.root}>`, after `<About />`:

```typescript
      <About />
      <QuickOpen />
    </div>
```

- [ ] **Step 2: Wire `'show'` event in main.ts**

Modify `src/main/main.ts`. After `main_window_state.manage(win)` (line ~65) and before `global.main_win = win`, add:

```typescript
  win.on('show', () => {
    win?.webContents.send('y_broadcast', 'open_quick_open')
  })
```

> The `y_broadcast` channel + raw event name string is how `core/message.ts` broadcasts events. Using the literal string here (instead of importing `events` into main.ts) avoids adding a new import; the value MUST match `events.open_quick_open` in `src/common/events.ts` exactly.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Expected:
- Main window opens.
- Within ~1s, the Quick Open palette appears focused with an empty input.
- Press Esc → palette closes.
- Press Ctrl+P → palette reopens.
- Type a substring of an item title → see the item grouped with its content lines.
- Press ↓ to a line, Enter → main window selects that item AND the editor scrolls to that line.
- Toggle a host in the LeftPanel, then reopen palette → `[on]/[off]` badge reflects the new state (verifies `reload_list` listener works).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/index.tsx src/main/main.ts
git commit -m "feat: mount QuickOpen + auto-open on main window show"
```

---

## Task 8: Preferences UI + i18n strings

**Files:**
- Modify: `src/renderer/components/Pref/` (existing preferences panel)
- Modify: `src/common/i18n/languages/en.ts` (and other locale files for fallback parity)

The exact path of the Pref subcomponent varies. The implementer should locate the file that renders checkboxes for `http_api_on` and `tray_mini_window`, and add the two new toggles next to them.

- [ ] **Step 1: Locate the existing preferences toggle pattern**

Run: `grep -rn "tray_mini_window\|http_api_on" src/renderer/components/Pref/`
Inspect the matching file(s). Find the `Checkbox` (or equivalent Mantine control) bound to one of those config keys to learn the binding pattern (likely uses `useConfigs()` + `actions.configUpdate(...)`).

- [ ] **Step 2: Add two Checkbox controls in the same component**

Reuse the existing handler/binding pattern. For each new config key, add a Checkbox bound to it. Pseudo-pattern (adapt to the actual code in the Pref file):

```typescript
<Checkbox
  checked={configs.quick_open_on_window_show}
  onChange={(e) =>
    actions.configUpdate({ quick_open_on_window_show: e.currentTarget.checked })
  }
  label={lang.pref_quick_open_on_window_show}
/>
<Checkbox
  checked={configs.quick_open_search_in_content}
  onChange={(e) =>
    actions.configUpdate({ quick_open_search_in_content: e.currentTarget.checked })
  }
  label={lang.pref_quick_open_search_in_content}
/>
```

> Use the same handler shape (single key update or whole-config replace) as the existing `tray_mini_window` checkbox so cache-busting and broadcasts work identically.

- [ ] **Step 3: Add i18n strings to English locale**

Modify `src/common/i18n/languages/en.ts` — add inside the exported language dict:

```typescript
pref_quick_open_on_window_show: 'Open Quick Open palette automatically when the window appears',
pref_quick_open_search_in_content: 'Quick Open also searches inside hosts content (not just titles)',
quick_open_placeholder: 'Search items, IPs, hostnames…',
quick_open_empty: 'No matches',
```

- [ ] **Step 4: Add the same keys to every other locale file**

Run: `ls src/common/i18n/languages/`
For each `.ts` file there (zh-Hans.ts, zh-Hant.ts, ja.ts, ko.ts, etc.), add the four new keys. If you don't speak the language, copy the English strings verbatim — `useI18n` returns the entry for the active locale, and missing keys would otherwise produce `undefined` (TypeScript will catch this as a compile error because `LanguageDict = typeof lang` is the English shape).

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: 0 errors. If any locale file is missing a key, fix it and re-run.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`
Open Preferences. Verify the two new checkboxes appear with the correct labels. Toggle `quick_open_search_in_content` off → reopen palette → typing now matches titles only.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Pref/ src/common/i18n/languages/
git commit -m "feat: expose QuickOpen toggles in preferences with i18n strings"
```

---

## Task 9: Manual QA smoke test + spec sign-off

This task contains no code changes — it's a checklist before considering the feature done.

- [ ] **Step 1: Cold-start auto-open**

Quit and relaunch the app. Verify palette opens focused within ~1s of the window appearing.

- [ ] **Step 2: Title fuzzy match**

Type the start of an item title (e.g., `tonica`). Verify item appears as group header.

- [ ] **Step 3: AND tokens across title + content**

Type `tonica.ro 232`. Verify the result is the `tonica.ro` item with one or more lines containing `232` listed beneath it.

- [ ] **Step 4: Activation — header**

Use arrow keys to focus the group header. Press Enter. Verify LeftPanel selects the item; editor loads its content but does not auto-scroll to a specific line.

- [ ] **Step 5: Activation — line**

Reopen palette. Same query. Focus a line beneath the header. Press Enter. Verify LeftPanel selects the item AND the editor scrolls to and highlights that exact line.

- [ ] **Step 6: "Show more lines"**

Pick an item that has >5 matching lines (use a query with a common substring). Verify the `show N more lines` action appears and expands the group.

- [ ] **Step 7: Esc closes, Ctrl+P reopens**

Verify both behaviors work as expected.

- [ ] **Step 8: Preference toggles**

- Turn off `quick_open_on_window_show`. Close & reopen window. Verify palette does NOT auto-open. Ctrl+P still works.
- Turn off `quick_open_search_in_content`. Reopen palette, search `232`. Verify ZERO line entries appear (only items whose title contains "232", which is likely none).

- [ ] **Step 9: Reload after host change**

Open palette → close. Toggle a host on/off in the LeftPanel. Reopen palette → search for that item. Verify the `[on]/[off]` badge reflects the new state. (Verifies `reload_list` listener.)

- [ ] **Step 10: Tree window (Find) still works**

Open the Find & Replace window via its usual trigger. Verify it still opens and functions — we did NOT touch its code, but a smoke test rules out accidental regressions from new event listeners.

- [ ] **Step 11: Run full test suite once more**

Run: `npm test`
Expected: all green.

- [ ] **Step 12: No commit needed for this task** — it's verification only. If a regression is found, return to the relevant Task and write a regression test there before fixing.

---

## Self-Review (already completed by plan author)

**Spec coverage:** ✓
- Spec §1 (component/deps) → Task 1, 6
- Spec §2 (data model) → Task 3
- Spec §3 (index building) → Task 3
- Spec §3a (content cache action) → Task 4
- Spec §4 (Fuse config) → Task 6
- Spec §5 (UI layout per-item) → Task 6
- Spec §6 (activation) → Task 6
- Spec §7 (trigger auto + Ctrl+P) → Task 7
- Spec §8 (new event) → Task 5
- Spec §9 (new action) → Task 4
- Spec §10 (config keys + preferences) → Task 5, 8
- Spec §12 (testing) → Tasks 2, 3 (unit); Task 9 (manual)

**Placeholder scan:** ✓ no TBD/TODO/"similar to" — every code-changing step has the actual code.

**Type consistency:** ✓ `SearchEntry`/`ParsedLine`/`IFindShowSourceParam` names are consistent across tasks. `events.open_quick_open` matches the literal string used in `main.ts` (Task 7).

**Out-of-scope explicitly excluded** (matches spec §11): no replace, no regex, no global shortcut, no action mode, no MRU.

---

## Plan complete

Plan saved to `docs/superpowers/plans/2026-05-11-quick-open.md`. Per global rule, this file is **not auto-committed** — leave it uncommitted until the user decides.
