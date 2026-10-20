import test from "node:test";
import assert from "node:assert/strict";
import {
  PAPERS,
  backIndex,
  cardBox,
  printLayout,
  sheetCount,
} from "../src/lib/print.ts";
import { printSheets } from "../src/lib/model.ts";

test("cardBox 以短边为锚点推算卡面尺寸", () => {
  assert.deepEqual(cardBox("7:10", 70), { w: 70, h: 100 });
  assert.deepEqual(cardBox("1:1", 70), { w: 70, h: 70 });
  assert.deepEqual(cardBox("3:4", 60), { w: 60, h: 80 });
  assert.deepEqual(cardBox("4:3", 60), { w: 80, h: 60 });
  assert.deepEqual(cardBox("16:9", 90), { w: 160, h: 90 });
  assert.deepEqual(cardBox("9:16", 90), { w: 90, h: 160 });
});

test("A4 横向标准卡保持原来的 4×2、每面 8 张", () => {
  const layout = printLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "7:10",
    size: "medium",
  });
  assert.equal(layout.paperW, 297);
  assert.equal(layout.paperH, 210);
  assert.deepEqual(
    [layout.cardW, layout.cardH, layout.cols, layout.rows, layout.perSheet],
    [70, 100, 4, 2, 8],
  );
});

test("竖向纸张会交换宽高并减少列数", () => {
  const layout = printLayout({
    paper: "a4",
    orientation: "portrait",
    ratio: "7:10",
    size: "medium",
  });
  assert.deepEqual([layout.paperW, layout.paperH], [210, 297]);
  assert.deepEqual([layout.cols, layout.rows], [2, 2]);
  assert.equal(layout.perSheet, 4);
});

test("换纸张会改变每面张数", () => {
  const a5 = printLayout({
    paper: "a5",
    orientation: "landscape",
    ratio: "7:10",
    size: "medium",
  });
  const a3 = printLayout({
    paper: "a3",
    orientation: "landscape",
    ratio: "7:10",
    size: "medium",
  });
  assert.equal(a5.perSheet, 2);
  assert.equal(a3.perSheet, 10);
});

test("卡片尺寸三档改变单卡毫米数", () => {
  const small = printLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "7:10",
    size: "small",
  });
  const large = printLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "7:10",
    size: "large",
  });
  assert.deepEqual([small.cardW, small.cardH], [50, 71.4]);
  assert.deepEqual([large.cardW, large.cardH], [90, 128.6]);
  assert.ok(small.perSheet > large.perSheet);
});

test("卡面比例参与排版：16:9 在 A4 上排得更少", () => {
  const wide = printLayout({
    paper: "a4",
    orientation: "landscape",
    ratio: "16:9",
    size: "medium",
  });
  assert.deepEqual([wide.cardW, wide.cardH], [124.4, 70]);
  assert.equal(wide.cols, 2);
  assert.equal(wide.perSheet, 4);
});

test("卡片比纸还大时整体缩放到刚好放下", () => {
  const layout = printLayout({
    paper: "a5",
    orientation: "portrait",
    ratio: "9:16",
    size: "large",
  });
  const usableW = layout.paperW - layout.marginX * 2;
  const usableH = layout.paperH - layout.marginY * 2;
  assert.ok(layout.cardW <= usableW + 0.01);
  assert.ok(layout.cardH <= usableH + 0.01);
  assert.equal(layout.perSheet, 1);
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

test("每张纸的两面都按同一套行列切分", () => {
  const faces = printSheets(Array.from({ length: 10 }, (_, i) => i + 1), "short", 5, 2);
  assert.equal(faces.length, 2);
  assert.deepEqual(faces[0], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(faces[1], [5, 4, 3, 2, 1, 10, 9, 8, 7, 6]);
});

test("未知纸张尺寸表完整可用", () => {
  for (const paper of Object.keys(PAPERS)) {
    const layout = printLayout({
      paper: paper as keyof typeof PAPERS,
      orientation: "landscape",
      ratio: "7:10",
      size: "medium",
    });
    assert.ok(layout.cols >= 1 && layout.rows >= 1);
    assert.ok(layout.perSheet >= 1);
  }
});
