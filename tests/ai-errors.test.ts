import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAiFailure, AiError } from '../server/ai/errors.ts';

test('客户端取消（AbortError）返回 null，不下发任何错误', () => {
  const abort = new DOMException('cancelled', 'AbortError');
  assert.equal(classifyAiFailure(abort), null);
});

test('已知 AiError 被重建为固定消息，不让可变/篡改的 message 泄漏', () => {
  const error = new AiError('AUTH_FAILED');
  error.message = 'secret upstream key leaked';
  const safe = classifyAiFailure(error);
  assert.ok(safe instanceof AiError);
  assert.equal(safe.code, 'AUTH_FAILED');
  assert.equal(safe.status, 401);
  assert.equal(safe.message, new AiError('AUTH_FAILED').message);
});

test('未知错误一律归一到 UPSTREAM_FAILED，隐藏细节', () => {
  const safe = classifyAiFailure(new Error('connection reset by eyeball'));
  assert.ok(safe instanceof AiError);
  assert.equal(safe.code, 'UPSTREAM_FAILED');
  assert.equal(safe.status, 502);
  assert.equal(classifyAiFailure(undefined)!.code, 'UPSTREAM_FAILED');
  assert.equal(classifyAiFailure('not an error')!.code, 'UPSTREAM_FAILED');
});