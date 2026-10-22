# 案件对话界面

微信小程序使用腾讯 [TDesign MiniProgram Chat](https://tdesign.tencent.com/miniprogram-chat/getting-started)
的 `chat-message` / `chat-sender`，固定版本为 `tdesign-miniprogram@1.17.0`（MIT）。
消息、快捷操作、材料类型选择与识别仍连接现有 Zustand / API 流程；组件替换不会改变后端对话能力。

- 原生组件在 `pages/agent/index.config.ts` 注册，路径必须包含 `miniprogram_dist`，由 Taro 编译依赖图。
- Taro 4 不遍历 `componentGenerics.default`；页面额外注册 `chat-markdown-tail`，确保组件内部默认泛型依赖也被编译。即使仅展示纯文本，微信仍会解析这类声明。
- `tslib`、`marked`、`dayjs` 是该版本原生组件实际引用但未在发布包声明的运行时依赖，显式固定在 package.json 中。
- Taro 4.0.7 的模板 loader 无法识别 `{{item.url}}` 等动态地址。`scripts/native-chat-template-loader.cjs` 仅针对 TDesign 跳过动态地址解析，继续收集静态 WXS、模板和图片，不修改模板或 node_modules。升级 Taro 后应复核是否可以移除。
- 消息以 `text` 类型传入，保留用户原文并使用组件自带转义。尚未启用 Markdown、停止生成等后端没有实现的功能。
- 等待回复时使用 [ThinkingOrb](../ThinkingOrb/README.md) 的黑白轨道粒子动效，替代 TDesign 的默认圆点；小程序和 H5 复用同一几何，不展示未经后端提供的推理阶段。
- 「口述经过」接入微信同声传译语音转文字，结果追加到现有草稿，由用户核对后主动发送，不生成语音消息。插件开通与构建开关见 [接入说明](../../services/speech/README.md)。
- 上传工具栏继续使用已有材料类型选择与上传流程。
- H5 使用同一适配层中的轻量 React 预览，不注册微信原生组件。Enter 发送，Shift+Enter 换行，输入法组词期间不发送。
- 键盘高度由页面处理；关闭 sender 的自动抬升和原生 adjust-position，避免重复位移。

发布前需在微信开发者工具和 iOS / Android 真机检查：长消息滚动、连续输入、中文输入法、键盘弹出/收起、材料上传与取消、发送失败后草稿恢复、快捷操作、切换案件及底部导航遮挡。

小程序构建后运行 `node scripts/check-native-chat-build.cjs`，检查组件、默认泛型、模板和 WXS 的依赖是否全部落盘；非默认构建目录作为命令参数传入。

组件来源与许可证：[Tencent/tdesign-miniprogram](https://github.com/Tencent/tdesign-miniprogram)，MIT 声明从 npm 包复制到构建目录的 `licenses/tdesign-miniprogram.txt`。
