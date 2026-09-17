import express from 'express'
import { memoryDB } from '../db/memory'
import jwt from 'jsonwebtoken'
import { config } from '../config'

const router = express.Router()

// 微信登录
router.post('/wechat/login', async (req, res) => {
  try {
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ success: false, error: '缺少微信授权码' })
    }

    // TODO: 调用微信 API 获取 openid
    // 临时模拟：直接用 code 作为 openid
    const openid = `mock_${code}`

    // 查找或创建用户
    let user = await memoryDB.findUserByOpenid(openid)

    if (!user) {
      user = await memoryDB.createUser(openid)
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
        user: {
          id: user.id,
          openid: user.openid,
          nickname: user.nickname,
          avatar: user.avatar,
        },
      },
    })
  } catch (err) {
    console.error('登录错误:', err)
    res.status(500).json({ success: false, error: '登录失败' })
  }
})

// 绑定手机号
router.post('/bind-phone', async (req, res) => {
  try {
    const { phone } = req.body
    const userId = req.userId

    if (!phone || !userId) {
      return res.status(400).json({ success: false, error: '缺少手机号' })
    }

    await memoryDB.updateUser(userId, { phone })

    res.json({ success: true, data: { phone } })
  } catch (err) {
    console.error('绑定手机号错误:', err)
    res.status(500).json({ success: false, error: '绑定失败' })
  }
})

export default router
