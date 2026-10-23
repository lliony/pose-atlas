import type { State } from "./types";

export const BACKUP_FORMAT = "pose-atlas-backup";
export const BACKUP_VERSION = 1;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  state: State;
  /** 图片 src → data URL；不含图片时为空对象 */
  images: Record<string, string>;
};

export type BackupStats = {
  cards: number;
  categories: number;
  albums: number;
  images: number;
};

/** 备份文件名；默认 .zip，`json` 只用于兼容早期导出的单文件。 */
export function backupFileName(
  now = new Date(),
  ext: "zip" | "json" = "zip",
): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `pose-atlas-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.${ext}`;
}

/** 严格解析备份文件；任何结构问题都给出可读的中文提示。 */
export function parseBackup(text: string): BackupFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("这不是备份文件");
  const v = value as Partial<BackupFile>;
  if (v.format !== BACKUP_FORMAT) throw new Error("这不是姿势图鉴的备份文件");
  if (v.version !== BACKUP_VERSION)
    throw new Error(`备份版本 ${String(v.version)} 不受支持`);
  const state = v.state as State | undefined;
  if (
    !state ||
    !Array.isArray(state.cards) ||
    !Array.isArray(state.categories) ||
    !Array.isArray(state.albums)
  )
    throw new Error("备份里的数据结构不正确");
  if (!state.cards.every((c) => c && typeof c.id === "string"))
    throw new Error("备份里的卡片缺少 id");
  const images = v.images ?? {};
  if (!images || typeof images !== "object" || Array.isArray(images))
    throw new Error("备份里的图片数据不正确");
  for (const [src, data] of Object.entries(images)) {
    if (typeof data !== "string" || !data.startsWith("data:image/"))
      throw new Error(`图片 ${src} 的数据不正确`);
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt:
      typeof v.exportedAt === "string"
        ? v.exportedAt
        : new Date().toISOString(),
    state,
    images: images as Record<string, string>,
  };
}

export type BackupMeta = {
  exportedAt: string;
  state: State;
  /** src → ZIP 包内的图片路径 */
  images: Record<string, string>;
};

/** ZIP 包里的 pose-atlas.json：图片只记路径，二进制在 images/ 下。 */
export function parseBackupMeta(text: string): BackupMeta {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("备份包里的 pose-atlas.json 不是有效 JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("备份包里的数据格式不正确");
  const v = value as Partial<BackupFile>;
  if (v.format !== BACKUP_FORMAT) throw new Error("这不是姿势图鉴的备份");
  if (v.version !== BACKUP_VERSION)
    throw new Error(`备份版本 ${String(v.version)} 不受支持`);
  const state = v.state as State | undefined;
  if (
    !state ||
    !Array.isArray(state.cards) ||
    !Array.isArray(state.categories) ||
    !Array.isArray(state.albums)
  )
    throw new Error("备份里的数据结构不正确");
  const images = (v.images ?? {}) as Record<string, string>;
  if (!images || typeof images !== "object" || Array.isArray(images))
    throw new Error("备份里的图片索引不正确");
  for (const [src, path] of Object.entries(images)) {
    if (typeof path !== "string" || !path)
      throw new Error(`图片 ${src} 的索引不正确`);
  }
  return {
    exportedAt:
      typeof v.exportedAt === "string"
        ? v.exportedAt
        : new Date().toISOString(),
    state,
    images,
  };
}

/** 合并导入：按 id 去重，导入的条目覆盖同名条目，其余保留。 */
export function mergeStates(current: State, incoming: State): State {
  const merge = <T extends { id: string }>(a: T[], b: T[]): T[] => {
    const map = new Map(a.map((item) => [item.id, item]));
    for (const item of b) map.set(item.id, item);
    return [...map.values()];
  };
  return {
    categories: merge(current.categories, incoming.categories),
    cards: merge(current.cards, incoming.cards),
    albums: merge(current.albums, incoming.albums),
  };
}

export function backupStats(backup: BackupFile): BackupStats {
  return {
    cards: backup.state.cards.length,
    categories: backup.state.categories.length,
    albums: backup.state.albums.length,
    images: Object.keys(backup.images).length,
  };
}
