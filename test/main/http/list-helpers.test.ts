import { describe, expect, it } from 'vitest'
import { fixIsSys, injectParentId } from '../../../src/main/http/api/listHelpers'
import type { IHostsListObject } from '../../../src/common/data'

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
