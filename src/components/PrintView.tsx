import { resolveImageUrl } from "../services/api";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Dialog from "./Dialog";
import Photo from "./Photo";
import { printSheets, resolveNotes } from "../lib/model";
import {
  PAPERS,
  RATIOS,
  SIZES,
  backIndex,
  printLayout,
  sheetCount,
  type Orientation,
  type PaperId,
  type RatioId,
  type SizeId,
} from "../lib/print";
import {
  labels,
  type Card,
  type Photo as Picture,
  type Notes,
} from "../lib/types";
type Item = { card: Card; photo: Picture; notes: Notes };

type Settings = {
  paper: PaperId;
  orientation: Orientation;
  size: SizeId;
  ratio: RatioId;
  edge: "short" | "long";
  grid: boolean;
};

const SETTINGS_KEY = "pose-atlas:print";
const DEFAULTS: Settings = {
  paper: "a4",
  orientation: "landscape",
  size: "medium",
  ratio: "7:10",
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
      size: raw.size in SIZES ? raw.size : DEFAULTS.size,
      ratio: raw.ratio in RATIOS ? raw.ratio : DEFAULTS.ratio,
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
}: {
  cards: Card[];
  onClose: () => void;
  shareId?: string;
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
    [printError, setPrintError] = useState("");

  const patch = (next: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...next }));

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* 存不下不影响本次打印 */
    }
  }, [settings]);

  const layout = useMemo(
    () =>
      printLayout({
        paper: settings.paper,
        orientation: settings.orientation,
        ratio: settings.ratio,
        size: settings.size,
      }),
    [settings.paper, settings.orientation, settings.ratio, settings.size],
  );

  // @page 尺寸只能靠注入样式，才能做到“选什么纸就印什么纸”
  useEffect(() => {
    let style = document.querySelector<HTMLStyleElement>("style[data-print-page]");
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

  const list = items.filter((i) => chosen.has(i.photo.id)),
    tooLong = list.some(
      (i) =>
        Object.values(i.notes).some((t) => t.length > 80) ||
        i.card.title.length > 28,
    ),
    sheets = sheetCount(list.length, layout.perSheet),
    faces = printSheets(list, settings.edge, layout.cols, layout.rows);

  const print = async () => {
    setPrinting(true);
    setPrintError("");
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
      const root = document.getElementById("print-root")!;
      root.classList.add("measure-print");
      await new Promise((r) => requestAnimationFrame(r));
      const overflow = Array.from(
        root.querySelectorAll(".paper-notes,.paper-pose,.paper-card h2"),
      ).find((el) => el.scrollHeight > el.clientHeight + 1);
      root.classList.remove("measure-print");
      if (overflow && !test)
        throw Error(
          "卡片 " +
            overflow.closest(".paper-card")?.querySelector(".paper-meta")
              ?.textContent +
            " 的文字超出纸面，请精简摘要、换成更大的卡片，或减少换行。",
        );
      window.print();
    } catch (e: any) {
      setPrintError(e.message);
    } finally {
      setPrinting(false);
    }
  };

  const paper = PAPERS[settings.paper];
  const cssVars = {
    "--paper-w": `${layout.paperW}mm`,
    "--paper-h": `${layout.paperH}mm`,
    "--card-w": `${layout.cardW}mm`,
    "--card-h": `${layout.cardH}mm`,
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
              {layout.cardW}
              <span>× {layout.cardH} mm</span>
            </div>
            <div>
              <h3>
                {paper.name} {settings.orientation === "landscape" ? "横向" : "纵向"}
                ，每面 {layout.perSheet} 张。
              </h3>
              <p>
                {layout.cols} 列 × {layout.rows} 行 · 卡片 {layout.cardW}×
                {layout.cardH}mm · 共 {sheets} 张纸（{sheets * 2} 面）
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
            <label>
              卡片尺寸
              <select
                value={settings.size}
                onChange={(e) => patch({ size: e.target.value as SizeId })}
              >
                {(Object.keys(SIZES) as SizeId[]).map((id) => (
                  <option key={id} value={id}>
                    {SIZES[id].name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              卡片比例
              <select
                value={settings.ratio}
                onChange={(e) => patch({ ratio: e.target.value as RatioId })}
              >
                {(Object.keys(RATIOS) as RatioId[]).map((id) => (
                  <option key={id} value={id}>
                    {RATIOS[id].name}
                  </option>
                ))}
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
              <details key={item.photo.id}>
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
        {printError && (
          <p className="form-error" role="alert">
            {printError}
          </p>
        )}
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
      </Dialog>
      {createPortal(
        <div
          id="print-root"
          data-grid={settings.grid ? "on" : undefined}
          data-wide={
            RATIOS[settings.ratio].w > RATIOS[settings.ratio].h
              ? "on"
              : undefined
          }
          style={cssVars}
        >
          {test
            ? [0, 1].map((side) => (
                <section className="print-page" key={side}>
                  {Array.from({ length: layout.perSheet }, (_, i) =>
                    side === 0
                      ? i + 1
                      : backIndex(i, layout.cols, layout.rows, settings.edge) + 1,
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
            : faces.map((page: (Item | null)[], pageIndex: number) => (
                <section className="print-page" key={pageIndex}>
                  {page.map((item, j) =>
                    item ? (
                      <article
                        className={
                          "paper-card " +
                          (pageIndex % 2 ? "paper-back" : "paper-front")
                        }
                        key={j}
                      >
                        <div className="paper-meta">
                          {item.card.code} / 第{" "}
                          {item.card.images.findIndex(
                            (p) => p.id === item.photo.id,
                          ) + 1}{" "}
                          张{" "}
                          <span>{pageIndex % 2 ? "拍摄笔记" : "姿势图鉴"}</span>
                        </div>
                        <h2>{item.card.title}</h2>
                        {pageIndex % 2 ? (
                          <div className="paper-notes">
                            {Object.entries(labels).map(([k, l]) => (
                              <p key={k}>
                                <b>{l}</b>{" "}
                                {item.notes[k as keyof Notes] || "未填写"}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <>
                            <Photo
                              eager
                              image={item.photo}
                              title={item.card.title}
                              shareId={shareId}
                            />
                            <p className="paper-pose">{item.notes.pose}</p>
                            <div className="paper-flip">
                              翻到背面，查看机位与构图 →
                            </div>
                          </>
                        )}
                        <div className="paper-foot">
                          {item.photo.ai ? "AI 生成参考图" : "用户图片"}{" "}
                          <span>
                            POSE ATLAS / {layout.cardW} × {layout.cardH}
                          </span>
                        </div>
                      </article>
                    ) : (
                      <div className="paper-empty" key={j} />
                    ),
                  )}
                </section>
              ))}
        </div>,
        document.body,
      )}
    </>
  );
}
