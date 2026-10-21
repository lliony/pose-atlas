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
 * 打印尺寸跟随页面：卡片宽度取屏幕上的实际 CSS 宽度（按 96dpi 换成毫米），
 * 只有超出纸张可用区时才整体等比缩小，绝不放大。
 */
export function screenPrintLayout(options: {
  paper: PaperId;
  orientation: Orientation;
  ratio: RatioId;
  screenCardWidth: number;
}): PrintLayout & { scale: number } {
  const { paper, orientation, ratio, screenCardWidth } = options;
  if (!Number.isFinite(screenCardWidth) || screenCardWidth <= 0)
    throw new Error("无法读取页面卡片宽度，请返回图鉴后重试");
  const base = PAPERS[paper];
  const paperW = orientation === "landscape" ? base.h : base.w;
  const paperH = orientation === "landscape" ? base.w : base.h;
  const usableW = paperW - MARGIN_X * 2;
  const usableH = paperH - MARGIN_Y * 2;
  const initialW = (screenCardWidth * 25.4) / 96;
  const initialH = (initialW * RATIOS[ratio].h) / RATIOS[ratio].w;
  const scale = Math.min(1, usableW / initialW, usableH / initialH);
  const cardW = initialW * scale;
  const cardH = initialH * scale;
  const cols = Math.max(
    1,
    Math.floor((usableW + GUTTER + 1e-9) / (cardW + GUTTER)),
  );
  const rows = Math.max(
    1,
    Math.floor((usableH + GUTTER + 1e-9) / (cardH + GUTTER)),
  );
  return {
    paper,
    orientation,
    ratio,
    paperW,
    paperH,
    cardW,
    cardH,
    cols,
    rows,
    perSheet: cols * rows,
    marginX: MARGIN_X,
    marginY: MARGIN_Y,
    gutter: GUTTER,
    scale,
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
