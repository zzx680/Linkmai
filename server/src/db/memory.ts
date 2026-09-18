// 内存存储（MVP 临时方案，生产环境需替换为真实数据库）

export interface User {
  id: string
  openid: string
  phone?: string
  nickname?: string
  avatar?: string
  createdAt: Date
  updatedAt: Date
}

export interface Case {
  id: string
  userId: string
  title: string
  accidentType?: string
  accidentDate?: Date
  status: string
  statusLabel: string
  materialCount: number
  liability?: string
  compensation?: string
  hasReport: boolean
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Conversation {
  id: string
  userId: string
  caseId?: string
  status: string
  agentState?: AgentState // Agent 状态追踪
  createdAt: Date
  updatedAt: Date
}

export interface AgentState {
  stage: 'collecting' | 'confirming' | 'analyzing' | 'ready'
  collectedFacts: CollectedFact[]
  pendingConfirmation?: CollectedFact[]
  nextQuestion?: string
  quickReplies?: QuickReply[]
}

export interface CollectedFact {
  key: string
  label: string
  value: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  confirmed: boolean
  materialId?: string
}

export interface QuickReply {
  label: string
  value: string
  action?: string
}

export interface Message {
  id: string
  conversationId: string
  role: string
  kind: string
  text?: string
  metadata?: any
  createdAt: Date
}

export interface Artifact {
  id: string
  caseId: string
  name: string
  type: string
  ossUrl: string
  ossKey: string
  fileSize: number
  mimeType?: string
  status: string
  createdAt: Date
  updatedAt: Date
}

// 内存存储
const users = new Map<string, User>()
const cases = new Map<string, Case>()
const conversations = new Map<string, Conversation>()
const messages = new Map<string, Message>()
const artifacts = new Map<string, Artifact>()

// 索引
const usersByOpenid = new Map<string, string>() // openid -> userId
const activeCasesByUser = new Map<string, string>() // userId -> caseId
const conversationsByUser = new Map<string, string[]>() // userId -> conversationIds
const messagesByConversation = new Map<string, string[]>() // conversationId -> messageIds

export const memoryDB = {
  // Users
  async createUser(openid: string): Promise<User> {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const user: User = {
      id,
      openid,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    users.set(id, user)
    usersByOpenid.set(openid, id)
    return user
  },

  async findUserByOpenid(openid: string): Promise<User | null> {
    const userId = usersByOpenid.get(openid)
    return userId ? users.get(userId) || null : null
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const user = users.get(userId)
    if (!user) return null
    Object.assign(user, updates, { updatedAt: new Date() })
    return user
  },

  // Cases
  async findActiveCase(userId: string): Promise<Case | null> {
    const caseId = activeCasesByUser.get(userId)
    return caseId ? cases.get(caseId) || null : null
  },

  async createCase(userId: string, title: string): Promise<Case> {
    // 将现有活跃案件设为非活跃
    const existingCaseId = activeCasesByUser.get(userId)
    if (existingCaseId) {
      const existingCase = cases.get(existingCaseId)
      if (existingCase) {
        existingCase.isActive = false
        existingCase.updatedAt = new Date()
      }
    }

    const id = `case_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const newCase: Case = {
      id,
      userId,
      title,
      status: 'collecting',
      statusLabel: '材料收集中',
      materialCount: 0,
      hasReport: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    cases.set(id, newCase)
    activeCasesByUser.set(userId, id)
    return newCase
  },

  async updateCase(userId: string, updates: Partial<Case>): Promise<Case | null> {
    const caseId = activeCasesByUser.get(userId)
    if (!caseId) return null
    const caseData = cases.get(caseId)
    if (!caseData) return null
    Object.assign(caseData, updates, { updatedAt: new Date() })
    return caseData
  },

  async deleteActiveCase(userId: string): Promise<boolean> {
    const caseId = activeCasesByUser.get(userId)
    if (!caseId) return false
    cases.delete(caseId)
    activeCasesByUser.delete(userId)
    return true
  },

  // Conversations
  async findOrCreateConversation(userId: string, caseId?: string): Promise<Conversation> {
    const userConvIds = conversationsByUser.get(userId) || []
    const activeConv = userConvIds
      .map((id) => conversations.get(id))
      .find((c) => c && c.status === 'active')

    if (activeConv) return activeConv

    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const conversation: Conversation = {
      id,
      userId,
      caseId,
      status: 'active',
      agentState: {
        stage: 'collecting',
        collectedFacts: [],
        nextQuestion: '您好！我是灵迈事故理赔助手。请问您遇到了什么类型的事故？',
        quickReplies: [
          { label: '交通事故', value: 'traffic_accident' },
          { label: '工伤事故', value: 'work_injury' },
          { label: '意外伤害', value: 'personal_injury' },
        ],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    conversations.set(id, conversation)
    conversationsByUser.set(userId, [...userConvIds, id])
    return conversation
  },

  async updateConversationState(conversationId: string, agentState: AgentState): Promise<Conversation | null> {
    const conversation = conversations.get(conversationId)
    if (!conversation) return null
    conversation.agentState = agentState
    conversation.updatedAt = new Date()
    return conversation
  },

  // Messages
  async createMessage(
    conversationId: string,
    role: string,
    kind: string,
    text?: string,
    metadata?: any
  ): Promise<Message> {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const message: Message = {
      id,
      conversationId,
      role,
      kind,
      text,
      metadata,
      createdAt: new Date(),
    }
    messages.set(id, message)
    const convMsgIds = messagesByConversation.get(conversationId) || []
    messagesByConversation.set(conversationId, [...convMsgIds, id])
    return message
  },

  async getMessages(conversationId: string): Promise<Message[]> {
    const msgIds = messagesByConversation.get(conversationId) || []
    return msgIds.map((id) => messages.get(id)).filter((m): m is Message => m !== undefined)
  },

  // Artifacts
  async createArtifact(artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Artifact> {
    const id = `artifact_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const newArtifact: Artifact = {
      ...artifact,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    artifacts.set(id, newArtifact)
    return newArtifact
  },

  // Health check
  async ping(): Promise<boolean> {
    return true
  },
}
