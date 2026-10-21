# Settings and Floating AI Implementation Plan

**Goal:** 实现已批准的集中设置、非模态 AI 浮窗和显式网格开关。
**Architecture:** Atlas 管理设置开关与配置版本；SystemSettings 复用 AiSettings 和 ThemeSwitch；AiRecommendation 保持挂载，hidden 控制收起。
**Tech Stack:** React、TypeScript、CSS、Playwright。

- [x] 新建 SystemSettings.tsx，复用配置加载/保存/清除与默认状态查询，提供主题及网格选项。修改 AiSettings 返回按钮为可选。
- [x] Atlas 添加侧栏及移动端可用顶栏设置入口、常驻 AI 启动按钮、配置版本同步；AiRecommendation 移除内部设置，改用非模态 section，收起保留状态，配置变更取消旧请求。
- [x] app.css 添加设置及浮窗响应式布局、明确的网格按钮标签。
- [x] Node24 执行 npm test、npm run build；浏览器验证桌面与390px、浮窗收起保留、网格持久化、设置导航。

工作区无 Git；保留本地文件，不创建仓库。用户已批准设计，直接实施，不重复请求批准。

完成记录：87/87 测试通过；最终 TypeScript/Vite 构建通过。浏览器验证1440、768、390宽度无横向溢出，浮窗非模态、收起输入保留、设置同步、网格刷新持久化和移动端设置。复审发现默认可用性刷新及清除时测试取消问题，均已修复并浏览器补验。截图和脚本位于 output/playwright/settings-* 与 check-settings*.cjs。热更新时出现一次依赖数组长度开发警告，完整刷新后未复现。未调用真实模型。
