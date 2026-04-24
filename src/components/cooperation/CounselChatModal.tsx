/**
 * 谏言聊天弹窗：即时通讯样式的 UI
 * - 流式 AI 回复，支持"打断输出"
 * - @同伴 chip 选择器
 * - 1 小时倒计时；过期自动清空消息
 * - 支持"归档"（生成 ≤100 字摘要入库）
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import { TAROT_BY_ID } from '@/constants/tarot';
import { streamCounselReply } from '@/utils/counselAI';
import { useBackHandler } from '@/utils/useBackHandler';
import type { CounselMessage, Confidant } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 快捷入口：从同伴详情页进入，会自动 @ 这位同伴 */
  initialMentionId?: string;
}

/** 可被 AbortSignal 打断的定时器，用于"段落间停顿一秒" */
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

export function CounselChatModal({ isOpen, onClose, initialMentionId }: Props) {
  const {
    settings,
    counselSession,
    confidants,
    startCounselSession,
    appendCounselMessage,
    archiveCounselSession,
    expireCounselIfNeeded,
    buildCounselContext,
    getCounselCooldown,
    hasActiveCounsel,
  } = useAppStore();
  const hasApiKey = Boolean(settings.summaryApiKey?.trim());
  const [lastConnectError, setLastConnectError] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) setLastConnectError(null);
  }, [isOpen]);

  // 倒计时
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => {
      setNow(Date.now());
      expireCounselIfNeeded();
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, expireCounselIfNeeded]);

  // 注意：不再在打开弹窗时自动 startCounselSession。
  //   现在窗口与冷却都从用户点击"开始对话"那一刻才开始，
  //   点击前随时可关闭、下次再来，不会消耗任何配额。
  const cooldown = getCounselCooldown();

  // 输入与 @ 选择
  const [input, setInput] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<string[]>(() =>
    initialMentionId ? [initialMentionId] : []
  );
  useEffect(() => {
    if (isOpen && initialMentionId) setSelectedMentions([initialMentionId]);
    if (!isOpen) {
      setSelectedMentions([]);
      setInput('');
    }
  }, [isOpen, initialMentionId]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 流式状态
  const [streamText, setStreamText] = useState('');
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 滚动
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [counselSession?.messages.length, streamText]);

  // 归档
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // 退出弹窗：暂离 / 结束对话
  const [exitOpen, setExitOpen] = useState(false);

  const activeConfidants = useMemo(
    () => confidants.filter(c => !c.archivedAt),
    [confidants]
  );

  const confidantById = useCallback(
    (id: string) => activeConfidants.find(c => c.id === id),
    [activeConfidants]
  );

  /**
   * 10 回合 @ 冷却：
   * 一个同伴被 @ 后的 10 个用户回合内，其档案仍被注入进 prompt；到期后自动掉出上下文。
   * 用"描边"可视化这个状态——用户能看出"Ta 已经在上下文里了，不必重复 @"。
   */
  const currentUserTurn = useMemo(
    () => counselSession?.messages.filter(m => m.role === 'user').length ?? 0,
    [counselSession?.messages],
  );
  const isMentionActive = useCallback(
    (id: string): boolean => {
      const lt = counselSession?.mentionLastTurn?.[id];
      if (typeof lt !== 'number') return false;
      return currentUserTurn - lt < 10;
    },
    [counselSession?.mentionLastTurn, currentUserTurn],
  );

  const remainMs = counselSession && !counselSession.expired
    ? Math.max(0, new Date(counselSession.expiresAt).getTime() - now)
    : 0;
  const remainMin = Math.floor(remainMs / 60000);
  const remainSec = Math.floor((remainMs % 60000) / 1000);
  const timerText = `${String(remainMin).padStart(2, '0')}:${String(remainSec).padStart(2, '0')}`;

  const sessionExpired = counselSession?.expired
    || (counselSession && Date.now() > new Date(counselSession.expiresAt).getTime());

  /**
   * 启动一次 AI 回复流（共用：发送消息后 / 开场"开始对话"点击）。
   *
   * 分段气泡：每遇到 。！？?!\n 就把已到的一段作为独立的 assistant 消息落到 session 里，
   * 之后停顿 1 秒再进入下一段——以模拟即时通讯的真实节奏。
   * Abort 会中断停顿或流读取；若仍有未落屏的片段，会被标记 interrupted 保存。
   */
  const runAssistantStream = async (opts: { greeting?: boolean } = {}) => {
    const streamId = uuidv4();
    setStreamingMsgId(streamId);
    setStreamText('');
    const ac = new AbortController();
    abortRef.current = ac;

    const BREAK_RE = /[。！？?!\n]/;
    const PAUSE_MS = 1000;

    /** 把一段话作为独立 assistant 气泡落库。返回是否真的存了（空白段被跳过，用于决定要不要停顿） */
    const flushSegment = async (content: string, interrupted: boolean): Promise<boolean> => {
      const trimmed = content.replace(/^\s+|\s+$/g, '');
      if (!trimmed) return false;
      const msg: CounselMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: trimmed,
        timestamp: new Date(),
        interrupted,
      };
      try {
        await appendCounselMessage(msg);
        return true;
      } catch (err) {
        console.warn('append assistant msg failed:', err);
        return false;
      }
    };

    const ctx = buildCounselContext();
    let pending = '';
    let producedAny = false;
    let errored = false;
    let fellBackDueToError = false;

    try {
      for await (const chunk of streamCounselReply(ctx, ac.signal, {
        ...opts,
        onFallback: (reason, err) => {
          if (reason === 'connect-error') {
            fellBackDueToError = true;
            setLastConnectError(err?.message || '无法连接到 AI 服务');
          }
        },
      })) {
        for (const ch of chunk) {
          pending += ch;
          setStreamText(pending);
          if (BREAK_RE.test(ch)) {
            // 断句 → 把当前段作为独立气泡落库，清空 streamText 并停顿 1 秒
            const seg = pending;
            pending = '';
            setStreamText('');
            const saved = await flushSegment(seg, false);
            if (saved) {
              producedAny = true;
              await sleepWithAbort(PAUSE_MS, ac.signal);
            }
            // 纯空白分段（例如连续 \n）不触发停顿，保持节奏自然
          }
        }
      }
      // 末尾尾段（没有断句符收尾）
      if (pending) {
        const seg = pending;
        pending = '';
        setStreamText('');
        const saved = await flushSegment(seg, false);
        if (saved) producedAny = true;
      }
      if (!fellBackDueToError && hasApiKey) {
        setLastConnectError(null);
      }
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (!aborted) {
        console.warn('stream error:', err);
        errored = true;
        setLastConnectError(err instanceof Error ? err.message : '未知错误');
      }
      // 若中断 / 出错时还有未落屏的片段：标记 interrupted 后作为一个气泡保存
      if (pending) {
        const seg = pending;
        pending = '';
        setStreamText('');
        const saved = await flushSegment(seg, aborted);
        if (saved) producedAny = true;
      } else if (errored && !producedAny) {
        // 完全没产出且出错 → 给一个占位提示
        await flushSegment('（回复失败，请稍后再试）', false);
      }
    }

    setStreamingMsgId(null);
    setStreamText('');
    abortRef.current = null;
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!counselSession || sessionExpired) return;
    setInput('');
    setSending(true);

    const msgMentions = [...selectedMentions];
    const userMsg: CounselMessage = {
      id: uuidv4(),
      role: 'user',
      content: text,
      timestamp: new Date(),
      mentions: msgMentions.length ? msgMentions : undefined,
    };
    try {
      await appendCounselMessage(userMsg);
    } catch (err) {
      setSending(false);
      return;
    }
    setSelectedMentions([]);
    await runAssistantStream();
    setSending(false);
  };

  /**
   * "开始对话"：直到点这一下才正式创建 session、设置 lastCounselStartedAt，
   * 倒计时与三天冷却都从这一刻起算。然后让残响先开口。
   */
  const handleStart = async () => {
    if (sending) return;
    if (cooldown.locked && !hasActiveCounsel()) return;
    setSending(true);
    try {
      // 需要创建新 session（开场时几乎总是这个分支）
      if (!counselSession || counselSession.expired) {
        const ids = [...selectedMentions];
        try {
          await startCounselSession(ids);
        } catch (err) {
          console.error('startCounselSession failed:', err);
          if (err instanceof Error) setLastConnectError(err.message);
          return;
        }
      }
      await runAssistantStream({ greeting: true });
    } finally {
      setSending(false);
    }
  };

  const handleInterrupt = () => {
    abortRef.current?.abort();
  };

  /** 退出选择：暂离（保留会话）/ 结束对话（若有内容则生成归档） */
  const requestExit = () => {
    if (sending) return;
    // 没开始的对话（messages=0）直接关闭
    if (!counselSession || counselSession.messages.length === 0) {
      onClose();
      return;
    }
    setExitOpen(true);
  };

  // Android 返回键：严格对齐左上角"暂离"按钮的行为 —— 优先关掉嵌套面板
  //   - pickerOpen（@选人）→ 关
  //   - archiveConfirm 确认态 → 关
  //   - exitOpen 确认态 → 关
  //   - 其他 → 走 requestExit（sending 自动 no-op；无消息直接 onClose；有消息弹退出选择）
  useBackHandler(isOpen, () => {
    if (pickerOpen) { setPickerOpen(false); return; }
    if (archiveConfirm) { setArchiveConfirm(false); return; }
    if (exitOpen) { setExitOpen(false); return; }
    requestExit();
  });
  const handleExitStay = () => {
    setExitOpen(false);
    onClose();
  };
  const handleExitEnd = async () => {
    if (!counselSession) {
      setExitOpen(false);
      onClose();
      return;
    }
    setArchiving(true);
    try {
      await archiveCounselSession();
    } catch (err) {
      console.error('archive failed:', err);
    } finally {
      setArchiving(false);
      setExitOpen(false);
      onClose();
    }
  };

  const handleArchive = async () => {
    if (!counselSession || counselSession.messages.length === 0) {
      setArchiveConfirm(false);
      return;
    }
    setArchiving(true);
    try {
      await archiveCounselSession();
      setArchiveConfirm(false);
      onClose();
    } catch (err) {
      console.error('archive failed:', err);
    } finally {
      setArchiving(false);
    }
  };

  const toggleMention = (id: string) => {
    setSelectedMentions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="counsel-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm"
        onClick={requestExit}
      />
      <motion.div
        key="counsel-modal"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        className="fixed inset-0 z-[201] flex items-center justify-center p-0 md:p-4 pointer-events-none"
      >
        <div
          className="relative w-full h-full md:h-[88vh] md:max-w-lg md:rounded-3xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-4 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.04))',
            }}
          >
            <button
              onClick={requestExit}
              disabled={sending}
              className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center disabled:opacity-40"
              aria-label="关闭"
            >←</button>
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span style={{ color: '#6366f1' }}>✧</span>
                谏言
              </h3>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                房间的尽头，有人一直注视着你
              </div>
            </div>
            {!sessionExpired && counselSession && (
              <div className="text-right">
                <div className="text-[10px] text-gray-400 dark:text-gray-500">窗口剩余</div>
                <div
                  className={`text-sm font-mono font-bold tabular-nums ${
                    remainMs < 5 * 60 * 1000 ? 'text-rose-500' : 'text-indigo-500'
                  }`}
                >
                  {timerText}
                </div>
              </div>
            )}
          </div>

          {/* 顶部提示：未配置 API 密钥 / 上次连接失败 */}
          {!hasApiKey ? (
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
              <span className="text-sm leading-none pt-0.5">⚠</span>
              <div className="flex-1 min-w-0 leading-relaxed">
                <span className="font-semibold">尚未配置 AI 密钥。</span>
                <span className="opacity-85"> 现在使用的是简版离线回复；到「设置 → AI 总结」填入密钥后，残响才会真正用心听你说。</span>
              </div>
            </div>
          ) : lastConnectError ? (
            <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/30 text-[11px] text-rose-600 dark:text-rose-400 flex items-start gap-2">
              <span className="text-sm leading-none pt-0.5">⚠</span>
              <div className="flex-1 min-w-0 leading-relaxed">
                <span className="font-semibold">无法连接到 AI 服务。</span>
                <span className="opacity-85"> 刚才这次临时退回了离线回复。网络恢复后再发一条试试。</span>
                <div className="mt-0.5 text-[10px] opacity-70 truncate">{lastConnectError}</div>
              </div>
              <button
                onClick={() => setLastConnectError(null)}
                className="text-rose-400 hover:text-rose-600 px-1 text-xs flex-shrink-0"
                aria-label="关闭提示"
              >
                ✕
              </button>
            </div>
          ) : null}

          {/* 内容区 */}
          {cooldown.locked && !hasActiveCounsel() ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <div className="text-6xl opacity-30 mb-4">✧</div>
              <h4 className="text-lg font-bold text-gray-800 dark:text-gray-100">谏言冷却中</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-xs leading-relaxed">
                每 3 天一次，留出余地给沉淀。<br />
                下一次可在 <b>{cooldown.nextAvailableDate}</b> 开启（还有 {cooldown.daysLeft} 天）。
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                先回到房间
              </button>
            </div>
          ) : sessionExpired ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <div className="text-6xl opacity-30 mb-4">✧</div>
              <h4 className="text-lg font-bold text-gray-800 dark:text-gray-100">这次谈话已经过去了</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-xs leading-relaxed">
                一小时的窗口已经合上，聊天记录随之散去。
                <br />这次的冷却会到 <b>{cooldown.nextAvailableDate ?? '—'}</b>，之后再来找残响。
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                离开
              </button>
            </div>
          ) : (
            <>
              {/* 消息列表 */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-white to-gray-50/60 dark:from-gray-900 dark:to-gray-900/60"
              >
                {(counselSession?.messages.length ?? 0) === 0 && !streamingMsgId && (
                  <div className="flex flex-col items-center justify-center py-16 text-center min-h-[300px]">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1, duration: 0.35 }}
                      className="text-5xl opacity-30 mb-5"
                    >
                      ✧
                    </motion.div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-6">
                      房间的尽头，有人一直注视着你——
                      <br />准备好了就按下去，Ta 会先开口。
                    </p>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.02 }}
                      onClick={handleStart}
                      disabled={sending}
                      className="px-7 py-3 rounded-full text-white text-sm font-bold shadow-lg disabled:opacity-50"
                      style={{
                        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                        boxShadow: '0 14px 30px -12px rgba(124,58,237,0.6)',
                      }}
                    >
                      开始对话
                    </motion.button>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-5 leading-relaxed max-w-[14rem]">
                      点开后可在 1 小时窗口内自由聊天，
                      <br />关于哪位同伴可以在聊天时 @ Ta。
                    </p>
                  </div>
                )}
                {counselSession?.messages.map(m => (
                  <MessageBubble key={m.id} message={m} confidantById={confidantById} />
                ))}
                {/* 流式气泡仅在真正有文本时显示；段与段之间的 1 秒停顿里让它自然消失 */}
                {streamingMsgId && streamText && (
                  <StreamingBubble text={streamText} />
                )}
              </div>

              {/* 选中的 @ chips：已在 10 回合 CD 内的同伴会带一圈描边（说明"档案已在上下文里"） */}
              {selectedMentions.length > 0 && (
                <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-gray-100 dark:border-gray-800 bg-indigo-500/5">
                  {selectedMentions.map(id => {
                    const c = confidantById(id);
                    if (!c) return null;
                    const active = isMentionActive(id);
                    return (
                      <button
                        key={id}
                        onClick={() => toggleMention(id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border transition-all ${
                          active
                            ? 'border-indigo-500 ring-2 ring-indigo-400/40 ring-offset-1 ring-offset-transparent'
                            : 'border-indigo-500/30'
                        }`}
                      >
                        @{c.name} ×
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 输入 + @ 选择器 */}
              <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-3 bg-white dark:bg-gray-900">
                {pickerOpen && (
                  <MentionPicker
                    confidants={activeConfidants}
                    selected={selectedMentions}
                    isActive={isMentionActive}
                    onToggle={toggleMention}
                    onClose={() => setPickerOpen(false)}
                  />
                )}
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => setPickerOpen(v => !v)}
                    className={`flex-shrink-0 w-10 h-10 rounded-full text-lg font-bold flex items-center justify-center transition-colors ${
                      pickerOpen
                        ? 'bg-indigo-500 text-white'
                        : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 hover:bg-indigo-500/20'
                    }`}
                    aria-label="选择同伴"
                    disabled={activeConfidants.length === 0}
                  >
                    @
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !sending && counselSession && !sessionExpired) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    rows={1}
                    placeholder={
                      sending ? '残响正在回…'
                      : (!counselSession || sessionExpired) ? '先按下方「开始对话」吧'
                      : '把它说出来…'
                    }
                    disabled={sending || !counselSession || !!sessionExpired}
                    className="flex-1 min-h-[40px] max-h-28 resize-none px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {sending ? (
                    <button
                      onClick={handleInterrupt}
                      className="flex-shrink-0 h-10 px-3 rounded-xl bg-rose-500 text-white text-xs font-bold shadow-md"
                    >
                      打断
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || !counselSession || !!sessionExpired}
                      className="flex-shrink-0 h-10 px-4 rounded-xl text-white text-sm font-bold shadow-md disabled:opacity-40 transition-opacity"
                      style={{
                        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                      }}
                    >
                      发送
                    </button>
                  )}
                </div>

                {/* 底部操作：归档 */}
                <div className="flex items-center justify-between mt-2 pt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  <span>
                    {counselSession?.messages.length ?? 0} 条消息
                    {sending && ' · 正在回复'}
                  </span>
                  <button
                    onClick={() => setArchiveConfirm(true)}
                    disabled={!counselSession || counselSession.messages.length === 0 || sending}
                    className="px-2 py-1 rounded text-indigo-500 hover:bg-indigo-500/10 disabled:opacity-30 transition-colors text-[11px] font-semibold"
                  >
                    归档这次谈话
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 退出选择：暂离 / 直接结束对话 */}
          <AnimatePresence>
            {exitOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/55 backdrop-blur-sm"
                onClick={() => !archiving && setExitOpen(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 8 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-xs rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-5"
                >
                  <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1.5">要离开了吗？</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    你可以先暂离回来再聊，也可以就此结束这次对话。
                  </p>
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={handleExitStay}
                      disabled={archiving}
                      className="w-full py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
                    >
                      暂离 · 一小时内可回来继续
                    </button>
                    <button
                      onClick={handleExitEnd}
                      disabled={archiving}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/30 hover:bg-rose-500/15 transition-colors disabled:opacity-40"
                    >
                      {archiving ? '正在归档…' : '直接结束对话 · 归档这次谈话'}
                    </button>
                    <button
                      onClick={() => setExitOpen(false)}
                      disabled={archiving}
                      className="w-full py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                    >
                      再想想
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 归档确认 */}
          <AnimatePresence>
            {archiveConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
                onClick={() => !archiving && setArchiveConfirm(false)}
              >
                <motion.div
                  initial={{ scale: 0.96, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.96, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-xs rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-5"
                >
                  <h4 className="text-base font-bold text-gray-900 dark:text-white mb-2">归档这次谈话？</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    会把刚才的聊天浓缩成 ≤100 字的摘要放进归档库，原文则会随着窗口关闭散去。
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => setArchiveConfirm(false)}
                      disabled={archiving}
                      className="py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                    >
                      再想想
                    </button>
                    <button
                      onClick={handleArchive}
                      disabled={archiving}
                      className="py-2 rounded-xl text-sm font-bold text-white"
                      style={{
                        background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                      }}
                    >
                      {archiving ? '正在压缩…' : '归档'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── sub components ──────────────────────────────────────────

function formatTime(ts: Date | string | undefined): string {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function MessageBubble({
  message,
  confidantById,
}: {
  message: CounselMessage;
  confidantById: (id: string) => Confidant | undefined;
}) {
  const isUser = message.role === 'user';
  const mentions = message.mentions?.map(id => confidantById(id)).filter(Boolean) ?? [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[82%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1 px-1">
          <span>{isUser ? '你' : '残响'}</span>
          <span className="tabular-nums">{formatTime(message.timestamp)}</span>
          {message.interrupted && (
            <span className="text-rose-500">· 已打断</span>
          )}
        </div>
        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1 px-1">
            {mentions.map(c => c && (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                style={{
                  background: `${TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1'}22`,
                  color: TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1',
                }}
              >
                @{c.name}
              </span>
            ))}
          </div>
        )}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
            isUser
              ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-br-md'
              : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-bl-md'
          }`}
        >
          {message.content}
          {message.interrupted && !isUser && (
            <span className="opacity-50 ml-0.5">…</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function StreamingBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[82%] flex flex-col items-start">
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1 px-1">
          <span>残响</span>
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            正在说…
          </motion.span>
        </div>
        <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700">
          {text || ''}
          <motion.span
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 0.9, repeat: Infinity }}
            className="inline-block w-[2px] h-3.5 ml-0.5 align-middle bg-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}

function MentionPicker({
  confidants,
  selected,
  isActive,
  onToggle,
  onClose,
}: {
  confidants: Confidant[];
  selected: string[];
  /** 该同伴是否仍在 10 回合 @ CD 内（表示档案已注入上下文） */
  isActive: (id: string) => boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="mb-2 p-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className="text-[10px] font-bold tracking-widest text-gray-500">关心的人</span>
        <button
          onClick={onClose}
          className="text-[10px] text-gray-400 hover:text-gray-600"
        >收起</button>
      </div>
      {confidants.length === 0 ? (
        <p className="text-[11px] text-gray-500 text-center py-3">
          还没有登记过同伴。可以先在同伴页里新建一位。
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
          {confidants.map(c => {
            const picked = selected.includes(c.id);
            // 这位同伴的档案当前是否已在 prompt 上下文里（10 回合 CD 内）
            const inContext = isActive(c.id);
            const accent = TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1';
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                  picked
                    ? 'text-white shadow-md'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'
                } ${
                  inContext
                    ? 'ring-2 ring-indigo-400/50 ring-offset-1 ring-offset-transparent'
                    : ''
                }`}
                style={picked ? { background: accent, borderColor: accent } : undefined}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
