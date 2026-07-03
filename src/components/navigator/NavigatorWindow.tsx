/**
 * NavigatorWindow — F6 黑猫（Navigator）对话窗（Batch1 地基）。
 *
 * 全屏 overlay（portal，非页面路由）。本批 = 菜单层：每日问候（模板+状态拼接）、
 * chips 快捷动作 → 统一迷你表单 → 确认卡 → 执行回执（增强反馈免费继承），
 * 自由输入由黑猫模板接话（AI 对话层随 Batch2 接管，布局零改动）。
 *
 * 皮肤：board（蓝/粉/自定义）= P3R「深夜站内信」（复用 p3Kit 水面语言，-2° 斜置签名件）；
 * thief/tv = 中性深色兜底（其风格化随各自频道批次）。
 * 会话：当日延续、跨天清流（store/navigator，Batch1 仅内存）。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useNavigatorStore, type NavigatorMessage } from '@/store/navigator';
import { zClass } from '@/utils/zIndex';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import { useBoldness } from '@/utils/boldness';
import { terminalChannel } from '@/utils/terminalSkin';
import { P3, P3_WATER_WIDE, P3DotGrid, P3GhostWord } from '@/components/terminal/p3Kit';
import { NavigatorActionForm } from './NavigatorActionForm';
import {
  ACTION_META, buildPreviewLines, emptyDraft, executeDraft, navAttrName,
  type NavigatorActionKind, type NavigatorDraft,
} from '@/utils/navigatorRegistry';

/** 黑猫剪影（与底部导航 ◈ 同源的最小表达） */
const CatFace = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M4.5 9.5 3 3.5l5 3.2a7.6 7.6 0 0 1 8 0l5-3.2-1.5 6a8.4 8.4 0 0 1 1.5 4.9c0 4.6-3.9 7.6-9 7.6s-9-3-9-7.6c0-1.8.55-3.5 1.5-4.9Z" />
  </svg>
);

// 人格名随 activePreset 动态取（Batch3）；'黑猫' 仅作窗口未初始化时的兜底

// ── 皮肤 token（bright = P3 站内信 / 暗 = 中性兜底） ──
const skinOf = (bright: boolean) => bright
  ? {
    root: undefined as string | undefined,
    rootStyle: { background: `linear-gradient(180deg, ${P3.hi} 0%, ${P3.mid} 55%, ${P3.pale} 100%)` },
    headerSlab: 'bg-[#f7fbff] shadow-[0_10px_26px_rgba(7,40,120,.25)]',
    headerStyle: { clipPath: 'polygon(0 8%, 100% 0, 99.2% 100%, 0 96%)', transform: 'rotate(-2deg)' } as React.CSSProperties,
    headerText: { color: P3.ink },
    catBubble: 'bg-[#f7fbff] shadow-[0_8px_22px_rgba(7,40,120,.18)]',
    catBubbleStyle: { clipPath: 'polygon(0 7%, 100% 0, 99% 100%, 0.8% 100%)', color: P3.ink } as React.CSSProperties,
    userBubble: 'text-white shadow-[0_8px_22px_rgba(6,28,80,.3)]',
    userBubbleStyle: { background: P3.deep, clipPath: 'polygon(1% 0, 100% 7%, 99.2% 100%, 0 100%)' } as React.CSSProperties,
    avatar: 'text-white',
    avatarStyle: { background: P3.deep } as React.CSSProperties,
    chip: 'border-2 border-[#bcd9f8] bg-[#f7fbff] text-[13px] font-black',
    chipStyle: { color: P3.ink } as React.CSSProperties,
    inputBar: undefined as string | undefined,
    inputBarStyle: { background: P3.deep } as React.CSSProperties,
    input: 'flex-1 bg-white px-3 py-2.5 text-[16px] font-bold outline-none placeholder:text-[#8fb1dc]',
    inputStyle: { color: P3.ink } as React.CSSProperties,
    send: 'flex h-11 w-12 shrink-0 items-center justify-center text-lg font-black text-white disabled:opacity-40',
    sendStyle: { background: P3.deepSoft } as React.CSSProperties,
    card: 'bg-[#f7fbff] shadow-[0_10px_28px_rgba(7,40,120,.22)]',
    cardStyle: { clipPath: 'polygon(0 4%, 100% 0, 99.2% 100%, 0 98%)', color: P3.ink } as React.CSSProperties,
    cardBtn: 'min-h-10 bg-[color-mix(in_srgb,var(--color-primary)_30%,#061c50)] px-4 text-[13px] font-black text-white disabled:opacity-40',
    cardBtnGhost: 'min-h-10 border-2 border-[#bcd9f8] bg-white px-3.5 text-[13px] font-black text-[color-mix(in_srgb,var(--color-primary)_50%,#1d4ab0)]',
    cardBtnText: 'min-h-10 px-2 text-[13px] font-bold opacity-60',
    stamp: 'px-2 py-0.5 text-[10px] font-black tracking-[0.12em]',
    stampStyle: { background: P3.accent, color: P3.deep, transform: 'rotate(-2deg)' } as React.CSSProperties,
  }
  : {
    root: 'bg-[#0d1017]',
    rootStyle: undefined as React.CSSProperties | undefined,
    headerSlab: 'border border-white/10 bg-[#151923] rounded-2xl',
    headerStyle: undefined as React.CSSProperties | undefined,
    headerText: { color: '#fff' } as React.CSSProperties,
    catBubble: 'rounded-2xl rounded-tl-md border border-white/10 bg-[#171c27] text-gray-100',
    catBubbleStyle: undefined as React.CSSProperties | undefined,
    userBubble: 'rounded-2xl rounded-tr-md bg-primary/25 text-white',
    userBubbleStyle: undefined as React.CSSProperties | undefined,
    avatar: 'text-primary',
    avatarStyle: { background: 'rgba(255,255,255,.08)' } as React.CSSProperties,
    chip: 'rounded-full border border-white/15 bg-white/5 text-[13px] font-bold text-gray-200',
    chipStyle: undefined as React.CSSProperties | undefined,
    inputBar: 'bg-[#12151d]',
    inputBarStyle: undefined as React.CSSProperties | undefined,
    input: 'flex-1 rounded-xl bg-white/8 px-3 py-2.5 text-[16px] text-white outline-none placeholder:text-gray-500',
    inputStyle: undefined as React.CSSProperties | undefined,
    send: 'flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-black text-white disabled:opacity-40',
    sendStyle: undefined as React.CSSProperties | undefined,
    card: 'rounded-2xl border border-white/12 bg-[#171c27] text-gray-100',
    cardStyle: undefined as React.CSSProperties | undefined,
    cardBtn: 'min-h-10 rounded-xl bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-40',
    cardBtnGhost: 'min-h-10 rounded-xl border border-white/15 px-3.5 text-[13px] font-bold text-gray-200',
    cardBtnText: 'min-h-10 px-2 text-[13px] font-bold text-gray-400',
    stamp: 'rounded px-2 py-0.5 text-[10px] font-black tracking-[0.12em] bg-primary/25 text-primary',
    stampStyle: undefined as React.CSSProperties | undefined,
  };
type Skin = ReturnType<typeof skinOf>;

export const NavigatorWindow = () => {
  const { user, settings, setCurrentPage, getDueTodosToday, getTodayTodoProgress } = useAppStore();
  const nav = useNavigatorStore();
  const bold = useBoldness();
  const bright = terminalChannel(user?.theme) === 'board';
  const sk = skinOf(bright);
  const preset = nav.activePreset();

  const a11yRef = useModalA11y(nav.isOpen, nav.close, { closeOnEscape: true, trapFocus: true });
  useBackHandler(nav.isOpen, nav.close);

  const [formDraft, setFormDraft] = useState<NavigatorDraft | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 打开：加载自定义人格 + 挂载当日会话 + 问候（逻辑收在 store.greet，内部先 hydrate）
  useEffect(() => {
    if (!nav.isOpen) return;
    const st = useNavigatorStore.getState();
    void st.loadPresets();
    st.greet();
  }, [nav.isOpen]);

  // 打开期间锁 body 滚动
  useEffect(() => {
    if (!nav.isOpen || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [nav.isOpen]);

  // 新消息 / 打字指示出现时自动贴底
  const msgCount = nav.messages.length;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgCount, nav.phase, nav.isOpen]);

  const openForm = (kind: NavigatorActionKind) => {
    if (kind === 'completeTodo') { setPickerOpen(true); return; }
    setEditingCardId(null);
    setFormDraft(emptyDraft(kind));
    setFormKey((k) => k + 1);
  };
  const editCard = (m: NavigatorMessage) => {
    if (!m.draft) return;
    setEditingCardId(m.id);
    setFormDraft(m.draft);
    setFormKey((k) => k + 1);
  };
  const onFormSubmit = (d: NavigatorDraft) => {
    if (editingCardId) nav.updateCard(editingCardId, { draft: d });
    else nav.pushCard(d);
    setFormDraft(null);
    setEditingCardId(null);
  };
  const confirmCard = async (m: NavigatorMessage) => {
    if (!m.draft || busyCardId) return;
    setBusyCardId(m.id);
    try {
      const receipt = await executeDraft(m.draft);
      nav.updateCard(m.id, { cardStatus: 'done', receipt });
    } catch (e) {
      nav.pushCat(e instanceof Error ? `没记上：${e.message}` : '没记上，稍后再试一次。');
    } finally {
      setBusyCardId(null);
    }
  };
  const send = () => {
    const text = input.trim();
    if (!text) return;
    nav.userSend(text); // 进仲裁器：收口/打断由它裁决
    setInput('');
    nav.setInputActive(false);
  };
  const jump = (page: string) => { nav.close(); setCurrentPage(page); };

  const dueTodos = nav.isOpen
    ? getDueTodosToday().filter((t) => !getTodayTodoProgress(t.id).isComplete)
    : [];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
        {nav.isOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={preset.name}
            initial={bold ? { opacity: 0, y: 24 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={bold ? { opacity: 0, y: 18 } : { opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed inset-0 ${zClass.modal} flex flex-col overflow-hidden ${sk.root ?? ''}`}
            style={sk.rootStyle}
          >
            {/* P3 房景装饰 */}
            {bright && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <P3GhostWord word="INBOX" className="-left-[2%] top-[9%] text-[7rem]" style={{ opacity: 0.13, transform: 'rotate(-2deg)' }} />
                <P3DotGrid className="right-[6%] top-[13%] h-20 w-24" opacity={0.5} />
                <div className="absolute inset-x-0 bottom-0 h-[26%]">
                  <img
                    src={P3_WATER_WIDE}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ maskImage: 'linear-gradient(180deg, transparent 0%, #000 62%)', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 62%)' }}
                  />
                </div>
              </div>
            )}

            {/* a11y 焦点陷阱挂内层容器（挂 AnimatePresence 直接子元素会触发 framer PopChild 的 ref 警告） */}
            <div ref={a11yRef} className="relative mx-auto flex h-full w-full max-w-2xl flex-col">
              {/* 页头：站内信信头 */}
              <div className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                <div className={`flex items-center gap-3 px-4 py-3 ${sk.headerSlab}`} style={sk.headerStyle}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center ${sk.avatar}`} style={{ ...sk.avatarStyle, clipPath: bright ? 'polygon(0 8%, 100% 0, 96% 100%, 2% 96%)' : undefined, borderRadius: bright ? undefined : '0.75rem' }}>
                    <CatFace className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-black" style={sk.headerText}>{bright ? `▶ 站内信 · ${preset.name}` : preset.name}</div>
                    <div className="text-[11px] font-bold opacity-60" style={sk.headerText}>{bright ? '深夜在线 · 有事直说' : '万能记录 · 有事直说'}</div>
                  </div>
                  {bright && (
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-black tracking-[0.2em]" style={{ color: P3.ink }}>
                      <span className="inline-flex h-2 w-2 rounded-full" style={{ background: P3.accent }} aria-hidden />
                      在线
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="关闭黑猫"
                    onClick={nav.close}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-xl font-black opacity-70 transition hover:opacity-100"
                    style={sk.headerText}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* 消息流 */}
              <div ref={listRef} className="relative flex-1 space-y-3 overflow-y-auto px-4 pb-3 pt-4">
                {nav.messages.map((m) => (
                  <MessageRow key={m.id} m={m} sk={sk} bright={bright} busy={busyCardId === m.id}
                    onConfirm={() => void confirmCard(m)} onEdit={() => editCard(m)}
                    onCancel={() => nav.updateCard(m.id, { cardStatus: 'cancelled' })} />
                ))}
                {(nav.phase === 'thinking' || nav.phase === 'replying') && (
                  <TypingRow sk={sk} bright={bright} bold={bold} />
                )}
              </div>

              {/* chips：快捷动作 + 跳转 */}
              <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1">
                {(['activity', 'todo', 'ledger', 'completeTodo'] as NavigatorActionKind[]).map((kind) => (
                  <button key={kind} type="button" onClick={() => openForm(kind)}
                    className={`shrink-0 px-3.5 py-2 ${sk.chip}`} style={sk.chipStyle}>
                    {ACTION_META[kind].icon} {ACTION_META[kind].label}
                  </button>
                ))}
                <button type="button" onClick={() => jump('astrology')} className={`shrink-0 px-3.5 py-2 ${sk.chip}`} style={sk.chipStyle}>
                  🔮 去抽塔罗
                </button>
                {settings.terminalEnabled && (
                  <button type="button" onClick={() => jump('terminal')} className={`shrink-0 px-3.5 py-2 ${sk.chip}`} style={sk.chipStyle}>
                    ✦ 打开终端
                  </button>
                )}
              </div>

              {/* 输入栏 */}
              <div className={`px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 ${sk.inputBar ?? ''}`} style={sk.inputBarStyle}>
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // 输入活动信号：仲裁器的收口窗口据此挂起，等用户把话说完
                      nav.setInputActive(e.target.value.trim().length > 0);
                    }}
                    onFocus={(e) => nav.setInputActive(e.target.value.trim().length > 0)}
                    onBlur={() => nav.setInputActive(false)}
                    onCompositionStart={() => nav.setInputActive(true)}
                    onCompositionEnd={(e) => nav.setInputActive((e.target as HTMLInputElement).value.trim().length > 0)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
                    placeholder="跟黑猫说点什么…"
                    aria-label="给黑猫的消息"
                    className={sk.input}
                    style={sk.inputStyle}
                  />
                  <button type="button" onClick={send} disabled={!input.trim()} aria-label="发送" className={sk.send} style={sk.sendStyle}>
                    ▶
                  </button>
                </div>
              </div>
            </div>

            {/* 完成任务：候选拣选 */}
            <AnimatePresence>
              {pickerOpen && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className={`absolute inset-0 ${zClass.confirm} flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center`}
                  onMouseDown={() => setPickerOpen(false)}
                >
                  <motion.div
                    role="dialog" aria-modal="true" aria-label="选择要完成的任务"
                    initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
                    className={`w-full max-w-md overflow-hidden ${sk.card}`}
                    style={sk.cardStyle}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="px-5 pb-2 pt-4 text-base font-black">今天做到了哪件？</div>
                    <div className="max-h-[50vh] overflow-y-auto px-5 pb-5">
                      {dueTodos.length === 0 ? (
                        <div className="py-6 text-center text-sm font-bold opacity-60">
                          今天没有待完成的任务——要么全清了，要么清单还空着。
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dueTodos.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                nav.pushCard({ kind: 'completeTodo', todoId: t.id, todoTitle: t.title });
                                setPickerOpen(false);
                              }}
                              className={`block w-full px-4 py-3 text-left ${bright ? 'border-2 border-[#cfe4fb] bg-white' : 'rounded-xl border border-white/12 bg-white/5'}`}
                            >
                              <span className="block truncate text-sm font-black">{t.title}</span>
                              <span className="mt-0.5 block text-[11px] font-bold opacity-60">
                                {navAttrName(t.attribute)} +{t.points}{t.repeatDaily ? ' · 每日' : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 迷你表单（新建 / 编辑确认卡共用） */}
      <NavigatorActionForm
        key={formKey}
        draft={formDraft}
        bright={bright}
        onSubmit={onFormSubmit}
        onClose={() => { setFormDraft(null); setEditingCardId(null); }}
      />
    </>,
    document.body,
  );
};

// ── 打字指示（thinking/replying 相位；等待本身就是拟人） ──
const TypingRow = ({ sk, bright, bold }: { sk: Skin; bright: boolean; bold: boolean }) => (
  <div className="flex items-start gap-2.5" role="status" aria-label="黑猫正在输入">
    <span
      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center ${sk.avatar}`}
      style={{ ...sk.avatarStyle, clipPath: bright ? 'polygon(0 8%, 100% 0, 96% 100%, 2% 96%)' : undefined, borderRadius: bright ? undefined : '0.65rem' }}
      aria-hidden
    >
      <CatFace className="h-[18px] w-[18px]" />
    </span>
    <div className={`flex items-center gap-1.5 px-4 py-3.5 ${sk.catBubble}`} style={sk.catBubbleStyle} aria-hidden>
      {[0, 1, 2].map((i) =>
        bold ? (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-current opacity-60"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ) : (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
        ),
      )}
    </div>
  </div>
);

// ── 单条消息 ──
const MessageRow = ({ m, sk, bright, busy, onConfirm, onEdit, onCancel }: {
  m: NavigatorMessage; sk: Skin; bright: boolean; busy: boolean;
  onConfirm: () => void; onEdit: () => void; onCancel: () => void;
}) => {
  if (m.role === 'summary') {
    // compact 产物：早前对话的折叠占位
    return (
      <div className={`mx-auto max-w-[90%] px-4 py-2 text-center text-[11px] font-bold leading-relaxed ${bright ? 'text-white/75' : 'text-gray-500'}`}>
        —— 早前的对话已收进记忆 ——
        <span className="mt-0.5 block opacity-80">{m.text}</span>
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className={`max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-sm font-bold leading-relaxed ${sk.userBubble}`} style={sk.userBubbleStyle}>
          {m.text}
        </div>
      </div>
    );
  }
  if (m.role === 'cat') {
    return (
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center ${sk.avatar}`} style={{ ...sk.avatarStyle, clipPath: bright ? 'polygon(0 8%, 100% 0, 96% 100%, 2% 96%)' : undefined, borderRadius: bright ? undefined : '0.65rem' }}>
          <CatFace className="h-[18px] w-[18px]" />
        </span>
        <div className={`max-w-[85%] whitespace-pre-wrap px-4 py-2.5 text-sm font-bold leading-relaxed ${sk.catBubble}`} style={sk.catBubbleStyle}>
          {m.text}
        </div>
      </div>
    );
  }
  // 确认卡
  if (!m.draft) return null;
  const meta = ACTION_META[m.draft.kind];
  const lines = buildPreviewLines(m.draft);
  const cancelled = m.cardStatus === 'cancelled';
  const done = m.cardStatus === 'done';
  return (
    <div className={`px-4 py-4 ${sk.card} ${cancelled ? 'opacity-55' : ''}`} style={sk.cardStyle}>
      <div className="flex items-center gap-2">
        <span aria-hidden>{meta.icon}</span>
        <span className="flex-1 text-sm font-black">{meta.label}</span>
        {done && <span className={sk.stamp} style={sk.stampStyle}>已记录 ✓</span>}
        {cancelled && <span className="text-[11px] font-bold opacity-60">已取消</span>}
      </div>
      <div className="mt-2 space-y-1">
        {lines.map((l, i) => (
          <p key={i} className={`text-sm leading-relaxed ${i === 0 ? 'font-black' : 'font-bold opacity-75'}`}>{l}</p>
        ))}
      </div>
      {m.cardStatus === 'pending' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onConfirm} className={sk.cardBtn}>
            {busy ? '记录中…' : '✓ 确认'}
          </button>
          <button type="button" disabled={busy} onClick={onEdit} className={sk.cardBtnGhost}>编辑</button>
          <button type="button" disabled={busy} onClick={onCancel} className={sk.cardBtnText}>取消</button>
        </div>
      )}
      {done && m.receipt && (
        <div className={`mt-3 flex items-start gap-2 border-t pt-3 ${bright ? 'border-[#dcebfb]' : 'border-white/10'}`}>
          <span aria-hidden style={bright ? { color: P3.accent } : undefined} className={bright ? '' : 'text-primary'}>
            <CatFace className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-bold leading-relaxed opacity-80">{m.receipt}</p>
        </div>
      )}
    </div>
  );
};
