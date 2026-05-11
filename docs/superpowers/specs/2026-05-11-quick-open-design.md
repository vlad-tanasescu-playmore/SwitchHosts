# Design Spec: Quick Open — VSCode-style Command Palette

**Date:** 2026-05-11
**Status:** Draft (awaiting user review)

---

## Summary

Add a VSCode-style **Quick Open** command palette to the SwitchHosts main window. When the main window opens, a modal input appears focused automatically. As the user types (as-you-type, no Enter required), a dropdown shows results matched fuzzily against both **item titles** and **hosts file content lines**. Results are **grouped per-item**: each matching item is shown as a header with its matched content lines listed inset beneath it. Pressing Enter on a header opens the item in the editor; pressing Enter on a matched line opens the item AND scrolls the editor to that specific line.

Example: typing `tonica.ro 232` finds the item titled `tonica.ro` AND highlights the line `10.0.52.232 tonica.ro` beneath it. Enter on the line opens the item and jumps to line 5.

---

## Motivation

SwitchHosts currently exposes two ways to navigate:

1. **LeftPanel tree** — visual, mouse-driven, slow when there are 30+ items in nested folders.
2. **Find & Replace window** (`/find` route) — text search inside content with regex/replace, but it's a separate `BrowserWindow`, focused on editing rather than navigation, and does not match against item titles.

Neither answers "I want to jump to my `tonica.ro` entry that's mapped to `10.0.52.232`" in one keyboard motion. VSCode's Ctrl+P / Ctrl+Shift+F mental model is the right primitive: type a fuzzy query, see ranked results across the whole workspace, Enter to jump.

The user explicitly asked for this UX: "as vrea sa pot scrie direct in switch hosts cand deschid fereastra chestii de genul 'tonica.ro 232' sa imi deschida un dropdown de search ca la vscode si sa ma duca la item".

---

## Brainstormed Decisions (locked in)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Search scope | **Titles + content lines** (full content, not just hostnames or just IPs) |
| 2 | Enter behavior | **Open item + scroll to line** (when match is a line); open item only (when match is a title) |
| 3 | Trigger | **Auto-open on main window show + Ctrl+P** for re-open |
| 4 | Update mode | **As-you-type** (debounced 100ms, no Enter required to search) |
| 5 | Result layout | **Grouped per-item** (header = item, indented lines beneath) |
| 6 | Library | `@mantine/spotlight` + `fuse.js` |
| 7 | Configurability | Toggle in Preferences for auto-open + content-search |

---

## Design

### 1. Component & Dependencies

**New dependencies:**
- `@mantine/spotlight` (~5 KB gzipped) — pairs with existing `@mantine/core` 8.
- `fuse.js` (~12 KB gzipped) — fuzzy search engine with multi-key support, AND-token mode, and zero dependencies.

**New files:**
- `src/renderer/components/QuickOpen/QuickOpen.tsx` — Mantine `Spotlight` wrapper, the actual modal UI.
- `src/renderer/components/QuickOpen/buildIndex.ts` — pure function: `(hosts_data: IHostsListObject[], contents: Map<string, string>) => SearchEntry[]`.
- `src/renderer/components/QuickOpen/parseLines.ts` — pure function: `(content: string) => ParsedLine[]` (extracts non-comment IP+hostnames per line).
- `src/renderer/components/QuickOpen/QuickOpen.module.scss` — styles for the per-item grouping (header + indented lines + highlight).

**Mount point:** `src/renderer/pages/index.tsx` (main window root only). The `find.tsx` and `tray.tsx` pages do **not** mount it — those windows have their own purpose and the palette is main-window-only.

---

### 2. Data Model

```ts
// SearchEntry — one record per searchable thing
type SearchEntry =
  | {
      kind: 'item'
      item_id: string
      title: string
      type: HostsType
      on: boolean
      line_count: number           // total non-empty non-comment lines (display only)
    }
  | {
      kind: 'line'
      item_id: string
      item_title: string           // denormalized for display + secondary fuzzy match
      item_type: HostsType
      item_on: boolean
      line_no: number              // 1-based, matches editor's line numbering
      ip: string                   // first token of the line
      hostnames: string            // remaining tokens joined by space
      raw: string                  // original line text (used for highlight)
    }
```

`item` entries are emitted for **all** items including `folder` and `group` (so users can jump to folders by name — only the title is searchable for these, they have no content). `line` entries are emitted only for `local` and `remote` items that have content. This is consistent with Decision #1 ("titles + content"): folders/groups contribute via their title only, while local/remote items contribute via both title AND each non-comment content line.

---

### 3. Index Building

`buildIndex(hosts_data, contents)` walks the tree recursively (re-using `flatten` from `@common/hostsFn`) and produces a flat `SearchEntry[]`. Memoized in `QuickOpen.tsx` via `useMemo` with dependencies `[hosts_data_atom, content_cache]`.

**Content cache:** the renderer does NOT have all hosts contents in memory by default — they are loaded lazily when an item is selected. For Quick Open to work, we need them all upfront. Two options:

- **3a (preferred):** Add a new action `actions.getAllContents(): Promise<Record<string, string>>` to the main process that returns all item contents in one call. Renderer calls it once at mount and stores in a new Jotai atom `contents_cache_atom`. Refreshed on `hosts_refreshed_by_id` event (single item) or `reload_list` event (all).
- **3b:** Reuse the existing `actions.getHostsContent(id)` and call it for every item in parallel on mount. Simpler but N round-trips.

Decision: **3a**. Adds one new IPC action, but cleaner and avoids N+1 IPC chatter on every window open.

**Parser** (`parseLines.ts`):
```
^[ \t]*([^\s#][^\s]*)[ \t]+([^#\n]+?)(?:[ \t]*#.*)?[ \t]*$
                  └── IP    └── hostname(s)
```
Lines that don't match (comments, blank lines, malformed) are skipped. The parser is exported standalone so it can be unit-tested.

---

### 4. Fuzzy Search Configuration

```ts
const fuse = new Fuse(entries, {
  keys: [
    { name: 'title', weight: 2 },             // item entries
    { name: 'item_title', weight: 2 },        // line entries (denormalized title)
    { name: 'ip', weight: 1.5 },
    { name: 'hostnames', weight: 1.5 },
    { name: 'raw', weight: 0.5 },             // fallback whole-line match
  ],
  threshold: 0.4,
  ignoreLocation: true,
  useExtendedSearch: true,
  includeMatches: true,                       // for highlight rendering
  minMatchCharLength: 2,
})
```

**Query handling:** The user input is split on whitespace into tokens. Each token must match somewhere (AND logic) via Fuse's extended-search syntax: `tonica.ro 232` becomes `'tonica.ro 232` (the leading `'` is Fuse's "include-match" operator combined with space-separated AND). Empty query → show top 20 entries sorted by `item.title` (alphabetic) for orientation.

**Debounce:** Input changes trigger the search after 100ms idle. Result list is capped to **top 50 hits**; further results show "… and N more — refine your search".

---

### 5. UI Layout (Per-Item Grouping)

After Fuse returns ranked hits, results are **regrouped per `item_id`** before rendering:

```
┌─────────────────────────────────────────────────────────┐
│ 🔍  tonica.ro 232                                  Esc  │
├─────────────────────────────────────────────────────────┤
│  📄  tonica.ro                              [on]   ▸   │ ← item header (Enter → open)
│        line 5:  10.0.52.232  tonica.ro                 │ ← line under header (Enter → open + scroll)
│        line 6:  10.0.52.232  www.tonica.ro             │
│                                                         │
│  📁  staging.tonica.ro                      [off]      │ ← item header (folder match by title)
│                                                         │
│  📄  catena.ro                              [on]       │
│        line 3:  10.0.52.232  catena.ro                 │
│        … 3 more lines                                   │
└─────────────────────────────────────────────────────────┘
```

**Rules:**
- Each `item_id` appears at most once as a header.
- If the item itself matched (title hit), header is bold; otherwise header is rendered in muted gray to signal "match is in the lines below".
- Lines under a header: max **5 visible**, then a `… N more lines` row that, when activated (Enter or click), expands inline.
- **Highlight:** characters that contributed to the Fuse match are wrapped in `<span class={styles.highlight}>` (using `includeMatches` data). Same visual pattern as existing `find.module.scss .highlight`.
- **Keyboard navigation:** Arrow ↑/↓ moves a single cursor across the flat sequence of header+visible-lines (depth-first, header → its lines → next header). Mantine Spotlight's built-in keyboard nav handles this if we render each row as a `Spotlight.Action`.
- **Sort:** items sorted by `min(score-of-title-match, best-score-among-its-lines)`. Within an item, lines sorted by their individual scores.

**Component structure:**
```
<Spotlight
  shortcut="mod+P"
  searchProps={{ placeholder: 'Search items, IPs, hostnames…' }}
  highlightQuery
>
  {grouped.map(group => (
    <Spotlight.ActionsGroup key={group.item_id} label={null}>
      <ItemHeaderAction entry={group.header} />
      {group.lines.slice(0, expanded[group.item_id] ? 999 : 5).map(line => (
        <LineAction entry={line} />
      ))}
      {group.lines.length > 5 && !expanded[group.item_id] && (
        <ShowMoreAction count={group.lines.length - 5} item_id={group.item_id} />
      )}
    </Spotlight.ActionsGroup>
  ))}
</Spotlight>
```

Why `Spotlight.ActionsGroup`: it provides visual separation between items and lets us pass `label={null}` to skip the group caption (header row is our own custom component). Confirmed in Mantine 8 docs.

---

### 6. Activation (Enter / Click)

```ts
async function activate(entry: SearchEntry) {
  spotlight.close()
  await actions.setCurrentHosts(entry.item_id)  // selects in LeftPanel + loads in editor

  if (entry.kind === 'line') {
    // Reuse the existing event that find.tsx already broadcasts
    agent.broadcast(events.show_source, {
      item_id: entry.item_id,
      line: entry.line_no,
      line_pos: 0,
      end_line: entry.line_no,
      end_line_pos: entry.raw.length,
      start: 0,        // editor recomputes from line
      end: 0,
      match: '',
    } satisfies IFindShowSourceParam)
  }
}
```

**Why reuse `events.show_source`:** The editor (`src/renderer/components/Editor/`) already listens to this event and scrolls to the requested line — see `find.tsx:171-184`. No new event needed; this is a zero-cost integration with proven behavior.

**setCurrentHosts:** Existing action that sets `current_hosts_atom` → LeftPanel highlights the item, MainPanel loads its content into the editor.

---

### 7. Trigger

#### 7.1 Auto-open on window show

Main process: `src/main/main.ts` (or wherever `mainWindow` is created). Listen for the `'show'` event on `BrowserWindow`:

```ts
mainWindow.on('show', () => {
  mainWindow.webContents.send('y_broadcast', events.open_quick_open)
})
```

Renderer: `useOnBroadcast(events.open_quick_open, () => spotlight.open())`.

**Edge cases:**
- The `'show'` event fires both on initial creation AND on every subsequent show (e.g., reopen from tray). Both should trigger the palette — matches user intent.
- During the very first show, the renderer may not have finished mounting `QuickOpen`. Use a small `setTimeout(open, 50)` on the renderer side, or — cleaner — debounce by checking `hosts_data_atom !== null` before opening. Add a 200ms grace period max; if `hosts_data` isn't loaded yet, skip auto-open this cycle (no perceptible flash for the user).
- If `configs.quick_open_on_window_show === false`, skip the auto-open broadcast entirely (gate in renderer, not main, so config changes don't require app restart).

#### 7.2 Ctrl+P / Cmd+P

`Spotlight` accepts `shortcut="mod+P"` — Mantine handles cross-platform (Cmd on macOS, Ctrl elsewhere). No menu accelerator changes needed; if a future menu binding conflicts, we add `globalShortcut` registration in main.

#### 7.3 Esc

Closes the modal (Spotlight default).

---

### 8. New Event

`src/common/events.ts` — add one new event name:

```ts
open_quick_open: 'open_quick_open',
```

That's the only addition. All other plumbing reuses existing events (`show_source`, `hosts_refreshed_by_id`, `reload_list`).

---

### 9. New Main-Process Action

`src/main/actions/hosts/getAllContents.ts`:
```ts
export default async function getAllContents(): Promise<Record<string, string>> {
  // Iterate swhdb.contents collection, return map id → content
}
```

Registered in `src/main/actions/index.ts`. Renderer wrapper added in `src/renderer/core/agent.ts` as `actions.getAllContents`. Pure read; no side effects.

---

### 10. Configuration

`src/common/default_configs.ts` — add two new keys:

| Key | Type | Default | Effect |
|-----|------|---------|--------|
| `quick_open_on_window_show` | boolean | `true` | If `false`, palette opens only via Ctrl+P |
| `quick_open_search_in_content` | boolean | `true` | If `false`, only `item` entries are indexed (no `line` entries) — faster, less noisy on huge hosts files |

UI: new section in `src/renderer/components/Pref/` called "Quick Open" with the two checkboxes. i18n strings added to all locale files in `src/common/i18n/` (English + Chinese first; others get English fallback).

---

### 11. Out of Scope (explicitly)

- **Replace functionality.** This is a navigation palette, not Find & Replace. The existing `/find` window covers that.
- **Regex search.** Fuzzy is the point. If a user needs regex over content, they use the existing Find window.
- **Global keyboard shortcut (palette while app is minimized).** Brainstormed but not chosen — adds Electron `globalShortcut` complexity for marginal benefit. Can be added later.
- **Action mode (toggle on/off from palette, copy entry, etc.).** Decision #2 explicitly chose "navigate only". Can be added later as `Ctrl+Enter` / `Alt+Enter` modifiers without changing the design.
- **Command palette for app commands** (e.g., "Preferences", "Reload remote", "Toggle theme"). Different feature, future work.
- **History / recent items / MRU.** Could be useful (empty query shows recent picks), but not in v1 — initial empty state is alphabetical to keep the implementation pure.

---

### 12. Testing Plan (Vitest)

**Pure-function tests** (`test/renderer/components/QuickOpen/`):
- `parseLines.test.ts`
  - parses `10.0.52.232 tonica.ro` → `{ ip, hostnames, raw, line_no }`
  - parses `10.0.52.232  www.foo  foo  bar  # comment` → hostname tokens captured, comment stripped
  - skips comment-only and blank lines
  - handles CRLF line endings (cross-ref with existing `src/common/newlines.ts`)
  - rejects malformed lines (e.g., single token, no IP-looking prefix)
- `buildIndex.test.ts`
  - emits exactly one `item` entry per node in `hosts_data` (regardless of type)
  - emits `line` entries only for `local`/`remote` with content
  - denormalizes `item_title`/`item_type`/`item_on` correctly on `line` entries
  - handles missing content (item not in `contents` map) — emits item entry only

**UI is not unit-tested** — Mantine Spotlight's behavior is covered by Mantine's own tests. Manual smoke test before merge:
- Open main window from cold start → palette focused, empty list visible.
- Type `tonica.ro` → see item header + matched lines grouped.
- Press ↓ to navigate to a line → Enter → editor scrolls.
- Press Esc → modal closes, keyboard focus returns to LeftPanel.
- Toggle `quick_open_on_window_show` off in Prefs → next window open does NOT show palette automatically; Ctrl+P still works.

---

### 13. Risks & Open Questions

| Risk | Mitigation |
|------|------------|
| `getAllContents` on a huge dataset (1000+ items × 100 lines) blocks renderer at mount | Run async in a `useEffect`; render palette with empty state until data arrives. Acceptable for v1 — actual user sizes are <100 items. |
| Mantine Spotlight v8 API differs from documented examples | Pin exact `@mantine/spotlight` version matching `@mantine/core` 8.x already in `package.json`. Verified API in Mantine 8 docs prior to spec. |
| Fuse `useExtendedSearch` syntax surprises users (e.g., they type `!foo` expecting NOT) | Sanitize user input — strip Fuse operator characters except space. Document in placeholder text. |
| Auto-open on window show is annoying when user just wants to edit directly | Already addressed: Esc closes instantly, and the Pref toggle disables auto-open entirely. |
| Index rebuild cost when `hosts_data_atom` changes (e.g., toggle a host) | Memoized; rebuild ~O(N items × M lines) is fast (<10ms for realistic sizes). If profiling shows lag, switch to incremental updates. |

Open questions (need user input before implementation):
- None at the moment — all decisions are locked.

---

## Effort Estimate

| Step | Hours |
|------|-------|
| `parseLines.ts` + `buildIndex.ts` + unit tests | 2 |
| `getAllContents` action + IPC wiring | 1 |
| `QuickOpen.tsx` component (Spotlight + grouping + highlight) | 3 |
| Trigger plumbing (main `'show'` event + renderer broadcast handler) | 1 |
| Preferences UI + i18n + default config keys | 1 |
| SCSS styling (highlight, indent, badges) | 1 |
| Manual QA + polish | 1 |
| **Total** | **~10h, 1 PR** |

---

## Files Changed Summary

**New files (7):**

Renderer component:
- `src/renderer/components/QuickOpen/QuickOpen.tsx`
- `src/renderer/components/QuickOpen/buildIndex.ts`
- `src/renderer/components/QuickOpen/parseLines.ts`
- `src/renderer/components/QuickOpen/QuickOpen.module.scss`

Main process action:
- `src/main/actions/hosts/getAllContents.ts`

Tests:
- `test/renderer/components/QuickOpen/parseLines.test.ts`
- `test/renderer/components/QuickOpen/buildIndex.test.ts`

**Modified files (~6):**
- `src/common/events.ts` (+1 event)
- `src/common/default_configs.ts` (+2 keys)
- `src/main/actions/index.ts` (+1 action export)
- `src/main/main.ts` (or wherever `mainWindow` lives — add `'show'` listener)
- `src/renderer/pages/index.tsx` (mount `<QuickOpen />`)
- `src/renderer/components/Pref/*` (1 new section)
- `src/renderer/core/agent.ts` (+1 action wrapper)
- `src/common/i18n/*.ts` (+~6 strings per locale)
- `package.json` (+2 dependencies)

---

## Approval

Awaiting user review of this document before invoking `writing-plans` to produce the implementation plan.
