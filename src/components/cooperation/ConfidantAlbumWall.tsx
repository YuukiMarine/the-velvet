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
import { TarotCardSVG, MAJOR_SYMBOLS } from '@/components/astrology/TarotCardSVG';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic } from '@/utils/feedback';
import { useUiChannel } from '@/ui/useUiChannel';
import { useAppStore } from '@/store';
import { P3R, slantClip } from '@/components/p3r/kit';

/**
 * P3R 正面卡（p3-cooperation-reference-v2 中央大卡）：纯塔罗牌面——
 * 顶部罗马数字+双三角 → 青轨道环+放大的大阿卡纳符号 → 底部牌位行。
 * （名字/LV/属性/关系描述全部下沉到卡下方铭牌，卡面只当"牌"看）
 */
const P3FrontFace = ({ c }: { c: Confidant }) => {
  const card = TAROT_BY_ID[c.arcanaId];
  const sym = MAJOR_SYMBOLS[c.arcanaId] ?? '✦';
  return (
    <div
      className="flex h-full w-full flex-col items-center rounded-[14px] bg-white px-3 pb-5 pt-4"
      style={{ border: '1px solid rgba(147,190,222,0.45)', boxShadow: '0 16px 36px -14px rgba(38,96,140,0.35)' }}
    >
      {/* 顶部：罗马数字 + 左右小蓝三角 */}
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="h-0 w-0 border-y-[4px] border-y-transparent border-r-[7px]" style={{ borderRightColor: P3R.blue }} />
        <span className="text-[18px] font-black tracking-[0.1em]" style={{ color: P3R.blueDeep, fontFamily: 'Georgia, serif' }}>
          {card?.roman ?? '—'}
        </span>
        <span aria-hidden className="h-0 w-0 border-y-[4px] border-y-transparent border-l-[7px]" style={{ borderLeftColor: P3R.blue }} />
      </div>
      {/* 中央：青轨道环 + 放大符号（逆位只倒符号，文字恒正读） */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center self-stretch">
        <svg viewBox="0 0 160 140" className="pointer-events-none absolute inset-0 m-auto h-full w-full" aria-hidden>
          <ellipse cx="80" cy="70" rx="70" ry="40" fill="none" stroke="rgba(53,209,232,0.5)" strokeWidth="1" transform="rotate(-16 80 70)" />
          <ellipse cx="80" cy="70" rx="48" ry="24" fill="none" stroke="rgba(53,209,232,0.28)" strokeWidth="0.8" strokeDasharray="2 4" transform="rotate(-16 80 70)" />
          <circle cx="22" cy="94" r="3.4" fill="#35d1e8" />
          <circle cx="140" cy="44" r="2.4" fill="#7fd8ee" />
          <circle cx="122" cy="102" r="1.8" fill="rgba(53,209,232,0.6)" />
        </svg>
        <span
          className="relative leading-none"
          style={{ fontSize: '78px', color: P3R.blue, transform: c.orientation === 'reversed' ? 'rotate(180deg)' : undefined }}
          aria-hidden
        >
          {sym}
        </span>
      </div>
      {/* 底部牌位行（罗马数已在顶部，此处只留牌名·正逆） */}
      <div className="max-w-full truncate text-[12px] font-black tracking-wide" style={{ color: P3R.blue }}>
        {card?.name ?? c.arcanaId}{c.orientation === 'reversed' ? ' · 逆位' : ' · 正位'}
      </div>
    </div>
  );
};

const CARD_W = 182;
const CARD_H = Math.round(CARD_W * 1.6); // TarotCardSVG 比例
const SPACING = 88;          // 相邻卡横向间距
const FLIP_THRESHOLD = 90;   // 中央卡拖拽翻转阈值（px）
const OPEN_ARM = 12;         // 下滑打开档案的视觉阈值（px）
const DOWN_CAP = 20;        // 下滑卡片位移上限（px）
const UP_CAP = 15;          // 上滑橡皮筋位移上限（px）
const STEP_X = 92;           // 横滑实时切卡步长（px/张，跟手一张张翻）

export interface ConfidantAlbumWallProps {
  confidants: Confidant[];
  onOpenDetail: (id: string) => void;
  onCreate: () => void;
  /** 达到同伴上限时隐藏空白牌 */
  canCreate: boolean;
}

/** 背面档案（与正面同尺寸；rotateY(180) 预翻，父层翻转后正读；p3=白底蓝字版） */
const CardBackFace = ({ c, onOpenDetail }: { c: Confidant; onOpenDetail: () => void }) => {
  const p3 = useUiChannel() === 'p3';
  const card = TAROT_BY_ID[c.arcanaId];
  const nextNeed = 20 + c.intimacy * 10; // 展示用近似值：真实口径在详情页
  return (
    <div
      className={p3
        ? 'flex h-full w-full flex-col rounded-[14px] bg-white px-4 py-4'
        : 'flex h-full w-full flex-col rounded-xl border border-indigo-300/40 bg-gradient-to-b from-indigo-950 to-slate-900 px-4 py-4 text-white'}
      style={p3
        ? { border: '1px solid rgba(147,190,222,0.45)', boxShadow: '0 16px 36px -14px rgba(38,96,140,0.35)' }
        : { boxShadow: '0 10px 30px -12px rgba(49,46,129,0.6)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`truncate text-lg font-black ${p3 ? '' : ''}`} style={p3 ? { color: P3R.ink } : undefined}>{c.name}</span>
        <span className="shrink-0 text-[10px] font-bold" style={p3 ? { color: P3R.blue } : { color: '#a5b4fc' }}>
          {card?.roman ?? ''} {c.orientation === 'reversed' ? '逆位' : '正位'}
        </span>
      </div>
      <div className="mt-0.5 text-xs font-semibold" style={p3 ? { color: P3R.inkSoft } : { color: 'rgba(199,210,254,0.8)' }}>{card?.name ?? c.arcanaId}</div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-[10px] font-bold" style={p3 ? { color: P3R.blue } : { color: 'rgba(199,210,254,0.7)' }}>
          <span>RANK {c.intimacy}</span>
          <span className="tabular-nums">{c.intimacyPoints}/{nextNeed}</span>
        </div>
        <div className={`mt-1 h-1.5 overflow-hidden ${p3 ? '' : 'rounded-full bg-white/15'}`} style={p3 ? { background: '#e4eef5', clipPath: 'polygon(2px 0, 100% 0, calc(100% - 2px) 100%, 0 100%)' } : undefined}>
          <div
            className={`h-full ${p3 ? '' : 'rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400'}`}
            style={{ width: `${Math.min(100, (c.intimacyPoints / nextNeed) * 100)}%`, ...(p3 ? { background: 'linear-gradient(90deg, #35d1e8, #7fd8ee)' } : {}) }}
          />
        </div>
      </div>

      {c.description && (
        <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed" style={p3 ? { color: P3R.inkSoft } : { color: 'rgba(224,231,255,0.75)' }}>{c.description}</p>
      )}
      {c.aiAdvice && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed" style={p3 ? { color: P3R.magenta } : { color: 'rgba(245,208,254,0.8)' }}>✦ {c.aiAdvice}</p>
      )}

      <button
        type="button"
        // 拦住 pointerdown/up：卡墙手势在祖先 wall 上用 pointer 事件监听，
        // 只 stopPropagation click 挡不住（翻转走 pointerup）——按钮会被翻回吞掉
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail();
        }}
        className={p3
          ? 'mt-auto w-full py-2 text-xs font-black text-white active:brightness-95'
          : 'mt-auto w-full rounded-lg bg-white/12 py-2 text-xs font-bold text-white active:bg-white/20'}
        style={p3 ? { clipPath: slantClip(8), background: P3R.blue } : undefined}
      >
        查看档案 →
      </button>
    </div>
  );
};

/** 空白牌（新增入口；p3=浅青虚线白牌） */
const BlankCard = () => {
  const p3 = useUiChannel() === 'p3';
  return (
    <div
      className={p3
        ? 'flex h-full w-full flex-col items-center justify-center gap-3 rounded-[14px]'
        : 'flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-indigo-300/50 bg-indigo-500/5 text-indigo-400'}
      style={p3 ? { border: '2px dashed rgba(53,209,232,0.6)', background: 'rgba(226,243,250,0.6)', color: P3R.blue } : undefined}
    >
      <span className="text-5xl font-thin leading-none">+</span>
      <span className="text-xs font-bold tracking-wide">缔结新的羁绊</span>
    </div>
  );
};

const idOf = (item: Confidant | 'add') => (item === 'add' ? '__add__' : item.id);

/**
 * WallScrubber —— 刻度条式快速跳卡（替代原生 range，Persona 资源条语言）。
 * 每个同伴一根竖刻度、空白牌一个描边点；当前项放大成主题色圆头 pill。
 * 整条轨道可点/拖：按 x 比例取最近刻度，命中区是整轨（刻度细也好点）。
 */
const WallScrubber = ({
  items,
  index,
  onJump,
}: {
  items: (Confidant | 'add')[];
  index: number;
  onJump: (i: number) => void;
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pickFromX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return index;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(items.length - 1, Math.round(ratio * (items.length - 1))));
  };

  return (
    <div
      ref={trackRef}
      className="relative flex h-9 cursor-pointer touch-none items-center gap-[3px]"
      onPointerDown={(e) => {
        dragging.current = true;
        onJump(pickFromX(e.clientX));
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
      }}
      onPointerMove={(e) => { if (dragging.current) onJump(pickFromX(e.clientX)); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      role="slider"
      aria-label="快速跳卡"
      aria-valuemin={0}
      aria-valuemax={items.length - 1}
      aria-valuenow={index}
    >
      {items.map((it, i) => {
        const active = i === index;
        const isAdd = it === 'add';
        return (
          <div key={idOf(it)} className="flex flex-1 items-center justify-center">
            {isAdd ? (
              <motion.div
                aria-hidden
                className="rounded-full border-2 border-indigo-400/60"
                animate={{ width: active ? 12 : 8, height: active ? 12 : 8, borderColor: active ? 'var(--color-primary)' : 'rgba(129,140,248,0.5)' }}
              />
            ) : (
              <motion.div
                aria-hidden
                className="rounded-full"
                animate={{
                  width: active ? 6 : 3,
                  height: active ? 24 : 10,
                  backgroundColor: active ? 'var(--color-primary)' : 'rgba(148,163,184,0.45)',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ConfidantAlbumWall = ({ confidants, onOpenDetail, onCreate, canCreate }: ConfidantAlbumWallProps) => {
  const bold = useBoldness();
  const p3 = useUiChannel() === 'p3';
  const attributeNames = useAppStore(s => s.settings.attributeNames);
  // 中央卡用【id 锚定】而非数字下标：详情互动/排序变化导致 confidants 重排时，
  // 中央卡跟着原卡平滑走位，而不是「index 指到了别人」（实测踩坑：查看详情
  // 会更新排序权重，关闭弹窗后数字锚让中央卡换人）。
  const [centerId, setCenterId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [dragRot, setDragRot] = useState(0);   // 中央卡拖拽的实时附加角
  const [slideX, setSlideX] = useState(0);     // 滑动切换的实时位移
  const [dragY, setDragY] = useState(0);       // 中央卡上滑预览位移（负值）
  const [dragDown, setDragDown] = useState(0); // 中央卡下滑「往下翻一点点」橡皮筋位移（正值）
  const overDetailRef = useRef(false);         // 上滑是否已越过详情阈值（跨越时触觉一次）

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
    /** 主轴锁：首次超过阈值时定死，避免斜拖时横纵行为来回抖 */
    axis: 'x' | 'y' | null;
    /** 正面横拖实时步进的基准 index（切卡跟手用） */
    startIndex: number;
  }>({ mode: null, startX: 0, startY: 0, startT: 0, targetIdx: null, axis: null, startIndex: 0 });

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
      axis: null,
      startIndex: index,
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
    const dy = e.clientY - g.startY;
    if (g.mode === 'flip') {
      const item = items[index];
      // 主轴锁：第一次超过 6px 时定死，之后横纵不再互抢
      if (!g.axis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (g.axis === 'y') {
        if (dy > 0 && item !== 'add') {
          // 下滑：打开档案预览（跟手下沉，位移封顶 DOWN_CAP 防截断），过阈越界一次触觉
          const v = Math.min(DOWN_CAP, dy * 0.5);
          setDragDown(v);
          setDragY(0);
          const over = v >= OPEN_ARM;
          if (over && !overDetailRef.current) triggerLightHaptic();
          overDetailRef.current = over;
        } else if (dy < 0) {
          // 上滑：橡皮筋翻角（无动作，位移封顶 UP_CAP）
          setDragY(Math.max(-UP_CAP, dy * 0.5));
          setDragDown(0);
        }
      } else if (g.axis === 'x') {
        if (flipped) {
          // 背面横拖 → 翻转预览（阻尼 0.42），翻回正面
          setDragRot(Math.max(-170, Math.min(170, dx * 0.42)));
          setSlideX(0);
        } else {
          // 正面横拖 → 实时一张张切卡（跟手，和 scrubber 手感一致）；张内余量做偏移
          const n = Math.round(-dx / STEP_X);
          go(g.startIndex + n);
          setSlideX(dx + n * STEP_X);
          setDragRot(0);
        }
      }
    } else {
      // 两侧卡起拖 → 同样实时一张张切（不等松手）
      const n = Math.round(-dx / STEP_X);
      go(g.startIndex + n);
      setSlideX(dx + n * STEP_X);
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
      } else if (g.axis === 'y' && dy > 0) {
        // 下滑过阈值 → 打开档案（上滑橡皮筋无动作）
        if (Math.min(DOWN_CAP, dy * 0.5) >= OPEN_ARM && item !== 'add') onOpenDetail(item.id);
      } else if (g.axis === 'x') {
        if (flipped) {
          // 背面横拖过阈值 → 翻回正面
          if (Math.abs(dx) > FLIP_THRESHOLD) {
            setFlipped(false);
            triggerLightHaptic();
          }
        } else {
          // 正面横拖已实时切卡，松手只做甩动补偿（快甩多切一张）
          const velocity = dx / dt;
          if (Math.abs(velocity) > 0.5) go(index + (velocity < 0 ? 1 : -1));
        }
      }
      // 上滑（axis==='y' && dy<0）无动作，橡皮筋回弹
      setDragRot(0);
      setDragY(0);
      setDragDown(0);
      setSlideX(0);
      overDetailRef.current = false;
    } else {
      if (isTap && g.targetIdx !== null) {
        // 点两侧卡 = 跳到它
        go(g.targetIdx);
      } else {
        // 拖动中已实时切卡，松手只做甩动补偿（快甩多切一张）
        const velocity = dx / dt; // px/ms
        if (Math.abs(velocity) > 0.5) go(index + (velocity < 0 ? 1 : -1));
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
              {p3 ? (
                <div style={{ width: CARD_W * 0.8, height: CARD_H * 0.8 }}><P3FrontFace c={item} /></div>
              ) : (
                <TarotCardSVG card={TAROT_BY_ID[item.arcanaId]} orientation={item.orientation} width={CARD_W * 0.8} staticCard showOrientationTag={false} />
              )}
              <div className="mt-1 truncate text-center text-xs font-bold text-gray-700 dark:text-gray-200">{item.name}</div>
            </button>
          ),
        )}
      </div>
    );
  }

  const current = items[index];

  return (
    <div className={p3 ? 'select-none -mt-1' : 'select-none'}>
      {/* 墙体 */}
      <div
        className="relative touch-none overflow-hidden"
        style={{ height: CARD_H + (p3 ? 22 : 46), perspective: 1100 }}
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
          // 上滑橡皮筋上飘 / 下滑打开预览下沉（二者互斥，axis 锁保证）
          const y = isCenter ? dragY + dragDown : 0;
          // 上滑时卡顶前倾一点（橡皮筋翻角，rotateX 负 = 顶部靠近）；下滑不翻角
          const rotX = isCenter ? dragY * 0.4 : 0;
          // 下滑打开预览：轻微放大暗示「聚焦/展开」（位移封顶后靠放大补足反馈）
          const liftScale = isCenter ? 1 + Math.min(0.05, dragDown / 300) : 0.78;
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
              animate={{ x, y, rotateX: rotX, rotateY: rotY, scale: liftScale }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              {/* 正面 */}
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                {item === 'add' ? (
                  <BlankCard />
                ) : p3 ? (
                  <P3FrontFace c={item} />
                ) : (
                  <TarotCardSVG card={TAROT_BY_ID[item.arcanaId]} orientation={item.orientation} width={CARD_W} staticCard showOrientationTag={false} />
                )}
                {/* 两侧渐暗罩（transform-only 之外唯一的视觉层，纯透明度；p3 用蓝灰调防白卡发脏） */}
                {!isCenter && <div aria-hidden className={`absolute inset-0 ${p3 ? 'rounded-[14px]' : 'rounded-xl'}`} style={{ background: p3 ? '#4a7a9c' : '#000', opacity: 0.18 + Math.abs(offset) * 0.16 }} />}
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

        {/* 下滑反馈：底部提示胶囊，随下滑量渐显；过阈值变主题色实心「松手打开」 */}
        {dragDown > 6 && current !== 'add' && (() => {
          const progress = Math.min(1, dragDown / OPEN_ARM);
          const armed = progress >= 1;
          return (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-[80] flex justify-center"
              style={{ opacity: 0.4 + progress * 0.6 }}
            >
              <div
                className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black shadow-lg transition-colors"
                style={{
                  background: armed ? 'var(--color-primary)' : 'rgba(30,27,75,0.9)',
                  color: '#fff',
                  transform: `scale(${0.9 + progress * 0.1})`,
                }}
              >
                <motion.span animate={{ y: armed ? [1, 3, 1] : 0 }} transition={{ duration: 0.6, repeat: armed ? Infinity : 0 }}>↓</motion.span>
                {armed ? '松手打开档案' : '下滑查看档案'}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 档案铭牌 + scrubber（p3：信息已上卡，铭牌只留空白牌文案 + scrubber + 蓝提示行） */}
      <div className={`mx-auto max-w-sm px-3 ${p3 ? 'mt-1' : 'mt-2'}`}>
        {current === 'add' || !current ? (
          <div className="text-center">
            <div className={`text-2xl font-black ${p3 ? '' : 'text-gray-800 dark:text-gray-100'}`} style={p3 ? { color: P3R.ink } : undefined}>缔结新的羁绊</div>
            <div className={`mt-0.5 text-xs font-semibold ${p3 ? '' : 'text-gray-400 dark:text-gray-500'}`} style={p3 ? { color: P3R.grey } : undefined}>点一下这张空白牌开始</div>
          </div>
        ) : p3 ? (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            className="text-center"
          >
            {/* 牌位眉签：罗马 · 牌名 · 正逆 */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-black tracking-[0.14em]" style={{ color: P3R.blue }}>
              <span aria-hidden className="flex items-center gap-[3px]">
                <span className="h-0 w-0 border-y-[4px] border-y-transparent border-r-[6px]" style={{ borderRightColor: P3R.cyan }} />
                <span className="h-0 w-0 border-y-[4px] border-y-transparent border-l-[6px]" style={{ borderLeftColor: P3R.cyan }} />
              </span>
              {TAROT_BY_ID[current.arcanaId]?.roman ? `${TAROT_BY_ID[current.arcanaId]?.roman} · ` : ''}
              {TAROT_BY_ID[current.arcanaId]?.name}
              {current.orientation === 'reversed' ? ' · 逆位' : ' · 正位'}
            </div>
            {/* 名字大字 + 蓝斜片 */}
            <div className="mt-1 flex items-center justify-center gap-2.5">
              <span aria-hidden className="h-[26px] w-[8px] shrink-0" style={{ background: P3R.blue, transform: 'skewX(-18deg)' }} />
              <h3 className="max-w-[64%] truncate text-[32px] font-black italic leading-tight" style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}>
                {current.name}
              </h3>
            </div>
            {/* LV 蓝斜块（洋红角）+ 属性青斜块 */}
            <div className="mt-2 flex items-center justify-center gap-2">
              <span className="relative inline-flex items-baseline gap-1 px-3.5 py-1 text-white" style={{ clipPath: slantClip(8), background: P3R.blue }}>
                <span className="text-[10px] font-black tracking-wider text-white/85">LV</span>
                <span className="text-[16px] font-black italic leading-none tabular-nums">{current.intimacy}</span>
                <span aria-hidden className="absolute -bottom-[2px] right-1 h-[5px] w-[12px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />
              </span>
              {current.skillAttribute && attributeNames[current.skillAttribute] && (
                <span className="inline-block px-3 py-1 text-[12px] font-black" style={{ clipPath: slantClip(8), background: P3R.cyanFaint, color: P3R.blueDeep }}>
                  {attributeNames[current.skillAttribute]}
                </span>
              )}
            </div>
            {/* 关系描述 */}
            {current.description && (
              <p className="mx-auto mt-2 line-clamp-2 max-w-[19rem] text-[12px] font-semibold leading-relaxed" style={{ color: P3R.inkSoft }}>
                {current.description}
              </p>
            )}
          </motion.div>
        ) : (
          <div className="text-center">
            {/* eyebrow：牌名 · 罗马数 · 正逆位 */}
            <div className="text-[11px] font-bold tracking-[0.14em] text-indigo-400 dark:text-indigo-300">
              {TAROT_BY_ID[current.arcanaId]?.roman ? `${TAROT_BY_ID[current.arcanaId]?.roman} · ` : ''}
              {TAROT_BY_ID[current.arcanaId]?.name}
              {current.orientation === 'reversed' ? ' · 逆位' : ' · 正位'}
            </div>
            {/* 大名字 + RANK 徽章 */}
            <div className="mt-0.5 flex items-center justify-center gap-2.5">
              <motion.h3
                key={current.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-[70%] truncate text-[28px] font-black leading-tight text-gray-900 dark:text-white"
              >
                {current.name}
              </motion.h3>
              <span
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-black leading-none text-white"
                style={{ background: 'linear-gradient(135deg, rgb(var(--color-bond-rgb)), rgb(var(--color-bond-bright-rgb)))' }}
              >
                RANK {current.intimacy}
              </span>
            </div>
          </div>
        )}

        {count > 1 && (
          <div className="mt-2">
            <WallScrubber items={items} index={index} onJump={go} />
          </div>
        )}
        {p3 ? (
          <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] font-bold" style={{ color: P3R.blue }}>
            <span aria-hidden className="flex items-center gap-[3px]">
              <span className="h-0 w-0 border-y-[4px] border-y-transparent border-r-[6px]" style={{ borderRightColor: P3R.cyan }} />
              <span className="h-0 w-0 border-y-[4px] border-y-transparent border-l-[6px]" style={{ borderLeftColor: P3R.cyan }} />
            </span>
            左右切换 · 单击翻面 · 下滑看档案
          </div>
        ) : (
          <div className="mt-0.5 text-center text-[10px] text-gray-300 dark:text-gray-600">
            左右切换 · 单击翻面 · 下滑看档案
          </div>
        )}
      </div>
    </div>
  );
};
