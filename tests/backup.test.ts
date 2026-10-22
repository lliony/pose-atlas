import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  mergeStates,
  parseBackup,
  type BackupFile,
} from "../src/lib/backup.ts";
import {
  newBackupCode,
  openBackup,
  sealBackup,
} from "../src/lib/backup-crypto.ts";
import type { State } from "../src/lib/types.ts";

const state: State = {
  categories: [{ id: "c1", name: "街道", code: "01" }],
  cards: [{ id: "k1" } as never],
  albums: [{ id: "a1", name: "册", description: "", cardIds: ["k1"] }],
};

const valid = (): BackupFile => ({
  format: BACKUP_FORMAT,
  version: BACKUP_VERSION,
  exportedAt: "2026-10-22T08:00:00.000Z",
  state,
  images: {},
});

test("备份文件能原样解析", () => {
  const backup = parseBackup(JSON.stringify(valid()));
  assert.equal(backup.state.cards.length, 1);
  assert.equal(backup.images && Object.keys(backup.images).length, 0);
});

test("坏文件会被拒绝并给出中文提示", () => {
  assert.throws(() => parseBackup("{"), /有效的 JSON/);
  assert.throws(() => parseBackup("[]"), /不是备份文件/);
  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid(), format: "x" })),
    /不是姿势图鉴的备份/,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid(), version: 9 })),
    /版本 9 不受支持/,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ ...valid(), state: { cards: [] } })),
    /数据结构不正确/,
  );
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({ ...valid(), images: { "/a.png": "not-a-data-url" } }),
      ),
    /数据不正确/,
  );
});

test("合并导入按 id 去重，备份里的版本优先", () => {
  const current: State = {
    categories: [{ id: "c1", name: "旧名", code: "01" }],
    cards: [{ id: "k1" } as never, { id: "k2" } as never],
    albums: [],
  };
  const incoming: State = {
    categories: [{ id: "c1", name: "新名", code: "01" }],
    cards: [{ id: "k2" } as never, { id: "k3" } as never],
    albums: [{ id: "a9", name: "新册", description: "", cardIds: [] }],
  };
  const merged = mergeStates(current, incoming);
  assert.deepEqual(
    merged.categories.map((c) => c.name),
    ["新名"],
  );
  assert.deepEqual(
    merged.cards.map((c) => c.id),
    ["k1", "k2", "k3"],
  );
  assert.equal(merged.albums.length, 1);
});

test("文件名叫 pose-atlas-backup-日期时间.json", () => {
  assert.equal(
    backupFileName(new Date(2026, 9, 22, 9, 5)),
    "pose-atlas-backup-20261022-0905.json",
  );
});

test("云端备份加解密：同码可还原，错码报错", async () => {
  const code = newBackupCode();
  assert.equal(code.length, 22);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const json = JSON.stringify(valid());
  const sealed = await sealBackup(code, json);
  assert.equal(sealed.v, 1);
  assert.equal(await openBackup(code, sealed), json);
  await assert.rejects(() => openBackup(newBackupCode(), sealed), /备份码不正确/);
  await assert.rejects(() => openBackup(code, { v: 1 } as never), /格式不受支持/);
});
