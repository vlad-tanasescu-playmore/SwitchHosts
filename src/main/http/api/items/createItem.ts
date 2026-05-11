import { getList, setList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { findItemById } from '@common/hostsFn'
import { IHostsListObject } from '@common/data'
import events from '@common/events'
import type { Context } from 'hono'
import { v4 as uuid4 } from 'uuid'

const createItem = async (c: Context) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, message: 'invalid JSON body' }, 400)
  }

  const { title, type, on, url, refresh_interval, folder_mode, include, children, parent_id, before_id, after_id } = body

  if (!title || typeof title !== 'string') {
    return c.json({ success: false, message: 'title is required' }, 400)
  }

  const newItem: IHostsListObject = {
    id: uuid4(),
    title,
    type: (['local', 'remote', 'group', 'folder'].includes(typeof type === 'string' ? type : '') ? type : 'local') as IHostsListObject['type'],
    on: typeof on === 'boolean' ? on : false,
    ...(typeof url === 'string' ? { url } : {}),
    ...(typeof refresh_interval === 'number' ? { refresh_interval } : {}),
    ...([0, 1, 2].includes(folder_mode as number) ? { folder_mode: folder_mode as IHostsListObject['folder_mode'] } : {}),
    ...(Array.isArray(include) ? { include: include as string[] } : {}),
    ...(Array.isArray(children) ? { children: children as IHostsListObject[] } : {}),
  }

  const list = await getList()

  // Helper: insert newItem into a collection relative to a sibling
  const insertInto = (
    col: IHostsListObject[],
    item: IHostsListObject,
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
    col.unshift(item)
    return true
  }

  if (typeof parent_id === 'string') {
    const parent = findItemById(list, parent_id)
    if (!parent) {
      return c.json({ success: false, message: `Parent not found: ${parent_id}` }, 404)
    }
    if (parent.type !== 'folder') {
      return c.json({ success: false, message: 'Parent item is not a folder' }, 400)
    }
    if (!Array.isArray(parent.children)) {
      parent.children = []
    }
    if (!insertInto(parent.children, newItem)) {
      const refId = (before_id ?? after_id) as string
      return c.json({ success: false, message: `Sibling not found in folder: ${refId}` }, 404)
    }
  } else {
    if (!insertInto(list, newItem)) {
      const refId = (before_id ?? after_id) as string
      return c.json({ success: false, message: `Sibling not found: ${refId}` }, 404)
    }
  }

  await setList(list)
  broadcast(events.reload_list)

  return c.json({ success: true, data: newItem })
}

export default createItem
