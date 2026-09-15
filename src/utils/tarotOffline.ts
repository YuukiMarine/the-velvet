import { AttributeId, TarotOrientation } from '@/types';
import { TarotCardData, inferFortune, FORTUNE_META } from '@/constants/tarot';
import { firstSentence, type DailyAIResult } from './tarotAI';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

/**
 * 当 AI 不可用时，为每日塔罗生成兜底解读文案。
 * v2.7.0.6：正文改用牌面的「对号入座」描述（tarotReflections），签语取它的第一句——
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

  const advice = firstSentence(meaning.reflection);

  const narration = [
    meaning.reflection,
    ``,
    `《${card.name}》${oLabel}：${meaning.keywords.join(' · ')}。${meaning.meaning}`,
    ``,
    `> 离线模式下的静默解读（总体运势：${fortuneLabel}）。若配置 AI API，将获得更贴合你近期处境的注解。`,
  ].join('\n');

  const attribute: AttributeId = card.relatedAttribute
    ?? ATTRIBUTE_IDS[Math.floor(Math.random() * ATTRIBUTE_IDS.length)];

  return { narration, advice, attribute, fortune };
}
