import { AttributeId, TarotOrientation } from '@/types';
import { TarotCardData, inferFortune, FORTUNE_META } from '@/constants/tarot';
import type { DailyAIResult } from './tarotAI';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

/**
 * 从牌意里取一句能当签语的话：按逗号 / 句号切段，攒到不超过 max 为止。
 * 大阿卡纳的牌意常常一句三十来字，整句放首页会溢出，取前半句正好像签文。
 */
export const signatureFromMeaning = (meaning: string, max = 24): string => {
  const parts = meaning.split(/[，。！？；,.!?;]/).map(s => s.trim()).filter(Boolean);
  let out = '';
  for (const p of parts) {
    const next = out ? `${out}，${p}` : p;
    if (next.length > max) break;
    out = next;
  }
  return (out || meaning.slice(0, max)).replace(/[，,]$/, '');
};

/**
 * 当 AI 不可用时，为每日塔罗生成兜底解读文案。
 * v2.7.0.6：正文 = 牌面的「对号入座」描述（tarotReflections）+ 牌意；签语取牌意的前半句——
 * 与 AI 路径的"飘渺、可代入"口径一致，不再是"宜/忌"清单。
 */
export function buildOfflineDaily(
  card: TarotCardData,
  orientation: TarotOrientation,
): DailyAIResult {
  const meaning = card[orientation];
  const oLabel = orientation === 'upright' ? '正位' : '逆位';
  const fortune = inferFortune(card.id, orientation);
  const fortuneLabel = FORTUNE_META[fortune].label;

  const advice = signatureFromMeaning(meaning.meaning);

  const narration = [
    `《${card.name}》${oLabel}：${meaning.keywords.join(' · ')}。${meaning.meaning}`,
    ``,
    meaning.reflection,
    ``,
    `> 离线模式下的静默解读（总体运势：${fortuneLabel}）。若配置 AI API，将获得更贴合你近期处境的注解。`,
  ].join('\n');

  const attribute: AttributeId = card.relatedAttribute
    ?? ATTRIBUTE_IDS[Math.floor(Math.random() * ATTRIBUTE_IDS.length)];

  return { narration, advice, attribute, fortune };
}
