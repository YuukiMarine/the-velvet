import { motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R } from '@/components/p3r/kit';
import { P5R, P5_FONT, roughQuad, P5Star } from '@/components/p5r/kit';

/**
 * CardNameReveal —— 抽到的牌名大字亮相（三频道各一套皮）。
 *
 * 逆位在牌名后追「· 逆位」（与羁绊铭牌同口径）。动效：牌名逐字自下弹入 + 一道高光
 * 横扫；逆位后缀晚半拍落位。D0（boldness=0）直接给终态、零动画。
 */
export const CardNameReveal = ({ name, nameEn, reversed, delay = 0 }: {
  name: string;
  nameEn?: string;
  reversed: boolean;
  delay?: number;
}) => {
  const anim = useBoldness();
  const channel = useUiChannel();
  const chars = Array.from(name);

  const skin = {
    p5: { ink: P5R.paper, sub: '#a9a49b', tag: P5R.red, tagInk: P5R.paper, shadow: '3px 3px 0 #050505', font: P5_FONT },
    // 墨色走 --ui-ink：内联 style 毯式 CSS 够不着，写死 #131313 在 P4 夜间紫舞台上
    // 就是黑字压深底（用户上报「塔罗牌下方字体是黑色看不清」）。浅色值与原样相同。
    p4: { ink: 'var(--ui-ink, #131313)', sub: 'color-mix(in srgb, var(--ui-ink, #131313) 60%, transparent)', tag: 'var(--p4-orange, #f9a11b)', tagInk: '#131313', shadow: 'none', font: 'var(--p4-display-font, serif)' },
    p3: { ink: P3R.blueDeep, sub: P3R.grey, tag: P3R.magenta, tagInk: '#ffffff', shadow: 'none', font: 'inherit' },
    neutral: { ink: 'var(--ui-ink, #111827)', sub: 'var(--ui-muted, #6b7280)', tag: 'var(--ui-accent)', tagInk: '#ffffff', shadow: 'none', font: 'inherit' },
  }[channel];

  return (
    <div className="relative flex flex-col items-center gap-1.5 px-3 text-center">
      <div className="relative flex flex-wrap items-center justify-center">
        <h3
          className="relative flex flex-wrap items-baseline justify-center text-[34px] font-black leading-none tracking-[0.04em]"
          style={{ color: skin.ink, textShadow: skin.shadow, fontFamily: skin.font }}
        >
          {chars.map((ch, i) => (
            <motion.span
              key={i}
              className="inline-block"
              initial={anim ? { y: 26, opacity: 0, scale: 0.7 } : false}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 460, damping: 24, delay: delay + i * 0.07 }}
            >
              {ch}
            </motion.span>
          ))}
        </h3>
        {reversed && (
          <motion.span
            className="ml-2 inline-flex shrink-0 items-center gap-1 self-center px-2.5 py-1 text-[14px] font-black leading-none"
            style={{
              background: skin.tag,
              color: skin.tagInk,
              fontFamily: skin.font,
              ...(channel === 'p5'
                ? { clipPath: roughQuad(612, 3), boxShadow: `2px 2.5px 0 ${P5R.ink}` }
                : { borderRadius: channel === 'p4' ? 8 : 3 }),
            }}
            initial={anim ? { scale: 0, rotate: -18 } : false}
            animate={{ scale: 1, rotate: channel === 'p5' ? -3 : 0 }}
            transition={{ type: 'spring', stiffness: 480, damping: 18, delay: delay + chars.length * 0.07 + 0.12 }}
          >
            {channel === 'p5' && <P5Star size={11} fill={P5R.paper} />}
            · 逆位
          </motion.span>
        )}
        {/* 高光横扫（纯装饰，一次性） */}
        {anim && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-[46%]"
            style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.55), transparent)' }}
            initial={{ left: '-50%', opacity: 0 }}
            animate={{ left: '110%', opacity: [0, 1, 0] }}
            transition={{ duration: 0.8, delay: delay + chars.length * 0.07 + 0.05, ease: 'easeInOut' }}
          />
        )}
      </div>
      {nameEn && (
        <motion.span
          className="text-[11px] font-black tracking-[0.22em]"
          style={{ color: skin.sub, fontFamily: skin.font }}
          initial={anim ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: delay + chars.length * 0.07 + 0.2 }}
        >
          {nameEn.toUpperCase()}
        </motion.span>
      )}
    </div>
  );
};
