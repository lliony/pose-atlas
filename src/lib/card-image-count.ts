/** 每张卡片允许的最大参考图数量，供上传校验与计数共用，避免魔法数字散落。 */
export const MAX_CARD_IMAGES = 20;

/** 还能否继续追加 p 张（当前已有 current 张）。 */
export function canAddImages(current: number, count: number): boolean {
  return current + count <= MAX_CARD_IMAGES;
}

/** 还剩多少容量；异常大时按 0 处理。 */
export function slotsLeft(current: number): number {
  const left = MAX_CARD_IMAGES - current;
  return left > 0 ? left : 0;
}