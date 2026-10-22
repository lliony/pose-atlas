import { useEffect, useRef, useState } from "react";
import { confirmAction } from "./Confirm";
import { parseBackup, backupStats, type BackupFile } from "../lib/backup";
import {
  cloudBackupInfo,
  collectBackup,
  deleteCloudBackup,
  downloadBackup,
  downloadCloudBackup,
  ensureBackupCode,
  readBackupCode,
  restoreBackup,
  saveBackupCode,
  uploadCloudBackup,
  type CloudBackupInfo,
} from "../services/backup";

const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
};

export default function BackupPanel() {
  const [code, setCode] = useState(() => ensureBackupCode());
  const [cloud, setCloud] = useState<CloudBackupInfo | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshCloud = async (value = code) => {
    if (!value) return;
    try {
      setCloud(await cloudBackupInfo(value));
    } catch {
      setCloud(null);
    }
  };
  useEffect(() => {
    void refreshCloud(readBackupCode());
  }, []);

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
      const { cards } = backupStats(backup);
      const name = downloadBackup(backup);
      return `已导出 ${cards} 张卡片到 ${name}`;
    });

  const applyBackup = (backup: BackupFile) =>
    run("正在恢复…", async () => {
      const stats = await restoreBackup(backup, mode);
      setTimeout(() => location.reload(), 900);
      return `已${mode === "merge" ? "合并" : "覆盖"} ${stats.cards} 张卡片${
        stats.images ? `、${stats.images} 张图片` : ""
      }，正在刷新…`;
    });

  const importFile = async (file: File) =>
    run("正在读取备份…", async () => {
      const backup = parseBackup(await file.text());
      const stats = backupStats(backup);
      const ok = await confirmAction({
        title: mode === "merge" ? "合并导入" : "覆盖导入",
        message: `导入「${file.name}」？共 ${stats.cards} 张卡片、${stats.images} 张图片。`,
        detail:
          mode === "merge"
            ? "同 id 的卡片会被备份里的版本覆盖，其余保留。"
            : "会清空本机现有的卡片与图片，无法撤销。",
        confirmText: mode === "merge" ? "合并导入" : "覆盖导入",
        danger: mode === "replace",
      });
      if (!ok) return "已取消导入";
      await restoreBackup(backup, mode);
      setTimeout(() => location.reload(), 900);
      return `已${mode === "merge" ? "合并" : "覆盖"} ${stats.cards} 张卡片，正在刷新…`;
    });

  return (
    <div className="backup-panel">
      <h4>备份到本地</h4>
      <p className="helper">
        导出一个 JSON 文件，换电脑或清浏览器数据前先存一份。含图片的备份体积更大但能完整还原。
      </p>
      <div className="backup-actions">
        <button
          disabled={!!busy}
          onClick={() => void exportLocal(true)}
        >
          {busy === "正在打包图片…" ? "正在打包…" : "导出（含图片）"}
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
        accept="application/json,.json"
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

      <h4>云端备份</h4>
      <p className="helper">
        内容先在本机加密再上传，服务器只存密文；备份码是唯一凭据，丢了就取不回。
      </p>
      <label>
        备份码
        <input
          aria-label="备份码"
          value={code}
          spellCheck={false}
          onChange={(e) => {
            setCode(e.target.value.trim());
          }}
          onBlur={() => {
            saveBackupCode(code);
            void refreshCloud(code);
          }}
        />
      </label>
      <div className="backup-actions">
        <button
          disabled={!!busy || !code}
          onClick={() =>
            void run("正在加密上传…", async () => {
              saveBackupCode(code);
              const backup = await collectBackup(true);
              const info = await uploadCloudBackup(code, backup);
              setCloud(info);
              return `已上传 ${info.cards} 张卡片（${formatBytes(info.bytes)}）`;
            })
          }
        >
          上传到云端
        </button>
        <button
          disabled={!!busy || !code || !cloud}
          onClick={() =>
            void run("正在下载解密…", async () => {
              const backup = await downloadCloudBackup(code);
              const stats = backupStats(backup);
              const ok = await confirmAction({
                title: "从云端恢复",
                message: `用云端备份覆盖本机？共 ${stats.cards} 张卡片。`,
                detail: "本机现有数据会被清空，无法撤销。",
                confirmText: "覆盖恢复",
                danger: true,
              });
              if (!ok) return "已取消";
              await restoreBackup(backup, "replace");
              setTimeout(() => location.reload(), 900);
              return "已从云端恢复，正在刷新…";
            })
          }
        >
          从云端恢复
        </button>
        <button
          disabled={!!busy || !code || !cloud}
          onClick={() =>
            void run("正在删除…", async () => {
              const ok = await confirmAction({
                title: "删除云端备份",
                message: "删除这个备份码对应的云端备份？",
                detail: "本机数据不受影响。",
                confirmText: "删除",
                danger: true,
              });
              if (!ok) return "已取消";
              await deleteCloudBackup(code);
              setCloud(null);
              return "云端备份已删除";
            })
          }
        >
          删除云端备份
        </button>
      </div>
      <p className="helper">
        {cloud
          ? `云端：${formatDate(cloud.updatedAt)} · ${cloud.cards} 张卡片 · ${cloud.images} 张图片 · ${formatBytes(cloud.bytes)}`
          : "云端暂无这份备份"}
      </p>
      {busy && <p role="status">{busy}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
