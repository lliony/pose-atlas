import { useEffect, useState } from "react";
import {
  THEMES,
  applyTheme,
  getCurrentTheme,
  readStoredTheme,
  type Theme,
} from "../lib/theme";

/**
 * 三档配色切换器。
 * - 手动切换会写入 localStorage，并停止跟随系统；
 * - 从未手动选择过时，系统深浅色变化会实时同步。
 * - `compact`（顶栏用）：只显示三个色点，不放文字标签。
 */
export default function ThemeSwitch({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      if (readStoredTheme()) return; // 用户已手动选择，不再被系统覆盖
      setTheme(applyTheme(media.matches ? "dark" : "paper", { persist: false }));
    };
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return (
    <div
      className={"theme-switch" + (compact ? " theme-switch--compact" : "")}
      role="group"
      aria-label="配色方案"
    >
      {THEMES.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={theme === option.id}
          aria-label={`${option.name}配色（${option.hint}）`}
          title={`${option.name} · ${option.hint}`}
          onClick={() => setTheme(applyTheme(option.id))}
        >
          <span
            className="sw"
            style={{ background: option.dot }}
            aria-hidden="true"
          />
          {!compact && <span className="lbl">{option.name}</span>}
        </button>
      ))}
    </div>
  );
}
