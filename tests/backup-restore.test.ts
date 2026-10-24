import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
} from "../src/lib/backup.ts";
import type { State } from "../src/lib/types.ts";
import {
  restoreFromBackup,
  type RestorePort,
} from "../src/lib/backup-restore.ts";

type Seed = { revision: number; state: State; images?: Record<string, string> };

/** 内存版恢复端口：记录每次读/写图/删图/提交的次序，并允许模拟提交失败。 */
function fakePort(seed: Seed) {
  const images = new Map<string, string>(
    Object.entries(seed.images ?? {}),
  );
  const log: string[] = [];
  const port: RestorePort = {
    async readWorkspace() {
      log.push("read");
      return { revision: seed.revision, state: seed.state };
    },
    async listImageKeys() {
      log.push("keys");
      return [...images.keys()];
    },
    async writeImage(src, dataUrl) {
      log.push("write:" + src);
      images.set(src, dataUrl);
    },
    async removeImage(src) {
      log.push("remove:" + src);
      images.delete(src);
    },
    async commitWorkspace() {
      log.push("commit");
    },
  };
  return { port, images, log };
}

function emptyState(): State {
  return { categories: [], cards: [], albums: [] };
}

const card = (id: string, src: string) => ({
  id,
  categoryId: "c1",
  code: "01",
  title: id,
  tags: [],
  notes: { pose: "", camera: "", composition: "", light: "", cautions: "" },
  images: [{ id: "p-" + id, src, ai: false, notes: {} }],
});

const backup = (
  images: Record<string, string>,
  over: Partial<State> = {},
): BackupFile => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: "2026-10-22T08:00:00.000Z",
  state: {
    categories: [{ id: "c1", name: "街道", code: "01" }],
    cards: [{ id: "k1" } as never],
    albums: [],
    ...over,
  },
  images,
});

test("replace 恢复时若工作区提交失败，已有图片不被清空（数据不丢失）", async () => {
  const { port, images, log } = fakePort({
    revision: 5,
    state: {
      categories: [{ id: "c1", name: "街道", code: "01" }],
      cards: [{ id: "k1" } as never],
      albums: [],
    },
    images: { "/api/media/keep": "data:image/jpeg;base64,old" },
  });
  // 模拟版本冲突：提交抛错（409）。
  port.commitWorkspace = async () => {
    const e: Error & { status?: number } = new Error("资料已更新");
    e.status = 409;
    throw e;
  };

  await assert.rejects(
    restoreFromBackup(
      backup({ "/api/media/new": "data:image/jpeg;base64,new" }),
      "replace",
      port,
    ),
  );

  // 关键：已有图片必须还在——旧实现先 clear 再提交，这里会丢数据。
  assert.equal(images.has("/api/media/keep"), true, "已有图片不应被删除");
  // 只写入新图，尚未执行到清理阶段。
  assert.deepEqual(log, ["read", "write:/api/media/new"]);
});

test("replace 恢复先落图、后提交、提交成功才清理不再引用的图片", async () => {
  const { port, images, log } = fakePort({
    revision: 1,
    state: { categories: [], cards: [card("old", "/api/media/old")], albums: [] },
    images: { "/api/media/old": "data:image/jpeg;base64,old" },
  });

  await restoreFromBackup(
    backup(
      { "/api/media/new": "data:image/jpeg;base64,new" },
      { cards: [card("new", "/api/media/new")], albums: [] },
    ),
    "replace",
    port,
  );

  // 写入发生在提交之前，清理只在提交成功之后。
  assert.deepEqual(log, [
    "read",
    "write:/api/media/new",
    "commit",
    "keys",
    "remove:/api/media/old",
  ]);
  // 成功后，库里只剩新引用。
  assert.deepEqual(
    Object.fromEntries(images),
    { "/api/media/new": "data:image/jpeg;base64,new" },
  );
});

test("merge 恢复保留两边图片并只提交合并后的状态", async () => {
  const { port, images, log } = fakePort({
    revision: 2,
    state: {
      categories: [],
      cards: [card("keep-me", "/api/media/keep")],
      albums: [],
    },
    images: { "/api/media/keep": "data:image/jpeg;base64,keep" },
  });

  await restoreFromBackup(
    backup(
      { "/api/media/new": "data:image/jpeg;base64,new" },
      { cards: [card("new", "/api/media/new")], albums: [] },
    ),
    "merge",
    port,
  );

  // merge 不做清理，两边都留。
  assert.equal(images.get("/api/media/keep"), "data:image/jpeg;base64,keep");
  assert.equal(images.get("/api/media/new"), "data:image/jpeg;base64,new");
  assert.deepEqual(log, ["read", "write:/api/media/new", "commit"]);
});

test("没有图片的备份（仅文字）仍然正常恢复", async () => {
  const { port, log } = fakePort({
    revision: 3,
    state: emptyState(),
  });

  await restoreFromBackup(backup({}, { cards: [], albums: [] }), "replace", port);
  assert.deepEqual(log, ["read", "commit", "keys"]);
});