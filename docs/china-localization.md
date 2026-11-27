# 灵迈 LinkMai 中国市场本土化

## 产品定位与范围

面向中国大陆的律师、律所与企业法务，保留文档工作台、项目、资料库、
批量审阅、工作流、审查规则和 Word 插件。产品对外名称为「灵迈 LinkMai」。

本轮变更覆盖 Web 与 Word 的共享中文文案、主要操作与错误提示、中文字体、
日期显示、职业资料的中文标签及输入法兼容。底层接口路径、模型 ID、
工作空间标识、权限值与历史文档内容继续使用原有约定。

## 文案与输入

- `packages/client/src/uiDictionary.ts` 保存两端共享的中文文案。
- 组件用 `uiText("Save")` 翻译开发者编写的界面文字；动态句子使用
  `uiText\`Open ${filename}\``。插值值保留原样，不能对用户的文档全文调用翻译。
- 默认语言为 `zh-CN`。现有行为测试在英文语言环境中运行；中文翻译、插值保真、
  配置和输入法行为有独立回归测试。
- 职业、业务领域和国家地区的中文显示与原有保存值分开；用户自填信息不重写。
- 日期使用中文显示惯例，继续使用用户设备时区。不得把所有用户的事件时间强行转为北京时间。
- `isImeComposing` 保护回车选字和方向键候选操作，包含 Safari 的 `keyCode=229`。
  聊天、文件夹重命名、表格输入等快捷操作应先检查此状态；标签接受中英文逗号。
- Word 使用本机中文字体，不依赖 Google Fonts。Office.js 仍由微软官方服务加载。

## 对外地址与支持

生产地址已确定为：

- Web 与账号：`https://linkmai.com`
- Word 加载项：`https://word.linkmai.com`
- WPS 加载项：`https://linkmai.com/wps/`（任务窗格打开 LinkMai；暂不读写当前文档）
- 对象存储：`https://storage.linkmai.com`（OSS 自定义域）
- 支持邮箱：`support@linkmai.com`（需先在邮件服务中创建该地址）
- 用户协议 / 隐私政策：尚未定稿。`LINKMAI_TERMS_URL` 与
  `LINKMAI_PRIVACY_URL` 暂时留空，注册页会提示“尚未配置”；法务定稿后再填入正式地址。

Web 本地构建可在 `frontend/.env.local` 配置：

```dotenv
NEXT_PUBLIC_LINKMAI_SITE_URL=
NEXT_PUBLIC_LINKMAI_SUPPORT_EMAIL=
NEXT_PUBLIC_LINKMAI_TERMS_URL=
NEXT_PUBLIC_LINKMAI_PRIVACY_URL=
```

Compose 构建从根环境文件读取对应的 `LINKMAI_SITE_URL`、
`LINKMAI_SUPPORT_EMAIL`、`LINKMAI_TERMS_URL`、`LINKMAI_PRIVACY_URL`。
它们是公开配置，随浏览器包构建；修改后需要重新构建。
未配置协议时注册页明确提示；支持邮箱为空时支持页引导联系部署管理员。
支持页不再提交到仓库不存在的反馈 API。

完整生产配置见 [`deploy/README.md`](../deploy/README.md)。

Word 构建配置：

```dotenv
REACT_APP_WEB_APP_URL=https://linkmai.com
WORD_ADDIN_PUBLIC_URL=https://word.linkmai.com
REACT_APP_LINKMAI_SUPPORT_EMAIL=support@linkmai.com
```

`WORD_ADDIN_PUBLIC_URL` 必须是部署后的 HTTPS origin；仍在使用示例域名时不能对外分发。
未配置支持邮箱时，插件允许复制诊断信息并明确提示联系管理员。
Google / 企业 SSO / 手机号 / 微信登录均只在后端 `/auth/options` 返回已启用时显示；手机号还要求阿里云短信 hook 与签名模板已配置，微信要求开放平台网站应用已配置。

## 法律适用与模型

聊天系统提示词对 Web、项目对话与 Word 的共享助手生效；批量提取与审查规则
审阅也补充了中文解释和保留原文的要求：

- 默认简体中文，遵循用户显式语言选择，并保留原文引文、名称及引用协议。
- 只有在未指定法域时才将中国大陆作为明确说明的工作假设；用户指定与合同约定优先。
- 不混用不同法域的法律适用，不编造法条、案号、日期、来源或数据库访问能力。
- 需要时效信息时以实际可访问的权威来源核验；无法核验则说明限制。
- 原文币种和金额保留，不因本土化将美元改成人民币。

CourtListener 保留为美国判例工具，并在配置页标注范围。
境外模板目录明确提示需要按适用法审查，翻译不等于中国法适配。
本轮没有接入中国法律数据库、导入中国合同模板、调用真实模型或验证法律答案质量。

国内模型可使用已有的 OpenAI 兼容接口配置能力；服务商端点、模型 ID、账户权限和
工具调用能力应按实际服务商文档配置和验收，产品不预填未验证的可用性承诺。
手机验证码与微信扫码登录已接入；短信由 GoTrue 生成 OTP、后端 Send SMS hook 调阿里云短信发送，微信走开放平台网站应用。支付和企业采购流程仍不在本轮部署范围。

## 验证边界

低层回归覆盖共享翻译与插值保真、Web/Word 输入法确认键、工作空间与权限、
配置校验和聊天系统提示词；生产构建覆盖 Web、Word 与后端。
浏览器检查使用合成账户、合成合同和模拟 API；Word 页面检查使用仓库 Office.js
模拟器，不代表真实 Word 桌面端修订能力验收，也不代表已上线。

后续需以目标部署、可用模型及合法取得的中文法律资料进行真实业务验收。

### 2026-11-25 本地验证记录

- `npm test --prefix frontend`：全量 4,617 项通过；随后新增的登录与配置专项
  9 项通过（其中包含既有测试的复验，不与全量数量简单相加）。
- `npm test --prefix backend -- ...`：助手提示词、批量提取、规则审阅与架构相关
  8 个测试文件、117 项通过。
- `npm run build --prefix frontend`、`npm run build --prefix word-addin`
  （设置验证用公开地址）、`npm run build --prefix backend` 通过。
- Web 与 Word 类型检查通过；`npm run lint --prefix frontend` 无错误、36 条警告。
  Word 打包仍有体积与运行时代码拆分提示。
- `git diff --check` 通过。没有提交或部署。
- 两个 Dockerfile 均完成过一次镜像构建；最终代码的镜像复验未完成：并行复构建
  耗时异常而中止，之后 Docker 引擎不可用。最终源代码的本机构建通过，不能据此
  声称最终镜像已完整复验。


登录页按 `/auth/options` 的答案渲染：手机号验证码（阿里云短信 hook 配好即出现）、微信扫码（开放平台网站应用配好即出现），
邀请码入口始终保留在下方作为内测通道（`/admin` 后台创建，`LINKMAI_INVITE_CODES` 仅作首次启动兜底）。
两个通道都未配置时显示“手机号与微信登录即将开放”，邮箱登录与邮箱注册已移除。
