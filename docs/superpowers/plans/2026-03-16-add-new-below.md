# Add New Below Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Add new below" option to the right-click context menu of hosts list items, inserting the new entry immediately after the selected item instead of at the end.

**Architecture:** The context menu in `ListItem.tsx` broadcasts `events.add_new` with an `after_id` payload. `EditHostsInfo.tsx` stores that ID in a ref and uses it at save time to splice the new item into the correct position via a new recursive helper function.

**Tech Stack:** React 19, TypeScript 5.9, Electron IPC via `agent.broadcast` / `useOnBroadcast`, Jotai atoms for state, PotDb for persistence.

---

## Chunk 1: i18n key + context menu item

### Task 1: Add `add_new_below` translation key to all locale files

**Files:**
- Modify: `src/common/i18n/languages/en.ts` (after line 44 `edit: 'Edit'`)
- Modify: `src/common/i18n/languages/zh.ts`
- Modify: `src/common/i18n/languages/zh-hant.ts`
- Modify: `src/common/i18n/languages/de.ts`
- Modify: `src/common/i18n/languages/fr.ts`
- Modify: `src/common/i18n/languages/ja.ts`
- Modify: `src/common/i18n/languages/ko.ts`
- Modify: `src/common/i18n/languages/pl.ts`
- Modify: `src/common/i18n/languages/tr.ts`

**Context:** The `LanguageDict` TypeScript type is derived via `typeof` from `en.ts`. Adding the key there makes it available as `lang.add_new_below` throughout the app.

- [ ] **Step 1: Add key to `en.ts`**

In `src/common/i18n/languages/en.ts`, add after line 44 (`edit: 'Edit',`):

```typescript
  add_new_below: 'Add new below',
```

- [ ] **Step 2: Add key to `zh.ts`**

Open `src/common/i18n/languages/zh.ts`, find the `edit` key and add after it:

```typescript
  add_new_below: '在下方新建',
```

- [ ] **Step 3: Add key to `zh-hant.ts`**

Open `src/common/i18n/languages/zh-hant.ts`, find the `edit` key and add after it:

```typescript
  add_new_below: '在下方新建',
```

- [ ] **Step 4: Add key to remaining locale files (de, fr, ja, ko, pl, tr)**

For each of `de.ts`, `fr.ts`, `ja.ts`, `ko.ts`, `pl.ts`, `tr.ts`, find the `edit` key and add after it:

```typescript
  add_new_below: 'Add new below',
```

(English fallback — the i18n system merges with English as base, so missing keys render empty string; explicit English is safer.)

- [ ] **Step 5: Run TypeScript check**

```bash
cd a:/xampp/htdocs/switchhosts
npm run typecheck
```

Expected: no errors. If errors about `add_new_below` being unknown: verify `en.ts` was saved correctly (it's the source of `LanguageDict`).

- [ ] **Step 6: Commit**

```bash
git add src/common/i18n/languages/
git commit -m "feat: add add_new_below i18n key to all locales"
```

---

### Task 2: Add "Add new below" menu item to context menu

**Files:**
- Modify: `src/renderer/components/List/ListItem.tsx` (lines 95–142)

**Context:** The context menu is built in `onContextMenu` handler (line 89). Menu items are an array of `IMenuItemOption`. The separator is at index 2 (after Edit and Refresh). We insert the new item at index 1 (between Edit and Refresh), then the filter on line 144 removes Refresh for non-remote items — so the order will be: Edit → Add new below → [Refresh if remote] → separator → Move to trashcan.

- [ ] **Step 1: Add the menu item**

In `src/renderer/components/List/ListItem.tsx`, find the `menu_items` array (line 95). After the closing brace of the `edit` item (lines 96–101), add:

```typescript
          {
            label: lang.add_new_below,
            click() {
              agent.broadcast(events.add_new, { after_id: data.id })
            },
          },
```

The array should now read (lines 95–142 area):

```typescript
        let menu_items: IMenuItemOption[] = [
          {
            label: lang.edit,
            click() {
              agent.broadcast(events.edit_hosts_info, data)
            },
          },
          {
            label: lang.add_new_below,
            click() {
              agent.broadcast(events.add_new, { after_id: data.id })
            },
          },
          {
            label: lang.refresh,
            async click() {
              // ... (unchanged)
            },
          },
          {
            type: 'separator',
          },
          {
            label: /* ... (unchanged) */,
            click() { /* ... */ },
          },
        ]
```

- [ ] **Step 2: Run TypeScript check**

```bash
npm run typecheck
```

Expected: no errors. (`lang.add_new_below` is now a valid key after Task 1.)

- [ ] **Step 3: Run tests**

```bash
npm run test
```

Expected: all tests pass (no existing tests cover the context menu).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/List/ListItem.tsx
git commit -m "feat: add 'Add new below' option to list item context menu"
```

---

## Chunk 2: Insertion logic in EditHostsInfo

### Task 3: Update `EditHostsInfo` to insert new item after a specific position

**Files:**
- Modify: `src/renderer/components/EditHostsInfo.tsx` (lines 25, 32–38, 55–62, 95–99)

**Context:**
- Line 95–99: existing `useOnBroadcast(events.add_new, ...)` listener — **replace** this, do not add a second one
- Line 55–62: the `is_add` branch in `onSave` — modify to use insertion helper
- We need a `useRef` to store `after_id` between broadcast event and save
- The recursive helper `insertAfterItemDeep` can be a module-level function (outside the component) to keep the component clean

**Key behaviour:**
- `after_id` present → insert immediately after that item (recursively searching top-level and folder children)
- `after_id` absent (e.g., Cmd+N, left panel "Add new") → append to end (existing behaviour unchanged)
- `after_id` present but item not found (deleted between right-click and save) → fallback: append to end

- [ ] **Step 1: Add `insertAfterItemDeep` helper above the component**

In `src/renderer/components/EditHostsInfo.tsx`, add after the imports (before `const EditHostsInfo = () => {`):

```typescript
const insertAfterItemDeep = (
  list: IHostsListObject[],
  after_id: string,
  newItem: IHostsListObject,
): { list: IHostsListObject[]; inserted: boolean } => {
  const idx = list.findIndex((item) => item.id === after_id)
  if (idx >= 0) {
    const result = [...list]
    result.splice(idx + 1, 0, newItem)
    return { list: result, inserted: true }
  }
  let inserted = false
  const result = list.map((item) => {
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

- [ ] **Step 2: Add `afterIdRef` inside the component**

In `src/renderer/components/EditHostsInfo.tsx`, change the React import on line 25:

```typescript
import React, { useRef, useState } from 'react'
```

Then add the ref declaration after the existing `useState` calls (after line 38):

```typescript
  const afterIdRef = useRef<string | null>(null)
```

- [ ] **Step 3: Replace the `add_new` listener**

Find lines 95–99:

```typescript
  useOnBroadcast(events.add_new, () => {
    setHosts(null)
    setIsAdd(true)
    setIsShow(true)
  })
```

Replace with:

```typescript
  useOnBroadcast(events.add_new, (params?: { after_id?: string }) => {
    afterIdRef.current = params?.after_id ?? null
    setHosts(null)
    setIsAdd(true)
    setIsShow(true)
  })
```

- [ ] **Step 4: Update `onSave` to use `insertAfterItemDeep`**

Find lines 55–62 in `onSave`:

```typescript
    if (is_add) {
      let h: IHostsListObject = {
        ...data,
        id: uuidv4(),
      }
      let list: IHostsListObject[] = [...hosts_data.list, h]
      await setList(list)
      agent.broadcast(events.select_hosts, h.id, 1000)
```

Replace the `let list` line and add the ref reset. The block becomes:

```typescript
    if (is_add) {
      let h: IHostsListObject = {
        ...data,
        id: uuidv4(),
      }
      const after_id = afterIdRef.current
      let list: IHostsListObject[]
      if (after_id) {
        const result = insertAfterItemDeep(hosts_data.list, after_id, h)
        list = result.inserted ? result.list : [...hosts_data.list, h]
      } else {
        list = [...hosts_data.list, h]
      }
      afterIdRef.current = null
      await setList(list)
      agent.broadcast(events.select_hosts, h.id, 1000)
```

- [ ] **Step 5: Run TypeScript check**

```bash
npm run typecheck
```

Expected: no errors. Common issues:
- `useRef` not imported → fix the import on line 25
- `insertAfterItemDeep` return type mismatch → check `IHostsListObject` import

- [ ] **Step 6: Run tests**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/EditHostsInfo.tsx
git commit -m "feat: insert new hosts item after selected position"
```

---

## Chunk 3: Manual verification

### Task 4: Test in development mode

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

Wait for both main process and renderer to compile (Vite will show "ready in Xms").

- [ ] **Step 2: Test "Add new below" on a top-level item**

1. Right-click any item in the hosts list
2. Verify "Add new below" appears between "Edit" and separator
3. Click "Add new below"
4. Fill in a title (e.g., "Test item")
5. Click OK
6. Verify the new item appears **directly below** the right-clicked item (not at the end)

- [ ] **Step 3: Test "Add new below" on item inside a folder**

1. Create a folder if none exists (right-click empty area → Add new, type = Folder)
2. Add items inside the folder via drag-drop or "Add new below" from within folder
3. Right-click an item inside the folder
4. Click "Add new below"
5. Verify the new item appears inside the folder, directly after the clicked item

- [ ] **Step 4: Verify existing "Add new" still appends**

1. Right-click the empty area in the left panel
2. Click "Add new"
3. Fill in title, click OK
4. Verify new item appears at the **end** of the list (existing behaviour unchanged)

- [ ] **Step 5: Test fallback (optional manual test)**

This scenario is hard to test manually, but the code path is: right-click item → "Add new below" → before saving, the source item is deleted → save. The new item should appear at the end.

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

---

## Summary

| Task | Files changed | Commit |
|------|--------------|--------|
| Task 1 | 9 i18n locale files | `feat: add add_new_below i18n key` |
| Task 2 | `ListItem.tsx` | `feat: add 'Add new below' to context menu` |
| Task 3 | `EditHostsInfo.tsx` | `feat: insert new item after selected position` |
| Task 4 | — (manual verification) | fix if needed |
