export type PaperId = "a4" | "a3" | "a5" | "letter";
export type Orientation = "landscape" | "portrait";
/** 页面级比例，四选一，不混排。 */
export type RatioId = "3:4" | "4:3" | "9:16" | "16:9";

export const PAPERS: Record<PaperId, { name: string; w: number; h: number }> = {
  a5: { name: "A5", w: 148, h: 210 },
  a4: { name: "A4", w: 210, h: 297 },
  a3: { name: "A3", w: 297, h: 420 },
  letter: { name: "Letter", w: 215.9, h: 279.4 },
};

export const RATIOS: Record<RatioId, { name: string; w: number; h: number }> = {
  "3:4": { name: "竖版 3:4", w: 3, h: 4 },
  "4:3": { name: "横版 4:3", w: 4, h: 3 },
  "9:16": { name: "竖屏 9:16", w: 9, h: 16 },
  "16:9": { name: "宽银幕 16:9", w: 16, h: 9 },
};

/** 打印机安全边距与卡片间距（mm）。 */
export const MARGIN_X = 8.5;
export const MARGIN_Y = 5;
export const GUTTER = 0;

/** 平铺时的基准短边（mm）与最大放大倍数。 */
export const TARGET_SHORT_EDGE = 70;
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
  const { paper, orientation, ratio } = options;
  const sheet = PAPERS[paper];
  const paperW = orientation === "landscape" ? sheet.h : sheet.w;
  const paperH = orientation === "landscape" ? sheet.w : sheet.h;
  const usableW = paperW - MARGIN_X * 2;
  const usableH = paperH - MARGIN_Y * 2;
  const ratioW = RATIOS[ratio].w;
  const ratioH = RATIOS[ratio].h;
  const landscape = ratioW > ratioH;

  // 基准卡：短边 70mm
  let cardW = landscape ? (TARGET_SHORT_EDGE * ratioW) / ratioH : TARGET_SHORT_EDGE;
  let cardH = landscape ? TARGET_SHORT_EDGE : (TARGET_SHORT_EDGE * ratioH) / ratioW;
  // 纸太小装不下基准卡时先缩到放得下
  const fit = Math.min(1, usableW / cardW, usableH / cardH);
  cardW *= fit;
  cardH *= fit;

  const cols = Math.max(1, Math.floor((usableW + 1e-9) / cardW));
  const rows = Math.max(1, Math.floor((usableH + 1e-9) / cardH));
  // 把剩余空间平摊到卡片上，让整页铺满
  const upscale = Math.min(
    MAX_UPSCALE,
    usableW / (cols * cardW),
    usableH / (rows * cardH),
  );
  cardW *= upscale;
  cardH *= upscale;

  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    paper,
    orientation,
    ratio,
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
