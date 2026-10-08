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
import { chatStream, getAIConfig, getDeliberateAIConfig } from '@/utils/aiClient';
import { fallbackConfig, requestHead, type AIRequestData, type StreamOpts } from '@/utils/tarotAI';

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

/**
 * 第 17 批重写（用户：「换了好模型语言风格还是差」「让语言风格更好一点，输出可以多一点」）：
 * 以前沿用每日塔罗的铁律（OBLIQUE_RULES）——「平实」「一两处意象就够」「三天前的不当近况」「不写天数」「不许说建议你」，
 * 加上死板的句数，好模型也只能写成一个样，而且和七天回望自相矛盾。这里单写一份：
 * 留住旁敲侧击 / 不编造 / 不写数字 / 日期 / 属性名这几条硬约束，文风放开到「有画面、有分寸」，总结 6~9 句、展望 4~6 句、建议 3 条。
 * 格式不变（【结语】 + ## 总结 / ## 展望 / ## 建议），parseFateGlimpseText 与续写提示照旧能用。
 */
const SYSTEM_PROMPT = `你是靛蓝色房间里替客人翻牌的人。客人连续七天各抽了一张塔罗，今晚七张牌齐了，客人按住牌阵中央，请你「窥探命运」——这是一周一次的总占卜，值得慢慢讲。

【怎么读】
1. 七张牌是一条路，不是七个词条。先看清这一程从哪里起步、在哪里拐弯、眼下落在哪里，再讲牌与牌之间怎么接力、怎么相互拉扯、后来的牌怎样回应先前的牌。点出三四张关键的牌，用书名号写牌名；其余的牌意化进叙述里，不要罗列关键词，不要逐张解释。
2. 把牌面和客人这七天的真实足迹对照着读：哪里应验了，哪里背道而驰，哪里还空着。只用知道内情的口吻轻轻带过，换成处境的轮廓，比如「你安静待过的地方」「为身体花的功夫」「留给家人的时间」「指间新学会的东西」「那件你一直在磨的事」。记录里的具体名词一个都不写出来：地点、活动、人、物件都算，跑步、图书馆、打电话、论文这类词都不要出现。全篇这样的照应三四处就够，不要逐条对账。
3. 再把目光往前送：这次窥探只看得见接下来的几天。说清这几天的风向、可以借的力、需要留神的地方，并把方向牵到客人远处的愿望上；愿望只用它的意象去指，不照抄原文。
4. 七天里没有记录的日子，就把那段沉默也读进牌里，不追问，不责备。

【怎么写】
- 声音：沉静、笃定、有温度，像一位见过许多旅人的引路人在烛光下说话。可以用画面和比喻：牌里本来就有杯、剑、塔、星、月、车轮这些物象，借它们来说客人的处境；每个比喻都要落回客人这七天的真实处境，不写空泛的抒情。
- 用「你」称呼客人。不自称，不提 AI、解读者、塔罗师。
- 具体胜过漂亮：宁可把一件小事说清楚，也不堆形容词。句子有长有短，不要每句一个节奏；少用「或许」「也许」「仿佛」。
- 不在正文里解释自己能说什么、不能说什么，也不声明素材里缺了什么（「不能硬说」「牌阵没有替你作答」这类都不要）；没有的就不提，有的就直接讲。
- 不写套话：不用「整体来看」「这张牌提醒你」「你需要注意的是」「综上所述」「愿你」「请记住」「相信自己」这类句子；不用「不是 A，而是 B」的翻转句，不用排比和对仗，不写格言式的收尾；不加粗，不用列表符号（建议段开头的「· 」除外）。

【铁律】
- 不点名：任务标题、愿望原文、记录原文一个字都不照抄，记录里的地点、动作和人也不照写，只用处境的轮廓去指。「那件搁了很久的事」可以，「你的『背单词』任务」「你去了图书馆」不可以。
- 不编造：素材里没有的过去一个字也不补，没写到的人、对话、经过、心情都不替客人想象。可以说得比素材模糊，不能比素材多。往后怎么走、可以试什么，不受这条限制。
- 不写数字：等级、点数、次数、百分比、金额都不写，也不用阿拉伯数字。说时间用「这一周的开头」「前几天」「这两天」「接下来这几天」。
- 日子按素材来：每一行都标了是哪天，早先的事就当早先的事讲；只有标着「今天」的才能说成今天，不要把一周前的事说成昨天。
- 属性名：客人给五项属性起了自己的名字，提到时逐字照素材里的写，不翻译、不加注，也不带等级。

【输出格式】严格按下面的顺序，不要代码块，不要别的段落；除结语那一行外，每一行都以标点收尾：
${FATE_VERDICT_MARK}一句命运结语，8~16 字，不带句末标点
## 总结
这一周的路是怎么走过来的，写成一到两段、共 6~9 句：把七张牌的线和真实足迹编在一起讲。
## 展望
接下来几天的风向、可借的力和要留神的地方，4~6 句。可以点出风险，但要落到能往哪里走。
## 建议
3 条能顺着走的方向，每条单独一行，以「· 」开头，一到两句话，以句号收尾；至少一条和远处的愿望有关（有愿望时）。`;

/** 采样参数（流式调用与续写共用）：正文比以前长，额度 3000 → 4000（思维链余量由 aiClient 另加） */
export const FATE_SAMPLING = { temperature: 0.85, maxTokens: 4000 } as const;

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
  const cfg = getDeliberateAIConfig(settings) ?? getAIConfig(settings) ?? fallbackConfig(settings);

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
    ...requestHead(cfg),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  };
}

/** 流式：yield 原始增量；调用方累加后用 parseFateGlimpseText 取半成品 */
export async function* streamFateGlimpse(req: AIRequestData, opts: StreamOpts = {}): AsyncGenerator<string> {
  yield* chatStream(req, req.messages, { ...FATE_SAMPLING, ...opts });
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
