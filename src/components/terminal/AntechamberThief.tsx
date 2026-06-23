/**
 * AntechamberThief — F3 玄关「怪盗 channel」皮肤（红/自定义主题，Persona 5 风）。
 *
 * 重写（learn-not-copy 自开源 P5 菜单的技法，仓库无 license 故只取技法、代码自写）：
 * P5 的招牌不是碎纸拼贴，而是 **大块倾斜四边形色块 + 厚重四向黑描边大字 + 强红黑对比 + 大角度倾斜**。
 * 用 4 点 clip-path 斜块、四角 text-shadow 描边、强对角能量线、halftone 红块、怪盗面具 + 旋转星爆。
 * D0/reduced-motion 直接出静态。
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic, triggerThemeSwitchFeedback } from '@/utils/feedback';
import { heavy, Slab, StarBurst, Mask, P5Highlight, Ransom } from './thiefKit';
import type { TerminalSkin } from '@/utils/terminalSkin';

interface Props {
  skin: TerminalSkin;
  onEnter: () => void;
  onBack: () => void;
}

let _thiefIntroSeen = false;

export const AntechamberThief = ({ skin, onEnter, onBack }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();
  const [phase, setPhase] = useState<'intro' | 'rest'>(() => (bold && !_thiefIntroSeen ? 'intro' : 'rest'));
  const [popping, setPopping] = useState(false);
  const intro = phase === 'intro';

  useEffect(() => {
    if (!intro) return;
    _thiefIntroSeen = true;
    const t = setTimeout(() => setPhase('rest'), 2200);
    return () => clearTimeout(t);
  }, [intro]);

  // 进入红色频道时播一次红主题切换音（"接通怪盗 channel"）
  useEffect(() => {
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = () => {
    if (popping) return;
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    // 选中确认：快速跳一下(缩放 bounce)再进入；D0 直接进
    if (!bold) { onEnter(); return; }
    setPopping(true);
    setTimeout(onEnter, 230);
  };

  const slam = (delay: number, rest = 0, fromX = -30) =>
    intro
      ? {
          initial: { opacity: 0, scale: 1.35, rotate: rest - 7, x: fromX },
          animate: { opacity: 1, scale: 1, rotate: rest, x: 0 },
          transition: { type: 'spring' as const, damping: 12, stiffness: 330, delay },
        }
      : { initial: false as const, animate: { opacity: 1, scale: 1, rotate: rest, x: 0 }, transition: { duration: 0.12 } };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: bold ? 0.25 : 0.12 }}
      className="fixed inset-0 z-40 overflow-hidden bg-[#0d0d0d]"
      onClick={() => intro && setPhase('rest')}
    >
      {/* 大红斜块（右上对角主色块）+ halftone */}
      <div aria-hidden className="pointer-events-none absolute -right-[12%] -top-[14%] h-[78%] w-[90%]" style={{ background: 'var(--color-primary)', clipPath: 'polygon(28% 0%, 100% 0%, 100% 100%, 0% 62%)', transform: 'rotate(2deg)' }} />
      <div aria-hidden className="pointer-events-none absolute -right-[12%] -top-[14%] h-[78%] w-[90%]" style={{ backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.55) 1.3px, transparent 1.7px)', backgroundSize: '8px 8px', clipPath: 'polygon(28% 0%, 100% 0%, 100% 100%, 0% 62%)', transform: 'rotate(2deg)' }} />
      {/* 黑色对角大块（压住下半，作内容底） */}
      <div aria-hidden className="pointer-events-none absolute -bottom-[10%] -left-[6%] h-[72%] w-[92%] bg-black" style={{ clipPath: 'polygon(0% 18%, 100% 0%, 100% 100%, 0% 100%)', transform: 'rotate(-2deg)' }} />
      {/* 对角能量斜条 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]">
        {[18, 42, 70, 88].map((t, i) => (
          <div key={i} className="absolute left-[-10%] h-[3px] w-[120%] bg-white" style={{ top: `${t}%`, transform: 'rotate(-9deg)' }} />
        ))}
      </div>
      {/* 勒索信剪报「TAKE YOUR / HEART」（右上，两行右对齐，替代面具剪影） */}
      <motion.div {...slam(intro ? 0.28 : 0, -6, 30)} className="pointer-events-none absolute right-3 top-12 z-10 flex max-w-[85%] flex-col items-end">
        <Ransom lines={['TAKE YOUR', 'HEART']} />
      </motion.div>
      {/* 角落小星 */}
      <StarBurst className="pointer-events-none absolute left-[8%] top-[10%] h-9 w-9 -rotate-12 opacity-90" />

      {/* 返回 */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="返回" className="absolute left-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl text-white/80 hover:bg-white/10">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      {/* ── 主体（偏左下，对角） ── */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end px-6 pb-14">
        {/* 台标 */}
        <motion.div {...slam(intro ? 0.15 : 0, -4)} className="mb-3 self-start">
          <Slab fill="var(--color-primary)" variant={1}>
            <div className="px-4 py-1 text-xs font-black tracking-[3px]" style={heavy(2)}>★ {skin.label.toUpperCase()}</div>
          </Slab>
        </motion.div>

        {/* 主标题：超大厚描边斜字 */}
        <motion.div {...slam(intro ? 0.4 : 0, -5)} className="mb-4 self-start text-[2.9rem] font-black leading-[0.95]" style={heavy(4)}>
          {skin.heroTitle}
        </motion.div>

        {/* 副标语：红斜块 */}
        <motion.div {...slam(intro ? 0.62 : 0, 2)} className="mb-8 self-start">
          <Slab fill="var(--color-primary)" variant={2}>
            <div className="px-4 py-2 text-lg font-black" style={heavy(2.5)}>{skin.heroSub}</div>
          </Slab>
        </motion.div>

        {/* 潜入按钮：P5 活高亮(抖动红青色差) + 点击跳一下确认 */}
        <motion.button
          type="button"
          onClick={(e) => { e.stopPropagation(); enter(); }}
          aria-label={skin.enterLabel}
          initial={intro ? { opacity: 0, scale: 0.5, rotate: -3 } : false}
          animate={popping ? { scale: [1, 1.22, 0.9, 1.06, 1], rotate: -3, opacity: 1 } : { opacity: 1, scale: 1, rotate: -3 }}
          transition={popping ? { duration: 0.26, ease: 'easeOut' } : { type: 'spring', damping: 11, stiffness: 360, delay: intro ? 0.95 : 0 }}
          whileTap={popping ? undefined : { scale: 0.95 }}
          className="relative self-center"
        >
          {/* P5「活高亮」框（抖动红青，screen 混合；横向探出、纵向贴按钮高度） */}
          <P5Highlight className="absolute -inset-x-3 -inset-y-1 -z-10" />
          <Slab fill="var(--color-primary)" variant={0}>
            <div className="flex items-center gap-3 px-9 py-3">
              <Mask className="h-8 w-14 shrink-0" />
              <span className="text-3xl font-black tracking-widest" style={heavy(3)}>{skin.enterLabel}</span>
            </div>
          </Slab>
        </motion.button>

        <motion.div initial={intro ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: intro ? 1.3 : 0 }} className="mt-3 self-center text-[11px] tracking-widest text-white/55">
          {intro ? '轻点跳过' : '轻点面具 · 潜入'}
        </motion.div>
      </div>
    </motion.div>
  );
};
