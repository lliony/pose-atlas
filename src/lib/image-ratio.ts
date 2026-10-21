export const RATIO_KEYS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
export type RatioKey = (typeof RATIO_KEYS)[number];

export type PhotoSize = { w: number; h: number };

/** 参考图 sprite 的单格是 768×1024（3:4）；普通三联图单格是 724×724（1:1）。 */
export function sizeOfPhoto(
  photo: { src: string; panel?: number | null },
  sizes: Map<string, PhotoSize>,
): PhotoSize | null {
  if (photo.panel !== undefined && photo.panel !== null) {
    return photo.src === "/images/pose-reference-styles.png"
      ? { w: 768, h: 1024 }
      : { w: 724, h: 724 };
  }
  return sizes.get(photo.src) ?? null;
}

/** 原图宽高比落到最近的常用比例；偏差超过 5% 视为「其他比例」。 */
export function ratioKey(w: number, h: number): RatioKey | null {
  if (!w || !h) return null;
  const aspect = w / h;
  let best: RatioKey | null = null;
  let bestError = 0.05;
  for (const key of RATIO_KEYS) {
    const [rw, rh] = key.split(":").map(Number);
    const error = Math.abs(aspect / (rw / rh) - 1);
    if (error < bestError) {
      bestError = error;
      best = key;
    }
  }
  return best;
}

/** 一张卡片里出现过的比例（按图片逐张算）。 */
export function cardRatioKeys(
  photos: { src: string; panel?: number | null }[],
  sizes: Map<string, PhotoSize>,
): Set<RatioKey> {
  const keys = new Set<RatioKey>();
  for (const photo of photos) {
    const size = sizeOfPhoto(photo, sizes);
    const key = size ? ratioKey(size.w, size.h) : null;
    if (key) keys.add(key);
  }
  return keys;
}

/** CSS aspect-ratio 值，例如 "724 / 1024"。 */
export function aspectOf(
  photo: { src: string; panel?: number | null },
  sizes: Map<string, PhotoSize>,
  fallback = "3 / 4",
) {
  const size = sizeOfPhoto(photo, sizes);
  return size ? `${size.w} / ${size.h}` : fallback;
}
