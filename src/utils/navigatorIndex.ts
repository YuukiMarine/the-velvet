/**
 * navigatorIndex — 记录的本地索引（第 25 批 · PRD §24.10.2）：用户说「跑步」，助手不只想起「用户每天晨跑」这条记忆，
 * 还查得到「上次跑步 10 月 2 日，五公里，本月第 4 次」。
 *
 * 文档 = 活动（近 180 天、用户自己记的）、任务（在清单里的 + 90 天内归档的）、账本（近 90 天）、愿望、倒计时。
 * 分词：有 Intl.Segmenter（iOS 14.5+ / Android WebView 87+）用词粒度，没有退回二元组；打分 BM25。
 * 纯本地零调用；索引按数据签名缓存在内存，数据变了重建。第 26 批的记忆召回复用这里的分词与打分。
 */
import { useAppStore, toLocalDateKey } from '@/store';
import { dayLabelCN, daysBetween, shiftKey } from '@/utils/navigatorClock';
import { activityDay, completionDays, gainsText, isUserActivity, wishProgress } from '@/utils/navigatorRecords';

export type RecordHitKind = 'activity' | 'todo' | 'ledger' | 'wish' | 'countdown';
export interface RecordDoc {
  id: string;
  kind: RecordHitKind;
  text: string;
  /** 注入时的一行（带日期 / 数字） */
  line: string;
  dateKey: string;
  tokens: string[];
}
export interface RecordHit { doc: RecordDoc; score: number }

// ── 分词 ──
type Segmenter = { segment: (s: string) => Iterable<{ segment: string; isWordLike?: boolean }> };
let segmenter: Segmenter | null | undefined;
function getSegmenter(): Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  try {
    const I = (globalThis as unknown as { Intl?: { Segmenter?: new (loc: string, o: { granularity: string }) => Segmenter } }).Intl;
    segmenter = I?.Segmenter ? new I.Segmenter('zh', { granularity: 'word' }) : null;
  } catch { segmenter = null; }
  return segmenter;
}
const STOP = new Set(['的', '了', '是', '我', '在', '有', '和', '就', '都', '也', '很', '还', '把', '被', '吗', '呢', '吧', '啊', '呀', '哈', '嗯', '这', '那', '个', '一', '不', '没', '去', '来', '要', '想', '说', '今天', '昨天', '明天', '现在', '刚才', '一下', '帮我', '记一下', '一个', '怎么', '怎么样', '什么', '还有', '来着', '多久', '最近', '那个', '那双', '这个']);
/** 单字也当停用（字级兜底时用）：太常见、不带信息 */
const STOP_CHAR = new Set('的了是我在有和就都也很还把被吗呢吧啊呀哈嗯这那个一不没去来要想说你他她它们着过得地么什怎样今天昨明现记录做事情件下上中里面前后好多少点些'.split(''));
const CJK = /[一-鿿]/;
/** 中文二元组（分词器切不出的生词靠它：「考研」在词典里没有也能对上） */
function bigrams(clean: string, out: string[]): void {
  for (const chunk of clean.split(' ')) {
    if (!chunk) continue;
    if (!CJK.test(chunk)) { if (chunk.length > 1 && !STOP.has(chunk)) out.push(chunk); continue; }
    const cjk = chunk.replace(/[^一-鿿]/g, '');
    for (let i = 0; i < cjk.length - 1; i++) { const g = cjk.slice(i, i + 2); if (!STOP.has(g)) out.push(g); }
  }
}
export function tokenize(text: string): string[] {
  const clean = text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
  if (!clean) return [];
  const out: string[] = [];
  const seg = getSegmenter();
  if (seg) {
    for (const part of seg.segment(clean)) {
      const w = part.segment.trim();
      if (!w || w === ' ') continue;
      if (part.isWordLike === false) continue;
      if (STOP.has(w)) continue;
      if (w.length === 1 && CJK.test(w)) continue;
      out.push(w);
    }
  }
  // 词 + 二元组一起索引：词典里有的按词对，没有的按二元组对；两边都有的词（「跑步」既是词也是二元组）分会高一点，无妨
  bigrams(clean, out);
  return [...new Set(out)];
}
/** 字级兜底的查询字：去掉停用字；「鞋」这种单字词也能查到「买鞋」 */
export function queryChars(text: string): string[] {
  const chars = new Set<string>();
  for (const ch of text) if (CJK.test(ch) && !STOP_CHAR.has(ch)) chars.add(ch);
  return [...chars];
}

// ── 建索引 ──
let cache: { sig: string; docs: RecordDoc[]; df: Map<string, number>; cdf: Map<string, number>; avgLen: number } | null = null;

function signature(): string {
  const s = useAppStore.getState();
  return [s.activities.length, s.todos.length, s.todoCompletions.length, s.ledgerEntries.length, s.wishes.length, s.callingCards.length, toLocalDateKey()].join('|');
}

function buildDocs(todayKey: string): RecordDoc[] {
  const s = useAppStore.getState();
  const docs: RecordDoc[] = [];
  const since180 = shiftKey(todayKey, -180);
  const since90 = shiftKey(todayKey, -90);
  for (const a of s.activities) {
    if (!isUserActivity(a)) continue;
    const k = activityDay(a);
    if (k < since180) continue;
    const gains = gainsText(a);
    docs.push({ id: `a:${a.id}`, kind: 'activity', text: a.description, dateKey: k, tokens: tokenize(a.description),
      line: `${dayLabelCN(k, todayKey)}记录：${a.description.slice(0, 40)}${gains ? `（${gains}）` : ''}${a.important ? ' ⭐' : ''}` });
  }
  for (const t of s.todos) {
    if (t.pact || t.orgOp) continue;
    const archivedKey = t.archivedAt ? toLocalDateKey(new Date(t.archivedAt)) : undefined;
    if (!t.isActive && archivedKey && archivedKey < since90) continue;
    let line: string;
    if (t.isActive && !t.archivedAt) {
      if (t.repeatDaily) { const c = completionDays(t.id, 30, todayKey); line = `任务「${t.title}」（每日）：近 30 天做到 ${c.done} 天${c.last ? `，上次 ${dayLabelCN(c.last, todayKey)}` : ''}`; }
      else if (t.isBigDeal) { const done = (t.steps ?? []).filter((st) => st.done).length; line = `大事「${t.title}」：${t.steps?.length ?? 0} 步做完 ${done} 步${t.deadline ? `，截止 ${dayLabelCN(t.deadline, todayKey)}` : ''}`; }
      else line = `任务「${t.title}」在清单里${t.deadline ? `，截止 ${dayLabelCN(t.deadline, todayKey)}` : ''}`;
    } else {
      line = t.completedAt ? `任务「${t.title}」${dayLabelCN(toLocalDateKey(new Date(t.completedAt)), todayKey)}完成` : `任务「${t.title}」${archivedKey ? `${dayLabelCN(archivedKey, todayKey)}收进归档` : '已归档'}`;
    }
    docs.push({ id: `t:${t.id}`, kind: 'todo', text: t.title, dateKey: archivedKey ?? toLocalDateKey(new Date(t.createdAt)), tokens: tokenize(t.title), line });
  }
  for (const e of s.ledgerEntries) {
    if (e.date < since90 || e.direction === 'adjust') continue;
    const label = [e.note ?? '', e.category ?? '', e.type ?? ''].filter(Boolean).join(' ');
    if (!label.trim()) continue;
    docs.push({ id: `l:${e.id}`, kind: 'ledger', text: label, dateKey: e.date, tokens: tokenize(label),
      line: `${dayLabelCN(e.date, todayKey)}记账：${e.direction === 'income' ? '收入' : '支出'} ¥${e.amount}${e.note ? `（${e.note.slice(0, 20)}）` : ''}` });
  }
  for (const w of s.wishes) {
    if (w.status !== 'active' || w.parentId) continue;
    const p = wishProgress(w);
    const text = `${w.title} ${w.note ?? ''}`;
    docs.push({ id: `w:${w.id}`, kind: 'wish', text, dateKey: toLocalDateKey(new Date(w.createdAt)), tokens: tokenize(text), line: `愿望「${w.title}」${p !== undefined ? `：进度 ${p}%` : '（还没评估过进度）'}` });
  }
  for (const c of s.callingCards) {
    if (c.archived) continue;
    const text = `${c.title} ${c.subtitle ?? ''}`;
    const left = c.targetDate ? daysBetween(todayKey, c.targetDate) : undefined;
    docs.push({ id: `c:${c.id}`, kind: 'countdown', text, dateKey: c.startDate, tokens: tokenize(text), line: `倒计时「${c.title}」${left !== undefined ? (left >= 0 ? `：还有 ${left} 天（${dayLabelCN(c.targetDate!, todayKey)}）` : '：日子已过') : ''}` });
  }
  return docs;
}

function ensureIndex() {
  const sig = signature();
  if (cache && cache.sig === sig) return cache;
  const docs = buildDocs(toLocalDateKey());
  const df = new Map<string, number>();
  const cdf = new Map<string, number>();
  let total = 0;
  for (const d of docs) {
    total += d.tokens.length;
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
    for (const c of new Set(queryChars(d.text))) cdf.set(c, (cdf.get(c) ?? 0) + 1);
  }
  cache = { sig, docs, df, cdf, avgLen: docs.length ? total / docs.length : 1 };
  return cache;
}

/** 强制重建（测试 / 数据导入后） */
export const invalidateRecordIndex = (): void => { cache = null; };

const K1 = 1.2;
const B = 0.75;
/** 字级兜底的权重：「晨跑」和「跑步」只共一个「跑」字，靠它搭上；权重压低免得常见字乱搭 */
const CHAR_WEIGHT = 0.5;
/** BM25（词 + 二元组）+ 字级兜底：返回分数 ≥ minScore 的前 k 条 */
export function searchRecords(query: string, k = 4, minScore = 1.0): RecordHit[] {
  const q = [...new Set(tokenize(query))];
  const qc = queryChars(query);
  if (!q.length && !qc.length) return [];
  const idx = ensureIndex();
  const N = idx.docs.length || 1;
  const hits: RecordHit[] = [];
  for (const doc of idx.docs) {
    if (!doc.tokens.length) continue;
    const tf = new Map<string, number>();
    for (const t of doc.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = idx.df.get(t) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (doc.tokens.length / idx.avgLen)));
    }
    // 字级兜底（只在词 / 二元组没对上时才有意义，但一起加也只是锦上添花）
    if (qc.length) {
      const dc = new Set(queryChars(doc.text));
      for (const c of qc) {
        if (!dc.has(c)) continue;
        const n = idx.cdf.get(c) ?? 0;
        score += CHAR_WEIGHT * Math.log(1 + (N - n + 0.5) / (n + 0.5));
      }
    }
    if (score >= minScore) hits.push({ doc, score });
  }
  hits.sort((a, b) => b.score - a.score || b.doc.dateKey.localeCompare(a.doc.dateKey));
  // 同一件事（同名任务 + 它派生的活动）只留分最高的那条
  const seen = new Set<string>();
  const out: RecordHit[] = [];
  for (const h of hits) {
    const key = h.doc.text.slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= k) break;
  }
  return out;
}

/** 注入块（和这句话有关的记录） */
export function recordsBlock(hits: RecordHit[]): string {
  if (!hits.length) return '';
  return `【和这句话有关的记录（App 里查得到的事实；像记得那样顺口带出，别念报表、别评判）】\n${hits.map((h) => `- ${h.doc.line}`).join('\n')}`;
}
