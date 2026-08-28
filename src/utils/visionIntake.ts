/**
 * visionIntake —— 视觉档的三个「看图落地」入口共用的解析层（v2.7，DeepSeek 视觉模型上线跟进）。
 *
 *   ① describeImagesForChat：黑猫聊天发图。图先在这里过一遍视觉模型，产出**紧凑的
 *      文字侧写**（内容描述 + 图内文字转录），再作为数据块并入当轮 batch——分诊/表演
 *      两相看到的都是这段文字，与卡片机制同款的半解耦：视觉能力挂了不拖垮聊天本体。
 *   ② extractScheduleFromImage：课表/日程照片 → 结构化任务清单（Todos 页批量导入）。
 *   ③ extractActivitiesFromImage：运动/学习 App 战绩截图 → 记录草稿（Activities 页导入）。
 *
 * 范式照搬 ledgerAI（低温、严格 JSON、容错抽取）；图片一律走用户自己配的视觉档，
 * data URL 内联直发服务商，不经任何图床。
 */
import type { Settings, AttributeId } from '@/types';
import { chatComplete, getVisionAIConfig } from '@/utils/aiClient';

/** 视觉档未配置时抛这个特征错误，调用方据 message 提示去设置 */
export const VISION_UNCONFIGURED = '还没配「视觉」模型——去 设置 → AI 服务 → 视觉 档选一个能看图的模型';

const visionCfgOrThrow = (settings: Settings) => {
  const cfg = getVisionAIConfig(settings);
  if (!cfg) throw new Error(VISION_UNCONFIGURED);
  return cfg;
};

/** 从模型输出里抽出 JSON 数组（容错代码块/前后缀文字；与 ledgerAI 同款） */
function extractJsonArray(raw: string): Record<string, unknown>[] {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const fb = stripped.indexOf('[');
  const lb = stripped.lastIndexOf(']');
  if (fb < 0 || lb <= fb) return [];
  try {
    const parsed = JSON.parse(stripped.slice(fb, lb + 1));
    return Array.isArray(parsed) ? parsed.filter(x => x && typeof x === 'object') : [];
  } catch {
    return [];
  }
}

// ── ① 聊天图片侧写 ───────────────────────────────────────────────────────────

const DESCRIBE_PROMPT = `用户在和 AI 助手聊天时发来了图片。你负责把图片翻译成文字侧写，给后续的纯文本助手用。要求：
1. 先用 1~2 句概括这张图是什么（照片/截图/票据/课表/聊天记录…）与画面要点；
2. 图里有文字就**尽量完整转录**（票据金额、时间表、聊天内容等关键信息一个都别丢）；
3. 不要评价、不要建议、不要向用户提问——你只是眼睛，嘴巴是后面那位；
4. 全文 300 字以内，直接输出侧写文本，不要任何前后缀。`;

/**
 * 把用户发的图片翻译成文字侧写（多图逐张标号拼接）。
 * 任何一张失败都会抛错（调用方决定怎么向用户交代）；未配视觉档抛 VISION_UNCONFIGURED。
 */
export async function describeImagesForChat(
  dataUrls: string[],
  settings: Settings,
  signal?: AbortSignal,
): Promise<string> {
  const cfg = visionCfgOrThrow(settings);
  const parts: string[] = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const raw = await chatComplete(cfg, [
      { role: 'system', content: DESCRIBE_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: '请按要求输出这张图的文字侧写。' },
          { type: 'image_url', image_url: { url: dataUrls[i] } },
        ],
      },
    ], { temperature: 0.2, maxTokens: 600, signal });
    const text = raw.trim();
    if (text) parts.push(dataUrls.length > 1 ? `图${i + 1}：${text}` : text);
  }
  return parts.join('\n');
}

// ── ② 课表 / 日程照片 → 任务 ─────────────────────────────────────────────────

export interface ScheduleIntakeItem {
  /** 事项名（含时间前缀更好认，如「19:00 背单词」由调用方拼） */
  title: string;
  /** 0=周日 … 6=周六；null = 图里没有星期信息（导入为每日/单次由用户定） */
  weekdays: number[];
  /** HH:mm；没有则空串 */
  time: string;
}

const SCHEDULE_PROMPT = `用户拍了一张课表/日程表/计划表的照片，你要把其中**可以变成重复任务**的条目解析出来。
规则：
- 每个条目输出 {"title": 事项名, "weekdays": 星期数组, "time": "HH:mm" 或 ""}；
- 星期用数字：0=周日 1=周一 2=周二 3=周三 4=周四 5=周五 6=周六；同一事项出现在多天就合并进一个条目的 weekdays；
- 图里没有星期信息（比如纯时间清单）就给空数组 []；
- title 保持原文精炼（≤14 字），不要自己发挥；表头、教室号、老师名等辅助信息不要混进 title；
- 读不出任何条目输出 []。

**只输出严格合法 JSON 数组**，不要代码块、不要多余文字：
[{"title":"高等数学","weekdays":[1,3],"time":"08:00"}]`;

export async function extractScheduleFromImage(
  dataUrl: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<ScheduleIntakeItem[]> {
  const cfg = visionCfgOrThrow(settings);
  const raw = await chatComplete(cfg, [
    { role: 'system', content: SCHEDULE_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: '这是我的课表/日程，请按要求输出 JSON 数组。' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ], { temperature: 0.1, maxTokens: 1400, signal });
  return extractJsonArray(raw)
    .map((o): ScheduleIntakeItem => ({
      title: String(o.title ?? '').trim().slice(0, 20),
      weekdays: Array.isArray(o.weekdays)
        ? [...new Set(o.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
        : [],
      time: typeof o.time === 'string' && /^\d{1,2}:\d{2}$/.test(o.time.trim()) ? o.time.trim() : '',
    }))
    .filter(it => it.title);
}

// ── ③ 战绩截图 → 记录草稿 ────────────────────────────────────────────────────

export interface ActivityIntakeItem {
  /** 一句话记录文本（如「Keep 跑步 5.2 公里 31 分钟」） */
  text: string;
  /** 建议归入的属性（读不准就 null，让用户选） */
  attribute: AttributeId | null;
}

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const activityPrompt = (attrNames: Record<AttributeId, string>) =>
  `用户发来一张 App 截图（运动战绩/学习打卡/阅读时长/步数等），你要把其中「用户今天做了的事」提炼成 1~3 条可入档的成长记录。
规则：
- 每条 {"text": 一句话记录, "attribute": 属性 id 或 null}；
- text 用第一人称省略式、带上关键数字（如「跑步 5.2 公里用时 31 分钟」「背单词 120 个」），≤30 字；
- attribute 从这些里选最贴的一个：${ATTR_IDS.map(id => `"${id}"=${attrNames[id]}`).join('、')}；拿不准就 null；
- 广告、界面装饰、别人的动态不要提炼；读不出可入档的事就输出 []。

**只输出严格合法 JSON 数组**，不要代码块、不要多余文字：
[{"text":"跑步 5.2 公里用时 31 分钟","attribute":"guts"}]`;

export async function extractActivitiesFromImage(
  dataUrl: string,
  settings: Settings,
  attrNames: Record<AttributeId, string>,
  signal?: AbortSignal,
): Promise<ActivityIntakeItem[]> {
  const cfg = visionCfgOrThrow(settings);
  const raw = await chatComplete(cfg, [
    { role: 'system', content: activityPrompt(attrNames) },
    {
      role: 'user',
      content: [
        { type: 'text', text: '这是我的战绩截图，请按要求输出 JSON 数组。' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ], { temperature: 0.1, maxTokens: 600, signal });
  return extractJsonArray(raw)
    .map((o): ActivityIntakeItem => ({
      text: String(o.text ?? '').trim().slice(0, 40),
      attribute: ATTR_IDS.includes(o.attribute as AttributeId) ? (o.attribute as AttributeId) : null,
    }))
    .filter(it => it.text);
}
