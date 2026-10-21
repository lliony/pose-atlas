import type { Notes } from "./types.ts";

export type AiMode = "scene" | "reference";
export type AiScope =
  | { kind: "all" }
  | { kind: "album"; id: string }
  | { kind: "category"; id: string };
export type AiConfig = { baseUrl: string; apiKey: string; model: string };
export type AiSelection =
  | { kind: "default" }
  | { kind: "personal"; config: AiConfig };
export type AiCandidate = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  notes: Notes;
  imageNotes: { index: number; notes: Notes }[];
};
export type AiImage = { mime: "image/jpeg"; base64: string };
export type AiRequest = {
  mode: AiMode;
  scope: AiScope;
  description: string;
  image?: AiImage;
  candidates: AiCandidate[];
  selection: AiSelection;
};
export type AiDraftRequest = {
  selection: AiSelection;
  /** 当前分类名，用来让文案贴合场景 */
  category?: string;
  title?: string;
  notes?: Partial<Notes>;
  image?: AiImage;
};
export type AiDraftResult = {
  title: string;
  tags: string[];
  gender?: string;
  styles: string[];
  notes: Notes;
};
export type AiResult = {
  sceneSummary: string;
  recommendations: { cardId: string; reason: string; adjustment: string }[];
};
export const AI_LIMITS = {
  originalBytes: 10 * 1024 * 1024,
  imageBytes: 2 * 1024 * 1024,
  imageSide: 1600,
  bodyBytes: 4 * 1024 * 1024,
  candidateChars: 120000,
  timeoutMs: 60000,
  results: 5,
} as const;
