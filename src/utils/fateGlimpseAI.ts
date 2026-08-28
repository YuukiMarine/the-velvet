/**
 * fateGlimpseAI — 「窥探命运」总占卜（v2.7）。
 *
 * 连续 7 天集齐每日塔罗后，把 7 张牌连成一条线，结合 7 天成长记录、
 * 五维属性与未完成愿望做一次回望 + 前瞻的总占卜。
 * 走「深思熟虑」档（与中长期占卜同级）；无 Key / 失败时有离线兜底。
 * 输出结构化四段：verdict（结语）/ summary（总结）/ outlook（展望）/ advice（建议）。
 */
import { Activity, Attribute, AttributeId, FateGlimpseDay, Settings, TarotOrientation } from '@/types';
import { TAROT_BY_ID, FORTUNE_META, TarotCardData } from '@/constants/tarot';
import { resolveProvider } from '@/utils/aiProviders';
import { chatComplete, getDeliberateAIConfig } from '@/utils/aiClient';
import type { AIRequestData } from '@/utils/tarotAI';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export interface FateGlimpseAIResult {
  verdict: string;
  summary: string;
  outlook: string;
  advice: string;
}

/** 供 prompt 使用的愿望行（store 侧组装后传入，保持本模块纯粹） */
export interface FateWishLine {
  title: string;
  currentState?: string;
}

const cardLine = (c: TarotCardData, orientation: TarotOrientation): string => {
  const o = orientation === 'upright' ? '正位' : '逆位';
  const m = orientation === 'upright' ? c.upright : c.reversed;
  return `《${c.name} ${c.nameEn}》(${o}) — ${m.keywords.join('、')}`;
};

const SYSTEM_PROMPT = `你是靛蓝色房间的塔罗解读者。语气庄严而富有诗意，带着神秘学气息，但从不故弄玄虚；判断要准，语气要稳。输出文字不要出现任何自称，也不要提到"解读者"、"AI"、"我"。
客人在连续七天里每日抽取一张塔罗。如今七张牌齐聚，客人长按牌阵中央、请求一次「窥探命运」——这是庄重的总占卜仪式，请：
1. 把七张牌**连成一条线**读：起点在哪、途中如何转折、落点指向何处。必须体现牌与牌之间的递进/冲突/回应，不要逐张平铺百科牌意。
2. 与七天里的真实记录相互印证：牌面说的与客人做的，哪里重合、哪里背离。
3. 望向接下来三天（窥探所及的时限），并落到未完成愿望上给出可执行的方向。

**输出必须是严格的合法 JSON**（不要代码块、不要任何其它文字）：
{
  "verdict": "一句凝练的命运结语，8~16 字，不带句末标点（将烫印在命运之牌上）",
  "summary": "总结：这七天的轨迹如何行进，4~6 句。把七张牌的线索与真实记录编在一起说",
  "outlook": "展望：接下来三天的走向与要紧处，3~5 句。允许指出风险，但以点亮方向为主",
  "advice": "建议：2~3 条具体可执行的行动，每条一行、以「· 」开头。至少一条要与未完成愿望有关（若有愿望）"
}

【关于五项属性的命名约束（非常重要）】
客人自己定义了五项属性的名字。正文中提到属性时**必须严格使用客人列表中的原文**，不允许翻译、意译或加注。`;

export function buildFateGlimpseRequest(params: {
  settings: Settings;
  attributes: Attribute[];
  days: FateGlimpseDay[];
  recentActivities: Activity[];
  wishes: FateWishLine[];
  userName: string;
  now?: Date;
}): AIRequestData {
  const { settings, attributes, days, recentActivities, wishes, userName, now = new Date() } = params;
  // 与中长期占卜同档：深思熟虑（可跨服务商；未配置时回落当前连接）
  const deliberate = getDeliberateAIConfig(settings);
  const { baseUrl, model } = deliberate ?? resolveProvider(
    settings.summaryApiProvider,
    settings.summaryApiBaseUrl,
    settings.summaryModel,
  );

  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const dayBlocks = days.map((d, i) => {
    const card = TAROT_BY_ID[d.cardId];
    const w = WEEKDAYS[new Date(`${d.date}T12:00:00`).getDay()];
    const fortune = d.fortune ? FORTUNE_META[d.fortune]?.label ?? '' : '';
    return `第${i + 1}天 ${d.date}（${w}）：${card ? cardLine(card, d.orientation) : d.cardId}${fortune ? `；当日运势：${fortune}` : ''}；当日加成属性：${attrNames[d.attribute] ?? d.attribute}`;
  }).join('\n');

  const actLines = recentActivities.slice(0, 28).map(a => {
    const d = new Date(a.date);
    const pts = ATTRIBUTE_IDS
      .filter(k => (a.pointsAwarded?.[k] ?? 0) > 0)
      .map(k => `${attrNames[k] ?? k}+${a.pointsAwarded[k]}`)
      .join(' ');
    return `[${d.getMonth() + 1}/${d.getDate()}] ${a.description}${pts ? `（${pts}）` : ''}`;
  });

  const attrBlock = ATTRIBUTE_IDS.map(id => {
    const a = attributes.find(x => x.id === id);
    return `- ${attrNames[id] ?? id}：Lv.${a?.level ?? 1}（${a?.points ?? 0} 点）`;
  }).join('\n');

  const wishBlock = wishes.length
    ? wishes.slice(0, 5).map(w => `- ${w.title}${w.currentState ? `（现状：${w.currentState.slice(0, 40)}）` : ''}`).join('\n')
    : '（暂无未完成的愿望）';

  const userMessage = [
    `当前时间：${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${WEEKDAYS[now.getDay()]}`,
    `客人：${userName}`,
    ``,
    `**七日牌阵（按时间顺序）**：`,
    dayBlocks,
    ``,
    `**客人的五维属性**（属性名为客人自定义，提及时逐字使用）：`,
    attrBlock,
    ``,
    `**这七天的成长记录**：`,
    actLines.length ? actLines.join('\n') : '（这七天没有记录——这件事本身也值得被牌面看见）',
    ``,
    `**未完成的愿望**：`,
    wishBlock,
    ``,
    `请按系统指令输出 JSON。`,
  ].join('\n');

  return {
    baseUrl,
    model,
    apiKey: deliberate?.apiKey ?? settings.summaryApiKey ?? '',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  };
}

/** 调用 AI 完成总占卜。失败时抛出（由调用方决定重试或离线兜底） */
export async function callFateGlimpseAI(
  req: AIRequestData,
  signal?: AbortSignal,
): Promise<FateGlimpseAIResult> {
  const raw = await chatComplete(req, req.messages, { temperature: 0.85, maxTokens: 1600, signal });
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  const jsonLike = first >= 0 && last > first ? stripped.slice(first, last + 1) : stripped;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    throw new Error('AI 返回不是合法 JSON');
  }
  const verdict = typeof parsed.verdict === 'string' ? parsed.verdict.trim().replace(/[。！？!?.]$/, '') : '';
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const outlook = typeof parsed.outlook === 'string' ? parsed.outlook.trim() : '';
  const advice = typeof parsed.advice === 'string' ? parsed.advice.trim() : '';
  if (!verdict || !summary || !outlook || !advice) throw new Error('AI 返回字段不完整');
  return { verdict: verdict.slice(0, 24), summary, outlook, advice };
}

/** 无 Key / AI 失败时的离线兜底：按七张牌的吉凶与属性构成确定性文案 */
export function buildOfflineFateGlimpse(
  days: FateGlimpseDay[],
  attrNames: Record<AttributeId, string>,
): FateGlimpseAIResult {
  const firstCard = TAROT_BY_ID[days[0]?.cardId];
  const lastCard = TAROT_BY_ID[days[days.length - 1]?.cardId];
  const goodish = days.filter(d => d.fortune === 'great' || d.fortune === 'good').length;
  const badish = days.filter(d => d.fortune === 'bad').length;
  const reversed = days.filter(d => d.orientation === 'reversed').length;

  // 出现最多的加成属性 = 这七天命运侧重的维度
  const counts = new Map<AttributeId, number>();
  for (const d of days) counts.set(d.attribute, (counts.get(d.attribute) ?? 0) + 1);
  const domAttr = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'guts';
  const domName = attrNames[domAttr] ?? domAttr;

  const tone = badish >= 3 ? 'rough' : goodish >= 4 ? 'bright' : 'mixed';
  const verdict = tone === 'bright' ? '七星连缀 势在必行'
    : tone === 'rough' ? '暗流之下 静水深流'
    : '明暗交织 路在脚下';

  const summary = [
    `七天前，《${firstCard?.name ?? '起始之牌'}》为这段旅程起了头；到今天，《${lastCard?.name ?? '收束之牌'}》把线收在了此刻。`,
    `七张牌里有 ${reversed} 张逆位——${reversed >= 4 ? '这一程走得并不轻省，多数时候你是在与惯性角力' : '大势尚顺，波折只是间奏'}。`,
    `命运在这七天里反复落在「${domName}」上：它既是你被看见的地方，也是下一步的支点。`,
  ].join('');

  const outlook = tone === 'bright'
    ? `接下来三天顺风仍在。已经点着的火别让它熄，趁势把最想推进的那件事再往前推一格；警惕的只有一样——把顺利误认为理所当然。`
    : tone === 'rough'
      ? `接下来三天宜稳不宜急。把大事拆小，先守住每天一件确定能完成的事；低潮期的推进比顺境更算数，牌面会记得。`
      : `接下来三天明暗参半：有一件事会给你正反馈，也有一件事考验耐心。分清哪件值得用力，别把力气平均摊薄。`;

  const advice = [
    `· 顺着「${domName}」再安排一次具体行动，让这周的侧重延续成惯性`,
    `· 挑一个未完成的愿望，为它写下最小的下一步（十分钟内能做完的那种）`,
    `· 三天 buff 生效期间，每天至少记录一件事——首次记录会得到命运的馈赠`,
  ].join('\n');

  return { verdict, summary, outlook, advice };
}
