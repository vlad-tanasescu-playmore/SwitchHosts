import { HostsType, IHostsListObject } from '@common/data'
import { parseLines } from './parseLines'

export type SearchEntry =
  | {
      kind: 'item'
      item_id: string
      title: string
      type: HostsType
      on: boolean
      line_count: number
    }
  | {
      kind: 'line'
      item_id: string
      item_title: string
      item_type: HostsType
      item_on: boolean
      line_no: number
      ip: string
      hostnames: string
      raw: string
    }

function walkTree(
  list: IHostsListObject[],
  visit: (node: IHostsListObject) => void,
): void {
  for (const node of list) {
    visit(node)
    if (node.children?.length) {
      walkTree(node.children, visit)
    }
  }
}

export function buildIndex(
  list: IHostsListObject[],
  contents: Record<string, string>,
): SearchEntry[] {
  const out: SearchEntry[] = []

  walkTree(list, (node) => {
    const type: HostsType = node.type ?? 'local'
    const on = node.on ?? false
    const title = node.title ?? ''
    const content = contents[node.id]
    const parsed = type === 'local' || type === 'remote' ? parseLines(content ?? '') : []

    out.push({
      kind: 'item',
      item_id: node.id,
      title,
      type,
      on,
      line_count: parsed.length,
    })

    for (const p of parsed) {
      out.push({
        kind: 'line',
        item_id: node.id,
        item_title: title,
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
