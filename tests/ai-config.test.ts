import { test } from "node:test";
import assert from "node:assert/strict";
import { createConfigStore } from "../src/services/ai-config.ts";

const config = {
  baseUrl: "https://example.com/v1",
  apiKey: "secret",
  model: "model",
};
function storage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
test("session config is copied and disappears when the store is recreated", () => {
  const disk = storage();
  const store = createConfigStore("a", disk);
  store.save(config, false);
  assert.equal(store.isRemembered(), false);
  assert.deepEqual(store.load(), config);
  store.load()!.apiKey = "changed";
  assert.equal(store.load()!.apiKey, "secret");
  assert.equal(createConfigStore("a", disk).load(), null);
});
test("remembered configs use a whitelist, are isolated, and are removed on opt out or clear", () => {
  const disk = storage();
  const store = createConfigStore("a", disk);
  store.save({ ...config, extra: "private" } as typeof config, true);
  assert.equal(store.isRemembered(), true);
  assert.deepEqual(JSON.parse(disk.map.get("pose-ai-config:a")!), config);
  const reopened = createConfigStore("a", disk);
  assert.deepEqual(reopened.load(), config);
  assert.equal(reopened.isRemembered(), true);
  reopened.save({ ...config, model: "updated" }, reopened.isRemembered());
  assert.equal(JSON.parse(disk.map.get("pose-ai-config:a")!).model, "updated");
  assert.equal(createConfigStore("b", disk).load(), null);
  store.save(config, false);
  assert.equal(store.isRemembered(), false);
  assert.equal(createConfigStore("a", disk).load(), null);
  store.save(config, true);
  store.clear();
  assert.equal(store.isRemembered(), false);
  assert.equal(store.load(), null);
  assert.equal(disk.map.size, 0);
});
test("corrupt and invalid stored configs are ignored", () => {
  const disk = storage();
  for (const value of [
    "{",
    "null",
    "{}",
    '{"baseUrl":2,"apiKey":"a","model":"b"}',
  ]) {
    disk.map.set("pose-ai-config:a", value);
    assert.equal(createConfigStore("a", disk).load(), null);
  }
});
test("storage failures are readable and preserve a usable session without claiming persistence", () => {
  const disk = storage();
  disk.setItem = () => {
    throw new Error("quota");
  };
  const store = createConfigStore("a", disk);
  assert.throws(() => store.save(config, true), /未能记住/);
  assert.deepEqual(store.load(), config);
  disk.removeItem = () => {
    throw new Error("denied");
  };
  assert.throws(() => store.save(config, false), /删除.*配置/);
  assert.throws(() => store.clear(), /删除.*配置/);
  disk.getItem = () => {
    throw new Error("denied");
  };
  assert.throws(() => createConfigStore("a", disk).load(), /读取.*配置/);
});
