/**
 * aiJson — 从模型输出里抽 JSON 的公共工具（v2.7.0.6 第 4 轮）。
 *
 * 此前 battleAI / ledgerAI / visionIntake / presetNameMatcher / attributeLevelTitles /
 * ledgerSettlement 各写各的：有的只剥代码块，有的只找首尾括号，前后多一点文字、
 * 字符串里有个没转义的引号就失败。这里把 battleAI 里最完整的那套（剥代码块、去注释、
 * 去尾逗号、补截断、转义内引号、补漏逗号）抽出来给所有调用点共用。
 */

/**
 * 把被截断的 JSON 补完：丢掉最后那个残缺的 token，再按栈把没闭的括号补上。
 *
 * 模型被 max_tokens 砍在半句时，返回里根本没有收尾的 `}`，直接 JSON.parse 必失败；
 * 但前面那 90% 通常是完整可用的（区层显形只要 8 条台词里的前几条也能凑）。
 */
export function repairTruncatedJSON(src: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  let lastSafe = -1;   // 最后一个"结构完整"的位置（逗号 / 闭合括号之后）
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') { inStr = false; lastSafe = i; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); continue; }
    if (ch === '}' || ch === ']') { stack.pop(); lastSafe = i; continue; }
    if (ch === ',') lastSafe = i - 1;
  }
  if (stack.length === 0) return src;
  let out = src.slice(0, lastSafe + 1).replace(/,\s*$/, '');
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
  return out;
}

/**
 * 字符串值里没转义的英文双引号（如 "description":"他说"我思故我在"。"）→ 转义掉。
 * 判断依据：在字符串里遇到 " 时往后看第一个非空白字符——是 , } ] : 或到头了，
 * 这个引号才是真的收尾；否则是正文里的引号。
 */
export function escapeInnerQuotes(src: string): string {
  let out = '';
  let inStr = false, esc = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (!inStr) {
      if (ch === '"') inStr = true;
      out += ch;
      continue;
    }
    if (esc) { esc = false; out += ch; continue; }
    if (ch === '\\') { esc = true; out += ch; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      const nx = src[j];
      if (nx === undefined || nx === ',' || nx === '}' || nx === ']' || nx === ':') { inStr = false; out += ch; }
      else out += '\\"';
      continue;
    }
    out += ch;
  }
  return out;
}

/** 相邻元素之间漏了逗号：`} {`、`] [`、`"a" "b"`、`} "key"` 这几种 */
export function fixMissingCommas(src: string): string {
  return src
    .replace(/\}\s*\{/g, '},{')
    .replace(/\]\s*\[/g, '],[')
    .replace(/"\s+"(?=[^"]*"\s*:)/g, '","')
    .replace(/([}\]])\s*"/g, '$1,"');
}

/** 粗看 JSON 结构是否闭合（忽略字符串内容）：判断「写完了」还是「被截断了」 */
export function jsonLooksClosed(text: string): boolean {
  const start = text.indexOf('{');
  if (start < 0) return false;
  let depth = 0, inStr = false, esc = false, opened = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') { depth++; opened = true; }
    else if (ch === '}' || ch === ']') { depth--; if (opened && depth === 0) return true; }
  }
  return false;
}

function parseAttempts(jsonStr: string): string[] {
  // 去掉单行注释、尾逗号
  const base = jsonStr.replace(/\/\/[^\n]*/g, '').replace(/,\s*([}\]])/g, '$1');
  const flat = base.replace(/[\r\n]+/g, ' ');
  return [
    base,
    flat,                                       // 字符串里裸换行
    repairTruncatedJSON(base),                  // 被砍在半句
    repairTruncatedJSON(flat),
    // 长中文 JSON 的两类常见瑕疵——字符串里没转义的英文双引号、相邻元素漏了逗号
    escapeInnerQuotes(fixMissingCommas(flat)),
    repairTruncatedJSON(escapeInnerQuotes(fixMissingCommas(flat))),
  ];
}

const stripFences = (text: string): string =>
  text.replace(/```(?:json|JSON)?\s*/g, '').replace(/```\s*/g, '');

/** 从模型输出里抽出一个 JSON 对象（容忍代码块、前后缀文字、尾逗号、注释、截断、内引号）；抽不出就抛 */
export function extractJSON(text: string): Record<string, unknown> {
  const cleaned = stripFences(text);
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('no json found');
  const end = cleaned.lastIndexOf('}');
  // 有闭合括号就取整段，没有（= 被截断）就从 { 一路取到底交给修补器
  const jsonStr = end > start ? cleaned.slice(start, end + 1) : cleaned.slice(start);
  let lastErr: unknown;
  for (const a of parseAttempts(jsonStr)) {
    try {
      const v = JSON.parse(a);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
      lastErr = new Error('json is not an object');
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('json parse failed');
}

/** extractJSON 的不抛错版本 */
export function tryExtractJSON(text: string): Record<string, unknown> | null {
  try { return extractJSON(text); } catch { return null; }
}

/** 从模型输出里抽出一个 JSON 数组（元素只保留对象）；抽不出返回空数组 */
export function extractJSONArray(text: string): Record<string, unknown>[] {
  const cleaned = stripFences(text);
  const start = cleaned.indexOf('[');
  if (start < 0) return [];
  const end = cleaned.lastIndexOf(']');
  const jsonStr = end > start ? cleaned.slice(start, end + 1) : cleaned.slice(start);
  for (const a of parseAttempts(jsonStr)) {
    try {
      const v = JSON.parse(a);
      if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
    } catch { /* 下一种修法 */ }
  }
  return [];
}
