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
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { reportAndBlockDanmaku, type DanmakuItem } from '@/services/danmaku';

const HOLD_MS = 1500;
/** 长按期间手指位移超过它就当作滑动、取消计时 */
const MOVE_TOLERANCE_PX = 12;

export const DanmakuLayer = ({
  items,
  lineClassName,
  bold,
  topBase = 14,
  topStep = 34,
  durBase = 13,
  durStep = 4,
}: {
  items: DanmakuItem[];
  lineClassName: string;
  bold: boolean;
  topBase?: number;
  topStep?: number;
  durBase?: number;
  durStep?: number;
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

  const visible = items.filter(it => !(it.id && gone.includes(it.id)));

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
        visible.map((it, i) => (
          <span
            key={`${i}-${it.id || it.text}`}
            aria-hidden={it.id ? undefined : true}
            aria-label={it.id ? `弹幕：${it.text}（长按可反馈）` : undefined}
            className={`absolute select-none whitespace-nowrap py-1 ${it.id ? 'pointer-events-auto' : 'pointer-events-none'} ${lineClassName}`}
            style={{
              top: `${topBase + i * topStep}%`,
              animation: `velvet-danmaku-drift ${durBase + i * durStep}s linear infinite`,
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
        ))}

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
