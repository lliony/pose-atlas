import { useEffect, useState } from "react";
import { createConfigStore } from "../services/ai-config";
import { getAiAvailability } from "../services/ai";
import Dialog from "./Dialog";
import ThemeSwitch from "./ThemeSwitch";
import AiSettings from "./ai/AiSettings";
import BackupPanel from "./BackupPanel";

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
