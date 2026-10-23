import test from "node:test";
import assert from "node:assert/strict";
import { cropToRatio } from "../src/lib/image-ratio.ts";
import { IMAGE_MAX_EDGE } from "../src/lib/image-compression.ts";

type Draw = { source: number[]; target: number[] };

function stubImage(
  size: { width: number; height: number } | null,
  draw: Draw,
  quality: number[],
) {
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  class FakeImage {
    naturalWidth = 0;
    naturalHeight = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      if (!size) {
        this.onerror?.();
        return;
      }
      this.naturalWidth = size.width;
      this.naturalHeight = size.height;
      queueMicrotask(() => this.onload?.());
    }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage(
        _image: unknown,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ) {
        draw.source = [sx, sy, sw, sh];
        draw.target = [dx, dy, dw, dh];
      },
    }),
    toBlob(callback: BlobCallback, type: string, value: number) {
      quality.push(value);
      callback(new Blob([new Uint8Array(20_000)], { type }));
    },
  };
  globalThis.Image = FakeImage as unknown as typeof Image;
  globalThis.document = {
    createElement: () => canvas,
  } as unknown as Document;
  return {
    restore() {
      globalThis.Image = previousImage;
      globalThis.document = previousDocument;
    },
  };
}

test("裁切后长边仍受上限约束，返回实际尺寸", async () => {
  const draw: Draw = { source: [], target: [] };
  const quality: number[] = [];
  const browser = stubImage({ width: 4000, height: 3000 }, draw, quality);
  try {
    const result = await cropToRatio("blob:test", "1:1");
    assert.ok(result);
    assert.deepEqual(result.size, { w: IMAGE_MAX_EDGE, h: IMAGE_MAX_EDGE });
    assert.deepEqual(draw.source, [500, 0, 3000, 3000]);
    assert.deepEqual(draw.target, [0, 0, IMAGE_MAX_EDGE, IMAGE_MAX_EDGE]);
    assert.deepEqual(quality, [0.85]);
    assert.equal(result.file.type, "image/jpeg");
  } finally {
    browser.restore();
  }
});

test("传入 null 时不缩放，保留裁切后的原始像素", async () => {
  const draw: Draw = { source: [], target: [] };
  const quality: number[] = [];
  const browser = stubImage({ width: 4000, height: 3000 }, draw, quality);
  try {
    const result = await cropToRatio("blob:test", "1:1", null);
    assert.ok(result);
    assert.deepEqual(result.size, { w: 3000, h: 3000 });
    assert.deepEqual(draw.target, [0, 0, 3000, 3000]);
  } finally {
    browser.restore();
  }
});

test("图片解码失败时返回 null", async () => {
  const draw: Draw = { source: [], target: [] };
  const browser = stubImage(null, draw, []);
  try {
    assert.equal(await cropToRatio("blob:broken", "3:4"), null);
  } finally {
    browser.restore();
  }
});
