import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_CARD_IMAGES, canAddImages, slotsLeft } from "../src/lib/card-image-count.ts";

test("canAddImages 在容量内为真、越界为假", () => {
  assert.equal(canAddImages(0, 20), true);
  assert.equal(canAddImages(20, 0), true);
  assert.equal(canAddImages(19, 2), false); // 20+1 越界
  assert.equal(canAddImages(20, 1), false);
});

test("slotsLeft 给出还能加几张", () => {
  assert.equal(slotsLeft(0), 20);
  assert.equal(slotsLeft(18), 2);
  assert.equal(slotsLeft(20), 0);
  assert.equal(slotsLeft(MAX_CARD_IMAGES + 3), 0); // 异常多也不会负
});