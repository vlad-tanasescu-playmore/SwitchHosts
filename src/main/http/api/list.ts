import { getList } from '@main/actions'
import { flatten } from '@common/hostsFn'
import type { IHostsListObject } from '@common/data'
import type { Context } from 'hono'
import {
  attachContent,
  buildTreeWithEnrichments,
  computeEffectiveOn,
  computeIsStale,
  fixIsSys,
  injectParentId,
  resolveGroups,
} from './listHelpers'

const list = async (c: Context) => {
  let tree: IHostsListObject[]
  try {
    tree = await getList()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ success: false, message })
  }

  const format = c.req.query('format')
  const includeContent = c.req.query('include_content') === 'true'
  const resolveGroupsParam = c.req.query('resolve_groups') === 'true'

  let data: IHostsListObject[]

  if (format === 'tree') {
    data = await buildTreeWithEnrichments(tree, { includeContent })
  } else {
    // Flat mode pipeline — each step widens the type; cast to IHostsListObject[] at end
    // IHostsListObject has [key: string]: any so all extra fields are compatible
    const step1 = flatten(tree)
    const step2 = injectParentId(step1, tree)
    const step3 = computeEffectiveOn(step2)
    const step4 = computeIsStale(step3)
    const step5 = fixIsSys(step4)
    const step6 = resolveGroupsParam ? resolveGroups(step5) : step5
    data = includeContent
      ? await attachContent(step6 as IHostsListObject[])
      : (step6 as IHostsListObject[])
  }

  return c.json({ success: true, data })
}

export default list
