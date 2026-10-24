import test from "node:test";
import assert from "node:assert/strict";
import { persistDraft, type DraftStorage } from "../src/lib/edit-draft.ts";

function fakeStorage() {
  const map = new Map<string, string>();
  const storage: DraftStorage = {
    setItem(k, v) {
      map.set(k, v);
    },
  };
  return { storage, map };
}

const CARD = { id: "k1", title: "窗边侧坐" };

test("草稿只在确有改动时写入：打开未改不产生草稿", () => {
  const { storage, map } = fakeStorage();
  const wrote = persistDraft(storage, "pose-draft-x", CARD, false);
  assert.equal(wrote, false);
  assert.equal(map.size, 0);
});

test("有改动时把整张卡片写成 JSON 并返回 true", () => {
  const { storage, map } = fakeStorage();
  const wrote = persistDraft(storage, "pose-draft-x", CARD, true);
  assert.equal(wrote, true);
  assert.equal(map.get("pose-draft-x"), JSON.stringify(CARD));
});

test("写入失败静默返回 false，不向调用方抛错", () => {
  const storage: DraftStorage = {
    setItem() {
      throw new Error("storage full");
    },
  };
  const wrote = persistDraft(storage, "pose-draft-x", CARD, true);
  assert.equal(wrote, false);
});