import test from "node:test";
import assert from "node:assert/strict";
import { draftSources, stateSources } from "../src/lib/image-refs.ts";
import type { State } from "../src/lib/types.ts";

const state = (): State => ({
  categories: [{ id: "c1", name: "室外", code: "OUT" }],
  albums: [{ id: "a1", name: "精选", description: "", cardIds: ["k1"] }],
  cards: [
    {
      id: "k1",
      categoryId: "c1",
      code: "P-001",
      title: "回眸",
      tags: [],
      notes: { pose: "", camera: "", composition: "", light: "", cautions: "" },
      images: [
        { id: "i1", src: "/api/media/aaa", ai: false, notes: {} },
        { id: "i2", src: "/images/seed.png", ai: false, notes: {} },
      ],
    },
    {
      id: "k2",
      categoryId: "c1",
      code: "P-002",
      title: "已删除",
      tags: [],
      deleted: true,
      notes: { pose: "", camera: "", composition: "", light: "", cautions: "" },
      images: [
        { id: "i3", src: "/api/media/bbb", ai: false, notes: {} },
        { id: "i4", src: "/api/media/aaa", ai: false, notes: {} },
      ],
    },
  ],
});

test("收集所有卡片引用的图片，含回收站，去重", () => {
  assert.deepEqual([...stateSources(state())].sort(), [
    "/api/media/aaa",
    "/api/media/bbb",
    "/images/seed.png",
  ]);
});

test("草稿里引用的图片也算引用", () => {
  const drafts = [
    JSON.stringify({ images: [{ src: "/api/media/ccc" }] }),
    '{"src":"/api/media/aaa"}',
    "not json /api/media/ccc",
    "no images here",
  ];
  assert.deepEqual([...draftSources(drafts)].sort(), [
    "/api/media/aaa",
    "/api/media/ccc",
  ]);
});
