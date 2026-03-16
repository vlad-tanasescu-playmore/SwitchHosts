import { getParentOfItem } from '@common/hostsFn'
import type { IHostsListObject } from '@common/data'

// Gap 4: inject parent_id into a flat list using the original tree for hierarchy lookup
export const injectParentId = (
  flat: IHostsListObject[],
  tree: IHostsListObject[],
): (IHostsListObject & { parent_id: string | null })[] => {
  return flat.map((item) => {
    const parent = getParentOfItem(tree, item.id)
    return { ...item, parent_id: parent ? parent.id : null }
  })
}

// Gap 8: ensure the system item (id "0") always has is_sys: true
export const fixIsSys = (items: IHostsListObject[]): IHostsListObject[] => {
  return items.map((item) =>
    item.id === '0' ? { ...item, is_sys: true } : item,
  )
}
