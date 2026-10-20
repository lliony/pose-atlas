import test from "node:test";
import assert from "node:assert/strict";
import { createRequestSession } from "../src/lib/ai-request-session.ts";

test("a new request aborts the previous request and rejects stale responses", () => {
  const session = createRequestSession();
  const first = session.begin();
  const second = session.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(session.isCurrent(first.id), false);
  assert.equal(session.isCurrent(second.id), true);
  session.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(session.isCurrent(second.id), false);
});

test("cancel is idempotent and generations never reuse cancelled IDs", () => {
  const session = createRequestSession();
  assert.equal(session.isCurrent(0), false);
  session.cancel();
  const first = session.begin();
  session.cancel();
  session.cancel();
  const second = session.begin();
  assert.ok(second.id > first.id);
  assert.equal(second.signal.aborted, false);
  assert.equal(session.isCurrent(first.id), false);
});
