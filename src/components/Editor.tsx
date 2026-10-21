import { resolveImageUrl, uploadImage } from "../services/api";
import { requestCardDraft } from "../services/ai";
import type { createConfigStore } from "../services/ai-config";

import { useEffect, useRef, useState } from "react";
import Dialog from "./Dialog";
import Photo from "./Photo";
import { GENDERS, STYLES } from '../lib/card-appearance';
import {
  RATIO_KEYS,
  cropToRatio,
  measureFile,
  ratioKey,
  sizeOfPhoto,
  type RatioKey,
} from '../lib/image-ratio';
import {
  labels,
  uid,
  type Card,
  type Category,
  type Photo as Picture,
  type Notes,
} from "../lib/types";
import type { Card as CardType } from "../lib/types";

function readDraft(
  key: string,
  card: Card,
): { value: Card; restored: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { value: structuredClone(card), restored: false };
    const parsed = JSON.parse(raw) as CardType;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.images))
      return { value: structuredClone(card), restored: false };
    return { value: parsed, restored: true };
  } catch {
    return { value: structuredClone(card), restored: false };
  }
}

export default function Editor({
  card,
  categories,
  onSave,
  onClose,
  draftKey,
  intent,
  aiStore,
}: {
  card: Card;
  categories: Category[];
  onSave: (card: Card) => Promise<void>;
  onClose: () => void;
  draftKey: string;
  intent?: "photos";
  aiStore?: ReturnType<typeof createConfigStore>;
}) {
  const [initial] = useState(() => readDraft(draftKey, card)),
    [value, setValue] = useState<Card>(initial.value),
    [restored, setRestored] = useState(initial.restored),
    [index, setIndex] = useState(0),
    [mode, setMode] = useState<"default" | "image">("default"),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(""),
    [cropTarget, setCropTarget] = useState<RatioKey>("3:4"),
    [aiBusy, setAiBusy] = useState(false),
    [aiError, setAiError] = useState(""),
    [cropping, setCropping] = useState(false),
    [error, setError] = useState("");
  const dirty = useRef(false),
    drag = useRef(0),
    uploadRef = useRef<HTMLInputElement>(null);
  const photo = value.images[index];
  const photoSize = photo ? sizeOfPhoto(photo, new Map()) : null;
  const photoRatio = photoSize ? ratioKey(photoSize.w, photoSize.h) : null;
  const cropCurrent = async () => {
    if (!photo || cropping) return;
    setCropping(true);
    setError("");
    try {
      const url = await resolveImageUrl(photo.src);
      const cropped = await cropToRatio(url, cropTarget);
      if (!cropped) throw Error("裁切失败，请换一张图重试");
      const data = await uploadImage(cropped.file);
      update({
        images: value.images.map((item, i) =>
          i === index
            ? {
                ...item,
                src: data.src,
                panel: null,
                width: cropped.size.w,
                height: cropped.size.h,
              }
            : item,
        ),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCropping(false);
    }
  };
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(value));
    } catch {}
  }, [value, draftKey]);
  // 从「详情 → 添加照片」进来时，直接把上传区滚到眼前
  useEffect(() => {
    if (intent !== "photos") return;
    const input = uploadRef.current;
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
  }, [intent]);
  const toAiImage = async (src: string) => {
    try {
      const url = await resolveImageUrl(src);
      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(null);
        el.src = url;
      });
      if (!img) return undefined;
      const scale = Math.min(
        1,
        1600 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      return base64 ? { mime: "image/jpeg" as const, base64 } : undefined;
    } catch {
      return undefined;
    }
  };
  const aiFill = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    setAiError("");
    try {
      const config = aiStore?.load() ?? null;
      const selection = config
        ? ({ kind: "personal", config } as const)
        : ({ kind: "default" } as const);
      const image = photo ? await toAiImage(photo.src) : undefined;
      if (!image && !value.title.trim())
        throw Error("先上传一张参考图，或先填一个标题");
      const draft = await requestCardDraft(
        {
          selection,
          title: value.title.trim() || undefined,
          image,
        },
        new AbortController().signal,
      );
      dirty.current = true;
      setValue((v) => ({
        ...v,
        title: v.title.trim() || draft.title,
        tags: v.tags.length ? v.tags : draft.tags,
        gender: v.gender ?? draft.gender,
        styles: v.styles?.length ? v.styles : draft.styles,
        notes: {
          pose: v.notes.pose || draft.notes.pose,
          camera: v.notes.camera || draft.notes.camera,
          composition: v.notes.composition || draft.notes.composition,
          light: v.notes.light || draft.notes.light,
          cautions: v.notes.cautions || draft.notes.cautions,
        },
      }));
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiBusy(false);
    }
  };
  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
    setValue(structuredClone(card));
    setIndex(0);
    setMode("default");
    setRestored(false);
    dirty.current = false;
  };
  const update = (patch: Partial<Card>) => {
    dirty.current = true;
    setValue((v) => ({ ...v, ...patch }));
  };
  const close = () => {
    if (!dirty.current || confirm("修改已保留为本机草稿，确定关闭编辑吗？"))
      onClose();
  };
  const note = (key: string, text: string) => {
    if (mode === "default") update({ notes: { ...value.notes, [key]: text } });
    else if (photo)
      update({
        images: value.images.map((p, i) =>
          i === index ? { ...p, notes: { ...p.notes, [key]: text } } : p,
        ),
      });
  };
  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= value.images.length) return;
    const list = [...value.images];
    list.splice(to, 0, list.splice(from, 1)[0]);
    update({ images: list });
    setIndex(to);
  };
  async function upload(files: FileList | null) {
    if (!files) return;
    if (files.length + value.images.length > 20) {
      setError("每张卡片最多20张图片");
      return;
    }
    setError("");
    const additions: Picture[] = [];
    for (const file of Array.from(files)) {
      setUploading("正在上传 " + file.name);
      try {
        if (file.size > 20 * 1024 * 1024) throw Error("图片大于20MB");
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw Error("仅支持JPEG、PNG和WebP");
        const size = await measureFile(file);
        const data = await uploadImage(file);
        additions.push({
          id: uid(),
          src: data.src,
          ai: false,
          notes: {},
          width: size?.w,
          height: size?.h,
        });
      } catch (e: any) {
        setError(file.name + "：" + e.message + "。可重新选择该文件重试。");
      }
    }
    setUploading("");
    if (additions.length) {
      dirty.current = true;
      setValue((v) => ({ ...v, images: [...v.images, ...additions] }));
    }
  }
  return (
    <Dialog
      title={card.title ? "编辑姿势卡片" : "收录一个新姿势"}
      onClose={close}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.images.length) {
            setError("请至少上传一张图片");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await onSave({ ...value, title: value.title.trim() });
            localStorage.removeItem(draftKey);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {restored && (
          <p className="draft-note" role="status">
            已恢复上次未保存的修改。
            <button type="button" onClick={discardDraft}>
              放弃草稿，改用已保存版本
            </button>
          </p>
        )}
        <div className="editor-grid">
          <section className="editor-media">
            <div className="section-heading">
              <h3>参考图片</h3>
              <span>{value.images.length} / 20</span>
            </div>
            {photo ? (
              <div
                className="editor-preview"
                style={
                  photoSize
                    ? { aspectRatio: `${photoSize.w} / ${photoSize.h}` }
                    : undefined
                }
              >
                <Photo image={photo} title={value.title} />
              </div>
            ) : (
              <div className="upload-empty">
                ＋<p>把你的拍摄灵感放进来</p>
                <small>JPEG / PNG / WebP，单张最大20MB</small>
              </div>
            )}
            <div className="thumb-list">
              {value.images.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  className={i === index ? "active" : ""}
                  draggable
                  onDragStart={() => (drag.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorder(drag.current, i)}
                  onClick={() => setIndex(i)}
                  aria-label={"选择第" + (i + 1) + "张图片"}
                >
                  <Photo image={p} title={"参考" + (i + 1)} />
                  <span>
                    {i === 0 ? "封面" : String(i + 1).padStart(2, "0")}
                  </span>
                </button>
              ))}
            </div>
            {photo && (
              <div className="photo-tools">
                <button
                  type="button"
                  onClick={() => reorder(index, index - 1)}
                  disabled={!index}
                >
                  ← 前移
                </button>
                <button
                  type="button"
                  onClick={() => reorder(index, index + 1)}
                  disabled={index === value.images.length - 1}
                >
                  后移 →
                </button>
                <button type="button" onClick={() => reorder(index, 0)}>
                  设为封面
                </button>
                <button
                  type="button"
                  onClick={() => {
                    update({
                      images: value.images.filter((_, i) => i !== index),
                    });
                    setIndex(0);
                  }}
                >
                  移除
                </button>
              </div>
            )}
            {photo && (
              <div className="ratio-check">
                <span>
                  当前图{" "}
                  {photoSize
                    ? `${photoSize.w}×${photoSize.h} · ${photoRatio ?? "非标准比例"}`
                    : "尺寸未知（重新上传后可识别）"}
                </span>
                {!photoRatio && photoSize && (
                  <>
                    <span className="ratio-warn">
                      比例不在 1:1 / 3:4 / 4:3 / 9:16 / 16:9 内，筛选里不会出现，打印会单独成组。
                    </span>
                    <select
                      aria-label="裁切比例"
                      value={cropTarget}
                      onChange={(e) => setCropTarget(e.target.value as RatioKey)}
                    >
                      {RATIO_KEYS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void cropCurrent()}
                      disabled={cropping}
                    >
                      {cropping ? "正在裁切…" : "居中裁切并替换"}
                    </button>
                  </>
                )}
              </div>
            )}
            <label className="upload-button">
              ＋ 上传参考图
              <input
                ref={uploadRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={!!uploading}
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="helper">
              第一张图片作为封面。拖动或使用前移、后移调整顺序。
            </p>
            {photo && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={photo.ai}
                  onChange={(e) =>
                    update({
                      images: value.images.map((p, i) =>
                        i === index ? { ...p, ai: e.target.checked } : p,
                      ),
                    })
                  }
                />
                当前图片为 AI 生成
              </label>
            )}
            <p role="status">{uploading}</p>
          </section>
          <section className="editor-fields">
            <div className="ai-fill">
              <button
                type="button"
                onClick={() => void aiFill()}
                disabled={aiBusy || !!uploading}
              >
                {aiBusy ? "✦ AI 正在写…" : "✦ AI 帮我填满"}
              </button>
              <span className="helper">
                用当前图片生成标题、标签与五段教学；已填写的内容不会被覆盖。
              </span>
            </div>
            {aiError && (
              <p className="form-error" role="alert">
                {aiError}
              </p>
            )}
            <div className="form-row">
              <label>人物性别<select value={value.gender || ''} onChange={e=>update({gender:e.target.value || undefined})}><option value="">未分类</option>{GENDERS.map(g=><option key={g}>{g}</option>)}</select></label>
            </div>
            <fieldset className="style-options"><legend>气质风格（可多选）</legend>{STYLES.map(s=><label key={s}><input type="checkbox" checked={value.styles?.includes(s) || false} onChange={e=>update({styles:e.target.checked?[...(value.styles || []),s]:(value.styles || []).filter(x=>x!==s)})}/>{s}</label>)}</fieldset>
            <div className="form-row">
              <label>
                卡片标题
                <input
                  value={value.title}
                  maxLength={100}
                  required
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="例如：窗边侧坐，轻轻回头"
                />
              </label>
              <label>
                所属分类
                <select
                  value={value.categoryId}
                  onChange={(e) => update({ categoryId: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              标签 <span className="helper">用逗号分隔，最多12个</span>
              <input
                defaultValue={value.tags.join("，")}
                onBlur={(e) =>
                  update({
                    tags: e.target.value
                      .split(/[,，]/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 12),
                  })
                }
              />
            </label>
            <div className="edit-tabs">
              <button
                type="button"
                className={mode === "default" ? "active" : ""}
                onClick={() => setMode("default")}
              >
                卡片通用教学
              </button>
              <button
                type="button"
                className={mode === "image" ? "active" : ""}
                disabled={!photo}
                onClick={() => setMode("image")}
              >
                第 {index + 1} 张图片专属
              </button>
            </div>
            <p className="helper">
              {mode === "default"
                ? "默认应用于所有图片，每张图片可单独覆盖。"
                : "留空的栏目继承通用教学；填写后仅应用于当前图片。"}
            </p>
            {Object.entries(labels).map(([k, label]) => (
              <label key={k}>
                {label}
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={
                    (mode === "default" ? value.notes : photo?.notes)?.[
                      k as keyof Notes
                    ] || ""
                  }
                  placeholder={
                    mode === "image"
                      ? value.notes[k as keyof Notes] || "留空则继承通用教学"
                      : "写得具体一点，让现场拍摄更轻松。"
                  }
                  onChange={(e) => note(k, e.target.value)}
                />
              </label>
            ))}
            <label>
              私人备注 <span className="private-badge">仅自己可见</span>
              <textarea
                rows={2}
                maxLength={4000}
                value={value.privateNote}
                onChange={(e) => update({ privateNote: e.target.value })}
                placeholder="不会出现在公开分享或打印中"
              />
            </label>
          </section>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <span className="helper">编辑草稿保存在当前设备</span>
          <button type="button" onClick={close}>
            暂时关闭
          </button>
          <button className="primary" disabled={busy || !!uploading}>
            {busy ? "正在保存…" : "保存卡片"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
