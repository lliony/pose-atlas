import test from "node:test";
import assert from "node:assert/strict";
import {
  PAPERS,
  RATIOS,
  backIndex,
  fillLayout,
  layoutForAspect,
  layoutForCount,
  sheetCount,
} from "../src/lib/print.ts";
import { printSheets } from "../src/lib/model.ts";

test("列出全部支持的打印比例", () => {
  assert.deepEqual(Object.keys(RATIOS).sort(), [
    "16:9",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "9:16",
  ]);
});

test("A4 横向 3:4 铺成 4×2，单卡 70×93.3mm", () => {
  const layout = fillLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "3:4",
  });
  assert.deepEqual(
    [layout.cols, layout.rows, layout.perSheet],
    [4, 2, 8],
  );
  assert.deepEqual([layout.cardW, layout.cardH], [70, 93.3]);
});

test("16:9 为了放下背面笔记，宁可少排几张", () => {
  const layout = fillLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "16:9",
  });
  assert.deepEqual([layout.cols, layout.rows, layout.perSheet], [1, 2, 2]);
  assert.deepEqual([layout.cardW, layout.cardH], [168, 94.5]);
});

test("2:3 竖版在 A4 上排 4×2，单卡 66.7×100mm", () => {
  const layout = fillLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "2:3",
  });
  assert.deepEqual([layout.cols, layout.rows, layout.perSheet], [4, 2, 8]);
  assert.deepEqual([layout.cardW, layout.cardH], [66.7, 100]);
});

test("3:2 横版在 A4 上排 2×2，单卡 140×93.3mm", () => {
  const layout = fillLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "3:2",
  });
  assert.deepEqual([layout.cols, layout.rows, layout.perSheet], [2, 2, 4]);
  assert.deepEqual([layout.cardW, layout.cardH], [140, 93.3]);
});

test("1:1 方卡在 A4 上排 3×2，单卡 93.3mm", () => {
  const layout = layoutForAspect({
    paper: "a4",
    orientation: "landscape",
    aspect: { w: 1, h: 1 },
  });
  assert.deepEqual([layout.cols, layout.rows, layout.perSheet], [3, 2, 6]);
  assert.deepEqual([layout.cardW, layout.cardH], [93.3, 93.3]);
});

test("A5 竖放 9:16 只有一张，放大到纸宽", () => {
  const layout = fillLayout({
    paper: "a5",
    orientation: "portrait",
    ratio: "9:16",
  });
  assert.equal(layout.perSheet, 1);
  assert.equal(layout.cardW, 94.5);
  assert.equal(layout.cardH, 168);
});

test("任何纸张/方向/比例下，卡片都不越界、不小于 60mm 且保持比例", () => {
  for (const paper of Object.keys(PAPERS) as (keyof typeof PAPERS)[]) {
    for (const orientation of ["landscape", "portrait"] as const) {
      for (const ratio of Object.keys(RATIOS) as (keyof typeof RATIOS)[]) {
        const layout = fillLayout({ paper, orientation, ratio });
        const usableW = layout.paperW - layout.marginX * 2;
        const usableH = layout.paperH - layout.marginY * 2;
        const [rw, rh] = ratio.split(":").map(Number);
        assert.ok(layout.cardW <= usableW + 0.05, `${paper}/${orientation}/${ratio} 超宽`);
        assert.ok(layout.cardH <= usableH + 0.05, `${paper}/${orientation}/${ratio} 超高`);
        assert.ok(Math.min(layout.cardW, layout.cardH) >= 60, `${paper}/${orientation}/${ratio} 过小`);
        assert.ok(Math.abs(layout.cardW / layout.cardH - rw / rh) < 0.01, `${paper}/${orientation}/${ratio} 比例失真`);
        assert.equal(layout.perSheet, layout.cols * layout.rows);
      }
    }
  }
});

test("sheetCount 按每面张数向上取整", () => {
  assert.equal(sheetCount(0, 8), 0);
  assert.equal(sheetCount(8, 8), 1);
  assert.equal(sheetCount(9, 8), 2);
  assert.equal(sheetCount(18, 8), 3);
});

test("背面取位：短边左右镜像、长边上下镜像", () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => backIndex(i, 4, 2, "short")),
    [3, 2, 1, 0, 7, 6, 5, 4],
  );
  assert.deepEqual(
    Array.from({ length: 8 }, (_, i) => backIndex(i, 4, 2, "long")),
    [4, 5, 6, 7, 0, 1, 2, 3],
  );
  // 3 列 2 行：每行三个，短边翻转是行内倒序
  assert.deepEqual(
    Array.from({ length: 6 }, (_, i) => backIndex(i, 3, 2, "short")),
    [2, 1, 0, 5, 4, 3],
  );
});

test("printSheets 按传入的行列切面", () => {
  const faces = printSheets([1, 2, 3, 4, 5, 6], "short", 3, 2);
  assert.equal(faces.length, 2);
  assert.deepEqual(faces[0], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(faces[1], [3, 2, 1, 6, 5, 4]);
  // 6 张 3×2 正好一面，多一张就要第二张纸
  assert.equal(printSheets([1, 2, 3, 4, 5, 6, 7], "short", 3, 2).length, 4);
});

test("正面与反面相邻成对输出", () => {
  const faces = printSheets(Array.from({ length: 9 }, (_, i) => i + 1), "short", 3, 3);
  assert.equal(faces.length, 2);
  // 3×3 一面 9 张，正好一张纸：第 1 面正面、第 2 面背面
  assert.deepEqual(faces[0], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(faces[1], [3, 2, 1, 6, 5, 4, 9, 8, 7]);
});

test("每张纸的两面都按同一套行列切分", () => {
  const faces = printSheets(
    Array.from({ length: 10 }, (_, i) => i + 1),
    "short",
    5,
    2,
  );
  assert.equal(faces.length, 2);
  assert.deepEqual(faces[0], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(faces[1], [5, 4, 3, 2, 1, 10, 9, 8, 7, 6]);
});

test("最后一页卡片少时换更紧凑的版面", () => {
  const two = layoutForCount({
    paper: "a4",
    orientation: "landscape",
    aspect: { w: 3, h: 2 },
    count: 2,
  });
  assert.deepEqual([two.cols, two.rows], [2, 1]);
  assert.deepEqual([two.cardW, two.cardH], [140, 93.3]);

  const five = layoutForCount({
    paper: "a4",
    orientation: "landscape",
    aspect: { w: 2, h: 3 },
    count: 5,
  });
  assert.deepEqual([five.cols, five.rows], [3, 2]);
  assert.deepEqual([five.cardW, five.cardH], [66.7, 100]);

  const six = layoutForCount({
    paper: "a4",
    orientation: "landscape",
    aspect: { w: 3, h: 4 },
    count: 6,
  });
  assert.deepEqual([six.cols, six.rows], [3, 2]);
  assert.deepEqual([six.cardW, six.cardH], [75, 100]);
});

test("单张时铺满可用区且不越界", () => {
  const one = layoutForCount({
    paper: "a4",
    orientation: "landscape",
    aspect: { w: 1, h: 1 },
    count: 1,
  });
  assert.deepEqual([one.cols, one.rows], [1, 1]);
  assert.ok(one.cardW <= 280 + 1e-9);
  assert.ok(one.cardH <= 200 + 1e-9);
});