import { uploadImage } from "../services/api";

import { useEffect, useRef, useState } from "react";
import Dialog from "./Dialog";
import Photo from "./Photo";
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
}: {
  card: Card;
  categories: Category[];
  onSave: (card: Card) => Promise<void>;
  onClose: () => void;
  draftKey: string;
  intent?: "photos";
}) {
  const [initial] = useState(() => readDraft(draftKey, card)),
    [value, setValue] = useState<Card>(initial.value),
    [restored, setRestored] = useState(initial.restored),
    [index, setIndex] = useState(0),
    [mode, setMode] = useState<"default" | "image">("default"),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(""),
    [error, setError] = useState("");
  const dirty = useRef(false),
    drag = useRef(0),
    uploadRef = useRef<HTMLInputElement>(null);
  const photo = value.images[index];
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
        const data = await uploadImage(file);
        additions.push({ id: uid(), src: data.src, ai: false, notes: {} });
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
              <Photo image={photo} title={value.title} />
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
