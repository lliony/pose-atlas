import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiConfig, AiRequest } from '../src/lib/ai-types.ts';
import { createConfigStore } from '../src/services/ai-config.ts';
import { validatePersonalConfig } from '../server/ai/validation.ts';
import { parseEndpoint } from '../server/ai/endpoint.ts';
import { authHeaders, responseText } from '../server/ai/protocol.ts';
import { createProvider } from '../server/ai/provider.ts';

const config: AiConfig = { protocol: 'anthropic', baseUrl: 'https://8.8.8.8/v1', apiKey: 'test-key', model: 'test-model' };
const signal = () => new AbortController().signal;
const reply = (text: string) => JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn' });

test('protocol survives validation, persistence and separate feature selection; legacy stays compatible', () => {
  assert.deepEqual(validatePersonalConfig(config), config);
  assert.throws(() => validatePersonalConfig({ ...config, protocol: 'unknown' }), { code: 'INVALID_INPUT' });
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
  const store = createConfigStore('protocol-test', storage);
  store.saveProfile({ ...config, id: 'claude', name: 'Claude' }, true);
  const { protocol: _protocol, ...legacy } = config;
  store.saveProfile({ ...legacy, id: 'old', name: 'Old config' }, true);
  store.setUseFor('draft', 'old');
  const reopened = createConfigStore('protocol-test', storage);
  assert.equal(reopened.useFor('recommend')?.protocol, 'anthropic');
  assert.equal(reopened.useFor('draft')?.protocol, undefined);
  assert.deepEqual(authHeaders(legacy), { authorization: 'Bearer test-key' });
  assert.deepEqual(authHeaders(config), { 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01' });
});

test('Anthropic endpoints accept base URLs and full paths without duplication', () => {
  for (const base of ['https://example.com', 'https://example.com/v1', 'https://example.com/v1/messages/'])
    assert.equal(parseEndpoint(base, 'anthropic').pathname, '/v1/messages');
  assert.equal(parseEndpoint('https://example.com/proxy/v1', 'anthropic').pathname, '/proxy/v1/messages');
});

test('Anthropic recommendation uses system field, base64 images and validated response IDs', async () => {
  const result = { sceneSummary: '光线', recommendations: [{ cardId: 'a', reason: '适合', adjustment: '转身' }] };
  const input: AiRequest = { mode: 'scene', scope: { kind: 'all' }, description: '窗边', selection: { kind: 'personal', config }, image: { mime: 'image/jpeg', base64: 'YWJj' }, candidates: [{ id: 'a', title: '站姿', category: '', tags: [], notes: { pose: '', camera: '', composition: '', light: '', cautions: '' }, imageNotes: [] }] };
  const api = createProvider({ transport: async (endpoint, body) => {
    assert.equal(endpoint.url.pathname, '/v1/messages');
    assert.equal(endpoint.address, '8.8.8.8');
    const payload = JSON.parse(body);
    assert.match(payload.system, /只能选择候选卡片/);
    assert.equal(payload.max_tokens, 4096);
    assert.equal(payload.messages.length, 1);
    assert.equal(payload.messages[0].role, 'user');
    assert.deepEqual(payload.messages[0].content[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'YWJj' } });
    return { status: 200, body: reply(JSON.stringify(result)) };
  } });
  assert.deepEqual(await api.recommend(config, input, signal()), result);
  result.recommendations[0].cardId = 'outside';
  await assert.rejects(api.recommend(config, input, signal()), { code: 'INVALID_RESPONSE' });
});

test('Anthropic draft and text connection test use the selected protocol', async () => {
  const notes = { pose: '侧身', camera: '平视', composition: '留白', light: '侧光', cautions: '避开杂物' };
  const api = createProvider({ transport: async (_endpoint, body) => {
    const payload = JSON.parse(body);
    if (!payload.system) {
      assert.deepEqual(payload.messages, [{ role: 'user', content: 'Reply with OK.' }]);
      return { status: 200, body: reply('OK') };
    }
    assert.match(payload.system, /卡片写作助手/);
    return { status: 200, body: reply(JSON.stringify({ title: '窗边', tags: ['室内'], styles: ['自然'], notes })) };
  } });
  await api.testConnection(config, signal());
  const draft = await api.draft(config, { title: '窗边', selection: { kind: 'personal', config } }, signal());
  assert.equal(draft.title, '窗边');
  assert.deepEqual(draft.notes, notes);
});

test('Anthropic rejects missing text and truncated outputs, and preserves endpoint restrictions', async () => {
  for (const body of ['{}', reply(''), JSON.stringify({ content: [{ type: 'thinking', thinking: 'private' }] }), JSON.stringify({ content: [{ type: 'text', text: '{}' }], stop_reason: 'max_tokens' })])
    assert.throws(() => responseText(config, body), { code: 'INVALID_RESPONSE' });
  assert.equal(responseText(config, JSON.stringify({ content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'O' }, { type: 'text', text: 'K' }] })), 'OK');
  const api = createProvider({ transport: async () => { throw new Error('must not reach upstream'); } });
  await assert.rejects(api.testConnection({ ...config, baseUrl: 'https://127.0.0.1/v1' }, signal()), { code: 'UNSAFE_ENDPOINT' });
});
