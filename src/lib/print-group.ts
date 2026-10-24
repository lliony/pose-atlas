import { printSheets } from "./model.ts";
import {
  layoutForAspect,
  layoutForCount,
  type Orientation,
  type PaperId,
} from "./print.ts";
import { sizeOfPhoto, type PhotoSize } from "./image-ratio.ts";

/**
 * 打印布局的纯函数规划器：把选中的图片按宽高比分桶、逐张切页、生成正反面槽位。
 * 它只依赖「哪些图 + 各自比例 + 纸张设置」，与笔记文案无关——
 * 界面可在编辑笔记时保持结果稳定，避免每次按键都重排整份版式。
 */

type PhotoLike = {
  src: string;
  panel?: number | null;
  width?: number;
  height?: number;
};

export type PrintSheetPlan<T> = {
  layout: ReturnType<typeof layoutForAspect>;
  front: (T | null)[];
  back: (T | null)[];
};

export type PrintGroupPlan<T> = {
  label: string;
  aspect: { w: number; h: number };
  count: number;
  /** 该组代表版面，用于整组预览/校验页 */
  layout: ReturnType<typeof layoutForAspect>;
  sheets: PrintSheetPlan<T>[];
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function planPrintGroups<T>(
  items: { key: T; photo: PhotoLike }[],
  options: {
    paper: PaperId;
    orientation: Orientation;
    edge: "short" | "long";
    sizes?: Map<string, PhotoSize>;
  },
): PrintGroupPlan<T>[] {
  if (!items.length) return [];
  const { paper, orientation, edge } = options;
  const sizes = options.sizes ?? new Map();
  const buckets = new Map<
    string,
    { label: string; aspect: { w: number; h: number }; keys: T[] }
  >();
  for (const item of items) {
    const size = sizeOfPhoto(item.photo, sizes) ?? { w: 3, h: 4 };
    const g = gcd(size.w, size.h) || 1;
    const aspect = { w: size.w / g, h: size.h / g };
    const key = `${aspect.w}:${aspect.h}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.keys.push(item.key);
    else
      buckets.set(key, {
        label: `${aspect.w}:${aspect.h}`,
        aspect,
        keys: [item.key],
      });
  }
  return [...buckets.values()]
    .map((bucket) => {
      // 每组用默认版面；每张纸独立排版，最后一页卡少时换成更紧凑的版面。
      const layout = layoutForAspect({
        paper,
        orientation,
        aspect: bucket.aspect,
      });
      const sheets: PrintSheetPlan<T>[] = [];
      for (
        let start = 0;
        start < bucket.keys.length;
        start += layout.perSheet
      ) {
        const chunk = bucket.keys.slice(start, start + layout.perSheet);
        const chunkLayout =
          chunk.length === layout.perSheet
            ? layout
            : layoutForCount({
                paper,
                orientation,
                aspect: bucket.aspect,
                count: chunk.length,
              });
        const [front, back] = printSheets(
          chunk,
          edge,
          chunkLayout.cols,
          chunkLayout.rows,
        );
        sheets.push({ layout: chunkLayout, front, back });
      }
      return {
        label: bucket.label,
        aspect: bucket.aspect,
        count: bucket.keys.length,
        layout,
        sheets,
      };
    })
    .sort((a, b) => b.count - a.count);
}