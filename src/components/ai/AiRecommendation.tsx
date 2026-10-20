import { useEffect, useRef, useState } from "react";
import type { State, Card } from "../../lib/types";
import type { AiConfig, AiImage, AiMode, AiScope } from "../../lib/ai-types";
import { buildCandidates } from "../../lib/ai-model";
import { validPersonalConfig } from "../../lib/ai-ui";
import { createRequestSession } from "../../lib/ai-request-session";
import { createConfigStore } from "../../services/ai-config";
import { getAiAvailability } from "../../services/ai";
import { prepareAiImage } from "../../services/ai-image";
import { useAiRecommendation } from "../../hooks/useAiRecommendation";
import Dialog from "../Dialog";
import AiSettings from "./AiSettings";
import AiResults from "./AiResults";
export default function AiRecommendation({
  state,
  onSave,
  onRead,
  onClose,
  store,
}: {
  state: State;
  userId: string;
  onSave: (state: State) => Promise<void>;
  onRead: (card: Card) => void;
  onClose: () => void;
  store: ReturnType<typeof createConfigStore>;
}) {
  const [settings, setSettings] = useState(false),
    [config, setConfig] = useState<AiConfig | null>(null),
    [remembered, setRemembered] = useState(false),
    [configError, setConfigError] = useState(""),
    [defaultAvailable, setDefaultAvailable] = useState<boolean | null>(null),
    [availabilityError, setAvailabilityError] = useState(""),
    [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [mode, setMode] = useState<AiMode>("scene"),
    [scope, setScope] = useState<AiScope>({ kind: "all" }),
    [description, setDescription] = useState(""),
    [image, setImage] = useState<AiImage>(),
    [preview, setPreview] = useState(""),
    [imageBusy, setImageBusy] = useState(false),
    [message, setMessage] = useState(""),
    [showResult, setShowResult] = useState(false),
    [usedPersonal, setUsedPersonal] = useState(false);
  const selection = useRef(createRequestSession()),
    previewRef = useRef("");
  const { run, cancel, result, loading, error } = useAiRecommendation();
  useEffect(() => {
    try {
      setConfig(store.load());
      setRemembered(store.isRemembered());
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "无法读取配置");
    }
  }, [store]);
  useEffect(() => {
    const c = new AbortController();
    setAvailabilityError("");
    setDefaultAvailable(null);
    void getAiAvailability(c.signal).then(
      (v) => {
        if (!c.signal.aborted) setDefaultAvailable(v);
      },
      (e) => {
        if (!c.signal.aborted) setAvailabilityError(e.message);
      },
    );
    return () => c.abort();
  }, [availabilityVersion]);
  useEffect(
    () => () => {
      selection.current.cancel();
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const invalidate = () => {
    cancel();
    setShowResult(false);
    setMessage("");
  };
  const removeImage = () => {
    selection.current.cancel();
    setImageBusy(false);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setPreview("");
    setImage(undefined);
    invalidate();
  };
  const submit = async (useDefault = false) => {
    setMessage("");
    let candidates;
    try {
      candidates = buildCandidates(state, scope);
      if (!candidates.length) throw Error("此范围没有可用卡片，请重新选择范围");
      if (!description.trim() && !image) throw Error("请添加图片或文字描述");
      if (configError && !validPersonalConfig(config)) throw Error(configError);
      if (!useDefault && !validPersonalConfig(config) && !defaultAvailable)
        throw Error("请先配置可用的 AI 服务");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "请检查输入");
      return;
    }
    setUsedPersonal(!useDefault && validPersonalConfig(config));
    setShowResult(true);
    await run({
      mode,
      scope,
      description,
      image,
      candidates,
      selection:
        !useDefault && validPersonalConfig(config)
          ? { kind: "personal", config }
          : { kind: "default" },
    });
  };
  const destination = validPersonalConfig(config) && (!showResult || usedPersonal)
    ? new URL(config.baseUrl).hostname
    : "系统默认 AI";
  return (
    <Dialog title="AI 推荐" wide onClose={onClose}>
      <div className="dialog-content ai-panel">
        {configError && <p role="alert">{configError}</p>}
        {settings ? (
          <AiSettings
            config={config}
            remembered={remembered}
            onBack={() => setSettings(false)}
            onSave={(next, remember) => {
              invalidate();
              try {
                store.save(next, remember);
                setConfig(next);
                setRemembered(store.isRemembered());
                setConfigError("");
                setSettings(false);
              } catch (e) {
                setConfig(store.load());
                setConfigError(e instanceof Error ? e.message : "保存失败");
              }
            }}
            onClear={() => {
              invalidate();
              setConfig(null);
              try {
                store.clear();
                setRemembered(false);
                setConfigError("");
                setSettings(false);
              } catch (e) {
                setConfigError(e instanceof Error ? e.message : "清除失败");
              }
            }}
          />
        ) : (
          <>
            <div className="actions">
              <button onClick={() => setSettings(true)}>AI 设置</button>
            </div>
            <fieldset>
              <legend>推荐模式</legend>
              {(
                [
                  ["scene", "现场适配"],
                  ["reference", "参考图匹配"],
                ] as const
              ).map(([value, label]) => (
                <label className="ai-check" key={value}>
                  <input
                    type="radio"
                    name="ai-mode"
                    checked={mode === value}
                    onChange={() => {
                      invalidate();
                      setMode(value);
                    }}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label>
              添加一张图片
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  invalidate();
                  const active = selection.current.begin();
                  setImageBusy(true);
                  setMessage("");
                  try {
                    const next = await prepareAiImage(file);
                    if (!selection.current.isCurrent(active.id)) return;
                    const url = URL.createObjectURL(file);
                    if (previewRef.current)
                      URL.revokeObjectURL(previewRef.current);
                    previewRef.current = url;
                    setPreview(url);
                    setImage(next);
                  } catch (e) {
                    if (selection.current.isCurrent(active.id))
                      setMessage(
                        e instanceof Error ? e.message : "图片处理失败",
                      );
                  } finally {
                    if (selection.current.isCurrent(active.id))
                      setImageBusy(false);
                  }
                }}
              />
            </label>
            {preview && (
              <div className="ai-preview">
                <img src={preview} alt="已选推荐参考图" />
                <button onClick={removeImage}>移除图片</button>
              </div>
            )}
            {imageBusy && <p role="status">正在处理图片…</p>}
            <label>
              拍摄描述
              <textarea
                value={description}
                placeholder="描述现场光线、环境、人物或希望匹配的姿势…"
                onChange={(e) => {
                  invalidate();
                  setDescription(e.target.value);
                }}
              />
            </label>
            <label>
              推荐范围
              <select
                value={
                  scope.kind === "all" ? "all" : `${scope.kind}:${scope.id}`
                }
                onChange={(e) => {
                  invalidate();
                  const [kind, id] = e.target.value.split(":");
                  setScope(
                    kind === "all"
                      ? { kind: "all" }
                      : { kind: kind as "album" | "category", id },
                  );
                }}
              >
                <option value="all">全库</option>
                {state.albums.map((a) => (
                  <option key={"album:" + a.id} value={"album:" + a.id}>
                    卡片册 · {a.name}
                  </option>
                ))}
                {state.categories.map((c) => (
                  <option key={"category:" + c.id} value={"category:" + c.id}>
                    场景 · {c.name}
                  </option>
                ))}
              </select>
            </label>
            {availabilityError && (
              <div role="alert">
                {availabilityError}{" "}
                <button onClick={() => setAvailabilityVersion((v) => v + 1)}>
                  重试连接
                </button>
              </div>
            )}
            {defaultAvailable === null && !availabilityError && (
              <p role="status">正在检查默认 AI…</p>
            )}
            {!validPersonalConfig(config) && defaultAvailable === false && (
              <p>
                尚未配置 AI。
                <button onClick={() => setSettings(true)}>打开 AI 设置</button>
              </p>
            )}
            <p className="helper">
              发送至：{destination} ·
              不发送私人备注。所选图片及候选教学文字将发送至此服务。
            </p>
            <div className="actions">
              <button
                className="primary"
                disabled={
                  loading ||
                  imageBusy ||
                  (!!configError && !validPersonalConfig(config)) ||
                  (!validPersonalConfig(config) && defaultAvailable !== true)
                }
                onClick={() => void submit()}
              >
                开始推荐
              </button>
              {loading && (
                <button
                  onClick={() => {
                    cancel();
                    setShowResult(false);
                  }}
                >
                  取消推荐
                </button>
              )}
            </div>
            {loading && <p role="status">正在寻找适合的姿势…</p>}
            {message && <p role="alert">{message}</p>}
            {showResult && error && (
              <div role="alert">
                {error}
                {usedPersonal && defaultAvailable === true && (
                  <button onClick={() => void submit(true)}>
                    改用默认 AI 重试
                  </button>
                )}
              </div>
            )}
            {showResult && result && (
              <AiResults
                key={JSON.stringify(result)}
                state={state}
                scope={scope}
                result={result}
                onRead={onRead}
                onSave={onSave}
              />
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
