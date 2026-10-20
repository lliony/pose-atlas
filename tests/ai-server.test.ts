import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAiServer } from '../server/app.ts';
import { AiError } from '../server/ai/errors.ts';
import type { AiConfig } from '../src/lib/ai-types.ts';

const origin = 'http://127.0.0.1:5174';
const config: AiConfig = { baseUrl: 'https://example.com/v1', apiKey: 'secret', model: 'vision' };
const result = { sceneSummary: 'ok', recommendations: [] };
const input = { mode: 'scene', scope: { kind: 'all' }, description: 'window', candidates: [], selection: { kind: 'default' } };
async function fixture(overrides: Partial<Parameters<typeof createAiServer>[0]> = {}) {
  const server = createAiServer({ allowedOrigins: [origin], recommend: async () => result, testConnection: async () => {}, ...overrides });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as import('node:net').AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;
  return { server, url, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }), post: (path: string, body: unknown, headers = {}) => fetch(url + path, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }) };
}

test('config endpoint exposes only availability', async () => {
  for (const defaultConfig of [undefined, config]) {
    const f = await fixture({ defaultConfig });
    try { assert.deepEqual(await (await fetch(f.url + '/api/ai/config')).json(), { defaultAvailable: !!defaultConfig }); } finally { await f.close(); }
  }
});
test('personal selection wins and failure never falls back', async () => {
  const calls: AiConfig[] = [];
  const f = await fixture({ defaultConfig: config, recommend: async c => { calls.push(c); throw new AiError('AUTH_FAILED'); } });
  try {
    const personal = { ...config, apiKey: 'personal' };
    const response = await f.post('/api/ai/recommend', { ...input, selection: { kind: 'personal', config: personal } });
    assert.equal(response.status, 401); assert.deepEqual(calls, [personal]);
  } finally { await f.close(); }
});
test('default missing and valid default recommendation', async () => {
  for (const defaultConfig of [undefined, config]) {
    const f = await fixture({ defaultConfig });
    try { const r = await f.post('/api/ai/recommend', input); assert.equal(r.status, defaultConfig ? 200 : 400); assert.deepEqual(await r.json(), defaultConfig ? result : { error: new AiError('NOT_CONFIGURED').message, code: 'NOT_CONFIGURED' }); } finally { await f.close(); }
  }
});
test('test accepts config directly; errors are sanitized', async () => {
  let received: AiConfig | undefined;
  const f = await fixture({ testConnection: async c => { received = c; throw new Error('secret provider body'); } });
  try { const r = await f.post('/api/ai/test', config); assert.deepEqual(received, config); assert.equal(r.status, 502); assert.equal((await r.json()).code, 'UPSTREAM_FAILED'); } finally { await f.close(); }
});
test('known error messages are sanitized and failures release slots', async () => {
  const f = await fixture({ testConnection: async () => { const error = new AiError('AUTH_FAILED'); error.message = 'secret key'; throw error; } });
  try { for (let i = 0; i < 3; i++) { const r = await f.post('/api/ai/test', config); assert.equal(r.status, 401); assert.deepEqual(await r.json(), { error: new AiError('AUTH_FAILED').message, code: 'AUTH_FAILED' }); } } finally { await f.close(); }
});
test('proxy frontend Host is accepted and invalid config is rejected', async () => {
  const f = await fixture({ defaultConfig: { ...config, model: '' } });
  try {
    assert.deepEqual(await (await fetch(f.url + '/api/ai/config')).json(), { defaultAvailable: false });
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = http.request(f.url + '/api/ai/test', { method: 'POST', headers: { host: '127.0.0.1:5174', origin, 'content-type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(JSON.stringify(config));
    });
    assert.equal(status, 200);
    assert.equal((await f.post('/api/ai/test', { ...config, baseUrl: 'http://localhost/v1' })).status, 400);
    assert.equal((await f.post('/api/ai/recommend', {})).status, 400);
  } finally { await f.close(); }
});
test('reject bad origin, host, content type and oversized body', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.post('/api/ai/test', config, { origin: 'https://evil.example' })).status, 403);
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = http.request(f.url + '/api/ai/test', { method: 'POST', headers: { host: 'evil.example', origin, 'content-type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end(JSON.stringify(config));
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await f.post('/api/ai/test', config, { 'content-type': 'text/plain' })).status, 415);
    assert.equal((await fetch(f.url + '/api/ai/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await f.post('/api/ai/test', 'x'.repeat(4 * 1024 * 1024))).status, 413);
  } finally { await f.close(); }
});
test('rate limits to 30 upstream calls per minute', async () => {
  const f = await fixture();
  try { for (let i = 0; i < 30; i++) assert.equal((await f.post('/api/ai/test', config)).status, 200); assert.equal((await f.post('/api/ai/test', config)).status, 429); } finally { await f.close(); }
});
test('concurrency and disconnect cancellation release upstream slots', async () => {
  const waitUntil = async (predicate: () => boolean) => {
    const deadline = Date.now() + 2000;
    while (!predicate()) {
      if (Date.now() >= deadline) assert.fail('timed out waiting for upstream request state');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  };
  const signals: AbortSignal[] = [];
  const finishes: (() => void)[] = [];
  const f = await fixture({ testConnection: async (_c, signal) => { signals.push(signal); await new Promise<void>(resolve => { finishes.push(resolve); signal.addEventListener('abort', () => resolve(), { once: true }); }); } });
  try {
    const open = () => { const req = http.request(f.url + '/api/ai/test', { method: 'POST', headers: { origin, 'content-type': 'application/json' } }); req.on('error', () => {}); req.end(JSON.stringify(config)); return req; };
    const a = open(), b = open();
    await waitUntil(() => signals.length >= 2);
    assert.equal(signals[0].aborted, false);
    assert.equal((await f.post('/api/ai/test', config)).status, 429);
    a.destroy();
    await waitUntil(() => signals[0].aborted);
    await new Promise(resolve => setTimeout(resolve, 10));
    const c = open(); await waitUntil(() => signals.length >= 3);
    b.destroy(); c.destroy(); finishes.forEach(fn => fn());
  } finally { finishes.forEach(fn => fn()); await f.close(); }
});
