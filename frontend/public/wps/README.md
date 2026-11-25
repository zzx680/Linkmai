# LinkMai WPS 加载项

这是 LinkMai 的 WPS 加载项入口，随 Web 站点一起发布在
`https://linkmai.com/wps/`。

## 当前能力

- 在 WPS 功能区增加「灵迈 LinkMai」选项卡。
- 点击「打开 LinkMai」在 WPS 任务窗格中打开
  `https://linkmai.com/assistant`。
- 登录、对话、上传文档等操作在 LinkMai 页面内完成。

当前版本不在 WPS 与 LinkMai 之间传递当前文档内容；如果需要在 WPS 侧边栏
直接读取选区或把结果插入文档，需要在这一加载项里继续接 WPS JS API
（`window.Application.ActiveDocument` 等），属于下一阶段开发。

## 本地调试

1. 安装 WPS 桌面版和 Node.js。
2. 安装工具：`npm install -g wpsjs`。
3. 在包含 `manifest.xml`、`ribbon.xml`、`index.html` 的目录执行
   `wpsjs debug`，按提示启动 WPS。
4. 发布：`wpsjs publish`，服务器地址填 `https://linkmai.com/wps/`。

WPS 加载项使用 WPS JS API，不是 Office.js；不要把这个目录当成
`word-addin/` 的替代品，也不要直接改 `manifest.xml` 的域名。
