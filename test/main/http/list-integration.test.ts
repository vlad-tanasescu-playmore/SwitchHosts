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

describe('/api/list — filtering', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('?on=true returns only enabled items and their ancestors', async () => {
    await setList([
      { id: 'a', type: 'local', on: true, title: 'active' },
      { id: 'b', type: 'local', on: false, title: 'inactive' },
    ])
    const res = await app.request('/api/list?on=true')
    const body = await res.json()
    const ids = body.data.map((i: { id: string }) => i.id)
    expect(ids).toContain('a')
    expect(ids).not.toContain('b')
  })

  it('?type=remote returns only remote items', async () => {
    await setList([
      { id: 'a', type: 'local', on: true },
      { id: 'b', type: 'remote', on: true, url: 'http://example.com' },
    ])
    const res = await app.request('/api/list?type=remote')
    const body = await res.json()
    const ids = body.data.map((i: { id: string }) => i.id)
    expect(ids).toContain('b')
    expect(ids).not.toContain('a')
  })

  it('?q=catena matches title (case-insensitive)', async () => {
    await setList([
      { id: 'a', type: 'local', on: true, title: 'catena.ro' },
      { id: 'b', type: 'local', on: true, title: 'tonica.ro' },
    ])
    const res = await app.request('/api/list?q=CATENA')
    const body = await res.json()
    const ids = body.data.map((i: { id: string }) => i.id)
    expect(ids).toContain('a')
    expect(ids).not.toContain('b')
  })

  it('?ids=a,b returns only the specified items', async () => {
    await setList([
      { id: 'a', type: 'local', on: true },
      { id: 'b', type: 'local', on: true },
      { id: 'c', type: 'local', on: true },
    ])
    const res = await app.request('/api/list?ids=a,b')
    const body = await res.json()
    const ids = body.data.map((i: { id: string }) => i.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).not.toContain('c')
  })

  it('includes parent with _matched=false when child matches in flat mode', async () => {
    await setList([{
      id: 'f', type: 'folder', on: true, title: 'Folder',
      children: [{ id: 'c', type: 'local', on: true, title: 'catena.ro' }],
    }])
    const res = await app.request('/api/list?q=catena')
    const body = await res.json()
    const folder = body.data.find((i: { id: string }) => i.id === 'f')
    const child = body.data.find((i: { id: string }) => i.id === 'c')
    expect(folder).toBeDefined()
    expect(folder._matched).toBe(false)
    expect(child).toBeDefined()
    expect(child._matched).toBe(true)
  })

  it('?format=tree with filter prunes non-matching branches', async () => {
    await setList([{
      id: 'f', type: 'folder', on: true, title: 'Folder',
      children: [
        { id: 'a', type: 'local', on: true, title: 'catena.ro' },
        { id: 'b', type: 'local', on: true, title: 'tonica.ro' },
      ],
    }])
    const res = await app.request('/api/list?format=tree&q=catena')
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].children).toHaveLength(1)
    expect(body.data[0].children[0].id).toBe('a')
  })
})
