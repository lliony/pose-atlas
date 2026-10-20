# 应用内配色切换（主题系统）

三套配色在应用里实时切换：**纸本（默认）· 白墙 · 暗房**。顶栏右侧的胶囊控件切换，选择记在本机，删除选择后回到"跟随系统"。

## 1. 结构

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 令牌 | `src/styles/app.css` 顶部 `@theme` | 纸本作为构建期默认值，同时是 Tailwind 工具类（`bg-ink`、`border-line`…）的来源 |
| 别名 | 同文件 `:root` | 把组件层用的 `--paper`、`--ink`、`--accent`… 指向 `var(--color-*)`，只维护一份真值 |
| 换肤 | `html[data-theme="white"]` / `[data-theme="dark"]` | 覆盖 `--color-*` 与 `--on-ink`、`--nav-active-*`、`--photo-bg`、`--scrim`、`--focus` 等辅助令牌 |
| 逻辑 | `src/lib/theme.ts` | 纯函数 `normalizeTheme` / `resolveTheme` / `readThemeFromQuery`，加上 `applyTheme` / `getCurrentTheme` |
| UI | `src/components/ThemeSwitch.tsx` | 三档按钮，`role="group"` + `aria-pressed`，色点 + 名称 |
| 首帧 | `index.html` 内联脚本 | 在样式加载前写好 `data-theme`，避免闪白 |

组件样式里已没有硬编码色值（58 处十六进制全部换成语义变量），所以新增一套配色只需覆盖变量。

## 2. 行为

- **存储键**：`pose-atlas:theme`，写入 `localStorage`。
- **默认值**：没有存储时跟随 `prefers-color-scheme`——系统深色进暗房，浅色进纸本；系统切换时实时同步（手动选过之后不再跟随）。
- **预览链接**：`?theme=paper|white|dark` 只影响当次打开，不写存储，方便发一条"看看暗色效果"的链接。
- **无闪烁**：首帧脚本先定 `data-theme`，React 挂载时读 `document.documentElement.dataset.theme`，不重算。
- **原生控件**：每个主题带 `color-scheme: light|dark`，滚动条、文件选择器等跟随。

## 3. 各主题的额外规则

| 主题 | 规则 |
| --- | --- |
| 纸本 | 主按钮 = 墨色块；选中块 = 陶土薄雾底 + 深陶土字 |
| 白墙 | 主按钮改陶土红；卡片描边加深到 `line-strong`（无阴影，靠线）；选中块 = 淡陶土底 + 红字 |
| 暗房 | 弹窗用 `surface`（比页面亮一层），输入框回落到 `sunken`；主按钮与选中块用琥珀 + 深褐字；品牌块改成深色底 + 琥珀字 |

打印视图不受影响：`print.css` 里的颜色是固定的纸张配色，且 `@media print` 强制白底，与屏幕主题解耦。

## 4. 新增第四套配色

1. `app.css` 加一段 `html[data-theme="xxx"] { … }`，至少覆盖 `--color-paper / surface / sunken / line / line-strong / ink / ink-soft / muted / faint / accent / accent-hover / soft`，再按需要补 `--on-ink`、`--on-accent`、`--nav-active-bg/fg`、`--photo-bg`、`--chip-bg`、`--scrim`、`--focus`。
2. `theme.ts` 的 `THEMES` 加一项（`id`、`name`、`hint`、`dot`）。
3. `index.html` 首帧脚本里的 `allowed` 数组加上新 id。
4. `tests/theme.test.ts` 补一条 `normalizeTheme` / `resolveTheme` 断言。

## 5. 验收

- `npm test`（71 项，含 5 项主题逻辑）、`npm run typecheck`、`npm run build` 均通过。
- 用 CDP 在真实 Chrome 里跑过：18 张卡渲染、三档点击后 `data-theme` 与 `localStorage` 同步、刷新保持、清除存储后系统深/浅色分别落到暗房/纸本。
- 截图：`output/theme/` 下的 `paper|white|dark`（首屏）、`grid-*`（卡片区）、`editor-*` / `ai-*`（弹窗）、`mobile-*`（390×844）。
