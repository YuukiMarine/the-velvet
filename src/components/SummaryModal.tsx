import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore, toLocalDateKey, DEFAULT_SUMMARY_PROMPT_PRESETS, FAMILIAR_FACE_PRESETS } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { PeriodSummary, PeriodSummaryFollowUp, SummaryPeriod, YearRecap } from '@/types';
import DOMPurify from 'dompurify';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import { chatStream, type AIConfig } from '@/utils/aiClient';
import { effectiveModelName } from '@/utils/aiProviders';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, slantClip, sheetTopClip } from '@/components/p3r/kit';
import { renderMarkdown } from '@/utils/markdown';
import { ThinkingCircle } from '@/components/astrology/ThinkingCircle';
import { useThinkProgress } from '@/utils/thinkProgress';
import { FAMILIAR_FACE_ICONS, SUMMARY_FOLLOWUP_LIMIT, SUMMARY_FOLLOWUP_MAX_TOKENS, followUpsOf, visibleSummaryText, parseSummaryResult, summaryKindOf, annualWindowYear, annualSummaryOf, yearRangeOf, getActiveSummaryPreset } from '@/utils/summaryAI';
import { buildYearRecap } from '@/utils/yearRecap';
import YearRecapStage, { type RecapLetterState } from '@/components/annual/YearRecapStage';
import { freshUnreadSummary } from '@/utils/reportNotice';
import {
  useSummaryJobs, startSummaryJob, continueSummaryJob, cancelSummaryJob, discardSummaryJob,
  markSummaryJobSaved, restoreSummaryDraft, attachDraftFollowUp, isSummaryJobRunning, resolveKeyFor,
  SUMMARY_CONTINUE_LIMIT, type SummaryJob,
} from '@/utils/summaryJobs';

// ── 错误信息格式化（识别 CORS / 网络类错误）────────────────
function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return '生成失败，请重试';
  // CORS 或网络中断时浏览器抛出 TypeError: Failed to fetch
  if (e instanceof TypeError && /failed to fetch|network/i.test(e.message)) {
    return '网络请求失败：无法连接到 API 服务。\n若在浏览器中使用，部分 API 可能因跨域（CORS）限制无法直接访问，建议在 Android 客户端或支持 CORS 的接口下使用此功能。';
  }
  return e.message;
}

// ── 打字光标 ─────────────────────────────────────────────
function Cursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0] }}
      transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }}
      className="inline-block w-0.5 h-4 bg-primary align-middle ml-0.5"
    />
  );
}

/** 频道主色（魔法阵用 hex；中性频道读 --color-primary） */
function useAccentHex(): string {
  const ch = useUiChannel();
  return useMemo(() => {
    if (ch === 'p3') return '#1b57ff';
    if (ch === 'p4') return '#2f6bff';
    if (ch === 'p5') return '#c00008';
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    } catch { /* SSR / 隐私模式 */ }
    return '#7c3aed';
  }, [ch]);
}

// ── 周期选择器 ────────────────────────────────────────────
interface PeriodSelectorProps {
  value: { period: SummaryPeriod; startDate: string; endDate: string };
  onChange: (v: { period: SummaryPeriod; startDate: string; endDate: string }) => void;
}

function getWeekRange(offset = 0) {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    startDate: toLocalDateKey(monday),
    endDate: toLocalDateKey(sunday),
  };
}

function getMonthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    startDate: toLocalDateKey(first),
    endDate: toLocalDateKey(last),
  };
}

function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const handleWeekChange = (delta: number) => {
    const next = weekOffset + delta;
    setWeekOffset(next);
    onChange({ period: 'week', ...getWeekRange(next) });
  };
  const handleMonthChange = (delta: number) => {
    const next = monthOffset + delta;
    setMonthOffset(next);
    onChange({ period: 'month', ...getMonthRange(next) });
  };
  const switchPeriod = (p: SummaryPeriod) => {
    if (p === 'week') { setWeekOffset(0); onChange({ period: 'week', ...getWeekRange(0) }); }
    else { setMonthOffset(0); onChange({ period: 'month', ...getMonthRange(0) }); }
  };
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const label = (() => {
    const s = new Date(value.startDate), e = new Date(value.endDate);
    return s.getFullYear() === e.getFullYear()
      ? `${s.getFullYear()}年 ${fmt(s)} ~ ${fmt(e)}`
      : `${value.startDate} ~ ${value.endDate}`;
  })();

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['week', 'month'] as SummaryPeriod[]).map(p => (
          <button key={p} onClick={() => switchPeriod(p)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${value.period === p ? 'bg-primary text-white shadow-md' : 'bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
            {p === 'week' ? '周总结' : '月总结'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 bg-black/5 dark:bg-white/10 rounded-xl px-3 py-2">
        <button onClick={() => value.period === 'week' ? handleWeekChange(-1) : handleMonthChange(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-gray-600 dark:text-gray-300 font-bold text-lg">‹</button>
        <div className="flex-1 text-center text-sm font-semibold text-gray-700 dark:text-gray-200">{label}</div>
        <button onClick={() => value.period === 'week' ? handleWeekChange(1) : handleMonthChange(1)}
          disabled={value.period === 'week' ? weekOffset >= 0 : monthOffset >= 0}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-gray-600 dark:text-gray-300 font-bold text-lg disabled:opacity-30">›</button>
      </div>
    </div>
  );
}

// ── 归档列表 ───────────────────────────────────────────────
function ArchiveList({ summaries, onSelect, onDelete }: {
  summaries: PeriodSummary[];
  onSelect: (s: PeriodSummary) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
        <div className="text-5xl mb-3">📂</div>
        <div className="text-sm">暂无归档总结</div>
        <div className="text-xs mt-1 opacity-70">生成的总结保存后将在此显示</div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {summaries.map(s => { const kind = summaryKindOf(s); return (
        <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className={`relative rounded-2xl p-4 flex items-center gap-3 overflow-hidden ${kind === 'year'
            ? 'bg-gradient-to-br from-amber-100 via-amber-50 to-white ring-1 ring-amber-300/70 dark:from-amber-900/40 dark:via-amber-900/15 dark:to-transparent dark:ring-amber-700/50'
            : 'bg-black/5 dark:bg-white/5'}`}>
          <VelvetWatermark />
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(s)}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                kind === 'week' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
                  : kind === 'year' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'}`}>
                {kind === 'week' ? '周' : kind === 'year' ? '年' : '月'}
              </span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{s.label}</span>
              {s.autoWritten && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-black/5 text-gray-500 dark:bg-white/10 dark:text-gray-400 shrink-0">自动</span>}
              {!s.viewedAt && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-label="未读" />}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>+{s.totalPoints} 点</span><span>{s.activityCount} 条记录</span>
              <span className="truncate">{FAMILIAR_FACE_ICONS[s.promptPresetId] ? `${FAMILIAR_FACE_ICONS[s.promptPresetId]} ` : ''}{s.promptPresetName}</span>
              {followUpsOf(s).length > 0 && <span>追问 {followUpsOf(s).length}</span>}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">
              {new Date(s.createdAt).toLocaleDateString('zh-CN')}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => onSelect(s)} className="text-xs text-primary font-semibold px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">查看</button>
            {confirmId === s.id
              ? <button onClick={() => { onDelete(s.id); setConfirmId(null); }} className="text-xs text-red-500 font-semibold px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20">确认</button>
              : <button onClick={() => setConfirmId(s.id)} className="text-xs text-gray-400 px-2 py-1 rounded-lg hover:bg-red-50 hover:text-red-400 dark:hover:bg-red-900/20 transition-colors">删除</button>
            }
          </div>
        </motion.div>
      ); })}
    </div>
  );
}

// ── 正文 ──────────────────────────────────────────────────
/** annual：年度信单独一种信纸（金边、抬头、落款角色名与日期） */
function SummaryBody({ text, streaming, annual }: { text: string; streaming: boolean; annual?: { year: number; signature: string } }) {
  return (
    <div className={`relative rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed overflow-hidden ${
      annual
        ? 'border border-amber-300/80 bg-gradient-to-b from-amber-50 via-white to-white dark:border-amber-700/50 dark:from-amber-900/25 dark:via-transparent dark:to-transparent'
        : 'bg-black/[0.03] dark:bg-white/[0.03]'}`}>
      <VelvetWatermark />
      {annual && (
        <div className="relative mb-3 text-center text-[11px] font-black tracking-[0.3em] text-amber-600 dark:text-amber-400">✦ {annual.year} · 年度的信 ✦</div>
      )}
      <div className="relative md-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(text)) }} />
      {streaming && <Cursor />}
      {annual && !streaming && text.trim() && (
        <div className="relative mt-4 text-right text-xs font-bold text-gray-500 dark:text-gray-400">—— {annual.signature}</div>
      )}
    </div>
  );
}

const cnDate = (d: Date | string) => { const x = new Date(d); return `${x.getFullYear()}年${x.getMonth() + 1}月${x.getDate()}日`; };
const annualPaper = (s: { startDate: string; promptPresetId: string; promptPresetName: string; createdAt: Date | string }) => ({
  year: Number(s.startDate.slice(0, 4)),
  signature: `${FAMILIAR_FACE_ICONS[s.promptPresetId] ?? ''}${s.promptPresetName}，${cnDate(s.createdAt)}`,
});

// ── 追问区（v2.7.0.6：多轮，上限 SUMMARY_FOLLOWUP_LIMIT；角色的问题当默认输入）──
interface FollowUpAreaProps {
  cfg: AIConfig | null;
  /** system + user 原始消息 */
  baseMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | null;
  content: string;
  followUps: PeriodSummaryFollowUp[];
  question?: string;
  onFollowUpComplete: (fu: PeriodSummaryFollowUp) => void;
}

function FollowUpArea({ cfg, baseMessages, content, followUps, question, onFollowUpComplete }: FollowUpAreaProps) {
  const [input, setInput] = useState('');
  const [liveQ, setLiveQ] = useState('');
  const [liveA, setLiveA] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const remaining = SUMMARY_FOLLOWUP_LIMIT - followUps.length;
  const canAsk = !!cfg && !!baseMessages && remaining > 0;

  const ask = useCallback(async (q: string) => {
    const question = q.trim();
    if (!question || !cfg || !baseMessages || streaming) return;
    setError(null);
    setStreaming(true);
    setLiveQ(question);
    setLiveA('');
    const ac = new AbortController();
    abortRef.current = ac;
    let answer = '';
    try {
      const messages = [
        ...baseMessages,
        { role: 'assistant' as const, content },
        ...followUps.flatMap(f => [
          { role: 'user' as const, content: f.question },
          { role: 'assistant' as const, content: f.answer },
        ]),
        // 系统提示里的写法规则要求正文后带 META 行；追问不需要（就算模型照写了，下面也会剥掉）
        { role: 'user' as const, content: `${question}\n\n（直接回答即可，不需要 ${'<<<META>>>'} 那两行。）` },
      ];
      for await (const chunk of chatStream(cfg, messages, { temperature: 0.7, maxTokens: SUMMARY_FOLLOWUP_MAX_TOKENS, signal: ac.signal })) {
        answer += chunk;
        setLiveA(visibleSummaryText(answer));
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) setError(formatApiError(e));
    } finally {
      setStreaming(false);
    }
    const clean = parseSummaryResult(answer).content;
    if (clean.trim()) {
      onFollowUpComplete({ question, answer: clean, createdAt: new Date() });
      setLiveQ('');
      setLiveA('');
      setInput('');
    }
  }, [cfg, baseMessages, content, followUps, streaming, onFollowUpComplete]);

  const showQuestionChip = followUps.length === 0 && !!question && !input && !streaming;

  return (
    <div className="space-y-3">
      {followUps.map((f, i) => (
        <div key={`${f.createdAt instanceof Date ? f.createdAt.getTime() : String(f.createdAt)}-${i}`} className="space-y-2">
          <div className="text-sm text-gray-700 dark:text-gray-200 bg-black/[0.03] dark:bg-white/5 rounded-2xl px-3 py-2">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1.5">追问 {i + 1}</span>
            {f.question}
          </div>
          <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
            <div className="md-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(f.answer)) }} />
          </div>
        </div>
      ))}

      {(streaming || liveA) && (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 dark:text-gray-200 bg-black/[0.03] dark:bg-white/5 rounded-2xl px-3 py-2">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1.5">追问 {followUps.length + 1}</span>
            {liveQ}
          </div>
          <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
            <div className="md-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(liveA)) }} />
            {streaming && <Cursor />}
          </div>
        </div>
      )}

      {canAsk && !streaming && (
        <div>
          <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
            {followUps.length === 0 ? '还有疑问？可以追问' : `还可以追问 ${remaining} 次`}
          </div>
          {showQuestionChip && (
            <button
              type="button"
              onClick={() => setInput(question!)}
              className="mb-2 max-w-full truncate rounded-full bg-primary/10 px-3 py-1 text-left text-[11px] font-bold text-primary"
              title={question}
            >
              回答对方的问题：{question}
            </button>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !streaming && void ask(input)}
              placeholder={question && followUps.length === 0 ? '回答上面的问题，或者问点别的' : '例如：如何具体提升知识属性？'}
              className="flex-1 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary"
            />
            <button
              onClick={() => void ask(input)}
              disabled={!input.trim()}
              className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-40 transition-all"
            >
              发送
            </button>
          </div>
        </div>
      )}

      {!cfg && baseMessages && remaining > 0 && (
        <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl px-3 py-2 leading-relaxed">
          当前没有这份总结所用平台的 API Key，无法在此追问。
        </div>
      )}
      {!baseMessages && (
        <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-black/[0.03] dark:bg-white/[0.03] rounded-xl px-3 py-2 leading-relaxed">
          这条归档生成于较早版本，没有保留追问所需的上下文，无法在此追问。
        </div>
      )}
      {remaining <= 0 && followUps.length > 0 && (
        <div className="text-[11px] text-gray-400 dark:text-gray-500 px-1">追问机会已用完。</div>
      )}
      {error && (
        <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">{error}</div>
      )}
    </div>
  );
}

// ── 流式期间的主题色粒子 ──────────────────────────────────
function StreamingParticles() {
  const particles = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i,
    leftPct: Math.random() * 100,
    size: 2 + Math.random() * 3,
    duration: 6 + Math.random() * 5,
    delay: Math.random() * 6,
    opacity: 0.22 + Math.random() * 0.28,
    rise: 400 + Math.random() * 200,
    drift: (Math.random() - 0.5) * 40,
  })), []);
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none rounded-t-3xl"
    >
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary"
          style={{
            left: `${p.leftPct}%`,
            bottom: -10,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            boxShadow: '0 0 8px var(--color-primary)',
          }}
          animate={{
            y: [0, -p.rise],
            opacity: [0, p.opacity, p.opacity, 0],
            x: [0, p.drift],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

// ── 确认弹层（重新生成会丢掉草稿）─────────────────────────
function ConfirmLayer({ title, body, confirmLabel, onCancel, onConfirm }: {
  title: string;
  body: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[80] flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-5 w-full max-w-xs"
      >
        <h3 className="text-base font-black text-gray-900 dark:text-white mb-1.5">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{body}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200">取消</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white">{confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── THE VELVET 水印 ──────────────────────────────────────
function VelvetWatermark() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none"
    >
      <span
        className="text-5xl font-black tracking-[0.3em] text-gray-900 dark:text-white opacity-[0.04] dark:opacity-[0.06] rotate-[-12deg] whitespace-nowrap"
        style={{ fontFamily: 'sans-serif' }}
      >
        THE VELVET
      </span>
    </div>
  );
}

// ── 风格快速切换器 ────────────────────────────────────────

interface StyleQuickSwitcherProps {
  activeId: string;
  onPick: (id: string) => void;
  customPresets: Array<{ id: string; name: string; isBuiltin?: boolean }>;
}

/**
 * 风格选择条：
 *  - 上方 4 位"熟悉的人"只留 emoji（用户口径：去掉名字更有意思；按钮尺寸不变，方便按）
 *  - 下方其他内置 / 自定义风格的 chip 列表
 */
function StyleQuickSwitcher({ activeId, onPick, customPresets }: StyleQuickSwitcherProps) {
  const familiars = FAMILIAR_FACE_PRESETS.filter(p => FAMILIAR_FACE_ICONS[p.id]);
  const familiarIds = new Set(familiars.map(f => f.id));
  const otherPresets = [
    ...FAMILIAR_FACE_PRESETS.filter(p => !familiarIds.has(p.id)),
    ...DEFAULT_SUMMARY_PROMPT_PRESETS,
    ...customPresets,
  ].reduce<Array<{ id: string; name: string }>>((acc, p) => {
    if (familiarIds.has(p.id)) return acc;
    if (acc.some(x => x.id === p.id)) return acc;
    acc.push({ id: p.id, name: p.name });
    return acc;
  }, []);
  const activeFamiliar = familiars.find(f => f.id === activeId);

  const renderChip = (id: string, label: string, opts?: { emoji?: boolean; name?: string }) => {
    const active = activeId === id;
    return (
      <button
        key={id}
        onClick={() => onPick(id)}
        aria-label={opts?.name ?? label}
        title={opts?.name}
        className={`${opts?.emoji ? 'min-w-[48px] px-3 py-1 text-[17px] leading-[22px]' : 'px-3 py-1.5 text-[11px]'} rounded-full font-bold transition-all ${
          active
            ? 'bg-primary text-white shadow-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        {label}{active && !opts?.emoji ? ' ✓' : ''}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      {/* 熟悉的人：只留 emoji，名字在 aria-label 与下方一行 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {familiars.map(f => renderChip(f.id, FAMILIAR_FACE_ICONS[f.id], { emoji: true, name: f.name }))}
        {activeFamiliar && (
          <span className="ml-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">{activeFamiliar.name}</span>
        )}
      </div>

      {/* 其他内置 / 自定义风格 */}
      {otherPresets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {otherPresets.map(p => renderChip(p.id, p.name))}
        </div>
      )}
    </div>
  );
}

// ── 主 SummaryModal ────────────────────────────────────────
interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPeriod?: SummaryPeriod;
  /** 打开时直达这份总结（助手的「看总结」/ 通知点击）；找不到就照常进生成页 */
  openSummaryId?: string;
}

type ModalView = 'generate' | 'result' | 'archive' | 'view';

const StatsGrid = ({ items }: { items: Array<{ label: string; value: string }> }) => (
  <div className="grid grid-cols-3 gap-2">
    {items.map(item => (
      <div key={item.label} className="bg-black/5 dark:bg-white/5 rounded-2xl p-3 text-center">
        <div className="text-xs text-gray-400 dark:text-gray-500">{item.label}</div>
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate mt-0.5">{item.value}</div>
      </div>
    ))}
  </div>
);

export default function SummaryModal({ isOpen, onClose, defaultPeriod = 'week', openSummaryId }: SummaryModalProps) {
  const { settings, summaries, saveSummary, deleteSummary, loadSummaries, updateSettings, markSummaryViewed } = useAppStore(useShallow(s => ({ settings: s.settings, summaries: s.summaries, saveSummary: s.saveSummary, deleteSummary: s.deleteSummary, loadSummaries: s.loadSummaries, updateSettings: s.updateSettings, markSummaryViewed: s.markSummaryViewed })));
  const job = useSummaryJobs(s => s.job);
  const running = isSummaryJobRunning(job);
  const accent = useAccentHex();
  const progress = useThinkProgress(job?.tracker ?? null, job?.status === 'thinking');

  const [view, setView] = useState<ModalView>('generate');
  const [periodState, setPeriodState] = useState<{ period: SummaryPeriod; startDate: string; endDate: string }>(() =>
    defaultPeriod === 'month' ? { period: 'month', ...getMonthRange(0) } : { period: 'week', ...getWeekRange(0) }
  );
  const [isAnnual, setIsAnnual] = useState(false);
  // 年度卡：12/24～1/7 挂出来（一月里写的是去年），由客人自己点生成
  const annualYear = annualWindowYear();
  const [selectedSummary, setSelectedSummary] = useState<PeriodSummary | null>(null);
  const [confirm, setConfirm] = useState<'regen' | 'discard' | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const userName = useAppStore(s => s.user?.name);
  // 年度开场：生成年度时自动放（开场数字一算好就开），归档 / 草稿里可以「重温开场」
  const [stage, setStage] = useState<{ recap: YearRecap; live: boolean; presetName: string; presetId: string } | null>(null);
  const [stageOpen, setStageOpen] = useState(false);
  const wantStageRef = useRef(false);

  // ESC / Android back：确认层开着就先关它；否则直接关弹层（任务在后台继续，草稿自动保留）
  const dialogRef = useModalA11y(isOpen, () => {
    if (confirm) setConfirm(null);
    else onClose();
  });
  useBackHandler(isOpen, () => {
    if (confirm) setConfirm(null);
    else onClose();
  });

  const noApiKey = !settings.summaryApiKey;
  const p3 = useUiChannel() === 'p3';

  useEffect(() => {
    if (!isOpen) return;
    loadSummaries();
    setConfirm(null);
    setSelectedSummary(null);
    setIsAnnual(false);
    // 指定了某份总结（看总结 / 通知点开）→ 由下面那个 effect 直达；否则有在跑的任务 / 草稿就进结果页
    if (openSummaryId) { setView('generate'); return; }
    const had = !!useSummaryJobs.getState().job || restoreSummaryDraft();
    setView(had ? 'result' : 'generate');
  }, [isOpen, loadSummaries, openSummaryId]);

  // 直达指定总结：summaries 加载到了就打开它（只跳一次）
  const jumpedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) { jumpedRef.current = null; return; }
    if (!openSummaryId || jumpedRef.current === openSummaryId) return;
    const target = summaries.find(x => x.id === openSummaryId);
    if (!target) return;
    jumpedRef.current = openSummaryId;
    void markSummaryViewed(target.id);
    setSelectedSummary(target.viewedAt ? target : { ...target, viewedAt: new Date() });
    setView('view');
  }, [isOpen, openSummaryId, summaries, markSummaryViewed]);

  const freshReport = freshUnreadSummary(summaries);
  const writtenAnnual = annualYear !== null ? annualSummaryOf(summaries, annualYear) : undefined;
  const openArchived = (s: PeriodSummary) => { void markSummaryViewed(s.id); setSelectedSummary(s.viewedAt ? s : { ...s, viewedAt: new Date() }); setView('view'); };
  const autoWrite = settings.summaryAutoWrite !== false;

  // 流式时跟着滚到底
  useEffect(() => {
    if (view === 'result' && job?.status === 'streaming' && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [job?.text, job?.status, view]);

  const handleGenerate = () => {
    const range = isAnnual && annualYear !== null ? { period: 'year' as const, ...yearRangeOf(annualYear) } : periodState;
    wantStageRef.current = range.period === 'year';
    startSummaryJob({ settings, period: range.period, startDate: range.startDate, endDate: range.endDate });
    setView('result');
  };

  // 年度任务的开场数字到了 → 开场（信在后台接着写）
  useEffect(() => {
    if (!wantStageRef.current || !job?.recap || job.period !== 'year') return;
    wantStageRef.current = false;
    const preset = getActiveSummaryPreset(settings);
    setStage({ recap: job.recap, live: true, presetName: preset.name, presetId: preset.id });
    setStageOpen(true);
  }, [job?.recap, job?.period, settings]);

  const replayRecap = async (s: { recap?: YearRecap; startDate: string; promptPresetName: string; promptPresetId: string }) => {
    // 老的年度总结没存开场数字：按现在的数据现算一份（不回写）
    const recap = s.recap ?? await buildYearRecap(Number(s.startDate.slice(0, 4)), settings).catch(() => null);
    if (!recap) return;
    setStage({ recap, live: false, presetName: s.promptPresetName, presetId: s.promptPresetId });
    setStageOpen(true);
  };

  const letterState: RecapLetterState = !stage?.live
    ? { kind: 'ready' }
    : !job ? { kind: 'error' }
      : job.status === 'done' ? { kind: 'ready' }
        : job.status === 'error' ? { kind: 'error', message: job.error }
          : {
            kind: 'writing',
            phase: job.status === 'streaming' ? 'streaming' : job.status === 'thinking' ? 'thinking' : 'preparing',
            progress: job.status === 'thinking' ? progress : undefined,
            chars: job.text.length,
          };

  const handleSave = async () => {
    if (!job?.draft || saving) return;
    setSaving(true);
    try {
      const toSave: PeriodSummary = { ...job.draft, viewedAt: job.draft.viewedAt ?? new Date() };
      await saveSummary(toSave);
      markSummaryJobSaved();
      setSelectedSummary(toSave);
      setView('view');
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = () => {
    if (job?.draft) { setConfirm('regen'); return; }
    cancelSummaryJob();
    setView('generate');
  };

  const handleStop = () => {
    cancelSummaryJob();
    setView('generate');
  };

  /** 归档视图里完成一次追问 → 立刻写回该 summary */
  const handleArchivedFollowUpSaved = async (fu: PeriodSummaryFollowUp) => {
    if (!selectedSummary) return;
    const updated: PeriodSummary = { ...selectedSummary, followUps: [...followUpsOf(selectedSummary), fu], followUp: undefined };
    await saveSummary(updated);
    setSelectedSummary(updated);
  };

  const cfgFor = (rc: PeriodSummary['reqContext'] | undefined): AIConfig | null => {
    if (!rc) return null;
    const key = resolveKeyFor(settings, rc.provider);
    // 存档里的模型名可能已退役：追问前换成继任者（effectiveModelName），不然 404
    return key ? { apiKey: key, baseUrl: rc.baseUrl, model: effectiveModelName(rc.model), provider: rc.provider } : null;
  };

  const jobStats = (j: SummaryJob) => {
    const src = j.req ?? j.draft;
    return [
      { label: '总加点', value: src ? `+${src.totalPoints}` : '…' },
      { label: '记录数', value: src ? `${src.activityCount}` : '…' },
      { label: '风格', value: j.req ? j.req.preset.name : (j.draft?.promptPresetName ?? '…') },
    ];
  };

  const headerTitle = (() => {
    if (view === 'generate') return '生成成长总结';
    if (view === 'archive') return '历史总结归档';
    if (view === 'view') return selectedSummary?.label ?? '总结详情';
    if (!job) return '总结预览';
    if (job.status === 'preparing') return '正在整理简报…';
    if (job.status === 'thinking') return '✨ 正在读你的记录…';
    if (job.status === 'streaming') return '✨ AI 正在书写…';
    if (job.status === 'error') return '生成失败';
    return job.draft?.label ? `${job.draft.label} · 草稿` : '总结预览';
  })();

  // R19 修复：整块面板原本渲染在 App 的 `relative z-10` 语境里——
  // 无论标多少 z 都压不过底导（z-40 是它的兄弟节点），底部内容会被
  // tab 栏 / 宽屏左侧栏切掉。按 utils/zIndex.ts 的迁移口径 portal 到 body。
  return createPortal(
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="成长总结"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className={`relative flex w-full max-w-lg flex-col overflow-hidden shadow-2xl ${p3 ? '' : 'rounded-t-3xl bg-white dark:bg-gray-900'}`}
            style={p3
              ? { maxHeight: '90vh', background: 'linear-gradient(178deg, #fbfdff 0%, #f0f8fc 55%, #e8f4fa 100%)', clipPath: sheetTopClip }
              : { maxHeight: '90vh' }}
          >
            {/* 流式期间的主题色粒子 */}
            {view === 'result' && running && <StreamingParticles />}
            {/* Handle */}
            <div className="flex justify-center pt-4 pb-1">
              {p3 ? (
                <div aria-hidden className="relative flex h-[16px] w-[82px] items-center justify-center" style={{ background: 'var(--p3r-cyan, #35d1e8)', clipPath: 'polygon(0 55%, 18% 0, 100% 30%, 82% 100%)' }}>
                  <span className="h-[3px] w-7 bg-white" />
                </div>
              ) : (
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              )}
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-black/5 dark:border-white/5">
              {(view === 'view' || view === 'archive' || (view === 'result' && !running && !job)) && (
                <button
                  onClick={() => {
                    if (view === 'view') setView('archive');
                    else setView('generate');
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 mr-1 text-lg"
                >‹</button>
              )}
              <div className="flex-1 min-w-0">
                <h2 className={p3 ? 'flex items-center gap-2 text-[19px] font-black italic' : 'text-base font-black text-gray-900 dark:text-white truncate'} style={p3 ? { color: P3R.ink } : undefined}>
                  {p3 && <span aria-hidden className="h-[18px] w-[6px] shrink-0" style={{ background: P3R.blue, transform: 'skewX(-18deg)' }} />}
                  {headerTitle}
                </h2>
                {view === 'generate' && (
                  <p className={p3 ? 'mt-0.5 text-xs font-bold' : 'text-xs text-gray-400 dark:text-gray-500 mt-0.5'} style={p3 ? { color: P3R.blue } : undefined}>由 AI 分析你的成长记录，实时生成总结与建议</p>
                )}
                {view === 'result' && running && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">关掉也没关系，它会在后台写完，回来就能看。</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {view === 'generate' && (
                  <button onClick={() => setView('archive')} className="text-xs text-primary font-semibold px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">归档</button>
                )}
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-gray-400 text-lg">×</button>
              </div>
            </div>

            {/* Body */}
            <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* ── 生成视图 ── */}
              {view === 'generate' && (
                <div className="space-y-4">
                  {noApiKey && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-4">
                      <div className="flex items-start gap-2">
                        <span className="text-lg">⚠️</span>
                        <div>
                          <div className="text-sm font-bold text-amber-700 dark:text-amber-300">未配置 AI API</div>
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">请前往「设置 → AI 总结」配置 API 密钥后再使用此功能</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 新写好、还没看的总结：顶部一条，点了直接打开 */}
                  {freshReport && (
                    <button
                      type="button"
                      onClick={() => { void markSummaryViewed(freshReport.id); setSelectedSummary({ ...freshReport, viewedAt: new Date() }); setView('view'); }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-left dark:bg-primary/10"
                    >
                      <span className="text-2xl" aria-hidden>📜</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black text-gray-800 dark:text-white">「{freshReport.label}」写好了</span>
                        <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
                          {freshReport.autoWritten ? '按你的设置在后台写好的，' : ''}还没看过
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-primary">查看 ›</span>
                    </button>
                  )}

                  {/* 年度总结卡（12/24～1/7 显示）*/}
                  {annualYear !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => setIsAnnual(true)}
                      className={`cursor-pointer rounded-2xl border-2 p-4 transition-all bg-gradient-to-br from-amber-100 via-yellow-50 to-white dark:from-amber-900/40 dark:via-amber-900/15 dark:to-transparent ${
                        isAnnual
                          ? 'border-amber-500 shadow-[0_8px_24px_rgba(245,158,11,0.28)] dark:border-amber-400'
                          : 'border-amber-300 dark:border-amber-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">🦋</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-gray-800 dark:text-white">
                              {annualYear}年 年度总结
                            </span>
                            {isAnnual && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500 text-white font-bold">已选</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            成功的更生 — 回顾{annualYear === new Date().getFullYear() ? '这一年' : '去年'}全部成长历程
                          </div>
                          {writtenAnnual && (
                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                              <span>{new Date(writtenAnnual.createdAt).toLocaleDateString('zh-CN')} 写过一份，再生成会另存一份</span>
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); openArchived(writtenAnnual); }}
                                className="shrink-0 font-bold text-primary"
                              >
                                查看 ›
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div>
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">选择时间范围</div>
                    <PeriodSelector value={isAnnual ? { period: 'month', ...getMonthRange(0) } : periodState} onChange={v => { setIsAnnual(false); setPeriodState(v); }} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
                      当前风格
                    </div>
                    <StyleQuickSwitcher
                      activeId={settings.summaryActivePresetId ?? 'igor'}
                      onPick={(id) => updateSettings({ summaryActivePresetId: id })}
                      customPresets={settings.summaryPromptPresets ?? DEFAULT_SUMMARY_PROMPT_PRESETS}
                    />
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      点击切换；在设置「AI 总结」里可新增 / 编辑自定义风格
                      {settings.summaryDeliberate ? '。已开启深思熟虑档：更贴，但要多等一会儿' : ''}
                    </p>
                  </div>

                  {/* 自动撰写上一期（v2.7.0.6，默认开） */}
                  <div>
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
                      自动撰写
                    </div>
                    <label className="flex items-start gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-gray-100 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoWrite}
                        onChange={e => updateSettings({ summaryAutoWrite: e.target.checked })}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">自动撰写上一期总结</div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed mt-0.5">
                          新的一周、一个月第一次打开时，上一期还没写就在后台写好，写完提醒你一次。用当前选的风格。
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* 是否统计特殊条目 */}
                  <div>
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
                      统计口径
                    </div>
                    <label className="flex items-start gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-gray-100 dark:border-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.summaryIncludeSpecial === true}
                        onChange={e => updateSettings({ summaryIncludeSpecial: e.target.checked })}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
                          同时统计"特殊条目"
                        </div>
                        <AnimatePresence initial={false}>
                          {settings.summaryIncludeSpecial === true && (
                            <motion.p
                              initial={{ opacity: 0, height: 0, marginTop: 0 }}
                              animate={{ opacity: 1, height: 'auto', marginTop: 2 }}
                              exit={{ opacity: 0, height: 0, marginTop: 0 }}
                              transition={{ duration: 0.18 }}
                              className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed overflow-hidden"
                            >
                              包括：逆影战场击破、本周目标、逆流、升级 / 成就 / 技能解锁 等。
                              同伴（带"同伴"标签的条目）始终会被统计。
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* ── 结果视图（后台任务驱动：流式 / 草稿 / 追问）── */}
              {view === 'result' && job && (
                <div className="space-y-4">
                  <StatsGrid items={jobStats(job)} />

                  {job.status === 'preparing' && (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500 dark:text-gray-400">
                      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block">◌</motion.span>
                      正在整理这一期的简报…
                    </div>
                  )}

                  {job.status === 'thinking' && (
                    <div className="flex flex-col items-center py-4">
                      <ThinkingCircle
                        progress={progress}
                        size={128}
                        color={accent}
                        variant="spokes"
                        label={job.req?.deliberate ? '深思熟虑中' : '正在读你的记录'}
                      />
                    </div>
                  )}

                  {job.period === 'year' && job.status === 'done' && (job.recap || job.draft) && (
                    <button type="button"
                      onClick={() => void replayRecap({ recap: job.recap, startDate: job.startDate, promptPresetName: job.draft?.promptPresetName ?? '', promptPresetId: job.draft?.promptPresetId ?? '' })}
                      className="w-full rounded-2xl border border-amber-300/80 bg-amber-50 py-2 text-xs font-black text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
                      ✦ 重温开场
                    </button>
                  )}
                  {(job.status === 'streaming' || job.status === 'done') && (
                    <SummaryBody text={job.text} streaming={job.status === 'streaming'}
                      annual={job.period === 'year' && job.draft ? annualPaper(job.draft) : job.period === 'year' ? { year: Number(job.startDate.slice(0, 4)), signature: '' } : undefined} />
                  )}

                  {job.status === 'error' && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-3 space-y-2">
                      <div className="text-sm text-red-600 dark:text-red-400 whitespace-pre-line">{job.error}</div>
                      <div className="flex gap-2">
                        <button onClick={() => { cancelSummaryJob(); setView('generate'); }} className="flex-1 py-2 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300">返回</button>
                        <button onClick={() => { cancelSummaryJob(); handleGenerate(); }} className="flex-1 py-2 rounded-xl text-xs font-bold bg-primary text-white">重试</button>
                      </div>
                    </div>
                  )}

                  {job.status === 'done' && job.truncated && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-2xl p-3 flex items-center gap-3">
                      <div className="flex-1 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                        {job.continues >= SUMMARY_CONTINUE_LIMIT
                          ? '已经续写了三次，剩下的就这样吧；可以直接归档，或者重新生成。'
                          : '这封信写到一半断了（输出被截断或连接中途断开）。可以让它从断处接着写。'}
                      </div>
                      {job.continues < SUMMARY_CONTINUE_LIMIT && (
                        <button
                          onClick={() => continueSummaryJob(settings)}
                          className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 text-white active:scale-95"
                        >
                          接着写
                        </button>
                      )}
                    </div>
                  )}

                  {job.status === 'done' && !job.truncated && job.draft && (
                    <FollowUpArea
                      cfg={job.req ? { apiKey: job.req.apiKey, baseUrl: job.req.baseUrl, model: job.req.model, provider: job.req.provider } : cfgFor(job.draft.reqContext)}
                      baseMessages={job.req?.messages ?? job.draft.reqContext?.messages ?? null}
                      content={job.draft.content}
                      followUps={job.draft.followUps ?? []}
                      question={job.draft.question}
                      onFollowUpComplete={attachDraftFollowUp}
                    />
                  )}
                </div>
              )}
              {view === 'result' && !job && (
                <div className="py-10 text-center text-sm text-gray-400">没有正在进行的总结。</div>
              )}

              {/* ── 归档列表 ── */}
              {view === 'archive' && (
                <ArchiveList summaries={summaries} onSelect={s => { void markSummaryViewed(s.id); setSelectedSummary(s.viewedAt ? s : { ...s, viewedAt: new Date() }); setView('view'); }} onDelete={id => deleteSummary(id)} />
              )}

              {/* ── 单条查看 ── */}
              {view === 'view' && selectedSummary && (
                <div className="space-y-4">
                  <StatsGrid items={[
                    { label: '总加点', value: `+${selectedSummary.totalPoints}` },
                    { label: '记录数', value: `${selectedSummary.activityCount}` },
                    { label: '风格', value: selectedSummary.promptPresetName },
                  ]} />
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {selectedSummary.startDate} ~ {selectedSummary.endDate} · 生成于 {new Date(selectedSummary.createdAt).toLocaleDateString('zh-CN')}
                    {selectedSummary.deliberate ? ' · 深思熟虑' : ''}
                  </div>
                  {summaryKindOf(selectedSummary) === 'year' && (
                    <button type="button" onClick={() => void replayRecap(selectedSummary)}
                      className="w-full rounded-2xl border border-amber-300/80 bg-amber-50 py-2 text-xs font-black text-amber-700 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-300">
                      ✦ 重温开场
                    </button>
                  )}
                  <SummaryBody text={selectedSummary.content} streaming={false}
                    annual={summaryKindOf(selectedSummary) === 'year' ? annualPaper(selectedSummary) : undefined} />
                  {/* 归档里的追问：
                      - 已落库的按轮展示
                      - 还有次数 + 有 reqContext → 显示输入框，发送后立即落库 */}
                  <FollowUpArea
                    cfg={cfgFor(selectedSummary.reqContext)}
                    baseMessages={selectedSummary.reqContext?.messages ?? null}
                    content={selectedSummary.content}
                    followUps={followUpsOf(selectedSummary)}
                    question={selectedSummary.question}
                    onFollowUpComplete={handleArchivedFollowUpSaved}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-black/5 dark:border-white/5">
              {view === 'generate' && (
                <button
                  onClick={handleGenerate}
                  disabled={noApiKey || running}
                  className={p3
                    ? `relative w-full py-3.5 text-[15px] font-black text-white transition-transform ${noApiKey || running ? 'opacity-40' : 'active:translate-y-0.5'}`
                    : `w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${noApiKey || running ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-primary text-white shadow-lg active:scale-[0.98]'}`}
                  style={p3 ? { clipPath: slantClip(12), background: noApiKey || running ? '#9db4d0' : P3R.blue, boxShadow: '0 10px 24px rgba(27,87,255,0.3)' } : undefined}
                >
                  🦋 生成总结
                  {p3 && !(noApiKey || running) && <span aria-hidden className="absolute bottom-0 right-4 h-[9px] w-[22px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />}
                </button>
              )}

              {view === 'result' && job && (
                <div className="flex gap-3">
                  {running ? (
                    <button
                      onClick={handleStop}
                      className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300"
                    >
                      停止
                    </button>
                  ) : (
                    <button
                      onClick={handleRegenerate}
                      className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300"
                    >
                      重新生成
                    </button>
                  )}
                  <button
                    onClick={() => void handleSave()}
                    disabled={running || !job.draft || saving}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all bg-primary text-white shadow-lg active:scale-[0.98] disabled:opacity-50"
                  >
                    {running ? '生成中…' : saving ? '保存中…' : '归档保存'}
                  </button>
                </div>
              )}
              {view === 'result' && !job && (
                <button onClick={() => setView('generate')} className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white shadow-lg active:scale-[0.98]">
                  生成新总结
                </button>
              )}

              {(view === 'archive' || view === 'view') && (
                <button onClick={() => setView(job ? 'result' : 'generate')} className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white shadow-lg active:scale-[0.98]">
                  {job ? (running ? '回到进行中的总结' : '回到草稿') : '生成新总结'}
                </button>
              )}
            </div>
          </motion.div>
          <AnimatePresence>
            {confirm === 'regen' && (
              <ConfirmLayer
                title="重新生成？"
                body="这份草稿还没归档，重新生成会把它丢掉。"
                confirmLabel="丢弃并重新生成"
                onCancel={() => setConfirm(null)}
                onConfirm={() => { setConfirm(null); discardSummaryJob(); setView('generate'); }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
    {stage && (
      <YearRecapStage
        open={stageOpen && isOpen}
        recap={stage.recap}
        presetName={stage.presetName}
        presetIcon={FAMILIAR_FACE_ICONS[stage.presetId]}
        userName={userName}
        letter={letterState}
        onOpenLetter={() => setStageOpen(false)}
        onClose={() => setStageOpen(false)}
      />
    )}
    </>,
    document.body,
  );
}
