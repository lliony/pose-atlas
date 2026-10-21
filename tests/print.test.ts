import test from "node:test";
import assert from "node:assert/strict";
import {
  PAPERS,
  RATIOS,
  backIndex,
  sheetCount,
  screenPrintLayout,
} from "../src/lib/print.ts";
import { printSheets } from "../src/lib/model.ts";

test("只保留四个已批准的比例，且都是页面级选择", () => {
  assert.deepEqual(Object.keys(RATIOS).sort(), ["16:9", "3:4", "4:3", "9:16"]);
});

test("纸张表覆盖四种纸张，横向时宽高互换", () => {
  for (const paper of Object.keys(PAPERS) as (keyof typeof PAPERS)[]) {
    const landscape = screenPrintLayout({
      paper,
      orientation: "landscape",
      ratio: "3:4",
      screenCardWidth: 200,
    });
    assert.equal(landscape.paperW, PAPERS[paper].h);
    assert.equal(landscape.paperH, PAPERS[paper].w);
    assert.ok(landscape.perSheet >= 1);
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

test("screen print uses actual CSS width and preserves each approved ratio", () => {
  for (const ratio of ["3:4", "4:3", "9:16", "16:9"] as const) {
    const layout = screenPrintLayout({
      paper: "a4",
      orientation: "landscape",
      ratio,
      screenCardWidth: 300,
    });
    const [w, h] = ratio.split(":").map(Number);
    assert.ok(Math.abs(layout.cardW - 79.375) < 1e-9);
    assert.ok(Math.abs(layout.cardW / layout.cardH - w / h) < 1e-9);
    assert.equal(layout.scale, 1);
  }
});

test("screen print uniformly shrinks oversized cards, never expands", () => {
  const layout = screenPrintLayout({
    paper: "a5",
    orientation: "portrait",
    ratio: "9:16",
    screenCardWidth: 1200,
  });
  assert.equal(layout.cardH, 200);
  assert.equal(layout.cardW, 112.5);
  assert.equal(layout.perSheet, 1);
  assert.ok(layout.scale < 1);
  const small = screenPrintLayout({
    paper: "a3",
    orientation: "landscape",
    ratio: "4:3",
    screenCardWidth: 120,
  });
  assert.equal(small.scale, 1);
  assert.equal(small.cardW, 31.75);
});

test("screen print rejects missing measurement rather than inventing dimensions", () => {
  for (const screenCardWidth of [0, -1, NaN, Infinity]) {
    assert.throws(() =>
      screenPrintLayout({
        paper: "a4",
        orientation: "portrait",
        ratio: "3:4",
        screenCardWidth,
      }),
    );
  }
});
