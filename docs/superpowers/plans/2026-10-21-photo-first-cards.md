# Photo-first Cards Implementation Plan

**Goal:** 将已确认的图片优先卡片及筛选、打印行为接入正式页面。
**Architecture:** 独立 appearance 模块管理显示参数与分类匹配；Atlas 管理持久化选择；Photo 识别生成参考图分栏；模型校验与快照扩展可选元数据。PrintView 接收 appearance 与屏幕宽度，不重复选择尺寸。
**Tech Stack:** React、TypeScript、CSS、Node 测试、Chrome CDP 实测。

- [x] 数据：增加可选性别和风格；校验和快照；可重复安全执行的六张参考图迁移；单元测试。
      → `src/lib/card-appearance.ts`、`reference-cards.ts`、`model.ts`；`tests/card-appearance.test.ts` 4 项。
- [x] 界面：比例/边框/性别/风格控制，编辑元数据，卡片照片铺满与背面滚动，保留原有操作。
      → `Atlas.tsx` 的 `.card-display-controls`、`styles/cards.css`、`Editor.tsx` 的性别下拉与风格多选。
- [x] 打印：沿用页面样式与尺寸，移除独立尺寸比例选项；纸张布局测试。
      → `screenPrintLayout()`（CSS px × 25.4/96，只缩不放）；`tests/print.test.ts` 3 项；旧 `printLayout`/`SIZES` 已删除。
- [x] 验证：完整测试、构建、桌面手机实际浏览器，筛选/编辑/多图/翻面/打印预检；最终代码审查。
      → `npm test` 88/88、`npm run typecheck`、`npm run build` 通过；本机 Chrome 实测记录见 `docs/verification.md` 与 `docs/design/print-and-grid.md`。

分工：主代理负责数据和界面；card_print 负责打印组件、print 模块和打印样式/测试。仓库已初始化并推送到 GitHub（`lliony/pose-atlas`）。
