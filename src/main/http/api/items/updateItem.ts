import { getList, setList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import { findItemById, updateOneItem } from '@common/hostsFn'
import events from '@common/events'
import type { Context } from 'hono'

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

  const { id: _ignored, ...safeBody } = body
  const newList = updateOneItem(list, { id, ...safeBody })
  await setList(newList)
  broadcast(events.reload_list)

  const updated = findItemById(newList, id)
  if (!updated) {
    return c.json({ success: false, message: `Item not found after update: ${id}` }, 500)
  }
  return c.json({ success: true, data: updated })
}

export default updateItem
