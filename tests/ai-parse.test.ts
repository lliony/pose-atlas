import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson } from "../server/ai/model-parse.ts";

test("纯 JSON 原样通过，并去掉首尾空白", () => {
  assert.equal(extractJson('{"a":1}'), '{"a":1}');
  assert.equal(extractJson('  [1, 2, 3]  '), '[1, 2, 3]');
});

test("整段被单个代码块包裹时抽取其中 JSON", () => {
  assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJson('```\n{"a":1}\n```'), '{"a":1}');
});

test("代码块前后夹着自然语言也能抽取（旧实现会失败）", () => {
  assert.equal(
    extractJson('Here you go:\n```json\n{"a":1}\n```\nHope this helps'),
    '{"a":1}',
  );
});

test("多个代码块时取第一个", () => {
  assert.equal(
    extractJson('```json\n{"a":1}\n```\nthen\n```\n{"b":2}\n```'),
    '{"a":1}',
  );
});