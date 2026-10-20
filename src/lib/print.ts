export type PaperId = "a4" | "a3" | "a5" | "letter";
export type Orientation = "landscape" | "portrait";
export type RatioId = "7:10" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
export type SizeId = "small" | "medium" | "large";

export const PAPERS: Record<PaperId, { name: string; w: number; h: number }> = {
  a5: { name: "A5", w: 148, h: 210 },
  a4: { name: "A4", w: 210, h: 297 },
  a3: { name: "A3", w: 297, h: 420 },
  letter: { name: "Letter", w: 215.9, h: 279.4 },
};

/**
 * 卡面比例。7:10 就是现在的口袋卡 70×100mm，按实物尺寸命名的选项排在最前，
 * 其余用大家更熟的照片比例。
 */
export const RATIOS: Record<RatioId, { name: string; w: number; h: number }> = {
  "7:10": { name: "口袋卡 70×100", w: 7, h: 10 },
  "1:1": { name: "方形 1:1", w: 1, h: 1 },
  "4:3": { name: "横版 4:3", w: 4, h: 3 },
  "3:4": { name: "竖版 3:4", w: 3, h: 4 },
  "16:9": { name: "宽银幕 16:9", w: 16, h: 9 },
  "9:16": { name: "竖屏 9:16", w: 9, h: 16 },
};

/** 尺寸按卡片的“短边”定，长边由比例推出。 */
export const SIZES: Record<SizeId, { name: string; short: number }> = {
  small: { name: "小 · 短边 50mm", short: 50 },
  medium: { name: "中 · 短边 70mm", short: 70 },
  large: { name: "大 · 短边 90mm", short: 90 },
};

/** 打印机安全边距与卡片间距（mm）。A4 横向刚好放下 4×2。 */
export const MARGIN_X = 8.5;
export const MARGIN_Y = 5;
export const GUTTER = 0;

export type PrintLayout = {
  paper: PaperId;
  orientation: Orientation;
  ratio: RatioId;
  size: SizeId;
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

const round = (n: number) => Math.round(n * 10) / 10;

/** 短边 + 比例 → 卡面毫米数；宽比高时为横卡，高比宽时为竖卡。 */
export function cardBox(ratio: RatioId, short: number) {
  const r = RATIOS[ratio];
  const landscape = r.w > r.h;
  return {
    w: round(landscape ? short * (r.w / r.h) : short),
    h: round(landscape ? short : short * (r.h / r.w)),
  };
}

export function printLayout(options: {
  paper: PaperId;
  orientation: Orientation;
  ratio: RatioId;
  size: SizeId;
}): PrintLayout {
  const { paper, orientation, ratio, size } = options;
  const base = PAPERS[paper];
  const paperW = orientation === "landscape" ? base.h : base.w;
  const paperH = orientation === "landscape" ? base.w : base.h;
  const usableW = paperW - MARGIN_X * 2;
  const usableH = paperH - MARGIN_Y * 2;

  let { w: cardW, h: cardH } = cardBox(ratio, SIZES[size].short);
  // 卡片比可用区还大时整体缩到刚好放得下（例如 A5 装 90mm 的 16:9 卡）
  const fit = Math.min(1, usableW / cardW, usableH / cardH);
  if (fit < 1) {
    cardW = round(cardW * fit);
    cardH = round(cardH * fit);
  }

  const cols = Math.max(1, Math.floor((usableW + GUTTER) / (cardW + GUTTER)));
  const rows = Math.max(1, Math.floor((usableH + GUTTER) / (cardH + GUTTER)));

  return {
    paper,
    orientation,
    ratio,
    size,
    paperW: round(paperW),
    paperH: round(paperH),
    cardW,
    cardH,
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
