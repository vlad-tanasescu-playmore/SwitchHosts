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

type FlatWithParent = IHostsListObject & { parent_id: string | null }
type FlatWithEffective = FlatWithParent & { effective_on: boolean }

// Gap 5: compute effective_on for each item
// Requires flat list with parent_id already injected (output of injectParentId)
export const computeEffectiveOn = (
  flat: FlatWithParent[],
): FlatWithEffective[] => {
  // Build a working map: id → item with mutable effective_on
  const map = new Map<string, FlatWithEffective>()
  for (const item of flat) {
    map.set(item.id, { ...item, effective_on: false })
  }

  // Pass 1: compute effective_on for local/remote items (depend only on ancestors)
  const getAncestorEffective = (parentId: string | null): boolean => {
    if (parentId === null) return true
    const parent = map.get(parentId)
    if (!parent) return true
    return (parent.on ?? false) && getAncestorEffective(parent.parent_id)
  }

  for (const [, item] of map) {
    if (item.type !== 'folder' && item.type !== 'group') {
      item.effective_on = (item.on ?? false) && getAncestorEffective(item.parent_id)
    }
  }

  // Pass 2: compute effective_on for folder items (any child effective = folder effective)
  const getFolderEffective = (folderId: string): boolean => {
    for (const [, item] of map) {
      if (item.parent_id === folderId) {
        if (item.type === 'folder') {
          if (getFolderEffective(item.id)) return true
        } else if (item.type !== 'group') {
          if (item.effective_on) return true
        }
      }
    }
    return false
  }

  for (const [, item] of map) {
    if (item.type === 'folder') {
      item.effective_on = getFolderEffective(item.id)
    }
  }

  // Pass 3: compute effective_on for group items
  for (const [, item] of map) {
    if (item.type === 'group') {
      if (!(item.on ?? false)) {
        item.effective_on = false
      } else {
        const includes = item.include ?? []
        item.effective_on = includes.length > 0 && includes.every((incId) => {
          const inc = map.get(incId)
          return inc ? inc.effective_on : false
        })
      }
    }
  }

  return Array.from(map.values())
}

// Gap 8: ensure the system item (id "0") always has is_sys: true
export const fixIsSys = (items: IHostsListObject[]): IHostsListObject[] => {
  return items.map((item) =>
    item.id === '0' ? { ...item, is_sys: true } : item,
  )
}
