export type Theme = "paper" | "white" | "dark";

export type ThemeOption = {
  id: Theme;
  /** 切换器上显示的短名 */
  name: string;
  /** 悬停提示里的一句话配色说明 */
  hint: string;
  /** 切换器上的色点 */
  dot: string;
};

export const THEMES: readonly ThemeOption[] = [
  { id: "paper", name: "纸本", hint: "暖纸 + 陶土橙", dot: "#f7f1e7" },
  { id: "white", name: "白墙", hint: "纯白 + 陶土红", dot: "#ffffff" },
  { id: "dark", name: "暗房", hint: "深褐 + 琥珀", dot: "#17120e" },
];

export const THEME_STORAGE_KEY = "pose-atlas:theme";

const THEME_IDS: readonly string[] = THEMES.map((theme) => theme.id);

/** 只接受三种已知主题，其余（脏数据、旧值）一律视为未选择。 */
export function normalizeTheme(value: unknown): Theme | null {
  return typeof value === "string" && THEME_IDS.includes(value)
    ? (value as Theme)
    : null;
}

/** 已保存的选择优先；没有选择时跟随系统深浅色。 */
export function resolveTheme(
  stored: string | null | undefined,
  systemDark: boolean,
): Theme {
  return normalizeTheme(stored) ?? (systemDark ? "dark" : "paper");
}

export function readStoredTheme(): Theme | null {
  try {
    return normalizeTheme(globalThis.localStorage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return null; // 隐私模式下读不到存储
  }
}

/** 支持 ?theme=dark 这类一次性预览链接（不写入本地存储）。 */
export function readThemeFromQuery(search: string): Theme | null {
  try {
    return normalizeTheme(new URLSearchParams(search).get("theme"));
  } catch {
    return null;
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

/** 读取当前生效的主题：以 document 上已应用的值为准，保证与首屏脚本一致。 */
export function getCurrentTheme(): Theme {
  if (typeof document === "undefined") return "paper";
  return (
    normalizeTheme(document.documentElement.dataset.theme) ??
    resolveTheme(readStoredTheme(), systemPrefersDark())
  );
}

export function applyTheme(
  theme: Theme,
  options: { persist?: boolean } = {},
): Theme {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  if (options.persist ?? true) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* 写入失败不影响本次切换 */
    }
  }
  return theme;
}
