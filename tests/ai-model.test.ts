import test from "node:test";
import assert from "node:assert/strict";
import { sample } from "./fixtures/ai.ts";
import {
  buildCandidates,
  validateResult,
  addRecommendations,
} from "../src/lib/ai-model.ts";

const row = { cardId: "card", reason: "光线适合", adjustment: "稍微侧身" };
test("候选只发送教学资料且排除删除项", () => {
  const state = sample();
  state.cards[0].source = {
    url: "https://source.example",
    title: "来源资料",
    author: "作者",
  };
  state.cards.push({ ...state.cards[0], id: "deleted", deleted: true });
  const candidates = buildCandidates(state, { kind: "all" });
  assert.deepEqual(
    candidates.map((c) => c.id),
    ["card"],
  );
  assert.equal(candidates[0].category, "街道");
  assert.equal(candidates[0].imageNotes[0].index, 1);
  assert.equal(candidates[0].imageNotes[0].notes.composition, "中心构图");
  assert.equal(candidates[0].imageNotes[0].notes.pose, "自然站立");
  const serialized = JSON.stringify(candidates);
  for (const secret of ["仅自己知道", "/images/", "来源资料", "source.example"])
    assert.equal(serialized.includes(secret), false);
  assert.deepEqual(
    buildCandidates(state, { kind: "category", id: "private-category" }),
    [],
  );
});
test("卡片册与分类范围仅返回有效成员", () => {
  const state = sample();
  state.cards.push({
    ...state.cards[0],
    id: "other",
    categoryId: "private-category",
  });
  state.cards.push({ ...state.cards[0], id: "deleted", deleted: true });
  state.albums[0].cardIds.push("deleted", "missing");
  assert.deepEqual(
    buildCandidates(state, { kind: "album", id: "album" }).map((c) => c.id),
    ["card"],
  );
  assert.deepEqual(
    buildCandidates(state, { kind: "category", id: "street" }).map((c) => c.id),
    ["card"],
  );
  for (const kind of ["album", "category"] as const)
    assert.throws(() => buildCandidates(state, { kind, id: "missing" }));
});
test("候选资料独立复制并拒绝超预算而不截断", () => {
  const state = sample();
  const candidates = buildCandidates(state, { kind: "all" });
  candidates[0].notes.pose = "changed";
  candidates[0].tags.push("changed");
  assert.equal(state.cards[0].notes.pose, "自然站立");
  assert.deepEqual(state.cards[0].tags, ["站姿"]);
  state.cards[0].notes.pose = "x".repeat(120000);
  assert.throws(() => buildCandidates(state, { kind: "all" }));
});
test("过滤集合外 ID 与重复项但不伪造空结果", () => {
  assert.deepEqual(
    validateResult(
      {
        sceneSummary: "窗边",
        recommendations: [row, row, { ...row, cardId: "invented" }],
      },
      new Set(["card"]),
    ).recommendations,
    [row],
  );
  assert.throws(() =>
    validateResult({ sceneSummary: "窗边", recommendations: [row] }, new Set()),
  );
  assert.deepEqual(
    validateResult({ sceneSummary: "无匹配", recommendations: [] }, new Set())
      .recommendations,
    [],
  );
});
test("有效推荐按原顺序最多保留五项", () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    ...row,
    cardId: String(i),
  }));
  assert.deepEqual(
    validateResult(
      { sceneSummary: "", recommendations: rows },
      new Set(rows.map((r) => r.cardId)),
    ).recommendations,
    rows.slice(0, 5),
  );
});
test("拒绝错误结构、缺失字段和超长输出", () => {
  for (const value of [
    null,
    [],
    {},
    { sceneSummary: 1, recommendations: [] },
    { sceneSummary: "", recommendations: {} },
    { sceneSummary: "", recommendations: [null] },
    { sceneSummary: "", recommendations: [{ cardId: "card", reason: "" }] },
    { sceneSummary: "", recommendations: [{ ...row, cardId: 1 }] },
    { sceneSummary: "", recommendations: [{ ...row, reason: null }] },
    { sceneSummary: "x".repeat(2001), recommendations: [] },
    {
      sceneSummary: "",
      recommendations: [{ ...row, reason: "x".repeat(4001) }],
    },
    {
      sceneSummary: "",
      recommendations: [{ ...row, adjustment: "x".repeat(4001) }],
    },
  ])
    assert.throws(() => validateResult(value, new Set(["card"])));
  assert.doesNotThrow(() =>
    validateResult(
      {
        sceneSummary: "x".repeat(2000),
        recommendations: [
          { ...row, reason: "x".repeat(4000), adjustment: "x".repeat(4000) },
        ],
      },
      new Set(["card"]),
    ),
  );
  assert.throws(() =>
    validateResult(
      {
        sceneSummary: "",
        recommendations: [...Array(5).fill(row), { ...row, reason: false }],
      },
      new Set(["card"]),
    ),
  );
});
test("加入已有卡片册不重复且不修改输入", () => {
  const state = sample();
  state.cards.push(
    { ...state.cards[0], id: "second" },
    { ...state.cards[0], id: "deleted", deleted: true },
  );
  const before = structuredClone(state);
  const result = addRecommendations(state, "album", [
    "card",
    "card",
    "second",
    "missing",
    "deleted",
  ]);
  assert.deepEqual(result.albums[0].cardIds, ["card", "second"]);
  assert.deepEqual(state, before);
  assert.notEqual(result, state);
  assert.notEqual(result.albums[0], state.albums[0]);
  assert.throws(() => addRecommendations(state, "missing", ["card"]));
});
