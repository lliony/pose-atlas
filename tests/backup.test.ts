import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  mergeStates,
  parseBackup,
  parseBackupMeta,
  type BackupFile,
} from "../src/lib/backup.ts";
import { createZip, readZip } from "../src/lib/zip.ts";
import { packBackup, unpackBackup } from "../src/lib/backup-package.ts";
import { sanitizeState } from "../src/lib/export-sanitize.ts";
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

test("ZIP 包的索引只记图片路径", () => {
  const meta = parseBackupMeta(
    JSON.stringify({
      ...valid(),
      images: { "blob:card-1": "images/0001.jpg" },
    }),
  );
  assert.equal(meta.images["blob:card-1"], "images/0001.jpg");
  assert.throws(
    () => parseBackupMeta(JSON.stringify({ ...valid(), images: { a: "" } })),
    /索引不正确/,
  );
});

test("ZIP 备份能打包并原样读回文字和图片", async () => {
  const backup: BackupFile = {
    ...valid(),
    images: { "/api/media/a": "data:image/jpeg;base64,/9j/4AAQ" },
  };
  const zip = await packBackup(backup);
  assert.equal(zip.type, "application/zip");
  const files = await readZip(zip);
  assert.deepEqual(
    files.get("images/0001.jpg"),
    Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
  );
  const round = await unpackBackup(new Uint8Array(await zip.arrayBuffer()));
  assert.equal(round.state.cards[0].id, "k1");
  assert.equal(round.state.categories[0].name, "街道");
  assert.deepEqual(round.images, backup.images);
});

test("仅文字备份的 ZIP 里没有 images/", async () => {
  const zip = await packBackup(valid());
  const files = await readZip(zip);
  assert.equal(
    [...files.keys()].filter((name) => name.startsWith("images/")).length,
    0,
  );
});

test("导入仍然兼容早期的单个 JSON", async () => {
  const legacy = JSON.stringify({
    ...valid(),
    images: { "/api/media/a": "data:image/png;base64,iVBORw0KGgo=" },
  });
  const round = await unpackBackup(new TextEncoder().encode(legacy));
  assert.equal(round.state.cards.length, 1);
  assert.equal(
    round.images["/api/media/a"],
    "data:image/png;base64,iVBORw0KGgo=",
  );
});

test("缺 pose-atlas.json 的 ZIP 会被拒绝", async () => {
  const zip = await createZip([
    { name: "other.txt", data: new TextEncoder().encode("x") },
  ]);
  const bytes = new Uint8Array(await zip.arrayBuffer());
  await assert.rejects(() => unpackBackup(bytes), /缺少 pose-atlas.json/);
});

test("文件名叫 pose-atlas-backup-日期时间.zip", () => {
  assert.equal(
    backupFileName(new Date(2026, 9, 22, 9, 5)),
    "pose-atlas-backup-20261022-0905.zip",
  );
  assert.equal(
    backupFileName(new Date(2026, 9, 22, 9, 5), "json"),
    "pose-atlas-backup-20261022-0905.json",
  );
});

const dirtyState = () =>
  ({
    categories: [{ id: "c1", name: "街道", code: "01", apiKey: "cat-secret" }],
    cards: [
      {
        id: "k1",
        categoryId: "c1",
        code: "01",
        title: "测试",
        tags: ["a"],
        notes: {
          pose: "p",
          camera: "c",
          composition: "m",
          light: "l",
          cautions: "x",
        },
        images: [
          {
            id: "p1",
            src: "/api/media/1",
            ai: false,
            notes: {},
            token: "photo-secret",
          },
        ],
        privateNote: "私密",
        source: {
          url: "https://example.com",
          title: "来源",
          author: "作者",
          apiKey: "source-secret",
        },
        apiKey: "card-secret",
      },
    ],
    albums: [
      {
        id: "a1",
        name: "册",
        description: "",
        cardIds: ["k1"],
        shareId: "share-secret",
      },
    ],
    apiKey: "root-secret",
    token: "root-token",
  }) as unknown as State;

const SECRETS = [
  "cat-secret",
  "photo-secret",
  "source-secret",
  "card-secret",
  "share-secret",
  "root-secret",
  "root-token",
];

test("导出清洗只保留白名单字段，密钥和分享凭据都会被剥离", () => {
  const clean = sanitizeState(dirtyState());
  const text = JSON.stringify(clean);
  for (const secret of SECRETS) assert.equal(text.includes(secret), false);
  assert.equal(clean.albums[0].shareId, undefined);
  assert.equal(clean.cards[0].title, "测试");
  assert.equal(clean.cards[0].privateNote, "私密");
  assert.equal(clean.cards[0].images[0].src, "/api/media/1");
});

test("ZIP 包里的 pose-atlas.json 搜不到密钥和分享凭据", async () => {
  const zip = await packBackup({ ...valid(), state: dirtyState() });
  const files = await readZip(zip);
  const meta = new TextDecoder().decode(files.get("pose-atlas.json"));
  for (const secret of SECRETS) assert.equal(meta.includes(secret), false);
  assert.equal(meta.includes("shareId"), false);
});

test("导入旧 JSON 时也会清洗未知字段", async () => {
  const legacy = JSON.stringify({ ...valid(), state: dirtyState() });
  const round = await unpackBackup(new TextEncoder().encode(legacy));
  const text = JSON.stringify(round.state);
  for (const secret of SECRETS) assert.equal(text.includes(secret), false);
  assert.equal(round.state.albums[0].shareId, undefined);
});
