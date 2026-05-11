# SwitchHosts HTTP API

SwitchHosts exposes a local HTTP API that allows external tools and scripts to interact with hosts
profiles programmatically — listing, creating, updating, deleting items, managing hosts content,
and toggling profiles on/off.

## Enabling the API

The HTTP API is **disabled by default**. To enable it:

1. Open SwitchHosts
2. Go to **Preferences**
3. Enable **HTTP API**

Once enabled, the server starts on port **50761**.

By default it binds to `127.0.0.1` (localhost only). You can allow network access by disabling
the "Only local" option in Preferences, which binds to `0.0.0.0` instead.

## Base URL

```
http://127.0.0.1:50761
```

## Authentication

There is no authentication. Access is controlled by the bind address:

- `127.0.0.1` (default) — only processes on the same machine can connect
- `0.0.0.0` — any machine on the network can connect

## All Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/remote-test` | Remote hosts server simulation |
| GET | `/api/list` | List all items (with filtering, enrichments, format options) |
| GET | `/api/toggle?id=<id>` | Toggle an item on/off (legacy) |
| GET | `/api/items/:id` | Get a single item by ID |
| POST | `/api/items` | Create a new item |
| PUT | `/api/items/:id` | Update an item (partial update) |
| DELETE | `/api/items/:id` | Delete an item (moves to trashcan) |
| GET | `/api/content/:id` | Get the raw hosts content of an item |
| PUT | `/api/content/:id` | Set the raw hosts content of an item |

---

## System Endpoints

### `GET /`

Health check. Confirms the server is running.

**Response:** `200 OK`, plain text

```
Hello SwitchHosts!
```

---

### `GET /remote-test`

Used to verify that the server can serve remote-hosts-style text responses.

**Response:** `200 OK`, plain text

```
# remote-test
# Mon Mar 16 2026 10:30:00 GMT+0200
```

---

## List Endpoint

### `GET /api/list`

Returns all hosts items. Supports filtering, format selection, content inclusion, and group resolution.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `tree` \| *(omit for flat)* | flat | Return nested tree structure instead of flat list |
| `on` | `true` \| `false` | — | Filter by enabled/disabled state |
| `type` | `local,remote,...` | — | Filter by type (comma-separated, e.g. `type=local,remote`) |
| `ids` | `id1,id2,...` | — | Filter to specific item IDs (comma-separated) |
| `q` | string | — | Case-insensitive title search |
| `include_content` | `true` | — | Attach raw hosts content to each item |
| `resolve_groups` | `true` | — | Expand group `include` IDs to full item objects |

**Response:** `200 OK`, JSON

```json
{
  "success": true,
  "data": [ /* array of IHostsListObject */ ]
}
```

**On error:**
```json
{ "success": false, "message": "error description" }
```

#### Flat mode (default)

Items are returned as a flat array. Each item always includes these extra computed fields:

| Field | Type | Description |
|-------|------|-------------|
| `parent_id` | `string \| null` | ID of the parent folder/group, or `null` for top-level items |
| `effective_on` | `boolean` | Whether this item is actually active (resolves parent folder state, group membership) |
| `is_stale` | `boolean \| null` | Remote items: `true` if overdue for refresh; `null` for non-remote items |
| `is_sys` | `boolean` | Always `true` for the system hosts item (id `"0"`) |

When a filter is active, the response also includes ancestor items of matched items (for context).
Those ancestors get an extra field:

| Field | Type | Description |
|-------|------|-------------|
| `_matched` | `boolean` | `true` = this item matched the filter; `false` = included as ancestor context |

#### Tree mode (`?format=tree`)

Items are returned with the original nested structure (`children` arrays preserved).
All the same enrichment fields apply (`parent_id`, `effective_on`, `is_stale`, `is_sys`).
`resolve_groups` is not supported in tree mode. `include_content` works normally.

#### All item fields (`IHostsListObject`)

| Field | Type | Items | Description |
|-------|------|-------|-------------|
| `id` | `string` | all | Unique identifier |
| `title` | `string?` | all | Display name |
| `on` | `boolean?` | all | Raw enabled/disabled toggle state |
| `type` | `string?` | all | `local`, `remote`, `group`, or `folder` |
| `url` | `string?` | remote | URL to fetch hosts content from |
| `refresh_interval` | `number?` | remote | Auto-refresh interval in seconds |
| `last_refresh` | `string?` | remote | ISO timestamp of last successful fetch |
| `last_refresh_ms` | `number?` | remote | Unix timestamp (ms) of last fetch |
| `include` | `string[]?` | group | IDs of items included in this group |
| `resolved_include` | `IHostsListObject[]?` | group | Populated when `?resolve_groups=true` |
| `folder_mode` | `0\|1\|2?` | folder | `0` = default, `1` = single-select, `2` = multi-select |
| `children` | `IHostsListObject[]?` | folder | Child items (present in tree mode, omitted in flat mode) |
| `is_sys` | `boolean?` | system | `true` for the built-in system hosts item |
| `content` | `string?` | all | Raw hosts content (present only when `?include_content=true`) |

**Examples:**

```bash
# All items, flat
curl http://127.0.0.1:50761/api/list

# Nested tree structure
curl "http://127.0.0.1:50761/api/list?format=tree"

# Only enabled local items
curl "http://127.0.0.1:50761/api/list?on=true&type=local"

# Search by title
curl "http://127.0.0.1:50761/api/list?q=catena"

# Include raw hosts content in response
curl "http://127.0.0.1:50761/api/list?include_content=true"

# Specific items by ID
curl "http://127.0.0.1:50761/api/list?ids=abc123,def456"

# Groups with resolved members
curl "http://127.0.0.1:50761/api/list?type=group&resolve_groups=true"
```

---

## Items CRUD

### `GET /api/items/:id`

Returns a single item by ID.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Item ID |

**Response:** `200 OK`

```json
{ "success": true, "data": { /* IHostsListObject */ } }
```

**Errors:**

| Status | Body | Reason |
|--------|------|--------|
| `400` | `{ "success": false, "message": "missing id" }` | No ID provided |
| `404` | `{ "success": false, "message": "Item not found: <id>" }` | ID doesn't exist |

---

### `POST /api/items`

Creates a new item. Triggers a UI reload in the running app.

**Request body:** `Content-Type: application/json`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | `string` | **yes** | — | Display name |
| `type` | `string` | no | `"local"` | `local`, `remote`, `group`, or `folder` |
| `on` | `boolean` | no | `false` | Whether the item is enabled |
| `url` | `string` | no | — | Remote items: fetch URL |
| `refresh_interval` | `number` | no | — | Remote items: auto-refresh interval (seconds) |
| `folder_mode` | `0\|1\|2` | no | — | Folder items: selection mode |
| `include` | `string[]` | no | — | Group items: included item IDs |
| `children` | `object[]` | no | — | Folder items: child items |
| `parent_id` | `string` | no | — | Insert inside the folder with this ID. Returns `404` if the folder doesn't exist, `400` if the target item is not a folder |
| `before_id` | `string` | no | — | Insert before the sibling with this ID (in root list, or inside folder when `parent_id` is given). Returns `404` if sibling not found |
| `after_id` | `string` | no | — | Insert after the sibling with this ID. Returns `404` if sibling not found |

**Positioning logic:**

| `parent_id` | `before_id` / `after_id` | Result |
|-------------|--------------------------|--------|
| *(omitted)* | *(omitted)* | Inserted at the **top** of the root list |
| *(omitted)* | set | Inserted before/after the specified sibling in the root list |
| set | *(omitted)* | Inserted at the **top** of the folder's `children` |
| set | set | Inserted before/after the specified sibling inside the folder |

**Response:** `201`-equivalent `200 OK`

```json
{ "success": true, "data": { /* newly created IHostsListObject with generated id */ } }
```

**Errors:**

| Status | Body | Reason |
|--------|------|--------|
| `400` | `{ "success": false, "message": "invalid JSON body" }` | Body is not valid JSON |
| `400` | `{ "success": false, "message": "title is required" }` | `title` missing or not a string |
| `400` | `{ "success": false, "message": "Parent item is not a folder" }` | `parent_id` points to a non-folder item |
| `404` | `{ "success": false, "message": "Parent not found: <id>" }` | `parent_id` doesn't exist |
| `404` | `{ "success": false, "message": "Sibling not found: <id>" }` | `before_id`/`after_id` not found in root list |
| `404` | `{ "success": false, "message": "Sibling not found in folder: <id>" }` | `before_id`/`after_id` not found in the specified folder |

**Examples:**

```bash
# Create a local hosts item (inserted at top of root list)
curl -X POST http://127.0.0.1:50761/api/items \
  -H "Content-Type: application/json" \
  -d '{"title": "catena.ro → box2", "type": "local", "on": false}'

# Create a remote hosts item with auto-refresh
curl -X POST http://127.0.0.1:50761/api/items \
  -H "Content-Type: application/json" \
  -d '{"title": "Office blocklist", "type": "remote", "url": "https://example.com/hosts.txt", "refresh_interval": 3600}'

# Create inside a folder
curl -X POST http://127.0.0.1:50761/api/items \
  -H "Content-Type: application/json" \
  -d '{"title": "New profile", "type": "local", "parent_id": "folder-abc"}'

# Create after a specific sibling
curl -X POST http://127.0.0.1:50761/api/items \
  -H "Content-Type: application/json" \
  -d '{"title": "After catena", "type": "local", "after_id": "sibling-xyz"}'
```

---

### `PUT /api/items/:id`

Partially updates an existing item. Only the fields you send are changed; all other fields remain
as they are. The `id` field in the body is ignored (the URL path `id` is authoritative).
Triggers a UI reload in the running app.

Field updates and moves can be combined in a single request — e.g. rename and reposition at the same time.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Item ID to update |

**Request body:** `Content-Type: application/json`

Any subset of `IHostsListObject` fields, plus optional positioning parameters:

| Field | Type | Description |
|-------|------|-------------|
| *(any field)* | — | Standard `IHostsListObject` fields (`title`, `on`, `url`, etc.) are applied as partial updates |
| `parent_id` | `string` | Move the item into the folder with this ID. Returns `404` if not found, `400` if not a folder |
| `parent_id` | `null` | Move the item to the root list (out of any folder) |
| `before_id` | `string` | Position before the sibling with this ID (combinable with `parent_id`) |
| `after_id` | `string` | Position after the sibling with this ID (combinable with `parent_id`) |

**Move behavior:**

A move is triggered when **any** of `parent_id`, `before_id`, or `after_id` is present in the body.
The item is removed from its current position and re-inserted at the target location.

| `parent_id` | `before_id` / `after_id` | Result |
|-------------|--------------------------|--------|
| `null` or *(omitted)* | *(omitted)* | Appended at the **end** of the root list |
| `null` or *(omitted)* | set | Positioned before/after the specified sibling in root |
| `"folder-id"` | *(omitted)* | Appended at the **end** of the folder's `children` |
| `"folder-id"` | set | Positioned before/after the specified sibling inside the folder |

Common uses:

```json
{ "on": true }
{ "title": "New name" }
{ "on": true, "title": "New name" }
{ "url": "https://new-url.example.com/hosts.txt", "refresh_interval": 7200 }
{ "parent_id": "folder-uuid" }
{ "parent_id": null, "before_id": "sibling-uuid" }
{ "title": "Renamed", "parent_id": "folder-uuid", "after_id": "sibling-uuid" }
```

**Response:** `200 OK`

```json
{ "success": true, "data": { /* updated IHostsListObject */ } }
```

**Errors:**

| Status | Body | Reason |
|--------|------|--------|
| `400` | `{ "success": false, "message": "missing id" }` | No ID in path |
| `400` | `{ "success": false, "message": "invalid JSON body" }` | Body is not valid JSON |
| `400` | `{ "success": false, "message": "Parent item is not a folder" }` | `parent_id` points to a non-folder item |
| `404` | `{ "success": false, "message": "Item not found: <id>" }` | ID doesn't exist |
| `404` | `{ "success": false, "message": "Parent not found: <id>" }` | `parent_id` doesn't exist |
| `404` | `{ "success": false, "message": "Sibling not found: <id>" }` | `before_id`/`after_id` not found in root list |
| `404` | `{ "success": false, "message": "Sibling not found in folder: <id>" }` | `before_id`/`after_id` not found in the specified folder |

**Examples:**

```bash
# Enable an item (preferred over /api/toggle)
curl -X PUT http://127.0.0.1:50761/api/items/abc123 \
  -H "Content-Type: application/json" \
  -d '{"on": true}'

# Rename an item
curl -X PUT http://127.0.0.1:50761/api/items/abc123 \
  -H "Content-Type: application/json" \
  -d '{"title": "My renamed profile"}'

# Move into a folder
curl -X PUT http://127.0.0.1:50761/api/items/abc123 \
  -H "Content-Type: application/json" \
  -d '{"parent_id": "folder-uuid"}'

# Move to root, positioned after a sibling
curl -X PUT http://127.0.0.1:50761/api/items/abc123 \
  -H "Content-Type: application/json" \
  -d '{"parent_id": null, "after_id": "sibling-uuid"}'

# Rename + move in one request
curl -X PUT http://127.0.0.1:50761/api/items/abc123 \
  -H "Content-Type: application/json" \
  -d '{"title": "Renamed", "parent_id": "folder-uuid", "after_id": "sibling-uuid"}'
```

---

### `DELETE /api/items/:id`

Deletes an item by moving it to the trashcan (recoverable from the UI).
Triggers a UI reload in the running app.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Item ID to delete |

**Response:** `200 OK`

```json
{ "success": true }
```

**Errors:**

| Status | Body | Reason |
|--------|------|--------|
| `400` | `{ "success": false, "message": "missing id" }` | No ID in path |
| `404` | `{ "success": false, "message": "Item not found: <id>" }` | ID doesn't exist |

**Example:**

```bash
curl -X DELETE http://127.0.0.1:50761/api/items/abc123
```

---

## Content Endpoints

### `GET /api/content/:id`

Returns the raw hosts file content for a specific item (the actual `127.0.0.1 domain.com` lines).

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Item ID |

**Response:** `200 OK`, JSON

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "content": "127.0.0.1 catena.ro\n127.0.0.1 www.catena.ro\n"
  }
}
```

`content` is an empty string `""` if the item has no content saved yet.

**Errors:**

| Status | Body | Reason |
|--------|------|--------|
| `400` | `{ "success": false, "message": "id is required" }` | No ID in path |
| `404` | `{ "success": false, "message": "Item not found: <id>" }` | ID doesn't exist |

---

### `PUT /api/content/:id`

Sets the raw hosts file content for a specific item.

If the item is currently **enabled** (`on: true`), the system hosts file is updated immediately
after saving — the change takes effect right away without needing a manual apply.

Broadcasts a `hosts_content_changed` event to the running UI.

**Path parameters:**

| Parameter | Description |
|-----------|-------------|
| `id` | Item ID |

**Request body:** `Content-Type: application/json`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | **yes** | Full hosts content (newline-separated `IP host` entries) |

**Response:** `200 OK`

```json
{ "success": true }
```

**Errors:**

| Status | Body | Reason |
|--------|------|--------|
| `400` | `{ "success": false, "message": "id is required" }` | No ID in path |
| `400` | `{ "success": false, "message": "invalid JSON body" }` | Body is not valid JSON |
| `400` | `{ "success": false, "message": "content must be a string" }` | `content` field missing or wrong type |
| `404` | `{ "success": false, "message": "Item not found: <id>" }` | ID doesn't exist |

**Examples:**

```bash
# Set hosts content for an item
curl -X PUT http://127.0.0.1:50761/api/content/abc123 \
  -H "Content-Type: application/json" \
  -d '{"content": "127.0.0.1 catena.ro\n127.0.0.1 www.catena.ro\n"}'

# Clear content
curl -X PUT http://127.0.0.1:50761/api/content/abc123 \
  -H "Content-Type: application/json" \
  -d '{"content": ""}'
```

---

## Toggle Endpoint (Legacy)

### `GET /api/toggle?id=<id>`

Toggles a hosts item on or off by ID. This is a **legacy endpoint** — prefer
`PUT /api/items/:id` with `{ "on": true/false }` for new integrations.

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | yes | Item ID |

**Response:** `200 OK`, plain text

| Body | Meaning |
|------|---------|
| `ok` | Success — state toggled |
| `bad id.` | Missing `id` query parameter |
| `not found.` | No item with that ID exists |

> **Note:** Does not return the new state. Use `GET /api/items/:id` to confirm the new value.

**Example:**

```bash
curl "http://127.0.0.1:50761/api/toggle?id=abc123"
# ok
```

---

## Usage Examples

### Full workflow: find and enable a profile

```bash
# 1. Find item IDs
curl -s "http://127.0.0.1:50761/api/list?q=catena" | python -m json.tool

# 2. Enable it
curl -X PUT http://127.0.0.1:50761/api/items/YOUR_ID \
  -H "Content-Type: application/json" \
  -d '{"on": true}'

# 3. Verify
curl -s "http://127.0.0.1:50761/api/items/YOUR_ID"
```

### PowerShell

```powershell
$base = "http://127.0.0.1:50761"

# List all enabled items
$list = Invoke-RestMethod "$base/api/list?on=true"
$list.data | Format-Table id, title, on, type

# Enable an item
Invoke-RestMethod -Method Put "$base/api/items/YOUR_ID" `
  -ContentType "application/json" `
  -Body '{"on": true}'

# Create a new item
Invoke-RestMethod -Method Post "$base/api/items" `
  -ContentType "application/json" `
  -Body '{"title": "My hosts profile", "type": "local"}'
```

### Python

```python
import requests

base = "http://127.0.0.1:50761"

# List items, find by title
items = requests.get(f"{base}/api/list").json()["data"]
target = next(i for i in items if "catena" in (i.get("title") or "").lower())
print(target["id"], target.get("title"), target.get("effective_on"))

# Enable it
requests.put(f"{base}/api/items/{target['id']}", json={"on": True})

# Set its hosts content
requests.put(f"{base}/api/content/{target['id']}", json={
    "content": "10.0.52.232 catena.ro\n10.0.52.232 www.catena.ro\n"
})

# Create a new item
resp = requests.post(f"{base}/api/items", json={
    "title": "New profile",
    "type": "local",
    "on": False
})
new_id = resp.json()["data"]["id"]

# Delete it
requests.delete(f"{base}/api/items/{new_id}")
```

---

## Source

The HTTP server is implemented with [Hono](https://hono.dev/) + `@hono/node-server` and runs in
the Electron main process.

Relevant source files:

| File | Description |
|------|-------------|
| [`src/main/http/index.ts`](../src/main/http/index.ts) | Server setup, bind config, root routes |
| [`src/main/http/api/index.ts`](../src/main/http/api/index.ts) | API router — route registration |
| [`src/main/http/api/list.ts`](../src/main/http/api/list.ts) | `GET /api/list` handler + query param parsing |
| [`src/main/http/api/listHelpers.ts`](../src/main/http/api/listHelpers.ts) | List enrichments: `parent_id`, `effective_on`, `is_stale`, filtering, tree |
| [`src/main/http/api/toggle.ts`](../src/main/http/api/toggle.ts) | `GET /api/toggle` legacy handler |
| [`src/main/http/api/items/getItem.ts`](../src/main/http/api/items/getItem.ts) | `GET /api/items/:id` |
| [`src/main/http/api/items/createItem.ts`](../src/main/http/api/items/createItem.ts) | `POST /api/items` |
| [`src/main/http/api/items/updateItem.ts`](../src/main/http/api/items/updateItem.ts) | `PUT /api/items/:id` |
| [`src/main/http/api/items/deleteItem.ts`](../src/main/http/api/items/deleteItem.ts) | `DELETE /api/items/:id` |
| [`src/main/http/api/content/getContent.ts`](../src/main/http/api/content/getContent.ts) | `GET /api/content/:id` |
| [`src/main/http/api/content/setContent.ts`](../src/main/http/api/content/setContent.ts) | `PUT /api/content/:id` |
| [`src/common/constants.ts`](../src/common/constants.ts) | Port constant (`http_api_port = 50761`) |
| [`src/common/data.d.ts`](../src/common/data.d.ts) | `IHostsListObject` type definition |
