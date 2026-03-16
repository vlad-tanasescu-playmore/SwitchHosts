import { getContentOfList, getItemFromList, getList, setHostsContent, setSystemHosts } from '@main/actions'
import { broadcast } from '@main/core/agent'
import events from '@common/events'
import type { Context } from 'hono'

const setContent = async (c: Context) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ success: false, message: 'id is required' }, 400)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, message: 'invalid JSON body' }, 400)
  }

  if (typeof body.content !== 'string') {
    return c.json({ success: false, message: 'content must be a string' }, 400)
  }

  const item = await getItemFromList(id)
  if (!item) {
    return c.json({ success: false, message: `Item not found: ${id}` }, 404)
  }

  await setHostsContent(id, body.content)
  broadcast(events.hosts_content_changed, id)

  if (item.on) {
    const list = await getList()
    const combined = await getContentOfList(list)
    await setSystemHosts(combined)
  }

  return c.json({ success: true })
}

export default setContent
