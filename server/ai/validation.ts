import sharp from "sharp";
import type {
  AiRequest,
  AiCandidate,
  AiScope,
  AiSelection,
  AiImage,
  AiConfig,
} from "../../src/lib/ai-types.ts";
import { AI_LIMITS } from "../../src/lib/ai-types.ts";
import type { Notes } from "../../src/lib/types.ts";
import { AiError } from "./errors.ts";
import { parseEndpoint } from "./endpoint.ts";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AiError("INVALID_INPUT");
  return value as Record<string, unknown>;
}
function string(
  value: unknown,
  max: number = AI_LIMITS.candidateChars,
  required = false,
): string {
  if (typeof value !== "string") throw new AiError("INVALID_INPUT");
  if (value.length > max) throw new AiError("PAYLOAD_TOO_LARGE");
  if (required && !value.trim()) throw new AiError("INVALID_INPUT");
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new AiError("INVALID_INPUT");
  return value;
}
function notes(value: unknown): Notes {
  const n = object(value);
  return {
    pose: string(n.pose),
    camera: string(n.camera),
    composition: string(n.composition),
    light: string(n.light),
    cautions: string(n.cautions),
  };
}
function candidate(value: unknown): AiCandidate {
  const c = object(value);
  return {
    id: string(c.id, AI_LIMITS.candidateChars, true),
    title: string(c.title),
    category: string(c.category),
    tags: array(c.tags).map((v) => string(v)),
    notes: notes(c.notes),
    imageNotes: array(c.imageNotes).map((value) => {
      const n = object(value);
      if (!Number.isSafeInteger(n.index) || (n.index as number) < 1)
        throw new AiError("INVALID_INPUT");
      return { index: n.index as number, notes: notes(n.notes) };
    }),
  };
}
export async function image(value: unknown): Promise<AiImage> {
  const i = object(value);
  if (i.mime !== "image/jpeg" || typeof i.base64 !== "string")
    throw new AiError("IMAGE_UNSUPPORTED");
  if (i.base64.length > 4 * Math.ceil(AI_LIMITS.imageBytes / 3))
    throw new AiError("PAYLOAD_TOO_LARGE");
  if (
    !i.base64.length ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      i.base64,
    )
  )
    throw new AiError("IMAGE_UNSUPPORTED");
  const bytes = Buffer.from(i.base64, "base64");
  if (bytes.length > AI_LIMITS.imageBytes)
    throw new AiError("PAYLOAD_TOO_LARGE");
  if (bytes.toString("base64") !== i.base64)
    throw new AiError("IMAGE_UNSUPPORTED");
  try {
    const decoder = sharp(bytes, {
      limitInputPixels: AI_LIMITS.imageSide ** 2,
      failOn: "warning",
    });
    const metadata = await decoder.metadata();
    if (
      metadata.format !== "jpeg" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > AI_LIMITS.imageSide ||
      metadata.height > AI_LIMITS.imageSide
    )
      throw new Error();
    await decoder.raw().toBuffer();
  } catch {
    throw new AiError("IMAGE_UNSUPPORTED");
  }
  return { mime: "image/jpeg", base64: i.base64 };
}
export function validatePersonalConfig(value: unknown): AiConfig {
  const config = object(value);
  if (config.protocol !== undefined && config.protocol !== "openai" && config.protocol !== "anthropic")
    throw new AiError("INVALID_INPUT");
  const clean: AiConfig = {
    baseUrl: string(config.baseUrl, 2048, true),
    apiKey: string(config.apiKey, 4096, true),
    model: string(config.model, 256, true),
    ...(config.protocol !== undefined ? { protocol: config.protocol } : {}),
  };
  parseEndpoint(clean.baseUrl, clean.protocol);
  return clean;
}
export async function validateRequest(value: unknown): Promise<AiRequest> {
  const v = object(value);
  if (v.mode !== "scene" && v.mode !== "reference")
    throw new AiError("INVALID_INPUT");
  const s = object(v.scope);
  let scope: AiScope;
  if (s.kind === "all") scope = { kind: "all" };
  else if (s.kind === "album" || s.kind === "category")
    scope = { kind: s.kind, id: string(s.id, AI_LIMITS.candidateChars, true) };
  else throw new AiError("INVALID_INPUT");
  const choice = object(v.selection);
  let selection: AiSelection;
  if (choice.kind === "default") selection = { kind: "default" };
  else if (choice.kind === "personal") {
    selection = { kind: "personal", config: validatePersonalConfig(choice.config) };
  } else throw new AiError("INVALID_INPUT");
  const description = string(v.description, 8000);
  const candidates = array(v.candidates).map(candidate);
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length)
    throw new AiError("INVALID_INPUT");
  if (JSON.stringify(candidates).length > AI_LIMITS.candidateChars)
    throw new AiError("PAYLOAD_TOO_LARGE");
  const validatedImage =
    v.image === undefined ? undefined : await image(v.image);
  if (!description.trim() && !validatedImage)
    throw new AiError("INVALID_INPUT");
  return {
    mode: v.mode,
    scope,
    description,
    ...(validatedImage ? { image: validatedImage } : {}),
    candidates,
    selection,
  };
}

/** 快速填卡：图片可选，标题/现有文案作为提示；必须给图或给标题。 */
export async function validateDraftRequest(
  value: unknown,
): Promise<import("../../src/lib/ai-types.ts").AiDraftRequest> {
  const v = object(value);
  const choice = object(v.selection);
  let selection: import("../../src/lib/ai-types.ts").AiSelection;
  if (choice.kind === "default") selection = { kind: "default" };
  else if (choice.kind === "personal")
    selection = { kind: "personal", config: validatePersonalConfig(choice.config) };
  else throw new AiError("INVALID_INPUT");
  const title = v.title === undefined ? undefined : string(v.title, 100);
  const category = v.category === undefined ? undefined : string(v.category, 50);
  const validatedImage =
    v.image === undefined ? undefined : await image(v.image);
  if (!title?.trim() && !validatedImage) throw new AiError("INVALID_INPUT");
  return {
    selection,
    ...(category?.trim() ? { category: category.trim() } : {}),
    ...(title?.trim() ? { title: title.trim() } : {}),
    ...(validatedImage ? { image: validatedImage } : {}),
  };
}
