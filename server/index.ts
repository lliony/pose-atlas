import { createAiServer } from './app.ts';
import { recommend, testConnection } from './ai/provider.ts';

const { AI_BASE_URL, AI_API_KEY, AI_MODEL } = process.env;
const defaultConfig = AI_BASE_URL && AI_API_KEY && AI_MODEL ? { baseUrl: AI_BASE_URL, apiKey: AI_API_KEY, model: AI_MODEL } : undefined;
const server = createAiServer({ defaultConfig, allowedOrigins: ['http://127.0.0.1:5174', 'http://127.0.0.1:4174'], recommend, testConnection });
// Deliberately fixed loopback binding: no CLI or environment public-host override.
server.listen(5175, '127.0.0.1', () => console.log('AI backend listening on http://127.0.0.1:5175'));
