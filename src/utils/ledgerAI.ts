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
3. 若 expense，type 选一个生活场景类目：
   - "food" 餐饮（吃饭/外卖/奶茶/咖啡/零食/水果/超市买菜）
   - "transport" 交通（地铁/公交/打车/加油/高铁/机票/共享单车）
   - "shopping" 购物（衣服/鞋/化妆护肤/数码/日用百货）
   - "fun" 娱乐（电影/游戏/演唱会/酒吧KTV/订阅会员/手办）
   - "home" 居住（房租/水电燃气/物业/家具）
   - "study" 学习（书/课程/网课/培训/考证/健身）
   - "other" 其它（拿不准就用它）
4. 若 income，incomeType 选 "labor"（工资/薪水/兼职/劳务）或 "other"（投资收益/红包/报销/退款）。
5. note：≤12 字中文摘要（如"星巴克咖啡""技术书籍"）。

**只输出严格合法 JSON，不要代码块、不要多余文字**：
{ "direction":"expense", "amount":0, "type":"food", "incomeType":null, "note":"" }`;

const EXPENSE_TYPES: LedgerExpenseType[] = ['food', 'transport', 'shopping', 'fun', 'home', 'study', 'other'];

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
    : 'other';
  return { direction, amount, type, category, note };
}

// ── 离线兜底 ──────────────────────────────────────────────

const INCOME_RE = /工资|薪水|薪资|兼职|劳务|报销|红包|退款|退钱|到账|收入|赚了|入账|发了工资/;
const LABOR_RE = /工资|薪水|薪资|兼职|劳务/;
const TYPE_KEYWORDS: Array<[LedgerExpenseType, RegExp]> = [
  ['food', /奶茶|咖啡|饭|餐|吃|外卖|食堂|零食|水果|超市|买菜|甜点|饮料|夜宵/],
  ['transport', /地铁|公交|打车|滴滴|出租|加油|油费|高铁|火车|机票|飞机|共享单车|停车/],
  ['study', /书|教材|课程|网课|培训|考证|健身|私教|学习|讲座|报班/],
  ['home', /房租|水费|电费|燃气|物业|家具|家居|宽带/],
  ['fun', /电影|游戏|演唱会|酒吧|唱歌|手办|订阅|会员|追星|展览|门票/],
  ['shopping', /衣服|鞋|裤|化妆|护肤|数码|手机|电脑|日用|淘宝|京东/],
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
  let type: LedgerExpenseType = 'other';
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
