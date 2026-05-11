import { getList, setList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { findItemById, updateOneItem } from '@common/hostsFn'
import type { IHostsListObject } from '@common/data'
import events from '@common/events'
import type { Context } from 'hono'

// Remove item with given id from the tree, return it (mutates col in place)
const removeFromTree = (
  col: IHostsListObject[],
  id: string,
): IHostsListObject | null => {
  for (let i = 0; i < col.length; i++) {
    if (col[i].id === id) {
      return col.splice(i, 1)[0]
    }
    if (col[i].children) {
      const found = removeFromTree(col[i].children!, id)
      if (found) return found
    }
  }
  return null
}

// Insert item into col at the right position
const insertInto = (
  col: IHostsListObject[],
  item: IHostsListObject,
  before_id: unknown,
  after_id: unknown,
): boolean => {
  if (typeof before_id === 'string') {
    const idx = col.findIndex((i) => i.id === before_id)
    if (idx === -1) return false
    col.splice(idx, 0, item)
    return true
  }
  if (typeof after_id === 'string') {
    const idx = col.findIndex((i) => i.id === after_id)
    if (idx === -1) return false
    col.splice(idx + 1, 0, item)
    return true
  }
  col.push(item)
  return true
}

const updateItem = async (c: Context) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ success: false, message: 'missing id' }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, message: 'invalid JSON body' }, 400)
  }

  const list = await getList()
  const existing = findItemById(list, id)
  if (!existing) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  const { id: _ignored, parent_id, before_id, after_id, ...safeBody } = body
  const isMove = 'parent_id' in body || 'before_id' in body || 'after_id' in body

  // Apply field updates first (on the current item in-place)
  let workingList = updateOneItem(list, { id, ...safeBody })

  if (isMove) {
    // Remove item from wherever it is
    const item = removeFromTree(workingList, id)
    if (!item) {
      return c.json({ success: false, message: `Item not found during move: ${id}` }, 500)
    }

    if (parent_id === null || parent_id === undefined) {
      // Move to root
      if (!insertInto(workingList, item, before_id, after_id)) {
        const refId = (before_id ?? after_id) as string
        return c.json({ success: false, message: `Sibling not found: ${refId}` }, 404)
      }
    } else if (typeof parent_id === 'string') {
      const parent = findItemById(workingList, parent_id)
      if (!parent) {
        return c.json({ success: false, message: `Parent not found: ${parent_id}` }, 404)
      }
      if (parent.type !== 'folder') {
        return c.json({ success: false, message: 'Parent item is not a folder' }, 400)
      }
      if (!Array.isArray(parent.children)) {
        parent.children = []
      }
      if (!insertInto(parent.children, item, before_id, after_id)) {
        const refId = (before_id ?? after_id) as string
        return c.json({ success: false, message: `Sibling not found in folder: ${refId}` }, 404)
      }
    }
  }

  await setList(workingList)
  broadcast(events.reload_list)

  const updated = findItemById(workingList, id)
  if (!updated) {
    return c.json({ success: false, message: `Item not found after update: ${id}` }, 500)
  }
  return c.json({ success: true, data: updated })
}

export default updateItem
