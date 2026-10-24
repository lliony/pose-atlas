import { api, type Workspace } from "./api";
import { keys, read, remove, write } from "./storage";
import { stateSources } from "../lib/image-refs";
import { restoreFromBackup } from "../lib/backup-restore";
import { dataUrlToBlob, blobToDataUrl } from "../lib/data-url";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  backupStats,
  type BackupFile,
  type BackupStats,
} from "../lib/backup";
import { packBackup, unpackBackup } from "../lib/backup-package";
import { sanitizeState } from "../lib/export-sanitize";

/** 打包当前工作区；includeImages=false 时只带文字（体积小，适合频繁备份）。 */
export async function collectBackup(
  includeImages: boolean,
): Promise<BackupFile> {
  const workspace = await api<Workspace>("workspace", "GET");
  const images: Record<string, string> = {};
  if (includeImages) {
    // 只导出卡片真正引用的图片；本机库里可能留着已经删除卡片的旧图。
    const needed = stateSources(workspace.state);
    for (const src of await keys("images")) {
      if (!needed.has(src)) continue;
      const blob = await read<Blob>("images", src);
      if (blob) images[src] = await blobToDataUrl(blob);
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: sanitizeState(workspace.state),
    images,
  };
}

/** 恢复备份；replace 覆盖本机数据，merge 按 id 合并（备份里的条目优先）。
 * 先把图片落盘、再提交工作区，提交成功后才会清理（写失败或提交失败都不会破坏已有图片库）。*/
export async function restoreBackup(
  backup: BackupFile,
  mode: "merge" | "replace",
): Promise<BackupStats> {
  const current = await api<Workspace>("workspace", "GET");
  await restoreFromBackup(
    backup,
    mode,
    {
      readWorkspace: () => Promise.resolve({ revision: current.revision, state: current.state }),
      listImageKeys: async () => (await keys("images")).filter((s) => s.startsWith("/api/media/")),
      writeImage: async (src, dataUrl) => write("images", src, await dataUrlToBlob(dataUrl)),
      removeImage: async (src) => remove("images", src),
      commitWorkspace: (state, revision) =>
        api("workspace", "PUT", { state, revision }),
    },
  );
  return backupStats(backup);
}

/** 导出 ZIP：pose-atlas.json 记录数据，images/ 下是原始图片。 */
export async function downloadBackupZip(backup: BackupFile): Promise<string> {
  const zip = await packBackup(backup);
  const url = URL.createObjectURL(zip);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName(new Date(), "zip");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return link.download;
}

/** 读备份文件：ZIP 包，或早期版本的单个 JSON。 */
export function readBackupFile(file: File): Promise<BackupFile> {
  return file
    .arrayBuffer()
    .then((buffer) => unpackBackup(new Uint8Array(buffer)));
}
