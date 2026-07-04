/**
 * RadialQuickNav —— 中央 ◈ 长按轮盘（PRD_V2.5_FINAL §4.1）。
 *
 * 手势流：BottomNav 的 ◈ 长按 500ms 触发（短按=开黑猫不变）→ 七瓣从 ◈ 向上绽放成
 * 半环 → 拇指不离屏移动：距 ◈ ≥ 死区且在上半平面时按角度高亮对应瓣（划到的放大、
 * 未划到缩小，切换时轻触觉）→ 松手跳转（经 playHeavyTransition 频道幕布）；
 * 滑回 ◈ 死区或下滑 = 取消态，松手只关闭。
 *
 * 七瓣定稿：塔罗 / 记录 / 任务 / 羁绊 / 记账 / 成就 / 设置（'todos'/'activities'
 * 走行动页旧路由 id 兼容层直达子 tab）。
 *
 * D0（useBoldness=false）：长按改弹普通垂直菜单（点选跳转、无手势联动、无演出）。
 * 图标暂用 emoji 占位，P9 频道批次换 PersonaIcon（guide §11）。
 * 仅移动端（BottomNav md:hidden 天然限定）；桌面侧栏本就全量入口。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic } from '@/utils/feedback';
import { zClass } from '@/utils/zIndex';
import { useUiChannel } from '@/ui/useUiChannel';
import { RadialWheelP5 } from '@/components/RadialWheelP5';

export interface WheelItem {
  id: string;
  label: string;
  icon: string;
  /** 碑牌底部英文小字（P5 形态用，参考设计稿） */
  en: string;
}

export const WHEEL_ITEMS: WheelItem[] = [
  { id: 'astrology', label: '塔罗', icon: '🔮', en: 'TAROT' },
  { id: 'activities', label: '记录', icon: '✍️', en: 'RECORD' },
  { id: 'todos', label: '任务', icon: '⚡', en: 'TASKS' },
  { id: 'cooperation', label: '羁绊', icon: '🃏', en: 'BOND' },
  { id: 'ledger', label: '记账', icon: '💰', en: 'ACCOUNT' },
  { id: 'achievements', label: '成就', icon: '🏆', en: 'ACHIEVE' },
  { id: 'settings', label: '设置', icon: '⚙️', en: 'SETTING' },
];

const DEAD_ZONE = 48;      // ◈ 周围取消死区（px）
const SPAN = 180;          // 七瓣铺满的上半环角度
const SEG = SPAN / WHEEL_ITEMS.length;

export interface RadialQuickNavProps {
  open: boolean;
  /** ◈ 按钮中心（视口坐标）；null 时组件不渲染 */
  origin: { x: number; y: number } | null;
  onClose: () => void;
  /** 松手选定：调用方负责转场+跳转 */
  onNavigate: (pageId: string) => void;
}

export const RadialQuickNav = ({ open, origin, onClose, onNavigate }: RadialQuickNavProps) => {
  const bold = useBoldness();
  const channel = useUiChannel();
  const [active, setActive] = useState<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const gestureRef = useRef({ onClose, onNavigate });
  gestureRef.current = { onClose, onNavigate };

  // 手势追踪（bold 模式）：window 级 pointer 监听——手指从 ◈ 长按起从未离屏
  useEffect(() => {
    if (!open || !origin || !bold) return;
    setActive(null);
    activeRef.current = null;

    const pick = (cx: number, cy: number): number | null => {
      const dx = cx - origin.x;
      const dy = cy - origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist < DEAD_ZONE || dy > 0) return null; // 死区 / 下半平面 = 取消态
      const angDeg = (Math.atan2(dy, dx) * 180) / Math.PI; // 上半平面 ∈ (-180, 0)
      const idx = Math.floor((angDeg + 180) / SEG);
      return Math.max(0, Math.min(WHEEL_ITEMS.length - 1, idx));
    };

    const onMove = (e: PointerEvent) => {
      const next = pick(e.clientX, e.clientY);
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActive(next);
        if (next !== null) triggerLightHaptic();
      }
    };
    const onUp = (e: PointerEvent) => {
      const idx = pick(e.clientX, e.clientY);
      const { onClose: close, onNavigate: nav } = gestureRef.current;
      close();
      if (idx !== null) nav(WHEEL_ITEMS[idx].id);
    };
    const onCancel = () => gestureRef.current.onClose();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [open, origin, bold]);

  if (!origin) return null;

  const radius = Math.min(148, window.innerWidth / 2 - 46);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zClass.cutin}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          aria-label="快捷跳转轮盘"
          role="menu"
        >
          {/* 遮罩：频道底色压暗 */}
          <div className="absolute inset-0 bg-black/72 backdrop-blur-[2px]" onClick={onClose} />

          {bold ? (
            <>
              {/* 提示区（避开牌区上移；P5 碑牌自身已放大变红，不再重复大字名） */}
              <div
                className="pointer-events-none absolute z-[70] w-full -translate-x-1/2 text-center"
                style={{ left: origin.x, top: origin.y - radius - (channel === 'p5' || channel === 'p3' ? 228 : 128) }}
              >
                {channel !== 'p5' && channel !== 'p3' && (
                  <div className="text-2xl font-black text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
                    {active !== null ? WHEEL_ITEMS[active].label : '滑向目标'}
                  </div>
                )}
                <div className="mt-1 text-[11px] font-bold text-white/60" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.8)' }}>
                  松开前往 · 滑回中心取消
                </div>
              </div>

              {/* P5（红）/P3（蓝）：碑牌手扇 + 星形波纹 + 同心条纹星群——结构同源，
                  颜色全走 var(--color-primary) 自适应频道；P3 专属微调后置（用户口径） */}
              {channel === 'p5' || channel === 'p3' ? (
                <RadialWheelP5 items={WHEEL_ITEMS} origin={origin} radius={radius} active={active} />
              ) : (
              /* 其余频道暂用圆瓣基础形态（P4 差分后置） */
              WHEEL_ITEMS.map((item, i) => {
                const ang = ((-180 + (i + 0.5) * SEG) * Math.PI) / 180;
                const x = origin.x + radius * Math.cos(ang);
                const y = origin.y + radius * Math.sin(ang);
                const isActive = active === i;
                return (
                  <motion.div
                    key={item.id}
                    role="menuitem"
                    aria-label={item.label}
                    className="pointer-events-none absolute flex flex-col items-center justify-center rounded-full border-2"
                    style={{
                      left: x,
                      top: y,
                      width: 62,
                      height: 62,
                      marginLeft: -31,
                      marginTop: -31,
                      background: isActive ? 'var(--color-primary)' : 'rgba(17,24,39,0.92)',
                      borderColor: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                      boxShadow: isActive ? '0 0 0 4px color-mix(in srgb, var(--color-primary) 40%, transparent), 3px 4px 0 rgba(0,0,0,0.6)' : '2px 3px 0 rgba(0,0,0,0.5)',
                    }}
                    initial={{ scale: 0, x: origin.x - x, y: origin.y - y, opacity: 0 }}
                    animate={{ scale: isActive ? 1.28 : active === null ? 1 : 0.86, x: 0, y: 0, opacity: active === null || isActive ? 1 : 0.62 }}
                    exit={{ scale: 0, x: origin.x - x, y: origin.y - y, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 26, delay: 0.02 * i }}
                  >
                    <span className="text-xl leading-none" aria-hidden>{item.icon}</span>
                    <span className="mt-0.5 text-[9px] font-black leading-none text-white">{item.label}</span>
                  </motion.div>
                );
              })
              )}

              {/* ◈ 死区提示环 */}
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-full border border-white/25"
                style={{ left: origin.x - DEAD_ZONE, top: origin.y - DEAD_ZONE, width: DEAD_ZONE * 2, height: DEAD_ZONE * 2 }}
              />
            </>
          ) : (
            /* D0 降级：普通垂直菜单（点选跳转） */
            <div
              className="absolute -translate-x-1/2 rounded-2xl border border-gray-700 bg-gray-900 p-2 shadow-2xl"
              style={{ left: origin.x, bottom: window.innerHeight - origin.y + 40, width: 200 }}
              role="menu"
            >
              {WHEEL_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-white active:bg-white/10"
                  onClick={() => {
                    onClose();
                    onNavigate(item.id);
                  }}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
