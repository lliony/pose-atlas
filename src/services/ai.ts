import type {
  AiConfig,
  AiDraftRequest,
  AiDraftResult,
  AiRequest,
  AiResult,
} from "../lib/ai-types.ts";
import { validateResult } from "../lib/ai-model.ts";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function call(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/ai/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      signal,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw Error("AI 服务不可用，请检查网络连接及本地 AI 服务");
  }
  if (response.status === 404)
    throw Error("AI 服务不可用（404），请启动支持 AI 的本地服务");
  if (response.status === 401 || response.status === 403)
    throw Error("AI 服务认证失败，请检查密钥及服务权限");
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw Error(`AI 服务返回非 JSON 响应（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    const detail = record(value);
    throw Error(
      typeof detail?.error === "string"
        ? detail.error
        : `AI 请求失败（HTTP ${response.status}）`,
    );
  }
  return value;
}

export async function getAiAvailability(
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const value = record(await call("config", signal));
    if (typeof value?.defaultAvailable !== "boolean")
      throw Error("配置状态响应格式不正确");
    return value.defaultAvailable;
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw Error(
      `AI 服务不可用：${error instanceof Error ? error.message : "无法加载配置状态"}`,
    );
  }
}

export async function testAiConfig(
  config: AiConfig,
  signal?: AbortSignal,
): Promise<void> {
  const value = record(await call("test", signal, config));
  if (value?.ok !== true) throw Error("AI 连接测试响应格式不正确");
}

/** 用一张图（或标题）让模型把卡片内容一次写全。 */
export async function requestCardDraft(
  input: AiDraftRequest,
  signal: AbortSignal,
): Promise<AiDraftResult> {
  const value = record(await call("draft", signal, input));
  const notes = record(value?.notes);
  if (
    !value ||
    typeof value.title !== "string" ||
    !notes ||
    typeof notes.pose !== "string"
  )
    throw Error("AI 返回的卡片内容格式不正确");
  return value as unknown as AiDraftResult;
}

export async function requestRecommendations(
  input: AiRequest,
  signal: AbortSignal,
): Promise<AiResult> {
  // Snapshot the allowed IDs before awaiting: later UI edits cannot change this request's scope.
  const ids = new Set(input.candidates.map((candidate) => candidate.id));
  return validateResult(await call("recommend", signal, input), ids);
}
