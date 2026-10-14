import { safeError } from '../utils/safe-error'
import express from 'express'
import multer from 'multer'
import { z } from 'zod'
import { db } from '../db'
import jwt from 'jsonwebtoken'
import { config } from '../config'
import { authMiddleware } from '../middleware/auth'
import { exchangeWechatCode, WechatLoginError } from '../services/wechat'
import { deleteFile, getSignedUrl, uploadUserAvatar } from '../services/oss'
import { extensionForImageMime, hasValidImageSignature, isSupportedImageMime } from '../utils/image'

const router = express.Router()
const nicknameSchema = z.object({
  nickname: z.string()
    .transform(value => value.trim())
    .refine(value => Array.from(value).length >= 1, '请输入昵称')
    .refine(value => Array.from(value).length <= 30, '昵称最多 30 个字符')
    .refine(value => !/[\p{Cc}\p{Cf}]/u.test(value), '昵称包含不支持的字符'),
}).strict()
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, isSupportedImageMime(file.mimetype)),
})

type StoredUser = {
  id: string
  openid: string
  nickname?: string | null
  avatar?: string | null
  avatar_key?: string | null
  avatarKey?: string | null
}

function avatarKeyOf(user: StoredUser) {
  return user.avatar_key || user.avatarKey || null
}

function legacyAvatarOf(user: StoredUser) {
  return user.avatar && /^https:\/\//i.test(user.avatar) ? user.avatar : undefined
}

async function toUserDto(user: StoredUser) {
  const avatarKey = avatarKeyOf(user)
  let avatar = legacyAvatarOf(user)
  if (avatarKey) {
    try {
      avatar = await getSignedUrl(avatarKey)
    } catch (error) {
      console.error('生成头像访问地址失败:', safeError(error))
    }
  }
  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname || undefined,
    avatar,
  }
}

async function sendUser(res: express.Response, user: StoredUser) {
  res.json({ success: true, data: await toUserDto(user) })
}

function receiveAvatar(req: express.Request, res: express.Response, next: express.NextFunction) {
  avatarUpload.single('file')(req, res, error => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ success: false, error: '头像不能超过 2MB' })
      return
    }
    if (error) {
      res.status(400).json({ success: false, error: '头像文件无效' })
      return
    }
    next()
  })
}

// 微信登录
router.post('/wechat/login', async (req, res) => {
  try {
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ success: false, error: '缺少微信授权码' })
    }

    const { openid } = await exchangeWechatCode(code)

    let user = await db.findUserByOpenid(openid)

    if (!user) {
      user = await db.createUser(openid)
    }

    // 生成 JWT
    const token = jwt.sign(
      { userId: user.id, openid: user.openid },
      config.jwtSecret,
      { expiresIn: '30d' }
    )

    res.json({
      success: true,
      data: {
        token,
        user: await toUserDto(user),
      },
    })
  } catch (err) {
    if (err instanceof WechatLoginError) {
      const status = err.code === 'INVALID_CODE' ? 400 : 503
      return res.status(status).json({ success: false, error: err.message })
    }
    console.error('登录错误:', safeError(err))
    res.status(500).json({ success: false, error: '登录失败' })
  }
})

// 当前会话
router.get('/session', authMiddleware, async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ success: false, error: '未认证' })
    }

    const user = await db.findUserById(req.userId)
    if (!user) {
      return res.status(401).json({ success: false, error: '用户不存在' })
    }

    await sendUser(res, user)
  } catch (err) {
    console.error('恢复会话错误:', safeError(err))
    res.status(500).json({ success: false, error: '恢复会话失败' })
  }
})

// 更新昵称
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ success: false, error: '未认证' })
    const parsed = nicknameSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message || '昵称格式无效' })
    }

    const user = await db.updateUserProfile(req.userId, { nickname: parsed.data.nickname })
    if (!user) return res.status(404).json({ success: false, error: '用户不存在' })
    await sendUser(res, user)
  } catch (err) {
    console.error('更新昵称错误:', safeError(err))
    res.status(500).json({ success: false, error: '保存资料失败' })
  }
})

async function deleteOldAvatarWithRetry(objectKey: string) {
  for (const delay of [0, 250, 1000]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    try {
      await deleteFile(objectKey)
      return
    } catch (error) {
      if (delay === 1000) console.error('清理旧头像失败:', safeError(error))
    }
  }
}

// 上传微信头像
router.post('/profile/avatar', authMiddleware, receiveAvatar, async (req, res) => {
  try {
    if (!req.userId) return res.status(401).json({ success: false, error: '未认证' })
    if (!req.file || !isSupportedImageMime(req.file.mimetype)
      || !hasValidImageSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ success: false, error: '仅支持有效的 JPG、PNG 或 WEBP 图片' })
    }

    const existing = await db.findUserById(req.userId)
    if (!existing) return res.status(404).json({ success: false, error: '用户不存在' })
    const previousKey = avatarKeyOf(existing)
    const uploaded = await uploadUserAvatar(
      req.userId,
      req.file.buffer,
      extensionForImageMime(req.file.mimetype)
    )

    const user = await db.updateUserProfile(req.userId, { avatarKey: uploaded.key })
    if (!user) throw new Error('USER_PROFILE_UPDATE_FAILED')
    if (previousKey && previousKey !== uploaded.key) {
      void deleteOldAvatarWithRetry(previousKey)
    }
    await sendUser(res, user)
  } catch (err) {
    console.error('上传头像错误:', safeError(err))
    res.status(500).json({ success: false, error: '头像上传失败' })
  }
})

// 绑定手机号
router.post('/bind-phone', authMiddleware, async (req, res) => {
  try {
    const { phone } = req.body
    const userId = req.userId

    if (!userId || typeof phone !== 'string' || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, error: '缺少手机号' })
    }

    await db.updateUser(userId, { phone })

    res.json({ success: true, data: { phone } })
  } catch (err) {
    console.error('绑定手机号错误:', safeError(err))
    res.status(500).json({ success: false, error: '绑定失败' })
  }
})

export default router
