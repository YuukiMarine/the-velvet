/**
 * ConfidantAlbumWall —— 羁绊专辑墙（PRD_V2.5_FINAL §5.3 定稿交互）。
 *
 * 同伴 = 竖版塔罗牌（正面直接复用 TarotCardSVG，逆位同伴天然倒置），3D cover flow：
 *   - 中央卡正对放大，两侧透视斜排渐暗；两侧卡「拖拽或点击」切换，磁吸 + 触觉；
 *   - 中央卡「单击翻转」；横向拖拽带阻尼、过阈值(±90px)也翻过去，不足回弹；
 *   - 中央卡「上滑」进详情（ConfidantDetailModal）；背面另有「查看档案」按钮兜底；
 *   - 下方信息条（称呼 · 牌名 · Rank）+ range scrubber 快速跳卡；
 *   - 列表末尾「空白牌」= 新增同伴入口。
 *
 * 工程护栏：只渲染中央 ±3 张；动画全走 transform；D0 降级为横向 snap 列表。
 * 三主题卡面差分后置（PRD 后备层），先做通用塔罗版。
 */
import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Confidant } from '@/types';
import { TAROT_BY_ID } from '@/constants/tarot';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic } from '@/utils/feedback';

const CARD_W = 182;
const CARD_H = Math.round(CARD_W * 1.6); // TarotCardSVG 比例
const SPACING = 88;          // 相邻卡横向间距
const FLIP_THRESHOLD = 90;   // 中央卡拖拽翻转阈值（px）
const DETAIL_THRESHOLD = 70; // 上滑进详情阈值（px）
const SLIDE_PER_CARD = 76;   // 滑动切卡步长（px/张）

export interface ConfidantAlbumWallProps {
  confidants: Confidant[];
  onOpenDetail: (id: string) => void;
  onCreate: () => void;
  /** 达到同伴上限时隐藏空白牌 */
  canCreate: boolean;
}

/** 背面档案（与正面同尺寸；rotateY(180) 预翻，父层翻转后正读） */
const CardBackFace = ({ c, onOpenDetail }: { c: Confidant; onOpenDetail: () => void }) => {
  const card = TAROT_BY_ID[c.arcanaId];
  const nextNeed = 20 + c.intimacy * 10; // 展示用近似值：真实口径在详情页
  return (
    <div
      className="flex h-full w-full flex-col rounded-xl border border-indigo-300/40 bg-gradient-to-b from-indigo-950 to-slate-900 px-4 py-4 text-white"
      style={{ boxShadow: '0 10px 30px -12px rgba(49,46,129,0.6)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-lg font-black">{c.name}</span>
        <span className="shrink-0 text-[10px] font-bold text-indigo-300">
          {card?.roman ?? ''} {c.orientation === 'reversed' ? '逆位' : '正位'}
        </span>
      </div>
      <div className="mt-0.5 text-xs font-semibold text-indigo-200/80">{card?.name ?? c.arcanaId}</div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[10px] font-bold text-indigo-200/70">
          <span>RANK {c.intimacy}</span>
          <span className="tabular-nums">{c.intimacyPoints}/{nextNeed}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400"
            style={{ width: `${Math.min(100, (c.intimacyPoints / nextNeed) * 100)}%` }}
          />
        </div>
      </div>

      {c.description && (
        <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed text-indigo-100/75">{c.description}</p>
      )}
      {c.aiAdvice && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-fuchsia-200/80">✦ {c.aiAdvice}</p>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail();
        }}
        className="mt-auto w-full rounded-lg bg-white/12 py-2 text-xs font-bold text-white active:bg-white/20"
      >
        查看档案 →
      </button>
    </div>
  );
};

/** 空白牌（新增入口） */
const BlankCard = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-indigo-300/50 bg-indigo-500/5 text-indigo-400">
    <span className="text-5xl font-thin leading-none">+</span>
    <span className="text-xs font-bold tracking-wide">缔结新的羁绊</span>
  </div>
);

const idOf = (item: Confidant | 'add') => (item === 'add' ? '__add__' : item.id);

export const ConfidantAlbumWall = ({ confidants, onOpenDetail, onCreate, canCreate }: ConfidantAlbumWallProps) => {
  const bold = useBoldness();
  // 中央卡用【id 锚定】而非数字下标：详情互动/排序变化导致 confidants 重排时，
  // 中央卡跟着原卡平滑走位，而不是「index 指到了别人」（实测踩坑：查看详情
  // 会更新排序权重，关闭弹窗后数字锚让中央卡换人）。
  const [centerId, setCenterId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [dragRot, setDragRot] = useState(0);   // 中央卡拖拽的实时附加角
  const [slideX, setSlideX] = useState(0);     // 滑动切换的实时位移

  // 空白牌拼接在末尾
  const items: (Confidant | 'add')[] = canCreate ? [...confidants, 'add'] : [...confidants];
  const count = items.length;

  // index 由 centerId 派生：锚卡被移除/筛掉时回落 0
  const anchored = centerId ? items.findIndex((it) => idOf(it) === centerId) : 0;
  const index = anchored === -1 ? 0 : anchored;

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(count - 1, next));
    if (clamped !== index) {
      triggerLightHaptic();
      setFlipped(false);
      setCenterId(idOf(items[clamped]));
    }
  };

  // ── 手势（容器统一 pointer 处理；flip=中央卡按下，slide=其余区域）──────────
  const gesture = useRef<{
    mode: 'flip' | 'slide' | null;
    startX: number;
    startY: number;
    startT: number;
    targetIdx: number | null;
  }>({ mode: null, startX: 0, startY: 0, startT: 0, targetIdx: null });

  const onPointerDown = (e: React.PointerEvent) => {
    if (!bold) return;
    const el = (e.target as HTMLElement).closest('[data-wall-idx]');
    const idx = el ? Number(el.getAttribute('data-wall-idx')) : null;
    gesture.current = {
      mode: idx === index ? 'flip' : 'slide',
      startX: e.clientX,
      startY: e.clientY,
      startT: performance.now(),
      targetIdx: idx,
    };
    // capture 失败不致命（合成事件 / 已释放的 pointerId 会抛 NotFoundError）
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.mode) return;
    const dx = e.clientX - g.startX;
    if (g.mode === 'flip') {
      // 阻尼：位移的 0.42 倍转角，全程触觉靠 CSS 无法给——阈值跨越时给一次
      setDragRot(Math.max(-170, Math.min(170, dx * 0.42)));
    } else {
      setSlideX(dx);
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g.mode) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const dt = Math.max(1, performance.now() - g.startT);
    const isTap = Math.abs(dx) < 8 && Math.abs(dy) < 8;

    if (g.mode === 'flip') {
      const item = items[index];
      if (isTap) {
        // 单击翻转（空白牌单击 = 新增）
        if (item === 'add') onCreate();
        else {
          setFlipped((f) => !f);
          triggerLightHaptic();
        }
      } else if (dy < -DETAIL_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        // 上滑进详情
        if (item !== 'add') onOpenDetail(item.id);
      } else if (Math.abs(dx) > FLIP_THRESHOLD && item !== 'add') {
        // 拖过阈值翻过去
        setFlipped((f) => !f);
        triggerLightHaptic();
      }
      setDragRot(0);
    } else {
      if (isTap && g.targetIdx !== null) {
        // 点两侧卡 = 跳到它
        go(g.targetIdx);
      } else {
        // 滑动切换：位移步长 + 甩动速度
        const velocity = dx / dt; // px/ms
        const byDist = Math.round(-dx / SLIDE_PER_CARD);
        const byFling = Math.abs(velocity) > 0.45 ? (velocity < 0 ? 1 : -1) : 0;
        go(index + (byDist !== 0 ? byDist : byFling));
      }
      setSlideX(0);
    }
    gesture.current.mode = null;
  };

  // ── D0 降级：横向 snap 列表 ───────────────────────────────────────────────
  if (!bold) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4 pt-2 [scrollbar-width:thin]" style={{ scrollSnapType: 'x mandatory' }}>
        {items.map((item) =>
          item === 'add' ? (
            <button key="add" type="button" onClick={onCreate} className="shrink-0" style={{ width: CARD_W * 0.8, height: CARD_H * 0.8, scrollSnapAlign: 'center' }}>
              <BlankCard />
            </button>
          ) : (
            <button key={item.id} type="button" onClick={() => onOpenDetail(item.id)} className="shrink-0" style={{ scrollSnapAlign: 'center' }}>
              <TarotCardSVG card={TAROT_BY_ID[item.arcanaId]} orientation={item.orientation} width={CARD_W * 0.8} staticCard showOrientationTag={false} />
              <div className="mt-1 truncate text-center text-xs font-bold text-gray-700 dark:text-gray-200">{item.name}</div>
            </button>
          ),
        )}
      </div>
    );
  }

  const current = items[index];

  return (
    <div className="select-none">
      {/* 墙体 */}
      <div
        className="relative touch-none overflow-hidden"
        style={{ height: CARD_H + 46, perspective: 1100 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        tabIndex={0}
        role="listbox"
        aria-label="羁绊专辑墙"
        aria-activedescendant={current !== 'add' && current ? `wall-card-${current.id}` : undefined}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') go(index - 1);
          if (e.key === 'ArrowRight') go(index + 1);
          if (e.key === 'Enter' && current !== 'add' && current) onOpenDetail(current.id);
        }}
      >
        {items.map((item, i) => {
          const offset = i - index;
          if (Math.abs(offset) > 3) return null; // 虚拟化 ±3
          const isCenter = offset === 0;
          const slideShift = slideX * 0.55; // 拖动跟手（磁吸在松手时）
          const x = offset * SPACING + slideShift;
          const rotY = isCenter ? (flipped ? 180 : 0) + dragRot : offset < 0 ? 38 : -38;
          const key = item === 'add' ? 'add' : item.id;
          return (
            <motion.div
              key={key}
              id={item !== 'add' ? `wall-card-${item.id}` : undefined}
              data-wall-idx={i}
              role="option"
              aria-selected={isCenter}
              aria-label={item === 'add' ? '缔结新的羁绊' : `${item.name}（${TAROT_BY_ID[item.arcanaId]?.name ?? ''}，RANK ${item.intimacy}）`}
              className="absolute left-1/2 top-4 cursor-pointer"
              style={{ width: CARD_W, height: CARD_H, marginLeft: -CARD_W / 2, transformStyle: 'preserve-3d', zIndex: 100 - Math.abs(offset) }}
              animate={{ x, rotateY: rotY, scale: isCenter ? 1 : 0.78 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              {/* 正面 */}
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                {item === 'add' ? (
                  <BlankCard />
                ) : (
                  <TarotCardSVG card={TAROT_BY_ID[item.arcanaId]} orientation={item.orientation} width={CARD_W} staticCard showOrientationTag={false} />
                )}
                {/* 两侧渐暗罩（transform-only 之外唯一的视觉层，纯透明度） */}
                {!isCenter && <div aria-hidden className="absolute inset-0 rounded-xl bg-black" style={{ opacity: 0.18 + Math.abs(offset) * 0.16 }} />}
              </div>
              {/* 背面（仅真实卡） */}
              {item !== 'add' && (
                <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <CardBackFace c={item} onOpenDetail={() => onOpenDetail(item.id)} />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* 信息条 + scrubber */}
      <div className="mx-auto mt-1 max-w-sm px-2">
        <div className="flex items-baseline justify-center gap-2 text-center">
          {current === 'add' || !current ? (
            <span className="text-sm font-bold text-gray-500 dark:text-gray-400">缔结新的羁绊</span>
          ) : (
            <>
              <span className="truncate text-base font-black text-gray-900 dark:text-white">{current.name}</span>
              <span className="shrink-0 text-xs font-semibold text-gray-400 dark:text-gray-500">
                {TAROT_BY_ID[current.arcanaId]?.name}
                {current.orientation === 'reversed' ? '（逆）' : ''}
                {' · RANK '}
                {current.intimacy}
              </span>
            </>
          )}
        </div>
        {count > 1 && (
          <input
            type="range"
            min={0}
            max={count - 1}
            step={1}
            value={index}
            onChange={(e) => go(Number(e.target.value))}
            aria-label="快速跳卡"
            className="mt-2 w-full accent-[var(--color-primary)]"
          />
        )}
        <div className="mt-0.5 text-center text-[10px] text-gray-300 dark:text-gray-600">
          单击翻面 · 横拖也能翻 · 上滑看档案
        </div>
      </div>
    </div>
  );
};
