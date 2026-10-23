import test from "node:test";
import assert from "node:assert/strict";
import {
  compressStoredImages,
  measureUsage,
  noteFreshImage,
  pruneUnreferencedImages,
} from "../src/services/image-store.ts";

type Store = {
  keys(name: string): Promise<string[]>;
  read<T>(name: string, key: string): Promise<T | undefined>;
  write(name: string, key: string, value: unknown): Promise<void>;
  remove(name: string, key: string): Promise<void>;
};

function memStore(entries: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    keys: async () => [...data.keys()],
    read: async <T>(_name: string, key: string) =>
      data.get(key) as T | undefined,
    write: async (_name: string, key: string, value: unknown) => {
      data.set(key, value as Blob);
    },
    remove: async (_name: string, key: string) => {
      data.delete(key);
    },
  };
}

/** 大于 1MB 的图当作 4000×3000 的大图，其余当作 1200×900 的小图。 */
function stubBrowser() {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: "", fillRect() {}, drawImage() {} }),
    toBlob(callback: BlobCallback, type: string) {
      callback(new Blob([new Uint8Array(50_000)], { type }));
    },
  };
  globalThis.createImageBitmap = (async (file: File) => ({
    width: file.size > 1_000_000 ? 4000 : 1200,
    height: file.size > 1_000_000 ? 3000 : 900,
    close() {},
  })) as unknown as typeof createImageBitmap;
  globalThis.document = {
    createElement: () => canvas,
  } as unknown as Document;
  return {
    restore() {
      globalThis.createImageBitmap = previousBitmap;
      globalThis.document = previousDocument;
    },
  };
}

test("只压缩上传来源的大图，小图和种子图保持原样", async () => {
  const browser = stubBrowser();
  try {
    const big = new Blob([new Uint8Array(2_000_000)], { type: "image/jpeg" });
    const small = new Blob([new Uint8Array(200_000)], { type: "image/jpeg" });
    const seed = new Blob([new Uint8Array(2_000_000)], { type: "image/png" });
    const store = memStore({
      "/api/media/big": big,
      "/api/media/small": small,
      "/images/seed.png": seed,
    });
    const result = await compressStoredImages(store);
    assert.deepEqual(result, {
      compressed: 1,
      skipped: 1,
      failed: 0,
      savedBytes: 1_950_000,
    });
    assert.equal((store.data.get("/api/media/big") as Blob).size, 50_000);
    assert.equal(store.data.get("/api/media/small"), small);
    assert.equal(store.data.get("/images/seed.png"), seed);
  } finally {
    browser.restore();
  }
});

test("单张读取失败不影响其余图片", async () => {
  const browser = stubBrowser();
  try {
    const store = memStore({
      "/api/media/bad": new Blob([new Uint8Array(10)], { type: "image/jpeg" }),
      "/api/media/good": new Blob([new Uint8Array(2_000_000)], {
        type: "image/jpeg",
      }),
    });
    const read = store.read;
    store.read = (async (name: string, key: string) => {
      if (key === "/api/media/bad") throw Error("broken");
      return read(name, key);
    }) as typeof store.read;
    const result = await compressStoredImages(store);
    assert.equal(result.compressed, 1);
    assert.equal(result.failed, 1);
    assert.equal((store.data.get("/api/media/good") as Blob).size, 50_000);
  } finally {
    browser.restore();
  }
});

test("清理没有卡片引用的图片，返回删除数量与释放空间", async () => {
  const store = memStore({
    "/api/media/a": new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
    "/api/media/b": new Blob([new Uint8Array(300)], { type: "image/jpeg" }),
    "/api/media/c": new Blob([new Uint8Array(500)], { type: "image/jpeg" }),
    "/images/seed.png": new Blob([new Uint8Array(900)], { type: "image/png" }),
  });
  const result = await pruneUnreferencedImages(["/api/media/a"], store);
  assert.deepEqual(result, { removed: 2, savedBytes: 800 });
  assert.deepEqual([...store.data.keys()].sort(), [
    "/api/media/a",
    "/images/seed.png",
  ]);
});

test("刚上传还没入卡的图片不会被清理", async () => {
  const store = memStore({
    "/api/media/fresh": new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
    "/api/media/old": new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
  });
  noteFreshImage("/api/media/fresh");
  const result = await pruneUnreferencedImages([], store);
  assert.deepEqual(result, { removed: 1, savedBytes: 100 });
  assert.ok(store.data.has("/api/media/fresh"));
});

test("统计图片与资料占用", async () => {
  const store = memStore({
    "/api/media/a": new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
    "/api/media/b": new Blob([new Uint8Array(300)], { type: "image/jpeg" }),
    main: { state: { cards: [] }, revision: 3 },
  });
  const usage = await measureUsage(store);
  assert.equal(usage.images, 400);
  assert.ok(usage.data > 0);
});
