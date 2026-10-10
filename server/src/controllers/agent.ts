import { Request, Response } from 'express'

function retiredAgentEndpoint(_req: Request, res: Response) {
  return res.status(410).json({
    success: false,
    error: 'ENDPOINT_RETIRED',
    message: '旧对话接口已停用，请使用案件对话接口',
  })
}

export const createConversation = retiredAgentEndpoint
export const handleMessage = retiredAgentEndpoint
export const getConversation = retiredAgentEndpoint
