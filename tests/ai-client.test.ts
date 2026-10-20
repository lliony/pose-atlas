import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getAiAvailability,
  testAiConfig,
  requestRecommendations,
} from "../src/services/ai.ts";
import type { AiRequest } from "../src/lib/ai-types.ts";
const config = {
  baseUrl: "https://example.com/v1",
  apiKey: "secret",
  model: "model",
};
const input: AiRequest = {
  mode: "scene",
  scope: { kind: "all" },
  description: "street",
  candidates: [],
  selection: { kind: "personal", config },
};
test("all client methods preserve cancellation while reading the response body", async (t) => {
  const calls = [
    (signal: AbortSignal) => getAiAvailability(signal),
    (signal: AbortSignal) => testAiConfig(config, signal),
    (signal: AbortSignal) => requestRecommendations(input, signal),
  ];
  for (const call of calls) {
    for (const abortSignal of [false, true]) {
      const controller = new AbortController();
      const failure = abortSignal
        ? new Error("body interrupted")
        : new DOMException("body aborted", "AbortError");
      t.mock.method(globalThis, "fetch", async () => ({
        status: 200,
        ok: true,
        json: async () => {
          if (abortSignal) controller.abort();
          throw failure;
        },
      }));
      await assert.rejects(
        call(controller.signal),
        (error: unknown) => error === failure,
      );
    }
  }
});
test("client sends exact same-origin routes, credentials, bodies and cancellation signals", async (t) => {
  const calls: [string, RequestInit | undefined][] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (path: string, options?: RequestInit) => {
      calls.push([path, options]);
      return Response.json(
        path.endsWith("config")
          ? { defaultAvailable: true }
          : path.endsWith("test")
            ? { ok: true }
            : { sceneSummary: "", recommendations: [] },
      );
    },
  );
  const signal = new AbortController().signal;
  assert.equal(await getAiAvailability(signal), true);
  await testAiConfig(config, signal);
  await requestRecommendations(input, signal);
  await requestRecommendations(
    { ...input, selection: { kind: "default" } },
    signal,
  );
  assert.deepEqual(
    calls.map(([path]) => path),
    [
      "/api/ai/config",
      "/api/ai/test",
      "/api/ai/recommend",
      "/api/ai/recommend",
    ],
  );
  for (const [, options] of calls) {
    assert.equal(options?.signal, signal);
    assert.equal(options?.credentials, "same-origin");
  }
  assert.deepEqual(JSON.parse(calls[1][1]!.body as string), config);
  assert.equal(calls[1][1]?.method, "POST");
  assert.deepEqual(JSON.parse(calls[2][1]!.body as string), input);
  assert.deepEqual(JSON.parse(calls[3][1]!.body as string).selection, {
    kind: "default",
  });
});
test("errors distinguish authorization, absent service, malformed JSON and availability failure", async (t) => {
  let response = Response.json(
    { error: "bad key", code: "AUTH" },
    { status: 401 },
  );
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(testAiConfig(config), /认证|密钥/);
  response = new Response("not found", { status: 404 });
  await assert.rejects(getAiAvailability(), /AI 服务不可用.*404/);
  response = new Response("<html>vite</html>");
  await assert.rejects(getAiAvailability(), /AI 服务不可用/);
  response = Response.json({});
  await assert.rejects(getAiAvailability(), /AI 服务不可用/);
  response = Response.json({ defaultAvailable: false });
  assert.equal(await getAiAvailability(), false);
});
test("network failures are readable, abort is preserved, and results are checked against submitted IDs", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(getAiAvailability(), /AI 服务不可用/);
  t.mock.method(globalThis, "fetch", async () => {
    throw new DOMException("aborted", "AbortError");
  });
  await assert.rejects(
    requestRecommendations(input, new AbortController().signal),
    { name: "AbortError" },
  );
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      sceneSummary: "scene",
      recommendations: [{ cardId: "invented", reason: "", adjustment: "" }],
    }),
  );
  await assert.rejects(
    requestRecommendations(input, new AbortController().signal),
    /有效候选/,
  );
});
