import http from 'node:http';
import type { AiConfig } from '../src/lib/ai-types.ts';
import { AI_LIMITS } from '../src/lib/ai-types.ts';
import type { draft, recommend, testConnection } from './ai/provider.ts';
import { AiError } from './ai/errors.ts';
import { validateDraftRequest, validatePersonalConfig, validateRequest } from './ai/validation.ts';
import { handleBackup, type BackupStore } from './backup.ts';

type Options = { defaultConfig?: AiConfig; allowedOrigins: string[]; recommend: typeof recommend; draft?: typeof draft; testConnection: typeof testConnection; backup?: BackupStore };
function send(res: http.ServerResponse, status: number, body: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let bytes = 0;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); req.resume(); reject(new AiError('TIMEOUT')); }, 15000);
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const error = () => { cleanup(); reject(new AiError('INVALID_INPUT')); };
    const aborted = () => error();
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > AI_LIMITS.bodyBytes) { cleanup(); req.resume(); reject(new AiError('PAYLOAD_TOO_LARGE')); return; }
      chunks.push(chunk);
    };
    const end = () => { cleanup(); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new AiError('INVALID_INPUT')); } };
    req.on('data', data); req.on('end', end); req.on('error', error); req.on('aborted', aborted);
  });
}
export function createAiServer(options: Options): http.Server {
  const origins = new Set(options.allowedOrigins);
  const proxyHosts = new Set(options.allowedOrigins.map(origin => new URL(origin).host));
  let defaultConfig: AiConfig | undefined;
  if (options.defaultConfig) { try { defaultConfig = validatePersonalConfig(options.defaultConfig); } catch { /* Incomplete/invalid defaults are unavailable. */ } }
  let active = 0;
  let calls: number[] = [];
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const port = address && typeof address !== 'string' ? address.port : 0;
    const hosts = new Set([...proxyHosts, `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
    if (!req.headers.host || !hosts.has(req.headers.host) || (req.headers.origin !== undefined && !origins.has(req.headers.origin))) {
      send(res, 403, { error: '请求来源不允许', code: 'FORBIDDEN' }); return;
    }
    const backupMatch = /^\/api\/backup\/([A-Za-z0-9_-]{16,64})$/.exec(req.url ?? '');
    if (backupMatch && options.backup) {
      await handleBackup(req, res, backupMatch[1], options.backup);
      return;
    }
    if (req.method === 'GET' && req.url === '/api/ai/config') { send(res, 200, { defaultAvailable: !!defaultConfig }); return; }
    if (req.url !== '/api/ai/test' && req.url !== '/api/ai/recommend' && req.url !== '/api/ai/draft') { send(res, 404, { error: '接口不存在', code: 'NOT_FOUND' }); return; }
    if (req.method !== 'POST') { send(res, 405, { error: '请求方法不允许', code: 'METHOD_NOT_ALLOWED' }); return; }
    if (!req.headers.origin || !origins.has(req.headers.origin)) { send(res, 403, { error: '请求来源不允许', code: 'FORBIDDEN' }); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) { send(res, 415, { error: '请使用 JSON 请求', code: 'UNSUPPORTED_MEDIA_TYPE' }); return; }
    const controller = new AbortController();
    const abort = () => controller.abort();
    const responseClosed = () => { if (!res.writableEnded) abort(); };
    req.once('aborted', abort); res.once('close', responseClosed);
    let acquired = false;
    try {
      const body = await readBody(req);
      const input = req.url === '/api/ai/recommend' ? await validateRequest(body) : undefined;
      const draftInput = req.url === '/api/ai/draft' ? await validateDraftRequest(body) : undefined;
      const selection = input?.selection ?? draftInput?.selection;
      const config = selection ? (selection.kind === 'personal' ? selection.config : defaultConfig) : validatePersonalConfig(body);
      if (!config) throw new AiError('NOT_CONFIGURED');
      if (controller.signal.aborted || res.destroyed) return;
      const now = Date.now(); calls = calls.filter(time => now - time < 60000);
      if (active >= 2 || calls.length >= 30) throw new AiError('RATE_LIMITED');
      calls.push(now); active++; acquired = true;
      if (draftInput) {
        if (!options.draft) throw new AiError('NOT_CONFIGURED');
        send(res, 200, await options.draft(config, draftInput, controller.signal));
      } else if (input) send(res, 200, await options.recommend(config, input, controller.signal));
      else { await options.testConnection(config, controller.signal); send(res, 200, { ok: true }); }
    } catch (error) {
      // Reconstruct known errors so a mutated/provider message can never expose secrets.
      const safe = new AiError(error instanceof AiError ? error.code : 'UPSTREAM_FAILED');
      send(res, safe.status, { error: safe.message, code: safe.code });
    } finally {
      if (acquired) active--;
      req.off('aborted', abort); res.off('close', responseClosed);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
