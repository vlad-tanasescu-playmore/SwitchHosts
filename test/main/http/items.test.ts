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

  it('creates item inside a folder when parent_id is given', async () => {
    await setList([{ id: 'folder-1', title: 'My Folder', type: 'folder', children: [] }])

    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Child Item', type: 'local', parent_id: 'folder-1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.title).toBe('Child Item')

    // Verify it's inside the folder in tree mode
    const treeRes = await app.request('/api/list?format=tree')
    const treeBody = await treeRes.json()
    const folder = treeBody.data.find((i: { id: string }) => i.id === 'folder-1')
    expect(folder.children).toHaveLength(1)
    expect(folder.children[0].id).toBe(body.data.id)
  })

  it('returns 404 when parent_id does not exist', async () => {
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Child', type: 'local', parent_id: 'no-such-folder' }),
    })
    const body = await res.json()
    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('returns 400 when parent_id points to a non-folder item', async () => {
    await setList([{ id: 'item-1', title: 'A local', type: 'local' }])
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Child', type: 'local', parent_id: 'item-1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toContain('not a folder')
  })

  it('inserts before sibling with before_id at root', async () => {
    await setList([
      { id: 'a', title: 'A', type: 'local' },
      { id: 'b', title: 'B', type: 'local' },
    ])
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New', type: 'local', before_id: 'b' }),
    })
    expect(res.status).toBe(200)
    const listRes = await app.request('/api/list')
    const listBody = await listRes.json()
    const ids = listBody.data.map((i: { id: string }) => i.id)
    expect(ids.indexOf('New') < ids.indexOf('b') || ids.find((id: string) => id === res.headers.get('x-id'))).toBeTruthy()
    // Check position: new item is before 'b'
    const newId = (await res.json()).data?.id ?? (await app.request('/api/list?q=New').then(r => r.json())).data[0]?.id
    const newIdx = ids.indexOf(newId)
    const bIdx = ids.indexOf('b')
    expect(newIdx).toBe(bIdx - 1)
  })

  it('inserts after sibling with after_id at root', async () => {
    await setList([
      { id: 'a', title: 'A', type: 'local' },
      { id: 'b', title: 'B', type: 'local' },
    ])
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New', type: 'local', after_id: 'a' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    const listRes = await app.request('/api/list')
    const listBody = await listRes.json()
    const ids = listBody.data.map((i: { id: string }) => i.id)
    const newIdx = ids.indexOf(body.data.id)
    const aIdx = ids.indexOf('a')
    expect(newIdx).toBe(aIdx + 1)
  })

  it('inserts before sibling inside a folder with before_id + parent_id', async () => {
    await setList([{
      id: 'f', title: 'Folder', type: 'folder',
      children: [
        { id: 'c1', title: 'C1', type: 'local' },
        { id: 'c2', title: 'C2', type: 'local' },
      ],
    }])
    const res = await app.request('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Mid', type: 'local', parent_id: 'f', before_id: 'c2' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    const treeRes = await app.request('/api/list?format=tree')
    const treeBody = await treeRes.json()
    const folder = treeBody.data.find((i: { id: string }) => i.id === 'f')
    const childIds = folder.children.map((c: { id: string }) => c.id)
    expect(childIds).toEqual(['c1', body.data.id, 'c2'])
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

  it('moves item into a folder with parent_id', async () => {
    await setList([
      { id: 'item-1', title: 'Item', type: 'local' },
      { id: 'folder-1', title: 'Folder', type: 'folder', children: [] },
    ])
    const res = await app.request('/api/items/item-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: 'folder-1' }),
    })
    expect(res.status).toBe(200)
    const treeRes = await app.request('/api/list?format=tree')
    const treeBody = await treeRes.json()
    // item-1 no longer at root
    expect(treeBody.data.find((i: { id: string }) => i.id === 'item-1')).toBeUndefined()
    // item-1 is inside folder-1
    const folder = treeBody.data.find((i: { id: string }) => i.id === 'folder-1')
    expect(folder.children.find((i: { id: string }) => i.id === 'item-1')).toBeDefined()
  })

  it('moves item to root with parent_id: null', async () => {
    await setList([{
      id: 'folder-1', title: 'Folder', type: 'folder',
      children: [{ id: 'item-1', title: 'Item', type: 'local' }],
    }])
    const res = await app.request('/api/items/item-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: null }),
    })
    expect(res.status).toBe(200)
    const treeRes = await app.request('/api/list?format=tree')
    const treeBody = await treeRes.json()
    expect(treeBody.data.find((i: { id: string }) => i.id === 'item-1')).toBeDefined()
    const folder = treeBody.data.find((i: { id: string }) => i.id === 'folder-1')
    expect(folder.children ?? []).toHaveLength(0)
  })

  it('moves item before a sibling with before_id', async () => {
    await setList([
      { id: 'a', title: 'A', type: 'local' },
      { id: 'b', title: 'B', type: 'local' },
      { id: 'c', title: 'C', type: 'local' },
    ])
    const res = await app.request('/api/items/c', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ before_id: 'b' }),
    })
    expect(res.status).toBe(200)
    const listRes = await app.request('/api/list')
    const ids = (await listRes.json()).data.map((i: { id: string }) => i.id)
    expect(ids.indexOf('c')).toBe(ids.indexOf('b') - 1)
  })

  it('moves item after a sibling with after_id', async () => {
    await setList([
      { id: 'a', title: 'A', type: 'local' },
      { id: 'b', title: 'B', type: 'local' },
      { id: 'c', title: 'C', type: 'local' },
    ])
    const res = await app.request('/api/items/a', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ after_id: 'c' }),
    })
    expect(res.status).toBe(200)
    const listRes = await app.request('/api/list')
    const ids = (await listRes.json()).data.map((i: { id: string }) => i.id)
    expect(ids.indexOf('a')).toBe(ids.indexOf('c') + 1)
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
