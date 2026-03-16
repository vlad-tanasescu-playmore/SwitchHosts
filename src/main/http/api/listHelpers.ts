import { flatten, getParentOfItem } from '@common/hostsFn'
import type { IHostsListObject } from '@common/data'
import { getHostsContent } from '@main/actions'

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

// Gap 6: compute is_stale for remote items
// Gap 2: is_collapsed already passes through via [key: string]: any — no transformation needed
export const computeIsStale = (
  items: IHostsListObject[],
): (IHostsListObject & { is_stale: boolean | null })[] => {
  const now = Date.now()
  return items.map((item) => {
    if (
      item.type === 'remote' &&
      typeof item.refresh_interval === 'number' &&
      typeof item.last_refresh_ms === 'number'
    ) {
      const is_stale = (now - item.last_refresh_ms) > (item.refresh_interval * 1000)
      return { ...item, is_stale }
    }
    return { ...item, is_stale: null }
  })
}

// Gap 3: attach content to each item in a flat list (?include_content=true, flat mode)
export const attachContent = async (
  flat: IHostsListObject[],
): Promise<(IHostsListObject & { content: string })[]> => {
  return Promise.all(
    flat.map(async (item) => {
      const raw = await getHostsContent(item.id)
      return { ...item, content: raw ?? '' }
    }),
  )
}

// Gap 7: resolve group include IDs to item objects (?resolve_groups=true)
export const resolveGroups = (
  flat: IHostsListObject[],
): (IHostsListObject & { resolved_include?: IHostsListObject[] })[] => {
  return flat.map((item) => {
    if (item.type !== 'group' || !item.include) return item
    const resolved_include = item.include
      .map((incId) => flat.find((i) => i.id === incId))
      .filter((i): i is IHostsListObject => i !== undefined)
    return { ...item, resolved_include }
  })
}

// Gap 1: build enriched tree format (?format=tree)
// Applies all enrichments recursively: parent_id, effective_on, is_stale, is_sys, content
// Note: flatten and getHostsContent are already imported at top of file
export const buildTreeWithEnrichments = async (
  tree: IHostsListObject[],
  options: { includeContent: boolean },
): Promise<IHostsListObject[]> => {
  const flat = flatten(tree)
  const withParent = injectParentId(flat, tree)
  const withEffective = computeEffectiveOn(withParent)
  const withStale = computeIsStale(withEffective)
  const fixed = fixIsSys(withStale)

  // Build a lookup map of enriched flat items
  const enrichedMap = new Map(fixed.map((i) => [i.id, i]))

  // Recursive function to rebuild nested tree with enrichments applied
  const enrichNode = async (item: IHostsListObject): Promise<IHostsListObject> => {
    const enriched = enrichedMap.get(item.id) ?? item
    const node: IHostsListObject = { ...enriched }

    if (options.includeContent) {
      const raw = await getHostsContent(item.id)
      node.content = raw ?? ''
    }

    if (item.children && item.children.length > 0) {
      node.children = await Promise.all(item.children.map(enrichNode))
    }

    return node
  }

  return Promise.all(tree.map(enrichNode))
}

// Gap 8: ensure the system item (id "0") always has is_sys: true
export const fixIsSys = (items: IHostsListObject[]): IHostsListObject[] => {
  return items.map((item) =>
    item.id === '0' ? { ...item, is_sys: true } : item,
  )
}
