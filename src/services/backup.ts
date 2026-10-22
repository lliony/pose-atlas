import { api, type Workspace } from "./api";
import { clear, keys, read, write } from "./storage";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  backupStats,
  mergeStates,
  parseBackup,
  type BackupFile,
  type BackupStats,
} from "../lib/backup";
import { newBackupCode, openBackup, sealBackup } from "../lib/backup-crypto";

export type CloudBackupInfo = {
  cards: number;
  images: number;
  bytes: number;
  exportedAt: string;
  updatedAt: string;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取本机图片失败"));
    reader.readAsDataURL(blob);
  });

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

/** 打包当前工作区；includeImages=false 时只带文字（体积小，适合频繁备份）。 */
export async function collectBackup(
  includeImages: boolean,
): Promise<BackupFile> {
  const workspace = await api<Workspace>("workspace", "GET");
  const images: Record<string, string> = {};
  if (includeImages) {
    for (const src of await keys("images")) {
      const blob = await read<Blob>("images", src);
      if (blob) images[src] = await blobToDataUrl(blob);
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: workspace.state,
    images,
  };
}

export function backupJson(backup: BackupFile): string {
  return JSON.stringify(backup);
}

export function downloadBackup(backup: BackupFile): string {
  const blob = new Blob([backupJson(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName();
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return link.download;
}

/** 恢复备份；replace 覆盖本机数据，merge 按 id 合并（备份里的条目优先）。 */
export async function restoreBackup(
  backup: BackupFile,
  mode: "merge" | "replace",
): Promise<BackupStats> {
  const current = await api<Workspace>("workspace", "GET");
  const nextState =
    mode === "merge" ? mergeStates(current.state, backup.state) : backup.state;
  if (mode === "replace") await clear("images");
  for (const [src, dataUrl] of Object.entries(backup.images)) {
    await write("images", src, await dataUrlToBlob(dataUrl));
  }
  await api("workspace", "PUT", {
    state: nextState,
    revision: current.revision,
  });
  return backupStats(backup);
}

/* ── 云端备份：客户端加密，服务端只存密文 ─────────────── */

const backupUrl = (code: string) =>
  `/api/backup/${encodeURIComponent(code.trim())}`;

async function readJson(response: Response): Promise<any> {
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      (body && typeof body.error === "string" && body.error) ||
        `云端备份请求失败（HTTP ${response.status}）`,
    );
  return body;
}

export async function uploadCloudBackup(
  code: string,
  backup: BackupFile,
): Promise<CloudBackupInfo> {
  const sealed = await sealBackup(code, JSON.stringify(backup));
  const response = await fetch(backupUrl(code), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload: sealed,
      meta: {
        cards: backup.state.cards.length,
        images: Object.keys(backup.images).length,
        exportedAt: backup.exportedAt,
      },
    }),
  });
  const body = await readJson(response);
  return body.info as CloudBackupInfo;
}

export async function cloudBackupInfo(
  code: string,
): Promise<CloudBackupInfo | null> {
  const response = await fetch(backupUrl(code));
  if (response.status === 404) return null;
  const body = await readJson(response);
  return body.info as CloudBackupInfo;
}

export async function downloadCloudBackup(code: string): Promise<BackupFile> {
  const response = await fetch(backupUrl(code));
  if (response.status === 404)
    throw new Error("云端没有这个备份码对应的备份");
  const body = await readJson(response);
  const json = await openBackup(code, body.payload);
  return parseBackup(json);
}

export async function deleteCloudBackup(code: string): Promise<void> {
  const response = await fetch(backupUrl(code), { method: "DELETE" });
  if (response.status === 404) throw new Error("云端没有这个备份码对应的备份");
  await readJson(response);
}

const CODE_KEY = "pose-atlas:backup-code";

export function readBackupCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveBackupCode(code: string): void {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* 记不住也不影响使用 */
  }
}

export function ensureBackupCode(): string {
  const existing = readBackupCode();
  if (existing) return existing;
  const code = newBackupCode();
  saveBackupCode(code);
  return code;
}
