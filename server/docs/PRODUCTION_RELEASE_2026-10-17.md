# 2026-10-17 生产部署记录

- 正式 API：`https://api.linkmai.com/api`。
- Release：`/var/www/linkmai-production/releases/20261017-a6efcd45322f`。
- 源码基线：`ec7f0aa` 加发布时工作区变更；完整文件校验清单在 release 的 `manifest.json`，未创建 Git 提交。
- 源码归档 SHA256：`a6efcd45322fc92d4191ab8a2669be4819ed1e502de0df9666ecaa0159be95f3`。
- 进程：`linkmai-production-api`，监听 `127.0.0.1:8200`；独立数据库/账号 `linkmai_production`，独立 JWT。
- 环境文件：`/etc/linkmai/production.env`，仅 root 和服务账号组可读。负责人明确授权复用已有 OSS、OCR、AI、微信支付凭据。
- 支付：4990 分；回调 `https://api.linkmai.com/api/payments/wechat/notify`。未创建测试订单或发起付款。
- staging 仍使用 `8100`、独立测试库和 1 分价格；旧 Python 服务仍运行于 `8000`，作为本次域名切换的回退目标。

## 已完成验证

1. 62 项后端测试、39 项前端测试、TypeScript 检查、小程序生产构建及原生组件依赖检查。
2. 旧版库、staging 库、生产库备份；生产备份恢复及迁移演练。
3. 生产迁移 `0001`–`0004`；服务账号配置读取与数据库连接。
4. 正式域名 HTTPS；健康接口 200；未登录 session、case、upload 接口 401；缺少微信 code 返回 400。
5. 微信 AppID/AppSecret 校验、request/upload/download 合法域名确认。
6. 开发者工具真实微信登录成功；生产数据库新增一个真实登录用户，订单数为 0。

本机 `miniprogram/dist/` 已构建为正式 API。开发及生产本地环境文件均使用正式地址；配置文件被 Git 忽略。
未执行小程序上传、提交审核、微信商店发布或真实支付验收。

## 备份及回退

首次部署备份目录：`/var/backups/linkmai/production-first-release-20261017062628`。
服务器发布记录：`/var/www/linkmai-production/deployment-latest.json`。

如需将域名恢复到旧 Python 服务，在服务器上执行：

```bash
cp /var/backups/linkmai/production-first-release-20261017062628/api.linkmai.com.before.conf /etc/nginx/sites-available/api.linkmai.com.conf
nginx -t && systemctl reload nginx
```

这是流量回退，不回滚数据库、用户或支付数据。新生产数据库未复用或导入 staging 用户、案件和订单。

## 发布中修复

生产端口与 staging 分离。修复 Bash 在 `if ! (...)` 中忽略 `errexit` 的问题，改为显式串联发布步骤；安装、构建、测试或迁移失败时不得继续启动进程，新增四项失败路径回归测试。
