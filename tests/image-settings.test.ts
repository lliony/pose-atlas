import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMAGE_SETTINGS,
  parseImageSettings,
} from "../src/lib/image-settings.ts";

test("没有保存过时默认压缩", () => {
  assert.deepEqual(parseImageSettings(null), { keepOriginal: false });
  assert.deepEqual(DEFAULT_IMAGE_SETTINGS, { keepOriginal: false });
});

test("读取保留原图设置", () => {
  assert.deepEqual(parseImageSettings('{"keepOriginal":true}'), {
    keepOriginal: true,
  });
});

test("损坏或类型不对的值回退到默认值", () => {
  assert.deepEqual(parseImageSettings("not json"), { keepOriginal: false });
  assert.deepEqual(parseImageSettings('"yes"'), { keepOriginal: false });
  assert.deepEqual(parseImageSettings('{"keepOriginal":"yes"}'), {
    keepOriginal: false,
  });
  assert.deepEqual(parseImageSettings("{}"), { keepOriginal: false });
});
