import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDraft } from "../server/ai/provider.ts";

test("AI 草稿会被裁剪、去重并只保留允许的选项", () => {
  const draft = normalizeDraft({
    title: "  窗边侧坐  ",
    tags: ["街拍", "街拍", "", 42],
    gender: "女性",
    styles: ["优雅", "不存在的风格"],
    notes: {
      pose: " 坐下，手放膝上 ",
      camera: "35mm",
      composition: "",
      light: "",
      cautions: "",
    },
  });
  assert.equal(draft.title, "窗边侧坐");
  assert.deepEqual(draft.tags, ["街拍"]);
  assert.equal(draft.gender, "女性");
  assert.deepEqual(draft.styles, ["优雅"]);
  assert.equal(draft.notes.pose, "坐下，手放膝上");
  assert.equal(draft.notes.camera, "35mm");
  assert.equal(draft.notes.light, "");
});

test("未知性别被丢弃，不报错", () => {
  const draft = normalizeDraft({
    title: "随便",
    gender: "机器人",
    notes: { pose: "站在门口" },
  });
  assert.equal(draft.gender, undefined);
  assert.equal(draft.notes.pose, "站在门口");
});

test("完全空的草稿视为无效响应", () => {
  assert.throws(() => normalizeDraft({}));
  assert.throws(() => normalizeDraft({ title: "  ", notes: { pose: "" } }));
});

test("超长文本按上限截断", () => {
  const draft = normalizeDraft({
    title: "标".repeat(200),
    tags: Array.from({ length: 20 }, (_, i) => `标签${i}`),
    notes: { pose: "动".repeat(500) },
  });
  assert.equal(draft.title.length, 100);
  assert.equal(draft.tags.length, 12);
  assert.equal(draft.notes.pose.length, 200);
});
