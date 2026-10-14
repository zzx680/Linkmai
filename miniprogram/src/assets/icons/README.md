# Lucide 图标

当前页面和底部导航使用 [Lucide](https://lucide.dev/icons/) 官方图标，统一采用 24 × 24 画布、2px 描边、圆角端点和连接点。图标颜色沿用页面品牌蓝、灰色和状态色。

## 主要用途

| 用途 | Lucide 图标 |
| --- | --- |
| 首页 / 处理 / 我的 | `house` / `messages-square` / `user-round` |
| 案件与认定书 | `file-text` |
| 材料与证据 | `folder-open` |
| 事故报告 | `chart-no-axes-combined` |
| 赔偿、责任 | `scale` |
| 处理步骤 | `route` |
| 身份证 / 驾驶证 | `id-card` / `contact-round` |
| 行驶证 / 医疗记录 / 现场照片 | `car-front` / `hospital` / `camera` |
| 支付 / 安全 | `credit-card` / `shield-check` |

## 更新方式

在 `miniprogram/` 执行 `npm run convert:icons`。脚本使用固定版本的开发依赖 `lucide-static`，扫描页面中的 Icon 名称和颜色，生成 `lucide/` 中的 PNG 及 `components/Icon/assets.ts`。新增图标时先在脚本的 `names` 中加入官方名称，然后重新生成。

页面使用 `<Icon name="file-text" size={24} color="#1E43A8" />`。PNG 为透明背景的 192 × 192 素材，支持当前 14–64px 的显示尺寸；导航 PNG 为 96 × 96。编译会处理静态导入的图片路径，微信端无需加载远程字体或 SVG。

未知名称及未生成的颜色会回退到帮助图标或灰色。新增颜色后也需要重新生成素材。

原始素材许可证位于 [lucide/LICENSE](lucide/LICENSE)，涵盖 Lucide ISC 和部分 Feather 衍生图标 MIT 授权。旧 `remixicon.woff2` 已不再被页面引用，暂保留文件。
