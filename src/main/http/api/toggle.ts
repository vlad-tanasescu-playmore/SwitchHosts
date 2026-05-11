/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { getList } from '@main/actions'
import { broadcast } from '@main/core/agent'
import events from '@common/events'
import { findItemById } from '@common/hostsFn'
import type { Context } from 'hono'

const toggle = async (c: Context) => {
  const id = c.req.query('id')
  console.log(`http_api toggle: ${id}`)
  if (!id) {
    return c.json({ success: false, message: 'id is required' }, 400)
  }

  const list = await getList()
  const item = findItemById(list, id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  const newOn = !item.on
  broadcast(events.toggle_item, id, newOn)
  return c.json({ success: true, data: { id, on: newOn } })
}

export default toggle
