import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { validateRequest } from "../server/ai/validation.ts";
import { AiError } from "../server/ai/errors.ts";

const notes = {
  pose: "pose",
  camera: "",
  composition: "",
  light: "",
  cautions: "",
};
const request = () => ({
  mode: "scene",
  scope: { kind: "all" },
  description: "scene",
  selection: { kind: "default" },
  candidates: [
    {
      id: "a",
      title: "A",
      category: "C",
      tags: ["tag"],
      notes: { ...notes },
      imageNotes: [{ index: 1, notes: { ...notes } }],
    },
  ],
});
test("reconstructs whitelist objects at every level", async () => {
  const raw = request();
  const result = await validateRequest({
    ...raw,
    apiKey: "secret",
    candidates: [
      {
        ...raw.candidates[0],
        privateNote: "secret",
        source: { url: "secret" },
        notes: { ...notes, secret: "secret" },
        imageNotes: [{ index: 1, notes, src: "binary" }],
      },
    ],
  });
  assert.deepEqual(result, raw);
});
test("validates enums, shape, uniqueness, input and field budgets", async () => {
  for (const patch of [
    { mode: "bad" },
    { scope: { kind: "album" } },
    {
      selection: {
        kind: "personal",
        config: { baseUrl: "https://example.com", apiKey: "", model: "m" },
      },
    },
    { description: "" },
    { description: "x".repeat(8001) },
    { candidates: [request().candidates[0], request().candidates[0]] },
    { candidates: [{ ...request().candidates[0], notes: {} }] },
    { candidates: [{ ...request().candidates[0], title: "x".repeat(120001) }] },
  ])
    await assert.rejects(validateRequest({ ...request(), ...patch }), AiError);
  for (const [key, length] of [
    ["baseUrl", 2049],
    ["apiKey", 4097],
    ["model", 257],
  ] as const)
    await assert.rejects(
      validateRequest({
        ...request(),
        selection: {
          kind: "personal",
          config: {
            baseUrl: "https://example.com",
            apiKey: "key",
            model: "m",
            [key]: "x".repeat(length),
          },
        },
      }),
      AiError,
    );
});
test("requires canonical bounded JPEG bytes and full decoding within dimensions", async () => {
  const jpeg = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  const valid = { mime: "image/jpeg", base64: jpeg.toString("base64") };
  assert.deepEqual(
    (await validateRequest({ ...request(), description: "", image: valid }))
      .image,
    valid,
  );
  const png = await sharp(jpeg).png().toBuffer();
  const large = await sharp({
    create: { width: 1601, height: 1, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  for (const image of [
    { ...valid, mime: "image/png" },
    { ...valid, base64: valid.base64 + "\n" },
    { ...valid, base64: "Zh==" },
    { ...valid, base64: png.toString("base64") },
    { ...valid, base64: jpeg.subarray(0, 100).toString("base64") },
    { ...valid, base64: large.toString("base64") },
    { ...valid, base64: Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64") },
  ])
    await assert.rejects(validateRequest({ ...request(), image }), AiError);
});
test("errors expose only fixed safe messages and status", () => {
  const error = new AiError("AUTH_FAILED");
  assert.equal(error.code, "AUTH_FAILED");
  assert.equal(error.status, 401);
  assert.match(error.message, /[\u4e00-\u9fff]/);
});
test("accepts complete personal settings and rejects aggregate candidate budget", async () => {
  const selection = {
    kind: "personal",
    config: {
      baseUrl: "https://example.com/v1",
      apiKey: "k".repeat(4096),
      model: "m".repeat(256),
    },
  };
  assert.deepEqual(
    (
      await validateRequest({
        ...request(),
        description: "x".repeat(8000),
        selection,
      })
    ).selection,
    selection,
  );
  await assert.rejects(
    validateRequest({
      ...request(),
      candidates: [
        {
          ...request().candidates[0],
          title: "x".repeat(65000),
          category: "y".repeat(65000),
        },
      ],
    }),
    { code: "PAYLOAD_TOO_LARGE" },
  );
  for (const value of [
    null,
    [],
    { ...request(), candidates: "bad" },
    {
      ...request(),
      candidates: [
        { ...request().candidates[0], imageNotes: [{ index: 0, notes }] },
      ],
    },
  ])
    await assert.rejects(validateRequest(value), { code: "INVALID_INPUT" });
});
