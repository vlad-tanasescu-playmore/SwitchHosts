import { getItemFromList, moveToTrashcan } from '@main/actions'
import { broadcast } from '@main/core/agent'
import events from '@common/events'
import type { Context } from 'hono'

const deleteItem = async (c: Context) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ success: false, message: 'missing id' }, 400)
  }

  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  await moveToTrashcan(id)
  broadcast(events.reload_list)

  return c.json({ success: true })
}

export default deleteItem
