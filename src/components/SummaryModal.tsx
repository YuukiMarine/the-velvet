import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, SummaryRequestData, toLocalDateKey } from '@/store';
import { PeriodSummary, SummaryPeriod } from '@/types';
import { v4 as uuidv4 } from 'uuid';

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
interface StreamingContentProps {
  streamedText: string;
  isStreaming: boolean;
  reqData: SummaryRequestData | null;
  /** 追问仅允许一次 */
  followUpUsed: boolean;
  onFollowUpUsed: () => void;
}

function StreamingContent({ streamedText, isStreaming, reqData, followUpUsed, onFollowUpUsed }: StreamingContentProps) {
  const [followInput, setFollowInput] = useState('');
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
  }, [streamedText, followAnswer]);

  const handleFollowUp = useCallback(async () => {
    if (!followInput.trim() || !reqData || followStreaming) return;
    setFollowError(null);
    setFollowStreaming(true);
    setFollowAnswer('');
    onFollowUpUsed();

    const abortCtrl = new AbortController();
    followAbortRef.current = abortCtrl;

    try {
      const messages = [
        ...reqData.messages,
        { role: 'assistant' as const, content: streamedText },
        { role: 'user' as const, content: followInput.trim() },
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
          max_tokens: 1000,
        }),
        signal: abortCtrl.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(`API 请求失败 (${resp.status}): ${errBody || resp.statusText}`);
      }

      let answer = '';
      for await (const chunk of readSSEStream(resp)) {
        answer += chunk;
        setFollowAnswer(answer);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setFollowError(e.message);
      }
    } finally {
      setFollowStreaming(false);
    }
  }, [followInput, reqData, streamedText, followStreaming, onFollowUpUsed]);

  return (
    <div ref={bodyRef} className="space-y-4">
      {/* 主总结内容 */}
      <div className="relative bg-black/3 dark:bg-white/3 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed overflow-hidden">
        <VelvetWatermark />
        <div className="relative" dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${renderMarkdown(streamedText)}</p>` }} />
        {isStreaming && <Cursor />}
      </div>

      {/* 追问区 — 流式完成后才显示，且只能用一次 */}
      {!isStreaming && streamedText && (
        <div className="space-y-3">
          {!followUpUsed && !followAnswer && (
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

          {/* 追问回答流式展示 */}
          {(followAnswer || followStreaming) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-bold text-primary uppercase tracking-wider">AI 回答</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">已使用追问机会</div>
              </div>
              <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                <div dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${renderMarkdown(followAnswer)}</p>` }} />
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

// ── VELVET ROOM 水印 ──────────────────────────────────────
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
        VELVET ROOM
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

// ── 主 SummaryModal ────────────────────────────────────────
interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPeriod?: SummaryPeriod;
}

type ModalView = 'generate' | 'result' | 'archive' | 'view';

export default function SummaryModal({ isOpen, onClose, defaultPeriod = 'week' }: SummaryModalProps) {
  const { settings, summaries, buildSummaryRequest, saveSummary, deleteSummary, loadSummaries, getActiveSummaryPreset } = useAppStore();

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
  const [followUpUsed, setFollowUpUsed] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<PeriodSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activePreset = getActiveSummaryPreset();
  const presets = settings.summaryPromptPresets ?? [];
  const noApiKey = !settings.summaryApiKey;

  useEffect(() => {
    if (isOpen) {
      loadSummaries();
      setView('generate');
      setStreamedText('');
      setGeneratedSummary(null);
      setError(null);
      setSaved(false);
      setFollowUpUsed(false);
      setIsAnnual(false);
    }
    return () => { abortRef.current?.abort(); };
  }, [isOpen]);

  const handleGenerate = async () => {
    setError(null);
    setStreamedText('');
    setGeneratedSummary(null);
    setSaved(false);
    setFollowUpUsed(false);
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
        setError(e.message);
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
      };
      setGeneratedSummary(summary);
    }
  };

  const handleSave = async () => {
    if (!generatedSummary) return;
    await saveSummary(generatedSummary);
    setSaved(true);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-black/5 dark:border-white/5">
              {(view === 'result' || view === 'view' || view === 'archive') && (
                <button
                  onClick={() => {
                    if (view === 'result') { abortRef.current?.abort(); setView('generate'); }
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
                <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-gray-400 text-lg">×</button>
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
                    <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">当前风格</div>
                    <div className="flex flex-wrap gap-2">
                      {(presets.length ? presets : [activePreset]).map(p => (
                        <div key={p.id} className={`text-xs px-3 py-1.5 rounded-xl font-semibold ${activePreset.id === p.id ? 'bg-primary text-white' : 'bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                          {p.name}{activePreset.id === p.id && ' ✓'}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">在设置中可切换或自定义风格</p>
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
                    followUpUsed={followUpUsed}
                    onFollowUpUsed={() => setFollowUpUsed(true)}
                  />
                </div>
              )}

              {/* ── 归档列表 ── */}
              {view === 'archive' && (
                <ArchiveList summaries={summaries} onSelect={s => { setSelectedSummary(s); setView('view'); }} onDelete={id => deleteSummary(id)} />
              )}

              {/* ── 单条查看 ── */}
              {view === 'view' && selectedSummary && (
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
                  <div className="relative bg-black/3 dark:bg-white/3 rounded-2xl p-4 text-sm text-gray-700 dark:text-gray-200 leading-relaxed overflow-hidden">
                    <VelvetWatermark />
                    <div className="relative" dangerouslySetInnerHTML={{ __html: `<p class="mb-2">${renderMarkdown(selectedSummary.content)}</p>` }} />
                  </div>
                </div>
              )}
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
                    onClick={() => { abortRef.current?.abort(); setView('generate'); setStreamedText(''); setGeneratedSummary(null); }}
                    disabled={isStreaming}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 disabled:opacity-50"
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
