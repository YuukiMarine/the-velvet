import { AttributeId, TarotOrientation } from '@/types';
import { TarotCardData, inferFortune, FORTUNE_META } from '@/constants/tarot';
import type { DailyAIResult } from './tarotAI';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

/** 当 AI 不可用时，为每日塔罗生成兜底解读文案。 */
export function buildOfflineDaily(
  card: TarotCardData,
  orientation: TarotOrientation,
): DailyAIResult {
  const meaning = orientation === 'upright' ? card.upright : card.reversed;
  const oLabel = orientation === 'upright' ? '正位' : '逆位';

  const adviceFromCard = card.advice?.[orientation];
  const advice = adviceFromCard
    ?? `${meaning.keywords.slice(0, 2).join('、')}——把它落到今天的一个具体动作上。`;

  const kwList = meaning.keywords.join(' · ');
  const fortune = inferFortune(card.id, orientation);
  const fortuneLabel = FORTUNE_META[fortune].label;

  const narration = [
    `## 今日之牌`,
    `《${card.name}》(${oLabel})`,
    ``,
    `${meaning.meaning}`,
    ``,
    `## 宜与忌`,
    `- 宜：${orientation === 'upright' ? `顺应 ${kwList}` : `正视 ${kwList}`}`,
    `- 忌：${orientation === 'upright' ? '过度自我怀疑' : '一味蛮干'}`,
    `- 慎：${orientation === 'upright' ? '不要把顺势误当永恒' : '不要将一次受挫放大为整日基调'}`,
    ``,
    `> 离线模式下的静默解读（总体运势：${fortuneLabel}）。若配置 AI API，将获得更贴合你近期记录的注解。`,
  ].join('\n');

  const attribute: AttributeId = card.relatedAttribute
    ?? ATTRIBUTE_IDS[Math.floor(Math.random() * ATTRIBUTE_IDS.length)];

  return { narration, advice, attribute, fortune };
}
