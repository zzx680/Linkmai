// 本地预览入口：向内存数据库注入审核账号，再启动后端。
// 仅用于本地查看审核台页面，不写入任何持久化存储；重启后账号与数据都会清空。
import bcrypt from 'bcryptjs'
import { id, workflowStore } from '../src/harness/store'

const admins = [
  {
    email: process.env.PREVIEW_ADMIN_EMAIL || 'zzx141224@163.com',
    password: process.env.PREVIEW_ADMIN_PASSWORD || 'Linkmai-Local-Admin-2026',
  },
  {
    email: 'admin@linkmai.local',
    password: 'Linkmai-Local-Admin-2026',
  },
]
const lawyer = {
  phone: process.env.PREVIEW_LAWYER_PHONE || '13800000000',
  password: process.env.PREVIEW_LAWYER_PASSWORD || 'Linkmai-Local-Lawyer-2026',
}

async function main() {
  const adminHashes = await Promise.all(admins.map(admin => bcrypt.hash(admin.password, 12)))
  const lawyerHash = await bcrypt.hash(lawyer.password, 12)
  await workflowStore.control(control => {
    admins.forEach((admin, index) => {
      if (!control.reviewers.some(reviewer => reviewer.email === admin.email)) {
        control.reviewers.push({ id: id(), email: admin.email, passwordHash: adminHashes[index], role: 'review_admin', active: true })
      }
    })
    if (!control.reviewers.some(reviewer => reviewer.role === 'reviewer')) {
      control.reviewers.push({ id: id(), phone: lawyer.phone, passwordHash: lawyerHash, role: 'reviewer', active: true })
    }
  }, 'preview-seed')
  console.log(`预览账号已注入：管理员 ${admins.map(admin => admin.email).join('、')}，律师 ${lawyer.phone}`)
  await import('../src/index')
}

main().catch(error => {
  console.error('本地预览启动失败:', error)
  process.exit(1)
})
