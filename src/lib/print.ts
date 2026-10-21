export type PaperId = "a4" | "a3" | "a5" | "letter";
export type Orientation = "landscape" | "portrait";
/** 页面级比例，四选一，不混排。 */
export type RatioId = "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9";

export const PAPERS: Record<PaperId, { name: string; w: number; h: number }> = {
  a5: { name: "A5", w: 148, h: 210 },
  a4: { name: "A4", w: 210, h: 297 },
  a3: { name: "A3", w: 297, h: 420 },
  letter: { name: "Letter", w: 215.9, h: 279.4 },
};

export const RATIOS: Record<RatioId, { name: string; w: number; h: number }> = {
  "2:3": { name: "竖版 2:3", w: 2, h: 3 },
  "3:2": { name: "横版 3:2", w: 3, h: 2 },
  "3:4": { name: "竖版 3:4", w: 3, h: 4 },
  "4:3": { name: "横版 4:3", w: 4, h: 3 },
  "9:16": { name: "竖屏 9:16", w: 9, h: 16 },
  "16:9": { name: "宽银幕 16:9", w: 16, h: 9 },
};

/** 打印机安全边距与卡片间距（mm）。 */
export const MARGIN_X = 8.5;
export const MARGIN_Y = 5;
export const GUTTER = 0;

/** 平铺时的基准短边（mm）、最小短边与最大放大倍数。 */
export const TARGET_SHORT_EDGE = 70;
export const MIN_SHORT_EDGE = 65;
/** 卡片最小高度：低于这个值，背面放不下五段笔记。 */
export const MIN_CARD_HEIGHT = 84;
export const MAX_UPSCALE = 1.35;

export type PrintLayout = {
  paper: PaperId;
  orientation: Orientation;
  ratio: RatioId;
  /** 纸张实际方向下的宽高（mm） */
  paperW: number;
  paperH: number;
  cardW: number;
  cardH: number;
  cols: number;
  rows: number;
  perSheet: number;
  marginX: number;
  marginY: number;
  gutter: number;
};

/**
 * 按纸张平分平铺：以短边 70mm 为基准排出尽可能多的卡，再整体放大到填满纸面
 * （最多 ×1.35，避免出现海报尺寸）。剩余空隙由打印样式的 `space-evenly` 均分。
 */
export function fillLayout(options: {
  paper: PaperId;
  orientation: Orientation;
  ratio: RatioId;
}): PrintLayout {
  return layoutForAspect({
    paper: options.paper,
    orientation: options.orientation,
    aspect: RATIOS[options.ratio],
    ratio: options.ratio,
  });
}

/** 与 fillLayout 同一套规则，但比例用图片自身的宽高（w/h），供混合比例分组排版使用。 */
export function layoutForAspect(options: {
  paper: PaperId;
  orientation: Orientation;
  aspect: { w: number; h: number };
  ratio?: RatioId;
}): PrintLayout {
  const { paper, orientation, aspect } = options;
  const sheet = PAPERS[paper];
  const paperW = orientation === "landscape" ? sheet.h : sheet.w;
  const paperH = orientation === "landscape" ? sheet.w : sheet.h;
  const usableW = paperW - MARGIN_X * 2;
  const usableH = paperH - MARGIN_Y * 2;
  const ratioW = aspect.w;
  const ratioH = aspect.h;
  const landscape = ratioW > ratioH;

  // 在 1..6 行列里挑：卡片短边不超过 70×1.35，且占纸最多的组合
  const maxShort = TARGET_SHORT_EDGE * MAX_UPSCALE;
  let best = { cols: 1, rows: 1, cardW: 0, cardH: 0, fill: -1 };
  for (let cols = 1; cols <= 6; cols++) {
    for (let rows = 1; rows <= 6; rows++) {
      const cellW = usableW / cols;
      const cellH = usableH / rows;
      let w = Math.min(cellW, (cellH * ratioW) / ratioH);
      let h = (w * ratioH) / ratioW;
      // 短边封顶，避免整页变成一张海报
      const short = Math.min(w, h);
      if (short > maxShort) {
        const shrink = maxShort / short;
        w *= shrink;
        h *= shrink;
      }
      if (Math.min(w, h) < MIN_SHORT_EDGE) continue;
      // 卡片高度不足时背面五段笔记放不下，直接排除
      if (h < MIN_CARD_HEIGHT) continue;
      const fill = (cols * rows * w * h) / (usableW * usableH);
      if (fill > best.fill + 1e-9) best = { cols, rows, cardW: w, cardH: h, fill };
    }
  }
  if (best.fill < 0) {
    // 极端纸张：单张铺满
    const w = Math.min(usableW, (usableH * ratioW) / ratioH);
    best = { cols: 1, rows: 1, cardW: w, cardH: (w * ratioH) / ratioW, fill: 1 };
  }
  const { cols, rows } = best;
  let cardW = best.cardW;
  let cardH = best.cardH;

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    paper,
    orientation,
    ratio: options.ratio ?? "3:4",
    paperW: round(paperW),
    paperH: round(paperH),
    cardW: round(cardW),
    cardH: round(cardH),
    cols,
    rows,
    perSheet: cols * rows,
    marginX: MARGIN_X,
    marginY: MARGIN_Y,
    gutter: GUTTER,
  };
}

/**
 * 双面打印时背面的取位：
 * - 短边翻转：每行左右镜像
 * - 长边翻转：整张上下镜像
 */
export function backIndex(
  index: number,
  cols: number,
  rows: number,
  edge: "short" | "long",
) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  return edge === "short"
    ? row * cols + (cols - 1 - col)
    : (rows - 1 - row) * cols + col;
}

/** 纸张面数：每张纸两面。 */
export function sheetCount(cards: number, perSheet: number) {
  return perSheet > 0 ? Math.ceil(cards / perSheet) : 0;
}
