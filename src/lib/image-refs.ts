import type { Publication, State } from "./types.ts";

/** 卡片里引用到的全部图片地址（含回收站里的卡片，恢复时还要用）。 */
export function stateSources(state: State): Set<string> {
  const sources = new Set<string>();
  for (const card of state.cards)
    for (const image of card.images) sources.add(image.src);
  return sources;
}

/** 公开快照里引用到的图片；只有仍在使用的快照才需要保护。 */
export function publicationSources(publication: Publication): string[] {
  return publication.cards.flatMap((card) =>
    card.images.map((image) => image.src),
  );
}

const MEDIA_SRC = /\/api\/media\/[A-Za-z0-9-]+/g;

/** 从本地草稿的原始 JSON 文本里捞出图片地址，避免清理时误删正在编辑的图。 */
export function draftSources(drafts: Iterable<string>): Set<string> {
  const sources = new Set<string>();
  for (const raw of drafts)
    for (const match of raw.match(MEDIA_SRC) ?? []) sources.add(match);
  return sources;
}
