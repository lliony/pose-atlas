import type { AiConfig } from "./ai-types.ts";
import { isAiProtocol } from "./ai-types.ts";
export function validPersonalConfig(
  config: AiConfig | null,
): config is AiConfig {
  if (!config?.apiKey.trim() || !config.model.trim()) return false;
  if (config.protocol !== undefined && !isAiProtocol(config.protocol)) return false;
  try {
    const url = new URL(config.baseUrl);
    return (
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
