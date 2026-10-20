# 打印纸张、构图网格与卡片再编辑

三件事一起做：**打印不再写死 A4 4×2**，**卡片可以随时补照片改文案**，**屏幕上的照片可以叠相机式 3×3 网格**。

## 1. 打印版式

### 模型（`src/lib/print.ts`，纯函数、有测试）

```ts
printLayout({ paper, orientation, ratio, size })
// → { paperW, paperH, cardW, cardH, cols, rows, perSheet, marginX, marginY, gutter }
```

- **纸张**：A5 / A4 / A3 / Letter，横竖各一套。
- **卡片尺寸**：短边 50 / 70 / 90mm 三档；长边永远由比例算出，所以"小/中/大"在换比例后仍然成立。
- **卡片比例**：`7:10（口袋卡 70×100）`、`1:1`、`4:3`、`3:4`、`16:9`、`9:16`。7:10 就是原来那张 70×100mm 的实物卡。
- **安全边距**：横向 8.5mm、纵向 5mm，刚好让 A4 横向回到原来的 4×2、每面 8 张。
- 卡片比纸还大时（例如 A5 竖放 90mm 的 9:16），整体等比缩到刚好放得下。

### 渲染

`print.css` 全部改成变量驱动：

```css
#print-root {
  --paper-w / --paper-h / --card-w / --card-h / --cols / --rows / --gap
  --card-fs: calc(min(var(--card-w), var(--card-h)) * 0.0271);
}
```

字号以**卡片短边**为锚点（70mm 时约 1.9mm ≈ 5.4pt，和原来的版式一致），卡内所有间距、栏高、字号都用 em，所以换纸张、换比例、换尺寸都不会串版。`@page` 的尺寸没法用变量，改成运行时注入一段 `@page { size: …mm …mm }`。

### 双面翻转

`printSheets(items, edge, cols, rows)` 按行列泛化：

- 短边翻转 = 每行左右镜像 `row*cols + (cols-1-col)`
- 长边翻转 = 整张上下镜像 `(rows-1-row)*cols + col`

原来的 4×2 结果与旧实现逐项一致（旧测试原样通过），另外补了 3×2、5×2 的用例。

### 横卡布局

`4:3` / `16:9` 时卡片不是简单压扁：`#print-root[data-wide="on"]` 切到「图片左 58% / 文案右」的两栏，背面笔记自动分两栏，避免宽画幅被裁成一条。

## 2. 卡片再编辑

- 详情弹窗底部新增 **编辑这张卡** / **＋ 添加照片**；后者打开编辑器并直接滚到上传区、聚焦文件选择框。
- 编辑器不再静默套用本地草稿：载入草稿时顶部出现「已恢复上次未保存的修改」，旁边一键「放弃草稿，改用已保存版本」。存储键仍为 `pose-draft-<userId>-<cardId>`，新建卡共用 `new`。
- 卡片右上角 ↗ 与翻面后的「编辑」保留，`aria-label` 完整。

## 3. 构图网格

- 工具栏（搜索框右侧）一个网格按钮，`aria-pressed`，状态存 `pose-atlas:grid`，写在 `body[data-grid]` 上。
- 纯 CSS 叠加：两条 `linear-gradient` + `background-size: 33.3333%`，在任意尺寸的照片框里都是 1px 线，且 `pointer-events: none` 不影响点击。
- 打印对话框另有独立的「打印时叠构图网格」，默认关——纸上印线会吃掉照片。

## 4. 打印设置持久化

`pose-atlas:print` 保存纸张、方向、卡片尺寸、比例、翻转方式、网格六项，下次打开打印对话框沿上次的选择。

## 5. 验收

- `npm test` 83 项全过（新增 15 项版式/翻转/缩放入口）。
- `npm run typecheck`、`npm run build` 通过。
- CDP 实测：
  - A4 横向 · 中 · 7:10 → `4 列 × 2 行 · 卡片 70×100mm · 共 3 张纸（6 面）`
  - A3 横向 · 中 · 16:9 → `3 列 × 4 行 · 124.4×70mm`，横卡左图右文
  - A5 纵向 · 大 · 9:16 → `1 列 × 1 行 · 90×160mm`
  - 详情页按钮、添加照片滚位、草稿提示与丢弃均按预期
- 截图：`output/print/`（`sheet-*`、`dialog-default`、`page-grid-on`、`editor-draft`、`detail-footer`）。
