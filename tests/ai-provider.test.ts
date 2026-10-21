import { test, mock } from 'node:test';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { createProvider, type Transport } from '../server/ai/provider.ts';
import { AiError } from '../server/ai/errors.ts';
import type { AiRequest } from '../src/lib/ai-types.ts';

const config = { baseUrl: 'https://8.8.8.8/v1', apiKey: 'secret', model: 'vision' };
const input: AiRequest = { mode: 'scene', scope: { kind: 'all' }, description: 'window light', selection: { kind: 'default' }, candidates: [{ id: 'a', title: 'pose', category: 'portrait', tags: [], notes: { pose: '', camera: '', composition: '', light: '', cautions: '' }, imageNotes: [] }] };
const result = { sceneSummary: 'light', recommendations: [{ cardId: 'a', reason: 'fits', adjustment: 'turn' }] };
const reply = (content = JSON.stringify(result)) => JSON.stringify({ choices: [{ message: { content } }] });
function adapter(body = reply(), status = 200, capture?: (body: string) => void) {
  const transport: Transport = async (endpoint, payload) => { assert.equal(endpoint.address, '8.8.8.8'); capture?.(payload); return { status, body }; };
  return createProvider({ transport });
}
test('text protocol and candidate data; image is a data URL', async () => {
  let payload: any;
  const api = adapter(reply(), 200, body => { payload = JSON.parse(body); });
  assert.deepEqual(await api.recommend(config, input, new AbortController().signal), result);
  assert.equal(payload.model, 'vision');
  assert.match(payload.messages[0].content, /只能选择候选卡片/);
  assert.deepEqual(JSON.parse(payload.messages[1].content).candidates, input.candidates);
  await api.recommend(config, { ...input, image: { mime: 'image/jpeg', base64: 'YWJj' } }, new AbortController().signal);
  assert.equal(payload.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,YWJj');
});
test('connection probe excludes request data', async () => {
  await adapter(reply(), 200, body => { assert.ok(!body.includes('candidates')); assert.ok(!body.includes('image_url')); assert.ok(!body.includes('window light')); }).testConnection(config, new AbortController().signal);
});
for (const [label, body, status, code] of [
  ['redirect', '', 302, 'UPSTREAM_FAILED'], ['oversize', 'x'.repeat(1048577), 200, 'INVALID_RESPONSE'],
  ['rate limit', '', 429, 'RATE_LIMITED'], ['auth', '', 401, 'AUTH_FAILED'],
  ['missing choices', '{}', 200, 'INVALID_RESPONSE'], ['bad JSON', reply('hello {}'), 200, 'INVALID_RESPONSE'],
  ['unknown ID', reply(JSON.stringify({ ...result, recommendations: [{ ...result.recommendations[0], cardId: 'outside' }] })), 200, 'INVALID_RESPONSE'],
  ['model', JSON.stringify({ error: { code: 'model_not_found' } }), 404, 'MODEL_UNAVAILABLE'],
  ['image', JSON.stringify({ error: { code: 'unsupported_image' } }), 400, 'IMAGE_UNSUPPORTED'],
  ['invalid image', JSON.stringify({ error: { code: 'invalid_image' } }), 400, 'IMAGE_UNSUPPORTED'],
  ['invalid image format', JSON.stringify({ error: { code: 'invalid_image_format' } }), 400, 'IMAGE_UNSUPPORTED'],
  ['upstream HTTP 413', 'sensitive provider detail', 413, 'PAYLOAD_TOO_LARGE'],
  ['context length code', JSON.stringify({ error: { code: 'context_length_exceeded', message: 'sensitive provider detail' } }), 400, 'PAYLOAD_TOO_LARGE'],
  ['request size code', JSON.stringify({ error: { type: 'request_too_large', message: 'sensitive provider detail' } }), 400, 'PAYLOAD_TOO_LARGE'],
] as const) test(label, async () => { await assert.rejects(adapter(body, status).recommend(config, input, new AbortController().signal), { code }); });
test('size errors use fixed guidance without exposing upstream body', async () => {
  const body = JSON.stringify({ error: { code: 'context_length_exceeded', message: 'sensitive provider detail' } });
  await assert.rejects(adapter(body, 400).recommend(config, input, new AbortController().signal), error => {
    assert.ok(error instanceof AiError);
    assert.equal(error.code, 'PAYLOAD_TOO_LARGE');
    assert.match(error.message, /缩小范围/);
    assert.doesNotMatch(error.message, /sensitive provider detail/);
    return true;
  });
});
test('single wrapping JSON fence is accepted', async () => {
  assert.deepEqual(await adapter(reply('```json\n' + JSON.stringify(result) + '\n```')).recommend(config, input, new AbortController().signal), result);
});
test('timeout and cancellation settle even when transport ignores abort', async () => {
  const api = createProvider({ transport: () => new Promise(() => {}), timeoutMs: 10 });
  await assert.rejects(api.recommend(config, input, new AbortController().signal), { code: 'TIMEOUT' });
  const controller = new AbortController();
  const pending = api.testConnection(config, controller.signal); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
test('unsafe endpoints cannot be bypassed by injected transport', async () => {
  await assert.rejects(adapter().testConnection({ ...config, baseUrl: 'https://127.0.0.1' }, new AbortController().signal), { code: 'UNSAFE_ENDPOINT' });
});
test('total deadline and cancellation cover stalled DNS without starting HTTP', async () => {
  const lookup = mock.method(dns, 'lookup', () => new Promise(() => {}));
  let called = false;
  const api = createProvider({ timeoutMs: 10, transport: async () => { called = true; return { status: 200, body: reply() }; } });
  try {
    await assert.rejects(api.testConnection({ ...config, baseUrl: 'https://example.com' }, new AbortController().signal), { code: 'TIMEOUT' });
    const controller = new AbortController();
    const pending = api.testConnection({ ...config, baseUrl: 'https://example.com' }, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(called, false);
  } finally { lookup.mock.restore(); }
});
test('production HTTPS transport pins lookup, preserves hostname and caps streamed bytes', async () => {
  const lookup = mock.method(dns, 'lookup', async () => [{ address: '8.8.8.8', family: 4 }]);
  let oversized = false;
  let destroyed = false;
  const requestMock = mock.method(https, 'request', ((url: URL, options: any, callback: (response: any) => void) => {
    assert.equal(url.hostname, 'example.com');
    assert.equal(options.servername, 'example.com');
    assert.equal(options.family, 4);
    assert.equal(options.agent, false);
    assert.notEqual(options.rejectUnauthorized, false);
    options.lookup('example.com', {}, (error: unknown, address: string, family: number) => {
      assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
    });
    const request = new EventEmitter() as any;
    request.destroy = (error: Error) => { destroyed = true; request.emit('error', error); };
    request.end = () => queueMicrotask(() => {
      const response = new EventEmitter() as any; response.statusCode = 200; callback(response);
      if (oversized) { response.emit('data', Buffer.alloc(600000)); response.emit('data', Buffer.alloc(600000)); }
      else { response.emit('data', Buffer.from(reply())); response.emit('end'); }
    });
    return request;
  }) as typeof https.request);
  try {
    const api = createProvider();
    const hostnameConfig = { ...config, baseUrl: 'https://example.com/v1' };
    assert.deepEqual(await api.recommend(hostnameConfig, input, new AbortController().signal), result);
    oversized = true;
    await assert.rejects(api.recommend(hostnameConfig, input, new AbortController().signal), { code: 'INVALID_RESPONSE' });
    assert.equal(destroyed, true);
  } finally { requestMock.mock.restore(); lookup.mock.restore(); }
});
test('production HTTPS receives abort signal during an active request', async () => {
  let activeSignal: AbortSignal | undefined;
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const requestMock = mock.method(https, 'request', ((_url: URL, options: any) => {
    activeSignal = options.signal;
    const request = new EventEmitter() as any;
    request.end = () => ready();
    options.signal.addEventListener('abort', () => request.emit('error', new DOMException('Aborted', 'AbortError')), { once: true });
    return request;
  }) as typeof https.request);
  try {
    const controller = new AbortController();
    const pending = createProvider().testConnection(config, controller.signal);
    await started; controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(activeSignal?.aborted, true);
  } finally { requestMock.mock.restore(); }
});
