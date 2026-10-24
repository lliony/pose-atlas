import type { AiDraftResult } from '../../src/lib/ai-types.ts';
import { GENDERS, STYLES } from '../../src/lib/card-appearance.ts';
import { AiError } from './errors.ts';

/**
 * 从模型输出的原始文本里取出可 JSON.parse 的正文，并把抓回草稿的字段规范化。
 * 这些都是纯函数，从 transport/provider.ts 里独立出来，便于单独测试与复用在别处。
 */

/** 抽取单个 JSON 代码块。模型偶尔会在代码块前后夹解释文字，
 * 旧实现要求整段正好是一个代码块，遇到夹话就直接 INVALID_RESPONSE。 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  // 找任意位置的第一个 ``` 代码块；找不到就当作纯 JSON 原文。
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

export function normalizeDraft(raw: unknown): AiDraftResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) =>
    typeof v === 'string' ? v.trim().slice(0, max) : '';
  const list = (v: unknown, max: number, itemMax: number) =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, itemMax)).filter(Boolean))].slice(0, max)
      : [];
  const n = (r.notes ?? {}) as Record<string, unknown>;
  // 80 字是打印预检的硬上限，超了会拒绝打印，所以这里就截断
  const notes = {
    pose: text(n.pose, 80),
    camera: text(n.camera, 80),
    composition: text(n.composition, 80),
    light: text(n.light, 80),
    cautions: text(n.cautions, 80),
  };
  const gender = typeof r.gender === 'string' && (GENDERS as readonly string[]).includes(r.gender) ? r.gender : undefined;
  const styles = list(r.styles, 3, 20).filter((s) => (STYLES as readonly string[]).includes(s));
  const result: AiDraftResult = { title: text(r.title, 28), tags: list(r.tags, 4, 12), styles, notes };
  if (gender) result.gender = gender;
  if (!result.title && !Object.values(notes).some(Boolean))
    throw new AiError('INVALID_RESPONSE');
  return result;
}