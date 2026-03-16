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
