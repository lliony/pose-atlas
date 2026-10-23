export const IMAGE_SETTINGS_KEY = "pose-atlas:image-settings";

export type ImageSettings = { keepOriginal: boolean };

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = { keepOriginal: false };

/** 只接受明确的布尔值，损坏或半截数据一律回退默认（压缩）。 */
export function parseImageSettings(raw: string | null): ImageSettings {
  if (!raw) return { ...DEFAULT_IMAGE_SETTINGS };
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keep = (value as Record<string, unknown>).keepOriginal;
      if (typeof keep === "boolean") return { keepOriginal: keep };
    }
  } catch {
    // 回退默认值
  }
  return { ...DEFAULT_IMAGE_SETTINGS };
}

export function loadImageSettings(): ImageSettings {
  try {
    return parseImageSettings(localStorage.getItem(IMAGE_SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_IMAGE_SETTINGS };
  }
}

export function saveImageSettings(settings: ImageSettings): void {
  try {
    localStorage.setItem(
      IMAGE_SETTINGS_KEY,
      JSON.stringify({ keepOriginal: settings.keepOriginal }),
    );
  } catch {
    throw Error("未能保存设置，请检查浏览器存储权限");
  }
}
