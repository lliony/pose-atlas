import { prepareUpload } from "../lib/image-compression.ts";
import {
  draftSources,
  publicationSources,
  stateSources,
} from "../lib/image-refs.ts";
import type { Publication, State } from "../lib/types.ts";
import { entries, keys, read, remove, write } from "./storage.ts";

export type ImageStore = {
  keys(name: string): Promise<string[]>;
  read<T>(name: string, key: string): Promise<T | undefined>;
  write(name: string, key: string, value: unknown): Promise<void>;
  remove(name: string, key: string): Promise<void>;
};

const defaultStore: ImageStore = { keys, read, write, remove };

export type CompressStoredResult = {
  compressed: number;
  skipped: number;
  failed: number;
  savedBytes: number;
};

/**
 * 把已经存进本机库的上传图片补压一遍。
 * 只覆盖确实变小的条目：已压过的、小图、种子图都跳过；单张失败不影响其余。
 */
export async function compressStoredImages(
  store: ImageStore = defaultStore,
): Promise<CompressStoredResult> {
  const result: CompressStoredResult = {
    compressed: 0,
    skipped: 0,
    failed: 0,
    savedBytes: 0,
  };
  const sources = (await store.keys("images")).filter((src) =>
    src.startsWith("/api/media/"),
  );
  for (const src of sources) {
    try {
      const blob = await store.read<Blob>("images", src);
      if (!blob) {
        result.skipped += 1;
        continue;
      }
      const file = new File([blob], "image", {
        type: blob.type || "image/jpeg",
      });
      const next = await prepareUpload(file, { keepOriginal: false });
      if (next === file || next.size >= file.size) {
        result.skipped += 1;
        continue;
      }
      await store.write("images", src, next);
      result.compressed += 1;
      result.savedBytes += file.size - next.size;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

const MEDIA_PREFIX = "/api/media/";
const DRAFT_PREFIX = "pose-draft-";
const FRESH_KEY = "pose-atlas:fresh-images";
const FRESH_WINDOW = 5 * 60_000;

/** 刚上传还没落盘的图片：保存触发的清理可能早于草稿写入，先跳过它们。 */
const fresh = new Map<string, number>();
export function noteFreshImage(src: string, now = Date.now()): void {
  fresh.set(src, now);
  // 同一浏览器可能开着多个标签页，上传记录也写一份到 localStorage。
  try {
    const list = readFreshList();
    const next = list
      .filter((item) => now - item.at < FRESH_WINDOW)
      .concat({ src, at: now });
    localStorage.setItem(FRESH_KEY, JSON.stringify(next.slice(-50)));
  } catch {
    // 存不下也不影响上传，内存里那份仍然有效
  }
}

function readFreshList(): { src: string; at: number }[] {
  try {
    const raw = localStorage.getItem(FRESH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is { src: string; at: number } =>
        !!item &&
        typeof item === "object" &&
        typeof (item as { src?: unknown }).src === "string" &&
        typeof (item as { at?: unknown }).at === "number",
    );
  } catch {
    return [];
  }
}

function freshSources(now: number): Map<string, number> {
  const cutoff = now - FRESH_WINDOW;
  const keep = new Map<string, number>();
  for (const [src, at] of fresh)
    if (at > cutoff) keep.set(src, at);
    else fresh.delete(src);
  for (const item of readFreshList())
    if (item.at > cutoff)
      keep.set(item.src, Math.max(keep.get(item.src) ?? 0, item.at));
  return keep;
}

export type PruneResult = { removed: number; savedBytes: number };

/** 删掉没有被任何卡片、草稿或公开快照引用的上传图片。 */
export async function pruneUnreferencedImages(
  keep: Iterable<string>,
  store: ImageStore = defaultStore,
  now = Date.now(),
): Promise<PruneResult> {
  const kept = new Set(keep);
  const freshSourcesNow = freshSources(now);
  const result: PruneResult = { removed: 0, savedBytes: 0 };
  const sources = (await store.keys("images")).filter((src) =>
    src.startsWith(MEDIA_PREFIX),
  );
  for (const src of sources) {
    if (kept.has(src) || freshSourcesNow.has(src)) continue;
    const blob = await store
      .read<Blob>("images", src)
      .catch(() => undefined);
    if (!(blob instanceof Blob)) continue;
    await store.remove("images", src);
    result.removed += 1;
    result.savedBytes += blob.size;
  }
  return result;
}

export type Usage = { images: number; data: number };

/** 直接量本机库里的字节数，比 navigator.storage.estimate() 的模糊估算准。 */
export async function measureUsage(
  store: ImageStore = defaultStore,
): Promise<Usage> {
  let images = 0;
  for (const src of await store.keys("images")) {
    const blob = await store
      .read<Blob>("images", src)
      .catch(() => undefined);
    if (blob instanceof Blob) images += blob.size;
  }
  let data = 0;
  const workspace = await store
    .read<unknown>("workspace", "main")
    .catch(() => undefined);
  if (workspace !== undefined) {
    try {
      data = new TextEncoder().encode(JSON.stringify(workspace)).length;
    } catch {
      data = 0;
    }
  }
  return { images, data };
}

type StoredShare = { publication: Publication; active: boolean };

function draftValues(): string[] {
  const values: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DRAFT_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw) values.push(raw);
    }
  } catch {
    // 草稿读不到时只会多留几张图，不会误删
  }
  return values;
}

/** 当前必须保留的图片：卡片（含回收站）、仍在使用的公开快照、未保存的草稿。 */
export async function collectProtectedSources(state: State): Promise<Set<string>> {
  const keep = stateSources(state);
  try {
    const shares = await entries<StoredShare>("shares");
    for (const share of shares)
      if (share?.active)
        for (const src of publicationSources(share.publication)) keep.add(src);
  } catch {
    // 快照读不到时保守处理：不额外保护
  }
  for (const src of draftSources(draftValues())) keep.add(src);
  return keep;
}

/** 保存后调用：清理已经没有任何引用的上传图片。 */
export async function pruneForState(state: State): Promise<PruneResult> {
  return pruneUnreferencedImages(await collectProtectedSources(state));
}

