import { getList } from '@main/actions'
import { getHostsContent } from '@main/actions'
import { flatten } from '@common/hostsFn'
import type { IHostsListObject } from '@common/data'
import type { Context } from 'hono'
import { injectParentId, computeEffectiveOn, computeIsStale, fixIsSys } from './listHelpers'

const find = async (c: Context) => {
  const hostname = c.req.query('hostname')?.trim().toLowerCase()
  if (!hostname) {
    return c.json({ success: false, message: 'missing ?hostname= parameter' }, 400)
  }

  const searchContent = c.req.query('search_content') !== 'false' // default true

  let tree: IHostsListObject[]
  try {
    tree = await getList()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ success: false, message })
  }

  const flat = flatten(tree)
  const enriched = fixIsSys(computeIsStale(computeEffectiveOn(injectParentId(flat, tree))))
  const results: (IHostsListObject & { match_source: 'title' | 'content' | 'both' })[] = []

  for (const item of enriched) {
    if (item.type === 'folder' || item.type === 'group') continue

    const titleMatch = item.title?.toLowerCase().includes(hostname) ?? false

    let contentMatch = false
    if (searchContent) {
      const content = await getHostsContent(item.id)
      if (content) {
        // Check each non-comment line for the hostname
        const lines = content.split(/\r?\n/)
        contentMatch = lines.some((line) => {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) return false
          return trimmed.toLowerCase().includes(hostname)
        })
      }
    }

    if (titleMatch || contentMatch) {
      const match_source = titleMatch && contentMatch ? 'both' : titleMatch ? 'title' : 'content'
      results.push({ ...(item as IHostsListObject), match_source })
    }
  }

  return c.json({ success: true, data: results, count: results.length })
}

export default find
