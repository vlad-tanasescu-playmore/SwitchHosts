import { HostsType, IHostsListObject } from '@common/data'
import { parseLines } from './parseLines'

export type SearchEntry =
  | {
      kind: 'item'
      item_id: string
      title: string
      parent_titles: string[]
      type: HostsType
      on: boolean
      line_count: number
    }
  | {
      kind: 'line'
      item_id: string
      item_title: string
      parent_titles: string[]
      item_type: HostsType
      item_on: boolean
      line_no: number
      ip: string
      hostnames: string
      raw: string
    }

function walkTree(
  list: IHostsListObject[],
  parents: string[],
  visit: (node: IHostsListObject, parent_titles: string[]) => void,
): void {
  for (const node of list) {
    const type: HostsType = node.type ?? 'local'
    if (type === 'folder') {
      const next_parents = node.title ? [...parents, node.title] : parents
      if (node.children?.length) {
        walkTree(node.children, next_parents, visit)
      }
      // Folder itself is not emitted — only its leaf descendants.
      continue
    }
    visit(node, parents)
  }
}

export function buildIndex(
  list: IHostsListObject[],
  contents: Record<string, string>,
): SearchEntry[] {
  const out: SearchEntry[] = []

  walkTree(list, [], (node, parent_titles) => {
    const type: HostsType = node.type ?? 'local'
    const on = node.on ?? false
    const title = node.title ?? ''
    const content = contents[node.id]
    const parsed = type === 'local' || type === 'remote' ? parseLines(content ?? '') : []

    out.push({
      kind: 'item',
      item_id: node.id,
      title,
      parent_titles,
      type,
      on,
      line_count: parsed.length,
    })

    for (const p of parsed) {
      out.push({
        kind: 'line',
        item_id: node.id,
        item_title: title,
        parent_titles,
        item_type: type,
        item_on: on,
        line_no: p.line_no,
        ip: p.ip,
        hostnames: p.hostnames,
        raw: p.raw,
      })
    }
  })

  return out
}
