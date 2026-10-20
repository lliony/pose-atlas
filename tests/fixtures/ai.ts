import type { State } from "../../src/lib/types.ts";

export function sample(): State {
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
