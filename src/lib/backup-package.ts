import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  parseBackup,
  parseBackupMeta,
  type BackupFile,
} from "./backup.ts";
import { createZip, readZip } from "./zip.ts";
import { sanitizeState } from "./export-sanitize.ts";

const toBase64 = (bytes: Uint8Array): string => {
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(text);
};

/** 直接把 data URL 的 base64 解码成字节，避免再走一次 Blob/fetch。 */
const dataUrlBytes = (dataUrl: string): Uint8Array => {
  const comma = dataUrl.indexOf(",");
  const binary = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const mimeOf = (dataUrl: string) =>
  /^data:([^;]+);/.exec(dataUrl)?.[1] ?? "image/jpeg";
const extOf = (mime: string) =>
  mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

/**
 * 打包备份：文字进 pose-atlas.json，图片以原始二进制放进 images/。
 * 不再把图片转成 base64 塞进一个大 JSON，体积小约四分之一，也能直接解压查看。
 */
export async function packBackup(backup: BackupFile): Promise<Blob> {
  const state = sanitizeState(backup.state);
  const index: Record<string, string> = {};
  const entries: { name: string; data: Uint8Array }[] = [];
  let order = 0;
  for (const [src, dataUrl] of Object.entries(backup.images)) {
    order += 1;
    const name = `images/${String(order).padStart(4, "0")}.${extOf(mimeOf(dataUrl))}`;
    index[src] = name;
    entries.push({ name, data: dataUrlBytes(dataUrl) });
  }
  const meta = JSON.stringify(
    {
      format: backup.format,
      version: backup.version,
      exportedAt: backup.exportedAt,
      state,
      images: index,
    },
    null,
    2,
  );
  entries.unshift({
    name: "pose-atlas.json",
    data: new TextEncoder().encode(meta),
  });
  entries.unshift({
    name: "README.txt",
    data: new TextEncoder().encode(
      [
        "姿势图鉴备份包",
        `导出时间：${backup.exportedAt}`,
        `卡片：${state.cards.length} 张`,
        `图片：${Object.keys(backup.images).length} 张${
          order ? "（在 images/ 下，可直接打开查看）" : "（本次未包含图片）"
        }`,
        "",
        "恢复方式：打开应用 → 系统设置 → 备份与恢复 → 选择这个 zip 文件。",
      ].join("\n"),
    ),
  });
  return createZip(entries);
}

/** 读备份文件：ZIP 包，或早期版本的单个 JSON。 */
export async function unpackBackup(bytes: Uint8Array): Promise<BackupFile> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) {
    const backup = parseBackup(new TextDecoder().decode(bytes));
    return { ...backup, state: sanitizeState(backup.state) };
  }

  const zip = await readZip(
    new Blob([bytes as unknown as BlobPart], { type: "application/zip" }),
  );
  const metaBytes = zip.get("pose-atlas.json");
  if (!metaBytes) throw new Error("备份包里缺少 pose-atlas.json");
  const meta = parseBackupMeta(new TextDecoder().decode(metaBytes));
  const images: Record<string, string> = {};
  for (const [src, path] of Object.entries(meta.images)) {
    const data = zip.get(path);
    if (!data) throw new Error(`备份包缺少图片 ${path}`);
    const name = path.toLowerCase();
    const mime = name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    images[src] = `data:${mime};base64,${toBase64(data)}`;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: meta.exportedAt,
    state: sanitizeState(meta.state),
    images,
  };
}
