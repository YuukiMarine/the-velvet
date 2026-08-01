/**
 * ledgerAI.ts — F5 心相记账「自然语言录入」解析。
 *
 * 照搬 activityAI 范式：低温、严格 JSON、解析兜底。把一句话（"28 咖啡""工资 8000"）
 * 解析成一笔账目。**离线兜底** parseLedgerOffline：正则抽金额 + 关键词归类，无 Key/离线可用。
 *
 * 页面统一调 parseLedgerInput（有 Key 走 AI、失败或无 Key 退离线；离线再失败返 null → 转手动）。
 */
import { Settings, LedgerExpenseType, LedgerIncomeType } from '@/types';
import { chatComplete, getAIConfig, getVisionAIConfig } from '@/utils/aiClient';
import { recognizeText } from '@/utils/ocr';

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

  return normalizeResult(parsed, trimmed);
}

/** 把一个 parsed JSON 对象规整为 LedgerAIResult（单笔 / 批量共用）。 */
function normalizeResult(parsed: Record<string, unknown>, fallbackText = ''): LedgerAIResult {
  const direction = parsed.direction === 'income' ? 'income' : 'expense';
  const amount = Math.max(0, Number(parsed.amount) || 0);
  const note = (typeof parsed.note === 'string' && parsed.note.trim()) || shortNote(fallbackText);
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

// ── 多笔录入（Batch2③） ───────────────────────────────────

const SYSTEM_PROMPT_BATCH = `你是一个记账助手。用户可能一句话报多笔（如"早餐15 地铁4 午饭30""买书59 工资到账8000"）。
把每一笔解析成数组里的一个对象，每个对象的字段与规则同单笔：
- direction："expense" 花钱 / "income" 收入（工资/兼职/报销/红包/退款/到账等）
- amount：金额数字（元，正数，识别不出给 0）
- 若 expense，type ∈ food/transport/shopping/fun/home/study/other（拿不准用 other）
- 若 income，incomeType ∈ labor（工资/兼职/劳务）/ other
- note：≤12 字中文摘要

**只输出严格合法 JSON 数组**，不要代码块、不要多余文字：
[{ "direction":"expense","amount":0,"type":"food","incomeType":null,"note":"" }]`;

/** 按标点/「和」「还有」切分多笔（无标点的纯空格分隔不切，避免误伤单笔描述）。 */
export function splitSegments(text: string): string[] {
  return text
    .split(/[、，,;；\n]+|\s+和\s+|\s+还有\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * 多笔解析：有 Key → AI 出数组（能处理空格分隔）；否则/失败 → 按标点切分逐段离线解析。
 * 返回有效（amount>0）的条目数组，可能仅 1 条或 0 条；页面据长度决定单笔卡 / 批量卡。
 */
export async function parseLedgerBatch(
  text: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<LedgerAIResult[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const cfg = getAIConfig(settings);
  if (cfg) {
    try {
      const raw = await chatComplete(cfg, [
        { role: 'system', content: SYSTEM_PROMPT_BATCH },
        { role: 'user', content: `用户输入：${trimmed}\n\n请输出 JSON 数组。` },
      ], { temperature: 0.2, maxTokens: 700, signal });
      const arr = extractJsonArray(raw);
      if (arr.length) {
        const results = arr.map(o => normalizeResult(o)).filter(r => r.amount > 0);
        if (results.length) return results;
      }
    } catch {
      /* 退离线切分 */
    }
  }
  // 离线：按标点切分逐段；只有切出 ≥1 段能抽出金额才算
  const segs = splitSegments(trimmed);
  const offline = segs
    .map(s => parseLedgerOffline(s))
    .filter((r): r is LedgerAIResult => !!r && r.amount > 0);
  return offline;
}

// ── 拍照记账（FS3.2 三级降级链）─────────────────────────────────────────────

const SYSTEM_PROMPT_SHOT = `你是一个记账助手。用户拍了一张小票/账单/支付截图，你要读图并把其中的消费解析成 JSON 数组。
规则与文字录入一致：
- direction："expense" 花钱 / "income" 收入
- amount：金额数字（元，正数）。**优先取实付/合计金额**，不要把单价和合计重复计成两笔
- 若 expense，type ∈ food/transport/shopping/fun/home/study/other
- 若 income，incomeType ∈ labor / other
- note：≤12 字中文摘要（商家名或商品名优先）
一张小票通常只对应**一笔**（合计）；只有明显是多笔独立消费（如账单列表截图）才输出多条。
读不出金额就返回空数组 []。

**只输出严格合法 JSON 数组**，不要代码块、不要多余文字：
[{ "direction":"expense","amount":0,"type":"food","incomeType":null,"note":"" }]`;

/** 拍照记账的结果：解析到的账目 + 走了哪条路（UI 据此说人话） */
export interface LedgerShotOutcome {
  results: LedgerAIResult[];
  /** vision=视觉模型读图 / ocr=本机离线取字后再解析 / none=两条路都不通 */
  via: 'vision' | 'ocr' | 'none';
  /** OCR 路径下识别到的原文（供用户核对/手改） */
  ocrText?: string;
}

/**
 * 从一张图解析账目。三级降级（PRD FS3.2）：
 *   ① 配了视觉档 → 图直接喂模型，效果最好；
 *   ② 否则本机有离线 OCR（原生 ML Kit / Vision）→ 取字后交给现有文字链路；
 *   ③ 都没有 → via='none'，页面提示手输。
 * 图片只在这两条路里流动：视觉档发给用户自己配的服务商，OCR 全程不出设备。
 */
export async function parseLedgerShot(
  dataUrl: string,
  settings: Settings,
  signal?: AbortSignal,
): Promise<LedgerShotOutcome> {
  // ① 视觉档
  const vcfg = getVisionAIConfig(settings);
  if (vcfg) {
    try {
      const raw = await chatComplete(vcfg, [
        { role: 'system', content: SYSTEM_PROMPT_SHOT },
        {
          role: 'user',
          content: [
            { type: 'text', text: '这是我的消费凭证，请按要求输出 JSON 数组。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ], { temperature: 0.1, maxTokens: 700, signal });
      const results = extractJsonArray(raw).map(o => normalizeResult(o)).filter(r => r.amount > 0);
      if (results.length) return { results, via: 'vision' };
    } catch {
      /* 视觉失败 → 继续往下降级 */
    }
  }

  // ② 本机离线 OCR → 复用文字链路（OCR 出来的是一坨小票文本，交给批量解析更合适）
  const text = await recognizeText(dataUrl);
  if (text) {
    const results = await parseLedgerBatch(text, settings, signal);
    return { results: results.filter(r => r.amount > 0), via: 'ocr', ocrText: text };
  }

  return { results: [], via: 'none' };
}

/** 从模型输出里抽出 JSON 数组（容错代码块/前后缀文字）。 */
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

/** 去掉数字与货币词，取前 12 字作摘要。 */
function shortNote(text: string): string {
  const cleaned = text
    .replace(/\d+(?:\.\d+)?/g, '')
    .replace(/[元块钱¥$,，。.、\s]/g, '')
    .trim();
  return cleaned.slice(0, 12) || '记一笔';
}
