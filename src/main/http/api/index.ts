/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Hono } from 'hono'
import list from './list'
import toggle from './toggle'
import items_router from './items/index'

const router = new Hono()

router.get('/list', list)
router.get('/toggle', toggle)
router.route('/items', items_router)

export default router
