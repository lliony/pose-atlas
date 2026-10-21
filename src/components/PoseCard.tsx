import { useState, type CSSProperties } from "react";
import { resolveNotes } from "../lib/model";
import { labels, type Card } from "../lib/types";
import { aspectOf, ratioKey, sizeOfPhoto, type PhotoSize } from "../lib/image-ratio";
import Photo from "./Photo";
export default function PoseCard({
  card,
  category,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onRead,
  shareId,
  sizes,
  readonly = false,
}: {
  card: Card;
  category: string;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRead: () => void;
  shareId?: string;
  sizes?: Map<string, PhotoSize>;
  readonly?: boolean;
}) {
  const [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false);
  const photo = card.images[Math.min(index, card.images.length - 1)],
    notes = resolveNotes(card, photo),
    size = sizeOfPhoto(photo, sizes ?? new Map()),
    ratioLabel = size ? ratioKey(size.w, size.h) : null;
  return (
    <article
      className={"pose-card " + (selected ? "selected" : "")}
      style={{ "--card-aspect": aspectOf(photo, sizes ?? new Map()) } as CSSProperties}
    >
      <div className={"flip-shell " + (flipped ? "is-flipped" : "")}>
        <section className="face front" aria-hidden={flipped} inert={flipped}>
          <div className="card-meta">
            <span>
              <span className="pose-code">{card.code}</span> <span>{category}</span>
            </span>
            <button
              className={"check-btn " + (selected ? "checked" : "")}
              onClick={onSelect}
              aria-pressed={selected}
              aria-label={"选择 " + card.title}
            >
              {selected ? "✓" : "+"}
            </button>
          </div>
          <Photo image={photo} title={card.title} shareId={shareId} />
          {size && !ratioLabel && (
            <span className="ratio-badge">非标准比例</span>
          )}
          <div className="card-caption">
            <div className="card-title">
              <h3>{card.title}</h3>
              {!readonly && (
                <button
                  className="icon-btn edit-icon"
                  onClick={onEdit}
                  aria-label={"编辑 " + card.title}
                >
                  ↗
                </button>
              )}
            </div>
            <p className="tags">
              {[...new Set([...(card.gender ? [card.gender] : []), ...(card.styles || []), ...card.tags])].join(" · ")} <span> / </span> {card.images.length}{" "}
              张参考
            </p>
            <div className="mini-note">
              <span>构图笔记</span>
              <p>{notes.composition || "添加一条你的构图思路。"}</p>
            </div>
          </div>
          <div className="card-bottom">
            <div className="pager">
              <button
                aria-label="上一张参考图"
                disabled={card.images.length === 1}
                onClick={() =>
                  setIndex(
                    (index - 1 + card.images.length) % card.images.length,
                  )
                }
              >
                ‹
              </button>
              <span>
                {index + 1} / {card.images.length}
              </span>
              <button
                aria-label="下一张参考图"
                disabled={card.images.length === 1}
                onClick={() => setIndex((index + 1) % card.images.length)}
              >
                ›
              </button>
            </div>
            <button className="flip-btn" onClick={() => setFlipped(true)}>
              ↻ 翻面看详解
            </button>
          </div>
        </section>
        <section className="face back" aria-hidden={!flipped} inert={!flipped}>
          <div className="card-meta">
            <span>
              {card.code} / 第 {index + 1} 张
            </span>
            <span className="eyebrow">FIELD NOTES</span>
          </div>
          <div className="back-title">
            <span className="eyebrow">每一个动作，都有思路</span>
            <h3>{card.title}</h3>
          </div>
          <div className="back-notes">
            {Object.entries(labels).map(([key, label], i) => (
              <div className="note-section" key={key}>
                <h4>
                  <small>0{i + 1}</small>
                  {label}
                </h4>
                <p>{notes[key as keyof typeof labels] || "尚未填写"}</p>
              </div>
            ))}
          </div>
          <div className="back-actions">
            <button onClick={onRead}>展开完整说明 ↗</button>
            {!readonly && (
              <button className="text-btn" onClick={onEdit}>
                编辑
              </button>
            )}
            <button className="flip-btn" onClick={() => setFlipped(false)}>
              ↻ 返回图片
            </button>
          </div>
        </section>
      </div>
      {!readonly && (
        <button className="delete-link" onClick={onDelete}>
          移入回收站
        </button>
      )}
    </article>
  );
}
