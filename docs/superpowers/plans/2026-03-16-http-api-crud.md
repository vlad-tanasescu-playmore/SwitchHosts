# HTTP API CRUD Extension Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 new CRUD endpoints to the SwitchHosts HTTP API so Claude Code can create, read, update, and delete hosts items and their content.

**Architecture:** Extend the existing Hono router in `src/main/http/api/` with two new sub-routers (`items/` and `content/`), each split into focused single-responsibility files of ~30-50 lines. All new handlers call existing actions from `@main/actions` and broadcast IPC events exactly as the existing `toggle.ts` does.

**Tech Stack:** TypeScript, Hono, Vitest, `@main/actions`, `@common/hostsFn`, `uuid@13`

**Spec:** `docs/superpowers/specs/2026-03-16-http-api-crud-design.md`

---

## File Map

### New files to create

| File | Responsibility |
|------|---------------|
| `src/main/http/api/items/index.ts` | Sub-router: registers GET/POST/PUT/DELETE for `/api/items` |
| `src/main/http/api/items/getItem.ts` | `GET /api/items/:id` — fetch single item |
| `src/main/http/api/items/createItem.ts` | `POST /api/items` — create item, prepend to list |
| `src/main/http/api/items/updateItem.ts` | `PUT /api/items/:id` — merge-patch update |
| `src/main/http/api/items/deleteItem.ts` | `DELETE /api/items/:id` — move to trashcan |
| `src/main/http/api/content/index.ts` | Sub-router: registers GET/PUT for `/api/content` |
| `src/main/http/api/content/getContent.ts` | `GET /api/content/:id` — fetch raw hosts text |
| `src/main/http/api/content/setContent.ts` | `PUT /api/content/:id` — set raw hosts text, trigger system write if item is on |
| `test/main/http/items.test.ts` | Vitest tests for all items endpoints |
| `test/main/http/content.test.ts` | Vitest tests for all content endpoints |

### Files to modify

| File | Change |
|------|--------|
| `src/main/http/api/index.ts` | Import and mount `items_router` and `content_router` |

---

## Chunk 1: Items sub-router (GET, POST, PUT, DELETE)

### Task 1: Wire up items sub-router + write failing tests

**Files:**
- Create: `src/main/http/api/items/index.ts`
- Create: `src/main/http/api/items/getItem.ts`
- Create: `src/main/http/api/items/createItem.ts`
- Create: `src/main/http/api/items/updateItem.ts`
- Create: `src/main/http/api/items/deleteItem.ts`
- Modify: `src/main/http/api/index.ts`
- Create: `test/main/http/items.test.ts`

**Background you need:**

The existing test in `test/main/http.test.ts` shows the testing pattern:
- Import `app` from `src/main/http` (not the router directly — Hono's `app.request()` method is used to fire test requests)
- Call `clearData()` from `test/_base.ts` in `beforeEach`
- Use `vi.spyOn(ipcMain, 'emit')` to assert broadcasts
- Electron is mocked automatically by the test infrastructure (`vitest.config.mts` uses `environment: 'node'`)

The `broadcast` function in `src/main/core/agent.ts` calls `ipcMain.emit('x_broadcast', null, { event, args })`. When you spy on `ipcMain.emit`, assert:
```ts
expect(emitSpy).toHaveBeenCalledWith('x_broadcast', null, {
  event: events.reload_list,
  args: [],
})
```

- [ ] **Step 1.1: Create stub handler files (empty exports)**

Create these 4 files with minimal stub content so TypeScript doesn't complain during router wiring:

`src/main/http/api/items/getItem.ts`:
```ts
import type { Context } from 'hono'
const getItem = async (c: Context) => c.json({ success: false, message: 'not implemented' }, 501)
export default getItem
```

Repeat the same stub pattern for `createItem.ts`, `updateItem.ts`, `deleteItem.ts`.

- [ ] **Step 1.2: Create items sub-router**

Create `src/main/http/api/items/index.ts`:
```ts
import { Hono } from 'hono'
import getItem from './getItem'
import createItem from './createItem'
import updateItem from './updateItem'
import deleteItem from './deleteItem'

const router = new Hono()

router.get('/:id', getItem)
router.post('/', createItem)
router.put('/:id', updateItem)
router.delete('/:id', deleteItem)

export default router
```

- [ ] **Step 1.3: Mount items sub-router in api/index.ts**

Read `src/main/http/api/index.ts` first, then add:
```ts
import items_router from './items/index'
// ... existing imports ...

router.route('/items', items_router)
```

- [ ] **Step 1.4: Write failing tests for all items endpoints**

Create `test/main/http/items.test.ts`:
```ts
import { ipcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import events from '../../../src/common/events'
import { setList } from '../../../src/main/actions'
import { app } from '../../../src/main/http'
import { clearData } from '../../_base'

describe('GET /api/items/:id', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns item when found', async () => {
    await setList([{ id: 'item-1', title: 'My Item', type: 'local', on: false }])
    const res = await app.request('/api/items/item-1')
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('item-1')
    expect(body.data.title).toBe('My Item')
  })

  it('returns 404 when not found', async () => {
    const res = await app.request('/api/items/missing')
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.message).toContain('missing')
  })
})

describe('POST /api/items', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('creates item and prepends to list', async () => {
    await setList([{ id: 'existing-1', title: 'Existing', type: 'local', on: false }])
    const emitSpy = vi.spyOn(ipcMain, 'emit')

    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Item', type: 'local' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('New Item')
    expect(body.data.id).toBeTruthy()
    expect(emitSpy).toHaveBeenCalledWith('x_broadcast', null, {
      event: events.reload_list,
      args: [],
    })

    // Verify it was prepended
    const listRes = await app.request('/api/list')
    const listBody = await listRes.json()
    expect(listBody.data[0].id).toBe(body.data.id)
  })

  it('returns 400 when title is missing', async () => {
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'local' }),
    })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toContain('title')
  })
})

describe('PUT /api/items/:id', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('updates item fields', async () => {
    await setList([{ id: 'item-1', title: 'Old Title', type: 'local', on: false }])
    const emitSpy = vi.spyOn(ipcMain, 'emit')

    const res = await app.request('/api/items/item-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title', on: true }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('New Title')
    expect(body.data.on).toBe(true)
    expect(emitSpy).toHaveBeenCalledWith('x_broadcast', null, {
      event: events.reload_list,
      args: [],
    })
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.request('/api/items/no-such', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'X' }),
    })
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })
})

describe('DELETE /api/items/:id', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('moves item to trashcan', async () => {
    await setList([{ id: 'item-1', title: 'To Delete', type: 'local', on: false }])
    const emitSpy = vi.spyOn(ipcMain, 'emit')

    const res = await app.request('/api/items/item-1', { method: 'DELETE' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(emitSpy).toHaveBeenCalledWith('x_broadcast', null, {
      event: events.reload_list,
      args: [],
    })

    // Item should no longer be in list
    const listRes = await app.request('/api/list')
    const listBody = await listRes.json()
    expect(listBody.data.find((i: { id: string }) => i.id === 'item-1')).toBeUndefined()
  })

  it('returns 404 for unknown id', async () => {
    const res = await app.request('/api/items/no-such', { method: 'DELETE' })
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })
})
```

- [ ] **Step 1.5: Run tests — verify they all FAIL (501 stubs)**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 3 "items.test"
```

Expected: tests fail because handlers return 501.

---

### Task 2: Implement `GET /api/items/:id`

- [ ] **Step 2.1: Replace stub with real implementation**

`src/main/http/api/items/getItem.ts`:
```ts
import { getItemFromList } from '@main/actions'
import type { Context } from 'hono'

const getItem = async (c: Context) => {
  const id = c.req.param('id')
  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }
  return c.json({ success: true, data: item })
}

export default getItem
```

- [ ] **Step 2.2: Run GET tests — verify they pass**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 5 "GET /api/items"
```

Expected: `returns item when found` ✓, `returns 404 when not found` ✓

---

### Task 3: Implement `POST /api/items`

- [ ] **Step 3.1: Replace stub with real implementation**

`src/main/http/api/items/createItem.ts`:
```ts
import { getList, setList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { IHostsListObject } from '@common/data'
import events from '@common/events'
import type { Context } from 'hono'
import { v4 as uuid4 } from 'uuid'

const createItem = async (c: Context) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, message: 'invalid JSON body' }, 400)
  }

  const { title, type, on, url, refresh_interval, folder_mode, include, children } = body

  if (!title || typeof title !== 'string') {
    return c.json({ success: false, message: 'title is required' }, 400)
  }

  const newItem: IHostsListObject = {
    id: uuid4(),
    title,
    type: (typeof type === 'string' ? type : 'local') as IHostsListObject['type'],
    on: typeof on === 'boolean' ? on : false,
    ...(url != null ? { url: url as string } : {}),
    ...(refresh_interval != null ? { refresh_interval: refresh_interval as number } : {}),
    ...(folder_mode != null ? { folder_mode: folder_mode as IHostsListObject['folder_mode'] } : {}),
    ...(include != null ? { include: include as string[] } : {}),
    ...(children != null ? { children: children as IHostsListObject[] } : {}),
  }

  const list = await getList()
  list.unshift(newItem)
  await setList(list)
  broadcast(events.reload_list)

  return c.json({ success: true, data: newItem })
}

export default createItem
```

- [ ] **Step 3.2: Run POST tests — verify they pass**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 5 "POST /api/items"
```

Expected: both POST tests pass.

---

### Task 4: Implement `PUT /api/items/:id`

- [ ] **Step 4.1: Replace stub with real implementation**

`src/main/http/api/items/updateItem.ts`:
```ts
import { getList, setList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { findItemById, updateOneItem } from '@common/hostsFn'
import events from '@common/events'
import type { Context } from 'hono'

const updateItem = async (c: Context) => {
  const id = c.req.param('id')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, message: 'invalid JSON body' }, 400)
  }

  const list = await getList()
  const existing = findItemById(list, id)
  if (!existing) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  const newList = updateOneItem(list, { id, ...body })
  await setList(newList)
  broadcast(events.reload_list)

  const updated = findItemById(newList, id)!
  return c.json({ success: true, data: updated })
}

export default updateItem
```

- [ ] **Step 4.2: Run PUT tests — verify they pass**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 5 "PUT /api/items"
```

Expected: both PUT tests pass.

---

### Task 5: Implement `DELETE /api/items/:id`

- [ ] **Step 5.1: Replace stub with real implementation**

`src/main/http/api/items/deleteItem.ts`:
```ts
import { getItemFromList, moveToTrashcan } from '@main/actions'
import { broadcast } from '@main/core/agent'
import events from '@common/events'
import type { Context } from 'hono'

const deleteItem = async (c: Context) => {
  const id = c.req.param('id')

  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  await moveToTrashcan(id)
  broadcast(events.reload_list)

  return c.json({ success: true })
}

export default deleteItem
```

- [ ] **Step 5.2: Run DELETE tests — verify they pass**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 5 "DELETE /api/items"
```

Expected: both DELETE tests pass.

- [ ] **Step 5.3: Run full items test suite — all green**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|items)"
```

Expected: all items tests pass, no failures.

- [ ] **Step 5.4: Commit Chunk 1**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/items/ src/main/http/api/index.ts test/main/http/items.test.ts && git commit -m "feat: add CRUD endpoints for hosts items (/api/items)"
```

---

## Chunk 2: Content sub-router (GET, PUT)

### Task 6: Wire up content sub-router + write failing tests

**Files:**
- Create: `src/main/http/api/content/index.ts`
- Create: `src/main/http/api/content/getContent.ts`
- Create: `src/main/http/api/content/setContent.ts`
- Modify: `src/main/http/api/index.ts`
- Create: `test/main/http/content.test.ts`

**Background you need:**

`setSystemHosts` (from `@main/actions`) writes the combined hosts content to the system hosts file. It requires elevated permissions on macOS/Linux. In tests, `setSystemHosts` will fail silently or return `{ success: false, code: 'no_access' }` because there's no real hosts file in the test environment. **Mock it** with `vi.mock` to avoid file system side effects.

Same for `broadcast` — spy on `ipcMain.emit` as in the existing tests.

- [ ] **Step 6.1: Create stub handler files**

`src/main/http/api/content/getContent.ts`:
```ts
import type { Context } from 'hono'
const getContent = async (c: Context) => c.json({ success: false, message: 'not implemented' }, 501)
export default getContent
```

`src/main/http/api/content/setContent.ts`:
```ts
import type { Context } from 'hono'
const setContent = async (c: Context) => c.json({ success: false, message: 'not implemented' }, 501)
export default setContent
```

- [ ] **Step 6.2: Create content sub-router**

`src/main/http/api/content/index.ts`:
```ts
import { Hono } from 'hono'
import getContent from './getContent'
import setContent from './setContent'

const router = new Hono()

router.get('/:id', getContent)
router.put('/:id', setContent)

export default router
```

- [ ] **Step 6.3: Mount content sub-router in api/index.ts**

Add to `src/main/http/api/index.ts`:
```ts
import content_router from './content/index'
// ...
router.route('/content', content_router)
```

- [ ] **Step 6.4: Write failing tests for content endpoints**

Create `test/main/http/content.test.ts`:
```ts
import { ipcMain } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import events from '../../../src/common/events'
import { setHostsContent, setList } from '../../../src/main/actions'
import { app } from '../../../src/main/http'
import { clearData } from '../../_base'

// Mock setSystemHosts to avoid real file system writes in tests
vi.mock('../../../src/main/actions/hosts/setSystemHosts', () => ({
  default: vi.fn().mockResolvedValue({ success: true }),
}))

describe('GET /api/content/:id', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns content for existing item', async () => {
    await setList([{ id: 'item-1', title: 'Item 1', type: 'local', on: false }])
    await setHostsContent('item-1', '10.0.0.1 example.com')

    const res = await app.request('/api/content/item-1')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('item-1')
    expect(body.data.content).toContain('10.0.0.1 example.com')
  })

  it('returns empty string when item has no saved content', async () => {
    await setList([{ id: 'item-1', title: 'Item 1', type: 'local', on: false }])

    const res = await app.request('/api/content/item-1')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.content).toBe('')
  })

  it('returns 404 for unknown item', async () => {
    const res = await app.request('/api/content/no-such')
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })
})

describe('PUT /api/content/:id', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('saves content and broadcasts hosts_content_changed', async () => {
    await setList([{ id: 'item-1', title: 'Item 1', type: 'local', on: false }])
    const emitSpy = vi.spyOn(ipcMain, 'emit')

    const res = await app.request('/api/content/item-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '10.0.0.1 example.com' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(emitSpy).toHaveBeenCalledWith('x_broadcast', null, {
      event: events.hosts_content_changed,
      args: ['item-1'],
    })
  })

  it('triggers system hosts write when item is on', async () => {
    await setList([{ id: 'item-1', title: 'Item 1', type: 'local', on: true }])
    const { default: setSystemHostsMock } = await import('../../../src/main/actions/hosts/setSystemHosts')

    await app.request('/api/content/item-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '10.0.0.1 example.com' }),
    })

    expect(setSystemHostsMock).toHaveBeenCalled()
  })

  it('does NOT trigger system hosts write when item is off', async () => {
    await setList([{ id: 'item-1', title: 'Item 1', type: 'local', on: false }])
    const { default: setSystemHostsMock } = await import('../../../src/main/actions/hosts/setSystemHosts')
    vi.mocked(setSystemHostsMock).mockClear()

    await app.request('/api/content/item-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '10.0.0.1 example.com' }),
    })

    expect(setSystemHostsMock).not.toHaveBeenCalled()
  })

  it('returns 400 when content is not a string', async () => {
    await setList([{ id: 'item-1', title: 'Item 1', type: 'local', on: false }])

    const res = await app.request('/api/content/item-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 42 }),
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toContain('content')
  })

  it('returns 404 for unknown item', async () => {
    const res = await app.request('/api/content/no-such', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'anything' }),
    })
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })
})
```

- [ ] **Step 6.5: Run tests — verify they FAIL (501 stubs)**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 3 "content.test"
```

Expected: content tests fail with 501.

---

### Task 7: Implement `GET /api/content/:id`

- [ ] **Step 7.1: Replace stub with real implementation**

`src/main/http/api/content/getContent.ts`:
```ts
import { getHostsContent, getItemFromList } from '@main/actions'
import type { Context } from 'hono'

const getContent = async (c: Context) => {
  const id = c.req.param('id')

  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  const raw = await getHostsContent(id)
  const content = raw ?? ''

  return c.json({ success: true, data: { id, content } })
}

export default getContent
```

- [ ] **Step 7.2: Run GET content tests — verify they pass**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 5 "GET /api/content"
```

Expected: all 3 GET content tests pass.

---

### Task 8: Implement `PUT /api/content/:id`

- [ ] **Step 8.1: Replace stub with real implementation**

`src/main/http/api/content/setContent.ts`:
```ts
import { getContentOfList, getItemFromList, getList, setHostsContent, setSystemHosts } from '@main/actions'
import { broadcast } from '@main/core/agent'
import events from '@common/events'
import type { Context } from 'hono'

const setContent = async (c: Context) => {
  const id = c.req.param('id')

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, message: 'invalid JSON body' }, 400)
  }

  if (typeof body.content !== 'string') {
    return c.json({ success: false, message: 'content must be a string' }, 400)
  }

  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  await setHostsContent(id, body.content)
  broadcast(events.hosts_content_changed, id)

  if (item.on) {
    const list = await getList()
    const combined = await getContentOfList(list)
    await setSystemHosts(combined)
  }

  return c.json({ success: true })
}

export default setContent
```

- [ ] **Step 8.2: Run PUT content tests — verify they pass**

```bash
cd a:/xampp/htdocs/switchhosts && npm test -- --reporter=verbose 2>&1 | grep -A 5 "PUT /api/content"
```

Expected: all 5 PUT content tests pass.

---

### Task 9: Full test suite + commit

- [ ] **Step 9.1: Run full test suite — all green**

```bash
cd a:/xampp/htdocs/switchhosts && npm run test 2>&1 | tail -20
```

Expected: all tests pass, no failures. If any existing test breaks, investigate before continuing.

- [ ] **Step 9.2: Run typecheck**

```bash
cd a:/xampp/htdocs/switchhosts && npm run typecheck 2>&1
```

Expected: no TypeScript errors.

- [ ] **Step 9.3: Commit Chunk 2**

```bash
cd a:/xampp/htdocs/switchhosts && git add src/main/http/api/content/ src/main/http/api/index.ts test/main/http/content.test.ts && git commit -m "feat: add CRUD endpoints for hosts content (/api/content)"
```

---

## Done

After both commits:
- `GET /api/items/:id` — fetch item by ID
- `POST /api/items` — create item (prepended to list)
- `PUT /api/items/:id` — update item (merge-patch)
- `DELETE /api/items/:id` — move item to trashcan
- `GET /api/content/:id` — get raw hosts text
- `PUT /api/content/:id` — set raw hosts text (writes system file if item is on)

All existing endpoints (`/api/list`, `/api/toggle`) unchanged.
