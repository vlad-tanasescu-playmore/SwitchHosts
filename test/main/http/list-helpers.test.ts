import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachContent, buildTreeWithEnrichments, computeEffectiveOn, computeIsStale, filterFlatItems, filterTree, fixIsSys, injectParentId, parseFilterParams, resolveGroups } from '../../../src/main/http/api/listHelpers'
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

  it('child inside inactive folder: effective_on = true because folders are passive containers', () => {
    const flat = [
      { id: 'f', type: 'folder' as const, on: false, parent_id: null },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    // Folders don't block children — getContentOfList ignores folder.on
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(true)
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

  it('nested folder: child in inactive parent folder is still effective (folders are passive)', () => {
    const flat = [
      { id: 'gf', type: 'folder' as const, on: true, parent_id: null },
      { id: 'f', type: 'folder' as const, on: false, parent_id: 'gf' },
      { id: 'c', type: 'local' as const, on: true, parent_id: 'f' },
    ]
    const result = computeEffectiveOn(flat)
    // Folders don't block children — only the child's own on state matters
    expect(result.find(i => i.id === 'c')!.effective_on).toBe(true)
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

describe('buildTreeWithEnrichments', () => {
  beforeEach(async () => { await clearData() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns nested structure preserving children', async () => {
    const tree = [
      {
        id: 'f',
        type: 'folder' as const,
        on: true,
        children: [
          { id: 'c', type: 'local' as const, on: true },
        ],
      },
    ]
    const result = await buildTreeWithEnrichments(tree, { includeContent: false })
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].id).toBe('c')
  })

  it('injects parent_id, effective_on, is_stale on all nodes', async () => {
    const tree = [
      {
        id: 'f',
        type: 'folder' as const,
        on: true,
        children: [
          { id: 'c', type: 'local' as const, on: true },
        ],
      },
    ]
    const result = await buildTreeWithEnrichments(tree, { includeContent: false })
    const folder = result[0]
    const child = result[0].children![0]
    expect(folder.parent_id).toBe(null)
    expect(child.parent_id).toBe('f')
    expect(child.effective_on).toBe(true)
    expect(folder.effective_on).toBe(true)
    expect('is_stale' in child).toBe(true)
  })

  it('attaches content to nodes when includeContent is true', async () => {
    await setList([
      {
        id: 'f',
        type: 'folder',
        on: true,
        children: [{ id: 'c', type: 'local', on: true }],
      },
    ])
    await setHostsContent('c', '1.2.3.4 test.com')
    const tree = [
      {
        id: 'f',
        type: 'folder' as const,
        on: true,
        children: [{ id: 'c', type: 'local' as const, on: true }],
      },
    ]
    const result = await buildTreeWithEnrichments(tree, { includeContent: true })
    expect(result[0].children![0].content).toContain('1.2.3.4 test.com')
  })
})

describe('parseFilterParams', () => {
  it('returns null when no relevant params are given', () => {
    expect(parseFilterParams({})).toBeNull()
    expect(parseFilterParams({ on: undefined })).toBeNull()
  })

  it('parses on=true', () => {
    const f = parseFilterParams({ on: 'true' })!
    expect(f.on).toBe(true)
  })

  it('parses on=false', () => {
    const f = parseFilterParams({ on: 'false' })!
    expect(f.on).toBe(false)
  })

  it('parses type as comma-separated array', () => {
    const f = parseFilterParams({ type: 'local,remote' })!
    expect(f.types).toEqual(['local', 'remote'])
  })

  it('parses ids as comma-separated array', () => {
    const f = parseFilterParams({ ids: 'abc,def' })!
    expect(f.ids).toEqual(['abc', 'def'])
  })

  it('parses q', () => {
    const f = parseFilterParams({ q: 'catena' })!
    expect(f.q).toBe('catena')
  })

  it('returns null for blank q', () => {
    expect(parseFilterParams({ q: '  ' })).toBeNull()
  })
})

describe('filterFlatItems', () => {
  const flat = [
    { id: 'f', type: 'folder' as const, on: true, parent_id: null, title: 'Folder' },
    { id: 'a', type: 'local' as const, on: true, parent_id: 'f', title: 'catena.ro' },
    { id: 'b', type: 'local' as const, on: false, parent_id: 'f', title: 'tonica.ro' },
    { id: 'c', type: 'remote' as const, on: true, parent_id: null, title: 'remote item' },
  ]

  it('returns all matched items with _matched: true', () => {
    const result = filterFlatItems(flat, { on: true })
    const matched = result.filter((i) => i._matched)
    expect(matched.map((i) => i.id).sort()).toEqual(['a', 'c', 'f'].sort())
  })

  it('includes ancestors with _matched: false when child matches', () => {
    const result = filterFlatItems(flat, { ids: ['a'] })
    const folderEntry = result.find((i) => i.id === 'f')
    expect(folderEntry).toBeDefined()
    expect(folderEntry!._matched).toBe(false)
    expect(result.find((i) => i.id === 'a')!._matched).toBe(true)
  })

  it('excludes items that do not match and have no matching descendants', () => {
    const result = filterFlatItems(flat, { ids: ['c'] })
    expect(result.find((i) => i.id === 'f')).toBeUndefined()
    expect(result.find((i) => i.id === 'a')).toBeUndefined()
    expect(result.find((i) => i.id === 'b')).toBeUndefined()
  })

  it('filters by type', () => {
    const result = filterFlatItems(flat, { types: ['remote'] })
    expect(result.find((i) => i.id === 'c')!._matched).toBe(true)
    expect(result.find((i) => i.id === 'a')).toBeUndefined()
  })

  it('filters by q (case-insensitive title search)', () => {
    const result = filterFlatItems(flat, { q: 'CATENA' })
    const ids = result.map((i) => i.id)
    expect(ids).toContain('a')
    expect(ids).toContain('f') // ancestor
    expect(ids).not.toContain('c')
  })

  it('returns empty array when nothing matches', () => {
    const result = filterFlatItems(flat, { q: 'nonexistent' })
    expect(result).toHaveLength(0)
  })
})

describe('filterTree', () => {
  const tree = [
    {
      id: 'f',
      type: 'folder' as const,
      on: true,
      title: 'Folder',
      children: [
        { id: 'a', type: 'local' as const, on: true, title: 'catena.ro' },
        { id: 'b', type: 'local' as const, on: false, title: 'tonica.ro' },
      ],
    },
    { id: 'c', type: 'remote' as const, on: true, title: 'remote' },
  ]

  it('keeps root items that match', () => {
    const result = filterTree(tree, { types: ['remote'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c')
    expect(result[0]._matched).toBe(true)
  })

  it('keeps parent when child matches, parent _matched = false', () => {
    const result = filterTree(tree, { ids: ['a'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('f')
    expect(result[0]._matched).toBe(false)
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].id).toBe('a')
    expect((result[0].children![0] as { _matched: boolean })._matched).toBe(true)
  })

  it('prunes branches with no match', () => {
    const result = filterTree(tree, { on: false })
    expect(result).toHaveLength(1) // folder is kept (has matching child b)
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children![0].id).toBe('b')
  })

  it('returns empty array when nothing matches', () => {
    const result = filterTree(tree, { q: 'nonexistent' })
    expect(result).toHaveLength(0)
  })
})
