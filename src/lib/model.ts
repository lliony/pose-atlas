import type { Card, Photo, Album, State, Notes, Publication } from "./types.ts";
import { backIndex } from "./print.ts";
import { GENDERS, STYLES } from './card-appearance.ts';
export const fields: (keyof Notes)[] = [
  "pose",
  "camera",
  "composition",
  "light",
  "cautions",
];
export function resolveNotes(card: Card, image: Photo): Notes {
  return Object.fromEntries(
    fields.map((k) => [k, image.notes?.[k]?.trim() || card.notes?.[k] || ""]),
  ) as Notes;
}
export function snapshot(state: State, album: Album): Publication {
  return {
    id: album.id,
    name: album.name,
    description: album.description || "",
    publishedAt: new Date().toISOString(),
    cards: album.cardIds
      .map((id) => state.cards.find((c) => c.id === id && !c.deleted))
      .filter((c): c is Card => Boolean(c))
      .map((c) => ({
        id: c.id,
        categoryId: c.categoryId,
        code: c.code,
        title: c.title,
        tags: [...c.tags],
        gender: c.gender,
        styles: c.styles ? [...c.styles] : undefined,
        notes: Object.fromEntries(
          fields.map((k) => [k, c.notes[k] || ""]),
        ) as Notes,
        source: c.source,
        images: c.images.map((i) => ({
          id: i.id,
          src: i.src,
          panel: i.panel,
          ai: !!i.ai,
          width: i.width,
          height: i.height,
          notes: Object.fromEntries(fields.map((k) => [k, i.notes?.[k] || ""])),
        })),
      })),
    categories: state.categories
      .filter((c) =>
        album.cardIds.some((id) =>
          state.cards.some(
            (x) => x.id === id && !x.deleted && x.categoryId === c.id,
          ),
        ),
      )
      .map((c) => ({ id: c.id, name: c.name, code: c.code })),
  };
}
export function printSheets<T>(
  items: T[],
  edge: "short" | "long" = "short",
  cols = 4,
  rows = 2,
): (T | null)[][] {
  const per = cols * rows;
  const result: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += per) {
    const front = Array.from({ length: per }, (_, j) => items[i + j] ?? null);
    result.push(
      front,
      front.map((_, j) => front[backIndex(j, cols, rows, edge)]),
    );
  }
  return result;
}
export function validateState(s: State) {
  if (
    !s ||
    !Array.isArray(s.categories) ||
    !Array.isArray(s.cards) ||
    !Array.isArray(s.albums)
  )
    throw Error("资料格式不正确");
  if (
    s.cards.length > 2000 ||
    s.categories.length > 200 ||
    s.albums.length > 200
  )
    throw Error("资料数量超出当前上限");
  const ids = new Set<string>();
  const id = (v: string) => {
    if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v) || ids.has(v))
      throw Error("标识重复或无效");
    ids.add(v);
  };
  const str = (v: string, max: number) => {
    if (typeof v !== "string" || v.length > max)
      throw Error("文字过长或格式不正确");
  };
  const notes = (n: Partial<Notes>) => {
    if (!n || typeof n !== "object") throw Error("说明格式不正确");
    for (const k of fields) if (n[k] !== undefined) str(n[k]!, 2000);
  };
  for (const c of s.categories) {
    id(c.id);
    str(c.name, 60);
    str(c.code, 12);
  }
  for (const c of s.cards) {
    id(c.id);
    str(c.title, 100);
    str(c.code, 40);
    if (!s.categories.some((x) => x.id === c.categoryId))
      throw Error("分类不存在");
    notes(c.notes);
    if (c.privateNote) str(c.privateNote, 4000);
    if (!Array.isArray(c.tags) || c.tags.length > 12)
      throw Error("标签格式不正确");
    c.tags.forEach((x) => str(x, 40));
    if(c.gender !== undefined && !(GENDERS as readonly string[]).includes(c.gender)) throw Error('性别分类无效');
    if(c.styles !== undefined && (!Array.isArray(c.styles) || c.styles.length > STYLES.length || c.styles.some(x=>!(STYLES as readonly string[]).includes(x)) || new Set(c.styles).size !== c.styles.length)) throw Error('气质风格无效');
    if (!Array.isArray(c.images) || !c.images.length || c.images.length > 20)
      throw Error("每张卡片需1至20张图片");
    for (const p of c.images) {
      id(p.id);
      if (
        typeof p.src !== "string" ||
        !/^\/(images\/(street|cafe|park|sea|indoor|stairs|pose-reference-styles)\.png|api\/media\/[a-zA-Z0-9_-]+)$/.test(
          p.src,
        )
      )
        throw Error("图片地址不正确");
      if (
        p.panel !== undefined &&
        p.panel !== null &&
        !(p.src === '/images/pose-reference-styles.png' ? [0,1,2,3,4,5] : [0,1,2]).includes(p.panel)
      )
        throw Error("图片分栏无效");
      for (const dim of [p.width, p.height]) {
        if (dim !== undefined && (!Number.isInteger(dim) || dim <= 0 || dim > 30000))
          throw Error("图片尺寸无效");
      }
      notes(p.notes || {});
    }
    if (
      c.source?.url &&
      !/^https:\/\/(www\.|jingxuan\.)?douyin\.com\//.test(c.source.url)
    )
      throw Error("来源链接需为抖音HTTPS链接");
  }
  for (const a of s.albums) {
    id(a.id);
    str(a.name, 100);
    if (a.description) str(a.description, 1000);
    if (
      !Array.isArray(a.cardIds) ||
      a.cardIds.length > 2000 ||
      new Set(a.cardIds).size !== a.cardIds.length ||
      a.cardIds.some((x) => !s.cards.some((c) => c.id === x))
    )
      throw Error("册子引用无效");
  }
  return true;
}
