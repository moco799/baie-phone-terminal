# CENSY 白厄手机动态执行器

SillyTavern 本体 UI 扩展。它会识别 AI 消息中包含：

```html
<div id="baie-terminal-template">
```
和
```html
<div id="app-ui">
```

的 `html` 代码块，并将代码块内容装载到隔离的 iframe 中执行。

## 功能

- 读取每条 AI 正文中当次生成的 HTML，不使用固定聊天数据。
- 保留代码块内原有 HTML、CSS、JavaScript 内容。
- 在 iframe 内执行内联脚本和 `onclick` 交互。
- 支持 `alert()` 弹窗。
- 自动监听新消息、编辑、重新生成/切换 swipe、切换聊天。
- 自动测量 iframe 内容高度。
- 普通 HTML/JS 示例代码不会被执行，必须包含白厄手机根节点 ID 才会处理。

## 安装（手动）

1. 解压 `censy-baie-terminal.zip`。
2. 将 `censy-baie-terminal` 整个文件夹复制到 SillyTavern 安装目录：
   `public/scripts/extensions/third-party/`
3. 确认目录结构为：
   `public/scripts/extensions/third-party/censy-baie-terminal/manifest.json`
   `public/scripts/extensions/third-party/censy-baie-terminal/index.js`
   `public/scripts/extensions/third-party/censy-baie-terminal/style.css`
4. 重启 SillyTavern（或按你的部署方式重载前端）。
5. 打开酒馆 → 扩展 → 管理扩展，找到并启用「CENSY 白厄手机动态执行器」。
6. 刷新页面，发送一条会让 AI 输出白厄手机 HTML 的消息。

## 正文格式要求

AI 输出必须使用 `html` 代码围栏，并保留根节点：

```html
<div id="baie-terminal-template">
  ...
</div>
```

扩展会读取代码围栏内部的源码。代码围栏外的普通文本不会被放进手机。

## 图片说明

扩展可以显示 HTML 中实际存在的 `<img src="https://...">` 图片。
如果正文里只有“照片内容描述”这样的文字，浏览器不会自动把文字变成图片；要显示真实图片，需要模型输出图片 URL，或另接图片生成/托管流程。

## 安全边界

手机脚本运行在 `sandbox="allow-scripts allow-modals"` 的 iframe 中，不开放 `allow-same-origin`，不能直接访问酒馆主页面 DOM 或 Cookie。

内嵌 CSP 允许内联脚本、HTTPS 图片和样式，但禁止 `fetch`、XHR、WebSocket 等连接请求。不要把不可信来源的代码放进此执行器。

## 故障排查

- 没有变成手机：检查代码块是否为 ` ```html `，并确认源码包含 `id="baie-terminal-template"`。
- 手机出现但点击无反应：打开浏览器开发者工具 Console，查看是否有 CSP 或脚本语法错误。
- 内容被截断：检查 iframe 高度通知是否被浏览器扩展或页面策略拦截。
- 重新生成后未刷新：确认扩展启用，并检查酒馆前端是否正常触发消息渲染事件。
