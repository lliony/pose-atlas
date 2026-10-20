import test from "node:test";
import assert from "node:assert/strict";
import { prepareAiImage } from "../src/services/ai-image.ts";

test("rejects unsupported MIME types and oversized originals before decoding", async () => {
  await assert.rejects(
    prepareAiImage(new File(["gif"], "x.gif", { type: "image/gif" })),
    /JPEG.*PNG.*WebP/,
  );
  await assert.rejects(
    prepareAiImage(
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.png", {
        type: "image/png",
      }),
    ),
    /10 MiB/,
  );
});

test("rejects spoofed supported MIME before browser decoding", async () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    await assert.rejects(
      prepareAiImage(new File(["GIF89a pretend image"], "x", { type })),
      /文件内容/,
    );
  }
});

test("compression scales proportionally, paints white, retries qualities and closes bitmap", async () => {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  let closed = false;
  const qualities: number[] = [];
  const sizes: number[][] = [];
  let white = false;
  const context = {
    fillStyle: "",
    fillRect() {
      white = this.fillStyle === "#ffffff";
    },
    drawImage() {
      assert.equal(white, true);
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob(callback: BlobCallback, type: string, quality: number) {
      qualities.push(quality);
      sizes.push([this.width, this.height]);
      callback(
        new Blob(
          [new Uint8Array(qualities.length < 4 ? 2 * 1024 * 1024 + 1 : 5)],
          { type },
        ),
      );
    },
  };
  globalThis.createImageBitmap = (async () => ({
    width: 3200,
    height: 1600,
    close() {
      closed = true;
    },
  })) as typeof createImageBitmap;
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  try {
    const image = await prepareAiImage(
      new File([new Uint8Array([255, 216, 255])], "x.jpg", {
        type: "image/jpeg",
      }),
    );
    assert.equal(image.mime, "image/jpeg");
    assert.equal(atob(image.base64).length, 5);
    assert.deepEqual(qualities, [0.85, 0.7, 0.55, 0.85]);
    assert.deepEqual(sizes, [
      [1600, 800],
      [1600, 800],
      [1600, 800],
      [800, 400],
    ]);
    assert.equal(closed, true);
    assert.equal(canvas.width, 0);
  } finally {
    globalThis.createImageBitmap = previousBitmap;
    globalThis.document = previousDocument;
  }
});
