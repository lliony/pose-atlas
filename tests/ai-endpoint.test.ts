import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import {
  isPublicAddress,
  parseEndpoint,
  resolveEndpoint,
} from "../server/ai/endpoint.ts";

test("rejects internal and special addresses including mapped IPv6", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "192.0.2.1",
    "2001:db8::1",
    "ff02::1",
    "4000::1",
    "garbage",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
    assert.equal(isPublicAddress(ip), true, ip);
});
test("normalizes HTTPS bases and rejects credentials/query/fragment", () => {
  for (const url of [
    "http://example.com/v1",
    "https://user:pass@example.com/v1",
    "https://example.com/v1?q=secret",
    "https://example.com/v1#part",
    "https://example.com/?",
    "https://example.com/#",
  ])
    assert.throws(() => parseEndpoint(url));
  assert.equal(
    parseEndpoint("https://example.com/v1/").pathname,
    "/v1/chat/completions",
  );
  assert.equal(
    parseEndpoint("https://example.com/v1/chat/completions").pathname,
    "/v1/chat/completions",
  );
});
test("rejects mixed DNS answers and returns verified address while preserving hostname", async (t) => {
  const lookup = t.mock.method(dns, "lookup", async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "10.0.0.1", family: 4 },
  ]);
  await assert.rejects(resolveEndpoint("https://example.com/v1"), {
    code: "UNSAFE_ENDPOINT",
  });
  lookup.mock.mockImplementation(async () => [
    { address: "2606:4700:4700::1111", family: 6 },
  ]);
  const result = await resolveEndpoint("https://example.com/v1");
  assert.equal(result.url.hostname, "example.com");
  assert.equal(result.family, 6);
  assert.equal(result.address, "2606:4700:4700::1111");
  lookup.mock.mockImplementation(async () => []);
  await assert.rejects(resolveEndpoint("https://example.com"), {
    code: "UNSAFE_ENDPOINT",
  });
  lookup.mock.mockImplementation(async () => {
    throw new Error("DNS secret");
  });
  await assert.rejects(resolveEndpoint("https://example.com"), {
    code: "UNSAFE_ENDPOINT",
  });
  await assert.rejects(resolveEndpoint("https://127.0.0.1"), {
    code: "UNSAFE_ENDPOINT",
  });
  assert.equal(
    (await resolveEndpoint("https://[2606:4700:4700::1111]")).family,
    6,
  );
});
