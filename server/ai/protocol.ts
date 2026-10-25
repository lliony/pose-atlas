import type { AiConfig, AiImage } from '../../src/lib/ai-types.ts';
import { AiError } from './errors.ts';

export function authHeaders(config: AiConfig): Record<string, string> {
  return config.protocol === 'anthropic'
    ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
    : { authorization: `Bearer ${config.apiKey}` };
}

export function requestPayload(config: AiConfig, text: string, system?: string, image?: AiImage) {
  if (config.protocol === 'anthropic') {
    const content = image
      ? [{ type: 'text', text }, { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.base64 } }]
      : text;
    return {
      model: config.model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content }],
    };
  }
  const content = image
    ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } }]
    : text;
  return {
    model: config.model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }],
  };
}

export function responseText(config: AiConfig, body: string): string {
  try {
    const value = JSON.parse(body);
    if (config.protocol === 'anthropic') {
      if (!Array.isArray(value.content) || value.stop_reason === 'max_tokens') throw new Error();
      const blocks = value.content.filter((block: unknown): block is { type: 'text'; text: string } =>
        !!block && typeof block === 'object' && 'type' in block && block.type === 'text' &&
        'text' in block && typeof block.text === 'string');
      const text = blocks.map((block: { text: string }) => block.text).join('');
      if (!text.trim()) throw new Error();
      return text;
    }
    const text = value.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error();
    return text;
  } catch { throw new AiError('INVALID_RESPONSE'); }
}
