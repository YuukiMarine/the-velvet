/**
 * 弹幕环境层（共享）：官方种子 + 云端已过审弹幕的飘动展示。
 *
 * App Store UGC 合规（审核指南 1.2）× 产品初衷（祝福墙不被打扰）的折中——B 站式轻交互：
 *   - 平时弹幕是纯装饰，点击无任何反应；
 *   - 云端条目（id 非空）**长按 1.5s** → 该条定格 → 旁边浮出跟随小胶囊「⚑ 反馈并隐藏」；
 *     点胶囊 = 提交举报（danmaku_reports）+ 本机屏蔽即刻消失；点别处/4s 无操作 = 散去、继续飘。
 *   - 官方种子池条目（id 空串）非 UGC，永远纯装饰；
 *   - 内容本身已是「先审后发」（PB Admin 人工过审才公开），反馈是漏审内容的兜底出口。
 *
 * 飘动用 CSS 动画（velvet-danmaku-drift，见 index.css）而非 framer：单条可用
 * animationPlayState 定格（长按时），且合成器驱动不占 JS 主线程。
 * 布局/速度参数取自原两处内联实现的现值；皮肤经 lineClassName 传入，本组件不问频道。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { reportAndBlockDanmaku, type DanmakuItem } from '@/services/danmaku';

const HOLD_MS = 1500;
/** 长按期间手指位移超过它就当作滑动、取消计时 */
const MOVE_TOLERANCE_PX = 12;

/**
 * 按「道」排（第 31 批 · 同屏 8–10 条）：第 i 条放进第 i % 道数 道；
 * 同一道里的几条速度一样、按负的 animation-delay 错开相位——一打开就铺满横向，不是排队从右边进，也不会追尾叠字。
 * 不同道之间速度、起点各差一点，看着不像整齐划一的队列。没给 lanes 就是老的一人一道。
 */
function laneStyle(i: number, n: number, L: number, durBase: number, durStep: number): { lane: number; dur: number; delay: number } {
  const lane = i % L;
  const k = Math.floor(i / L);
  const perLane = Math.ceil(n / L);
  const dur = durBase + (lane % 3) * durStep + ((lane * 7) % 5) * 0.35;
  const phase = (k / perLane + ((lane * 0.37) % 1) * (1 / perLane)) % 1;
  return { lane, dur, delay: -dur * phase };
}

/** 一行弹幕的高（text-xs + py-1）、道与道的最小间距、离屏幕边和离内容块的留白（px） */
const LANE_LINE = 24;
const LANE_STEP = 28;
const LANE_EDGE = 10;
const LANE_GAP = 8;
/** 一道里最多放几条：再多就会追尾叠字（漂移全程 170vw，两条间隔 85vw，够放下最长的一句） */
const PER_LANE_MAX = 2;

/**
 * 给内容块让道（第 31 批）：lanes 是偏好位置（%），< 50 的排在内容上方、≥ 50 的排在下方。
 * 偏好位置压到内容（或出了屏）就往空处挤；那一侧连挤都放不下，就少开几道——上方留最靠上的、下方留最靠下的。
 * 返回每道的 top（px）。矮屏 / 横屏 / 分屏时道会变少，宁可少几条也不压字。
 */
export function fitLanes(pref: number[], H: number, contentTop: number, contentBottom: number): number[] {
  const place = (ps: number[], lo: number, hi: number, keepEnd: boolean): number[] => {
    if (!ps.length || hi < lo) return [];
    const cap = Math.floor((hi - lo) / LANE_STEP) + 1;
    const sorted = [...ps].sort((a, b) => a - b);
    const kept = sorted.length <= cap ? sorted : keepEnd ? sorted.slice(sorted.length - cap) : sorted.slice(0, cap);
    const n = kept.length;
    // 第 i 道只能落在 [lo + i·步距, hi − (n−1−i)·步距]：每道都有位置，且彼此隔开一个步距
    const out = kept.map((p, i) => Math.min(Math.max((p / 100) * H, lo + i * LANE_STEP), hi - (n - 1 - i) * LANE_STEP));
    for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] + LANE_STEP);
    return out.map(v => Math.round(v));
  };
  return [
    ...place(pref.filter(p => p < 50), LANE_EDGE, contentTop - LANE_GAP - LANE_LINE, false),
    ...place(pref.filter(p => p >= 50), contentBottom + LANE_GAP, H - LANE_EDGE - LANE_LINE, true),
  ];
}

export const DanmakuLayer = ({
  items,
  lineClassName,
  bold,
  topBase = 14,
  topStep = 34,
  durBase = 13,
  durStep = 4,
  lanes,
  avoidRef,
}: {
  items: DanmakuItem[];
  lineClassName: string;
  bold: boolean;
  topBase?: number;
  topStep?: number;
  durBase?: number;
  durStep?: number;
  /** 每道的偏好 top（百分比）；给了就按道排，见 laneStyle */
  lanes?: number[];
  /** 要让开的内容块（牌区 / 结算卡）：给了就按它量出上下两块空地来排道，见 fitLanes */
  avoidRef?: React.RefObject<HTMLElement | null>;
}) => {
  // 本会话已反馈的条目（服务层的持久屏蔽名单管跨会话；这份 state 管「点完立刻消失」）
  const [gone, setGone] = useState<string[]>([]);
  // 长按命中的条目 + 小胶囊锚点（触发瞬间读 rect，同帧该条已定格，位置稳定）
  const [hold, setHold] = useState<{ item: DanmakuItem; x: number; y: number } | null>(null);
  const [toast, setToast] = useState(false);
  const timerRef = useRef(0);
  const originRef = useRef({ x: 0, y: 0 });

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => {
    if (!hold) return;
    const t = window.setTimeout(() => setHold(null), 4000);
    return () => window.clearTimeout(t);
  }, [hold]);

  // 量内容块、排道：内容高度会变（抽签的几个阶段），屏幕会转——都重排；结果没变就不重渲染
  const lanesKey = lanes?.join(',') ?? '';
  const [fitted, setFitted] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    if (!bold || !avoidRef || !lanes?.length) { setFitted(null); return; }
    let ro: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const el = avoidRef.current;
      if (!el) return;
      const host = el.offsetParent as HTMLElement | null;
      const H = host?.clientHeight || window.innerHeight;
      const next = fitLanes(lanes, H, el.offsetTop, el.offsetTop + el.offsetHeight);
      setFitted(prev => (prev && prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    const start = () => {
      const el = avoidRef.current;
      // 内容块是排在本层后面的兄弟：同一次提交里它的 ref 比本层的 layout effect 晚挂上，等一两帧再量
      if (!el) { if (++tries <= 6) raf = requestAnimationFrame(start); return; }
      measure();
      ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
      ro?.observe(el);
    };
    start();
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); window.removeEventListener('resize', measure); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avoidRef, lanesKey, bold]);

  const unfiltered = items.filter(it => !(it.id && gone.includes(it.id)));
  // 让道后道少了，条数跟着收（每道最多两条），不然同一道里会追尾叠字
  const visible = fitted ? unfiltered.slice(0, fitted.length * PER_LANE_MAX) : unfiltered;
  const laneCount = fitted ? fitted.length : lanes?.length ?? 0;

  const beginHold = (it: DanmakuItem) => (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = e.currentTarget;
    originRef.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      setHold({
        item: it,
        x: Math.min(Math.max(r.left + r.width / 2, 86), window.innerWidth - 86),
        y: Math.max(r.top, 60),
      });
    }, HOLD_MS);
  };
  const cancelHold = () => window.clearTimeout(timerRef.current);
  const moveGuard = (e: React.PointerEvent) => {
    const dx = e.clientX - originRef.current.x;
    const dy = e.clientY - originRef.current.y;
    if (dx * dx + dy * dy > MOVE_TOLERANCE_PX * MOVE_TOLERANCE_PX) cancelHold();
  };

  const confirm = () => {
    const t = hold;
    setHold(null);
    if (!t) return;
    setGone(g => [...g, t.item.id]);
    void reportAndBlockDanmaku(t.item.id);
    setToast(true);
    window.setTimeout(() => setToast(false), 1800);
  };

  return (
    <>
      {bold &&
        visible.map((it, i) => {
          const ls = laneCount > 0 ? laneStyle(i, visible.length, laneCount, durBase, durStep) : null;
          const laneTop = ls ? (fitted ? `${fitted[ls.lane]}px` : `${lanes![ls.lane]}%`) : null;
          return (
          <span
            key={`${i}-${it.id || it.text}`}
            aria-hidden={it.id ? undefined : true}
            aria-label={it.id ? `弹幕：${it.text}（长按可反馈）` : undefined}
            data-danmaku-lane={ls ? ls.lane : i}
            className={`absolute select-none whitespace-nowrap py-1 ${it.id ? 'pointer-events-auto' : 'pointer-events-none'} ${lineClassName}`}
            style={{
              top: laneTop ?? `${topBase + i * topStep}%`,
              animation: ls
                ? `velvet-danmaku-drift ${ls.dur.toFixed(2)}s linear ${ls.delay.toFixed(2)}s infinite`
                : `velvet-danmaku-drift ${durBase + i * durStep}s linear infinite`,
              animationPlayState: hold?.item.id === it.id ? 'paused' : 'running',
              WebkitTouchCallout: 'none',
              WebkitUserSelect: 'none',
            }}
            onPointerDown={it.id ? beginHold(it) : undefined}
            onPointerMove={it.id ? moveGuard : undefined}
            onPointerUp={it.id ? cancelHold : undefined}
            onPointerLeave={it.id ? cancelHold : undefined}
            onPointerCancel={it.id ? cancelHold : undefined}
            onContextMenu={it.id ? e => e.preventDefault() : undefined}
          >
            {it.text}
          </span>
          );
        })}

      <AnimatePresence>
        {hold && (
          <motion.div key={`hold-${hold.item.id}`} className="absolute inset-0 z-40" initial={false} exit={{ opacity: 0 }}>
            {/* 透明关闭层：点小胶囊以外任意处散去、弹幕继续飘 */}
            <div className="absolute inset-0" onPointerDown={() => setHold(null)} />
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.85, y: 5, x: '-50%' }}
              animate={{ opacity: 1, scale: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
              transition={{ duration: 0.14 }}
              className="absolute flex items-center gap-1.5 rounded-full bg-black/85 py-2 pl-2.5 pr-3.5 text-[12px] font-bold text-white shadow-lg backdrop-blur-sm"
              style={{ left: hold.x, top: hold.y - 46 }}
              onClick={confirm}
            >
              <svg viewBox="0 0 12 12" width="11" height="11" fill="currentColor" aria-hidden>
                <path d="M2.5 1a.5.5 0 0 1 .5.5V11a.5.5 0 0 1-1 0V1.5a.5.5 0 0 1 .5-.5Z" />
                <path d="M3.8 1.9 10 3.6 3.8 6.4Z" />
              </svg>
              反馈并隐藏
            </motion.button>
          </motion.div>
        )}
        {toast && (
          <motion.div
            key="danmaku-toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 bottom-20 z-50 flex justify-center"
          >
            <span className="rounded-full bg-black/80 px-3.5 py-1.5 text-[11px] font-bold text-white">已反馈</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
