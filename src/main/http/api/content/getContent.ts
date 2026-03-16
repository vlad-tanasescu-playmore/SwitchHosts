import { getHostsContent, getItemFromList } from '@main/actions'
import type { Context } from 'hono'

const getContent = async (c: Context) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ success: false, message: 'id is required' }, 400)
  }

  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  const raw = await getHostsContent(id)
  const content = raw ?? ''

  return c.json({ success: true, data: { id, content } })
}

export default getContent
