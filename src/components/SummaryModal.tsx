import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, SummaryRequestData, toLocalDateKey, DEFAULT_SUMMARY_PROMPT_PRESETS, FAMILIAR_FACE_PRESETS } from '@/store';
import { PeriodSummary, PeriodSummaryFollowUp, SummaryPeriod } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import DOMPurify from 'dompurify';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';

// ── 简单 Markdown 渲染 ────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-4 mb-1 text-primary">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-extrabold mt-5 mb-2 text-primary">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-black mt-5 mb-2 text-primary">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>')
    .replace(/\n\n/g, '</p><p class="mb-2">')
    .replace(/\n/g, '<br/>');
}

// ── 错误信息格式化（识别 CORS / 网络类错误）────────────────
function formatApiError(e: unknown): string {
  if (!(e instanceof Error)) return '生成失败，请重试';
  // CORS 或网络中断时浏览器抛出 TypeError: Failed to fetch
  if (e instanceof TypeError && /failed to fetch|network/i.test(e.message)) {
    return '网络请求失败：无法连接到 API 服务。\n若在浏览器中使用，部分 API 可能因跨域（CORS）限制无法直接访问，建议在 Android 客户端或支持 CORS 的接口下使用此功能。';
  }
  return e.message;
}

// ── SSE 流式读取工具 ──────────────────────────────────────
async function* readSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta: string = json?.choices?.[0]?.delta?.content ?? '';
        if (delta) yield delta;
      } catch { /* malformed chunk, skip */ }
    }
  }
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
      {summaries.map(s => (
        <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="relative bg-black/5 dark:bg-white/5 rounded-2xl p-4 flex items-center gap-3 overflow-hidden">
          <VelvetWatermark />
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(s)}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${s.period === 'week' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300'}`}>
                {s.period === 'week' ? '周' : '月'}
              </span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{s.label}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>+{s.totalPoints} 点</span><span>{s.activityCount} 条记录</span>
              <span className="truncate">{s.promptPresetName}</span>
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
      ))}
    </div>
  );
}

// ── 流式内容展示 + 追问区 ──────────────────────────────────
//
// v2.1 重构要点：
//   1. 接受 initialFollowUp（来自归档），如果存在就直接渲染问答只读形态
//   2. 没有 initialFollowUp 但有 reqData → 允许新发起一次追问
//   3. 追问完成时把 (q, a) 通过 onFollowUpComplete 抛给父组件，父组件负责持久化到 summary 上
//   4. max_tokens 从 1000 提到 2400，避免长追问中段截断
//   5. 没有 reqData 也没有 initialFollowUp（老归档无 reqContext）→ 显示一行说明，按钮置灰
interface StreamingContentProps {
  streamedText: string;
  isStreaming: boolean;
  reqData: SummaryRequestData | null;
  /** 已存在的追问问答（来自归档）。提供时显示只读问答；不再允许新发起。 */
  initialFollowUp?: PeriodSummaryFollowUp;
  /** 追问完成（流式结束 + 文本非空）后回调，父组件用来落库 */
  onFollowUpComplete?: (followUp: PeriodSummaryFollowUp) => void;
}

function StreamingContent({ streamedText, isStreaming, reqData, initialFollowUp, onFollowUpComplete }: StreamingContentProps) {
  const [followInput, setFollowInput] = useState('');
  const [followQuestion, setFollowQuestion] = useState('');
  const [followAnswer, setFollowAnswer] = useState('');
  const [followStreaming, setFollowStreaming] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const followAbortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [streamedText, followAnswer, initialFollowUp]);

  // 切换归档条目时（initialFollowUp 切换）重置本地草稿
  useEffect(() => {
    setFollowInput('');
    setFollowQuestion('');
    setFollowAnswer('');
    setFollowError(null);
    setFollowStreaming(false);
  }, [initialFollowUp?.createdAt]);

  // 一旦有"已落库"的追问，把它视为终点态：不允许再追问
  const lockedByExistingFollowUp = !!initialFollowUp;
  const lockedByMissingContext = !reqData; // 没原始上下文（老归档）→ 无法重组 prompt
  // 新 followAnswer 落库后也锁住（防止用户连点）
  const lockedByJustAsked = !!followAnswer && !followStreaming;
  const inputLocked = lockedByExistingFollowUp || lockedByMissingContext || lockedByJustAsked;

  const handleFollowUp = useCallback(async () => {
    const q = followInput.trim();
    if (!q || !reqData || followStreaming) return;
    setFollowError(null);
    setFollowStreaming(true);
    setFollowAnswer('');
    setFollowQuestion(q);

    const abortCtrl = new AbortController();
    followAbortRef.current = abortCtrl;

    let answer = '';
    try {
      const messages = [
        ...reqData.messages,
        { role: 'assistant' as const, content: streamedText },
        { role: 'user' as const, content: q },
      ];

      const resp = await fetch(`${reqData.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${reqData.apiKey}`,
        },
        body: JSON.stringify({
          model: reqData.model,
          messages,
          stream: true,
          temperature: 0.7,
          // v2.1：1000 → 2400，避免追问中长答案被截
          max_tokens: 2400,
        }),
        signal: abortCtrl.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(`API 请求失败 (${resp.status}): ${errBody || resp.statusText}`);
      }

      for await (const chunk of readSSEStream(resp)) {
        answer += chunk;
        setFollowAnswer(answer);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setFollowError(formatApiError(e));
      }
    } finally {
      setFollowStreaming(false);
    }

    // 流式正常结束 + 有内容 → 抛给父组件落库
    if (answer.trim() && onFollowUpComplete) {
      onFollowUpComplete({
        question: q,
        answer,
        createdAt: new Date(),
      });
    }
  }, [followInput, reqData, streamedText, followStreaming, onFollowUpComplete]);

  // ── 决定显示哪份 Q&A：归档已存在的优先；否则用当下流式的 ─────
  const displayedQuestion = initialFollowUp?.question ?? followQuestion;
  const displayedAnswer   = initialFollowUp?.answer   ?? followAnswer;
  const showQAArea = displayedAnswer || followStreaming;

  return (
    <div ref={bodyRef} className="space-y-4">
      {/* 主总结内容 */}
      <div className="relative bg-black/3 dark:bg-white/3 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed overflow-hidden">
        <VelvetWatermark />
        <div className="relative" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(streamedText)}</p>`) }} />
        {isStreaming && <Cursor />}
      </div>

      {/* 追问区 — 流式完成后才显示 */}
      {!isStreaming && streamedText && (
        <div className="space-y-3">
          {!showQAArea && !inputLocked && (
            <div>
              <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
                还有疑问？向 AI 追问一次
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={followInput}
                  onChange={e => setFollowInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !followStreaming && handleFollowUp()}
                  placeholder="例如：如何具体提升知识属性？"
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl dark:bg-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary"
                />
                <button
                  onClick={handleFollowUp}
                  disabled={!followInput.trim() || followStreaming}
                  className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-40 transition-all"
                >
                  发送
                </button>
              </div>
            </div>
          )}

          {/* 老归档没存原始 prompt 上下文 → 给个友好说明，不画半灰按钮 */}
          {!showQAArea && lockedByMissingContext && !lockedByExistingFollowUp && (
            <div className="text-[11px] text-gray-400 dark:text-gray-500 bg-black/3 dark:bg-white/3 rounded-xl px-3 py-2 leading-relaxed">
              这条归档生成于较早版本，没有保留追问所需的上下文，无法在此追问。
              在「生成总结 → 归档保存」的新流程下，归档后仍可继续追问一次。
            </div>
          )}

          {/* 追问问答展示（归档已落库的 / 当下流式的 共用） */}
          {showQAArea && (
            <div className="space-y-2">
              {displayedQuestion && (
                <div className="text-sm text-gray-700 dark:text-gray-200 bg-black/3 dark:bg-white/5 rounded-2xl px-3 py-2">
                  <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1.5">追问</span>
                  {displayedQuestion}
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="text-xs font-bold text-primary uppercase tracking-wider">AI 回答</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">已使用追问机会</div>
              </div>
              <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(displayedAnswer)}</p>`) }} />
                {followStreaming && <Cursor />}
              </div>
            </div>
          )}

          {followError && (
            <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">{followError}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 流式期间的主题色粒子 ──────────────────────────────────
function StreamingParticles() {
  const particles = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    leftPct: Math.random() * 100,
    size: 2 + Math.random() * 3,
    duration: 6 + Math.random() * 5,
    delay: Math.random() * 6,
    opacity: 0.22 + Math.random() * 0.28,
  }));
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
            y: [0, -400 - Math.random() * 200],
            opacity: [0, p.opacity, p.opacity, 0],
            x: [0, (Math.random() - 0.5) * 40],
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

// ── 退出确认弹层 ─────────────────────────────────────────
function ExitConfirm({ kind, onCancel, onDiscard, onSave }: {
  kind: 'streaming' | 'save';
  onCancel: () => void;
  onDiscard: () => void;
  onSave?: () => void;
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
        <h3 className="text-base font-black text-gray-900 dark:text-white mb-1.5">
          {kind === 'streaming' ? '摘要尚未生成完毕' : '保存本次摘要？'}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
          {kind === 'streaming'
            ? '现在退出将中断生成并丢弃目前的内容。'
            : '本次已生成的摘要尚未归档，是否保存到档案？'}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-black/5 dark:bg-white/10 text-gray-700 dark:text-gray-200"
          >
            {kind === 'streaming' ? '继续生成' : '取消'}
          </button>
          {kind === 'streaming' ? (
            <button
              onClick={onDiscard}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white"
            >
              中断并退出
            </button>
          ) : (
            <>
              <button
                onClick={onDiscard}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
              >
                不保存
              </button>
              {onSave && (
                <button
                  onClick={onSave}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-primary text-white"
                >
                  保存
                </button>
              )}
            </>
          )}
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

// ── 年度总结卡片（仅 12月31日 显示）─────────────────────
function isDecember31() {
  const now = new Date();
  return now.getMonth() === 11 && now.getDate() === 31;
}

function getYearRange() {
  const year = new Date().getFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

// ── 风格快速切换器 ────────────────────────────────────────

interface StyleQuickSwitcherProps {
  activeId: string;
  onPick: (id: string) => void;
  customPresets: Array<{ id: string; name: string; isBuiltin?: boolean }>;
}

/**
 * 横向滚动的风格选择条：
 *  - 上方 4 位"熟悉的人"（快捷 icon）
 *  - 下方其他内置 / 自定义风格的 chip 列表
 */
function StyleQuickSwitcher({ activeId, onPick, customPresets }: StyleQuickSwitcherProps) {
  const familiars: Array<{ id: string; icon: string; name: string }> = [
    { id: 'elizabeth', icon: '🦋', name: '蓝蝶' },
    { id: 'theodore', icon: '🌿', name: '青侍' },
    { id: 'margaret', icon: '📖', name: '典藏' },
    { id: 'caroline-justine', icon: '⚔️', name: '双子审官' },
  ];
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

  // 所有条目都用统一的 chip pill 样式，保持视觉同级
  const renderChip = (id: string, label: string) => {
    const active = activeId === id;
    return (
      <button
        key={id}
        onClick={() => onPick(id)}
        className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
          active
            ? 'bg-primary text-white shadow-sm'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        {label}{active ? ' ✓' : ''}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      {/* 熟悉的人（保留 icon 用作区分） */}
      <div className="flex flex-wrap gap-1.5">
        {familiars.map(f => renderChip(f.id, `${f.icon} ${f.name}`))}
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
}

type ModalView = 'generate' | 'result' | 'archive' | 'view';

export default function SummaryModal({ isOpen, onClose, defaultPeriod = 'week' }: SummaryModalProps) {
  const { settings, summaries, buildSummaryRequest, saveSummary, deleteSummary, loadSummaries, getActiveSummaryPreset, updateSettings } = useAppStore();
  // ESC / Android back：
  //   - 如果已经在"是否丢弃 / 是否归档"确认态（exitConfirm != null）→ 等同于点 Cancel，关掉确认
  //   - 否则走 tryExit('close')：流式中 / 未保存会自动弹出对应确认，和点 X 一致
  const dialogRef = useModalA11y(isOpen, () => {
    if (exitConfirm) setExitConfirm(null);
    else tryExit('close');
  });
  useBackHandler(isOpen, () => {
    if (exitConfirm) setExitConfirm(null);
    else tryExit('close');
  });

  const [view, setView] = useState<ModalView>('generate');
  const [periodState, setPeriodState] = useState<{ period: SummaryPeriod; startDate: string; endDate: string }>(() =>
    defaultPeriod === 'month' ? { period: 'month', ...getMonthRange(0) } : { period: 'week', ...getWeekRange(0) }
  );
  const [isAnnual, setIsAnnual] = useState(false);
  const showAnnualCard = isDecember31();

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [reqData, setReqData] = useState<SummaryRequestData | null>(null);
  const [generatedSummary, setGeneratedSummary] = useState<PeriodSummary | null>(null);
  // v2.1：本轮追问 Q&A —— 在 'result' 模式下用于一会儿存进归档；'view' 模式下也共用同一变量，
  // 用户在归档详情里再次追问时立刻持久化到选中的 summary。
  const [pendingFollowUp, setPendingFollowUp] = useState<PeriodSummaryFollowUp | null>(null);
  const [selectedSummary, setSelectedSummary] = useState<PeriodSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [exitConfirm, setExitConfirm] = useState<'streaming' | 'save' | null>(null);
  const [exitAction, setExitAction] = useState<'close' | 'back'>('close');
  const abortRef = useRef<AbortController | null>(null);

  // activePreset 仅为便利值——切换 UI 已使用 settings.summaryActivePresetId 直接控制
  void getActiveSummaryPreset;

  const noApiKey = !settings.summaryApiKey;

  useEffect(() => {
    if (isOpen) {
      loadSummaries();
      setView('generate');
      setStreamedText('');
      setGeneratedSummary(null);
      setError(null);
      setSaved(false);
      setPendingFollowUp(null);
      setIsAnnual(false);
      setExitConfirm(null);
    }
    return () => { abortRef.current?.abort(); };
  }, [isOpen]);

  const handleGenerate = async () => {
    setError(null);
    setStreamedText('');
    setGeneratedSummary(null);
    setSaved(false);
    setPendingFollowUp(null);
    setIsGenerating(true);

    let req: SummaryRequestData;
    try {
      req = await buildSummaryRequest(periodState.period, periodState.startDate, periodState.endDate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '生成失败，请重试');
      setIsGenerating(false);
      return;
    }

    // 年度总结：覆盖标签并在用户消息末尾注入年终祝辞
    if (isAnnual) {
      const year = new Date().getFullYear();
      req = {
        ...req,
        period: 'month',
        periodLabel: `${year}年度总结`,
        messages: req.messages.map((m, i) => {
          if (i !== 1) return m;
          return {
            ...m,
            content: m.content.replace(
              /^本期（[^，]+，/,
              `本期（${year}年度总结，`
            ) + `\n\n这是一整年的年度盘点，请以成功的更生（成功的转变与新生）为主题，给予热情洋溢的年终祝词。以"您已然是最棁的客人，让我们来年继续努力"作为结语。`,
          };
        }),
      };
    }

    setReqData(req);
    setIsGenerating(false);
    setIsStreaming(true);
    setView('result');

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    let fullText = '';
    try {
      const resp = await fetch(`${req.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${req.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: true,
          temperature: 0.8,
          max_tokens: 2000,
        }),
        signal: abortCtrl.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(`API 请求失败 (${resp.status}): ${errBody || resp.statusText}`);
      }

      for await (const chunk of readSSEStream(resp)) {
        fullText += chunk;
        setStreamedText(fullText);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setError(formatApiError(e));
        setView('generate');
      }
    } finally {
      setIsStreaming(false);
    }

    if (fullText) {
      const summary: PeriodSummary = {
        id: uuidv4(),
        period: req.period,
        startDate: req.startDate,
        endDate: req.endDate,
        label: req.periodLabel,
        content: fullText,
        promptPresetId: req.preset.id,
        promptPresetName: req.preset.name,
        totalPoints: req.totalPoints,
        attributePoints: req.attributePoints,
        activityCount: req.activityCount,
        createdAt: new Date(),
        // v2.1：把追问需要的最小上下文一并存下
        // （不带 apiKey —— 重组追问时由当下 settings.summaryApiKey 注入）
        reqContext: {
          baseUrl: req.baseUrl,
          model: req.model,
          messages: req.messages,
        },
      };
      setGeneratedSummary(summary);
    }
  };

   const handleSave = async () => {
     if (!generatedSummary) return;
     // 把"还在内存里"的追问 Q&A 一并保存（如果用户在 result 视图里追问过的话）
     const toSave: PeriodSummary = pendingFollowUp
       ? { ...generatedSummary, followUp: pendingFollowUp }
       : generatedSummary;
     await saveSummary(toSave);
     setSaved(true);
   };

   /**
    * 归档视图里完成一次追问 → 立刻把 followUp 写回该 summary。
    * 与 'result' 视图区分点：这里 selectedSummary 已经在 db.summaries 里，直接 put 覆盖。
    */
   const handleArchivedFollowUpSaved = async (followUp: PeriodSummaryFollowUp) => {
     if (!selectedSummary) return;
     setPendingFollowUp(followUp);
     const updated: PeriodSummary = { ...selectedSummary, followUp };
     await saveSummary(updated);
     setSelectedSummary(updated);
   };

   // 离场目标：执行「真正退出」的动作（关闭 modal 或回到 generate 视图）
   const performExit = (action: 'close' | 'back') => {
     abortRef.current?.abort();
     setIsStreaming(false);
     if (action === 'close') {
       onClose();
     } else {
       setView('generate');
       setStreamedText('');
       setGeneratedSummary(null);
       setSaved(false);
       setPendingFollowUp(null);
     }
   };

   // 关闭逻辑 / 左侧返回统一入口：流式中 / 已生成未保存 → 弹确认
   const tryExit = (action: 'close' | 'back') => {
     setExitAction(action);
     if (isStreaming) {
       setExitConfirm('streaming');
       return;
     }
     if (generatedSummary && !saved) {
       setExitConfirm('save');
       return;
     }
     performExit(action);
   };

   const handleClose = () => tryExit('close');
   const handleBackFromResult = () => tryExit('back');

   const handleExitStreamingDiscard = () => {
     setExitConfirm(null);
     performExit(exitAction);
   };

   const handleExitSaveThenProceed = async () => {
     if (generatedSummary && !saved) {
       await saveSummary(generatedSummary);
     }
     setExitConfirm(null);
     performExit(exitAction);
   };

   const handleExitDiscardSave = () => {
     setExitConfirm(null);
     performExit(exitAction);
   };

   return (
     <AnimatePresence>
       {isOpen && (
         <motion.div
           initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
           className="fixed inset-0 z-50 flex items-end justify-center"
           onClick={handleClose}
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
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh' }}
          >
            {/* 流式期间的主题色粒子 */}
            {view === 'result' && isStreaming && <StreamingParticles />}
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-black/5 dark:border-white/5">
              {(view === 'result' || view === 'view' || view === 'archive') && (
                <button
                  onClick={() => {
                    if (view === 'result') handleBackFromResult();
                    else if (view === 'view') setView('archive');
                    else setView('generate');
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 mr-1 text-lg"
                >‹</button>
              )}
              <div className="flex-1">
                <h2 className="text-base font-black text-gray-900 dark:text-white">
                  {view === 'generate' && '生成成长总结'}
                  {view === 'result' && (isStreaming ? '✨ AI 正在书写…' : '总结预览')}
                  {view === 'archive' && '历史总结归档'}
                  {view === 'view' && (selectedSummary?.label ?? '总结详情')}
                </h2>
                {view === 'generate' && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">由 AI 分析你的成长记录，实时生成总结与建议</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {view === 'generate' && (
                  <button onClick={() => setView('archive')} className="text-xs text-primary font-semibold px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">归档</button>
                )}
                 <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-gray-400 text-lg">×</button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

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
                  {/* 年度总结卡（仅 12/31 显示）*/}
                  {showAnnualCard && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => {
                        const yr = getYearRange();
                        setIsAnnual(true);
                        setPeriodState({ period: 'month', ...yr });
                      }}
                      className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                        isAnnual
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">🦋</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-gray-800 dark:text-white">
                              {new Date().getFullYear()}年 年度总结
                            </span>
                            {isAnnual && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-white font-bold">已选</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            成功的更生 — 回顾这一年全部成长历程
                          </div>
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
                    </p>
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
                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 rounded-2xl p-3">
                      <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                    </div>
                  )}
                </div>
              )}

              {/* ── 结果视图（流式 + 追问）── */}
              {view === 'result' && (
                <div className="space-y-4">
                  {/* 统计数据 */}
                  {reqData && (
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '总加点', value: `+${reqData.totalPoints}` },
                        { label: '记录数', value: `${reqData.activityCount}` },
                        { label: '风格', value: reqData.preset.name },
                      ].map(item => (
                        <div key={item.label} className="bg-black/5 dark:bg-white/5 rounded-2xl p-3 text-center">
                          <div className="text-xs text-gray-400 dark:text-gray-500">{item.label}</div>
                          <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate mt-0.5">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <StreamingContent
                    streamedText={streamedText}
                    isStreaming={isStreaming}
                    reqData={reqData}
                    initialFollowUp={pendingFollowUp ?? undefined}
                    onFollowUpComplete={(fu) => setPendingFollowUp(fu)}
                  />
                </div>
              )}

              {/* ── 归档列表 ── */}
              {view === 'archive' && (
                <ArchiveList summaries={summaries} onSelect={s => { setSelectedSummary(s); setPendingFollowUp(null); setView('view'); }} onDelete={id => deleteSummary(id)} />
              )}

              {/* ── 单条查看 ── */}
              {view === 'view' && selectedSummary && (() => {
                // 复活原始 prompt 上下文：归档里只存了 baseUrl/model/messages（无 apiKey），
                // 这里把当下 settings.summaryApiKey 注入回去；如果用户 / 项目当前没配 key，
                // 重新追问会被 fetch 401 挡掉，对应 UI 直接退化为只读展示。
                const archivedReqData: SummaryRequestData | null = selectedSummary.reqContext && settings.summaryApiKey
                  ? {
                      baseUrl: selectedSummary.reqContext.baseUrl,
                      model: selectedSummary.reqContext.model,
                      apiKey: settings.summaryApiKey,
                      messages: selectedSummary.reqContext.messages,
                      // 下面这些字段 StreamingContent 不读，只是为了类型完整
                      periodLabel: selectedSummary.label,
                      preset: { id: selectedSummary.promptPresetId, name: selectedSummary.promptPresetName, systemPrompt: '', isBuiltin: true },
                      totalPoints: selectedSummary.totalPoints,
                      attributePoints: selectedSummary.attributePoints,
                      activityCount: selectedSummary.activityCount,
                      period: selectedSummary.period,
                      startDate: selectedSummary.startDate,
                      endDate: selectedSummary.endDate,
                    }
                  : null;
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: '总加点', value: `+${selectedSummary.totalPoints}` },
                        { label: '记录数', value: `${selectedSummary.activityCount}` },
                        { label: '风格', value: selectedSummary.promptPresetName },
                      ].map(item => (
                        <div key={item.label} className="bg-black/5 dark:bg-white/5 rounded-2xl p-3 text-center">
                          <div className="text-xs text-gray-400 dark:text-gray-500">{item.label}</div>
                          <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate mt-0.5">{item.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      {selectedSummary.startDate} ~ {selectedSummary.endDate} · 生成于 {new Date(selectedSummary.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                    {/* 用同一个 StreamingContent 复用追问能力：
                        - 已落库 followUp → 只读展示
                        - 没 followUp + 有 reqContext → 显示输入框，发送后立即落库 */}
                    <StreamingContent
                      streamedText={selectedSummary.content}
                      isStreaming={false}
                      reqData={archivedReqData}
                      initialFollowUp={selectedSummary.followUp}
                      onFollowUpComplete={handleArchivedFollowUpSaved}
                    />
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-black/5 dark:border-white/5">
              {view === 'generate' && (
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || noApiKey}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${isGenerating || noApiKey ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-primary text-white shadow-lg active:scale-98'}`}
                >
                  {isGenerating
                    ? <span className="flex items-center justify-center gap-2"><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="inline-block">◌</motion.span>准备中…</span>
                     : '🦋 生成总结'}
                </button>
              )}

              {view === 'result' && (
                <div className="flex gap-3">
                  <button
                    onClick={handleBackFromResult}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300"
                  >
                    {isStreaming ? '停止' : '重新生成'}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isStreaming || !generatedSummary || saved}
                    className={`flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all ${saved ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-primary text-white shadow-lg active:scale-98 disabled:opacity-50'}`}
                  >
                    {saved ? '✓ 已归档' : isStreaming ? '生成中…' : '归档保存'}
                  </button>
                </div>
              )}

              {(view === 'archive' || view === 'view') && (
                <button onClick={() => setView('generate')} className="w-full py-3.5 rounded-2xl font-bold text-sm bg-primary text-white shadow-lg active:scale-98">
                  生成新总结
                </button>
              )}
            </div>
          </motion.div>
          <AnimatePresence>
            {exitConfirm === 'streaming' && (
              <ExitConfirm
                kind="streaming"
                onCancel={() => setExitConfirm(null)}
                onDiscard={handleExitStreamingDiscard}
              />
            )}
            {exitConfirm === 'save' && (
              <ExitConfirm
                kind="save"
                onCancel={() => setExitConfirm(null)}
                onDiscard={handleExitDiscardSave}
                onSave={handleExitSaveThenProceed}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
