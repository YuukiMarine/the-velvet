/**
 * TerminalRoom — F3 治疗终端正文的「频道房间」外壳（阶段 2，骨架皮肤化）。
 *
 * 把原本「普通滚动列表」升级为一间有频道性格的房间：固定在视口后方的频道背景 +
 * 频道化页头（返回 / 据点台标 / 在线指示），正文内容在房间里滚动。
 *
 * 当前实装 thief（红 · 怪盗 P5 据点）；board/tv 暂用中性暗底占位（各自轮次再补）。
 * 背景纯装饰、pointer-events-none、全部静态（无无限动画）——不与「2 秒急救路径」抢资源。
 */
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { TerminalChannel } from '@/utils/terminalSkin';
import { Halftone, SpeedLines, StarBurst, heavy } from './thiefKit';

interface Props {
  channel: TerminalChannel;
  title: string;
  /** 在线指示旁的频道名 */
  channelLabel: string;
  onBack: () => void;
  children: ReactNode;
}

/** 怪盗据点背景：黑底 + 右上红斜块出血 + halftone + 左下黑对角块 + 速度线 + 暗角。
 *  桌面端 md:left-60 让出左侧 Sidebar（w-60）宽度，避免固定背景盖住导航。 */
const ThiefRoomBg = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0d0d0d] md:left-60">
    <div className="absolute -right-[18%] -top-[12%] h-[62%] w-[86%]" style={{ background: 'var(--color-primary)', opacity: 0.9, clipPath: 'polygon(30% 0%, 100% 0%, 100% 100%, 0% 55%)', transform: 'rotate(2deg)' }} />
    <Halftone className="absolute -right-[18%] -top-[12%] h-[62%] w-[86%]" style={{ clipPath: 'polygon(30% 0%, 100% 0%, 100% 100%, 0% 55%)', transform: 'rotate(2deg)' }} />
    <div className="absolute -bottom-[14%] -left-[8%] h-[60%] w-[94%] bg-black" style={{ clipPath: 'polygon(0% 22%, 100% 0%, 100% 100%, 0% 100%)', transform: 'rotate(-2deg)' }} />
    <SpeedLines className="" lines={[14, 34, 58, 80, 92]} angle={-9} opacity={0.05} />
    <StarBurst className="absolute right-[8%] top-[6%] h-7 w-7 rotate-12 opacity-80" />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 42%, transparent 30%, rgba(0,0,0,0.72) 100%)' }} />
  </div>
);

export const TerminalRoom = ({ channel, title, channelLabel, onBack, children }: Props) => {
  const thief = channel === 'thief';
  return (
    <div className="relative min-h-[100dvh]">
      {thief ? <ThiefRoomBg /> : <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[#0d0d0f] md:left-60" />}

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-28 pt-3">
        {/* 页头 */}
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/80 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <motion.h1
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xl font-black tracking-wide"
            style={thief ? heavy(2.5) : { color: '#fff' }}
          >
            {title}
          </motion.h1>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-primary">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
            {channelLabel}
          </span>
        </div>

        {children}
      </div>
    </div>
  );
};
