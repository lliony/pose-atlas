import { useEffect, useRef, useState } from "react";
import type { AiConfig } from "../../lib/ai-types";
import type { AiProfile } from "../../services/ai-config";
import { createConfigStore } from "../../services/ai-config";
import { validPersonalConfig } from "../../lib/ai-ui";
import { testAiConfig } from "../../services/ai";
import { confirmAction } from "../Confirm";

const blank = (): AiProfile => ({
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
});

export default function AiSettings({
  store,
  onChanged,
  onBack,
  systemDefault = false,
}: {
  store: ReturnType<typeof createConfigStore>;
  onChanged: () => void;
  onBack?: () => void;
  /** 系统已配置默认模型时，下面的档案只是可选的覆盖 */
  systemDefault?: boolean;
}) {
  const [profiles, setProfiles] = useState<AiProfile[]>([]);
  const [draft, setDraft] = useState<AiProfile>(blank),
    [remember, setRemember] = useState(false),
    [message, setMessage] = useState(""),
    [testing, setTesting] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const refresh = () => {
    try {
      setProfiles(store.profiles());
      setRemember(store.isRemembered());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法读取模型档案");
    }
  };
  useEffect(refresh, [store]);
  useEffect(() => () => controller.current?.abort(), []);

  const update = (key: keyof AiConfig | "name", value: string) => {
    controller.current?.abort();
    setTesting(false);
    setMessage("");
    setDraft({ ...draft, [key]: value });
  };

  const save = () => {
    try {
      const id = draft.id || crypto.randomUUID();
      store.saveProfile({ ...draft, id, name: draft.name.trim() || draft.model.trim() }, remember);
      setDraft({ ...draft, id });
      setMessage("模型已保存");
      refresh();
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const remove = (profile: AiProfile) => {
    void confirmAction({
      title: "删除模型",
      message: `删除「${profile.name || profile.model}」？`,
      detail: "只影响这台浏览器里的档案，不会影响其他设备。",
      confirmText: "删除",
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      try {
        store.removeProfile(profile.id);
        if (draft.id === profile.id) setDraft(blank());
        setMessage("已删除");
        refresh();
        onChanged();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "删除失败");
      }
    });
  };

  const setUse = (feature: "recommend" | "draft", id: string) => {
    try {
      store.setUseFor(feature, id);
      refresh();
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const recommendId = store.useForId("recommend");
  const draftId = store.useForId("draft");

  return (
    <div className="ai-settings">
      {onBack && <button onClick={onBack}>← 返回推荐</button>}
      <h3>模型档案</h3>
      <p className="helper">
        {systemDefault
          ? "系统已配置默认模型，直接可用；下面的档案只在你想换用别的模型时才需要。"
          : "系统默认模型未配置。你可以在这里添加自己的模型（不同服务商或不同大小的模型）。"}
      </p>
      {profiles.length > 0 && (
        <ul className="profile-list">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className={draft.id === profile.id ? "active" : ""}
            >
              <button
                type="button"
                className="profile-pick"
                onClick={() => {
                  setDraft({ ...profile });
                  setMessage("");
                }}
              >
                <strong>{profile.name || profile.model}</strong>
                <small>{profile.model}</small>
              </button>
              <span className="profile-tags">
                {recommendId === profile.id && <em>推荐</em>}
                {draftId === profile.id && <em>填充</em>}
              </span>
              <button type="button" onClick={() => remove(profile)}>
                删除
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="form-row">
        <label>
          推荐用模型
          <select
            value={recommendId}
            onChange={(e) => setUse("recommend", e.target.value)}
          >
            <option value="">系统默认</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.model}
              </option>
            ))}
          </select>
        </label>
        <label>
          填充用模型
          <select
            value={draftId}
            onChange={(e) => setUse("draft", e.target.value)}
          >
            <option value="">系统默认</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.model}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h4 className="profile-form-title">
        {draft.id ? "编辑模型" : "新增模型"}
        {draft.id && (
          <button type="button" onClick={() => setDraft(blank())}>
            新建
          </button>
        )}
      </h4>
      <label>
        名称
        <input
          value={draft.name}
          placeholder="例如：视觉小模型"
          onChange={(e) => update("name", e.target.value)}
        />
      </label>
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
      {!remember && (
        <p className="helper">未勾选时模型只在本次页面有效，刷新后会丢失。</p>
      )}
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
          onClick={save}
        >
          保存模型
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
