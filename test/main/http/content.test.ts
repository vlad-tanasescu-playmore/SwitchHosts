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
