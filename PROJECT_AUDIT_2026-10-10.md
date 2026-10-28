# 灵迈项目整合检查

> 历史记录：以下状态、测试结果和命令仅对应记录时的版本，不代表当前已部署、已验收或允许上线。旧部署、初始化和回退命令不要直接执行；当前操作统一见[部署指南](server/docs/DEPLOYMENT.md)。


检查日期：2026-10-10。检查对象是当前工作区，包括尚未提交的改动，而非仅检查 HEAD。

## 结论与范围

存在接口契约、状态隔离、运行方式和新旧实现并存的问题。Git 历史包含 `65dfed9 merge: resolve UI and backend integration conflicts`，但文本合并完成并不意味着功能集成完成。本次检查的源码中未发现 Git 冲突标记，`git diff --check` 通过。

不能仅依据当前代码把每个问题归因于某一个 agent：部分是旧实现遗留，部分是未完成功能，部分涉及当前未提交改动。下文按影响与证据区分。

- P1：应在继续真实业务联调或上线前优先修复。
- P2：影响流程完整性、恢复能力或工程可靠性。
- “复现”指本地隔离调用真实路由处理函数、服务或前端 store；外部 OCR/AI、Taro 请求使用受控替身。没有调用真实收费 API、操作生产数据或启动真实微信客户端。

## P1：优先问题

### A01. 仍挂载的旧对话接口缺少用户归属检查

- 位置：[旧对话控制器](/Users/charlie/linkmai/server/src/controllers/agent.ts:154)、[路由挂载](/Users/charlie/linkmai/server/src/index.ts:79)。
- `/api/agent` 虽要求 JWT，但创建的会话不保存用户归属；读取、发送消息只通过 `conversationId` 查全局 Map。
- 复现：用户甲创建并写入会话，用户乙携带相同会话 ID 读取，处理函数返回 200 和甲的内容。前提是乙获得会话 ID，并非能直接枚举所有会话。
- 同一旧控制器还硬编码 70%/30% 责任及赔偿金额，并包含已被产品规则取消的律师导流文案。
- 建议：主前端已走 `/api/conversations`，优先停用旧路由；若保留，必须加入用户/案件归属和真实业务逻辑。

### A02. TypeScript 编译成功，但生产入口和迁移入口无法执行

- 位置：[编译配置](/Users/charlie/linkmai/server/tsconfig.json:4)、[运行脚本](/Users/charlie/linkmai/server/package.json:9)、[服务入口](/Users/charlie/linkmai/server/src/index.ts:5)。
- 项目使用 ESM，`tsc` 保留了无扩展名导入、目录导入；生产启动却直接运行 Node，没有打包或运行时解析器。
- 复现：编译到临时目录成功；用 Node 22.19.0 执行产物入口，报 `ERR_UNSUPPORTED_DIR_IMPORT`（`./db`）；执行迁移产物，报 `ERR_MODULE_NOT_FOUND`（`../db/postgres`）。两者在进入数据库连接逻辑之前失败。
- 建议：统一为 Node 可直接执行的 ESM 输出（例如 NodeNext 与明确 `.js` 导入），或使用明确的打包方案；必须把编译产物启动纳入检查，不能只跑 `tsc`。

### A03. 发布时会删除运行所需的 multer

- 位置：[依赖分类](/Users/charlie/linkmai/server/package.json:50)、[部署脚本](/Users/charlie/linkmai/server/scripts/deploy-staging.sh:62)。
- `multer` 位于 `devDependencies`，服务入口与上传路由却在运行时导入它。部署脚本执行 `npm prune --omit=dev`。
- 检查：在 `server/` 执行 `npm ls --omit=dev multer`，结果为空。
- 影响：即使先解决 A02，按当前脚本发布仍会因缺少运行依赖而失败。
- 建议：将运行依赖归入 `dependencies`，在仅安装生产依赖的隔离环境启动验证。

### A04. 案件状态没有完整隔离，异步报告可写到另一个案件

- 位置：[前端创建案件](/Users/charlie/linkmai/miniprogram/src/store/index.ts:129)、[前端报告回写](/Users/charlie/linkmai/miniprogram/src/store/index.ts:270)、[后端报告回写](/Users/charlie/linkmai/server/src/routes/reports.ts:67)、[按当前案件更新](/Users/charlie/linkmai/server/src/db/postgres.ts:239)。
- 创建案件只替换 `currentCase`，未清空材料、消息、报告和对话状态。
- 前端复现：A 切换到 B 后，store 内仍保留 A 的报告、材料、消息；A 的报告请求稍后完成时，还会把 B 标为 `hasReport=true`。
- 后端复现：A 生成报告等待模型返回时创建 B；报告记录保存到 A，但 `db.updateCase(userId, ...)` 更新的是当时的活跃案件 B。结果 B 拥有 A 的责任结论并显示已有报告，实际上 B 没有报告记录。
- 建议：全部写入绑定发起操作时的 `caseId`；切换案件重置相关状态，异步结果回写前核对案件与请求版本。

### A05. 材料类型枚举不一致，专用识别分支未被调用

- 位置：[前端类型](/Users/charlie/linkmai/miniprogram/src/services/api.ts:233)、[后端类型分派](/Users/charlie/linkmai/server/src/services/material.ts:52)。
- 前端发送 `accident_report`、`medical_record`、`scene_photo`；后端专用分支接收 `police-report`、`medical-record`、`damage-photo`。
- 复现：传入前端的 `accident_report`，即使 OCR 成功，也只返回 `raw_text`，AI 结构化提取调用次数为 0。
- 影响：认定书、医疗材料和照片的专用字段提取能力没有通过当前页面接通。
- 建议：建立共享材料类型定义或显式映射；未知类型应校验，而不是静默回退。

### A06. 对话页上传图片后，没有进入识别与确认流程

- 位置：[图片上传操作](/Users/charlie/linkmai/miniprogram/src/pages/agent/index.tsx:63)、[消息路由](/Users/charlie/linkmai/server/src/routes/conversations.ts:56)、[确认前置状态](/Users/charlie/linkmai/server/src/routes/materials.ts:98)。
- “处理”页上传仅保存图片 URL，随后发消息；后端把传给状态机的 `materials` 固定为空数组，不处理这些图片。
- 文件停在 `uploaded`；而确认接口仅接受 `processed`。材料页对已上传卡片没有再次识别操作，展开后只能看到空字段并尝试确认。
- 证据：当前 diff 删除了消息路由原有的图片识别逻辑，但前端仍保留此上传入口；隔离消息处理没有触发识别。
- 建议：两处上传入口复用相同的上传、识别、核对链路，并保存和使用 `artifactId`；为失败或尚未处理的材料提供重试。

### A07. 内存数据库确认材料后，材料数始终不增加

- 位置：[确认逻辑](/Users/charlie/linkmai/server/src/routes/materials.ts:101)、[内存原地更新](/Users/charlie/linkmai/server/src/db/memory.ts:340)。
- `updateArtifact` 原地修改对象。路由随后读取旧变量 `artifact.metadata.confirmed` 时，它已变成 `true`，所以首次确认的计数分支不执行。
- 复现：确认成功为 `true`，案件 `materialCount` 仍为 0，`nextAction` 仍是 `continue_materials`。
- 影响：默认内存开发模式的首页无法正常推进到付费解锁。PostgreSQL 返回独立对象，行为与内存模式不同；其计数更新还需要考虑并发和事务一致性。
- 建议：更新前保存旧状态；更稳妥地在事务内按案件维护已确认材料数，避免依赖对象引用语义。

### A08. 报告生成响应与读取响应不一致，已有报告无法恢复

- 位置：[报告读取接口](/Users/charlie/linkmai/server/src/routes/reports.ts:126)、[数据库报告结构](/Users/charlie/linkmai/server/src/db/memory.ts:352)、[前端读取](/Users/charlie/linkmai/miniprogram/src/store/index.ts:284)。
- 生成接口返回报告正文；读取接口返回 `{id, caseId, content, createdAt}`，正文在 `content`。
- 前端仅识别顶层 `analysis` 或 `report`。
- 复现：数据库已有报告，读取接口返回 200；将该结构交给真实前端 store 后，`currentReport` 仍为 `null`。
- 另外，[报告生成服务](/Users/charlie/linkmai/server/src/services/report.ts:57) 忽略传入案件 ID，始终输出 `caseId: ''`。
- 建议：统一生成和读取的报告 DTO，明确报告 ID、案件 ID、正文与版本。

### A09. 无效 AI 报告响应被保存为“已完成”

- 位置：[报告解析回退](/Users/charlie/linkmai/server/src/services/report.ts:93)、[报告持久化](/Users/charlie/linkmai/server/src/routes/reports.ts:66)。
- 模型没有返回有效 JSON 时，解析函数吞掉异常，返回“报告生成中遇到问题”的占位内容，路由仍保存报告并设置案件为 `ready`。
- 复现：让 AI 返回非 JSON 文本，生成接口仍返回 200，案件 `hasReport=true`。
- 建议：使用结构校验，失败返回明确错误，不保存成功报告、不改变完成状态；同时校验字段类型，避免字符串形式的 `recommendations` 让前端渲染崩溃。

### A10. OCR 失败也会被当作材料识别成功

- 位置：[材料处理服务](/Users/charlie/linkmai/server/src/services/material.ts:27)、[OCR 错误返回](/Users/charlie/linkmai/server/src/services/ocr.ts:25)。
- OCR 服务返回 `{success:false,error}`，上层不检查 `success`，把缺失文字改成空字符串继续处理。
- 复现：模拟 OCR 失败后，服务正常返回一个值为空的 `raw_text` 字段；路由会据此把材料标为 `processed`，页面提示识别完成。
- 建议：识别失败必须中止并保存可重试的失败状态；禁止确认空白事实后生成报告。

## P2：流程与工程问题

### A11. 对话状态机未完成，无法通过正常问答收齐事实

- 位置：[消息处理](/Users/charlie/linkmai/server/src/services/agent.ts:125)、[文本提取](/Users/charlie/linkmai/server/src/services/agent.ts:220)。
- 文本提取仅覆盖事故类型、日期和地点，没有实现涉事方、事故经过的收集；也没有处理确认动作、结束收集或阶段切换。
- 复现：依次提供事故类型、日期、地点、双方信息、经过和确认指令后，仍处于 `collecting`，反复询问涉事方。
- 返回的快捷回复值 `traffic_accident` 也不能被只识别中文关键词的解析器识别；当前页面未渲染快捷回复，属于保留接口中的潜在断点。
- 建议：先定义明确的提问、接收、确认和阶段转移协议，再决定哪些步骤由规则或模型实现。

### A12. 补充或修改材料后，没有重新分析的完整入口

- 位置：[材料确认](/Users/charlie/linkmai/miniprogram/src/store/index.ts:234)、[报告页分支](/Users/charlie/linkmai/miniprogram/src/pages/report/index.tsx:92)。
- 材料变化不会使已缓存的报告失效；报告页只有 `currentReport` 为空时显示生成按钮，结果页没有重新生成按钮。
- 影响：同一会话内用户修改事实后继续看到旧结论，与“一次付费、后续更新”的产品承诺不一致。结果页还用当前材料数量描述旧报告依据，没有展示真实生成时的材料版本。
- 建议：记录报告输入版本/快照，材料变化标记报告过期，明确允许已付费案件重新分析。

### A13. 退出登录、初次登录失败或会话过期后缺少恢复入口

- 位置：[自动登录入口](/Users/charlie/linkmai/miniprogram/src/app.tsx:9)、[个人页退出](/Users/charlie/linkmai/miniprogram/src/pages/profile/index.tsx:52)、[401 处理](/Users/charlie/linkmai/miniprogram/src/services/api.ts:42)。
- 登录恢复仅在 App 首次挂载调用；个人页能退出却没有登录按钮，401 只清 token，页面操作也不触发重新登录。
- 影响：在当前应用会话里退出或认证失败后，用户继续点击创建案件会失败，需要重新启动等方式恢复。
- 建议：提供显式登录/重试入口与统一认证状态管理，避免多个页面并发请求和登录恢复互相覆盖。

### A14. AI 配置定义与实际请求脱节

- 位置：[服务配置](/Users/charlie/linkmai/server/src/config/index.ts:58)、[实际请求](/Users/charlie/linkmai/server/src/services/deepseek.ts:4)。
- 配置层支持自定义 DeepSeek 地址，但请求服务硬编码 `https://api.deepseek.com/v1` 和模型名 `deepseek-flash`，没有使用该地址配置。
- 这是已确认的配置失效；模型是否可用、是否支持图片，本次没有访问真实服务验证，不能据此宣称模型一定不存在或一定可用。
- 建议：集中配置模型和地址；补充带超时的真实文本/图片联调与错误处理。

### A15. 小程序严格类型检查有 25 处错误

- 运行 `miniprogram/node_modules/.bin/tsc --noEmit` 失败。
- 涉及 `app.config.ts` 等配置隐式 `any`、App 的 `children` 类型、LazyImage 参数及可选值、tab-bar 配置类型和 `wx` 全局声明。
- Taro 转译构建与 TypeScript 检查是不同步骤；本结果不等于已经证明微信编译失败，但说明当前类型检查不能充当集成质量门槛。
- 建议：先修复类型基线，然后把类型检查纳入 CI。

## 功能缺口、重复实现及待验证事项

1. **导出尚未实现**：[报告导出](/Users/charlie/linkmai/server/src/routes/reports.ts:162) 返回 501；前端声明 `word`，后端接受 `docx`，即使后续补实现也需先统一枚举。没有发现完整的法律文书生成实现。
2. **项目有多套定义**：根目录 `src/` 与 `miniprogram/src/` 为不同版本前端；根目录使用 `/api/v1`，当前后端挂载 `/api`；还残留 `miniprogram/miniprogram/src/services/api.ts`、旧 `/api/agent`、Prisma schema 与多份 SQL。当前微信配置指向 `miniprogram/dist/`，后端实际使用 `pg` 和 SQL 迁移。应明确权威入口，避免再次在旧文件上开发。
3. **数据库模式行为不同**：内存新建案件会关闭旧案件未付订单，PostgreSQL 的 `createCase` 没有对应逻辑；当前支付测试只覆盖内存。真实 PostgreSQL 的事务、并发建案、材料计数及订单回调仍需集成测试。SQL 未建立“每用户最多一个 active case”的部分唯一约束。
4. **私有 OSS 访问待验证**：当前上传保存 `client.put` 的普通 URL，OCR 与小程序直接使用它；已有 `getSignedUrl` 没有接入这些读取路径。若 bucket 为私有，需验证图片和 OCR 的访问权限。
5. **现有测试覆盖过窄**：只有迁移文件内容检查和内存支付流程两项，不能证明登录、上传、OCR、确认、报告和真实支付已经贯通。

## 本次验证记录

| 检查 | 结果 |
|---|---|
| 源码冲突标记、`git diff --check` | 未发现标记；通过 |
| 后端 TypeScript 编译到临时目录 | 通过 |
| Node 直接运行编译后服务、迁移入口 | 均失败，见 A02 |
| `server/` 生产依赖树检查 multer | 不包含，见 A03 |
| 内存模式现有测试 | 2/2 通过 |
| 小程序严格类型检查 | 25 处错误 |
| 材料类型、确认计数、OCR 失败、对话推进、报告结构与失败处理、旧接口归属 | 已隔离复现 |
| 前端 store 报告恢复、切换案件与迟到响应 | 已隔离复现 |
| 后端生成报告期间创建新案件 | 已隔离复现错误回写 |
| 微信真机、真实支付/AI/OCR、PostgreSQL 集成 | 本次未执行 |

本地复现脚本保存在临时目录，系统清理临时文件后需重新生成：

- [后端复现脚本](/tmp/linkmai-audit-l1XO1Y/backend.ts)
- [前端 store 复现脚本](/tmp/linkmai-audit-l1XO1Y/frontend.mjs)
- [后端案件并发复现脚本](/tmp/linkmai-audit-l1XO1Y/backend-race.ts)

后端复现使用 `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DB_TYPE=memory`，没有读取项目实际环境配置。所有测试构造的数据仅存在于隔离进程内存中。应用源码未修改；本次仅新增此检查报告。

## 建议修复顺序

1. 停用或修复旧对话越权接口；修复生产启动和依赖分类。
2. 统一材料、报告、案件 DTO；修复案件隔离、计数和失败状态。
3. 让两个上传入口走同一链路，补齐登录恢复、对话状态转移和报告重生成。
4. 补前后端契约测试与 PostgreSQL 集成测试，再做真实微信/OSS/OCR/AI/支付联调。
5. 清理旧入口和过时文档，最后推进导出、文书等未实现能力。
