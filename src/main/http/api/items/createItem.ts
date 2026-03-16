import { getList, setList } from '@main/actions'
import { broadcast } from '@main/core/agent'
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

  const { title, type, on, url, refresh_interval, folder_mode, include, children } = body

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
  list.unshift(newItem)
  await setList(list)
  broadcast(events.reload_list)

  return c.json({ success: true, data: newItem })
}

export default createItem
