# `/api/list` Completeness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/api/list` with 8 completeness gaps: `parent_id`, `is_sys`, `?format=tree`, `?include_content=true`, `effective_on`, `is_stale`, `is_collapsed` pass-through, and `?resolve_groups=true`.

**Architecture:** All logic lives in a new pure helper module `src/main/http/api/listHelpers.ts` (no side effects, easily testable). The existing `src/main/http/api/list.ts` handler reads query params and delegates to these helpers. No changes to `@common/hostsFn` or any action — helpers are HTTP-layer only.

**Tech Stack:** TypeScript, Hono, Vitest, `@main/actions` (getList, getHostsContent, getItemFromList), `@common/hostsFn` (flatten, getParentOfItem, findItemById)

**Spec:** `docs/superpowers/specs/2026-03-16-api-list-completeness.md`

---

## Key codebase facts you must know

**`IHostsListObject`** (`src/common/data.d.ts`):
```ts
interface IHostsListObject {
  id: string
  title?: string
  on?: boolean
  type?: 'local' | 'remote' | 'group' | 'folder'
  url?: string
  last_refresh?: string
  last_refresh_ms?: number
  refresh_interval?: number   // seconds
  include?: string[]          // group: list of item IDs to merge
  folder_mode?: 0 | 1 | 2
  folder_open?: boolean
  children?: IHostsListObject[]
  is_sys?: boolean
  [key: string]: any          // extra DB fields like is_collapsed pass through
}
```

**`getHostsContent(id)`** (`src/main/actions/hosts/getContent.ts`) — returns raw hosts text string for any item ID. Already exported from `@main/actions`.

**`getParentOfItem(list, id)`** (`src/common/hostsFn.ts`) — returns parent `IHostsListObject | undefined`. Returns `undefined` for top-level items.

**`findItemById(list, id)`** (`src/common/hostsFn.ts`) — searches nested tree, returns item or undefined.

**`flatten(list)`** (`src/common/hostsFn.ts`) — depth-first flattening including children.

**Test pattern** (from `test/main/http.test.ts` and `test/main/http/items.test.ts`):
- Import `app` from `src/main/http`
- `app.request('/api/list?format=tree')` — fires request
- `clearData()` from `test/_base.ts` in `beforeEach`
- `setList([...])` from `@main/actions` to seed data
- `setHostsContent(id, text)` from `@main/actions` to seed content

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/main/http/api/listHelpers.ts` | **Create** | All pure transformation logic (parent_id injection, effective_on, is_stale, tree format, content inclusion, group resolution, is_sys fix) |
| `src/main/http/api/list.ts` | **Modify** | Read query params, delegate to helpers |
| `test/main/http/list-helpers.test.ts` | **Create** | Unit tests for all helpers (pure functions — fast, no DB) |
| `test/main/http/list-integration.test.ts` | **Create** | Integration tests: query params via `app.request` |

---

## Chunk 1: Core helpers + `parent_id` + `is_sys`

### Task 1: Create `listHelpers.ts` with `injectParentId` and `fixIsSys`

**Files:**
- Create: `src/main/http/api/listHelpers.ts`
- Create: `test/main/http/list-helpers.test.ts`

**Background:**

`injectParentId` takes a flat list (already flattened) plus the original tree, and injects `parent_id: string | null` on every item. It needs the tree to know which items are inside which folder.

`fixIsSys` ensures the system item (id `"0"`) always has `is_sys: true`. The system item exists in the DB but `is_sys` may not be stored.

- [ ] **Step 1.1: Write failing tests**

Create `test/main/http/list-helpers.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { fixIsSys, injectParentId } from '../../../src/main/http/api/listHelpers'
import type { IHostsListObject } from '../../../src/common/data'

describe('injectParentId', () => {
  it('sets parent_id to null for top-level items', () => {
    const tree: IHostsListObject[] = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]
    const flat = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
    const result = injectParentId(flat, tree)
    expect(result[0].parent_id).toBe(null)
    expect(result[1].parent_id).toBe(null)
  })

  it('sets parent_id for nested items', () => {
    const tree: IHostsListObject[] = [
      {
        id: 'folder-1',
        type: 'folder',
        children: [
          { id: 'child-1', title: 'Child 1' },
          { id: 'child-2', title: 'Child 2' },
        ],
      },
    ]
    const flat = [
      { id: 'folder-1', type: 'folder' as const },
      { id: 'child-1', title: 'Child 1' },
      { id: 'child-2', title: 'Child 2' },
    ]
    const result = injectParentId(flat, tree)
    expect(result.find(i => i.id === 'folder-1')!.parent_id).toBe(null)
    expect(result.find(i => i.id === 'child-1')!.parent_id).toBe('folder-1')
    expect(result.find(i => i.id === 'child-2')!.parent_id).toBe('folder-1')
  })

  it('handles deeply nested items', () => {
    const tree: IHostsListObject[] = [
      {
        id: 'f1',
        type: 'folder',
        children: [
          {
            id: 'f2',
            type: 'folder',
            children: [{ id: 'deep', title: 'Deep' }],
          },
        ],
      },
    ]
    const flat = [
      { id: 'f1', type: 'folder' as const },
      { id: 'f2', type: 'folder' as const },
      { id: 'deep', title: 'Deep' },
    ]
    const result = injectParentId(flat, tree)
    expect(result.find(i => i.id === 'deep')!.parent_id).toBe('f2')
    expect(result.find(i => i.id === 'f2')!.parent_id).toBe('f1')
  })
})

describe('fixIsSys', () => {
  it('injects is_sys: true for id "0"', () => {
    const items: IHostsListObject[] = [
      { id: '0', title: 'System Hosts' },
      { id: 'abc', title: 'Other' },
    ]
    const result = fixIsSys(items)
    expect(result.find(i => i.id === '0')!.is_sys).toBe(true)
    expect(result.find(i => i.id === 'abc')!.is_sys).toBeUndefined()
  })

  it('does not overwrite is_sys: true if already set', () => {
    const items: IHostsListObject[] = [{ id: '0', is_sys: true }]
    const result = fixIsSys(items)
    expect(result[0].is_sys).toBe(true)
  })
})
```

- [ ] **Step 1.2: Run — verify FAIL**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -15
```
Expected: FAIL — `injectParentId` and `fixIsSys` not found.

- [ ] **Step 1.3: Create `listHelpers.ts` with the two functions**

Create `src/main/http/api/listHelpers.ts`:
```ts
import { flatten, getParentOfItem } from '@common/hostsFn'
import type { IHostsListObject } from '@common/data'
// Note: getHostsContent will be added in Step 4.7 — DO NOT add it here yet

// Gap 4: inject parent_id into a flat list using the original tree for hierarchy lookup
export const injectParentId = (
  flat: IHostsListObject[],
  tree: IHostsListObject[],
): (IHostsListObject & { parent_id: string | null })[] => {
  return flat.map((item) => {
    const parent = getParentOfItem(tree, item.id)
    return { ...item, parent_id: parent ? parent.id : null }
  })
}

// Gap 8: ensure the system item (id "0") always has is_sys: true
export const fixIsSys = (items: IHostsListObject[]): IHostsListObject[] => {
  return items.map((item) =>
    item.id === '0' ? { ...item, is_sys: true } : item,
  )
}
```

- [ ] **Step 1.4: Run — verify PASS**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 1.5: Commit**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/listHelpers.ts test/main/http/list-helpers.test.ts && git commit -m "feat: add injectParentId and fixIsSys helpers for /api/list"
```

---

## Chunk 2: `effective_on` helper

### Task 2: Add `computeEffectiveOn`

**Files:**
- Modify: `src/main/http/api/listHelpers.ts`
- Modify: `test/main/http/list-helpers.test.ts`

**Background:**

`effective_on` answers: "Is this item actually contributing to the system hosts file right now?"

Rules:
- `local`/`remote` at top level: `effective_on = item.on ?? false`
- `local`/`remote` inside a folder: `effective_on = (item.on ?? false) && parent.effective_on`
- `folder`: `effective_on = true` if **any** child has `effective_on: true`
- `group`: `effective_on = (item.on ?? false) && all included items have `effective_on: true`

This requires a two-pass approach on the flat list (with `parent_id` already injected):
1. First compute `effective_on` for all non-folder, non-group items (they depend only on their ancestors)
2. Then compute `effective_on` for folder items (they depend on children)
3. Then compute `effective_on` for group items (they depend on `include` members)

Implementation strategy: work on the flat list with `parent_id` already injected. Use a Map for O(1) lookup by id. Process bottom-up: leaves first, then folders, then groups.

- [ ] **Step 2.1: Add tests for `computeEffectiveOn`**

Add to `test/main/http/list-helpers.test.ts`:
```ts
import { computeEffectiveOn, fixIsSys, injectParentId } from '../../../src/main/http/api/listHelpers'

describe('computeEffectiveOn', () => {
  it('top-level local item: effective_on = on', () => {
    const flat = [
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
      { id: 'b', type: 'local' as const, on: false, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'a')!.effective_on).toBe(true)
    expect(result.find(i => i.id === 'b')!.effective_on).toBe(false)
  })

  it('child inside active folder: effective_on = child.on && folder.on', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: true, parent_id: null },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
      { id: 'd', type: 'local' as const, on: false, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(true)
    expect(result.find(i => i.id === 'd')!.effective_on).toBe(false)
  })

  it('child inside inactive folder: effective_on = false even if child.on = true', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: false, parent_id: null },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(false)
  })

  it('folder effective_on = true if any child has effective_on = true', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: true, parent_id: null },
      { id: 'c1', type: 'local' as const, on: true, parent_id: 'f' },
      { id: 'c2', type: 'local' as const, on: false, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'f')!.effective_on).toBe(true)
  })

  it('folder effective_on = false if all children have effective_on = false', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: true, parent_id: null },
      { id: 'c1', type: 'local' as const, on: false, parent_id: 'f' },
      { id: 'c2', type: 'local' as const, on: false, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'f')!.effective_on).toBe(false)
  })

  it('group: effective_on = on && all included items are effective_on', () => {
    const flat = [
      { id: 'g', type: 'group' as const, on: true, parent_id: null, include: ['a', 'b'] },
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
      { id: 'b', type: 'local' as const, on: true, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'g')!.effective_on).toBe(true)
  })

  it('group: effective_on = false if any included item is not effective_on', () => {
    const flat = [
      { id: 'g', type: 'group' as const, on: true, parent_id: null, include: ['a', 'b'] },
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
      { id: 'b', type: 'local' as const, on: false, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'g')!.effective_on).toBe(false)
  })

  it('group: effective_on = false if group itself is off', () => {
    const flat = [
      { id: 'g', type: 'group' as const, on: false, parent_id: null, include: ['a'] },
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'g')!.effective_on).toBe(false)
  })

  it('nested folder: child in inactive parent folder is not effective even with grandparent on', () => {
    const flat = [
      { id: 'gf', type: 'folder' as const, on: true, parent_id: null },
      { id: 'f', type: 'folder' as const, on: false, parent_id: 'gf' },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(false)
  })
})
```

- [ ] **Step 2.2: Run — verify FAIL**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -15
```

- [ ] **Step 2.3: Implement `computeEffectiveOn` in `listHelpers.ts`**

Add to `src/main/http/api/listHelpers.ts`:
```ts
type FlatWithParent = IHostsListObject & { parent_id: string | null }
type FlatWithEffective = FlatWithParent & { effective_on: boolean }

// Gap 5: compute effective_on for each item
// Requires flat list with parent_id already injected (output of injectParentId)
export const computeEffectiveOn = (
  flat: FlatWithParent[],
): FlatWithEffective[] => {
  // Build a working map: id → item with mutable effective_on
  const map = new Map<string, FlatWithEffective>()
  for (const item of flat) {
    map.set(item.id, { ...item, effective_on: false })
  }

  // Pass 1: compute effective_on for local/remote items (depend only on ancestors)
  const getAncestorEffective = (parentId: string | null): boolean => {
    if (parentId === null) return true
    const parent = map.get(parentId)
    if (!parent) return true
    if (parent.type === 'folder') {
      // folder's effective depends on its parent chain AND whether it has active children
      // For ancestor check: folder is "passthrough" — check if folder itself is on AND its parent chain
      return (parent.on ?? false) && getAncestorEffective(parent.parent_id)
    }
    return (parent.on ?? false) && getAncestorEffective(parent.parent_id)
  }

  for (const [, item] of map) {
    if (item.type !== 'folder' && item.type !== 'group') {
      item.effective_on = (item.on ?? false) && getAncestorEffective(item.parent_id)
    }
  }

  // Pass 2: compute effective_on for folder items (any child effective = folder effective)
  const getFolderEffective = (folderId: string): boolean => {
    for (const [, item] of map) {
      if (item.parent_id === folderId) {
        if (item.type === 'folder') {
          if (getFolderEffective(item.id)) return true
        } else if (item.type !== 'group') {
          if (item.effective_on) return true
        }
      }
    }
    return false
  }

  for (const [, item] of map) {
    if (item.type === 'folder') {
      item.effective_on = getFolderEffective(item.id)
    }
  }

  // Pass 3: compute effective_on for group items
  for (const [, item] of map) {
    if (item.type === 'group') {
      if (!(item.on ?? false)) {
        item.effective_on = false
      } else {
        const includes = item.include ?? []
        item.effective_on = includes.length > 0 && includes.every((incId) => {
          const inc = map.get(incId)
          return inc ? inc.effective_on : false
        })
      }
    }
  }

  return Array.from(map.values())
}
```

- [ ] **Step 2.4: Run — verify PASS**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -10
```

- [ ] **Step 2.5: Commit**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/listHelpers.ts test/main/http/list-helpers.test.ts && git commit -m "feat: add computeEffectiveOn helper for /api/list"
```

---

## Chunk 3: `is_stale` + `is_collapsed` helpers

### Task 3: Add `computeIsStale` and `passIsCollapsed`

**Files:**
- Modify: `src/main/http/api/listHelpers.ts`
- Modify: `test/main/http/list-helpers.test.ts`

**Background:**

`is_stale`: only meaningful for `remote` type items that have `refresh_interval` and `last_refresh_ms`. Formula: `(Date.now() - last_refresh_ms) > (refresh_interval * 1000)`. Returns `null` if item was never refreshed or has no `refresh_interval`.

`passIsCollapsed`: `is_collapsed` is stored as an extra DB field on folder items. Because `IHostsListObject` has `[key: string]: any`, it passes through already when the item is returned. This helper just documents/enforces that `is_collapsed` is passed through as-is (no transformation needed — it's already there if it's in the DB). The "helper" is just the identity — so this task is just a test that confirms the field passes through.

- [ ] **Step 3.1: Add tests**

Add to `test/main/http/list-helpers.test.ts`:
```ts
import { computeEffectiveOn, computeIsStale, fixIsSys, injectParentId } from '../../../src/main/http/api/listHelpers'

describe('computeIsStale', () => {
  it('returns null for non-remote items', () => {
    const items = [{ id: 'a', type: 'local' as const }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBeNull()
  })

  it('returns null for remote item with no refresh_interval', () => {
    const items = [{ id: 'a', type: 'remote' as const, last_refresh_ms: 1000 }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBeNull()
  })

  it('returns null for remote item never refreshed (no last_refresh_ms)', () => {
    const items = [{ id: 'a', type: 'remote' as const, refresh_interval: 60 }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBeNull()
  })

  it('returns false for fresh remote item', () => {
    const now = Date.now()
    const items = [{
      id: 'a',
      type: 'remote' as const,
      refresh_interval: 3600,         // 1 hour
      last_refresh_ms: now - 60_000,  // refreshed 1 minute ago
    }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBe(false)
  })

  it('returns true for stale remote item', () => {
    const now = Date.now()
    const items = [{
      id: 'a',
      type: 'remote' as const,
      refresh_interval: 60,              // 1 minute
      last_refresh_ms: now - 120_000,    // refreshed 2 minutes ago
    }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBe(true)
  })

  it('passes is_collapsed through unchanged', () => {
    const items = [{ id: 'f', type: 'folder' as const, is_collapsed: true }]
    const result = computeIsStale(items)
    expect(result[0].is_collapsed).toBe(true)
  })
})
```

- [ ] **Step 3.2: Run — verify FAIL**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -15
```

- [ ] **Step 3.3: Implement `computeIsStale` in `listHelpers.ts`**

Add to `src/main/http/api/listHelpers.ts`:
```ts
// Gap 6: compute is_stale for remote items
// Gap 2: is_collapsed already passes through via [key: string]: any — no transformation needed
export const computeIsStale = (
  items: IHostsListObject[],
): (IHostsListObject & { is_stale: boolean | null })[] => {
  const now = Date.now()
  return items.map((item) => {
    if (
      item.type === 'remote' &&
      typeof item.refresh_interval === 'number' &&
      typeof item.last_refresh_ms === 'number'
    ) {
      const is_stale = (now - item.last_refresh_ms) > (item.refresh_interval * 1000)
      return { ...item, is_stale }
    }
    return { ...item, is_stale: null }
  })
}
```

- [ ] **Step 3.4: Run — verify PASS**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -10
```

- [ ] **Step 3.5: Commit**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/listHelpers.ts test/main/http/list-helpers.test.ts && git commit -m "feat: add computeIsStale helper for /api/list"
```

---

## Chunk 4: `buildTreeFormat` + `resolveGroups` + `attachContent` helpers

### Task 4: Add tree format, group resolution, and content attachment helpers

**Files:**
- Modify: `src/main/http/api/listHelpers.ts`
- Modify: `test/main/http/list-helpers.test.ts`

**Background:**

`buildTreeFormat`: Takes the original tree from `getList()` and applies all computed fields (parent_id, effective_on, is_stale, is_sys, is_collapsed) to nodes in-place recursively. Returns a new nested tree with all enrichments applied. Content is attached here too if `include_content` is true.

`resolveGroups`: For items with `type === 'group'`, replaces the raw `include: string[]` array with `resolved_include: IHostsListObject[]` (shallow — just the item metadata, no recursion). Items in flat mode only.

`attachContent`: Async. Given a flat or tree list, attaches `content: string` to each item by calling `getHostsContent(id)`. Works on both flat and tree (recursive).

- [ ] **Step 4.1: Add tests for `resolveGroups`**

Add to `test/main/http/list-helpers.test.ts`:
```ts
import { computeEffectiveOn, computeIsStale, fixIsSys, injectParentId, resolveGroups } from '../../../src/main/http/api/listHelpers'

describe('resolveGroups', () => {
  it('resolves include IDs to item objects for group items', () => {
    const flat = [
      { id: 'g', type: 'group' as const, include: ['a', 'b'] },
      { id: 'a', type: 'local' as const, title: 'Item A' },
      { id: 'b', type: 'local' as const, title: 'Item B' },
    ]
    const result = resolveGroups(flat)
    const group = result.find(i => i.id === 'g')!
    expect(group.resolved_include).toHaveLength(2)
    expect(group.resolved_include[0].id).toBe('a')
    expect(group.resolved_include[1].id).toBe('b')
  })

  it('skips unknown IDs in include', () => {
    const flat = [
      { id: 'g', type: 'group' as const, include: ['a', 'missing'] },
      { id: 'a', type: 'local' as const, title: 'Item A' },
    ]
    const result = resolveGroups(flat)
    const group = result.find(i => i.id === 'g')!
    expect(group.resolved_include).toHaveLength(1)
    expect(group.resolved_include[0].id).toBe('a')
  })

  it('does not modify non-group items', () => {
    const flat = [
      { id: 'a', type: 'local' as const, title: 'Item A' },
    ]
    const result = resolveGroups(flat)
    expect(result[0].resolved_include).toBeUndefined()
  })
})
```

- [ ] **Step 4.2: Run — verify FAIL**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -15
```

- [ ] **Step 4.3: Implement `resolveGroups` in `listHelpers.ts`**

Add to `src/main/http/api/listHelpers.ts`:
```ts
// Gap 7: resolve group include IDs to item objects (?resolve_groups=true)
export const resolveGroups = (
  flat: IHostsListObject[],
): (IHostsListObject & { resolved_include?: IHostsListObject[] })[] => {
  return flat.map((item) => {
    if (item.type !== 'group' || !item.include) return item
    const resolved_include = item.include
      .map((incId) => flat.find((i) => i.id === incId))
      .filter((i): i is IHostsListObject => i !== undefined)
    return { ...item, resolved_include }
  })
}
```

- [ ] **Step 4.4: Run — verify PASS for resolveGroups tests**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -10
```

- [ ] **Step 4.5: Add tests for `attachContent` (async)**

Add to `test/main/http/list-helpers.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachContent, computeEffectiveOn, computeIsStale, fixIsSys, injectParentId, resolveGroups } from '../../../src/main/http/api/listHelpers'
import { clearData } from '../../_base'
import { setHostsContent, setList } from '../../../src/main/actions'

describe('attachContent', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('attaches content string to each flat item', async () => {
    await setList([
      { id: 'item-1', type: 'local', title: 'A' },
      { id: 'item-2', type: 'local', title: 'B' },
    ])
    await setHostsContent('item-1', '10.0.0.1 a.com')
    await setHostsContent('item-2', '10.0.0.2 b.com')

    const flat = [
      { id: 'item-1', type: 'local' as const },
      { id: 'item-2', type: 'local' as const },
    ]
    const result = await attachContent(flat)
    expect(result.find(i => i.id === 'item-1')!.content).toContain('10.0.0.1 a.com')
    expect(result.find(i => i.id === 'item-2')!.content).toContain('10.0.0.2 b.com')
  })

  it('returns empty string for items with no saved content', async () => {
    await setList([{ id: 'item-1', type: 'local', title: 'A' }])
    const flat = [{ id: 'item-1', type: 'local' as const }]
    const result = await attachContent(flat)
    expect(result[0].content).toBe('')
  })
})
```

- [ ] **Step 4.6: Run — verify FAIL for attachContent tests**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -15
```

- [ ] **Step 4.7: Implement `attachContent` in `listHelpers.ts`**

Add the static import at the top of `src/main/http/api/listHelpers.ts` (alongside existing imports):
```ts
import { getHostsContent } from '@main/actions'
import { flatten, getParentOfItem } from '@common/hostsFn'
```

Then add the function:
```ts
// Gap 3: attach content to each item in a flat list (?include_content=true, flat mode)
export const attachContent = async (
  flat: IHostsListObject[],
): Promise<(IHostsListObject & { content: string })[]> => {
  return Promise.all(
    flat.map(async (item) => {
      const raw = await getHostsContent(item.id)
      return { ...item, content: raw ?? '' }
    }),
  )
}
```

- [ ] **Step 4.7b: Run — verify attachContent tests PASS**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -10
```

- [ ] **Step 4.7c: Commit attachContent**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/listHelpers.ts test/main/http/list-helpers.test.ts && git commit -m "feat: add attachContent helper for /api/list"
```

- [ ] **Step 4.8: Add tests for `buildTreeWithEnrichments` (tree format helper)**

Add to `test/main/http/list-helpers.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachContent, buildTreeWithEnrichments,
  computeEffectiveOn, computeIsStale, fixIsSys, injectParentId, resolveGroups
} from '../../../src/main/http/api/listHelpers'
import { clearData } from '../../_base'
import { setHostsContent, setList } from '../../../src/main/actions'

describe('buildTreeWithEnrichments', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns nested structure preserving children', async () => {
    const tree = [
      {
        id: 'f',
        type: 'folder' as const,
        on: true,
        children: [
          { id: 'c', type: 'local' as const, on: true },
        ],
      },
    ]
    const result = await buildTreeWithEnrichments(tree, { includeContent: false })
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].id).toBe('c')
  })

  it('injects parent_id, effective_on, is_stale on all nodes', async () => {
    const tree = [
      {
        id: 'f',
        type: 'folder' as const,
        on: true,
        children: [
          { id: 'c', type: 'local' as const, on: true },
        ],
      },
    ]
    const result = await buildTreeWithEnrichments(tree, { includeContent: false })
    const folder = result[0]
    const child = result[0].children![0]
    expect(folder.parent_id).toBe(null)
    expect(child.parent_id).toBe('f')
    expect(child.effective_on).toBe(true)
    expect(folder.effective_on).toBe(true)
    expect('is_stale' in child).toBe(true)
  })

  it('attaches content to nodes when includeContent is true', async () => {
    await setList([
      {
        id: 'f',
        type: 'folder',
        on: true,
        children: [{ id: 'c', type: 'local', on: true }],
      },
    ])
    await setHostsContent('c', '1.2.3.4 test.com')
    const tree = [
      {
        id: 'f',
        type: 'folder' as const,
        on: true,
        children: [{ id: 'c', type: 'local' as const, on: true }],
      },
    ]
    const result = await buildTreeWithEnrichments(tree, { includeContent: true })
    expect(result[0].children![0].content).toContain('1.2.3.4 test.com')
  })
})
```

- [ ] **Step 4.9: Run — verify FAIL for buildTreeWithEnrichments**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -15
```

- [ ] **Step 4.10: Implement `buildTreeWithEnrichments` in `listHelpers.ts`**

**Note:** `getHostsContent`, `flatten`, and `getParentOfItem` are already imported from Step 4.7. Do NOT add duplicate imports.

Add to `src/main/http/api/listHelpers.ts`:
```ts
// Gap 1: build enriched tree format (?format=tree)
// Applies all enrichments recursively: parent_id, effective_on, is_stale, is_sys, content
// Note: flatten and getHostsContent are already imported at top of file
export const buildTreeWithEnrichments = async (
  tree: IHostsListObject[],
  options: { includeContent: boolean },
): Promise<IHostsListObject[]> => {
  const flat = flatten(tree)
  const withParent = injectParentId(flat, tree)
  const withEffective = computeEffectiveOn(withParent)
  const withStale = computeIsStale(withEffective)
  const fixed = fixIsSys(withStale)

  // Build a lookup map of enriched flat items
  const enrichedMap = new Map(fixed.map((i) => [i.id, i]))

  // Recursive function to rebuild nested tree with enrichments applied
  const enrichNode = async (item: IHostsListObject): Promise<IHostsListObject> => {
    const enriched = enrichedMap.get(item.id) ?? item
    const node: IHostsListObject = { ...enriched }

    if (options.includeContent) {
      const raw = await getHostsContent(item.id)
      node.content = raw ?? ''
    }

    if (item.children && item.children.length > 0) {
      node.children = await Promise.all(item.children.map(enrichNode))
    }

    return node
  }

  return Promise.all(tree.map(enrichNode))
}
```

- [ ] **Step 4.11: Run — all list-helpers tests pass**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-helpers.test.ts 2>&1 | tail -10
```

- [ ] **Step 4.12: Commit buildTreeWithEnrichments**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/listHelpers.ts test/main/http/list-helpers.test.ts && git commit -m "feat: add buildTreeWithEnrichments helper for /api/list"
```

---

## Chunk 5: Wire helpers into `list.ts` handler + integration tests

### Task 5: Update `list.ts` to use all helpers + add integration tests

**Files:**
- Modify: `src/main/http/api/list.ts`
- Create: `test/main/http/list-integration.test.ts`

**Background:**

Query params accepted by the updated `/api/list`:

| Param | Values | Default | Effect |
|-------|--------|---------|--------|
| `format` | `tree` | flat | Return nested tree instead of flat |
| `include_content` | `true` | false | Attach `content: string` to each item |
| `resolve_groups` | `true` | false | Expand group `include` IDs to objects |

Always applied (regardless of params): `parent_id`, `is_sys`, `effective_on`, `is_stale`, `is_collapsed` (pass-through).

**Flat mode processing pipeline:**
1. `getList()` → tree
2. `flatten(tree)` → flat
3. `injectParentId(flat, tree)` → flat with parent_id
4. `computeEffectiveOn(flatWithParent)` → flat with effective_on
5. `computeIsStale(flatWithEffective)` → flat with is_stale
6. `fixIsSys(flat)` → flat with is_sys corrected
7. If `resolve_groups=true`: `resolveGroups(flat)`
8. If `include_content=true`: `await attachContent(flat)`

**Tree mode processing pipeline:**
1. `getList()` → tree
2. `await buildTreeWithEnrichments(tree, { includeContent })` → enriched tree
3. If `resolve_groups=true`: apply `resolveGroups` on the flattened nodes (then rebuild — skip for now, resolveGroups only in flat mode per spec)

- [ ] **Step 5.1: Write failing integration tests**

Create `test/main/http/list-integration.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setHostsContent, setList } from '../../../src/main/actions'
import { app } from '../../../src/main/http'
import { clearData } from '../../_base'

describe('/api/list — always-on enrichments', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('injects parent_id: null for top-level items', async () => {
    await setList([{ id: 'a', title: 'A', type: 'local', on: true }])
    const res = await app.request('/api/list')
    const body = await res.json()
    expect(body.data[0].parent_id).toBe(null)
  })

  it('injects parent_id for nested items', async () => {
    await setList([{
      id: 'f', type: 'folder', on: true,
      children: [{ id: 'c', type: 'local', on: true }],
    }])
    const res = await app.request('/api/list')
    const body = await res.json()
    const child = body.data.find((i: { id: string }) => i.id === 'c')
    expect(child.parent_id).toBe('f')
  })

  it('injects is_sys: true for id "0"', async () => {
    await setList([{ id: '0', title: 'System Hosts', type: 'local', on: true }])
    const res = await app.request('/api/list')
    const body = await res.json()
    expect(body.data[0].is_sys).toBe(true)
  })

  it('injects effective_on field', async () => {
    await setList([{ id: 'a', type: 'local', on: true }])
    const res = await app.request('/api/list')
    const body = await res.json()
    expect(typeof body.data[0].effective_on).toBe('boolean')
  })

  it('injects is_stale: null for non-remote items', async () => {
    await setList([{ id: 'a', type: 'local', on: true }])
    const res = await app.request('/api/list')
    const body = await res.json()
    expect(body.data[0].is_stale).toBeNull()
  })
})

describe('/api/list?format=tree', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns nested structure', async () => {
    await setList([{
      id: 'f', type: 'folder', on: true,
      children: [{ id: 'c', type: 'local', on: true }],
    }])
    const res = await app.request('/api/list?format=tree')
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].children).toHaveLength(1)
    expect(body.data[0].children[0].id).toBe('c')
  })

  it('tree nodes have parent_id and effective_on', async () => {
    await setList([{
      id: 'f', type: 'folder', on: true,
      children: [{ id: 'c', type: 'local', on: true }],
    }])
    const res = await app.request('/api/list?format=tree')
    const body = await res.json()
    expect(body.data[0].parent_id).toBe(null)
    expect(body.data[0].children[0].parent_id).toBe('f')
    expect(typeof body.data[0].children[0].effective_on).toBe('boolean')
  })
})

describe('/api/list?include_content=true', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('attaches content to each item (flat mode)', async () => {
    await setList([{ id: 'a', type: 'local', on: true }])
    await setHostsContent('a', '1.2.3.4 test.com')
    const res = await app.request('/api/list?include_content=true')
    const body = await res.json()
    expect(body.data[0].content).toContain('1.2.3.4 test.com')
  })

  it('attaches content in tree mode too', async () => {
    await setList([{
      id: 'f', type: 'folder', on: true,
      children: [{ id: 'c', type: 'local', on: true }],
    }])
    await setHostsContent('c', '5.6.7.8 deep.com')
    const res = await app.request('/api/list?format=tree&include_content=true')
    const body = await res.json()
    expect(body.data[0].children[0].content).toContain('5.6.7.8 deep.com')
  })
})

describe('/api/list?resolve_groups=true', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('expands include IDs to objects', async () => {
    await setList([
      { id: 'g', type: 'group', on: true, include: ['a'] },
      { id: 'a', type: 'local', on: true, title: 'My Item' },
    ])
    const res = await app.request('/api/list?resolve_groups=true')
    const body = await res.json()
    const group = body.data.find((i: { id: string }) => i.id === 'g')
    expect(group.resolved_include).toHaveLength(1)
    expect(group.resolved_include[0].id).toBe('a')
  })
})
```

- [ ] **Step 5.2: Run — verify integration tests FAIL**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-integration.test.ts 2>&1 | tail -20
```
Expected: all fail — current `/api/list` doesn't have any of these enrichments.

- [ ] **Step 5.3: Rewrite `src/main/http/api/list.ts`**

Use intermediate typed variables to avoid `as any` casts — each helper returns a wider type, so we accumulate them via spread into `IHostsListObject[]` at the end:

```ts
import { getList } from '@main/actions'
import { flatten } from '@common/hostsFn'
import type { IHostsListObject } from '@common/data'
import type { Context } from 'hono'
import {
  attachContent,
  buildTreeWithEnrichments,
  computeEffectiveOn,
  computeIsStale,
  fixIsSys,
  injectParentId,
  resolveGroups,
} from './listHelpers'

const list = async (c: Context) => {
  let tree: IHostsListObject[]
  try {
    tree = await getList()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ success: false, message })
  }

  const format = c.req.query('format')
  const includeContent = c.req.query('include_content') === 'true'
  const resolveGroupsParam = c.req.query('resolve_groups') === 'true'

  let data: IHostsListObject[]

  if (format === 'tree') {
    data = await buildTreeWithEnrichments(tree, { includeContent })
  } else {
    // Flat mode pipeline — each step widens the type; cast to IHostsListObject[] at end
    // IHostsListObject has [key: string]: any so all extra fields are compatible
    const step1 = flatten(tree)
    const step2 = injectParentId(step1, tree)
    const step3 = computeEffectiveOn(step2)
    const step4 = computeIsStale(step3)
    const step5 = fixIsSys(step4)
    const step6 = resolveGroupsParam ? resolveGroups(step5) : step5
    data = includeContent
      ? await attachContent(step6 as IHostsListObject[])
      : (step6 as IHostsListObject[])
  }

  return c.json({ success: true, data })
}

export default list
```

**Note on TypeScript:** `IHostsListObject` has `[key: string]: any`, so all the extra fields added by helpers (`parent_id`, `effective_on`, etc.) are compatible with `IHostsListObject`. The two casts at the end (`step6 as IHostsListObject[]`) are safe and intentional — not suppressing errors, just narrowing back to the base type for the response.

- [ ] **Step 5.4: Run integration tests — verify PASS**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- test/main/http/list-integration.test.ts 2>&1 | tail -20
```

- [ ] **Step 5.5: Run full test suite — no regressions**

```bash
cd a:/xampp/htdocs/switchhosts && npm test 2>&1 | tail -20
```
Expected: all tests pass except the pre-existing `normalize.test.ts` failure.

- [ ] **Step 5.6: Run typecheck**

```bash
cd a:/xampp/htdocs/switchhosts && npm run typecheck 2>&1
```
Fix any TypeScript errors.

- [ ] **Step 5.7: Commit**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/list.ts test/main/http/list-integration.test.ts && git commit -m "feat: wire all /api/list enrichments (parent_id, effective_on, is_stale, tree, content, groups)"
```

---

## Done

After all commits:

**Always present in `/api/list` response:**
- `parent_id: string | null` — hierarchy reconstruction
- `effective_on: boolean` — actual contribution to system hosts
- `is_stale: boolean | null` — staleness for remote items
- `is_sys: true` — guaranteed on system item (`id: "0"`)
- `is_collapsed` — passes through from DB (no transformation needed)

**Optional query params:**
- `?format=tree` — nested structure preserving `children` arrays
- `?include_content=true` — attaches `content: string` to every item (flat and tree)
- `?resolve_groups=true` — adds `resolved_include: IHostsListObject[]` on group items (flat mode only)
