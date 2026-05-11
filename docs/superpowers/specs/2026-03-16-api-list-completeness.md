# Spec: `/api/list` Completeness Gaps

**Date:** 2026-03-16
**Context:** Comparison between what `/api/list` currently returns vs what exists in `swh_data.json` (PotDb dump).

---

## What `/api/list` Returns Now

```json
{
  "success": true,
  "data": [
    { "id": "...", "title": "catena.ro", "on": true, "type": "local" },
    { "id": "...", "title": "tonica.ro", "on": false, "type": "folder" },
    { "id": "...", "title": "tonica.ro → box2", "on": false, "type": "local" }
  ]
}
```

- `flatten()` is applied — all items at same depth, no nesting
- Only list metadata fields returned — no content, no parent context
- For `remote` type: `url`, `refresh_interval`, `last_refresh`, `last_refresh_ms` are included **only if they exist** on the item (never refreshed = not present)

---

## Gap 1: Tree hierarchy is lost

**What exists in data:** Full nested tree — folders contain children arrays, each item knows its parent implicitly.

**What API returns:** Flat array. A `folder` item and its children appear at the same level with no link between them.

**Problem:** Can't reconstruct hierarchy. If you want to display "catena.ro / box2 server", you don't know `box2 server` belongs inside `catena.ro` folder.

**Fix options:**
- `?format=tree` → return nested JSON (folders with `children` arrays)
- Always inject `parent_id: string | null` in flat mode so clients can reconstruct

---

## Gap 2: `is_collapsed` field missing

**What exists in data:** `list.is_collapsed: true` is stored on folder items (whether sidebar folder is open/closed in UI).

**What API returns:** Not included — `flatten()` passes through whatever fields are on `IHostsListObject`, but `is_collapsed` is not in the type definition, it's an extra DB field.

**Impact:** Low (UI-only state). But if building an external UI that mirrors SwitchHosts, this is needed.

---

## Gap 3: `content` not included

**What exists in data:** Each item has a separate content record in `collection.hosts.data` with the actual hosts lines (`10.0.52.232 catena.ro www.catena.ro`).

**What API returns:** `/api/list` returns metadata only. Content requires a separate `GET /api/content/:id` per item = N+1 calls.

**Fix:** `?include_content=true` query param — attach `content: string` to each item in the response.

---

## Gap 4: `parent_id` not injected

**What exists in data:** Hierarchy is implicit in the nested tree structure.

**What API returns (flat mode):** No `parent_id`. You know `type: folder` exists but not which items are its children.

**Fix:** Inject `parent_id: string | null` during `flatten()` for `/api/list`. Top-level items get `parent_id: null`.

---

## Gap 5: `effective_on` not computed

**What exists in data:** Raw `on` per item. A folder's `on` can be `false` while a child item is `on: true` — the child IS active. A `group` item's effective state depends on whether its `include`d items are active.

**What API returns:** Raw `on` only. No indication of whether an item is truly contributing to the system hosts file.

**Fix:** Add `effective_on: boolean` computed field:
- `local`/`remote`: same as `on` if top-level; if inside a folder, `on && parent.on` (recursively)
- `folder`: `true` if any child has `effective_on: true`
- `group`: `true` if `on` and all `include`d items are `effective_on: true`

---

## Gap 6: Remote item staleness not surfaced

**What exists in data:** `last_refresh_ms: number` + `refresh_interval: number` (seconds).

**What API returns:** Both fields present if they exist, but no computed staleness.

**Fix:** Add `is_stale: boolean`:
```
is_stale = (now - last_refresh_ms) > (refresh_interval * 1000)
```
Return `null` if item was never refreshed or has no `refresh_interval`.

---

## Gap 7: `group` includes not resolved

**What exists in data:** `include: [id, id, ...]` — list of item IDs that the group merges.

**What API returns:** Raw `include` array of IDs. To know what a group contains, you must cross-reference items by ID manually.

**Fix:** `?resolve_groups=true` → expand `include` into full item objects (shallow, no recursion).

---

## Gap 8: System item not marked clearly

**What exists in data:** System hosts item has `id: "0"` and `is_sys: true` (implicit — it's the only item with numeric ID `"0"`).

**What API returns:** The `is_sys` field is part of `IHostsListObject` type but is not consistently present in DB data. The system item returns with `id: "0"` but no `is_sys` flag in practice.

**Fix:** Ensure `is_sys: true` is always injected for `id === "0"` items in `/api/list` response.

---

## Summary Table

| Gap | Field/Feature | Currently | Fix |
|-----|--------------|-----------|-----|
| 1 | Tree hierarchy | ❌ always flat | `?format=tree` param |
| 2 | `is_collapsed` | ❌ missing | Pass through extra fields |
| 3 | `content` | ❌ separate call | `?include_content=true` |
| 4 | `parent_id` | ❌ missing | Inject during flatten |
| 5 | `effective_on` | ❌ raw `on` only | Computed field |
| 6 | `is_stale` | ❌ missing | Computed from `last_refresh_ms` |
| 7 | Group resolution | ❌ raw IDs | `?resolve_groups=true` |
| 8 | `is_sys` flag | ⚠️ inconsistent | Force `true` for `id === "0"` |

---

## Priority

1. **`parent_id`** — zero breaking change, unlocks hierarchy reconstruction client-side
2. **`?format=tree`** — most natural shape, matches `swh_data.json` structure
3. **`?include_content=true`** — eliminates N+1 calls
4. **`effective_on`** — correct semantic for automation (e.g. "which domains are active?")
5. **`is_sys` fix** — correctness, trivial
6. **`is_stale`** — useful for remote item monitoring
7. **`is_collapsed`** — low priority, UI-only
8. **`?resolve_groups=true`** — low priority, edge case
