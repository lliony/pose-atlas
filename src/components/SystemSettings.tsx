import { useEffect, useState } from "react";
import { createConfigStore } from "../services/ai-config";
import { getAiAvailability } from "../services/ai";
import { api, isLocalMode, type Workspace } from "../services/api";
import {
  compressStoredImages,
  measureUsage,
  pruneForState,
} from "../services/image-store";
import { IMAGE_MAX_EDGE } from "../lib/image-compression";
import { loadImageSettings, saveImageSettings } from "../lib/image-settings";
import Dialog from "./Dialog";
import ThemeSwitch from "./ThemeSwitch";
import AiSettings from "./ai/AiSettings";
import BackupPanel from "./BackupPanel";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function currentUsage(): Promise<{
  images: number;
  data: number;
} | null> {
  return measureUsage().catch(() => null);
}

export default function SystemSettings({
  store,
  showGrid,
  onGrid,
  onChanged,
  onClose,
}: {
  store: ReturnType<typeof createConfigStore>;
  showGrid: boolean;
  onGrid: (value: boolean) => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [availability, setAvailability] = useState("正在检查系统默认 AI…");
  const [hasDefault, setHasDefault] = useState(false);
  const [keepOriginal, setKeepOriginal] = useState(
    () => loadImageSettings().keepOriginal,
  );
  const [compressing, setCompressing] = useState(false);
  const [storageNote, setStorageNote] = useState("");
  const [usage, setUsage] = useState<{ images: number; data: number } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    void currentUsage().then((value) => {
      if (alive && value) setUsage(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  const compressAll = async () => {
    setCompressing(true);
    setStorageNote("");
    try {
      const result = await compressStoredImages();
      setStorageNote(
        result.compressed
          ? `已压缩 ${result.compressed} 张，释放约 ${formatBytes(result.savedBytes)}${result.failed ? `；${result.failed} 张读取失败已跳过` : ""}`
          : result.failed
            ? `没有可压缩的图片；${result.failed} 张读取失败`
            : "已是最省空间的尺寸，没有需要压缩的图片",
      );
      const value = await currentUsage();
      if (value) setUsage(value);
    } catch (error) {
      setStorageNote(error instanceof Error ? error.message : "压缩失败，请重试");
    } finally {
      setCompressing(false);
    }
  };
  const cleanup = async () => {
    setCompressing(true);
    setStorageNote("");
    try {
      const workspace = await api<Workspace>("workspace", "GET");
      const result = await pruneForState(workspace.state);
      setStorageNote(
        result.removed
          ? `已清理 ${result.removed} 张无引用图片，释放约 ${formatBytes(result.savedBytes)}`
          : "没有发现无引用的图片",
      );
      const value = await currentUsage();
      if (value) setUsage(value);
    } catch (error) {
      setStorageNote(
        error instanceof Error ? error.message : "清理失败，请重试",
      );
    } finally {
      setCompressing(false);
    }
  };
  useEffect(() => {
    try {
      setReady(true);
    } catch {
      setMessage("无法读取配置，请检查浏览器存储权限后重新打开设置。");
    }
    const controller = new AbortController();
    void getAiAvailability(controller.signal).then(
      (available) => {
        setHasDefault(available);
        setAvailability(
          available
            ? "系统默认 AI 已配置"
            : "系统默认 AI 未配置，请填写下方个人配置",
        );
      },
      () => {
        if (!controller.signal.aborted)
          setAvailability("无法连接本地 AI 服务，请检查服务是否启动");
      },
    );
    return () => controller.abort();
  }, [store]);
  return (
    <Dialog title="系统设置" onClose={onClose}>
      <div className="dialog-content ai-panel system-settings">
        <section>
          <h3>显示偏好</h3>
          <p className="helper">设置会保存在当前浏览器。</p>
          <ThemeSwitch />
          <label className="ai-check">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => onGrid(e.target.checked)}
            />
            默认显示构图网格（3×3）
          </label>
        </section>
        <section>
          <h3>图片存储</h3>
          <p className="helper">
            上传的图片会压到长边 {IMAGE_MAX_EDGE}px
            的 JPEG（70×100mm 打印约 400dpi），比原图省约 85% 空间。
          </p>
          <label className="ai-check">
            <input
              type="checkbox"
              checked={keepOriginal}
              onChange={(e) => {
                try {
                  saveImageSettings({ keepOriginal: e.target.checked });
                  setKeepOriginal(e.target.checked);
                  setStorageNote("图片设置已保存");
                } catch (error) {
                  setStorageNote(
                    error instanceof Error ? error.message : "保存失败",
                  );
                }
              }}
            />
            保留原图（不压缩，更占空间）
          </label>
          {isLocalMode && (
            <div className="actions">
              <button
                type="button"
                disabled={compressing}
                onClick={compressAll}
              >
                {compressing ? "处理中…" : "压缩已存图片"}
              </button>
              <button
                type="button"
                disabled={compressing}
                onClick={cleanup}
              >
                清理无引用图片
              </button>
            </div>
          )}
          {storageNote && <p role="status">{storageNote}</p>}
          {isLocalMode && usage && (
            <p className="helper">
              本机占用：图片 {formatBytes(usage.images)} · 资料{" "}
              {formatBytes(usage.data)}（按实际存储字节统计）
            </p>
          )}
        </section>
        <section>
          <h3>备份与恢复</h3>
          <p className="helper">数据只存在这台浏览器里，换设备或清缓存前先备份。</p>
          <BackupPanel />
        </section>
        <section>
          <h3>AI 服务</h3>
          <p role="status">{availability}</p>
          <p className="helper">
            系统默认服务由本地服务环境配置；个人配置优先使用。
          </p>
          {ready && (
            <AiSettings
              store={store}
              systemDefault={hasDefault}
              onChanged={() => {
                setMessage("AI 设置已更新");
                onChanged();
              }}            />
          )}
        </section>
        {message && <p role="status">{message}</p>}
      </div>
    </Dialog>
  );
}
