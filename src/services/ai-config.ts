import type { AiConfig } from "../lib/ai-types.ts";

export type AiProfile = AiConfig & { id: string; name: string };
export type AiFeature = "recommend" | "draft";
type ProfileStore = {
  version: 1;
  profiles: AiProfile[];
  recommend: string;
  draft: string;
};

function copy(config: AiConfig): AiConfig {
  return {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  };
}

function copyProfile(profile: AiProfile): AiProfile {
  return {
    id: profile.id,
    name: profile.name,
    ...copy(profile),
  };
}

const isConfig = (value: unknown): value is AiConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.baseUrl === "string" &&
    typeof config.apiKey === "string" &&
    typeof config.model === "string"
  );
};

const isProfile = (value: unknown): value is AiProfile =>
  isConfig(value) &&
  typeof (value as Record<string, unknown>).id === "string" &&
  typeof (value as Record<string, unknown>).name === "string";

/** Keep one store per signed-in user above the panel for page-session lifetime.
 * Storage errors are reported to the caller for display, never swallowed as success.
 */
export function createConfigStore(
  userId: string,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
) {
  const key = `pose-ai-config:${userId}`;
  const profileKey = `pose-ai-profiles:${userId}`;
  let memory: AiConfig | null | undefined;
  let remembered = false;
  let profiles: ProfileStore | null | undefined;
  let profilesRemembered = false;

  function remove() {
    try {
      storage.removeItem(key);
    } catch {
      throw Error("无法删除已记住的 AI 配置，请检查浏览器存储权限");
    }
  }

  function removeProfiles() {
    try {
      storage.removeItem(profileKey);
    } catch {
      throw Error("无法删除已保存的模型档案，请检查浏览器存储权限");
    }
  }

  function readProfiles(): ProfileStore | null {
    if (profiles !== undefined) return profiles;
    let raw: string | null = null;
    try {
      raw = storage.getItem(profileKey);
    } catch {
      throw Error("无法读取模型档案，请检查浏览器存储权限");
    }
    if (raw) {
      try {
        const value = JSON.parse(raw) as Partial<ProfileStore>;
        if (Array.isArray(value.profiles)) {
          const list = value.profiles.filter(isProfile).map(copyProfile);
          if (list.length) {
            profiles = {
              version: 1,
              profiles: list,
              recommend: typeof value.recommend === "string" ? value.recommend : "",
              draft: typeof value.draft === "string" ? value.draft : "",
            };
            profilesRemembered = true;
            return profiles;
          }
        }
      } catch {
        /* 坏数据按没有档案处理 */
      }
    }
    // 兼容旧版单配置：当作一个叫“默认模型”的档案
    const legacy = load();
    if (legacy) {
      profiles = {
        version: 1,
        profiles: [{ id: "default", name: "默认模型", ...legacy }],
        recommend: "default",
        draft: "default",
      };
      return profiles;
    }
    profiles = null;
    return null;
  }

  function persistProfiles() {
    if (!profiles) return;
    try {
      storage.setItem(profileKey, JSON.stringify(profiles));
      profilesRemembered = true;
    } catch {
      throw Error("未能保存模型档案，请检查浏览器存储空间或权限");
    }
  }

  function load(): AiConfig | null {
    if (memory !== undefined) return memory ? copy(memory) : null;
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      throw Error("无法读取 AI 配置，请检查浏览器存储权限");
    }
    if (raw === null) {
      memory = null;
      return null;
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (!isConfig(value)) return null;
      memory = copy(value);
      remembered = true;
      return copy(memory);
    } catch {
      return null;
    }
  }

  return {
    isRemembered(): boolean {
      return remembered || profilesRemembered;
    },
    load,
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
      profiles = null;
      profilesRemembered = false;
      removeProfiles();
    },

    /** 全部模型档案（含旧版单配置迁移出来的“默认模型”）。 */
    profiles(): AiProfile[] {
      const value = readProfiles();
      return value ? value.profiles.map(copyProfile) : [];
    },
    /** 指定功能当前使用的档案 id（空串表示没选，回落到第一个）。 */
    /** 该功能显式指定的档案 id；空串表示使用系统默认。 */
    useForId(feature: AiFeature): string {
      const value = readProfiles();
      if (!value) return "";
      const id = feature === "recommend" ? value.recommend : value.draft;
      return value.profiles.some((p) => p.id === id) ? id : "";
    },
    /** 该功能实际使用的配置；没有任何档案时返回 null，交给系统默认。 */
    useFor(feature: AiFeature): AiProfile | null {
      const value = readProfiles();
      if (!value) return null;
      const id = feature === "recommend" ? value.recommend : value.draft;
      const found = value.profiles.find((p) => p.id === id);
      return found ? copyProfile(found) : null;
    },
    setUseFor(feature: AiFeature, id: string): void {
      const value = readProfiles();
      if (!value) return;
      if (feature === "recommend") value.recommend = id;
      else value.draft = id;
      if (profilesRemembered) persistProfiles();
    },
    saveProfile(profile: AiProfile, remember: boolean): void {
      const value = readProfiles() ?? {
        version: 1 as const,
        profiles: [],
        recommend: "",
        draft: "",
      };
      const clean = copyProfile(profile);
      const index = value.profiles.findIndex((p) => p.id === clean.id);
      if (index >= 0) value.profiles[index] = clean;
      else value.profiles.push(clean);
      if (!value.recommend) value.recommend = clean.id;
      if (!value.draft) value.draft = clean.id;
      profiles = value;
      if (remember) persistProfiles();
      else profilesRemembered = profilesRemembered || false;
    },
    removeProfile(id: string): void {
      const value = readProfiles();
      if (!value) return;
      value.profiles = value.profiles.filter((p) => p.id !== id);
      if (value.recommend === id) value.recommend = "";
      if (value.draft === id) value.draft = "";
      if (!value.profiles.length) {
        profiles = null;
        profilesRemembered = false;
        removeProfiles();
        return;
      }
      if (profilesRemembered) persistProfiles();
    },
  };
}
