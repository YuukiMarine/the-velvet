/**
 * fateGlimpseAI — 「窥探命运」总占卜（v2.7 · v2.7.0.6 改流式）。
 *
 * 连续 7 天集齐每日塔罗后，把 7 张牌连成一条线，结合 7 天成长记录、
 * 五维属性与未完成愿望做一次回望 + 前瞻的总占卜。
 * 走「深思熟虑」档（与中长期占卜同级）；无 Key / 失败时有离线兜底。
 *
 * 输出改为可流式的分段文本（用户口径：塔罗内容全部流式，不让人干等）：
 *   【结语】…            ← 第一行，翻面即烫印在命运之牌上
 *   ## 总结 / ## 展望 / ## 建议
 * parseFateGlimpseText 对半截文本也能解析，UI 边收边渲染。
 */
import { Activity, Attribute, AttributeId, FateGlimpseDay, Settings, TarotOrientation } from '@/types';
import { TAROT_BY_ID, FORTUNE_META, TarotCardData } from '@/constants/tarot';
import { resolveProvider } from '@/utils/aiProviders';
import { chatStream, getAIConfig, getDeliberateAIConfig } from '@/utils/aiClient';
import { OBLIQUE_RULES, type AIRequestData, type StreamOpts } from '@/utils/tarotAI';

const ATTRIBUTE_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DAY_MS = 86400_000;

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
  const m = c[orientation];
  return `《${c.name} ${c.nameEn}》(${o}) — ${m.keywords.join('、')}；${m.meaning}`;
};

export const FATE_VERDICT_MARK = '【结语】';

const SYSTEM_PROMPT = `你是靛蓝色房间的塔罗解读者。像熟人在桌边把这七天讲给客人听：平实、准确、不装腔；一整篇里有一两处意象就够了。输出文字不要出现任何自称，也不要提到"解读者""AI""我"。
客人在连续七天里每日抽取一张塔罗。如今七张牌齐聚，客人长按牌阵中央、请求一次「窥探命运」——这是庄重的总占卜仪式，请：
1. 把七张牌**连成一条线**读：起点在哪、途中如何转折、落点指向何处。必须体现牌与牌之间的递进/冲突/回应，不要逐张平铺百科牌意。
2. 与七天里的真实足迹相互印证：牌面说的与客人做的，哪里重合、哪里背离——但只用"知道的语气"带过，不复述记录、不点事件的名字（记录里有跑步，只说"你为身体花的功夫"），不写任何数字（等级、点数、天数、次数都不许）。整篇这样的话最多三四处。
3. 望向接下来三天（窥探所及的时限），落到远处的愿望上给出方向——愿望原文不要照抄，用它的意象去指。
4. 日期是硬约束：素材里每一行都标了日期，不要把早前的事说成最近。

${OBLIQUE_RULES}

【关于五项属性的命名（非常重要）】
客人自己定义了五项属性的名字。正文中提到属性时**必须严格使用素材里的原文**，不允许翻译、意译或加注；只能出现属性名，不能带等级。

**输出格式（严格，按顺序，不要代码块，不要别的段落）**：
${FATE_VERDICT_MARK}一句凝练的命运结语，8~16 字，不带句末标点
## 总结
这七天的轨迹如何行进，4~6 句。把七张牌的线索与真实足迹编在一起说。
## 展望
接下来三天的走向与要紧处，3~5 句。允许指出风险，但以点亮方向为主。
## 建议
2~3 条可以顺着走的方向，每条一行、以「· 」开头；至少一条要与远处的愿望有关（若有愿望）。`;

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
  const cfg = getDeliberateAIConfig(settings) ?? getAIConfig(settings) ?? {
    ...resolveProvider(settings.summaryApiProvider, settings.summaryApiBaseUrl, settings.summaryModel),
    apiKey: settings.summaryApiKey ?? '',
  };

  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rel = (d: Date) => {
    const n = Math.round((today0 - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY_MS);
    return n <= 0 ? '今天' : n === 1 ? '昨天' : `${n} 天前`;
  };

  const dayBlocks = days.map((d, i) => {
    const card = TAROT_BY_ID[d.cardId];
    const dt = new Date(`${d.date}T12:00:00`);
    const fortune = d.fortune ? FORTUNE_META[d.fortune]?.label ?? '' : '';
    return `第${i + 1}天 ${d.date}（${WEEKDAYS[dt.getDay()]}，${rel(dt)}）：${card ? cardLine(card, d.orientation) : d.cardId}${fortune ? `；当日运势：${fortune}` : ''}；当日加成属性：${attrNames[d.attribute] ?? d.attribute}`;
  }).join('\n');

  const actLines = recentActivities.slice(0, 28).map(a => {
    const d = new Date(a.date);
    const touched = ATTRIBUTE_IDS
      .filter(k => (a.pointsAwarded?.[k] ?? 0) > 0)
      .map(k => attrNames[k] ?? k)
      .join('、');
    return `- ${d.getMonth() + 1}/${d.getDate()} ${WEEKDAYS[d.getDay()]}（${rel(d)}）：${a.description.trim().slice(0, 60)}${touched ? `（${touched}）` : ''}`;
  });

  // 属性只定性：七天里谁在长、谁没动
  const gained: Record<AttributeId, number> = { knowledge: 0, guts: 0, dexterity: 0, kindness: 0, charm: 0 };
  for (const a of recentActivities) for (const k of ATTRIBUTE_IDS) gained[k] += a.pointsAwarded?.[k] ?? 0;
  const byPoints = [...attributes].sort((a, b) => b.points - a.points);
  const strongest = byPoints.filter(a => a.points > 0).slice(0, 2).map(a => attrNames[a.id] ?? a.id);
  const rising = ATTRIBUTE_IDS.filter(k => gained[k] > 0).sort((a, b) => gained[b] - gained[a]).map(k => attrNames[k] ?? k);
  const idle = ATTRIBUTE_IDS.filter(k => gained[k] === 0).map(k => attrNames[k] ?? k);
  const attrBlock = [
    `- 五项属性名：${ATTRIBUTE_IDS.map(k => attrNames[k] ?? k).join('、')}`,
    `- 最厚的底子：${strongest.length ? strongest.join('、') : '尚未分出高下'}`,
    `- 这七天在往上走的：${rising.length ? rising.join('、') : '没有'}`,
    `- 这七天没动静的：${idle.length === ATTRIBUTE_IDS.length ? '全部' : idle.length ? idle.join('、') : '没有'}`,
  ].join('\n');

  const wishBlock = wishes.length
    ? wishes.slice(0, 5).map(w => `- ${w.title.trim().slice(0, 30)}${w.currentState ? `（现状：${w.currentState.trim().slice(0, 40)}）` : ''}`).join('\n')
    : '（暂无未完成的愿望）';

  const userMessage = [
    `现在：${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${WEEKDAYS[now.getDay()]}`,
    `客人：${userName}`,
    ``,
    `**七日牌阵（按时间顺序，每行带日期）**：`,
    dayBlocks,
    ``,
    `**客人的底色**（只有这五个属性名可以出现在正文里；等级与点数一律不许写）：`,
    attrBlock,
    ``,
    `**这七天的足迹**（每行带日期；只可旁敲侧击，不写原文）：`,
    actLines.length ? actLines.join('\n') : '（这七天没有记录——这件事本身也值得被牌面看见）',
    ``,
    `**远处的愿望**（只作底色，不照抄原文）：`,
    wishBlock,
    ``,
    `请按系统指令的格式输出。`,
  ].join('\n');

  return {
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    apiKey: cfg.apiKey,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  };
}

/** 流式：yield 原始增量；调用方累加后用 parseFateGlimpseText 取半成品 */
export async function* streamFateGlimpse(req: AIRequestData, opts: StreamOpts = {}): AsyncGenerator<string> {
  yield* chatStream(req, req.messages, { temperature: 0.85, maxTokens: 3000, ...opts });
}

/**
 * 对（可能半截的）分段文本做解析。
 * 段落标题认「## 总结 / ## 展望 / ## 建议」（也容忍无 ## 的裸标题行）。
 */
export function parseFateGlimpseText(text: string): FateGlimpseAIResult {
  const out: FateGlimpseAIResult = { verdict: '', summary: '', outlook: '', advice: '' };
  const lines = text.replace(/```(?:markdown|md)?/gi, '').split('\n');
  let cur: keyof FateGlimpseAIResult | null = null;
  const buf: Record<string, string[]> = { summary: [], outlook: [], advice: [] };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(FATE_VERDICT_MARK)) {
      out.verdict = line.slice(FATE_VERDICT_MARK.length).trim();
      continue;
    }
    const head = line.replace(/^#{1,3}\s*/, '').replace(/[:：]\s*$/, '');
    if (/^总结$/.test(head)) { cur = 'summary'; continue; }
    if (/^展望$/.test(head)) { cur = 'outlook'; continue; }
    if (/^建议$/.test(head)) { cur = 'advice'; continue; }
    if (cur) buf[cur].push(line);
    else if (!out.verdict && !cur) {
      // 模型没写【结语】前缀就直接给了一句：把第一行当结语
      out.verdict = line.replace(/^#+\s*/, '').slice(0, 24);
    }
  }
  out.summary = buf.summary.join('\n');
  out.outlook = buf.outlook.join('\n');
  out.advice = buf.advice.join('\n');
  out.verdict = out.verdict.replace(/[。！？!?.]$/, '').slice(0, 24);
  return out;
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
    reversed >= 4 ? '这一程走得并不轻省，多数时候你是在与惯性角力。' : '大势尚顺，波折只是间奏。',
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
