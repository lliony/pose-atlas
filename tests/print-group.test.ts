import { test } from "node:test";
import assert from "node:assert/strict";
import { planPrintGroups } from "../src/lib/print-group.ts";

type Key = string;

const photo = (
  title: string,
  opts: { panel?: number | null; width?: number; height?: number } = {},
) => ({
  key: title as Key,
  photo: { src: "/api/media/" + title, panel: null, ...opts },
});

test("空选择不生成任何组", () => {
  assert.deepEqual(
    planPrintGroups([], {
      paper: "a4",
      orientation: "landscape",
      edge: "short",
    }),
    [],
  );
});

test("同比例分到一组并归一化宽高比；正反面成对相邻", () => {
  const plan = planPrintGroups(
    [
      photo("a", { width: 3000, height: 4000 }),
      photo("b", { width: 3000, height: 4000 }),
      photo("c", { width: 3000, height: 4000 }),
      photo("d", { width: 3000, height: 4000 }),
    ],
    { paper: "a4", orientation: "landscape", edge: "short" },
  );
  assert.equal(plan.length, 1);
  const group = plan[0];
  assert.equal(group.count, 4);
  assert.deepEqual(group.aspect, { w: 3, h: 4 });
  // 每张纸两页：正面/背面成对，槽位总数等于卡片数。
  assert.ok(group.sheets.length >= 1);
  assert.equal(
    group.sheets.reduce((n, s) => n + s.front.length, 0),
    group.sheets.reduce((n, s) => n + s.back.length, 0),
  );
  const slots = group.sheets.flatMap((s) => s.front.concat(s.back));
  assert.deepEqual(
    [...new Set(slots)].filter(Boolean).sort(),
    ["a", "b", "c", "d"],
  );
});

test("不同比例分成多组，按张数从多到少排序", () => {
  const plan = planPrintGroups(
    [
      photo("big1", { width: 4000, height: 4000 }),
      photo("big2", { width: 4000, height: 4000 }),
      photo("big3", { width: 4000, height: 4000 }),
      photo("tall1", { width: 1000, height: 1500 }),
    ],
    { paper: "a4", orientation: "landscape", edge: "long" },
  );
  assert.equal(plan.length, 2);
  assert.equal(plan[0].count, 3); // 1:1 组更大，排前面
  assert.equal(plan[1].count, 1); // 2:3 组
  assert.deepEqual(plan[1].aspect, { w: 2, h: 3 });
});

test("最后一页卡片少时单独用更紧凑版面（沿用 layoutForCount）", () => {
  // 用一个很大的比例，保证每张纸只排得下一张，从而总会有不足页的 sheet。
  const many = Array.from({ length: 5 }, (_, i) =>
    photo("n" + i, { width: 9000, height: 16000 }),
  );
  const plan = planPrintGroups(many, {
    paper: "a5",
    orientation: "portrait",
    edge: "short",
  });
  assert.equal(plan.length, 1);
  const group = plan[0];
  // 张数=5，切页后正面所有槽位加起来应恰好覆盖 5 张（printSheets 用 null 补齐空位）。
  assert.equal(
    group.sheets.reduce((n, s) => n + s.front.filter(Boolean).length, 0),
    5,
  );
  assert.equal(
    group.sheets.reduce((n, s) => n + s.back.filter(Boolean).length, 0),
    5,
  );
});