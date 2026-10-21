import type { State, Notes } from "./types.ts";
import type { AiScope, AiCandidate, AiResult } from "./ai-types.ts";
import { AI_LIMITS } from "./ai-types.ts";
import { fields, resolveNotes } from "./model.ts";

export function buildCandidates(state: State, scope: AiScope): AiCandidate[] {
  let albumIds: Set<string> | undefined;
  if (scope.kind === "album") {
    const album = state.albums.find((a) => a.id === scope.id);
    if (!album) throw Error("卡片册不存在");
    albumIds = new Set(album.cardIds);
  } else if (scope.kind === "category") {
    if (!state.categories.some((c) => c.id === scope.id))
      throw Error("分类不存在");
  } else if (scope.kind !== "all") {
    throw Error("推荐范围无效");
  }
  const candidates = state.cards
    .filter(
      (card) =>
        !card.deleted &&
        (!albumIds || albumIds.has(card.id)) &&
        (scope.kind !== "category" || card.categoryId === scope.id),
    )
    .map((card) => ({
      id: card.id,
      title: card.title,
      category:
        state.categories.find((c) => c.id === card.categoryId)?.name || "",
      tags: [...new Set([...card.tags, ...(card.gender ? [card.gender] : []), ...(card.styles || [])])],
      notes: Object.fromEntries(
        fields.map((key) => [key, card.notes[key] || ""]),
      ) as Notes,
      imageNotes: card.images.map((image, index) => ({
        index: index + 1,
        notes: resolveNotes(card, image),
      })),
    }));
  if (JSON.stringify(candidates).length > AI_LIMITS.candidateChars)
    throw Error("候选教学资料超出字符上限，请缩小推荐范围");
  return candidates;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("推荐结果格式不正确");
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw Error("推荐文字格式不正确或过长");
  return value;
}

export function validateResult(
  value: unknown,
  candidateIds: ReadonlySet<string>,
): AiResult {
  const result = object(value);
  const sceneSummary = string(result.sceneSummary, 2000);
  if (!Array.isArray(result.recommendations)) throw Error("推荐列表格式不正确");
  const rows = result.recommendations.map((value) => {
    const row = object(value);
    return {
      cardId: string(row.cardId, Infinity),
      reason: string(row.reason, 4000),
      adjustment: string(row.adjustment, 4000),
    };
  });
  const seen = new Set<string>();
  const recommendations = rows
    .filter((row) => {
      if (!candidateIds.has(row.cardId) || seen.has(row.cardId)) return false;
      seen.add(row.cardId);
      return true;
    })
    .slice(0, AI_LIMITS.results);
  if (rows.length && !recommendations.length)
    throw Error("推荐结果未包含有效候选卡片");
  return { sceneSummary, recommendations };
}

export function addRecommendations(
  state: State,
  albumId: string,
  ids: string[],
): State {
  if (!state.albums.some((album) => album.id === albumId))
    throw Error("卡片册不存在");
  const validIds = new Set(
    state.cards.filter((card) => !card.deleted).map((card) => card.id),
  );
  return {
    ...state,
    albums: state.albums.map((album) =>
      album.id === albumId
        ? {
            ...album,
            cardIds: [
              ...new Set([
                ...album.cardIds,
                ...ids.filter((id) => validIds.has(id)),
              ]),
            ],
          }
        : album,
    ),
  };
}
