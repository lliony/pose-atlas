import { test } from "node:test";
import assert from "node:assert/strict";
import { selectableRows } from "../src/lib/ai-model.ts";
import type { State, Card } from "../src/lib/types.ts";
import type { AiResult } from "../src/lib/ai-types.ts";

const card = (id: string, opts: Partial<Card> = {}): Card => ({
  id,
  categoryId: "c1",
  code: "01",
  title: id,
  tags: [],
  notes: { pose: "", camera: "", composition: "", light: "", cautions: "" },
  images: [],
  ...opts,
});

const state: State = {
  categories: [{ id: "c1", name: "街道", code: "01" }],
  cards: [card("a"), card("b")],
  albums: [],
};

const recommend = (...ids: string[]): AiResult["recommendations"] =>
  ids.map((cardId) => ({ cardId, reason: "r", adjustment: "a" }));

test("只保留仍然有效（在范围内、未删除）的推荐，并构建查询用的 map", () => {
  const { rows, cards, categoryById } = selectableRows(
    state,
    { kind: "all" },
    recommend("a", "b", "gone"),
  );
  assert.deepEqual(rows.map((r) => r.cardId), ["a", "b"]);
  assert.equal(cards.get("b")?.id, "b");
  assert.equal(categoryById.get("c1"), "街道");
});

test("被删除的卡片不再进入可选推荐", () => {
  const stateWithDeleted: State = {
    ...state,
    cards: [card("a", { deleted: true }), card("b")],
  };
  const { rows } = selectableRows(
    stateWithDeleted,
    { kind: "all" },
    recommend("a", "b"),
  );
  assert.deepEqual(rows.map((r) => r.cardId), ["b"]);
});

test("范围本身失效（册/分类不存在）时向外抛错，由界面区分显示", () => {
  assert.throws(
    () => selectableRows(state, { kind: "album", id: "missing" }, []),
    /卡片册不存在/,
  );
});