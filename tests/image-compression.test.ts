import test from "node:test";
import assert from "node:assert/strict";
import {
  IMAGE_MAX_EDGE,
  fitWithin,
  prepareUpload,
  uploadPlan,
} from "../src/lib/image-compression.ts";

test("长边压到上限，比例保持不变", () => {
  assert.deepEqual(fitWithin(4000, 3000, 2048), { width: 2048, height: 1536 });
  assert.deepEqual(fitWithin(3000, 4000, 2048), { width: 1536, height: 2048 });
});

test("长边换算后四舍五入，短边至少 1px", () => {
  assert.deepEqual(fitWithin(3000, 1000, 2048), { width: 2048, height: 683 });
  assert.deepEqual(fitWithin(10000, 1, 2048), { width: 2048, height: 1 });
});

test("小图不放大", () => {
  assert.deepEqual(fitWithin(1200, 900, 2048), { width: 1200, height: 900 });
  assert.deepEqual(fitWithin(1, 1, 2048), { width: 1, height: 1 });
});

test("尺寸无效时报错", () => {
  assert.throws(() => fitWithin(0, 100, 2048), /尺寸/);
  assert.throws(() => fitWithin(100, -1, 2048), /尺寸/);
});

test("已够小的 JPEG 保持原样", () => {
  assert.deepEqual(
    uploadPlan({ width: 1200, height: 900, size: 300_000, type: "image/jpeg" }),
    { width: 1200, height: 900, reencode: false },
  );
});

test("超长边的 JPEG 需要重编码", () => {
  assert.deepEqual(
    uploadPlan({ width: 4032, height: 3024, size: 4_000_000, type: "image/jpeg" }),
    { width: 2048, height: 1536, reencode: true },
  );
});

test("PNG 即使尺寸很小也转成 JPEG", () => {
  assert.deepEqual(
    uploadPlan({ width: 800, height: 600, size: 100_000, type: "image/png" }),
    { width: 800, height: 600, reencode: true },
  );
});

test("尺寸够小但体积大的 JPEG 仍要重编码", () => {
  assert.deepEqual(
    uploadPlan({ width: 1600, height: 1200, size: 2_400_000, type: "image/jpeg" }),
    { width: 1600, height: 1200, reencode: true },
  );
});

type StubCanvas = {
  width: number;
  height: number;
  getContext: () => unknown;
  toBlob: (callback: BlobCallback, type: string, quality: number) => void;
};

function stubBrowser(size: { width: number; height: number }) {
  const state = {
    canvas: null as StubCanvas | null,
    qualities: [] as number[],
    closed: false,
    white: false,
  };
  const context = {
    fillStyle: "",
    fillRect() {
      state.white = this.fillStyle === "#ffffff";
    },
    drawImage() {
      assert.equal(state.white, true, "先铺白底再画图");
    },
  };
  const canvas: StubCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback: BlobCallback, type: string, quality: number) {
      state.qualities.push(quality);
      callback(new Blob([new Uint8Array(50_000)], { type }));
    },
  };
  state.canvas = canvas;
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  globalThis.createImageBitmap = (async () => ({
    width: size.width,
    height: size.height,
    close() {
      state.closed = true;
    },
  })) as unknown as typeof createImageBitmap;
  globalThis.document = {
    createElement: (tag: string) => {
      assert.equal(tag, "canvas");
      return canvas;
    },
  } as unknown as Document;
  return {
    state,
    restore() {
      globalThis.createImageBitmap = previousBitmap;
      globalThis.document = previousDocument;
    },
  };
}

test("大图按上限重编码成 JPEG，并释放位图", async () => {
  const browser = stubBrowser({ width: 4032, height: 3024 });
  try {
    const file = await prepareUpload(
      new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", {
        type: "image/jpeg",
      }),
    );
    assert.equal(file.type, "image/jpeg");
    assert.equal(file.size, 50_000);
    assert.deepEqual(
      [browser.state.canvas?.width, browser.state.canvas?.height],
      [IMAGE_MAX_EDGE, 1536],
    );
    assert.deepEqual(browser.state.qualities, [0.85]);
    assert.equal(browser.state.closed, true);
  } finally {
    browser.restore();
  }
});

test("小 JPEG 不经过画布，原样返回", async () => {
  const browser = stubBrowser({ width: 1200, height: 900 });
  try {
    const file = new File([new Uint8Array(1_000)], "a.jpg", {
      type: "image/jpeg",
    });
    const result = await prepareUpload(file);
    assert.equal(result, file);
    assert.equal(browser.state.qualities.length, 0);
    assert.equal(browser.state.closed, true);
  } finally {
    browser.restore();
  }
});

test("保留原图时不压缩，即使超过上限", async () => {
  const browser = stubBrowser({ width: 4032, height: 3024 });
  try {
    const file = new File([new Uint8Array(5_000_000)], "a.jpg", {
      type: "image/jpeg",
    });
    const result = await prepareUpload(file, { keepOriginal: true });
    assert.equal(result, file);
    assert.equal(browser.state.qualities.length, 0);
  } finally {
    browser.restore();
  }
});

test("无法解码的图片报可读错误", async () => {
  const previousBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = (async () => {
    throw new Error("bad");
  }) as unknown as typeof createImageBitmap;
  try {
    await assert.rejects(
      prepareUpload(
        new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }),
      ),
      /无法读取图片/,
    );
  } finally {
    globalThis.createImageBitmap = previousBitmap;
  }
});
