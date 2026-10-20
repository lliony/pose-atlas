import { test } from "node:test";
import assert from "node:assert/strict";
import { validPersonalConfig } from "../src/lib/ai-ui.ts";
test("personal configuration requires complete HTTPS credentials", () => {
  assert.equal(validPersonalConfig(null), false);
  for (const baseUrl of [
    "",
    "http://example.com",
    "invalid",
    "https://user:pass@example.com",
  ]) {
    assert.equal(
      validPersonalConfig({ baseUrl, apiKey: "key", model: "model" }),
      false,
    );
  }
  assert.equal(
    validPersonalConfig({
      baseUrl: "https://example.com/v1",
      apiKey: " ",
      model: "m",
    }),
    false,
  );
  assert.equal(
    validPersonalConfig({
      baseUrl: "https://example.com/v1",
      apiKey: "key",
      model: "m",
    }),
    true,
  );
});
