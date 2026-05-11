# SwitchHosts HTTP API — CRUD Extension Design

**Date:** 2026-03-16
**Status:** Approved
**Author:** Vlad Tanasescu

---

## Overview

Extend the existing SwitchHosts HTTP API (Hono, port 50761) with full CRUD operations for hosts items and their content. The goal is to allow Claude Code to interact with SwitchHosts programmatically — activating/deactivating profiles, creating and editing hosts entries, and reading the current state.

The existing API (`GET /api/list`, `GET /api/toggle`) is preserved unchanged for backward compatibility.

---

## Approach

**Direct extension of the existing Hono router** in `src/main/http/`. No new dependencies. Each new endpoint lives in its own file (~30-50 lines), consistent with the existing `list.ts` / `toggle.ts` pattern.

Authentication: none (localhost-only, same as existing API).

ID generation: use `import { v4 as uuid4 } from 'uuid'` — already used in `setSystemHosts.ts` (line 21) with this exact import syntax. `uuid@13` is a project dependency.

---

## File Structure

```
src/main/http/api/
├── index.ts              ← modified: registers new sub-routers
├── list.ts               ← unchanged: GET /api/list
├── toggle.ts             ← unchanged: GET /api/toggle?id=
│
├── items/
│   ├── index.ts          ← sub-router registration
│   ├── getItem.ts        ← GET    /api/items/:id
│   ├── createItem.ts     ← POST   /api/items
│   ├── updateItem.ts     ← PUT    /api/items/:id
│   └── deleteItem.ts     ← DELETE /api/items/:id
│
└── content/
    ├── index.ts          ← sub-router registration
    ├── getContent.ts     ← GET  /api/content/:id
    └── setContent.ts     ← PUT  /api/content/:id
```

`api/index.ts` change:
```ts
import items_router from './items/index'
import content_router from './content/index'

router.get('/list', list)
router.get('/toggle', toggle)
router.route('/items', items_router)
router.route('/content', content_router)
```

---

## API Contracts

All endpoints return JSON. HTTP status codes:
- `200` — success
- `400` — bad request (missing/invalid body fields)
- `404` — item not found
- `500` — internal error

All error responses share the same shape:
```json
{ "success": false, "message": "human-readable error description" }
```

---

### Items

**Important:** Item objects (`IHostsListObject`) never include the raw hosts text content. Content is a separate resource — always accessed via `/api/content/:id`. The `content` field only appears internally on folder/group items in `cleanHostsList` (set to empty string); it is never part of the API response.

---

#### `GET /api/items/:id`

Returns a single hosts item by ID. Uses the `getItemFromList(id)` action (exported as `getItemFromList` from `@main/actions`).

**Response 200:**
```json
{ "success": true, "data": { "id": "abc", "title": "catena.ro", "type": "local", "on": true } }
```

**Response 404:**
```json
{ "success": false, "message": "Item not found: abc" }
```

---

#### `POST /api/items`

Creates a new hosts item prepended to the top of the top-level list (i.e., `unshift` into the root array — consistent with how the UI inserts new items at the top).

ID is auto-generated with `uuid4()`.

**Request body:**
```json
{
  "title": "catena box2",
  "type": "local",
  "on": false,
  "url": null,
  "refresh_interval": null,
  "folder_mode": null,
  "include": null,
  "children": null
}
```
Only `title` is required. `type` defaults to `"local"` if omitted. Null / undefined fields are omitted from the stored object.

**Implementation steps:**
1. Validate `title` is present
2. Build new item: `{ id: uuid4(), title, type: type ?? 'local', on: on ?? false, ...other_fields }`
3. `const list = await getList()`
4. `list.unshift(newItem)` — prepend to top
5. `await setList(list)`
6. `broadcast(events.reload_list)`
7. Return the new item

**Response 200:**
```json
{ "success": true, "data": { "id": "xyz-uuid", "title": "catena box2", "type": "local", "on": false } }
```

**Response 400:**
```json
{ "success": false, "message": "title is required" }
```

---

#### `PUT /api/items/:id`

Updates an existing item. Merge-patch semantics — only provided fields are updated.

**Implementation steps:**
1. `const list = await getList()`
2. Use `findItemById(list, id)` (from `@common/hostsFn`) to confirm item exists → 404 if not
3. `const newList = updateOneItem(list, { id, ...patchFields })` — `updateOneItem` is from `@common/hostsFn`, returns a new full list
4. `await setList(newList)`
5. `broadcast(events.reload_list)`
6. Use `findItemById(newList, id)` to retrieve the updated item for the response

**Request body (partial update example):**
```json
{ "on": true, "title": "catena box2 (active)" }
```

**Response 200:**
```json
{ "success": true, "data": { "id": "xyz-uuid", "title": "catena box2 (active)", "on": true } }
```

**Response 404:**
```json
{ "success": false, "message": "Item not found: xyz-uuid" }
```

---

#### `DELETE /api/items/:id`

Moves the item to the trashcan (not permanent deletion — consistent with UI behavior).

**Implementation steps:**
1. `const item = await getItemFromList(id)` — verify existence → 404 if not found
2. `await moveToTrashcan(id)`
3. `broadcast(events.reload_list)` — `moveToTrashcan` does NOT broadcast `reload_list` itself; it only broadcasts `toggle_item` if the item was active. The HTTP handler must broadcast `reload_list` manually.

**Response 200:**
```json
{ "success": true }
```

**Response 404:**
```json
{ "success": false, "message": "Item not found: xyz-uuid" }
```

---

### Content

---

#### `GET /api/content/:id`

Returns the raw hosts text for a given item ID.

**Implementation steps:**
1. `const item = await getItemFromList(id)` → 404 if not found
2. `const content = await getHostsContent(id)` — returns `null`/`undefined` if no content saved yet; normalize to `""`

**Response 200:**
```json
{ "success": true, "data": { "id": "xyz-uuid", "content": "10.0.52.232 catena.ro\n" } }
```

**Response 200 (no content saved yet):**
```json
{ "success": true, "data": { "id": "xyz-uuid", "content": "" } }
```

**Response 404:**
```json
{ "success": false, "message": "Item not found: xyz-uuid" }
```

---

#### `PUT /api/content/:id`

Sets the raw hosts text for an item. If the item is currently enabled (`on: true`), also rewrites the system hosts file immediately.

**Implementation steps:**
1. Validate `content` is a string → 400 if not
2. `const item = await getItemFromList(id)` → 404 if not found
3. `await setHostsContent(id, content)` — saves to DB (normalizes line endings automatically)
4. `broadcast(events.hosts_content_changed, id)` — tells the renderer editor to reload (passes `id` as argument — required)
5. **If `item.on === true`:** also rewrite the system hosts file:
   - `const list = await getList()`
   - `const combined = await getContentOfList(list)`
   - `await setSystemHosts(combined)` — this broadcasts `events.system_hosts_updated` and handles append/overwrite mode internally
6. Return `{ success: true }`

**Note:** `refreshHosts` is NOT used here. `refreshHosts` is only for remote items (fetches content from a URL). For local items, content is set directly via `setHostsContent`.

**Request body:**
```json
{ "content": "10.0.52.232 catena.ro\n10.0.52.232 www.catena.ro\n" }
```

**Response 200:**
```json
{ "success": true }
```

**Response 400:**
```json
{ "success": false, "message": "content must be a string" }
```

**Response 404:**
```json
{ "success": false, "message": "Item not found: xyz-uuid" }
```

---

## Data Flow Summary

```
HTTP Request
  → Hono handler (src/main/http/api/items/*.ts or content/*.ts)
  → actions from src/main/actions/ + helpers from @common/hostsFn
  → PotDb (swhdb)
  → broadcast(event, ...args)  ← renderer React re-syncs live
```

### Action mapping per endpoint

| Endpoint | Actions / helpers | Broadcast after |
|----------|-------------------|-----------------|
| `GET /api/items/:id` | `getItemFromList(id)` | none |
| `POST /api/items` | `getList()` + `setList(newList)` | `events.reload_list` |
| `PUT /api/items/:id` | `getList()` + `updateOneItem()` (hostsFn) + `setList(newList)` | `events.reload_list` |
| `DELETE /api/items/:id` | `getItemFromList(id)` + `moveToTrashcan(id)` | `events.reload_list` |
| `GET /api/content/:id` | `getItemFromList(id)` + `getHostsContent(id)` | none |
| `PUT /api/content/:id` | `getItemFromList(id)` + `setHostsContent(id, content)` + (if `on`) `getList()` + `getContentOfList(list)` + `setSystemHosts(combined)` | `events.hosts_content_changed, id` |

All actions imported from `@main/actions`. `updateOneItem`, `findItemById` imported from `@common/hostsFn`.

---

## Out of Scope

- Authentication / API keys (localhost-only is sufficient)
- Trashcan management endpoints
- History endpoints
- Config read/write endpoints
- Folder/group hierarchy manipulation (children ordering, nesting changes)

---

## Testing

- Each handler tested with Vitest under `test/main/http/`
- Tests run sequentially (`fileParallelism: false`) — same constraint as existing tests
- Cover per endpoint: happy path, not-found (404), invalid body (400)
- Test files mirror the handler structure: `test/main/http/items/`, `test/main/http/content/`
