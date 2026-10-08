/**
 * 谏言聊天弹窗（2026-10-02 翻新，PRD §19.5）。
 * - 每 3 天一次、一次 1 小时（冷却照旧，用户定：留出余地给沉淀）；到点原文删除、归档才留摘要——那是谏言的隐私承诺。
 * - 吐泡按段（空行切，最多 4 段），段间按长短停 0.35～0.9 秒；以前一句一个气泡、每句停 1 秒，
 *   六句话模型 0.24 秒写完、界面 6.1 秒才放完，期间输入框锁着。
 * - 输入框不再锁：回复途中发话 = 打断（已经写出来的留成一段「已打断」，然后接着回新的话）；空着输入框时有「打断」。
 * - 连着的几段只在第一段上写「残响 · 21:00」。
 * - 四套皮：蓝（含粉皮）/ 黄 / 红 / 中性，跟着夜间（红不跟）。
 * - 性能：挂弹层暂停（背景动画不再在全屏模糊底下跑）；倒计时拆成独立小组件，整窗不再每秒重渲；到点用一个定时器收窗口。
 */

import { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { TAROT_BY_ID } from '@/constants/tarot';
import { counselHasKey, streamCounselReply } from '@/utils/counselAI';
import { useBackHandler } from '@/utils/useBackHandler';
import { useOverlayPresence } from '@/ui/overlayPause';
import { useUiChannel } from '@/ui/useUiChannel';
import { P5R } from '@/components/p5r/kit';
import { counselSkinOf, type CounselCh as Ch, type CounselSkin } from '@/components/cooperation/counselSkin';
import type { CounselMessage, Confidant } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 快捷入口：从同伴详情页进入，会自动 @ 这位同伴 */
  initialMentionId?: string;
}

/** 可被 AbortSignal 打断的定时器 */
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const t = setTimeout(() => resolve(), ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

/** 段间停顿：按这段长短 0.35～0.9 秒（低帧 / 关粗犷度时直出） */
const paceOf = (text: string): number => {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-boldness') === '0') return 0;
  return Math.min(900, Math.max(350, text.length * 12));
};
/** 一次回复最多切 4 段（超出的并进第 4 段） */
const MAX_SEGMENTS = 4;

export function CounselChatModal({ isOpen, onClose, initialMentionId }: Props) {
  const {
    settings, counselSession, confidants, startCounselSession, appendCounselMessage, archiveCounselSession,
    expireCounselIfNeeded, buildCounselContext, getCounselCooldown,
  } = useAppStore(useShallow(s => ({
    settings: s.settings, counselSession: s.counselSession, confidants: s.confidants, startCounselSession: s.startCounselSession,
    appendCounselMessage: s.appendCounselMessage, archiveCounselSession: s.archiveCounselSession, expireCounselIfNeeded: s.expireCounselIfNeeded,
    buildCounselContext: s.buildCounselContext, getCounselCooldown: s.getCounselCooldown,
  })));
  const uiCh = useUiChannel();
  const ch: Ch = uiCh === 'p3' || uiCh === 'p4' || uiCh === 'p5' ? uiCh : 'neutral';
  const sk = useMemo(() => counselSkinOf(ch), [ch]);
  const hasApiKey = counselHasKey(settings);
  const [lastConnectError, setLastConnectError] = useState<string | null>(null);
  useEffect(() => { if (!isOpen) setLastConnectError(null); }, [isOpen]);

  // 全屏弹窗开着 → 背景动画暂停（以前谏言没挂，模糊底下的动画每帧都在重算）
  useOverlayPresence(isOpen);

  // 到点收窗口：倒计时小组件每秒按真实时钟看一眼，到点叫一声（不再每秒整窗重渲）。
  // 不用一个一小时的定时器：iOS 切后台时 JS 定时器整段暂停，回来以后还要再等剩下的那么久。
  // 收窗口会把会话从库里删掉（隐私承诺），store 里随之变空——ended 记住「刚才那场散了」，好显示「已经过去了」那页
  const [ended, setEnded] = useState(false);
  useEffect(() => { if (!isOpen) setEnded(false); }, [isOpen]);
  const onTimerExpire = useCallback(() => { setEnded(true); void expireCounselIfNeeded(); }, [expireCounselIfNeeded]);

  // 输入与 @ 选择
  const [input, setInput] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<string[]>(() => (initialMentionId ? [initialMentionId] : []));
  useEffect(() => {
    if (isOpen && initialMentionId) setSelectedMentions([initialMentionId]);
    if (!isOpen) { setSelectedMentions([]); setInput(''); }
  }, [isOpen, initialMentionId]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 回复状态：replying = 模型在写 / 段在放；liveText = 正在写的那一段（还没成段落库）
  const [replying, setReplying] = useState(false);
  const [liveText, setLiveText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef<Promise<void> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [counselSession?.messages.length, liveText, replying]);

  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);

  const activeConfidants = useMemo(() => confidants.filter(c => !c.archivedAt), [confidants]);
  const confidantById = useCallback((id: string) => activeConfidants.find(c => c.id === id), [activeConfidants]);

  /** 10 回合 @ 冷却：一个同伴被 @ 后 10 个用户回合内仍在上下文里（描边表示「已在上下文」） */
  const currentUserTurn = useMemo(() => counselSession?.messages.filter(m => m.role === 'user').length ?? 0, [counselSession?.messages]);
  const isMentionActive = useCallback((id: string): boolean => {
    const lt = counselSession?.mentionLastTurn?.[id];
    return typeof lt === 'number' && currentUserTurn - lt < 10;
  }, [counselSession?.mentionLastTurn, currentUserTurn]);

  const sessionExpired = !!counselSession && (counselSession.expired || Date.now() > new Date(counselSession.expiresAt).getTime());
  const sessionLive = !!counselSession && !sessionExpired;
  // 三天冷却（照旧）：从点「开始对话」那一刻算；窗口开着时不算锁
  const cooldown = getCounselCooldown();
  const locked = cooldown.locked && !sessionLive;
  // 渲染时发现已经过点（切后台回来 / 时钟跳了，定时器还没来得及响）：照样收窗口
  useEffect(() => {
    if (isOpen && sessionExpired) { setEnded(true); void expireCounselIfNeeded(); }
  }, [isOpen, sessionExpired, expireCounselIfNeeded]);
  const showExpired = ended && !sessionLive;

  /**
   * 一次回复：流进来的字先攒着，攒够一段（空行）就落成一个气泡，段间停一小会儿；
   * 被打断（回复途中发话 / 点打断）时，已经写出来的那半段落成「已打断」的一段。
   */
  const runAssistantStream = useCallback(async (opts: { greeting?: boolean } = {}) => {
    const ac = new AbortController();
    abortRef.current = ac;
    setReplying(true);
    setLiveText('');
    const ctx = buildCounselContext();
    let buffer = '';
    let shown = 0;
    let segments = 0;
    let done = false;
    let errored = false;
    const flush = async (text: string, interrupted = false) => {
      const content = text.replace(/^\s+|\s+$/g, '');
      if (!content) return false;
      const msg: CounselMessage = { id: uuidv4(), role: 'assistant', content, timestamp: new Date(), interrupted };
      try { await appendCounselMessage(msg); return true; } catch (err) { console.warn('append assistant msg failed:', err); return false; }
    };
    const producer = (async () => {
      try {
        for await (const chunk of streamCounselReply(ctx, ac.signal, {
          ...opts,
          onFallback: (reason, err) => { if (reason === 'connect-error') setLastConnectError(err?.message || '无法连接到 AI 服务'); },
        })) {
          buffer += chunk;
          setLiveText(buffer.slice(shown));
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          errored = true;
          setLastConnectError(err instanceof Error ? err.message : '未知错误');
        }
      } finally {
        done = true;
      }
    })();
    try {
      for (;;) {
        if (ac.signal.aborted) break;
        const pending = buffer.slice(shown);
        const brk = segments < MAX_SEGMENTS - 1 ? pending.match(/\n\s*\n/) : null;
        if (brk && brk.index !== undefined) {
          const para = pending.slice(0, brk.index);
          shown += brk.index + brk[0].length;
          setLiveText(buffer.slice(shown));
          if (await flush(para)) {
            segments++;
            await sleepWithAbort(paceOf(para), ac.signal);
          }
          continue;
        }
        if (done) {
          const rest = buffer.slice(shown);
          shown = buffer.length;
          setLiveText('');
          const saved = await flush(rest);
          if (!saved && segments === 0 && errored) await flush('（回复失败，请稍后再试）');
          break;
        }
        await sleepWithAbort(60, ac.signal);
      }
    } catch { /* 打断 */ }
    if (ac.signal.aborted) {
      // 被打断：已经写出来的那半段留成「已打断」
      const rest = buffer.slice(shown);
      shown = buffer.length;
      await flush(rest, true);
    }
    await producer.catch(() => {});
    setLiveText('');
    setReplying(false);
    if (abortRef.current === ac) abortRef.current = null;
  }, [appendCounselMessage, buildCounselContext]);

  const startReply = useCallback((opts: { greeting?: boolean } = {}) => {
    const run = runAssistantStream(opts);
    runningRef.current = run;
    void run.finally(() => { if (runningRef.current === run) runningRef.current = null; });
    return run;
  }, [runAssistantStream]);

  /** 打断正在放的回复，等它收好尾（半段落成「已打断」） */
  const interrupt = useCallback(async () => {
    abortRef.current?.abort();
    await runningRef.current?.catch(() => {});
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !sessionLive) return;
    setInput('');
    if (replying) await interrupt(); // 回复途中发话 = 打断
    const msgMentions = [...selectedMentions];
    const userMsg: CounselMessage = {
      id: uuidv4(), role: 'user', content: text, timestamp: new Date(),
      mentions: msgMentions.length ? msgMentions : undefined,
    };
    try { await appendCounselMessage(userMsg); } catch { return; }
    setSelectedMentions([]);
    void startReply();
  };

  /** 开始对话：直到点这一下才建会话（1 小时窗口从这一刻算），然后残响先开口 */
  const handleStart = async () => {
    if (replying || locked) return;
    if (!counselSession || sessionExpired) {
      try {
        await startCounselSession([...selectedMentions]);
      } catch (err) {
        if (err instanceof Error) setLastConnectError(err.message);
        return;
      }
    }
    setEnded(false);
    void startReply({ greeting: true });
  };

  const requestExit = () => {
    if (archiving) return;
    if (!counselSession || counselSession.messages.length === 0 || !sessionLive) { void interrupt(); onClose(); return; }
    setExitOpen(true);
  };

  useBackHandler(isOpen, () => {
    if (pickerOpen) { setPickerOpen(false); return; }
    if (archiveConfirm) { setArchiveConfirm(false); return; }
    if (exitOpen) { setExitOpen(false); return; }
    requestExit();
  });
  const handleExitStay = async () => { await interrupt(); setExitOpen(false); onClose(); };
  const doArchive = async () => {
    setArchiving(true);
    try { await interrupt(); await archiveCounselSession(); } catch (err) { console.error('archive failed:', err); }
    finally { setArchiving(false); setExitOpen(false); setArchiveConfirm(false); onClose(); }
  };

  const toggleMention = (id: string) => setSelectedMentions(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  if (!isOpen) return null;

  const messages = counselSession?.messages ?? [];
  const isP5 = ch === 'p5';

  return createPortal(
    <AnimatePresence>
      <motion.div key="counsel-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm" onClick={requestExit} />
      <motion.div
        key="counsel-modal"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', damping: 24, stiffness: 280 }}
        className="pointer-events-none fixed inset-0 z-[201] flex items-center justify-center p-0 md:p-4"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="谏言"
          data-counsel={ch}
          className={`pointer-events-auto relative flex h-full w-full flex-col overflow-hidden shadow-2xl md:h-[88vh] md:max-w-lg md:rounded-3xl ${sk.root}`}
          style={sk.rootStyle}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 红：舞台上两道暗红斜刀（装饰） */}
          {isP5 && (
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-10 top-[30%] h-24 w-[140%] -rotate-12" style={{ background: P5R.redDeep, opacity: 0.35 }} />
              <div className="absolute -left-10 bottom-[18%] h-10 w-[140%] rotate-[8deg]" style={{ background: P5R.red, opacity: 0.18 }} />
            </div>
          )}

          {/* 信头 */}
          <div className="relative px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
            <div className={`flex items-center gap-3 px-4 py-3 ${sk.header}`} style={sk.headerStyle}>
              <button type="button" onClick={requestExit} disabled={archiving} aria-label="关闭" className={`flex h-8 w-8 shrink-0 items-center justify-center text-lg font-black opacity-70 transition hover:opacity-100 disabled:opacity-30 ${sk.icon}`} style={{ color: sk.titleStyle?.color }}>←</button>
              <div className="min-w-0 flex-1">
                <h3 className={`flex items-center gap-2 ${sk.title}`} style={sk.titleStyle}>
                  <span style={sk.star} aria-hidden>✧</span>谏言
                </h3>
                <div className={`mt-0.5 truncate ${sk.sub}`} style={sk.subStyle}>房间的尽头，有人一直注视着你</div>
              </div>
              {sessionLive && counselSession && <CounselTimer expiresAt={counselSession.expiresAt} sk={sk} onExpire={onTimerExpire} />}
            </div>
          </div>

          {/* 提示：没配密钥 / 刚才连不上 */}
          {!hasApiKey ? (
            <Banner sk={sk} tone="warn" text="尚未配置 AI 密钥。" sub="现在是简版离线回复；到「设置 → AI 服务」填入密钥后，残响才会真正用心听你说。" />
          ) : lastConnectError ? (
            <Banner sk={sk} tone="error" text="无法连接到 AI 服务。" sub="刚才这次临时退回了离线回复。网络恢复后再发一条试试。" detail={lastConnectError} onClose={() => setLastConnectError(null)} />
          ) : null}

          {showExpired ? (
            <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center" data-counsel-expired>
              <div className="mb-4 text-6xl opacity-30" style={sk.star} aria-hidden>✧</div>
              <h4 className={sk.dialogTitle} style={sk.dialogTitleStyle}>这次谈话已经过去了</h4>
              <p className={`mt-2 max-w-xs ${sk.muted}`} style={sk.mutedStyle}>
                一小时的窗口已经合上，聊天记录随之散去。
                {locked ? <><br />这次的冷却会到 <b>{cooldown.nextAvailableDate}</b>，之后再来找残响。</> : <><br />想说的话还没说完，可以再开一次。</>}
              </p>
              <div className="mt-6 flex gap-3">
                {!locked && <button type="button" onClick={() => void handleStart()} className={sk.primary} style={sk.primaryStyle}>再开一次</button>}
                <button type="button" onClick={onClose} className={`px-5 ${sk.ghost}`} style={sk.ghostStyle}>离开</button>
              </div>
            </div>
          ) : locked && !counselSession ? (
            <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center" data-counsel-cooldown>
              <div className="mb-4 text-6xl opacity-30" style={sk.star} aria-hidden>✧</div>
              <h4 className={sk.dialogTitle} style={sk.dialogTitleStyle}>谏言冷却中</h4>
              <p className={`mt-2 max-w-xs ${sk.muted}`} style={sk.mutedStyle}>
                每 3 天一次，留出余地给沉淀。<br />
                下一次可在 <b>{cooldown.nextAvailableDate}</b> 开启（还有 {cooldown.daysLeft} 天）。
              </p>
              <button type="button" onClick={onClose} className={`mt-6 px-5 ${sk.ghost}`} style={sk.ghostStyle}>先回到房间</button>
            </div>
          ) : (
            <>
              {/* 消息列表 */}
              <div ref={scrollRef} className="relative flex-1 space-y-2.5 overflow-y-auto px-4 py-4" data-counsel-list>
                {messages.length === 0 && !replying && (
                  <div className="flex min-h-[300px] flex-col items-center justify-center py-14 text-center">
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.35 }} className="mb-5 text-5xl opacity-40" style={sk.star} aria-hidden>✧</motion.div>
                    <p className={`mb-6 max-w-xs ${sk.muted}`} style={sk.mutedStyle}>
                      房间的尽头，有人一直注视着你——<br />准备好了就按下去，Ta 会先开口。
                    </p>
                    <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => void handleStart()} disabled={replying} className={`disabled:opacity-50 ${sk.primary}`} style={sk.primaryStyle}>
                      开始对话
                    </motion.button>
                    <p className={`mt-5 max-w-[15rem] ${sk.muted}`} style={sk.mutedStyle}>
                      每 3 天可以开一次，开始后一小时内随便聊，到点原文就散了；想留个念想可以归档成一小段摘要。关于哪位同伴，聊天时 @ Ta。
                    </p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <MessageBubble key={m.id} message={m} prev={messages[i - 1]} confidantById={confidantById} sk={sk} />
                ))}
                {replying && <LiveBubble text={liveText} sk={sk} showMeta={messages[messages.length - 1]?.role !== 'assistant'} />}
              </div>

              {/* 选中的 @ chips（已在 10 回合 CD 内的带描边） */}
              {selectedMentions.length > 0 && (
                <div className="relative flex flex-wrap gap-1.5 px-4 py-2">
                  {selectedMentions.map(id => {
                    const c = confidantById(id);
                    if (!c) return null;
                    return (
                      <button key={id} type="button" onClick={() => toggleMention(id)} className={`${sk.chip} ${isMentionActive(id) ? 'ring-2 ring-current ring-offset-1 ring-offset-transparent' : ''}`} style={sk.chipStyle}>
                        @{c.name} ×
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 输入区 */}
              <div className={`relative px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 ${sk.footer}`} style={sk.footerStyle}>
                {pickerOpen && (
                  <MentionPicker confidants={activeConfidants} selected={selectedMentions} isActive={isMentionActive} onToggle={toggleMention} onClose={() => setPickerOpen(false)} sk={sk} />
                )}
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(v => !v)}
                    className={`flex shrink-0 items-center justify-center transition-colors ${sk.at}`}
                    style={{ ...sk.atStyle, ...(pickerOpen ? sk.atOnStyle : {}) }}
                    aria-label="选择同伴"
                    aria-expanded={pickerOpen}
                    disabled={activeConfidants.length === 0}
                  >
                    @
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && sessionLive) { e.preventDefault(); void handleSend(); }
                    }}
                    rows={1}
                    placeholder={!sessionLive ? '先按上面的「开始对话」吧' : replying ? '想插话就直接说' : '把它说出来…'}
                    aria-label="给残响的话"
                    disabled={!sessionLive}
                    className={`max-h-28 min-h-[44px] min-w-0 flex-1 resize-none transition-all disabled:cursor-not-allowed disabled:opacity-60 ${sk.input}`}
                    style={sk.inputStyle}
                  />
                  {replying && !input.trim() ? (
                    <button type="button" onClick={() => void interrupt()} className={`shrink-0 ${sk.stop}`} style={sk.stopStyle}>打断</button>
                  ) : (
                    <button type="button" onClick={() => void handleSend()} disabled={!input.trim() || !sessionLive} className={`shrink-0 transition-opacity ${sk.send}`} style={sk.sendStyle}>发送</button>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between px-1">
                  <span className={sk.meta} style={sk.metaStyle}>{messages.length} 条消息{replying ? ' · 正在说' : ''}</span>
                  <button type="button" onClick={() => setArchiveConfirm(true)} disabled={!counselSession || messages.length === 0} className={`disabled:opacity-30 ${sk.link}`} style={sk.linkStyle}>
                    归档这次谈话
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 退出选择：暂离 / 结束并归档 */}
          <AnimatePresence>
            {exitOpen && (
              <ConfirmLayer onDismiss={() => !archiving && setExitOpen(false)}>
                <div className={`w-full max-w-xs ${sk.dialog}`} style={sk.dialogStyle} role="alertdialog" aria-label="要离开了吗">
                  <h4 className={`mb-1.5 ${sk.dialogTitle}`} style={sk.dialogTitleStyle}>要离开了吗？</h4>
                  <p className={sk.muted} style={sk.mutedStyle}>可以先暂离，一小时内回来接着聊；也可以就此结束，把这次谈话归档成一小段摘要。</p>
                  <div className="mt-4 space-y-2">
                    <button type="button" onClick={() => void handleExitStay()} disabled={archiving} className={`w-full ${sk.primary}`} style={{ ...sk.primaryStyle, paddingTop: 10, paddingBottom: 10 }}>暂离 · 一小时内可回来</button>
                    <button type="button" onClick={() => void doArchive()} disabled={archiving} className={`w-full ${sk.danger}`} style={sk.dangerStyle}>{archiving ? '正在归档…' : '结束对话 · 归档这次谈话'}</button>
                    <button type="button" onClick={() => setExitOpen(false)} disabled={archiving} className={`w-full ${sk.ghost}`} style={sk.ghostStyle}>再想想</button>
                  </div>
                </div>
              </ConfirmLayer>
            )}
          </AnimatePresence>

          {/* 归档确认 */}
          <AnimatePresence>
            {archiveConfirm && (
              <ConfirmLayer onDismiss={() => !archiving && setArchiveConfirm(false)}>
                <div className={`w-full max-w-xs ${sk.dialog}`} style={sk.dialogStyle} role="alertdialog" aria-label="归档这次谈话">
                  <h4 className={`mb-2 ${sk.dialogTitle}`} style={sk.dialogTitleStyle}>归档这次谈话？</h4>
                  <p className={sk.muted} style={sk.mutedStyle}>会把刚才的聊天浓缩成 ≤100 字的摘要放进归档库，原文随窗口关闭散去。</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setArchiveConfirm(false)} disabled={archiving} className={sk.ghost} style={sk.ghostStyle}>再想想</button>
                    <button type="button" onClick={() => void doArchive()} disabled={archiving} className={sk.danger} style={sk.dangerStyle}>{archiving ? '正在压缩…' : '归档'}</button>
                  </div>
                </div>
              </ConfirmLayer>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── 小组件 ──────────────────────────────────────────────────────

/** 倒计时：自己每秒跳，不牵动整窗；到点叫一次 onExpire（按真实时钟判，切后台回来下一秒就判出来） */
function CounselTimer({ expiresAt, sk, onExpire }: { expiresAt: Date | string; sk: CounselSkin; onExpire: () => void }) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= end && !fired.current) { fired.current = true; onExpire(); }
    };
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [expiresAt, onExpire]);
  const remain = Math.max(0, new Date(expiresAt).getTime() - now);
  const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
  return (
    <div className="shrink-0 text-right" aria-label={`窗口还剩 ${mm} 分 ${ss} 秒`} data-counsel-timer>
      <div className={sk.timer} style={{ ...sk.timerStyle, ...(remain < 5 * 60 * 1000 ? sk.timerWarn : {}) }}>{mm}:{ss}</div>
    </div>
  );
}

function Banner({ sk, tone, text, sub, detail, onClose }: { sk: CounselSkin; tone: 'warn' | 'error'; text: string; sub: string; detail?: string; onClose?: () => void }) {
  return (
    <div className="relative mx-3 mt-2 flex items-start gap-2 px-3 py-2 text-[11px]" style={{ background: tone === 'warn' ? 'rgba(245,158,11,0.14)' : 'rgba(244,63,94,0.12)', color: tone === 'warn' ? '#b45309' : '#e11d48', borderRadius: sk.dialogStyle?.clipPath ? 0 : 12, clipPath: sk.dialogStyle?.clipPath ? 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' : undefined }} role="status">
      <span className="pt-0.5 text-sm leading-none" aria-hidden>⚠</span>
      <div className="min-w-0 flex-1 leading-relaxed">
        <span className="font-bold">{text}</span><span className="opacity-85"> {sub}</span>
        {detail && <div className="mt-0.5 truncate text-[10px] opacity-70">{detail}</div>}
      </div>
      {onClose && <button type="button" onClick={onClose} className="shrink-0 px-1 text-xs" aria-label="关闭提示">✕</button>}
    </div>
  );
}

function ConfirmLayer({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm" onClick={onDismiss}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="flex w-full justify-center">
        {children}
      </motion.div>
    </motion.div>
  );
}

function formatTime(ts: Date | string | undefined): string {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 气泡：连着的同一个人只在第一段上写名字和时间（隔 >5 分钟再写一次） */
const MessageBubble = memo(function MessageBubble({ message, prev, confidantById, sk }: {
  message: CounselMessage;
  prev?: CounselMessage;
  confidantById: (id: string) => Confidant | undefined;
  sk: CounselSkin;
}) {
  const isUser = message.role === 'user';
  const mentions = message.mentions?.map(id => confidantById(id)).filter(Boolean) ?? [];
  const gap = prev ? new Date(message.timestamp).getTime() - new Date(prev.timestamp).getTime() : Infinity;
  const showMeta = !prev || prev.role !== message.role || gap > 5 * 60 * 1000 || mentions.length > 0;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${showMeta ? 'pt-1.5' : ''}`} data-counsel-msg={message.role}>
      <div className={`flex max-w-[84%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {showMeta && (
          <div className={`mb-1 flex items-center gap-2 px-1 ${sk.meta}`} style={sk.metaStyle} data-counsel-meta>
            <span>{isUser ? '你' : '残响'}</span>
            <span className="tabular-nums">{formatTime(message.timestamp)}</span>
          </div>
        )}
        {mentions.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1 px-1">
            {mentions.map(c => c && (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: `${TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1'}22`, color: TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1' }}>
                @{c.name}
              </span>
            ))}
          </div>
        )}
        <div className={`whitespace-pre-wrap break-words ${isUser ? sk.user : sk.ai}`} style={isUser ? sk.userStyle : sk.aiStyle}>
          {message.content}
          {message.interrupted && !isUser && <span className="ml-0.5 opacity-50">…</span>}
        </div>
        {message.interrupted && !isUser && <span className={`mt-0.5 px-1 ${sk.meta}`} style={sk.metaStyle}>已打断</span>}
      </div>
    </motion.div>
  );
});

/** 正在写的那一段：有字就显示字，没字显示三个点 */
function LiveBubble({ text, sk, showMeta }: { text: string; sk: CounselSkin; showMeta: boolean }) {
  return (
    <div className={`flex justify-start ${showMeta ? 'pt-1.5' : ''}`} role="status" aria-label="残响正在说">
      <div className="flex max-w-[84%] flex-col items-start">
        {showMeta && (
          <div className={`mb-1 flex items-center gap-2 px-1 ${sk.meta}`} style={sk.metaStyle}>
            <span>残响</span>
            <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>正在说…</motion.span>
          </div>
        )}
        <div className={`whitespace-pre-wrap break-words ${sk.ai}`} style={sk.aiStyle} data-counsel-live>
          {text.trim() ? text.trim() : <span className="tracking-[0.3em] opacity-60">···</span>}
        </div>
      </div>
    </div>
  );
}

function MentionPicker({ confidants, selected, isActive, onToggle, onClose, sk }: {
  confidants: Confidant[];
  selected: string[];
  isActive: (id: string) => boolean;
  onToggle: (id: string) => void;
  onClose: () => void;
  sk: CounselSkin;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className={`mb-2 ${sk.picker}`} style={sk.pickerStyle}>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className={`tracking-widest ${sk.meta}`} style={sk.metaStyle}>关心的人</span>
        <button type="button" onClick={onClose} className={sk.meta} style={sk.metaStyle}>收起</button>
      </div>
      {confidants.length === 0 ? (
        <p className={`py-3 text-center ${sk.muted}`} style={sk.mutedStyle}>还没有登记过同伴。可以先在同伴页里新建一位。</p>
      ) : (
        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
          {confidants.map(c => {
            const picked = selected.includes(c.id);
            const accent = TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1';
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggle(c.id)}
                aria-pressed={picked}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold transition-all ${picked ? 'text-white shadow-md' : 'border-black/10 bg-white text-gray-700'} ${isActive(c.id) ? 'ring-2 ring-indigo-400/50 ring-offset-1 ring-offset-transparent' : ''}`}
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
