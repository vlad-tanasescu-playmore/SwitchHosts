import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachContent, computeEffectiveOn, computeIsStale, fixIsSys, injectParentId, resolveGroups } from '../../../src/main/http/api/listHelpers'
import type { IHostsListObject } from '../../../src/common/data'
import { setHostsContent, setList } from '../../../src/main/actions'
import { clearData } from '../../_base'

describe('injectParentId', () => {
  it('sets parent_id to null for top-level items', () => {
    const tree: IHostsListObject[] = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
    ]
    const flat = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]
    const result = injectParentId(flat, tree)
    expect(result[0].parent_id).toBe(null)
    expect(result[1].parent_id).toBe(null)
  })

  it('sets parent_id for nested items', () => {
    const tree: IHostsListObject[] = [
      {
        id: 'folder-1',
        type: 'folder',
        children: [
          { id: 'child-1', title: 'Child 1' },
          { id: 'child-2', title: 'Child 2' },
        ],
      },
    ]
    const flat = [
      { id: 'folder-1', type: 'folder' as const },
      { id: 'child-1', title: 'Child 1' },
      { id: 'child-2', title: 'Child 2' },
    ]
    const result = injectParentId(flat, tree)
    expect(result.find(i => i.id === 'folder-1')!.parent_id).toBe(null)
    expect(result.find(i => i.id === 'child-1')!.parent_id).toBe('folder-1')
    expect(result.find(i => i.id === 'child-2')!.parent_id).toBe('folder-1')
  })

  it('handles deeply nested items', () => {
    const tree: IHostsListObject[] = [
      {
        id: 'f1',
        type: 'folder',
        children: [
          {
            id: 'f2',
            type: 'folder',
            children: [{ id: 'deep', title: 'Deep' }],
          },
        ],
      },
    ]
    const flat = [
      { id: 'f1', type: 'folder' as const },
      { id: 'f2', type: 'folder' as const },
      { id: 'deep', title: 'Deep' },
    ]
    const result = injectParentId(flat, tree)
    expect(result.find(i => i.id === 'deep')!.parent_id).toBe('f2')
    expect(result.find(i => i.id === 'f2')!.parent_id).toBe('f1')
  })
})

describe('computeEffectiveOn', () => {
  it('top-level local item: effective_on = on', () => {
    const flat = [
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
      { id: 'b', type: 'local' as const, on: false, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'a')!.effective_on).toBe(true)
    expect(result.find(i => i.id === 'b')!.effective_on).toBe(false)
  })

  it('child inside active folder: effective_on = child.on && ancestor chain on', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: true, parent_id: null },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
      { id: 'd', type: 'local' as const, on: false, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(true)
    expect(result.find(i => i.id === 'd')!.effective_on).toBe(false)
  })

  it('child inside inactive folder: effective_on = false even if child.on = true', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: false, parent_id: null },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(false)
  })

  it('folder effective_on = true if any child has effective_on = true', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: true, parent_id: null },
      { id: 'c1', type: 'local' as const, on: true, parent_id: 'f' },
      { id: 'c2', type: 'local' as const, on: false, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'f')!.effective_on).toBe(true)
  })

  it('folder effective_on = false if all children have effective_on = false', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: true, parent_id: null },
      { id: 'c1', type: 'local' as const, on: false, parent_id: 'f' },
      { id: 'c2', type: 'local' as const, on: false, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'f')!.effective_on).toBe(false)
  })

  it('group: effective_on = on && all included items are effective_on', () => {
    const flat = [
      { id: 'g', type: 'group' as const, on: true, parent_id: null, include: ['a', 'b'] },
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
      { id: 'b', type: 'local' as const, on: true, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'g')!.effective_on).toBe(true)
  })

  it('group: effective_on = false if any included item is not effective_on', () => {
    const flat = [
      { id: 'g', type: 'group' as const, on: true, parent_id: null, include: ['a', 'b'] },
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
      { id: 'b', type: 'local' as const, on: false, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'g')!.effective_on).toBe(false)
  })

  it('group: effective_on = false if group itself is off', () => {
    const flat = [
      { id: 'g', type: 'group' as const, on: false, parent_id: null, include: ['a'] },
      { id: 'a', type: 'local' as const, on: true, parent_id: null },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'g')!.effective_on).toBe(false)
  })

  it('nested folder: child in inactive parent folder is not effective even with grandparent on', () => {
    const flat = [
      { id: 'gf', type: 'folder' as const, on: true, parent_id: null },
      { id: 'f', type: 'folder' as const, on: false, parent_id: 'gf' },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(false)
  })
})

describe('fixIsSys', () => {
  it('injects is_sys: true for id "0"', () => {
    const items: IHostsListObject[] = [
      { id: '0', title: 'System Hosts' },
      { id: 'abc', title: 'Other' },
    ]
    const result = fixIsSys(items)
    expect(result.find(i => i.id === '0')!.is_sys).toBe(true)
    expect(result.find(i => i.id === 'abc')!.is_sys).toBeUndefined()
  })

  it('does not overwrite is_sys: true if already set', () => {
    const items: IHostsListObject[] = [{ id: '0', is_sys: true }]
    const result = fixIsSys(items)
    expect(result[0].is_sys).toBe(true)
  })
})

describe('computeIsStale', () => {
  it('returns null for non-remote items', () => {
    const items = [{ id: 'a', type: 'local' as const }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBeNull()
  })

  it('returns null for remote item with no refresh_interval', () => {
    const items = [{ id: 'a', type: 'remote' as const, last_refresh_ms: 1000 }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBeNull()
  })

  it('returns null for remote item never refreshed (no last_refresh_ms)', () => {
    const items = [{ id: 'a', type: 'remote' as const, refresh_interval: 60 }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBeNull()
  })

  it('returns false for fresh remote item', () => {
    const now = Date.now()
    const items = [{
      id: 'a',
      type: 'remote' as const,
      refresh_interval: 3600,
      last_refresh_ms: now - 60_000,
    }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBe(false)
  })

  it('returns true for stale remote item', () => {
    const now = Date.now()
    const items = [{
      id: 'a',
      type: 'remote' as const,
      refresh_interval: 60,
      last_refresh_ms: now - 120_000,
    }]
    const result = computeIsStale(items)
    expect(result[0].is_stale).toBe(true)
  })

  it('passes is_collapsed through unchanged', () => {
    const items = [{ id: 'f', type: 'folder' as const, is_collapsed: true }]
    const result = computeIsStale(items)
    expect(result[0].is_collapsed).toBe(true)
  })
})

describe('resolveGroups', () => {
  it('resolves include IDs to item objects for group items', () => {
    const flat = [
      { id: 'g', type: 'group' as const, include: ['a', 'b'] },
      { id: 'a', type: 'local' as const, title: 'Item A' },
      { id: 'b', type: 'local' as const, title: 'Item B' },
    ]
    const result = resolveGroups(flat)
    const group = result.find(i => i.id === 'g')!
    expect(group.resolved_include).toHaveLength(2)
    expect(group.resolved_include[0].id).toBe('a')
    expect(group.resolved_include[1].id).toBe('b')
  })

  it('skips unknown IDs in include', () => {
    const flat = [
      { id: 'g', type: 'group' as const, include: ['a', 'missing'] },
      { id: 'a', type: 'local' as const, title: 'Item A' },
    ]
    const result = resolveGroups(flat)
    const group = result.find(i => i.id === 'g')!
    expect(group.resolved_include).toHaveLength(1)
    expect(group.resolved_include[0].id).toBe('a')
  })

  it('does not modify non-group items', () => {
    const flat = [{ id: 'a', type: 'local' as const, title: 'Item A' }]
    const result = resolveGroups(flat)
    expect(result[0].resolved_include).toBeUndefined()
  })
})

describe('attachContent', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('attaches content string to each flat item', async () => {
    await setList([
      { id: 'item-1', type: 'local', title: 'A' },
      { id: 'item-2', type: 'local', title: 'B' },
    ])
    await setHostsContent('item-1', '10.0.0.1 a.com')
    await setHostsContent('item-2', '10.0.0.2 b.com')

    const flat = [
      { id: 'item-1', type: 'local' as const },
      { id: 'item-2', type: 'local' as const },
    ]
    const result = await attachContent(flat)
    expect(result.find(i => i.id === 'item-1')!.content).toContain('10.0.0.1 a.com')
    expect(result.find(i => i.id === 'item-2')!.content).toContain('10.0.0.2 b.com')
  })

  it('returns empty string for items with no saved content', async () => {
    await setList([{ id: 'item-1', type: 'local', title: 'A' }])
    const flat = [{ id: 'item-1', type: 'local' as const }]
    const result = await attachContent(flat)
    expect(result[0].content).toBe('')
  })
})
