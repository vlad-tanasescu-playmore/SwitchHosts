import { swhdb } from '@main/data'
import { IHostsContentObject } from '@common/data'
import { normalizeLineEndings } from '@common/newlines'

/**
 * Returns a map of item id → content for every stored hosts content record.
 * Used by the renderer's QuickOpen component to build a searchable index at mount.
 */
const getAllContents = async (): Promise<Record<string, string>> => {
  const all = await swhdb.collection.hosts.all<IHostsContentObject>()
  const out: Record<string, string> = {}
  for (const rec of all) {
    if (rec && typeof rec.id === 'string') {
      out[rec.id] = normalizeLineEndings(rec.content ?? '')
    }
  }
  return out
}

export default getAllContents
