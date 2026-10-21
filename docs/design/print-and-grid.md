# 打印、构图网格与图片优先卡片

三件事的落地说明：**打印尺寸跟随页面**、**卡片可以随时补照片改文案**、**屏幕上的照片可以叠相机式 3×3 网格**。

> 2026-10-21 更新：打印不再单独选卡片尺寸与比例。比例在页面工具栏选一次（3:4 / 4:3 / 9:16 / 16:9），打印直接沿用当前页面卡片的比例与宽度。

## 1. 打印版式

### 模型（`src/lib/print.ts`，纯函数、有测试）

```ts
screenPrintLayout({ paper, orientation, ratio, screenCardWidth })
// → { paperW, paperH, cardW, cardH, cols, rows, perSheet, scale, … }
```

- **纸张**：A5 / A4 / A3 / Letter，横竖各一套。
- **比例**：`3:4 / 4:3 / 9:16 / 16:9`，来自页面的 `data-card-ratio`，打印对话框里不再出现比例选项。
- **尺寸**：卡片宽度取页面上卡片的实际 CSS 宽度，按 96dpi 换算成毫米（`px × 25.4 / 96`）；只有超出纸张可用区时才整体等比缩小（`scale < 1`），绝不放大。读不到宽度会直接报错，不猜尺寸。
- **安全边距**：横向 8.5mm、纵向 5mm。
- 每面行列由可用区除以卡片尺寸得到，同一面里比例一致，不混排。

### 渲染

`print.css` 全部由变量驱动：

```css
#print-root {
  --paper-w / --paper-h / --card-w / --card-h / --cols / --rows / --gap
  --card-fs: calc(min(var(--card-w), var(--card-h)) * 0.0271);
}
```

字号以**卡片短边**为锚点，卡内间距、栏高、字号都用 em，所以换纸张、换比例都不会串版。`@page` 的尺寸没法用变量，改成运行时注入一段 `@page { size: …mm …mm }`。

### 双面翻转

`printSheets(items, edge, cols, rows)` 按行列泛化：

- 短边翻转 = 每行左右镜像 `row*cols + (cols-1-col)`
- 长边翻转 = 整张上下镜像 `(rows-1-row)*cols + col`

### 横卡布局

`4:3` / `16:9` 时卡片不是简单压扁：`#print-root[data-wide="on"]` 切到「图片左 58% / 文案右」的两栏，背面笔记自动分两栏，避免宽画幅被裁成一条。

### 文字放不下时

预检先让单张卡的笔记字号自动缩（最多 16%），仍放不下才拦下打印，并把原因钉在对话框底部、附「定位」按钮跳到那张卡。

## 2. 卡片再编辑

- 详情弹窗底部有 **编辑这张卡** / **＋ 添加照片**；后者打开编辑器并直接滚到上传区、聚焦文件选择框。
- 编辑器不再静默套用本地草稿：载入草稿时顶部出现「已恢复上次未保存的修改」，旁边一键「放弃草稿，改用已保存版本」。存储键为 `pose-draft-<userId>-<cardId>`，新建卡共用 `new`。
- 卡片右上角 ↗ 与翻面后的「编辑」保留，`aria-label` 完整。

## 3. 构图网格

- 工具栏的网格按钮，`aria-pressed`，状态存 `pose-atlas:grid`，写在 `body[data-grid]` 上。
- 纯 CSS 叠加：两条 `linear-gradient` + `background-size: 33.3333%`，任意尺寸照片框里都是 1px 线，`pointer-events: none` 不影响点击。
- 打印对话框另有「打印时叠构图网格」，默认关。

## 4. 打印设置持久化

`pose-atlas:print` 保存纸张、方向、翻转方式、网格四项；比例与卡片宽度来自页面，不重复保存。页面外观（比例 / 边框）另存 `pose-atlas:appearance`。

## 5. 验收（2026-10-21）

- `npm test` 88 项全过；`npm run typecheck`、`npm run build` 通过。
- 本机 Chrome 实测：
  - 页面比例 `3:4` 卡片 369×492px，切到 `16:9` 后 565×318px，全部卡片同步、不混排；
  - 打印摘要 `1 列 × 2 行 · 卡片 149.5×84.1mm`，并注明「沿用当前页面卡片的比例与宽度」；
  - 点「打印」后 `window.print()` 被调用一次、无预检报错；
  - 人物性别筛选「男性」→ 3 张；背面笔记 `scrollHeight 322 / clientHeight 186`，可滚动。
- 截图：`output/photo-first/`（`grid-3-4`、`grid-16-9`、`card-back`、`print-dialog`）。
