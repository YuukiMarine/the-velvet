/**
 * ledgerAI.ts — F5 心相记账「自然语言录入」解析。
 *
 * 照搬 activityAI 范式：低温、严格 JSON、解析兜底。把一句话（"28 咖啡""工资 8000"）
 * 解析成一笔账目。**离线兜底** parseLedgerOffline：正则抽金额 + 关键词归类，无 Key/离线可用。
 *
 * 页面统一调 parseLedgerInput（有 Key 走 AI、失败或无 Key 退离线；离线再失败返 null → 转手动）。
 */
import { Settings, LedgerExpenseType, LedgerIncomeType } from '@/types';
import { chatComplete, getAIConfig } from '@/utils/aiClient';

export interface LedgerAIResult {
  direction: 'expense' | 'income';
  /** 金额（元，正数；解析不出给 0） */
  amount: number;
  /** 支出四轴（direction='expense' 时） */
  type?: LedgerExpenseType;
  /** 收入类（direction='income' 时） */
  incomeType?: LedgerIncomeType;
  /** 二级类目，可空 */
  category?: string;
  /** ≤12 字摘要 */
  note: string;
}

const SYSTEM_PROMPT = `你是一个记账助手。用户给你一句话（如"28 咖啡""买了本书 59""工资 8000"），
你要解析成一笔账目并以严格 JSON 输出。

判定规则：
1. direction：花钱="expense"；收入（工资/兼职/报销/红包/退款/到账/收入等）="income"。
2. amount：金额数字（人民币元，正数，不带符号）；识别不出给 0。
3. 若 expense，type 选四类轴之一：
   - "necessary" 必要（房租/水电/吃饭/通勤/话费/日用/医药）
   - "investment" 自我投资（书/课程/网课/健身/培训/考证 等成长向）
   - "desire" 欲望（奶茶/咖啡/电影/游戏/衣服/零食/外卖 等想要但非必需）
   - "impulse" 冲动（一时上头、计划外）
   拿不准选最接近的，宁可 "desire" 不要乱填 "necessary"。
4. 若 income，incomeType 选 "labor"（工资/薪水/兼职/劳务）或 "other"（投资收益/红包/报销/退款）。
5. category：二级类目（如"餐饮""交通""数码""服饰"），可空字符串。
6. note：≤12 字中文摘要（如"星巴克咖啡""技术书籍"）。

**只输出严格合法 JSON，不要代码块、不要多余文字**：
{ "direction":"expense", "amount":0, "type":"desire", "incomeType":null, "category":"", "note":"" }`;

const EXPENSE_TYPES: LedgerExpenseType[] = ['necessary', 'investment', 'desire', 'impulse'];

/** 调 AI 解析；无 Key 抛错。失败时由 parseLedgerInput 兜底到离线。 */
export async function analyzeLedgerAI(
  text: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<LedgerAIResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('描述为空');

  const cfg = getAIConfig(settings);
  if (!cfg) throw new Error('请先在「设置 → AI 总结」中配置 API 密钥');

  const raw = await chatComplete(cfg, [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `用户输入：${trimmed}\n\n请按要求输出 JSON。` },
  ], { temperature: 0.2, maxTokens: 200, signal });

  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const fb = stripped.indexOf('{');
  const lb = stripped.lastIndexOf('}');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fb >= 0 && lb > fb ? stripped.slice(fb, lb + 1) : stripped);
  } catch {
    const off = parseLedgerOffline(trimmed);
    if (off) return off;
    throw new Error('AI 返回不是合法 JSON');
  }

  const direction = parsed.direction === 'income' ? 'income' : 'expense';
  const amount = Math.max(0, Number(parsed.amount) || 0);
  const note = (typeof parsed.note === 'string' && parsed.note.trim()) || shortNote(trimmed);
  const category = typeof parsed.category === 'string' ? parsed.category.trim() : '';

  if (direction === 'income') {
    const incomeType: LedgerIncomeType = parsed.incomeType === 'labor' ? 'labor' : 'other';
    return { direction, amount, incomeType, category, note };
  }
  const type: LedgerExpenseType = EXPENSE_TYPES.includes(parsed.type as LedgerExpenseType)
    ? (parsed.type as LedgerExpenseType)
    : 'desire';
  return { direction, amount, type, category, note };
}

// ── 离线兜底 ──────────────────────────────────────────────

const INCOME_RE = /工资|薪水|薪资|兼职|劳务|报销|红包|退款|退钱|到账|收入|赚了|入账|发了工资/;
const LABOR_RE = /工资|薪水|薪资|兼职|劳务/;
const TYPE_KEYWORDS: Array<[LedgerExpenseType, RegExp]> = [
  ['necessary', /房租|水费|电费|燃气|物业|吃饭|早饭|午饭|晚饭|餐|食堂|通勤|地铁|公交|打车|加油|话费|流量|超市|买菜|日用|药|医院|挂号/],
  ['investment', /书|教材|课程|网课|培训|考证|健身|私教|器材|学习|讲座|报班/],
  ['desire', /奶茶|咖啡|电影|游戏|衣服|鞋|化妆|护肤|零食|外卖|甜点|演唱会|手办|追星|饮料/],
  ['impulse', /冲动|上头|剁手|忍不住|秒杀/],
];

/** 离线解析：正则抽金额 + 关键词归类。抽不出金额返 null（页面转手动）。 */
export function parseLedgerOffline(text: string): LedgerAIResult | null {
  const amount = extractAmount(text);
  if (amount == null) return null;

  if (INCOME_RE.test(text)) {
    return {
      direction: 'income',
      amount,
      incomeType: LABOR_RE.test(text) ? 'labor' : 'other',
      category: '',
      note: shortNote(text),
    };
  }
  let type: LedgerExpenseType = 'desire';
  for (const [t, re] of TYPE_KEYWORDS) {
    if (re.test(text)) { type = t; break; }
  }
  return { direction: 'expense', amount, type, category: '', note: shortNote(text) };
}

/** 有 Key 走 AI、失败或无 Key 退离线；离线再抽不出金额返 null（转手动）。 */
export async function parseLedgerInput(
  text: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<LedgerAIResult | null> {
  if (getAIConfig(settings)) {
    try {
      return await analyzeLedgerAI(text, settings, signal);
    } catch {
      /* 退离线 */
    }
  }
  return parseLedgerOffline(text);
}

/** 取文本里最像金额的数字（多个时取最大，覆盖"2本书59"取 59 这类）。 */
function extractAmount(text: string): number | null {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  if (!matches) return null;
  const nums = matches.map(Number).filter(n => Number.isFinite(n) && n > 0);
  return nums.length ? Math.max(...nums) : null;
}

/** 去掉数字与货币词，取前 12 字作摘要。 */
function shortNote(text: string): string {
  const cleaned = text
    .replace(/\d+(?:\.\d+)?/g, '')
    .replace(/[元块钱¥$,，。.、\s]/g, '')
    .trim();
  return cleaned.slice(0, 12) || '记一笔';
}
