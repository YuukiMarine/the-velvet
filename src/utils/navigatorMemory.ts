/**
 * navigatorMemory — F6 黑猫的记忆闭环（Batch3 第二阶段）。
 *
 * 双泵（F6_NAVIGATOR_MEMORY.md §2.3 定稿）：
 *   · 主泵 finalizeStaleSessions：开窗时对「昨日及更早、尚无摘要」的会话做会话末 compact
 *     （每天最多一次 AI 调用/会话；不足门槛走本地拼接，不产记忆）。
 *   · 阈值泵 maybeCompactLive：活跃会话 est>32k tokens 或 >120 条 → 压缩除最近 12 条外的
 *     部分（含旧 summary 滚动合并）为一条 role:'summary' 消息；est>90k 本地硬截断保险丝。
 * 原子记忆：compact 抽取 0~2 条中性事实入 navigatorMemos（人格口吻现场渲染，不持久化口吻）。
 * 检索（§2.4）：importance/时近/关键词重合/followUp 加成/过度引用降权 → top≤4 注入；
 * followUp 注入即清（宁可少提醒不重复）；遗忘（§2.5）惰性 archived，置顶免疫。
 * 所有 AI 产物过校验管线（每层护栏假设上一层会漏——Batch2 的教训）。
 */
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db';
import { useAppStore, toLocalDateKey } from '@/store';
import { chatComplete, getAIConfig, type AIConfig, type AIMessage } from '@/utils/aiClient';
import type { NavigatorMemo, NavigatorMessageRow } from '@/types';

// ── token 估算（触发判断用，不求精确；中文≈0.6~0.9 token/字取保守 0.75） ──
export function estTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[぀-ヿ一-鿿]/.test(ch)) cjk++;
    else other++;
  }
  return Math.round(cjk * 0.75 + other * 0.3);
}

const LIVE_COMPACT_TOKENS = 32_000;
const LIVE_COMPACT_MSGS = 120;
const LIVE_KEEP_RECENT = 12;
const HARD_CAP_TOKENS = 90_000;
/** 会话末 AI compact 的最低门槛：用户消息 ≥4 条或 ≥120 字 */
const FINALIZE_MIN_USER_MSGS = 4;
const FINALIZE_MIN_USER_CHARS = 120;

// ── compact LLM 调用 ──

interface CompactResult {
  summary: string;
  personaSummary: string;
  memories: Array<{ text: string; importance: number; colorHint?: string }>;
  followUp: string | null;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const COMPACT_PROTOCOL = `你是对话归档器。把给定的「用户与陪伴 AI 的对话片段」压缩归档。
只输出这一个 JSON 对象（不要代码块、不要其它文字）：
{"summary":"","personaSummary":"","memories":[],"followUp":null}
- summary：中性第三人称摘要，≤120 字，保留具体事实（做了什么/提到什么/情绪如何）。
- personaSummary：同样内容，改用陪伴 AI 的第一人称口吻复述，≤100 字。
- memories：0~2 条值得长期记住的**关于用户的**原子事实（各 ≤40 字，中性陈述句），
  每条 {"text":"","importance":1..5,"colorHint":"提起时的情绪，可空"}。
  只收会影响未来相处的事（在准备的考试/长期困扰/重要偏好/关系变化）；日常流水不收。
- followUp：一个值得下次自然追问的话头（≤30 字），没有就 null。`;

async function compactViaAI(
  cfg: AIConfig,
  lines: string[],
  personaName: string,
): Promise<CompactResult | null> {
  try {
    let raw: string;
    const messages: AIMessage[] = [
      { role: 'system', content: COMPACT_PROTOCOL },
      { role: 'user', content: `陪伴 AI 的名字：${personaName}\n【对话片段】\n${lines.join('\n')}` },
    ];
    try {
      raw = await chatComplete(cfg, messages, { temperature: 0.3, maxTokens: 900, jsonMode: true });
    } catch (e) {
      if (e instanceof Error && e.message.includes('空响应')) {
        raw = await chatComplete(cfg, messages, { temperature: 0.3, maxTokens: 900, jsonMode: false });
      } else throw e;
    }
    const parsed = extractJson(raw);
    if (!parsed) return null;
    const memories = (Array.isArray(parsed.memories) ? parsed.memories : [])
      .slice(0, 2)
      .map((m) => {
        const r = m as Record<string, unknown>;
        const text = String(r.text ?? '').trim().slice(0, 60);
        if (!text) return null;
        const imp = Math.round(Number(r.importance));
        return {
          text,
          importance: Number.isFinite(imp) ? Math.min(5, Math.max(1, imp)) : 3,
          colorHint: String(r.colorHint ?? '').trim().slice(0, 30) || undefined,
        };
      })
      .filter((m): m is NonNullable<typeof m> => !!m);
    const summary = String(parsed.summary ?? '').trim().slice(0, 200);
    if (!summary) return null;
    return {
      summary,
      personaSummary: String(parsed.personaSummary ?? '').trim().slice(0, 180) || summary,
      memories,
      followUp: String(parsed.followUp ?? '').trim().slice(0, 40) || null,
    };
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[navigator] compact 调用失败', e);
    return null;
  }
}

/** 消息行 → compact 输入行（卡片折叠为一行事实） */
function rowsToLines(rows: NavigatorMessageRow[]): string[] {
  return rows
    .map((r) => {
      if (r.role === 'card') {
        const status = r.cardStatus === 'done' ? '已确认' : r.cardStatus === 'cancelled' ? '已取消' : '未确认';
        return `[卡片·${status}] ${r.receipt ?? r.text ?? ''}`.trim();
      }
      if (r.role === 'summary') return `[早前摘要] ${r.text ?? ''}`;
      return `${r.role === 'user' ? '用户' : 'AI'}：${r.text ?? ''}`;
    })
    .filter((l) => l.length > 3);
}

async function persistMemories(result: CompactResult): Promise<void> {
  const now = new Date();
  const memos: NavigatorMemo[] = result.memories.map((m, i) => ({
    id: uuidv4(),
    source: 'chat',
    text: m.text,
    colorHint: m.colorHint,
    importance: m.importance,
    // followUp 挂在第一条记忆上；没有记忆但有话头 → 建一条 importance 3 的载体
    followUp: i === 0 ? result.followUp ?? undefined : undefined,
    status: 'active',
    createdAt: now,
  }));
  if (memos.length === 0 && result.followUp) {
    memos.push({
      id: uuidv4(), source: 'chat', text: result.followUp, importance: 3,
      followUp: result.followUp, status: 'active', createdAt: now,
    });
  }
  if (memos.length) await db.navigatorMemos.bulkPut(memos);
}

// ── 主泵：会话末 compact（开窗时惰性触发） ──

/**
 * 归档「今天之前、尚无摘要」的会话（最多 3 条，防积压风暴）。
 * 返回昨日会话的中性摘要（若有/新产出），供跨日叙事问候即取即用。
 */
export async function finalizeStaleSessions(): Promise<string | null> {
  const today = toLocalDateKey();
  let yesterdaySummary: string | null = null;
  try {
    const stale = (await db.navigatorSessions.toArray())
      .filter((s) => s.dateKey < today)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    const targets = stale.filter((s) => !s.compactedSummary).slice(0, 3);
    // 已归档过的最近一条直接可用
    yesterdaySummary = stale.find((s) => s.compactedSummary)?.compactedSummary ?? null;

    const cfg = getAIConfig(useAppStore.getState().settings);
    for (const session of targets) {
      const rows = await db.navigatorMessages.where('sessionId').equals(session.id).sortBy('createdAt');
      const userMsgs = rows.filter((r) => r.role === 'user');
      const userChars = userMsgs.reduce((n, r) => n + (r.text?.length ?? 0), 0);
      let summary: string;
      let personaSummary: string | undefined;
      if (cfg && (userMsgs.length >= FINALIZE_MIN_USER_MSGS || userChars >= FINALIZE_MIN_USER_CHARS)) {
        const result = await compactViaAI(cfg, rowsToLines(rows).slice(-80), '黑猫');
        if (result) {
          summary = result.summary;
          personaSummary = result.personaSummary;
          await persistMemories(result);
        } else {
          summary = localSummary(rows);
        }
      } else {
        summary = localSummary(rows);
      }
      await db.navigatorSessions.update(session.id, {
        compactedSummary: summary,
        personaSummary,
        updatedAt: new Date(),
      });
      // 最近的一条 stale 就是"昨日"叙事素材
      if (!yesterdaySummary || session.dateKey > (stale.find((s) => s.compactedSummary)?.dateKey ?? '')) {
        yesterdaySummary = summary;
      }
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[navigator] 会话末 compact 失败', e);
  }
  return yesterdaySummary;
}

/** 无 Key / 不足门槛的本地拼接摘要 */
function localSummary(rows: NavigatorMessageRow[]): string {
  const users = rows.filter((r) => r.role === 'user' && r.text);
  const first = users[0]?.text?.slice(0, 30) ?? '';
  return users.length
    ? `简短聊了 ${users.length} 句${first ? `（开头是「${first}…」）` : ''}。`
    : '打了个照面，没聊什么。';
}

// ── 阈值泵：活跃会话内 compact ──

export interface LiveCompactOutcome {
  /** 压缩后的新消息数组（含 summary 占位）；null = 未触发 */
  summaryText: string | null;
  removedIds: string[];
}

/**
 * 检查并压缩活跃会话（fire-and-forget 由 store 调用后自行更新内存流）。
 * 有 Key 走 AI 摘要，无 Key/失败走本地拼接；90k 硬截断永不等 AI。
 */
export async function maybeCompactLive(
  sessionId: string,
  rows: NavigatorMessageRow[],
): Promise<LiveCompactOutcome> {
  const total = rows.reduce((n, r) => n + estTokens(r.text ?? '') + 8, 0);
  const over = total > LIVE_COMPACT_TOKENS || rows.length > LIVE_COMPACT_MSGS;
  if (!over) return { summaryText: null, removedIds: [] };

  const squash = rows.slice(0, rows.length - LIVE_KEEP_RECENT);
  if (squash.length === 0) return { summaryText: null, removedIds: [] };

  let summaryText: string;
  const cfg = getAIConfig(useAppStore.getState().settings);
  if (cfg && total <= HARD_CAP_TOKENS) {
    const result = await compactViaAI(cfg, rowsToLines(squash).slice(-100), '黑猫');
    if (result) {
      await persistMemories(result);
      summaryText = result.summary;
    } else {
      summaryText = localSummary(squash);
    }
  } else {
    // 无 Key 或超保险丝：本地硬截断（绝不等 AI）
    summaryText = localSummary(squash);
  }

  const summaryRow: NavigatorMessageRow = {
    id: uuidv4(),
    sessionId,
    role: 'summary',
    text: summaryText,
    createdAt: (squash[squash.length - 1]?.createdAt ?? Date.now()) ,
  };
  await db.navigatorMessages.bulkDelete(squash.map((r) => r.id));
  await db.navigatorMessages.put(summaryRow);
  await db.navigatorSessions.update(sessionId, { updatedAt: new Date() });
  return { summaryText, removedIds: squash.map((r) => r.id) };
}

// ── 检索与注入（§2.4） ──

export interface RecallResult {
  /** 注入动态块的记忆行（含 colorHint 与话头提示） */
  lines: string[];
}

const cjkBigrams = (text: string): Set<string> => {
  const clean = text.replace(/[^一-鿿\w]/g, '');
  const grams = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) grams.add(clean.slice(i, i + 2));
  return grams;
};

/**
 * 评分检索 top≤4 并回写 recall 元数据；followUp **注入即清**（宁可少提醒不重复）。
 * 纯本地零 AI；异常返回空（记忆失效不阻断对话）。
 */
export async function recallMemories(queryText: string): Promise<RecallResult> {
  try {
    const memos = await db.navigatorMemos.where('status').equals('active').toArray();
    if (memos.length === 0) return { lines: [] };
    const q = cjkBigrams(queryText);
    const now = Date.now();
    const scored = memos.map((m) => {
      const ageDays = (now - new Date(m.createdAt).getTime()) / 86400_000;
      const overlapSet = cjkBigrams(m.text);
      let hit = 0;
      overlapSet.forEach((g) => { if (q.has(g)) hit++; });
      const overlap = overlapSet.size ? hit / Math.min(overlapSet.size, 12) : 0;
      const score =
        m.importance * 0.5 +
        Math.exp(-ageDays / 14) * 1.2 +
        overlap * 2.5 +
        (m.followUp ? 1.5 : 0) -
        Math.min(1.2, (m.recallCount ?? 0) * 0.15) +
        (m.pinned ? 2 : 0);
      return { m, score };
    }).sort((a, b) => b.score - a.score);

    const picked = scored.slice(0, 4).filter((s) => s.score > 0.8);
    const lines: string[] = [];
    for (const { m } of picked) {
      lines.push(`- ${m.text}${m.colorHint ? `（${m.colorHint}）` : ''}${m.followUp ? `【可自然追问：${m.followUp}】` : ''}`);
      const patch: Partial<NavigatorMemo> = {
        lastRecalledAt: new Date(),
        recallCount: (m.recallCount ?? 0) + 1,
      };
      if (m.followUp) patch.followUp = undefined; // 一次性
      void db.navigatorMemos.update(m.id, patch).catch(() => {});
    }
    return { lines };
  } catch {
    return { lines: [] };
  }
}

/** 惰性遗忘（§2.5）：低价值久未召回 → archived（置顶免疫；不删除） */
export async function lazySweepMemos(): Promise<void> {
  try {
    const cutoff = Date.now() - 90 * 86400_000;
    const memos = await db.navigatorMemos.where('status').equals('active').toArray();
    const stale = memos.filter((m) =>
      !m.pinned &&
      m.importance <= 2 &&
      new Date(m.lastRecalledAt ?? m.createdAt).getTime() < cutoff,
    );
    for (const m of stale) void db.navigatorMemos.update(m.id, { status: 'archived' });
  } catch { /* 静默 */ }
}

// ── warmth 状态浮动（§4，零持久化纯计算） ──

export function buildWarmthLine(): string {
  const s = useAppStore.getState();
  const today = toLocalDateKey();
  const dayMs = 86400_000;
  // 近 3 日记录活跃度
  const recent = s.activities.filter((a) => Date.now() - new Date(a.date).getTime() < 3 * dayMs).length;
  // 连续记录天数（从今天往回数）
  const dates = new Set(s.activities.map((a) => toLocalDateKey(new Date(a.date))));
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = toLocalDateKey(new Date(Date.now() - i * dayMs));
    if (dates.has(d)) streak++;
    else if (i > 0) break;
    else if (!dates.has(today)) break;
    if (i > 60) break;
  }
  const hour = new Date().getHours();
  let warmth = 0.5 + Math.min(0.3, streak * 0.05) + Math.min(0.2, recent * 0.03);
  if (hour >= 23 || hour < 5) warmth -= 0.15;
  if (recent === 0) warmth -= 0.25;

  if (warmth >= 0.8) return '【当前语气】关系热络：语气松弛，可以调侃、可以连发短句。';
  if (warmth >= 0.5) return '【当前语气】日常：自然放松，正常发挥。';
  return '【当前语气】对方最近状态低落或久未记录：少说、多听、别催，收着说（1~2 段）。';
}
