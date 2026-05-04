import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import type { CallingCard, CallingCardMode, CallingCardTone, Todo } from '@/types';

interface Props {
  isOpen: boolean;
  /** 编辑模式：若传入则视为编辑现有卡，否则新建 */
  initialCard?: CallingCard | null;
  onClose: () => void;
}

const ICON_OPTIONS = ['✦', '⚔️', '🦋', '🔥', '◈', '✧', '🎯', '🏔️'];

// 纹理 4 选：颜色统一跟随主题 primary，差异仅在图案
const TONE_OPTIONS: Array<{ id: CallingCardTone; label: string }> = [
  { id: 'lines', label: '斜纹' },
  { id: 'grid',  label: '网格' },
  { id: 'dots',  label: '点阵' },
  { id: 'plain', label: '纯色' },
];

const TODOS_PER_PAGE = 5;
const TODOS_MAX = 7;

export function CallingCardEditor({ isOpen, initialCard, onClose }: Props) {
  const { saveCallingCard, todos, callingCards } = useAppStore();

  const dialogRef = useModalA11y(isOpen, onClose);
  useBackHandler(isOpen, onClose);

  // 表单状态
  const [mode, setMode] = useState<CallingCardMode>('deadline');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  // startDate：百分比起算点。默认今天；用户可以往前回拨（"3 个月前我就开始为它准备了"）
  // 也可以往后推（"下周一才正式启动"）。校验：不晚于 targetDate。
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [linkedTodoIds, setLinkedTodoIds] = useState<string[]>([]);
  const [tone, setTone] = useState<CallingCardTone>('red');
  const [icon, setIcon] = useState('✦');
  const [pinned, setPinned] = useState(true);

  // todos 选择器分页
  const [todoPage, setTodoPage] = useState(0);

  // 初始化 / 切换条目时同步表单
  useEffect(() => {
    if (!isOpen) return;
    if (initialCard) {
      setMode(initialCard.mode);
      setTitle(initialCard.title);
      setSubtitle(initialCard.subtitle ?? '');
      setStartDate(initialCard.startDate);
      setTargetDate(initialCard.targetDate ?? '');
      setLinkedTodoIds(initialCard.linkedTodoIds ?? []);
      setTone(initialCard.tone);
      setIcon(initialCard.icon ?? '✦');
      setPinned(initialCard.pinned);
    } else {
      // 新建：起算 = 今天；目标 = 7 天后（起手值，用户会改）
      const d = new Date();
      d.setDate(d.getDate() + 7);
      setMode('deadline');
      setTitle('');
      setSubtitle('');
      setStartDate(toLocalDateKey());
      setTargetDate(toLocalDateKey(d));
      setLinkedTodoIds([]);
      setTone('lines');
      setIcon('✦');
      setPinned(true);
    }
    setTodoPage(0);
  }, [isOpen, initialCard]);

  const activeTodos: Todo[] = todos.filter(t => t.isActive);
  const totalPages = Math.max(1, Math.ceil(activeTodos.length / TODOS_PER_PAGE));
  const pageTodos = activeTodos.slice(todoPage * TODOS_PER_PAGE, (todoPage + 1) * TODOS_PER_PAGE);

  const toggleTodo = (id: string) => {
    setLinkedTodoIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= TODOS_MAX) return prev; // 上限 7
      return [...prev, id];
    });
  };

  const needsDate = mode === 'deadline' || mode === 'both';
  const needsTodos = mode === 'todos' || mode === 'both';

  const titleOk = title.trim().length > 0;
  // 起算日要求：1) 必填（默认今天），2) 不晚于目标日（百分比公式 (today - start) / (target - start) 才有意义）
  const startDateOk = !needsDate || (startDate && (!targetDate || startDate <= targetDate));
  // 目标日：必填 + 不早于今天 + 不早于起算日
  const dateOk = !needsDate || (targetDate && targetDate >= toLocalDateKey() && targetDate >= startDate);
  const todosOk = !needsTodos || linkedTodoIds.length > 0;
  const canSave = titleOk && startDateOk && dateOk && todosOk;

  // 实时预览：剩余天数 + 总天数 + 已征途（与 store 的算法一致）
  const datePreview = (() => {
    if (!needsDate || !targetDate || !startDate) return null;
    const today = new Date(toLocalDateKey() + 'T00:00:00');
    const start = new Date(startDate + 'T00:00:00');
    const target = new Date(targetDate + 'T00:00:00');
    const total = Math.max(1, Math.round((target.getTime() - start.getTime()) / 86400000));
    const elapsed = Math.max(0, Math.round((today.getTime() - start.getTime()) / 86400000));
    const left = Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
    const pct = Math.min(100, Math.round((elapsed / total) * 100));
    return { total, elapsed, left, pct };
  })();

  // 已有钉选的提示（用户钉新的会替换旧的）
  const otherPinnedExists = pinned && callingCards.some(c => c.pinned && (!initialCard || c.id !== initialCard.id));

  const handleSave = async () => {
    if (!canSave) return;
    const now = new Date();
    const card: CallingCard = {
      id: initialCard?.id ?? uuidv4(),
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      mode,
      targetDate: needsDate ? targetDate : undefined,
      // startDate：表单值优先（用户可改）；纯 todos 模式没日期，仍记一个今天值，
      // 方便未来切回 deadline 时不至于空
      startDate: needsDate ? startDate : (initialCard?.startDate ?? toLocalDateKey()),
      linkedTodoIds: needsTodos ? linkedTodoIds : undefined,
      tone,
      icon,
      pinned,
      archived: initialCard?.archived ?? false,
      archivedAt: initialCard?.archivedAt,
      archiveReason: initialCard?.archiveReason,
      cutInShown: initialCard?.cutInShown,
      ledgerWritten: initialCard?.ledgerWritten,
      createdAt: initialCard?.createdAt ?? now,
    };
    await saveCallingCard(card);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={initialCard ? '编辑倒计时' : '新建倒计时'}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '90vh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-black/5 dark:border-white/5">
              <h2 className="text-base font-black text-gray-900 dark:text-white flex-1">
                {initialCard ? '编辑倒计时' : '新建倒计时'}
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-gray-400 text-lg"
                aria-label="关闭"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* 模式 */}
              <Section label="模式">
                <div className="grid grid-cols-3 gap-2">
                  {(['deadline', 'todos', 'both'] as CallingCardMode[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`py-2.5 rounded-xl text-xs font-bold transition-all ${
                        mode === m
                          ? 'bg-primary text-white shadow-md'
                          : 'bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {m === 'deadline' ? '日期' : m === 'todos' ? '任务清单' : '兼有'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
                  {mode === 'deadline' && '只看日期：到那天自动归档（"时之至"）'}
                  {mode === 'todos' && '只看任务：选定项全部完成时自动归档（"达成"）'}
                  {mode === 'both' && '两条都设：先到的为准（先做完所有任务 / 先到日子）'}
                </p>
              </Section>

              {/* 标题 + 副标题 */}
              <Section label="标题">
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value.slice(0, 30))}
                  placeholder="例如 高考 / 婚礼 / v3 上线"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary"
                  autoFocus
                />
              </Section>
              <Section label="宣告台词（可选）">
                <input
                  type="text"
                  value={subtitle}
                  onChange={e => setSubtitle(e.target.value.slice(0, 40))}
                  placeholder="命运在此倾覆 / 我宣告 …"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary"
                />
              </Section>

              {/* 日期：起算日 + 目标日 + 实时预览 */}
              {needsDate && (
                <Section label="日期">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">起算日</div>
                      <input
                        type="date"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary tabular-nums"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">目标日</div>
                      <input
                        type="date"
                        value={targetDate}
                        min={startDate || toLocalDateKey()}
                        onChange={e => setTargetDate(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary tabular-nums"
                      />
                    </div>
                  </div>
                  {!startDateOk && (
                    <p className="text-[11px] text-red-500 mt-1">起算日不能晚于目标日</p>
                  )}
                  {!dateOk && targetDate && startDateOk && (
                    <p className="text-[11px] text-red-500 mt-1">目标日不能早于今天</p>
                  )}
                  {/* 预览：共 N 天，还剩 X 天，已征途 Y 天，进度 Z% */}
                  {datePreview && dateOk && startDateOk && (
                    <div className="mt-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20 text-[11px] tabular-nums leading-relaxed">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gray-500 dark:text-gray-400">
                          共 <span className="font-bold text-gray-700 dark:text-gray-200">{datePreview.total}</span> 天
                          · 还剩 <span className="font-bold text-primary">{datePreview.left}</span> 天
                          · 已征途 <span className="font-bold text-gray-700 dark:text-gray-200">{datePreview.elapsed}</span> 天
                        </span>
                        <span className="font-bold text-primary">{datePreview.pct}%</span>
                      </div>
                      <div className="relative h-1 rounded-full overflow-hidden bg-primary/10">
                        <div
                          className="absolute top-0 left-0 h-full rounded-full bg-primary"
                          style={{ width: `${datePreview.pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {/* 任务选择器 */}
              {needsTodos && (
                <Section label={`关联任务（已选 ${linkedTodoIds.length} / ${TODOS_MAX}）`}>
                  {activeTodos.length === 0 ? (
                    <div className="text-[12px] text-gray-400 italic px-1 py-3">
                      还没有活跃任务。先到上方"任务"区添加，再回来选。
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        {pageTodos.map(t => {
                          const selected = linkedTodoIds.includes(t.id);
                          const reachedCap = !selected && linkedTodoIds.length >= TODOS_MAX;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleTodo(t.id)}
                              disabled={reachedCap}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                                selected
                                  ? 'bg-primary/10 dark:bg-primary/10 border border-primary/40 dark:border-gray-600'
                                  : 'bg-white dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 hover:border-primary/25 dark:hover:border-gray-600'
                              } ${reachedCap ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                selected ? 'border-primary bg-primary' : 'border-gray-400 dark:border-gray-500'
                              }`}>
                                {selected && (
                                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{t.title}</div>
                                <div className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {t.repeatDaily ? '每日' : t.isLongTerm ? '长期' : '单次'}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-2">
                          <button
                            type="button"
                            onClick={() => setTodoPage(p => Math.max(0, p - 1))}
                            disabled={todoPage === 0}
                            className="px-2 py-1 rounded-lg text-xs text-gray-500 dark:text-gray-400 disabled:opacity-40 hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            ‹ 上一组
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }).map((_, i) => (
                              <span
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${i === todoPage ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setTodoPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={todoPage >= totalPages - 1}
                            className="px-2 py-1 rounded-lg text-xs text-gray-500 dark:text-gray-400 disabled:opacity-40 hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            下一组 ›
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </Section>
              )}

              {/* 纹理 + 图标 */}
              <Section label="纹理 / 图标">
                {/* 4 个纹理：颜色全部随主题 primary，按钮里渲染一小块 SVG 预览图案 */}
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {TONE_OPTIONS.map(opt => {
                    const selected = tone === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTone(opt.id)}
                        className={`relative h-12 rounded-xl overflow-hidden text-[11px] font-bold transition-all ${
                          selected
                            ? 'ring-2 ring-primary text-primary'
                            : 'ring-1 ring-gray-200 dark:ring-gray-700 text-gray-500 dark:text-gray-400 hover:ring-primary/40'
                        }`}
                        style={{
                          background: 'color-mix(in hsl, var(--color-primary) 6%, rgba(0,0,0,0.02))',
                        }}
                      >
                        <TexturePreview kind={opt.id as Exclude<CallingCardTone, 'red' | 'blue' | 'gold'>} />
                        <span className="absolute inset-0 flex items-center justify-center">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ICON_OPTIONS.map(em => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => setIcon(em)}
                      className={`w-9 h-9 rounded-lg text-lg transition-all ${
                        icon === em ? 'bg-primary/15 ring-2 ring-primary' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </Section>

              {/* 钉到主页 */}
              <Section label="">
                <label className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-black/3 dark:bg-white/5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={e => setPinned(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">📌 钉到首页</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                      {otherPinnedExists ? '会替换当前已钉选的另一张卡' : '在 HERO 卡片上常驻显示这张卡'}
                    </div>
                  </div>
                </label>
              </Section>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-black/5 dark:border-white/5">
              <button
                onClick={handleSave}
                disabled={!canSave}
                className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all ${
                  canSave ? 'bg-primary text-white shadow-lg active:scale-98' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
              >
                {initialCard ? '保存修改' : '✦ 立此宣告'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * 纹理预览：按钮里渲染一小块 SVG 图案，颜色随 var(--color-primary) 变化。
 * 与 CallingCardCard 内的 TexturePattern 保持视觉一致。
 */
function TexturePreview({ kind }: { kind: 'lines' | 'grid' | 'dots' | 'plain' }) {
  if (kind === 'plain') return null;
  const stroke = 'color-mix(in hsl, var(--color-primary) 70%, transparent)';
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
      <defs>
        {kind === 'lines' && (
          <pattern id={`prev-${kind}`} patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke={stroke} strokeWidth="5" opacity="0.30" />
          </pattern>
        )}
        {kind === 'grid' && (
          <pattern id={`prev-${kind}`} patternUnits="userSpaceOnUse" width="14" height="14">
            <path d="M 14 0 L 0 0 0 14" fill="none" stroke={stroke} strokeWidth="0.7" opacity="0.40" />
          </pattern>
        )}
        {kind === 'dots' && (
          <pattern id={`prev-${kind}`} patternUnits="userSpaceOnUse" width="10" height="10">
            <circle cx="2" cy="2" r="1.0" fill={stroke} opacity="0.50" />
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#prev-${kind})`} />
    </svg>
  );
}
