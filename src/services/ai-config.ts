import type { AiConfig } from "../lib/ai-types.ts";

function copy(config: AiConfig): AiConfig {
  return {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  };
}

/** Keep one store per signed-in user above the panel for page-session lifetime.
 * Storage errors are reported to the caller for display, never swallowed as success.
 */
export function createConfigStore(
  userId: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
) {
  const key = `pose-ai-config:${userId}`;
  let memory: AiConfig | null | undefined;
  let remembered = false;
  function remove() {
    try {
      storage.removeItem(key);
    } catch {
      throw Error("无法删除已记住的 AI 配置，请检查浏览器存储权限");
    }
  }
  return {
    isRemembered(): boolean {
      return remembered;
    },
    load(): AiConfig | null {
      if (memory !== undefined) return memory ? copy(memory) : null;
      let raw: string | null;
      try {
        raw = storage.getItem(key);
      } catch {
        throw Error("无法读取 AI 配置，请检查浏览器存储权限");
      }
      if (raw === null) return null;
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value))
          return null;
        const config = value as Record<string, unknown>;
        if (
          typeof config.baseUrl !== "string" ||
          typeof config.apiKey !== "string" ||
          typeof config.model !== "string"
        )
          return null;
        memory = copy(config as AiConfig);
        remembered = true;
        return copy(memory);
      } catch {
        return null;
      }
    },
    save(config: AiConfig, remember: boolean): void {
      memory = copy(config);
      if (!remember) {
        remove();
        remembered = false;
        return;
      }
      try {
        storage.setItem(key, JSON.stringify(memory));
        remembered = true;
      } catch {
        throw Error(
          "未能记住 AI 配置；本次页面会话仍可使用，请检查浏览器存储空间或权限",
        );
      }
    },
    clear(): void {
      memory = null;
      remove();
      remembered = false;
    },
  };
}
