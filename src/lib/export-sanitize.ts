import type {
  Album,
  Card,
  Category,
  Notes,
  Photo,
  Publication,
  State,
} from "./types.ts";

const NOTE_KEYS = [
  "pose",
  "camera",
  "composition",
  "light",
  "cautions",
] as const;

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const notes = (value: unknown): Notes => {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const output = {} as Notes;
  for (const key of NOTE_KEYS) output[key] = text(source[key]);
  return output;
};

const partialNotes = (value: unknown): Partial<Notes> => {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const output: Partial<Notes> = {};
  for (const key of NOTE_KEYS)
    if (typeof source[key] === "string") output[key] = source[key] as string;
  return output;
};

const photo = (value: unknown): Photo | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const src = text(source.src);
  if (!src) return null;
  const output: Photo = {
    id: text(source.id),
    src,
    ai: source.ai === true,
    notes: partialNotes(source.notes),
  };
  if (source.panel === null || typeof source.panel === "number")
    output.panel = source.panel;
  if (
    typeof source.width === "number" &&
    Number.isFinite(source.width) &&
    source.width > 0
  )
    output.width = source.width;
  if (
    typeof source.height === "number" &&
    Number.isFinite(source.height) &&
    source.height > 0
  )
    output.height = source.height;
  return output;
};

const card = (value: unknown): Card | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = text(source.id);
  if (!id) return null;
  const output: Card = {
    id,
    categoryId: text(source.categoryId),
    code: text(source.code),
    title: text(source.title),
    tags: strings(source.tags),
    notes: notes(source.notes),
    images: Array.isArray(source.images)
      ? source.images.map(photo).filter((item): item is Photo => item !== null)
      : [],
  };
  if (typeof source.gender === "string") output.gender = source.gender;
  if (Array.isArray(source.styles)) output.styles = strings(source.styles);
  if (typeof source.privateNote === "string")
    output.privateNote = source.privateNote;
  if (source.deleted === true) output.deleted = true;
  if (source.source && typeof source.source === "object") {
    const link = source.source as Record<string, unknown>;
    output.source = {
      url: text(link.url),
      title: text(link.title),
      author: text(link.author),
    };
  }
  return output;
};

const category = (value: unknown): Category | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = text(source.id);
  if (!id) return null;
  return { id, name: text(source.name), code: text(source.code) };
};

const album = (value: unknown): Album | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const id = text(source.id);
  if (!id) return null;
  // shareId 是公开分享的访问凭据，不写进任何导出文件。
  return {
    id,
    name: text(source.name),
    description: text(source.description),
    cardIds: strings(source.cardIds),
  };
};

const list = <T>(value: unknown, convert: (item: unknown) => T | null): T[] =>
  Array.isArray(value)
    ? value.map(convert).filter((item): item is T => item !== null)
    : [];

/** 只保留应用认识的字段：未知字段（apiKey、token 等）一律不进入导出。 */
export function sanitizeState(state: State): State {
  return {
    categories: list(state?.categories, category),
    cards: list(state?.cards, card),
    albums: list(state?.albums, album),
  };
}

/** 公开版本的导出同样只保留白名单字段。 */
export function sanitizePublication(publication: Publication): Publication {
  return {
    id: text(publication?.id),
    name: text(publication?.name),
    description: text(publication?.description),
    publishedAt: text(publication?.publishedAt),
    categories: list(publication?.categories, category),
    cards: list(publication?.cards, card),
  };
}
