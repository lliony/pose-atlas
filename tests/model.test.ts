import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveNotes,
  snapshot,
  printSheets,
  validateState,
} from "../src/lib/model.ts";
import type { State } from "../src/lib/types.ts";

function sample(): State {
  return {
    categories: [
      { id: "street", name: "街道", code: "01" },
      { id: "private-category", name: "未分享场景", code: "02" },
    ],
    cards: [
      {
        id: "card",
        categoryId: "street",
        code: "01-001",
        title: "回头",
        tags: ["站姿"],
        notes: {
          pose: "自然站立",
          camera: "腰平机位",
          composition: "三分构图",
          light: "柔光",
          cautions: "放松肩膀",
        },
        privateNote: "仅自己知道的笔记",
        images: [
          {
            id: "image",
            src: "/images/street.png",
            panel: 0,
            ai: true,
            notes: { pose: "", composition: "中心构图" },
          },
        ],
      },
    ],
    albums: [
      { id: "album", name: "我的册子", description: "", cardIds: ["card"] },
    ],
  };
}

test("图片空字段继承通用教学，专属内容优先", () => {
  const s = sample(),
    n = resolveNotes(s.cards[0], s.cards[0].images[0]);
  assert.equal(n.pose, "自然站立");
  assert.equal(n.composition, "中心构图");
});
test("公开副本排除私人备注及册外分类", () => {
  const s = sample(),
    p = snapshot(s, s.albums[0]);
  assert(!JSON.stringify(p).includes("仅自己知道"));
  assert(!JSON.stringify(p).includes("未分享场景"));
  assert.equal(p.cards.length, 1);
});
test("快照不随原稿修改", () => {
  const s = sample(),
    p = snapshot(s, s.albums[0]);
  s.cards[0].notes.pose = "改动";
  s.cards[0].images[0].notes.composition = "改动";
  assert.equal(p.cards[0].notes.pose, "自然站立");
  assert.equal(p.cards[0].images[0].notes.composition, "中心构图");
});
test("回收站卡片不进入分享", () => {
  const s = sample();
  s.cards[0].deleted = true;
  assert.equal(snapshot(s, s.albums[0]).cards.length, 0);
});
test("短边翻转按列镜像，空位保留", () =>
  assert.deepEqual(printSheets([1, 2, 3])[1], [
    null,
    3,
    2,
    1,
    null,
    null,
    null,
    null,
  ]));
test("长边翻转按行镜像", () =>
  assert.deepEqual(
    printSheets([1, 2, 3, 4, 5, 6, 7, 8], "long")[1],
    [5, 6, 7, 8, 1, 2, 3, 4],
  ));
test("18张卡生成3张双面纸，空集合不生成纸张", () => {
  assert.equal(printSheets(Array.from({ length: 18 }, (_, i) => i)).length, 6);
  assert.deepEqual(printSheets([]), []);
});
test("拒绝未知分类、重复图片标识与外部图片", () => {
  const a = sample();
  a.cards[0].categoryId = "missing";
  assert.throws(() => validateState(a));
  const b = sample();
  b.cards[0].images.push({ ...b.cards[0].images[0] });
  assert.throws(() => validateState(b));
  const c = sample();
  c.cards[0].images[0].src = "https://untrusted.example/p.jpg";
  assert.throws(() => validateState(c));
});
test("允许已有示例与受控上传路径", () => {
  const s = sample();
  assert(validateState(s));
  s.cards[0].images[0].src = "/api/media/abc-123";
  assert(validateState(s));
});
