import { getItemFromList } from '@main/actions'
import type { Context } from 'hono'

const getItem = async (c: Context) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ success: false, message: 'missing id' }, 400)
  }
  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }
  return c.json({ success: true, data: item })
}

export default getItem
