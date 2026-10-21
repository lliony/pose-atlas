import seed from "../lib/seed.json";
import { addReferenceCards } from '../lib/reference-cards';
import { snapshot, validateState } from "../lib/model";
import type { State, Publication } from "../lib/types";
import { database, read, write } from "./storage";

export const isLocalMode = import.meta.env.VITE_DATA_MODE !== "api";
export type Workspace = {
  state: State;
  revision: number;
  user: { id: string; name: string };
  local: boolean;
};
export type ShareResponse = { publication: Publication; signedIn: boolean };
export type PublishResponse = {
  id: string;
  url: string;
  state: State;
  revision: number;
};
type StoredShare = { publication: Publication; active: boolean };
const assets = new Map<string, string>();
const error = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });
const initial = (): Workspace => ({
  state: structuredClone(seed) as State,
  revision: 1,
  user: { id: "local-browser", name: "本机演示" },
  local: true,
});

async function workspace(): Promise<Workspace> {
  // Initialize under a read/write transaction, so simultaneous tabs cannot overwrite each other.
  const db = await database();
  return new Promise((resolve, reject) => {
    const t = db.transaction("workspace", "readwrite"),
      store = t.objectStore("workspace"),
      request = store.get("main");
    let value: Workspace;
    request.onsuccess = () => {
      value = request.result || initial();
      const upgraded = addReferenceCards(value.state);
      if(upgraded !== value.state) value = {...value, state:upgraded, revision:value.revision + 1};
      if (!request.result || upgraded !== request.result.state) store.put(value, "main");
    };
    t.oncomplete = () => resolve(value);
    t.onerror = () => reject(error("本机资料读取失败"));
    t.onabort = () => reject(error("本机资料读取中断"));
  });
}

async function preload(state: Pick<State, "cards">) {
  await Promise.all(
    state.cards
      .flatMap((c) => c.images)
      .map(async (image) => {
        if (!image.src.startsWith("/api/media/") || assets.has(image.src))
          return;
        const blob = await read<Blob>("images", image.src);
        if (blob) assets.set(image.src, URL.createObjectURL(blob));
      }),
  );
}
export async function resolveImageUrl(
  src: string,
  shareId?: string,
): Promise<string> {
  if (isLocalMode && src.startsWith("/api/media/") && !assets.has(src)) {
    const blob = await read<Blob>("images", src);
    if (!blob) throw error("本机图片已丢失，请重新上传");
    if (!assets.has(src)) assets.set(src, URL.createObjectURL(blob));
  }
  return imageUrl(src, shareId);
}

export function imageUrl(src: string, shareId?: string) {
  if (isLocalMode && src.startsWith("/api/media/"))
    return assets.get(src) || "/missing-image.svg";
  return (
    src +
    (shareId && src.startsWith("/api/media/")
      ? "?share=" + encodeURIComponent(shareId)
      : "")
  );
}

// The shared UI speaks the same contract in both modes. No global fetch interception.
export async function api<T = unknown>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  if (!isLocalMode) {
    const r = await fetch("/api/" + path, {
      method,
      credentials: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    });
    const body = await r
      .json()
      .catch(() => ({ error: "接口没有返回有效JSON，请检查后端代理配置" }));
    if (!r.ok) throw error(body.error || "请求失败", r.status);
    return body as T;
  }
  if (path === "workspace" && method === "GET") {
    const w = await workspace();
    await preload(w.state);
    return w as T;
  }
  if (path === "workspace" && method === "PUT") {
    const input = data as { state: State; revision: number };
    validateState(input.state);
    const db = await database();
    return new Promise((resolve, reject) => {
      const t = db.transaction("workspace", "readwrite"),
        store = t.objectStore("workspace"),
        request = store.get("main");
      let failed: Error | undefined;
      request.onsuccess = () => {
        const current = request.result as Workspace;
        if (!current || current.revision !== input.revision) {
          failed = error(
            "资料已在其他标签页更新。请保留编辑草稿后重新加载。",
            409,
          );
          t.abort();
          return;
        }
        store.put(
          { ...current, state: input.state, revision: input.revision + 1 },
          "main",
        );
      };
      t.oncomplete = () => resolve({ revision: input.revision + 1 } as T);
      t.onabort = () => reject(failed || error("保存已中断"));
      t.onerror = () => reject(error("保存失败，请检查存储空间"));
    });
  }
  if (path === "shares" && method === "POST") {
    const input = data as { albumId: string; revision: number };
    const db = await database();
    return new Promise((resolve, reject) => {
      const t = db.transaction(["workspace", "shares"], "readwrite"),
        store = t.objectStore("workspace"),
        request = store.get("main");
      let result: unknown, failed: Error | undefined;
      request.onsuccess = () => {
        try {
          const w = request.result as Workspace;
          if (w.revision !== input.revision)
            throw error("资料已更新，请重新加载再生成预览", 409);
          const album = w.state.albums.find((a) => a.id === input.albumId);
          if (!album) throw error("卡片册不存在");
          const publication = snapshot(w.state, album);
          if (!publication.cards.length) throw error("请先添加卡片");
          const id = album.shareId || crypto.randomUUID();
          album.shareId = id;
          w.revision++;
          t.objectStore("shares").put({ publication, active: true }, id);
          store.put(w, "main");
          result = {
            id,
            url: "/share/" + id,
            state: w.state,
            revision: w.revision,
          };
        } catch (e) {
          failed = e as Error;
          t.abort();
        }
      };
      t.oncomplete = () => resolve(result as T);
      t.onabort = () => reject(failed || error("预览保存中断"));
      t.onerror = () => reject(error("预览保存失败"));
    });
  }
  if (path.startsWith("shares/")) {
    const id = path.split("/")[1],
      s = await read<StoredShare>("shares", id);
    if (!s?.active)
      throw error(
        "预览不存在或已撤销。本机预览仅在创建它的浏览器中可用。",
        404,
      );
    if (method === "DELETE") {
      await write("shares", id, { ...s, active: false });
      return { ok: true } as T;
    }
    if (method === "GET") {
      await preload(s.publication);
      return { publication: s.publication, signedIn: true } as T;
    }
  }
  throw error("接口不存在", 404);
}

export async function uploadImage(
  file: File,
): Promise<{ id: string; src: string }> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw error("请选择20MB以内的JPEG、PNG或WebP图片");
  // Reject corrupt files before persisting a broken reference.
  const bitmap = await createImageBitmap(file).catch(() => {
    throw error("无法读取图片，请重新选择有效文件");
  });
  bitmap.close();
  if (!isLocalMode) {
    const form = new FormData();
    form.append("file", file);
    const r = await fetch("/api/images", { method: "POST", body: form });
    const data = await r
      .json()
      .catch(() => ({ error: "上传失败，请检查后端文件大小限制" }));
    if (!r.ok) throw error(data.error || "上传失败", r.status);
    return data;
  }
  const id = crypto.randomUUID(),
    src = "/api/media/" + id;
  await write("images", src, file);
  assets.set(src, URL.createObjectURL(file));
  return { id, src };
}
