import { Hono } from 'hono'
import getContent from './getContent'
import setContent from './setContent'

const router = new Hono()

router.get('/:id', getContent)
router.put('/:id', setContent)

export default router
