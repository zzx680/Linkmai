import { Router } from 'express'
import { processMaterial } from '../services/material'

export const materialsRouter = Router()

/**
 * POST /api/materials/process
 * 处理上传的材料（OCR + AI 提取）
 */
materialsRouter.post('/process', async (req, res) => {
  try {
    const { materialType, imageUrl } = req.body

    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: '缺少图片 URL',
      })
    }

    const result = await processMaterial(materialType || 'police-report', imageUrl)

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    console.error('材料处理失败:', err)
    res.status(500).json({
      success: false,
      error: err.message || '材料处理失败',
    })
  }
})

/**
 * POST /api/materials/batch-process
 * 批量处理多个材料
 */
materialsRouter.post('/batch-process', async (req, res) => {
  try {
    const { materials } = req.body

    if (!Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少材料列表',
      })
    }

    const results = []

    for (const material of materials) {
      try {
        const result = await processMaterial(
          material.type || 'police-report',
          material.imageUrl
        )
        results.push({
          success: true,
          data: result,
        })
      } catch (err: any) {
        results.push({
          success: false,
          error: err.message,
          imageUrl: material.imageUrl,
        })
      }
    }

    res.json({
      success: true,
      data: results,
    })
  } catch (err: any) {
    console.error('批量处理失败:', err)
    res.status(500).json({
      success: false,
      error: err.message || '批量处理失败',
    })
  }
})
