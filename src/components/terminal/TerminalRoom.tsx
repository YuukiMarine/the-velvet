/**
 * TerminalRoom — F3 治疗终端正文的「频道房间」外壳（阶段 2，骨架皮肤化）。
 *
 * 把原本「普通滚动列表」升级为一间有频道性格的房间：固定在视口后方的频道背景 +
 * 频道化页头（返回 / 据点台标 / 在线指示），正文内容在房间里滚动。
 *
 * 已实装 thief（红 · 怪盗 P5 据点）、board（蓝/粉/自定义 · 千禧 BBS / CRT 桌面）；
 * tv 暂用中性暗底占位（其轮次再补）。背景纯装饰、pointer-events-none、静态（无无限动画）。
 * 桌面 md:left-60 让出左侧 Sidebar，避免固定背景盖住导航。
 */
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { TerminalChannel } from '@/utils/terminalSkin';
import { Halftone, SpeedLines, StarBurst, heavy } from './thiefKit';
import { Scanlines, MONO } from './boardKit';

interface Props {
  channel: TerminalChannel;
  title: string;
  /** 在线指示旁的频道名 */
  channelLabel: string;
  onBack: () => void;
  children: ReactNode;
}

/** 怪盗据点背景：黑底 + 右上红斜块出血 + halftone + 左下黑对角块 + 速度线 + 暗角。 */
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

/** 讨论板桌面背景：深 CRT 底 + 点阵桌面 + 扫描线 + 暗角 */
const BoardRoomBg = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#070b11] md:left-60">
    <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--color-primary) 24%, transparent) 1px, transparent 1px)', backgroundSize: '22px 22px', opacity: 0.45 }} />
    <Scanlines opacity={0.7} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 38%, transparent 52%, rgba(0,0,0,0.74) 100%)' }} />
  </div>
);

/** TV 演播厅背景：低亮老电视管面 + 动态扫描线 / 雪花点噪声 + 暗角 */
const TVRoomBg = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#11100a] md:left-60">
    <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 88% at 50% 35%, rgba(255,225,0,0.12) 0%, rgba(255,225,0,0.045) 38%, transparent 62%)' }} />
    <div className="absolute inset-0 opacity-75 tv-crt-scanlines" />
    <div className="absolute inset-0 tv-crt-noise" />
    <div className="absolute inset-0 opacity-35" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,225,0,.12) 1px, transparent 1.8px)', backgroundSize: '18px 18px' }} />
    <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 150px 44px rgba(0,0,0,0.86)' }} />
    <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 42%, transparent 48%, rgba(0,0,0,0.68) 100%)' }} />
  </div>
);

export const TerminalRoom = ({ channel, title, channelLabel, onBack, children }: Props) => {
  const thief = channel === 'thief';
  const board = channel === 'board';
  const tv = channel === 'tv';
  return (
    <div className="relative min-h-[100dvh]">
      {thief ? <ThiefRoomBg /> : board ? <BoardRoomBg /> : tv ? <TVRoomBg /> : <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-[#0d0d0f] md:left-60" />}

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
            className={board || tv ? 'min-w-0 truncate text-lg font-bold tracking-wide text-white' : 'text-xl font-black tracking-wide'}
            style={thief ? heavy(2.5) : board ? { fontFamily: MONO } : { color: '#fff' }}
          >
            {board ? `▓ ${title}` : tv ? `▶ ${title}` : title}
          </motion.h1>
          {tv ? (
            <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-black tracking-widest text-white/90">
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[#ff2e2e]" style={{ boxShadow: '0 0 6px #ff2e2e' }} aria-hidden />
              LIVE
            </span>
          ) : (
            <span
              className={`ml-auto flex shrink-0 items-center gap-1.5 text-[11px] font-bold tracking-widest ${board ? 'bk-fg' : 'text-primary'}`}
              style={board ? { fontFamily: MONO } : undefined}
            >
              <span className={`inline-flex h-2 w-2 animate-pulse rounded-full ${board ? 'bk-bg' : 'bg-primary'}`} aria-hidden />
              {board ? '在线' : channelLabel}
            </span>
          )}
        </div>

        {children}
      </div>
    </div>
  );
};
