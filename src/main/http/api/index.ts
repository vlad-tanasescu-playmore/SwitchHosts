/**
 * @author: oldj
 * @homepage: https://oldj.net
 */

import { Hono } from 'hono'
import list from './list'
import toggle from './toggle'
import items_router from './items/index'
import content_router from './content/index'

const router = new Hono()

router.get('/list', list)
router.get('/toggle', toggle)
router.route('/items', items_router)
router.route('/content', content_router)

export default router
