import { useRef, useState } from "react";
import { confirmAction } from "./Confirm";
import { backupStats, type BackupFile } from "../lib/backup";
import {
  collectBackup,
  downloadBackupZip,
  readBackupFile,
  restoreBackup,
} from "../services/backup";

export default function BackupPanel() {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (label: string, task: () => Promise<string>) => {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      setMessage(await task());
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  };

  const exportLocal = (includeImages: boolean) =>
    run(includeImages ? "正在打包图片…" : "正在导出…", async () => {
      const backup = await collectBackup(includeImages);
      const { cards, images } = backupStats(backup);
      const name = await downloadBackupZip(backup);
      return includeImages
        ? `已导出 ${cards} 张卡片、${images} 张图片到 ${name}`
        : `已导出 ${cards} 张卡片（不含图片）到 ${name}`;
    });

  const importFile = async (file: File) =>
    run("正在读取备份…", async () => {
      const backup: BackupFile = await readBackupFile(file);
      const stats = backupStats(backup);
      const ok = await confirmAction({
        title: mode === "merge" ? "合并导入" : "覆盖导入",
        message: `导入「${file.name}」？共 ${stats.cards} 张卡片、${stats.images} 张图片。`,
        detail:
          mode === "merge"
            ? "同 id 的卡片会被备份里的版本覆盖，其余保留。"
            : stats.images
              ? "会清空本机现有的卡片与图片，无法撤销。"
              : "这个备份不含图片；覆盖后会清空本机图片，卡片可能显示不出图。",
        confirmText: mode === "merge" ? "合并导入" : "覆盖导入",
        danger: mode === "replace",
      });
      if (!ok) return "已取消导入";
      await restoreBackup(backup, mode);
      setTimeout(() => location.reload(), 900);
      return `已${mode === "merge" ? "合并" : "覆盖"} ${stats.cards} 张卡片${
        stats.images ? `、${stats.images} 张图片` : ""
      }，正在刷新…`;
    });

  return (
    <div className="backup-panel">
      <h4>备份到本地</h4>
      <p className="helper">
        导出 ZIP 包：<code>pose-atlas.json</code> 存卡片与图册，
        <code>images/</code> 下是原图，可直接解压查看。图片不再转 base64，
        体积比旧的单个 JSON 小，也不会出现「导出后没有图片」的情况。
      </p>
      <p className="helper">
        备份只含卡片、图册和图片；AI
        密钥、登录信息与公开分享链接不会写入导出文件。
      </p>
      <div className="backup-actions">
        <button disabled={!!busy} onClick={() => void exportLocal(true)}>
          {busy === "正在打包图片…" ? "正在打包…" : "导出完整备份（含图片）"}
        </button>
        <button disabled={!!busy} onClick={() => void exportLocal(false)}>
          仅导出文字
        </button>
      </div>

      <h4>从备份恢复</h4>
      <div className="backup-mode">
        <label className="ai-check">
          <input
            type="radio"
            name="backup-mode"
            checked={mode === "merge"}
            onChange={() => setMode("merge")}
          />
          合并（保留本机现有卡片）
        </label>
        <label className="ai-check">
          <input
            type="radio"
            name="backup-mode"
            checked={mode === "replace"}
            onChange={() => setMode("replace")}
          />
          覆盖（清空后用备份替换）
        </label>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <div className="backup-actions">
        <button disabled={!!busy} onClick={() => fileRef.current?.click()}>
          选择备份文件…
        </button>
      </div>
      <p className="helper">支持新的 .zip 备份包，也兼容早期导出的 .json。</p>

      {busy && <p role="status">{busy}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
