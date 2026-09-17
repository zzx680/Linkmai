import { Router } from 'express'
import {
  createConversation,
  handleMessage,
  getConversation
} from '../controllers/agent'

const router = Router()

router.post('/conversation', createConversation)
router.post('/message', handleMessage)
router.get('/conversation/:conversationId', getConversation)

export default router
