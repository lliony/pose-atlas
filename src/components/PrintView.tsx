import { resolveImageUrl } from "../services/api";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Dialog from "./Dialog";
import Photo from "./Photo";
import { printSheets, resolveNotes } from "../lib/model";
import {
  PAPERS,
  backIndex,
  layoutForAspect,
  sheetCount,
  type Orientation,
  type PaperId,
  type PrintLayout,
} from "../lib/print";
import { sizeOfPhoto, type PhotoSize } from "../lib/image-ratio";
import {
  labels,
  type Card,
  type Photo as Picture,
  type Notes,
} from "../lib/types";
type Item = { card: Card; photo: Picture; notes: Notes };

const gcd = (a: number, b: number): number =>
  b === 0 ? a : gcd(b, a % b);

type Settings = {
  paper: PaperId;
  orientation: Orientation;
  edge: "short" | "long";
  grid: boolean;
};

const SETTINGS_KEY = "pose-atlas:print";
const DEFAULTS: Settings = {
  paper: "a4",
  orientation: "landscape",
  edge: "short",
  grid: false,
};

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (!raw || typeof raw !== "object") return DEFAULTS;
    return {
      paper: raw.paper in PAPERS ? raw.paper : DEFAULTS.paper,
      orientation:
        raw.orientation === "portrait" || raw.orientation === "landscape"
          ? raw.orientation
          : DEFAULTS.orientation,
      edge: raw.edge === "long" ? "long" : "short",
      grid: raw.grid === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export default function PrintView({
  cards,
  onClose,
  shareId,
  appearance,
  sizes,
}: {
  cards: Card[];
  onClose: () => void;
  shareId?: string;
  appearance: {
    ratio: "3:4" | "4:3" | "9:16" | "16:9";
    frame: "thin" | "none";
  };
  sizes?: Map<string, PhotoSize>;
}) {
  const [items, setItems] = useState<Item[]>(() =>
      cards.flatMap((card) =>
        card.images.map((photo) => ({
          card,
          photo,
          notes: resolveNotes(card, photo) as Notes,
        })),
      ),
    ),
    [chosen, setChosen] = useState(
      () => new Set(cards.flatMap((c) => c.images.map((p) => p.id))),
    ),
    [settings, setSettings] = useState<Settings>(loadSettings),
    [test, setTest] = useState(false),
    [printing, setPrinting] = useState(false),
    [printError, setPrintError] = useState(""),
    [blockedPhoto, setBlockedPhoto] = useState("");

  const patch = (next: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...next }));

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* 存不下不影响本次打印 */
    }
  }, [settings]);

  const list = items.filter((i) => chosen.has(i.photo.id)),
    tooLong = list.some(
      (i) =>
        Object.values(i.notes).some((t) => t.length > 80) ||
        i.card.title.length > 28,
    );

  // 相同比例的图片排在一起：每种比例单独算版面、单独起一张纸
  const groups = (() => {
    const buckets = new Map<
      string,
      { label: string; aspect: { w: number; h: number }; items: Item[] }
    >();
    for (const item of list) {
      const size = sizeOfPhoto(item.photo, sizes ?? new Map()) ?? {
        w: 3,
        h: 4,
      };
      const g = gcd(size.w, size.h) || 1;
      const aspect = { w: size.w / g, h: size.h / g };
      const key = `${aspect.w}:${aspect.h}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.items.push(item);
      else
        buckets.set(key, {
          label: `${aspect.w}:${aspect.h}`,
          aspect,
          items: [item],
        });
    }
    return [...buckets.values()]
      .map((bucket) => {
        const groupLayout = layoutForAspect({
          paper: settings.paper,
          orientation: settings.orientation,
          aspect: bucket.aspect,
        });
        return {
          ...bucket,
          layout: groupLayout,
          faces: printSheets(
            bucket.items,
            settings.edge,
            groupLayout.cols,
            groupLayout.rows,
          ),
        };
      })
      .sort((a, b) => b.items.length - a.items.length);
  })();

  const layout: PrintLayout =
    groups[0]?.layout ??
    layoutForAspect({
      paper: settings.paper,
      orientation: settings.orientation,
      aspect: { w: 3, h: 4 },
    });

  const sheets = groups.reduce(
    (sum, g) => sum + sheetCount(g.items.length, g.layout.perSheet),
    0,
  );

  // @page 尺寸只能靠注入样式，才能做到“选什么纸就印什么纸”
  useEffect(() => {
    let style = document.querySelector<HTMLStyleElement>(
      "style[data-print-page]",
    );
    if (!style) {
      style = document.createElement("style");
      style.dataset.printPage = "";
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${layout.paperW}mm ${layout.paperH}mm; margin: 0; }`;
    return () => {
      style?.remove();
    };
  }, [layout.paperW, layout.paperH]);

  const print = async () => {
    setPrinting(true);
    setPrintError("");
    setBlockedPhoto("");
    const root = document.getElementById("print-root")!;
    try {
      await document.fonts.ready;
      const urls = [
        ...new Set(
          await Promise.all(
            list.map((i) => resolveImageUrl(i.photo.src, shareId)),
          ),
        ),
      ];
      await Promise.all(
        urls.map(
          (src) =>
            new Promise<void>((resolve, reject) => {
              const img = new Image(),
                timer = setTimeout(
                  () => reject(Error("图片加载超时，请重试")),
                  15000,
                );
              img.onload = () => {
                clearTimeout(timer);
                resolve();
              };
              img.onerror = () => {
                clearTimeout(timer);
                reject(Error("图片加载失败，请检查后重试"));
              };
              img.src = src;
            }),
        ),
      );
      /*
       * 打印用缩略图：长边压到 1600px 再编码成 JPEG。
       * 屏幕上的原图不动，只有 #print-root 里这一份换掉，PDF 体积能降一个数量级。
       */
      const MAX_EDGE = 1600;
      const toThumb = (src: string) =>
        new Promise<[string, string] | null>((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const longest = Math.max(img.naturalWidth, img.naturalHeight);
              if (!longest || longest <= MAX_EDGE) return resolve(null);
              const scale = MAX_EDGE / longest;
              const canvas = document.createElement("canvas");
              canvas.width = Math.round(img.naturalWidth * scale);
              canvas.height = Math.round(img.naturalHeight * scale);
              const ctx = canvas.getContext("2d");
              if (!ctx) return resolve(null);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve([src, canvas.toDataURL("image/jpeg", 0.85)]);
            } catch {
              resolve(null);
            }
          };
          img.onerror = () => resolve(null);
          img.src = src;
        });
      const printImages = [
        ...root.querySelectorAll<HTMLImageElement>(".paper-card img"),
      ];
      const printSprites = [
        ...root.querySelectorAll<SVGImageElement>(".paper-card image"),
      ];
      const sources = new Set<string>();
      printImages.forEach((img) => img.src && sources.add(img.src));
      printSprites.forEach((node) => {
        const href = node.getAttribute("href");
        if (href) sources.add(href);
      });
      if (sources.size) {
        const pairs = (
          await Promise.all([...sources].map((src) => toThumb(src)))
        ).filter((pair): pair is [string, string] => pair !== null);
        const thumbs = new Map(pairs);
        if (thumbs.size) {
          printImages.forEach((img) => {
            const next = thumbs.get(img.src);
            if (next) {
              img.removeAttribute("srcset");
              img.src = next;
            }
          });
          printSprites.forEach((node) => {
            const next = thumbs.get(node.getAttribute("href") || "");
            if (next) node.setAttribute("href", next);
          });
          await Promise.all(
            printImages.map((img) => img.decode().catch(() => undefined)),
          );
        }
      }

      root.classList.add("measure-print");
      await new Promise((r) => requestAnimationFrame(r));

      /*
       * 预检：先让每张卡的笔记自己缩一点字号（最多 16%），实在放不下才拦下来。
       * 用几何位置判断而不是 scrollHeight——flex + overflow:hidden 下它会被夹住。
       */
      const overflows = (el: Element) => {
        if (
          el.scrollHeight > el.clientHeight + 1 ||
          el.scrollWidth > el.clientWidth + 1
        )
          return true;
        const box = el.getBoundingClientRect();
        let bottom = box.top;
        for (const child of Array.from(el.children))
          bottom = Math.max(bottom, child.getBoundingClientRect().bottom);
        return bottom - box.bottom > 0.5;
      };
      const fitNotes = (card: Element) => {
        const notes = card.querySelector<HTMLElement>(".paper-notes");
        if (!notes) return true;
        notes.style.removeProperty("--notes-scale");
        let scale = 1;
        while (overflows(notes) && scale > 0.78) {
          scale = Math.round((scale - 0.04) * 100) / 100;
          notes.style.setProperty("--notes-scale", String(scale));
        }
        return !overflows(notes);
      };
      const blocked: { photoId: string; label: string }[] = [];
      if (!test) {
        root.querySelectorAll<HTMLElement>(".paper-card").forEach((card) => {
          if (fitNotes(card)) {
            const text = card.querySelector<HTMLElement>(".paper-pose, h2");
            if (text && overflows(text))
              blocked.push({
                photoId: card.dataset.photo || "",
                label: (
                  card.querySelector(".paper-meta")?.textContent || ""
                ).trim(),
              });
            return;
          }
          blocked.push({
            photoId: card.dataset.photo || "",
            label: (
              card.querySelector(".paper-meta")?.textContent || ""
            ).trim(),
          });
        });
      }
      const first = blocked[0];
      if (first) {
        setBlockedPhoto(first.photoId);
        throw Error(
          `卡片 ${first.label} 的文字放不下这张卡（已自动缩小到 78%）。可以精简这一段，或返回页面增大显示宽度后重新打开打印；点右侧「定位」可直接跳到这张卡。`,
        );
      }
      setBlockedPhoto("");
      root.classList.remove("measure-print");
      window.print();
    } catch (e: any) {
      setPrintError(e.message);
    } finally {
      root.classList.remove("measure-print");
      setPrinting(false);
    }
  };

  const paper = PAPERS[settings.paper];
  const cssVars = {
    "--paper-w": `${layout.paperW}mm`,
    "--paper-h": `${layout.paperH}mm`,
    "--card-w": `${layout.cardW}mm`,
    "--card-h": `${layout.cardH}mm`,
    "--frame-width": "1.5875mm",
    "--cols": layout.cols,
    "--rows": layout.rows,
    "--gap": `${layout.gutter}mm`,
  } as CSSProperties;

  return (
    <>
      <Dialog title="把灵感，打印成册" wide onClose={onClose}>
        <div className="print-settings">
          <div className="print-intro">
            <div className="paper-icon">
              {Number(layout.cardW.toFixed(1))}
              <span>× {Number(layout.cardH.toFixed(1))} mm</span>
            </div>
            <div>
              <h3>
                {paper.name}{" "}
                {settings.orientation === "landscape" ? "横向" : "纵向"}
                ，{groups.length} 种比例，共 {sheets} 张纸。
              </h3>
              <p>
                {groups
                  .map(
                    (g) =>
                      `${g.label} · ${g.items.length} 张（${g.layout.cols}×${g.layout.rows}，卡片 ${Number(g.layout.cardW.toFixed(1))}×${Number(g.layout.cardH.toFixed(1))}mm，${sheetCount(g.items.length, g.layout.perSheet)} 张纸）`,
                  )
                  .join("；")}
                <br />
                相同比例排在一起，正面与反面相邻成对。
                <br />
                打印时选实际大小 100%，关闭页眉页脚，开启背景图形。
              </p>
            </div>
          </div>
          <div className="form-row print-row">
            <label>
              纸张
              <select
                value={settings.paper}
                onChange={(e) => patch({ paper: e.target.value as PaperId })}
              >
                {(Object.keys(PAPERS) as PaperId[]).map((id) => (
                  <option key={id} value={id}>
                    {PAPERS[id].name}（{PAPERS[id].w}×{PAPERS[id].h}mm）
                  </option>
                ))}
              </select>
            </label>
            <label>
              方向
              <select
                value={settings.orientation}
                onChange={(e) =>
                  patch({ orientation: e.target.value as Orientation })
                }
              >
                <option value="landscape">横向</option>
                <option value="portrait">纵向</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              打印机翻转方式
              <select
                value={settings.edge}
                onChange={(e) =>
                  patch({ edge: e.target.value === "long" ? "long" : "short" })
                }
              >
                <option value="short">短边翻转（推荐）</option>
                <option value="long">长边翻转</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings.grid}
                onChange={(e) => patch({ grid: e.target.checked })}
              />
              打印时叠构图网格
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={test}
                onChange={(e) => setTest(e.target.checked)}
              />
              只打印方向校验页
            </label>
          </div>
          <p className="helper">
            每张参考图生成一张实体卡。先用校验页确认正反编号；教学栏目超过 80
            字或标题超过 28 字时请精简，完整原文仍保留在图鉴中。
          </p>
          <div className="print-pick">
            {items.map((item, index) => (
              <details key={item.photo.id} data-photo={item.photo.id}>
                <summary>
                  <input
                    aria-label={
                      "打印 " +
                      item.card.code +
                      " 第" +
                      (item.card.images.findIndex(
                        (p) => p.id === item.photo.id,
                      ) +
                        1) +
                      "张"
                    }
                    type="checkbox"
                    checked={chosen.has(item.photo.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      setChosen((s) => {
                        const n = new Set(s);
                        e.target.checked
                          ? n.add(item.photo.id)
                          : n.delete(item.photo.id);
                        return n;
                      })
                    }
                  />
                  <span>
                    {item.card.code} · {item.card.title}
                  </span>
                  <small>校对背面摘要 ↓</small>
                </summary>
                {Object.entries(labels).map(([k, l]) => (
                  <label key={k}>
                    {l} <small>{item.notes[k as keyof Notes].length}/80</small>
                    <textarea
                      value={item.notes[k as keyof Notes]}
                      rows={2}
                      onChange={(e) =>
                        setItems((a) =>
                          a.map((it, i) =>
                            i === index
                              ? {
                                  ...it,
                                  notes: { ...it.notes, [k]: e.target.value },
                                }
                              : it,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </details>
            ))}
          </div>
          {tooLong && !test && (
            <p className="form-error">
              部分教学超过 80 字或标题超过 28 字，请先精简后打印。
            </p>
          )}
        </div>
        {printError || blockedPhoto ? (
          <div className="dialog-footer print-footer">
            <span className="print-footer-msg" role="alert">
              {printError}
            </span>
            {blockedPhoto && (
              <button
                onClick={() => {
                  const el = document.querySelector<HTMLDetailsElement>(
                    `.print-pick details[data-photo="${blockedPhoto}"]`,
                  );
                  if (!el) return;
                  el.open = true;
                  el.scrollIntoView({ block: "center", behavior: "smooth" });
                }}
              >
                定位
              </button>
            )}
            <button onClick={onClose}>返回</button>
            <button className="primary" onClick={print} disabled={printing}>
              {printing ? "正在准备…" : "重新打印 ↗"}
            </button>
          </div>
        ) : (
          <div className="dialog-footer">
            <span>
              {test
                ? "校验页 2 面"
                : `${list.length} 张卡片 · ${sheets} 张纸 · ${sheets * 2} 面`}
            </span>
            <button onClick={onClose}>返回</button>
            <button
              className="primary"
              disabled={printing || (!test && (!list.length || tooLong))}
              onClick={print}
            >
              {printing ? "正在准备…" : "打印 / 另存 PDF ↗"}
            </button>
          </div>
        )}
      </Dialog>
      {createPortal(
        <div
          id="print-root"
          data-grid={settings.grid ? "on" : undefined}
          data-frame={appearance.frame}
          style={cssVars}
        >
          {test
            ? [0, 1].map((side) => (
                <section className="print-page" key={side}>
                  {Array.from({ length: layout.perSheet }, (_, i) =>
                    side === 0
                      ? i + 1
                      : backIndex(i, layout.cols, layout.rows, settings.edge) +
                        1,
                  ).map((n) => (
                    <article className="paper-card test-card" key={n}>
                      ↑ 上方<h1>{n}</h1>
                      {side ? "背面" : "正面"} ·{" "}
                      {settings.edge === "short" ? "短边" : "长边"}翻转
                      <p>双面打印后，同一位置编号应相同且方向一致。</p>
                    </article>
                  ))}
                </section>
              ))
            : groups.flatMap((group, gi) =>
                group.faces.map((page, pi) => {
                  const back = pi % 2 === 1;
                  const cs = {
                    "--paper-w": `${group.layout.paperW}mm`,
                    "--paper-h": `${group.layout.paperH}mm`,
                    "--card-w": `${group.layout.cardW}mm`,
                    "--card-h": `${group.layout.cardH}mm`,
                    "--cols": group.layout.cols,
                    "--rows": group.layout.rows,
                    "--gap": `${group.layout.gutter}mm`,
                    "--card-fs": `calc(min(${group.layout.cardW}mm, ${group.layout.cardH}mm) * 0.0271)`,
                  } as CSSProperties;
                  return (
                    <section
                      className="print-page"
                      key={`${gi}-${pi}`}
                      data-wide={
                        group.aspect.w > group.aspect.h ? "on" : undefined
                      }
                      data-short={
                        group.layout.cardH <= group.layout.cardW * 1.15
                          ? "on"
                          : undefined
                      }
                      style={cs}
                    >
                      {page.map((item, j) =>
                        item ? (
                          <article
                            data-photo={item.photo.id}
                            className={
                              "paper-card " +
                              (back ? "paper-back" : "paper-front")
                            }
                            key={j}
                          >
                            <div className="paper-meta">
                              {item.card.code} / 第{" "}
                              {item.card.images.findIndex(
                                (p) => p.id === item.photo.id,
                              ) + 1}{" "}
                              张 <span>{back ? "拍摄笔记" : "姿势图鉴"}</span>
                            </div>
                            <h2>{item.card.title}</h2>
                            {back ? (
                              <div className="paper-notes">
                                {Object.entries(labels).map(([k, l]) => (
                                  <p key={k}>
                                    <b>{l}</b>{" "}
                                    {item.notes[k as keyof Notes] || "未填写"}
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <Photo
                                eager
                                image={item.photo}
                                title={item.card.title}
                                shareId={shareId}
                              />
                            )}
                            <div className="paper-foot">
                              {item.photo.ai ? "AI 生成参考图" : "用户图片"}{" "}
                              <span>
                                POSE ATLAS /{" "}
                                {Number(group.layout.cardW.toFixed(1))} ×{" "}
                                {Number(group.layout.cardH.toFixed(1))}
                              </span>
                            </div>
                          </article>
                        ) : (
                          <div className="paper-empty" key={j} />
                        ),
                      )}
                    </section>
                  );
                }),
              )}        </div>,
        document.body,
      )}
    </>
  );
}
