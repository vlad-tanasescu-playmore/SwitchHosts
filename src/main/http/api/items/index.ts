import { Hono } from 'hono'
import getItem from './getItem'
import createItem from './createItem'
import updateItem from './updateItem'
import deleteItem from './deleteItem'

const router = new Hono()

router.get('/:id', getItem)
router.post('/', createItem)
router.put('/:id', updateItem)
router.delete('/:id', deleteItem)

export default router
