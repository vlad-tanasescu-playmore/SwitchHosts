# Design Spec: "Add new below" Context Menu Option

**Date:** 2026-03-16
**Status:** Approved by user

---

## Summary

Add an "Add new below" option to the right-click context menu of hosts list items. Clicking it opens the same `EditHostsInfo` drawer as the existing "Add new" action, but the new item is inserted immediately after the current item in the list instead of being appended at the end.

---

## Motivation

Currently, new hosts entries are always appended at the end of the list. Users who want to keep related entries grouped together must manually drag-and-drop after creation. Adding "Add new below" to the context menu makes this a single action.

---

## Design

### 1. Context Menu

**File:** `src/renderer/components/List/ListItem.tsx`

Add a new menu item between "Edit" and the separator:

```
Edit
Add new below   ← NEW
──────────────
Move to trashcan
```

On click, use `agent.broadcast` (renderer-side, from `@renderer/core/agent`) to emit `events.add_new` with `after_id` set to the ID of the right-clicked item:

```typescript
agent.broadcast(events.add_new, { after_id: data.id })
```

This is the same `agent.broadcast` used by existing menu items (e.g., `events.edit_hosts_info`). It is distinct from the main-process `broadcast` in `core/message.ts`. The `useOnBroadcast` hook in `EditHostsInfo.tsx` receives the payload as its callback argument — confirmed by the existing pattern where `events.edit_hosts_info` passes item data and `EditHostsInfo` receives it.

**Note on group items:** Items of type `group` are not filtered out — "Add new below" is shown for all item types. Clicking it inserts a new item after the group in its containing list (same logic as any other item). `insertAfterItemDeep` only recurses into `item.children?.length` — groups have `children` defined on the interface but never populated (they use `include` instead), so the guard `item.children?.length` ensures no recursion happens for them.

### 2. Event Listener & Insertion

**File:** `src/renderer/components/EditHostsInfo.tsx`

The existing `events.add_new` listener signature is:
```typescript
useOnBroadcast(events.add_new, () => { ... }, [])
```

**Replace** the existing listener (do not add a second `useOnBroadcast(events.add_new, ...)` alongside it) to accept an optional payload:
```typescript
useOnBroadcast(events.add_new, (params?: { after_id?: string }) => {
  afterIdRef.current = params?.after_id ?? null
  // open drawer (existing logic)
}, [])
```

Store `after_id` in a `useRef`:
```typescript
const afterIdRef = useRef<string | null>(null)
```

On save, use `insertAfterItemDeep` with `hosts_data.list` (read at save time — no stale closure risk):

```typescript
const insertAfterItemDeep = (
  list: IHostsListObject[],
  after_id: string,
  newItem: IHostsListObject,
): { list: IHostsListObject[]; inserted: boolean } => {
  // try this level first
  const idx = list.findIndex(item => item.id === after_id)
  if (idx >= 0) {
    const result = [...list]
    result.splice(idx + 1, 0, newItem)
    return { list: result, inserted: true }
  }
  // recurse into folder children
  let inserted = false
  const result = list.map(item => {
    if (!inserted && item.children?.length) {
      const r = insertAfterItemDeep(item.children, after_id, newItem)
      if (r.inserted) {
        inserted = true
        return { ...item, children: r.list }
      }
    }
    return item
  })
  return { list: result, inserted }
}
```

In `onSave`, when `is_add` is true:

```typescript
let list: IHostsListObject[]
const after_id = afterIdRef.current
if (after_id) {
  const result = insertAfterItemDeep(hosts_data.list, after_id, newItem)
  // if after_id was not found (item deleted before save) → append to end
  list = result.inserted ? result.list : [...hosts_data.list, newItem]
} else {
  // existing behaviour: append to end
  list = [...hosts_data.list, newItem]
}
await setList(list)
afterIdRef.current = null // reset after save
```

The existing `hostsFn` utilities (`findItemById`, `updateOneItem`) are **not** used — they do not support sibling insertion.

**Existing callers unaffected:** `src/main/ui/menu.ts` calls `broadcast(events.add_new)` with no arguments (Cmd+N accelerator). Since `params` is optional and defaults to `null`, this path continues to append to the end — no changes to `menu.ts`.

### 3. i18n

Add key `add_new_below` to locale files in `src/common/i18n/languages/`:

| File | Key | Value |
|------|-----|-------|
| `en.ts` | `add_new_below` | `"Add new below"` |
| `zh.ts` (Simplified) | `add_new_below` | `"在下方新建"` |
| `zh-hant.ts` (Traditional) | `add_new_below` | `"在下方新建"` |

The zh-Hans and zh-Hant strings are intentionally identical — the characters are the same in both scripts for this phrase.

For all other locale files (de, fr, ja, ko, pl, tr, etc.): add the same key with the English string as value. The i18n loader in `src/common/i18n/index.ts` merges locale objects with English as the base, so missing keys already fall back to English. No changes to `index.ts` are needed.

---

## Scope

| In scope | Out of scope |
|----------|-------------|
| Add "Add new below" menu item for all item types | "Add new above" option |
| Insert after top-level items | Inserting inside groups (include-based) |
| Insert after items inside folders | Changing item type after creation |
| i18n for all existing locale files | Auto-scrolling to new item |

---

## Files to Change

| File | Change |
|------|--------|
| `src/renderer/components/List/ListItem.tsx` | Add menu item, broadcast `after_id` |
| `src/renderer/components/EditHostsInfo.tsx` | Accept `after_id`, store in ref, insert using `insertAfterItemDeep` |
| `src/common/i18n/languages/en.ts` | Add `add_new_below` key |
| `src/common/i18n/languages/zh.ts` | Add `add_new_below` key |
| `src/common/i18n/languages/zh-hant.ts` | Add `add_new_below` key |
| Other locale files in `src/common/i18n/languages/` | Add `add_new_below` key (English value) |

**Not changed:** `src/main/ui/menu.ts`, `src/common/i18n/index.ts`

---

## Testing

- Right-click a top-level item → "Add new below" appears in menu between "Edit" and separator
- Fill form and save → new item appears directly below the right-clicked item
- Right-click an item inside a folder → new item inserted after it within the folder's `children`
- Right-click a group item → new item inserted after the group in its parent list
- Existing "Add new" via left panel (empty area right-click) → still appends to end
- Cmd+N / main menu "Add new" → still appends to end
- Open drawer via "Add new below", delete the source item before saving → new item appended to end (fallback)
- All existing context menu items (Edit, Refresh, Move to trashcan) still work
