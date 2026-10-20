import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTheme,
  readThemeFromQuery,
  resolveTheme,
} from "../src/lib/theme.ts";

test("normalizeTheme 只接受三种已知主题", () => {
  assert.equal(normalizeTheme("paper"), "paper");
  assert.equal(normalizeTheme("white"), "white");
  assert.equal(normalizeTheme("dark"), "dark");
  assert.equal(normalizeTheme("green"), null);
  assert.equal(normalizeTheme(""), null);
  assert.equal(normalizeTheme(null), null);
  assert.equal(normalizeTheme(undefined), null);
  assert.equal(normalizeTheme(42), null);
});

test("没有保存值时跟随系统深浅色", () => {
  assert.equal(resolveTheme(null, true), "dark");
  assert.equal(resolveTheme(null, false), "paper");
  assert.equal(resolveTheme(undefined, false), "paper");
  assert.equal(resolveTheme("", true), "dark");
});

test("脏数据不生效，回落到系统偏好", () => {
  assert.equal(resolveTheme("green", true), "dark");
  assert.equal(resolveTheme("green", false), "paper");
});

test("已保存的选择优先于系统设置", () => {
  assert.equal(resolveTheme("white", true), "white");
  assert.equal(resolveTheme("paper", true), "paper");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("?theme= 只接受已知主题", () => {
  assert.equal(readThemeFromQuery("?theme=dark"), "dark");
  assert.equal(readThemeFromQuery("?theme=white&from=share"), "white");
  assert.equal(readThemeFromQuery(""), null);
  assert.equal(readThemeFromQuery("?theme=blue"), null);
});
