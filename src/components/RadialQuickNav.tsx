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
import { RadialWheelP3, p3Pick, p3Strip } from '@/components/RadialWheelP3';
import { RadialWheelP4 } from '@/components/RadialWheelP4';

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

  /**
   * 开启代号（v2.7.0.3，用户上报「极短时间内触发两次，装饰全消失只剩选项」）。
   *
   * 根层淡出只有 0.16s，但 AnimatePresence 要等**子树所有退场动画**（碑牌/菱形徽/
   * 天空楔的弹簧，0.5~0.9s 才收敛）全部结束才真正卸载。在这个窗口里再次长按，
   * AnimatePresence 会**复用退场中的旧实例**：波纹的 CSS 一次性动画停在结束帧
   * （fill both → 透明度 0，不会重播）、播完即卸的波纹组件早已 gone、退场里被设
   * 成 none 的 pointerEvents 也一并残留——只有带 animate 的选项弹回来，正是
   * 「只留下轮盘的选项」。每次打开换一个 key = 强制全新挂载：旧树自顾自退完，
   * 新树从零开演，所有一次性演出（波纹/入场弹簧/CSS 动画）全部照常。
   */
  const genRef = useRef(0);
  const prevOpenRef = useRef(false);
  if (open && !prevOpenRef.current) genRef.current += 1;
  prevOpenRef.current = open;

  // 手势追踪（bold 模式）：window 级 pointer 监听——手指从 ◈ 长按起从未离屏
  useEffect(() => {
    if (!open || !origin || !bold) return;
    setActive(null);
    activeRef.current = null;

    // P3 的条目是等距直排，不是扇形：命中要按横向分带算，否则"手指在哪"和
    // "哪条亮"对不上（角度分区的 cos 分布会把两端挤成一堆）。
    const pick = (cx: number, cy: number): number | null => {
      if (channel === 'p3') return p3Pick(origin, WHEEL_ITEMS.length, cx, cy);
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
  }, [open, origin, bold, channel]);

  if (!origin) return null;

  const radius = Math.min(148, window.innerWidth / 2 - 46);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key={genRef.current}
          className={`fixed inset-0 ${zClass.cutin}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          // pointerEvents:'none' 随 exit 立刻生效（非插值属性）：淡出的 0.16s 里这张
          // 全屏遮罩还在 DOM 里，此前会把落在它身上的 pointerdown 整个吃掉——刚松手
          // 又立刻长按 ◈ 的那一下就这么没了，表现为「一次短 CD 触发不了菜单」（用户上报）。
          exit={{ opacity: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.16 }}
          aria-label="快捷跳转轮盘"
          role="menu"
        >
          {/* 遮罩：频道底色压暗。
              注意 bg-black/72 是**不存在的类**——Tailwind 的透明度修饰符只认 opacity 阶梯
              （…65 / 70 / 75…），72 不在表里、也没走 [0.72] 方括号，于是这层一直是全透明的，
              压暗从来没生效过。用方括号任意值写回去。
              P3 换成「以 ◈ 为心向外渐暗 + 顶部再压一道」的双层渐变：手按住的地方最亮、
              越往外越沉，色阶拉得很开（羽化高）所以看不出圈层。
              ⚠️ 不要在这层加 backdrop-blur（v2.7.1 摘除）：全屏 backdrop-filter 在安卓上
              是重量级渲染面——本层还在父级的 0.16s 透明度进出场里，淡入淡出期间每帧都要
              按整屏分辨率重算模糊；页面底下但凡有会动的东西（背景动画/战场扫描线），
              轮盘开着的每一帧都在重算。72% 黑幕背后 2px 的模糊本就看不出来，
              代价却是用户上报的「长按彩蛋严重闪烁」的主源之一。 */}
          <div
            className={`absolute inset-0 ${channel === 'p3' ? '' : 'bg-black/[0.72]'}`}
            style={
              channel === 'p3'
                ? {
                    background: [
                      `radial-gradient(circle 76vmax at ${origin.x}px ${origin.y}px,` +
                        ' rgba(6,20,78,0.34) 0%, rgba(5,16,66,0.52) 22%, rgba(4,12,54,0.72) 48%,' +
                        ' rgba(3,8,42,0.86) 72%, rgba(2,5,30,0.94) 100%)',
                      'linear-gradient(180deg, rgba(2,5,30,0.74) 0%, rgba(2,5,30,0.44) 22%, rgba(2,5,30,0.14) 44%, rgba(2,5,30,0) 62%)',
                    ].join(','),
                  }
                : undefined
            }
            onClick={onClose}
          />

          {bold ? (
            <>
              {/* 提示区（避开牌区上移；P5 碑牌自身已放大变红，不再重复大字名）。
                  P3 的条带是直排、底缘固定，提示落到条带下方而不是牌区上方。 */}
              <div
                className="pointer-events-none absolute z-[70] w-full -translate-x-1/2 text-center"
                style={
                  channel === 'p3'
                    ? { left: origin.x, top: p3Strip(origin, WHEEL_ITEMS.length).bottom + 16 }
                    : { left: origin.x, top: origin.y - radius - (channel === 'p5' ? 228 : channel === 'p4' ? 150 : 128) }
                }
              >
                {channel !== 'p5' && channel !== 'p3' && channel !== 'p4' && (
                  <div className="text-2xl font-black text-white" style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.8)' }}>
                    {active !== null ? WHEEL_ITEMS[active].label : '滑向目标'}
                  </div>
                )}
                <div className="mt-1 text-[11px] font-bold text-white/60" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.8)' }}>
                  {channel === 'p3' ? '松开前往 · 滑回下方取消' : '松开前往 · 滑回中心取消'}
                </div>
              </div>

              {/* P3（蓝）：白底竖条带 + 圆环波纹 + VELVET TIME 大字背景 */}
              {channel === 'p3' ? (
                <RadialWheelP3 items={WHEEL_ITEMS} origin={origin} active={active} />
              ) : channel === 'p5' ? (
                /* P5（红）：碑牌手扇 + 星形波纹 + 同心条纹星群 */
                <RadialWheelP5 items={WHEEL_ITEMS} origin={origin} radius={radius} active={active} />
              ) : channel === 'p4' ? (
                /* P4（黄）：四角星粗波纹 → 同心圆盘 → 中心大星 + 衬线大字 */
                <RadialWheelP4 items={WHEEL_ITEMS} origin={origin} radius={radius} active={active} />
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

              {/* ◈ 死区提示环（P3 走横向分带、没有死区，不画） */}
              {channel !== 'p3' && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute rounded-full border border-white/25"
                  style={{ left: origin.x - DEAD_ZONE, top: origin.y - DEAD_ZONE, width: DEAD_ZONE * 2, height: DEAD_ZONE * 2 }}
                />
              )}
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
