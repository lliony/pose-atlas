import { test } from "node:test";
import assert from "node:assert/strict";
import { dataUrlToBlob } from "../src/lib/data-url.ts";

test("把 dataURL 解码成同字节、同类型的 Blob（不经由 fetch）", async () => {
  // "/9j/4AAQ" 解码成 6 字节的 JPEG 头。
  const blob = dataUrlToBlob("data:image/jpeg;base64,/9j/4AAQ");
  assert.equal(blob.type, "image/jpeg");
  assert.equal(blob.size, 6);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes], [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
});

test("缺少明确类型的 dataURL 回落到通用类型", () => {
  const blob = dataUrlToBlob("data:;base64,aGk=");
  assert.equal(blob.type, "application/octet-stream");
  assert.equal(blob.size, 2);
});

test("非 dataURL 文本也按 raw base64 处理", () => {
  const blob = dataUrlToBlob("aGVsbG8=");
  assert.equal(blob.size, 5);
});