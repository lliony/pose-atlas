import test from "node:test";
import assert from "node:assert/strict";
import { createProvider } from "../server/ai/provider.ts";
import { normalizeDraft } from "../server/ai/model-parse.ts";

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

test("超长文本按打印上限截断：标题 28、标签 4×12、笔记 80", () => {
  const draft = normalizeDraft({
    title: "标".repeat(200),
    tags: Array.from({ length: 20 }, (_, i) => `标签${i}`),
    notes: { pose: "动".repeat(500) },
  });
  assert.equal(draft.title.length, 28);
  assert.equal(draft.tags.length, 4);
  assert.equal(draft.tags[0].length, 3);
  assert.equal(draft.notes.pose.length, 80);
});

test("draft 把分类、标题与图片一起发给模型，并解析出卡片内容", async () => {
  let payload: {
    messages: { role: string; content: unknown }[];
  } | null = null;
  const provider = createProvider({
    transport: async (_endpoint, body) => {
      payload = JSON.parse(body);
      return {
        status: 200,
        body: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "窗边侧坐",
                  tags: ["咖啡馆"],
                  gender: "女性",
                  styles: ["优雅"],
                  notes: { pose: "侧坐，手放膝上", camera: "35mm 平视" },
                }),
              },
            },
          ],
        }),
      };
    },
  });
  const result = await provider.draft(
    { baseUrl: "https://8.8.8.8/v1", apiKey: "secret", model: "vision" },
    {
      selection: { kind: "default" },
      category: "咖啡馆",
      title: "窗边",
      image: { mime: "image/jpeg", base64: "AAAA" },
    },
    new AbortController().signal,
  );
  assert.equal(result.title, "窗边侧坐");
  assert.equal(result.notes.pose, "侧坐，手放膝上");
  assert.deepEqual(result.styles, ["优雅"]);

  const system = String(payload!.messages[0].content);
  assert.match(system, /28/);
  assert.match(system, /80/);
  assert.match(system, /甜美/);

  const user = payload!.messages[1].content as {
    type: string;
    text?: string;
    image_url?: { url: string };
  }[];
  assert.deepEqual(JSON.parse(user[0].text!), {
    category: "咖啡馆",
    title: "窗边",
  });
  assert.ok(user[1].image_url!.url.startsWith("data:image/jpeg;base64,"));
});

test("没有图片时 draft 只发文字", async () => {
  let payload: { messages: { content: unknown }[] } | null = null;
  const provider = createProvider({
    transport: async (_endpoint, body) => {
      payload = JSON.parse(body);
      return {
        status: 200,
        body: JSON.stringify({
          choices: [{ message: { content: '{"title":"只靠标题"}' } }],
        }),
      };
    },
  });
  const result = await provider.draft(
    { baseUrl: "https://8.8.8.8/v1", apiKey: "secret", model: "text" },
    { selection: { kind: "default" }, title: "只靠标题" },
    new AbortController().signal,
  );
  assert.equal(result.title, "只靠标题");
  assert.equal(typeof payload!.messages[1].content, "string");
});