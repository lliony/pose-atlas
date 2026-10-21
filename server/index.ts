import { createAiServer } from './app.ts';
import { draft, recommend, testConnection } from './ai/provider.ts';

const { AI_BASE_URL, AI_API_KEY, AI_MODEL } = process.env;
const defaultConfig = AI_BASE_URL && AI_API_KEY && AI_MODEL ? { baseUrl: AI_BASE_URL, apiKey: AI_API_KEY, model: AI_MODEL } : undefined;

// 默认仍是回环地址；只有显式设置 HOST / AI_ALLOWED_ORIGINS 才会对外提供服务。
const host = process.env.HOST?.trim() || '127.0.0.1';
const port = Number(process.env.PORT ?? 5175);
const origins = (process.env.AI_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5174,http://127.0.0.1:4174')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const server = createAiServer({
  defaultConfig,
  allowedOrigins: origins.length ? origins : ['http://127.0.0.1:5174'],
  recommend,
  draft,
  testConnection,
});
server.listen(port, host, () =>
  console.log(`AI backend listening on http://${host}:${port} (origins: ${origins.join(', ') || 'none'})`),
);
