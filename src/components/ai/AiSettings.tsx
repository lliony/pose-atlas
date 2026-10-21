import { useEffect, useRef, useState } from "react";
import type { AiConfig } from "../../lib/ai-types";
import { validPersonalConfig } from "../../lib/ai-ui";
import { testAiConfig } from "../../services/ai";
export default function AiSettings({
  config,
  remembered,
  onSave,
  onClear,
  onBack,
}: {
  config: AiConfig | null;
  remembered: boolean;
  onSave: (config: AiConfig, remember: boolean) => void;
  onClear: () => void;
  onBack?: () => void;
}) {
  const [draft, setDraft] = useState(
    config || { baseUrl: "", apiKey: "", model: "" },
  );
  const [remember, setRemember] = useState(remembered),
    [message, setMessage] = useState(""),
    [testing, setTesting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setTesting(false);
    setDraft(config || { baseUrl: "", apiKey: "", model: "" });
    setRemember(remembered);
    setMessage("");
  }, [config, remembered]);
  useEffect(() => () => controller.current?.abort(), []);
  const update = (key: keyof AiConfig, value: string) => {
    controller.current?.abort();
    setTesting(false);
    setMessage("");
    setDraft({ ...draft, [key]: value });
  };
  return (
    <div className="ai-settings">
      {onBack && <button onClick={onBack}>← 返回推荐</button>}
      <h3>个人 AI 设置</h3>
      <p className="helper">
        兼容 OpenAI Chat Completions；仅支持公网 HTTPS。个人配置优先使用。
      </p>
      <label>
        基础地址
        <input
          value={draft.baseUrl}
          placeholder="https://api.example.com/v1"
          onChange={(e) => update("baseUrl", e.target.value)}
        />
      </label>
      <label>
        API key
        <input
          type="password"
          autoComplete="off"
          value={draft.apiKey}
          onChange={(e) => update("apiKey", e.target.value)}
        />
      </label>
      <label>
        模型
        <input
          value={draft.model}
          onChange={(e) => update("model", e.target.value)}
        />
      </label>
      <label className="ai-check">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        记住本机（密钥会保存在此浏览器，同源脚本可读取）
      </label>
      {!validPersonalConfig(draft) && (
        <p className="helper">请填写完整的 HTTPS 基础地址、密钥和模型。</p>
      )}
      <div className="actions">
        <button
          disabled={!validPersonalConfig(draft) || testing}
          onClick={async () => {
            const c = new AbortController();
            controller.current?.abort();
            controller.current = c;
            setTesting(true);
            setMessage("");
            try {
              await testAiConfig(draft, c.signal);
              if (!c.signal.aborted)
                setMessage("文字连接成功，图片能力将在推荐时验证");
            } catch (e) {
              if (!c.signal.aborted)
                setMessage(e instanceof Error ? e.message : "连接失败");
            } finally {
              if (!c.signal.aborted) setTesting(false);
            }
          }}
        >
          测试连接
        </button>
        <button
          className="primary"
          disabled={!validPersonalConfig(draft)}
          onClick={() => onSave(draft, remember)}
        >
          保存设置
        </button>
        <button
          onClick={() => {
            controller.current?.abort();
            setTesting(false);
            setMessage("");
            setDraft({ baseUrl: "", apiKey: "", model: "" });
            onClear();
          }}
        >
          清除个人配置
        </button>
      </div>
      {testing && <p role="status">正在测试连接…</p>}
      {message && (
        <p role={message.startsWith("文字连接成功") ? "status" : "alert"}>
          {message}
        </p>
      )}
    </div>
  );
}
