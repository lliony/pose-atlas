import type { Card } from './types.ts';
export const CARD_RATIOS = ['3:4', '4:3', '9:16', '16:9'] as const;
export const GENDERS = ['女性', '男性', '多人'] as const;
export const STYLES = ['甜美', '优雅', '御姐', '清爽', '斯文', '成熟', '酷飒', '自然'] as const;
export type CardAppearance = { ratio: typeof CARD_RATIOS[number]; frame: 'thin' | 'none' };
export const DEFAULT_APPEARANCE: CardAppearance = { ratio: '3:4', frame: 'thin' };
export function normalizeAppearance(value: unknown): CardAppearance {
  const v = value as Partial<CardAppearance> | null;
  return { ratio: v && CARD_RATIOS.includes(v.ratio!) ? v.ratio! : '3:4', frame: v?.frame === 'none' ? 'none' : 'thin' };
}
export function matchesPerson(card: Card, gender: string, style: string) {
  return (gender === '全部' || (card.gender || '未分类') === gender) &&
    (style === '全部' || (style === '未分类' ? !card.styles?.length : !!card.styles?.includes(style)));
}
