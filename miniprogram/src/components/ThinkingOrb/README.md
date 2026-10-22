# 聊天等待动效

适配 [Jakubantalik/thinking-orbs](https://github.com/Jakubantalik/thinking-orbs) 的 `working` / `64` 状态，来源固定在提交 `de85557ca220332586d070d8788c0e1d6e877a0d`。保留原始轨道几何、黑白深度、粒子数量和速度；只移植当前需要的模式，使用微信 Canvas 2D / H5 Canvas 绘制，不引入网页专用运行时。

- `engine.ts` 是 MIT 原始几何的精简适配，`LICENSE` 随构建复制到 `licenses/thinking-orbs.txt`
- 以聊天接口请求是否完成控制展示，不代表后端提供了推理过程，也不模拟搜索、写作等阶段
- Canvas 固定 64 CSS px，像素比上限 2，帧率上限 30，不逐帧更新 React 状态
- 页面隐藏和组件卸载取消帧循环及尚未完成的初始化；H5 还跟随页面可见性与减少动态效果设置
- Canvas 初始化失败时显示轻量圆点后备状态，文案仍可读
- 不影响首页骨架、材料上传和微信支付的反馈方式

构建和网页预览不能代替微信 iOS / Android 真机检查，尤其需验证滚动裁剪、层级及切到后台后停止绘制。
