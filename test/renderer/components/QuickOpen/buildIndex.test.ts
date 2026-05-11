import { describe, expect, it } from 'vitest'
import { buildIndex, SearchEntry } from '../../../../src/renderer/components/QuickOpen/buildIndex'
import { IHostsListObject } from '../../../../src/common/data'

describe('buildIndex', () => {
  it('emits one item entry per node (incl. folders/groups)', () => {
    const list: IHostsListObject[] = [
      { id: 'a', title: 'A', type: 'local', on: true },
      { id: 'f', title: 'F', type: 'folder', on: false, children: [
        { id: 'b', title: 'B', type: 'local', on: false },
      ] },
      { id: 'g', title: 'G', type: 'group', on: false, include: ['a'] },
    ]
    const out = buildIndex(list, {})
    const items = out.filter((e): e is Extract<SearchEntry, { kind: 'item' }> => e.kind === 'item')
    expect(items.map((i) => i.item_id).sort()).toEqual(['a', 'b', 'f', 'g'])
  })

  it('emits no line entries when contents map is empty', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A', type: 'local' }]
    const out = buildIndex(list, {})
    expect(out.filter((e) => e.kind === 'line')).toEqual([])
  })

  it('emits line entries only for local/remote items with content', () => {
    const list: IHostsListObject[] = [
      { id: 'a', title: 'A', type: 'local' },
      { id: 'f', title: 'F', type: 'folder' },
      { id: 'g', title: 'G', type: 'group' },
    ]
    const out = buildIndex(list, {
      a: '10.0.0.1 a-host\n10.0.0.2 b-host\n',
      f: '10.0.0.3 should-be-ignored\n',
      g: '10.0.0.4 should-be-ignored\n',
    })
    const lines = out.filter((e): e is Extract<SearchEntry, { kind: 'line' }> => e.kind === 'line')
    expect(lines.length).toBe(2)
    expect(lines.every((l) => l.item_id === 'a')).toBe(true)
  })

  it('denormalizes item_title/item_type/item_on onto line entries', () => {
    const list: IHostsListObject[] = [
      { id: 'a', title: 'tonica.ro', type: 'local', on: true },
    ]
    const out = buildIndex(list, { a: '10.0.52.232 tonica.ro\n' })
    const line = out.find((e) => e.kind === 'line')!
    expect(line).toMatchObject({
      kind: 'line',
      item_id: 'a',
      item_title: 'tonica.ro',
      item_type: 'local',
      item_on: true,
      ip: '10.0.52.232',
      hostnames: 'tonica.ro',
      line_no: 1,
    })
  })

  it('computes line_count on item entries', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A', type: 'local' }]
    const out = buildIndex(list, { a: '10.0.0.1 a\n# comment\n10.0.0.2 b\n\n10.0.0.3 c\n' })
    const item = out.find((e) => e.kind === 'item' && e.item_id === 'a')!
    expect(item.kind === 'item' && item.line_count).toBe(3)
  })

  it('treats missing on as false', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A', type: 'local' }]
    const out = buildIndex(list, {})
    const item = out.find((e) => e.kind === 'item' && e.item_id === 'a')!
    expect(item.kind === 'item' && item.on).toBe(false)
  })

  it('defaults missing type to local', () => {
    const list: IHostsListObject[] = [{ id: 'a', title: 'A' }]
    const out = buildIndex(list, { a: '10.0.0.1 a\n' })
    const line = out.find((e) => e.kind === 'line')!
    expect(line.kind === 'line' && line.item_type).toBe('local')
  })
})
