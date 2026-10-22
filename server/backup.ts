import fs from 'node:fs/promises';
import path from 'node:path';
import type http from 'node:http';

const MAX_BODY = 40 * 1024 * 1024;
const CODE = /^[A-Za-z0-9_-]{16,64}$/;

export type BackupEnvelope = {
  payload: { v: number; salt: string; iv: string; data: string };
  info: { cards: number; images: number; bytes: number; exportedAt: string; updatedAt: string };
};

export function createBackupStore(dir: string) {
  const root = path.resolve(dir);
  const file = (code: string) => path.join(root, `${code}.json`);
  return {
    async put(code: string, envelope: BackupEnvelope): Promise<void> {
      await fs.mkdir(root, { recursive: true });
      await fs.writeFile(file(code), JSON.stringify(envelope));
    },
    async get(code: string): Promise<BackupEnvelope | null> {
      try {
        return JSON.parse(await fs.readFile(file(code), 'utf8')) as BackupEnvelope;
      } catch {
        return null;
      }
    },
    async del(code: string): Promise<boolean> {
      try {
        await fs.unlink(file(code));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export type BackupStore = ReturnType<typeof createBackupStore>;

function send(res: http.ServerResponse, status: number, body: unknown) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const timer = setTimeout(() => {
      cleanup();
      req.resume();
      reject(Object.assign(new Error('上传超时，请重试'), { status: 408 }));
    }, 120000);
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) {
        cleanup();
        req.resume();
        reject(Object.assign(new Error('备份超过 40MB 上限'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('请求不是有效的 JSON'), { status: 400 }));
      }
    };
    const onError = () => {
      cleanup();
      reject(Object.assign(new Error('读取请求失败'), { status: 400 }));
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/** 处理 /api/backup/<code>；返回 true 表示这个请求已被接管。 */
export async function handleBackup(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  code: string,
  store: BackupStore,
): Promise<void> {
  if (!CODE.test(code)) {
    send(res, 400, { error: '备份码格式不正确' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const envelope = await store.get(code);
      if (!envelope) send(res, 404, { error: '没有这个备份码对应的备份' });
      else send(res, 200, envelope);
      return;
    }
    if (req.method === 'DELETE') {
      const removed = await store.del(code);
      if (!removed) send(res, 404, { error: '没有这个备份码对应的备份' });
      else send(res, 200, { ok: true });
      return;
    }
    if (req.method !== 'PUT') {
      send(res, 405, { error: '请求方法不允许' });
      return;
    }
    const body = (await readBody(req)) as Partial<BackupEnvelope>;
    const payload = body?.payload;
    if (
      !payload ||
      payload.v !== 1 ||
      typeof payload.salt !== 'string' ||
      typeof payload.iv !== 'string' ||
      typeof payload.data !== 'string' ||
      payload.data.length < 16
    ) {
      send(res, 400, { error: '备份数据格式不正确' });
      return;
    }
    const meta = (body as { meta?: Record<string, unknown> }).meta ?? {};
    const count = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : 0;
    const info = {
      cards: count(meta.cards),
      images: count(meta.images),
      bytes: Buffer.byteLength(JSON.stringify(payload)),
      exportedAt:
        typeof meta.exportedAt === 'string' ? meta.exportedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.put(code, { payload, info });
    send(res, 200, { ok: true, info });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    send(res, status, { error: (error as Error).message || '备份请求失败' });
  }
}
