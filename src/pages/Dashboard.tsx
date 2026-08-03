import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAppStore, toLocalDateKey } from '@/store';
import { TodoCompleteModal } from '@/components/TodoCompleteModal';
import { BattleDashboardWidget } from '@/components/BattleDashboardWidget';
import { StackCarousel } from '@/components/StackCarousel';
import { EyebrowLabel } from '@/components/EyebrowLabel';
import { BrandTitleReveal } from '@/components/BrandTitleReveal';
import { StarChartP3, NEUTRAL_STAR_PALETTE } from '@/components/StarChartP3';
import { AttributeDossier } from '@/components/AttributeDossier';
import { TAROT_BY_ID } from '@/constants/tarot';
import { CallingCardCard } from '@/components/callingCard/CallingCardCard';
import { CallingCardEmptyHint } from '@/components/callingCard/CallingCardEmptyHint';
import { playSound } from '@/utils/feedback';
import { getAttributeLevelTitle } from '@/utils/attributeLevelTitles';
import type { AttributeId, CallingCard } from '@/types';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower, P4Sparkle, P4SkyCircle, P4_HEADER_BLEED } from '@/ui/p4Kit';
import { FlowerChart } from '@/components/FlowerChart';
import { AttrDetailInlineP4 } from '@/components/AttrDetailInlineP4';
import { BigDealHomeCard } from '@/components/bigdeal/BigDealHomeCard';
import { BigDealPanel } from '@/components/bigdeal/BigDealPanel';
import { useSkyBadge } from '@/components/sky/useSkyBadge';
import { WeatherGlyph } from '@/components/sky/WeatherGlyph';

// Seeded random: picks a stable index per session (changes on every page open)
const sessionSeed = Math.random();
const pick = (arr: string[]) => arr[Math.floor(sessionSeed * arr.length)];

const GREETINGS: Record<string, string[]> = {
  dawn:    ['n，新的一天开始了', 'n，晨光已到，起身了', 'n，早安，今天也要加油', 'n，清晨的空气真好'],
  morning: ['n，上午好呀', 'n，精神抖擞地来了', 'n，今天也是充满可能的一天', 'n，感觉今天会很顺利'],
  noon:    ['n，午安', 'n，吃饭了吗', 'n，中午好，休息一下吧', 'n，下午前先补充点能量'],
  afternoon: ['n，下午好', 'n，继续保持状态', 'n，距离傍晚还有一段时光', 'n，喝点水，动一动'],
  dusk:    ['n，傍晚好', 'n，今天辛苦了', 'n，夕阳西下，你还在努力', 'n，快到收工时间了'],
  evening: ['n，晚上好', 'n，夜幕降临了', 'n，今天过得怎么样', 'n，享受安静的夜晚吧'],
  night:   ['n，还没睡呀', 'n，夜深了，注意休息', 'n，深夜的努力有人看见', 'n，该去睡觉了'],
};

const SUBTEXTS: Record<string, string[]> = {
  dawn:    ['🌅 新的一天，从现在开始', '🌄 破晓时分，充满希望', '🌿 清晨最是宝贵的时光', '☀️ 早起的鸟儿有虫吃'],
  morning: ['☀️ 上午阳光正好，继续加油', '🍵 来杯茶，开始高效的上午', '💪 今天的努力从这里出发', '🎯 专注一件事，今天就够了'],
  noon:    ['🍽️ 记得好好吃饭休息', '😴 午休一会儿，下午更清醒', '🌞 日正当中，能量满格', '🥗 犒劳一下自己吧'],
  afternoon: ['🌤️ 喝杯水，起来活动一下', '📖 下午适合深度学习', '🎵 放首歌，找回状态', '🌿 离目标又近了一步'],
  dusk:    ['🌇 今天的努力都算数', '🌆 收获感悟的黄金时刻', '🍊 傍晚散个步，清空思绪', '✨ 夕阳下的你格外有魅力'],
  evening: ['🌙 享受宁静的夜晚时光', '📝 记录今天的收获吧', '🕯️ 夜晚适合沉淀与反思', '🎮 适当放松，明天更精彩'],
  night:   ['🌟 注意休息，明天继续', '🌙 夜深了，给自己点掌声', '💫 深夜努力的人终会发光', '🛌 好好睡一觉，明天见'],
};

const getSlot = (h: number) => {
  if (h >= 5  && h < 9)  return 'dawn';
  if (h >= 9  && h < 12) return 'morning';
  if (h >= 12 && h < 14) return 'noon';
  if (h >= 14 && h < 17) return 'afternoon';
  if (h >= 17 && h < 19) return 'dusk';
  if (h >= 19 && h < 22) return 'evening';
  return 'night';
};

const getTimeGreeting = (userName: string) => {
  const slot = getSlot(new Date().getHours());
  return pick(GREETINGS[slot]).replace('n', userName);
};

const getTimeSubtext = () => {
  const slot = getSlot(new Date().getHours());
  return pick(SUBTEXTS[slot]);
};

// Level colors: a progression from cool to warm
const LV_COLORS = [
  { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-400' },
  { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-600 dark:text-sky-400', bar: 'bg-sky-500' },
  { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-600 dark:text-blue-400', bar: 'bg-blue-500' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-600 dark:text-violet-400', bar: 'bg-violet-500' },
  { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-600 dark:text-purple-400', bar: 'bg-purple-500' },
  { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-600 dark:text-pink-400', bar: 'bg-pink-500' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  { bg: 'bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40', text: 'text-amber-700 dark:text-amber-300', bar: 'bg-gradient-to-r from-amber-400 to-orange-400' },
];

// （P8.1）recharts 雷达图退役：五维展示统一走 StarChart 星象仪（P5 式星形舞台 + 刻度点 + 可点贴纸）

const ATTR_ORDER_KEY = 'attr-card-order';
const ATTR_WIDE_KEY  = 'attr-card-wide';   // which id (if any) is wide (col-span-2)

// DropTarget for the last row: 'half' = normal half-width, 'wide' = full-width, null = nothing
type LastRowDrop = 'half' | 'wide' | null;

// P8.1 星象仪上位后暂无挂载（保留 export 供 P9 首页批次决定去留：拖拽排序/宽卡逻辑完整）
export const AttributeGrid = ({ attributes, settings, onEditingChange }: {
  attributes: ReturnType<typeof useAppStore.getState>['attributes'];
  settings: ReturnType<typeof useAppStore.getState>['settings'];
  /**
   * 编辑态（排序模式）切换回调。本组件现挂在 StackCarousel 的 slide 里，
   * 排序拖拽与外层横滑是两套水平 pointer 手势——父层用该回调维护 locked，
   * 编辑期间锁死外层横滑，防互抢。除此回调外内部逻辑零改动。
   */
  onEditingChange?: (editing: boolean) => void;
}) => {
  // --- persistent order ---
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(ATTR_ORDER_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const ids = attributes.map(a => a.id as string);
        if (parsed.length === ids.length && ids.every(id => parsed.includes(id))) return parsed;
      }
    } catch { /* ignore */ }
    return attributes.map(a => a.id as string);
  });

  // which id is wide (col-span-2); only the last positionally-odd card can be wide
  const [wideId, setWideId] = useState<string | null>(() => {
    try { return localStorage.getItem(ATTR_WIDE_KEY); } catch { return null; }
  });

  useEffect(() => {
    const ids = attributes.map(a => a.id as string);
    setOrder(prev => {
      const next = [...prev.filter(id => ids.includes(id)), ...ids.filter(id => !prev.includes(id))];
      return next;
    });
  }, [attributes]);

  useEffect(() => { localStorage.setItem(ATTR_ORDER_KEY, JSON.stringify(order)); }, [order]);
  useEffect(() => {
    if (wideId) localStorage.setItem(ATTR_WIDE_KEY, wideId);
    else localStorage.removeItem(ATTR_WIDE_KEY);
  }, [wideId]);

  // --- edit mode (tap header button to enter/exit) ---
  const [editMode, setEditMode] = useState(false);

  // --- drag state (pointer-based, only active in editMode) ---
  const [dragId, setDragId]   = useState<string | null>(null);
  const [overId, setOverId]   = useState<string | null>(null);
  // for the last-row ghost drop zone
  const [lastRowDrop, setLastRowDrop] = useState<LastRowDrop>(null);
  // for the first-row ghost drop zone
  const [firstRowDrop, setFirstRowDrop] = useState<LastRowDrop>(null);

  const isDragging = dragId !== null;
  const gridRef    = useRef<HTMLDivElement>(null);
  const cardRefs   = useRef<Map<string, HTMLDivElement>>(new Map());
  const activePointerId = useRef<number | null>(null);
  // Track whether pointer moved enough to count as a drag (vs a tap)
  const dragMoved = useRef(false);
  const dragStartX = useRef<number>(0);
  const dragStartY = useRef<number>(0);

  // Non-passive touchmove: block scroll only during active drag
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const blockScroll = (e: TouchEvent) => {
      if (isDragging) e.preventDefault();
    };
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, [isDragging]);

  const onPointerDown = (id: string, e: React.PointerEvent) => {
    if (!editMode) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragMoved.current = false;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    activePointerId.current = e.pointerId;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (navigator.vibrate) navigator.vibrate(20);
    setDragId(id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    if (e.pointerId !== activePointerId.current) return;
    const x = e.clientX;
    const y = e.clientY;

    // track whether user actually moved
    if (!dragMoved.current) {
      const dist = Math.hypot(x - dragStartX.current, y - dragStartY.current);
      if (dist > 4) dragMoved.current = true;
    }

    // find which card the pointer is over
    let foundId: string | null = null;
    cardRefs.current.forEach((el, id) => {
      if (id === dragId) return;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        foundId = id;
      }
    });
    setOverId(foundId);

    // detect if we're hovering the first-row or last-row ghost zone
    if (gridRef.current) {
      const gridRect = gridRef.current.getBoundingClientRect();

      // check first-row ghost
      const firstGhostEl = gridRef.current.querySelector('[data-first-ghost]') as HTMLElement | null;
      if (firstGhostEl) {
        const gr = firstGhostEl.getBoundingClientRect();
        if (x >= gr.left && x <= gr.right && y >= gr.top && y <= gr.bottom) {
          const relX = x - gr.left;
          setFirstRowDrop(relX < gr.width * 0.35 ? 'half' : 'wide');
          setLastRowDrop(null);
          setOverId(null);
          return;
        }
      }

      // check last-row ghost
      const ghostEl  = gridRef.current.querySelector('[data-ghost]') as HTMLElement | null;
      if (ghostEl) {
        const gr = ghostEl.getBoundingClientRect();
        if (x >= gr.left && x <= gr.right && y >= gr.top && y <= gr.bottom) {
          const relX = x - gr.left;
          setLastRowDrop(relX < gr.width * 0.35 ? 'half' : 'wide');
          setFirstRowDrop(null);
          setOverId(null);
          return;
        }
      }
      const lastRow = Array.from(cardRefs.current.values()).reduce<number>((max, el) => {
        return Math.max(max, el.getBoundingClientRect().bottom);
      }, 0);
      if (y > lastRow && x >= gridRect.left && x <= gridRect.right) {
        const relX = x - gridRect.left;
        setLastRowDrop(relX < gridRect.width * 0.35 ? 'half' : 'wide');
        setFirstRowDrop(null);
        setOverId(null);
        return;
      }
    }
    setLastRowDrop(null);
    setFirstRowDrop(null);
  };

  const onPointerUp = (id: string, _e: React.PointerEvent) => {
    if (!isDragging) { activePointerId.current = null; return; }

    // tap (no movement) on wide card → shrink it
    if (!dragMoved.current && id === wideId) {
      setWideId(null);
    } else if (dragMoved.current) {
      // commit the drop
      if (firstRowDrop !== null && dragId) {
        setOrder(prev => {
          const next = prev.filter(i => i !== dragId);
          next.unshift(dragId);
          return next;
        });
        setWideId(firstRowDrop === 'wide' ? dragId : null);
      } else if (lastRowDrop !== null && dragId) {
        setOrder(prev => {
          const next = prev.filter(i => i !== dragId);
          next.push(dragId);
          return next;
        });
        setWideId(lastRowDrop === 'wide' ? dragId : null);
      } else if (overId && dragId && overId !== dragId) {
        setOrder(prev => {
          const fromIdx = prev.indexOf(dragId);
          const toIdx   = prev.indexOf(overId);
          const next    = [...prev];
          next.splice(fromIdx, 1);
          next.splice(toIdx, 0, dragId);
          return next;
        });
        if (wideId === dragId) setWideId(null);
      }
    }

    setDragId(null);
    setOverId(null);
    setLastRowDrop(null);
    setFirstRowDrop(null);
    activePointerId.current = null;
  };

  const onPointerCancel = () => {
    setDragId(null);
    setOverId(null);
    setLastRowDrop(null);
    setFirstRowDrop(null);
    activePointerId.current = null;
  };

  // sorted attrs
  const sortedAttrs = order.map(id => attributes.find(a => a.id === id)!).filter(Boolean);

  // figure out last/first positions — the card that would be alone in its row
  const lastIdxInOddRow = sortedAttrs.length % 2 !== 0 ? sortedAttrs.length - 1 : -1;
  const lastId          = lastIdxInOddRow >= 0 ? sortedAttrs[lastIdxInOddRow].id : null;
  const firstId         = sortedAttrs.length > 0 ? sortedAttrs[0].id : null;
  // effectiveWideId: only valid if wideId is actually first or last (mutually exclusive)
  const effectiveWideId = (wideId === firstId || wideId === lastId) ? wideId : null;

  // show ghost zones when dragging
  const showGhost      = isDragging && dragId !== lastId;
  const showFirstGhost = isDragging && dragId !== firstId;

  return (
    <div
      ref={gridRef}
      onPointerMove={onPointerMove}
      style={{ userSelect: 'none' }}
    >
      <div className="flex items-center justify-between mb-3 px-0.5">
        {/* 审计 S6：PageTitle 是页级标题，曾被误用作区块标题造成双重语义；
            入叠放后区块标题由外层 EyebrowLabel 承担，这里降级为普通标题行 */}
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">人格指数</h3>
        <button
          onClick={() => {
            const next = !editMode;
            setEditMode(next);
            onEditingChange?.(next);
            setDragId(null); setOverId(null); setLastRowDrop(null); setFirstRowDrop(null);
          }}
          className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors select-none ${
            editMode
              ? 'bg-primary text-white'
              : 'text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800'
          }`}
        >
          {editMode ? '完成' : '排序'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* First-row ghost drop zone — shown when dragging a non-first card */}
        {showFirstGhost && (
          <motion.div
            data-first-ghost
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={`rounded-2xl border-2 border-dashed flex items-center justify-center h-24 transition-all ${
              firstRowDrop === 'wide'
                ? 'col-span-2 border-primary bg-primary/5'
                : firstRowDrop === 'half'
                ? 'col-span-1 border-primary bg-primary/5'
                : 'col-span-2 border-gray-200 dark:border-gray-700'
            }`}
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 pointer-events-none select-none">
              {firstRowDrop === 'wide' ? '放开 → 占满一行' : firstRowDrop === 'half' ? '放开 → 等宽' : '拖到最前'}
            </span>
          </motion.div>
        )}

        {sortedAttrs.map((attr) => {
          const isWide     = attr.id === effectiveWideId;
          const isDragCard = attr.id === dragId;
          const isOverCard = attr.id === overId;

          const attrThresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr.levelThresholds;
          const lvlMax      = attrThresholds.length;
          const isMax       = attr.level >= lvlMax;
          const curThreshold  = attr.level > 1 ? attrThresholds[attr.level - 1] : 0;
          const nextThreshold = !isMax ? attrThresholds[attr.level] : attrThresholds[lvlMax - 1];
          const pct = isMax ? 100 : Math.min(100, ((attr.points - curThreshold) / (nextThreshold - curThreshold)) * 100);
          const attrId     = attr.id as AttributeId;
          const attrName   = settings.attributeNames[attrId];
          const levelTitle = getAttributeLevelTitle(settings.attributeLevelTitles, attrId, attr.level);
          const colorTier  = LV_COLORS[Math.min(attr.level - 1, LV_COLORS.length - 1)];

          return (
            <motion.div
              key={attr.id}
              layout
              ref={(el) => { if (el) cardRefs.current.set(attr.id, el); else cardRefs.current.delete(attr.id); }}
              animate={{ opacity: isDragCard ? 0.35 : 1, scale: isOverCard ? 1.03 : 1 }}
              transition={{ duration: 0.15 }}
              onPointerDown={editMode ? (e) => onPointerDown(attr.id, e) : undefined}
              onPointerUp={editMode ? (e) => onPointerUp(attr.id, e) : undefined}
              onPointerCancel={editMode ? () => onPointerCancel() : undefined}
              // 非编辑态用 manipulation（双向 pan 放行 + 禁双击缩放）：pan-y 会吃掉横向手势，
              // 从卡面起手将无法滑动外层「成长」叠放；编辑态 none 交给拖拽排序全权接管
              style={{ touchAction: editMode ? 'none' : 'manipulation' }}
              className={`relative rounded-2xl bg-white dark:bg-gray-900 border shadow-sm overflow-hidden flex flex-col transition-colors ${
                editMode
                  ? isDragCard
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : ''
              } ${
                isOverCard
                  ? 'border-primary/60 dark:border-primary/50 shadow-md'
                  : editMode
                  ? 'border-primary/30 dark:border-primary/20'
                  : 'border-gray-100 dark:border-gray-800'
              } ${isWide ? 'col-span-2' : ''}`}
            >
              {/* edit mode: wide-card tap-to-shrink hint */}
              {editMode && isWide && (
                <div className="absolute top-2 right-3 text-[9px] text-primary/60 dark:text-primary/50 select-none">点击收起</div>
              )}

              {/* Card body */}
              <div className="flex items-start justify-between px-4 pt-4 pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{attrName}</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${colorTier.text} opacity-70`}>LV</span>
                    <span
                      className={`font-black leading-none tabular-nums ${colorTier.text} ${isMax ? 'text-2xl' : 'text-4xl'}`}
                      style={{ letterSpacing: '-0.03em' }}
                    >
                      {isMax ? 'MAX' : attr.level}
                    </span>
                  </div>
                </div>
                <div className="text-right mt-1 flex-shrink-0">
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {isMax ? '满级' : `${attr.points}/${nextThreshold}`}
                  </span>
                </div>
              </div>

              {/* Progress bar + hint */}
              <div className="mt-auto px-4 pb-4">
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'var(--color-primary)', opacity: 0.85 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 min-h-[18px]">
                  <div className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black tabular-nums whitespace-nowrap ${colorTier.bg} ${colorTier.text}`}>
                    {levelTitle}
                  </div>
                  {!isMax && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right whitespace-nowrap tabular-nums">
                      差 <span className="font-semibold">{nextThreshold - attr.points}</span> 升 Lv.{attr.level + 1}
                    </p>
                  )}
                  {isMax && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right whitespace-nowrap">
                      已达满级
                    </p>
                  )}
                </div>
              </div>

              {/* Bottom accent strip */}
              <div
                className="absolute bottom-0 left-0 right-0 h-0.5 opacity-40"
                style={{ background: 'linear-gradient(to right, transparent, var(--color-primary), transparent)' }}
              />
            </motion.div>
          );
        })}

        {/* Ghost drop zone — shown when dragging a non-last card */}
        {showGhost && (
          <motion.div
            data-ghost
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={`rounded-2xl border-2 border-dashed flex items-center justify-center h-24 transition-all ${
              lastRowDrop === 'wide'
                ? 'col-span-2 border-primary bg-primary/5'
                : lastRowDrop === 'half'
                ? 'col-span-1 border-primary bg-primary/5'
                : 'col-span-2 border-gray-200 dark:border-gray-700'
            }`}
          >
            <span className="text-xs text-gray-400 dark:text-gray-500 pointer-events-none select-none">
              {lastRowDrop === 'wide' ? '放开 → 占满一行' : lastRowDrop === 'half' ? '放开 → 等宽' : '拖到这里'}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  );
};

// Returns true if the hex color is perceptually light (luminance > 0.4)
const isLightColor = (hex: string): boolean => {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  // sRGB luminance
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4;
};

// ── P4 天空角标（PRD_V2.6 §7）────────────────────────────────────────────────
const P4_MOON_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月'];
const P4_SYNODIC = 29.530588853;
const P4_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

/** 月相（与 P3/P5 同一历元同一算法，只是各页各写一份渲染） */
const p4MoonOf = (date: Date) => {
  const days = (date.getTime() - P4_EPOCH) / 86400000;
  const phase = (((days % P4_SYNODIC) + P4_SYNODIC) % P4_SYNODIC) / P4_SYNODIC;
  const idx = Math.round(phase * 8) % 8;
  return { phase, name: P4_MOON_NAMES[idx], illum: (1 - Math.cos(2 * Math.PI * phase)) / 2 };
};

const p4MoonLit = (phase: number, r: number, c: number) => {
  const rx = Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * phase)) * r);
  const outer = phase < 0.5 ? 1 : 0;
  const term = phase > 0.25 && phase < 0.75 ? outer : 1 - outer;
  return `M ${c} ${c - r} A ${r} ${r} 0 0 ${outer} ${c} ${c + r} A ${rx} ${r} 0 0 ${term} ${c} ${c - r} Z`;
};

/**
 * 黑药丸角标，压在大日期牌下沿。做成「角标」而不是像 P3/P5 那样一整块，
 * 是因为 P4 页头右上已经被日期牌 + 天空圆占满了——再塞一块读数区会把标题挤下去。
 * p4-onlight：墨字在浅色天空圆上，夜间不许跟全局翻浅（用户 R16 口径）。
 */
const P4SkyBadge = () => {
  const { mode, toggle, weather, loading, error, ready } = useSkyBadge();
  const m = p4MoonOf(new Date());
  const label = mode === 'weather'
    ? (!ready ? '设置天气' : error ? '取不到' : loading ? '取数中' : `${weather?.temp}° ${weather?.text}`)
    : `${m.name} ${Math.round(m.illum * 100)}%`;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mode === 'weather' ? '天气（点击切回月相）' : '月相（点击切到天气）'}
      className="mt-1.5 flex max-w-[112px] items-center gap-1 rounded-full px-2 py-1"
      style={{ background: '#131313' }}
    >
      {mode === 'weather' ? (
        <WeatherGlyph icon={weather?.icon} size={14} ink="#fff3c4" accent="var(--p4-orange, #f9a11b)" />
      ) : (
        <svg viewBox="0 0 36 36" width={14} height={14} aria-hidden>
          <circle cx="18" cy="18" r="16" fill="#3a3a3a" />
          <path d={p4MoonLit(m.phase, 16, 18)} fill="#ffd900" />
        </svg>
      )}
      <span className="truncate text-[9px] font-black leading-none tracking-wide" style={{ color: '#fff3c4' }}>
        {label}
      </span>
    </button>
  );
};

export const Dashboard = () => {
  const { attributes, user, settings, todos, activities, achievements, skills, completeTodo, getTodayTodoProgress, setModalBlocker, setCurrentPage, applyCountercurrentDecay, getCountercurrentWarnings, callingCards } = useAppStore();
  const [completedTitle, setCompletedTitle] = useState<string | null>(null);
  const [completedPoints, setCompletedPoints] = useState(1);
  const [unlockHint, setUnlockHint] = useState<{ achievements: number; skills: number }>({ achievements: 0, skills: 0 });
  // 涟漪反馈（任务按钮列表）
  const [todoRipples, setTodoRipples] = useState<Record<string, Array<{id: number; x: number; y: number}>>>({});
  const todoRippleId = useRef(0);
  const spawnTodoRipple = (todoId: string, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = todoRippleId.current++;
    setTodoRipples(prev => ({ ...prev, [todoId]: [...(prev[todoId] ?? []), { id, x, y }] }));
    setTimeout(() => setTodoRipples(prev => ({ ...prev, [todoId]: (prev[todoId] ?? []).filter(r => r.id !== id) })), 600);
  };
  // 逆流衰减弹窗
  const [decayedAttrs, setDecayedAttrs] = useState<import('@/types').AttributeId[]>([]);

  // ── 宣告卡 / 倒计时 ─────────────────────────────────────────
  // F3 终端任务存于 callingCards 表但不是宣告卡：钉选 / 空态 / 计数都按非终端卡口径
  const realCallingCards = callingCards.filter(c => !c.terminal);
  const pinnedCallingCard: CallingCard | null = realCallingCards.find(c => c.pinned && !c.archived) ?? null;
  // 注：CutIn 已经移到 App.tsx 顶层（GlobalCallingCardCutIn），这里只关心"钉选展示"

  // 临期 Toast（D1）：≤ 3 天且当日首次见到时弹一次（localStorage 防骚扰）
  const [urgentToast, setUrgentToast] = useState<string | null>(null);
  useEffect(() => {
    if (!pinnedCallingCard || !pinnedCallingCard.targetDate) return;
    const today = new Date(toLocalDateKey() + 'T00:00:00');
    const target = new Date(pinnedCallingCard.targetDate + 'T00:00:00');
    const daysLeft = Math.max(0, Math.round((target.getTime() - today.getTime()) / 86400000));
    if (daysLeft > 3 || daysLeft <= 0) return;
    const storageKey = `velvet_cc_urgent_${pinnedCallingCard.id}_${toLocalDateKey()}`;
    try {
      if (localStorage.getItem(storageKey) === '1') return;
      localStorage.setItem(storageKey, '1');
    } catch { /* 隐私模式 → 跳过节流 */ }
    setUrgentToast(`「${pinnedCallingCard.title}」还剩 ${daysLeft} 天`);
    // 红主题切换音，仪式感
    playSound('/themec-switch.mp3', 0.6);
    const t = setTimeout(() => setUrgentToast(null), 3600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedCallingCard?.id, pinnedCallingCard?.targetDate]);

  // 跳转 Tasks 页 + 滚到 calling card 区
  const jumpToCallingCardSection = () => {
    try {
      sessionStorage.setItem('velvet:todos-goal-panel', 'countdown');
    } catch { /* ignore unavailable sessionStorage */ }
    setCurrentPage('todos');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('velvet:open-calling-card-panel'));
        const el = document.getElementById('calling-card-section');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  };

  // Detect primary color luminance for banner text contrast
  const [bannerLight, setBannerLight] = useState(false);
  useEffect(() => {
    const check = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
      if (raw) setBannerLight(isLightColor(raw));
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // 逆流：进入首页时检查并执行衰减
  useEffect(() => {
    if (!settings.countercurrentEnabled) return;
    applyCountercurrentDecay().then(decayed => {
      if (decayed.length > 0) setDecayedAttrs(decayed);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.countercurrentEnabled]);

  // 逆流预警（今天是第3日无增长，明天将扣减）
  const countercurrentWarnings = settings.countercurrentEnabled ? getCountercurrentWarnings() : [];
  const hasCountercurrentWarning = countercurrentWarnings.length > 0;

  // ──「今日仪式」叠放：预警条件 false→true 的沿触发自动滑到第一页（预警页恒在第 0 页）。
  // StackCarousel 的 page 语义是"值变化时跳页"而非强受控，所以跳完必须复位回 undefined，
  // 否则下一次沿到来时 0→0 无变化、不会再触发；复位本身因 page == null 直接 return，不产生滚动。
  // prevWarningRef 初值取 false：带着预警进入本页也算一次沿——规格 §3.1 要求"有事时自动滑到第一页"，
  // 不能因为页位记忆停在别页而让预警藏在视野外。
  const [ritualPage, setRitualPage] = useState<number | undefined>(undefined);
  const prevWarningRef = useRef(false);
  useEffect(() => {
    const prev = prevWarningRef.current;
    prevWarningRef.current = hasCountercurrentWarning;
    if (prev || !hasCountercurrentWarning) return;
    setRitualPage(0);
    const t = setTimeout(() => setRitualPage(undefined), 600);
    return () => clearTimeout(t);
  }, [hasCountercurrentWarning]);

  // 「成长」叠放锁：属性卡排序编辑期间锁死外层横滑（拖拽与横滑同为水平手势，会互抢 pointer）
  // P8.1 星象仪：点角打开的属性档案（非 P4 走弹窗；P4 走花瓣图原地展开，见下）
  const [dossierAttr, setDossierAttr] = useState<AttributeId | null>(null);
  // P4 花瓣图点击波纹：状态放在区块层（不在会被旋转/淡出的花层内），才看得见
  const [petalRipples, setPetalRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const petalSectionRef = useRef<HTMLDivElement>(null);

  // In dark mode the UI background is dark, so light text always reads better on the colored banner
  // P4（p4-redraw 定稿）：问候卡是黑色斜板，文字奶油/黄，覆盖亮暗判定
  const isP4 = useUiChannel() === 'p4';
  const useLightText = settings.darkMode || !bannerLight;
  const textClass = isP4 ? 'text-[#fff6d0]' : useLightText ? 'text-white' : 'text-black/90';
  const textMutedClass = isP4 ? 'text-[var(--ui-bg)]' : useLightText ? 'text-white/70' : 'text-black/50';
  const textSecondaryClass = isP4 ? 'text-[#fff6d0]/80' : useLightText ? 'text-white/80' : 'text-black/60';
  const trackClass = isP4 ? 'bg-white/15' : useLightText ? 'bg-white/20' : 'bg-black/10';


  // P8.1 星象仪数据：名 / 等级 / 称号（点亮刻度 = level/maxLevel）
  const starItems = attributes.map(attr => {
    const attrThresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr.levelThresholds;
    const attrId = attr.id as AttributeId;
    return {
      id: attrId,
      name: settings.attributeNames[attrId] || attr.displayName,
      level: attr.level,
      maxLevel: attrThresholds.length || 5,
      points: attr.points,
      title: getAttributeLevelTitle(settings.attributeLevelTitles, attrId, attr.level),
    };
  });

  const today = new Date();
  const todayWeekday = today.getDay();
  const todayKey = toLocalDateKey(today);

  // BIG DEAL 聚合卡数据 + 二级面板（批2）
  const [dealPanelId, setDealPanelId] = useState<string | null>(null);

  const todayTodos = [...todos.filter(todo => {
      // BIG DEAL **必须留在这个列表里**。
      // 排序把它顶到最前、下面的渲染分支再把它换成 BigDealHomeCard——
      // 这是「大事并入今日任务内部」那次改动定的形（PRD_V2.6 §2.1 / 反馈 §9）。
      // 之前这里还留着上一版「大事走列表上方独立板块」时代的排除条件，
      // 于是 BIG DEAL 被这一行整个滤掉：排序是死代码、BigDealHomeCard 分支永远进不去，
      // 用户那句「反正就是没看到」说的就是它。完成计数另行排除（见 completedCount）。
    const matchesWeekday = !todo.weekdays || todo.weekdays.length === 0 || todo.weekdays.includes(todayWeekday);
    // 未来启用日期的任务今天不显示
    if (todo.startDate && todo.startDate > todayKey) return false;
    if (todo.isActive && matchesWeekday) return true;
    if (!todo.isActive && todo.archivedAt) {
      const archivedKey = toLocalDateKey(new Date(todo.archivedAt));
      if (archivedKey === todayKey && matchesWeekday) {
        const target = todo.frequency === 'count' ? (todo.targetCount || 1) : 1;
        const progress = getTodayTodoProgress(todo.id);
        return progress.count >= target;
      }
    }
    return false;
  })].sort((a, b) => {
    // BIG DEAL 恒在最上（PRD_V2.6 §2.1）：它是"这段时间最重要的一件事"，
    // 排在普通待办之后就等于每天都要滚一下才看得见，与它的分量不符
    if (a.isBigDeal && !b.isBigDeal) return -1;
    if (!a.isBigDeal && b.isBigDeal) return 1;
    if (a.important && !b.important) return -1;
    if (!a.important && b.important) return 1;
    return 0;
  });

  // 「N/M」只统计**可勾选**的普通待办。BIG DEAL 不是靠勾一下完成的（它逐子步推进、
  // 满步才收官），算进分母会让这个比值永远到不了头。
  const tickableTodos = todayTodos.filter(t => !t.isBigDeal);
  const completedCount = tickableTodos.filter(t => getTodayTodoProgress(t.id).isComplete).length;
  const totalCount = tickableTodos.length;

  // 统计数据
  const totalPoints = attributes.reduce((sum, attr) => sum + attr.points, 0);
  const totalLevel = attributes.reduce((sum, attr) => sum + (attr.level ?? 0), 0);
  const totalActivitiesCount = activities.length;
  const unlockedAchievementsCount = achievements.filter(a => a.unlocked).length;
  const unlockedSkillsCount = skills.filter(s => s.unlocked).length;
  const uniqueDays = new Set(activities.map(a => new Date(a.date).toDateString())).size;
  const uniqueTimestamps = [...new Set(activities.map(a => new Date(a.date).toDateString()))]
    .map(d => new Date(d).getTime()).sort((a, b) => a - b);
  const ONE_DAY = 86400000;
  let maxStreak = uniqueTimestamps.length > 0 ? 1 : 0;
  let currentStreak = 1;
  for (let i = 1; i < uniqueTimestamps.length; i++) {
    if (uniqueTimestamps[i] - uniqueTimestamps[i - 1] === ONE_DAY) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 1;
    }
  }

  // ──「今日仪式」叠放页组装（规格 §3.1 槽位 4）────────────────────────
  // 约束：children 必须用数组按条件组入，不能把"内部可能 return null 的组件"直接
  // 挂进 StackCarousel——它按 children 个数生成 slide 与圆点，null 会变成空白页。
  // 各 slide 外包 h-full + [&>*]:h-full：carousel 用 items-stretch 把 slide 撑到
  // 最高页等高，arbitrary variant 穿透一层让卡片根元素（button/div）纵向跟满。
  const ritualSlides: ReactNode[] = [];
  if (hasCountercurrentWarning) {
    // 预警条件成立时才入组、且恒为第一页（规格：条件插入并置顶）；JSX 自原全宽预警条原样搬入，视觉不改
    ritualSlides.push(
      <div key="countercurrent" className="h-full [&>*]:h-full">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-blue-200 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center gap-3"
        >
          <span className="text-lg flex-shrink-0">🌊</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">逆流预警</p>
            <p className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-0.5">
              {countercurrentWarnings.map(id => settings.attributeNames[id]).join('、')} 已连续3日无增长，明日将{countercurrentWarnings.length > 1 ? '各' : ''}扣减 1 点
            </p>
          </div>
        </motion.div>
      </div>
    );
  }
  ritualSlides.push(
    <div key="astrology" className="h-full [&>*]:h-full">
      <AstrologyEntryCard onOpen={() => setCurrentPage('astrology')} />
    </div>
  );
  // F3 治疗终端已并入任务系统（TASKS_MERGE_PRD）：入口退役，能力由 BIG DEAL / 抽签承接
  if (settings.battleEnabled !== false) {
    // BattleDashboardWidget 在 battleEnabled === false 时内部 return null，必须在此处就拦下不入数组
    ritualSlides.push(
      <div key="battle" className="h-full [&>*]:h-full">
        <BattleDashboardWidget />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`relative mx-auto max-w-2xl md:max-w-none ${isP4 ? 'space-y-3.5' : 'space-y-5'}`}
    >
      {/* 斜界引力线（问候卡 → 今日任务的"先竖后斜"动线）已随 FS2.2 下架：
          这个分支现在只服务 custom 主题，用户口径是那条线"莫名其妙"——
          中性皮不做戏剧化引导，卡片自己的顺序就是动线。 */}

      {/* 竖屏流光品牌标题 — 仅在非宽屏显示，banner正上方。
          GSAP 时间线 + SplitText 逐字入场（BrandTitleReveal 内部 D0 守卫 + revert 清理）。
          P4（p4-dashboard-reference-v2 1:1）：衬线特大标题 + TODAY'S SHOW 眉标 + 右上大日期，
          右上角橙色太阳环 + 天空扇 + 花朵，元素出血到屏幕右缘。 */}
      {isP4 ? (
        <div className="relative -mx-4 min-h-[126px] px-4 pb-1 pt-2" style={P4_HEADER_BLEED}>
          {/* 首页天空改与行动页同制式：整圆出血到右上角外（用户对照：行动页的圆没问题，
              扇形的弧线终点落在屏幕右缘内、末段近乎水平，看着像被水平切了一刀）。
              圆的弧永远越出屏幕边缘，不存在"终点落在屏内"这回事。-top 同时抵掉 main 的 pt。 */}
          <P4SkyCircle size={210} className="absolute -right-16 -top-16 opacity-95" flower={false} />
          <P4Sparkle size={20} color="#ffffff" className="absolute right-[44%] top-3" />
          <P4Sparkle size={14} color="var(--ui-accent)" className="absolute right-[40%] top-[96px]" />
          {/* 大日期牌（压在天空上）：p4-onlight——牌坐在浅色天空圆上，
              夜间墨字不许跟全局翻浅（用户 R16：角标保持黑） */}
          <div className="p4-onlight absolute right-5 top-1 text-center">
            <div className="text-[40px] font-black leading-none tabular-nums text-[#131313]">
              {String(today.getDate()).padStart(2, '0')}
            </div>
            <div className="text-[13px] font-black tracking-[0.2em] text-[#131313]">
              {today.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
            </div>
            <div className="mt-0.5 text-[11px] font-black tracking-[0.2em] text-[#131313]/80">
              {today.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
            </div>
            {/* 天空角标（PRD_V2.6 §7）：黄频道此前**没有天空位**——
                天空圆只是张背景图，月相/天气无处可落。这里补一枚压在日期牌下沿的小角标，
                点一下在月相 ⇄ 天气之间切，模式记进 settings（与 P3/P5 同口径）。 */}
            <P4SkyBadge />
          </div>
          <h1
            className="relative w-[62%] break-words text-[46px] font-black leading-[1.05] tracking-tight text-[#131313]"
            style={{ fontFamily: 'var(--p4-display-font, serif)' }}
          >
            靛蓝色房间
          </h1>
          <div className="relative mt-1.5 text-[13px] font-black tracking-[0.16em] text-[#131313]">
            TODAY&apos;S SHOW · <span className="text-[var(--p4-orange,#f9a11b)]">04</span>
          </div>
        </div>
      ) : (
        <BrandTitleReveal darkMode={settings.darkMode} />
      )}

      {/* 顶部问候卡：P4 = 黑色斜切题板（黄小字 + 奶油大字），日期已上移到页头 */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className={isP4 ? 'relative p-5' : 'relative rounded-2xl p-5 shadow-lg shadow-primary/20'}
        style={
          isP4
            ? { background: '#131313', borderRadius: 18, transform: 'skewX(-2deg)', boxShadow: '0 5px 0 rgba(19,19,19,0.2)' }
            : { background: 'color-mix(in srgb, color-mix(in hsl, var(--color-primary) 30%, gray) 92%, transparent)' }
        }
      >
       <div style={isP4 ? { transform: 'skewX(2deg)' } : undefined}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <p className={`text-xs mb-1.5 font-bold ${textMutedClass}`}>{getTimeSubtext()}</p>
            <h2 className={`text-2xl font-black tracking-tight leading-tight ${textClass}`}>{getTimeGreeting(user?.name || '朋友')}</h2>
          </div>
          {!isP4 && (
            <div className="flex flex-col items-center gap-0 flex-shrink-0">
              <div className={`text-4xl font-black leading-none tabular-nums ${textClass}`} style={{ letterSpacing: '-0.03em' }}>
                {String(today.getDate()).padStart(2, '0')}
              </div>
              <div className={`text-[10px] font-bold tracking-widest uppercase text-center ${textMutedClass}`}>
                {today.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
              </div>
              <div className={`text-[10px] font-medium px-1.5 py-0.5 rounded mt-1 ${useLightText ? 'bg-white/15 text-white/90' : 'bg-black/10 text-black/70'}`}>
                {today.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </div>
            </div>
          )}
        </div>
        {/* 钉选的宣告卡 / 倒计时 —— 极简横条嵌在问候卡中，今日进度上方 */}
        {pinnedCallingCard && (
          <div className={`mt-4 ${textClass}`}>
            <CallingCardCard
              card={pinnedCallingCard}
              variant="inline"
              onProgressClick={jumpToCallingCardSection}
            />
          </div>
        )}

        {/* 占位符：从未建 / 有但未钉选时分别给两种 hint */}
        {!pinnedCallingCard && realCallingCards.length === 0 && (
          <div className="mt-4">
            <CallingCardEmptyHint onJump={jumpToCallingCardSection} />
          </div>
        )}
        {!pinnedCallingCard && realCallingCards.filter(c => !c.archived).length > 0 && (
          <button
            onClick={jumpToCallingCardSection}
            className={`mt-4 w-full text-left px-3 py-2 rounded-xl text-[11px] flex items-center gap-2 ${useLightText ? 'bg-white/[0.12] text-white/80 hover:bg-white/20' : 'bg-black/[0.08] text-black/65 hover:bg-black/15'} transition-colors`}
          >
            <span>📌</span>
            <span className="flex-1">
              你有 {realCallingCards.filter(c => !c.archived).length} 张倒计时未钉到主页
            </span>
            <span className="opacity-60">›</span>
          </button>
        )}

        {totalCount > 0 && (
          <div className="mt-4">
            <div className={`flex items-center justify-between text-sm mb-1.5 ${textSecondaryClass}`}>
              <span>今日进度</span>
              <span>{completedCount}/{totalCount} 项完成</span>
            </div>
            <div className={`h-1.5 rounded-full overflow-hidden ${trackClass}`}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: isP4
                    ? 'linear-gradient(to right, var(--p4-orange, #f9a11b), var(--ui-bg))'
                    : 'linear-gradient(to right, #EF4444, #3B82F6, #F59E0B)',
                }}
                initial={{ width: 0 }}
                animate={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
       </div>
      </motion.div>

      <BigDealPanel todoId={dealPanelId} onClose={() => setDealPanelId(null)} />

      {/* 今日任务 ×「今日仪式」：竖屏上下排（并排时两栏都太挤，用户口径），宽屏才回双列 */}
      <div className={isP4 ? 'grid grid-cols-1 items-stretch gap-3 md:grid-cols-2' : 'space-y-5'}>
      <div
        className={
          isP4
            ? 'relative overflow-hidden rounded-[20px] bg-[var(--ui-paper)]'
            : 'relative rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden'
        }
        style={isP4 ? { boxShadow: '0 3px 0 rgba(19,19,19,0.12)' } : undefined}
      >
        {isP4 ? (
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#131313]/10 px-4 pb-2.5 pt-4">
            <div className="flex min-w-0 items-center gap-2">
              <P4Flower size={18} color="var(--ui-bg)" />
              <h3 className="truncate text-[15px] font-black text-[#131313]">今日任务</h3>
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage('todos')}
              aria-label="查看全部任务"
              className="shrink-0 rounded-full px-2 py-0.5 text-[13px] font-black tabular-nums text-[#131313] transition active:scale-95"
              style={{ background: 'rgba(19,19,19,0.08)' }}
            >
              {totalCount === 0 ? '0 项' : `${completedCount}/${totalCount}`} ›
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <p className="text-[10px] font-semibold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-0.5">Today</p>
              <h3 className="font-extrabold text-gray-900 dark:text-white">今日任务</h3>
            </div>
            <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
              {totalCount === 0 ? '暂无' : `${completedCount}/${totalCount}`}
            </span>
          </div>
        )}

        {todayTodos.length === 0 ? (
          isP4 ? (
            <div className="px-4 py-7 text-center">
              <p className="text-[13px] font-black text-[#a35a00]">暂无待播行动</p>
              <p className="mt-1 text-[11px] font-semibold text-[var(--ui-muted)]">去「行动」页添加吧</p>
              <P4Sparkle size={14} color="var(--p4-orange, #f9a11b)" className="absolute bottom-3 right-4" />
            </div>
          ) : (
            <div className="px-5 pb-5 text-center text-sm text-gray-400 dark:text-gray-500 py-8">
              今日暂无任务，去「任务」页添加吧
            </div>
          )
        ) : (
          <div className="px-3 pb-3 space-y-2">
            {todayTodos.map((todo, i) => {
              // BIG DEAL 并入列表内部（PRD_V2.6 §2.1 / 反馈 §9）：
              // 它以前是今日任务**上方的独立板块**，同时又作为普通行落在列表里，
              // 于是同一件事出现两次、且列表里那行点了没反应
              // （completeTodo 对大事直接返回 null，"大事只能逐子步完成"）。
              // 现在统一走聚合卡、排序已把它顶到最前，独立板块整段删除。
              if (todo.isBigDeal) {
                return (
                  <BigDealHomeCard
                    key={todo.id}
                    todo={todo}
                    channel={isP4 ? 'p4' : 'plain'}
                    onOpen={() => setDealPanelId(todo.id)}
                  />
                );
              }
              const progress = getTodayTodoProgress(todo.id);
              const attrName = settings.attributeNames[todo.attribute as keyof typeof settings.attributeNames];
              const pct = Math.min(100, (progress.count / progress.target) * 100);

              return (
                <motion.button
                  key={todo.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileTap={progress.isComplete ? undefined : { scale: 0.985 }}
                  disabled={progress.isComplete}
                  onClick={async (e) => {
                    if (!progress.isComplete) spawnTodoRipple(todo.id, e);
                    const result = await completeTodo(todo.id);
                    const updated = getTodayTodoProgress(todo.id);
                    if (updated.isComplete) {
                      setCompletedTitle(todo.title);
                      const pts = todo.points + (todo.extraBoosts?.reduce((s, b) => s + b.points, 0) ?? 0);
                      setCompletedPoints(pts);
                      setUnlockHint(result?.unlockHints ?? { achievements: 0, skills: 0 });
                      setModalBlocker(true);
                    }
                  }}
                  className={`relative overflow-hidden w-full text-left rounded-xl transition-all duration-150 cursor-pointer ${
                    isP4 ? 'px-3 py-2.5' : 'px-4 py-3.5'
                  } ${
                    isP4
                      ? progress.isComplete
                        ? 'bg-[var(--p4-paper-green,#eef3cf)] opacity-75 cursor-not-allowed'
                        : todo.important
                          ? 'bg-white/85'
                          : 'bg-white/60'
                      : progress.isComplete
                        ? 'bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed'
                        : todo.important
                          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-700/50 hover:border-amber-300 dark:hover:border-amber-600'
                          : 'bg-gray-50 dark:bg-gray-800/60 border border-transparent hover:border-primary/20 hover:bg-primary/5 dark:hover:bg-primary/10'
                  }`}
                >
                  {(todoRipples[todo.id] ?? []).map(rp => (
                    <span key={rp.id} className="pointer-events-none absolute rounded-full" style={{ left: rp.x, top: rp.y, width: 8, height: 8, marginLeft: -4, marginTop: -4, background: 'var(--color-primary)', opacity: 0, transform: 'scale(0)', animation: 'splashRipple 0.55s ease-out forwards' }} />
                  ))}
                  <div className="flex items-center gap-3">
                    {/* 完成圆圈 */}
                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      progress.isComplete
                        ? isP4
                          ? 'bg-[var(--p4-green,#55c34f)] border-[var(--p4-green,#55c34f)]'
                          : 'bg-primary border-primary'
                        : isP4
                          ? 'border-[#131313]/30'
                          : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {progress.isComplete && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {todo.important && (
                          <span className="text-amber-500 text-xs">⭐</span>
                        )}
                        {todo.fateDrawnDate === todayKey && (
                          <span className={`text-[10px] font-black ${isP4 ? 'text-[#131313]' : 'text-primary'}`} title="今日抽签选中">✦</span>
                        )}
                        <span className={`text-sm truncate ${
                          isP4
                            ? progress.isComplete
                              ? 'font-black line-through text-[#131313]/45'
                              : 'font-black text-[#131313]'
                            : progress.isComplete
                              ? 'font-medium line-through text-gray-400 dark:text-gray-500'
                              : 'font-medium text-gray-800 dark:text-white'
                        }`}>
                          {todo.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {attrName} +{todo.points}
                        </span>
                        {todo.extraBoosts?.map((boost, bi) => (
                          <span key={bi} className="text-xs text-gray-400 dark:text-gray-500">
                            · {settings.attributeNames[boost.attribute as keyof typeof settings.attributeNames]} +{boost.points}
                          </span>
                        ))}
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          · {progress.count}/{progress.target}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 进度条（所有任务都显示） */}
                  <div className={`mt-2.5 h-1 rounded-full overflow-hidden ${isP4 ? 'bg-[#131313]/10' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: isP4
                          ? 'linear-gradient(to right, var(--p4-orange, #f9a11b), var(--ui-bg))'
                          : 'color-mix(in hsl, var(--color-primary) 70%, gray)',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* ──「今日仪式」叠放（规格 §3.1 槽位 4）────────────────────────
          原 星象入口卡 / 逆影战场 / 逆流预警条 三个全宽区块合并为一个横滑组：
          信息零删除、各卡点击行为不变，只换挂载位置。后续区块被压缩后，
          今日任务自然回到首屏——本次重组的核心收益。slides 组装见 ritualSlides。
          P4：并入右列奶油卡（花朵题头 + 星闪），滑动组不变。 */}
      {isP4 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[20px] bg-[var(--ui-paper)]"
          style={{ boxShadow: '0 3px 0 rgba(19,19,19,0.12)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b-2 border-[#131313]/10 px-4 pb-2.5 pt-4">
            <div className="flex min-w-0 items-center gap-2">
              <P4Flower size={18} color="var(--ui-bg)" />
              <h3 className="truncate text-[15px] font-black text-[#131313]">今日仪式</h3>
            </div>
            <P4Sparkle size={14} color="var(--p4-orange, #f9a11b)" className="shrink-0" />
          </div>
          <div className="p-2">
            {/* 满宽 slide：默认 86% 会让下一张探出右缘，宽屏下探出的那截尤其大——
                首页只有两三张仪式卡，靠圆点指示就够，不需要"露一角"的暗示（用户上报
                "宽屏下右边战场的卡片会露出来"）。 */}
            <StackCarousel id="ritual" page={ritualPage} itemWidthClass="w-full">
              {ritualSlides}
            </StackCarousel>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <EyebrowLabel className="mb-2 px-0.5">今日仪式 · 滑动</EyebrowLabel>
          {/* 全局裁决（2026-07-12）：仪式卡撑满一屏 + 自动轮播（非 P4 频道保留） */}
          <StackCarousel id="ritual" page={ritualPage} itemWidthClass="w-full" autoPlayMs={6000}>
            {ritualSlides}
          </StackCarousel>
        </motion.div>
      )}
      </div>{/* /P4 双列（今日任务 × 今日仪式）；非 P4 时该包装为 display:contents */}

      {/* ──「成长」＝ 星象仪（P8.1）────────────────────────────────
          原横滑两页（属性网格 / 雷达+统计）本是同一数据的两种视图，星象仪把它们
          合成一个：星形舞台=概览，五角贴纸可点=每个属性的档案入口（称号阶梯+关联
          成就+进度，即原网格的信息深度，挪进弹窗）。六格统计与「详细统计→」保留。
          P4（p4-dashboard-reference-v2 1:1）：星象仪换花瓣雷达，统计换奶油圆圈组。 */}
      {isP4 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-1 flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2">
              <P4Flower size={20} color="#131313" />
              <h3 className="text-xl font-black text-[#131313]">人格指数</h3>
              <P4Sparkle size={14} color="var(--ui-accent)" />
            </div>
            <button
              onClick={() => setCurrentPage('statistics')}
              className="text-xs font-black text-[#131313]"
            >
              详细统计 ▶
            </button>
          </div>
          {/* 花瓣图 ⇄ 属性档案：与 p3 同一交互（选中时花层旋转放大、透明度沉为衬底，
              详情在原位撑开；再点任意处倒放收回）。外层只裁水平飞入，详情自己撑高度。 */}
          {/* min-h 必须 ≥ 花瓣图实际高度（svg 1:1，高 = min(340, 容器宽)），否则
              overflow-hidden 会把下面两瓣（温柔/灵巧）齐根切掉、连带点不着（用户上报） */}
          <div ref={petalSectionRef} className="relative min-h-[352px] overflow-hidden">
            <motion.div
              className="absolute inset-x-0 top-0 z-0"
              animate={dossierAttr
                ? { scale: 1.38, rotate: 118, x: '12%', y: '14%', opacity: 0.18 }
                : { scale: 1, rotate: 0, x: '0%', y: '0%', opacity: 1 }}
              transition={{ type: 'spring', stiffness: 190, damping: 24 }}
              style={{ transformOrigin: 'center', pointerEvents: dossierAttr ? 'none' : 'auto' }}
            >
              <FlowerChart
                items={starItems.map(s => ({ id: s.id, name: s.name, level: s.level, maxLevel: s.maxLevel }))}
                onSelect={(id, e) => {
                  const rect = petalSectionRef.current?.getBoundingClientRect();
                  if (rect && e) setPetalRipples(rs => [...rs, { id: Date.now(), x: e.clientX - rect.left, y: e.clientY - rect.top }]);
                  setDossierAttr(id);
                }}
                showLabels={!dossierAttr}
              />
            </motion.div>
            {/* 详情层：高度 0⇄auto 与内部 stagger 同播，收回时底部不会先塌一截 */}
            <motion.div
              className="relative z-10 overflow-hidden"
              initial={false}
              animate={{ height: dossierAttr ? 'auto' : 0 }}
              transition={{ duration: 0.34, ease: [0.3, 0, 0.2, 1] }}
            >
              <AnimatePresence>
                {dossierAttr && (
                  <AttrDetailInlineP4
                    key={dossierAttr}
                    attrId={dossierAttr}
                    level={starItems.find(it => it.id === dossierAttr)?.level ?? 1}
                    onBack={() => setDossierAttr(null)}
                  />
                )}
              </AnimatePresence>
            </motion.div>
            {/* 点击波纹：独立叠层，不随花层旋转/淡出 */}
            <AnimatePresence>
              {petalRipples.map((rp) => (
                <motion.span
                  key={rp.id}
                  aria-hidden
                  className="pointer-events-none absolute z-30 rounded-full"
                  style={{ left: rp.x, top: rp.y, border: '3px solid var(--p4-orange, #f9a11b)', background: 'radial-gradient(circle, rgba(255,214,90,0.45) 0%, rgba(249,161,27,0) 70%)' }}
                  initial={{ width: 16, height: 16, x: '-50%', y: '-50%', opacity: 0.9 }}
                  animate={{ width: 250, height: 250, opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  onAnimationComplete={() => setPetalRipples(rs => rs.filter(r => r.id !== rp.id))}
                />
              ))}
            </AnimatePresence>
          </div>
          {/* 四格统计（与 p3 同口径：成就·技能已挪到详细统计页，首页只留四项） */}
          {/* 每格限宽：只有 flex-1 + aspect-square 时，宽屏/横屏下四个圆会被撑成巨圆（用户上报） */}
          <div className="mx-auto mt-3 flex max-w-[420px] justify-center gap-3">
            {[
              { v: totalPoints, label: '累计点数', c: 'var(--p4-orange, #f9a11b)' },
              { v: totalActivitiesCount, label: '总记录数', c: 'var(--p4-green, #55c34f)' },
              { v: totalLevel, label: '总等级', c: 'var(--p4-sky-deep, #2196e0)' },
              { v: uniqueDays, label: '记录天数', c: '#8e5ad8' },
            ].map((s, i) => (
              <div key={s.label} className="relative w-full max-w-[94px] flex-1">
                <div
                  className="flex aspect-square w-full flex-col items-center justify-center rounded-full bg-[var(--ui-paper)]"
                  style={{ boxShadow: '0 3px 0 rgba(19,19,19,0.12)' }}
                >
                  <span className="text-[26px] font-black leading-none tabular-nums" style={{ color: s.c }}>
                    {s.v}
                  </span>
                  <span className="mt-0.5 px-0.5 text-center text-[10px] font-black leading-tight text-[#131313]">
                    {s.label}
                  </span>
                </div>
                {(i === 0 || i === 2) && (
                  <P4Sparkle size={13} color={i === 0 ? 'var(--p4-orange, #f9a11b)' : 'var(--ui-accent)'} className="absolute -top-1 right-0" />
                )}
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <EyebrowLabel className="mb-2 px-0.5">成长 · 星象</EyebrowLabel>
        <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-1">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">人格星象</h3>
            <button
              onClick={() => setCurrentPage('statistics')}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              详细统计 →
            </button>
          </div>
          {/* FS2.2：旧的深色舞台 StarChart 过时下架，改用与 P3 同源的 StarChartP3
              （角长=等级 + 同心档位环 + 可点角标签），配中性调色板走 --color-primary。
              不再垫深色舞台——中性皮就是白卡面。 */}
          <div className="mx-3 mb-1 px-2 pt-1">
            <StarChartP3
              items={starItems}
              palette={NEUTRAL_STAR_PALETTE}
              onSelect={(id) => setDossierAttr(id)}
            />
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
            <div className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-primary tabular-nums">{totalPoints}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">累计点数</div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-primary tabular-nums">{maxStreak}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">最长连续天</div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-primary tabular-nums">{totalActivitiesCount}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">总记录数</div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
            <div className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-amber-500 tabular-nums">{unlockedAchievementsCount}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">成就已解锁</div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-violet-500 tabular-nums">{unlockedSkillsCount}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">技能已解锁</div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-xl font-bold text-emerald-500 tabular-nums">{uniqueDays}</div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">记录天数</div>
            </div>
          </div>
        </div>
      </motion.div>
      )}

      {/* P8.1 属性档案：点星象仪贴纸打开（称号阶梯 + 关联成就）。
          P4 已改成花瓣图原地展开（AttrDetailInlineP4），不再叠这层弹窗。 */}
      <AttributeDossier attrId={isP4 ? null : dossierAttr} onClose={() => setDossierAttr(null)} />

      <TodoCompleteModal
        isOpen={!!completedTitle}
        onClose={() => {
          setCompletedTitle(null);
          setModalBlocker(false);
        }}
        title={completedTitle || ''}
        totalPoints={completedPoints}
        unlockHint={unlockHint}
      />

      {/* CutIn 已移到 App.tsx 全局渲染（GlobalCallingCardCutIn），不在此页处理 */}

      {/* 临期 Toast（D1）：≤ 3 天，每张卡每天最多弹一次 */}
      <AnimatePresence>
        {urgentToast && (
          <motion.div
            key={urgentToast}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="fixed left-1/2 -translate-x-1/2 z-[140] pointer-events-none"
            style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
          >
            <div className="px-4 py-2.5 rounded-2xl bg-gray-900/95 dark:bg-gray-100/95 text-white dark:text-gray-900 text-sm font-bold shadow-2xl backdrop-blur-sm flex items-center gap-2 whitespace-nowrap">
              <span className="text-base">⏳</span>
              <span>{urgentToast}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 逆流衰减通知 */}
      <AnimatePresence>
        {decayedAttrs.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setDecayedAttrs([])}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 260 }}
              className="bg-white dark:bg-gray-900 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="text-4xl mb-3">🌊</div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">逆流侵蚀</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  以下属性连续3日无增长，已各扣减 1 点
                </p>
              </div>
              <div className="space-y-2 mb-5">
                {decayedAttrs.map(id => (
                  <div key={id} className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">{settings.attributeNames[id]}</span>
                    <span className="text-sm font-bold text-red-500">−1</span>
                  </div>
                ))}
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setDecayedAttrs([])}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold"
              >
                知道了
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── 星象入口卡 ─────────────────────────────────────────────
// 未抽：邀请进入星象页抽卡
// 已抽：展示牌名 + 属性加成 + 一行建议，仍可点击进入查看详情

function AstrologyEntryCard({ onOpen }: { onOpen: () => void }) {
  const { dailyDivination, settings } = useAppStore();
  const drawn = dailyDivination && dailyDivination.date === toLocalDateKey() ? dailyDivination : null;
  const isP4 = useUiChannel() === 'p4';

  if (!drawn) {
    // P4：挂在奶油仪式卡内 —— 蓝色圆角月亮图标 + 黑粗标题（p4-dashboard-reference-v2）
    if (isP4) {
      return (
        <motion.button
          onClick={onOpen}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full overflow-hidden rounded-2xl p-2 text-left"
        >
          <div className="flex items-start gap-2.5">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: 'var(--ui-accent)' }}>
              🌙
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-black leading-snug text-[#131313]">今日星象尚未展开</div>
              <div className="mt-0.5 text-[11px] font-semibold leading-snug text-[var(--ui-muted)]">
                点击进入星象，从三张塔罗中抽取一张
              </div>
            </div>
          </div>
        </motion.button>
      );
    }
    return (
      <motion.button
        onClick={onOpen}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full text-left rounded-2xl border border-indigo-200 dark:border-indigo-700/40 bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/30 p-4 overflow-hidden relative"
      >
        <div className="absolute -right-4 -top-4 text-6xl opacity-10 select-none">🔮</div>
        <div className="flex items-center gap-3">
          <div className="text-2xl flex-shrink-0">🌙</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-indigo-800 dark:text-indigo-200">今日星象尚未展开</div>
            <div className="text-[11px] text-indigo-600/80 dark:text-indigo-300/70 mt-0.5">
              点击进入星象，从三张塔罗中抽取一张
            </div>
          </div>
          <div className="text-indigo-400 dark:text-indigo-500 text-xl flex-shrink-0">›</div>
        </div>
      </motion.button>
    );
  }

  const card = TAROT_BY_ID[drawn.cardId];
  const attrName = settings.attributeNames[drawn.effect.attribute];

  return (
    <motion.button
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full text-left rounded-2xl border border-amber-200 dark:border-amber-700/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10 p-4 overflow-hidden relative"
    >
      <div className="flex items-center gap-3">
        <div className="text-2xl flex-shrink-0">🔮</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-amber-800 dark:text-amber-200 truncate">
              {card?.name ?? '?'} · {drawn.orientation === 'upright' ? '正位' : '逆位'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 font-bold">
              {attrName} × {drawn.effect.multiplier}
            </span>
          </div>
          <div className="text-[11px] text-amber-700/90 dark:text-amber-300/90 mt-1 line-clamp-2 leading-snug">
            {drawn.advice}
          </div>
        </div>
        <div className="text-amber-400 dark:text-amber-500 text-xl flex-shrink-0">›</div>
      </div>
    </motion.button>
  );
}

