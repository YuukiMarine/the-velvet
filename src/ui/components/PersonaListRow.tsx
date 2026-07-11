/**
 * PersonaListRow —— 列表行原语（PERSONA_UI_REWRITE_GUIDE §8.6 / §17.3）。
 *
 * 三频道三形态：P5 纸条（selected 放大+红贴角，completed 被斜纹划过但可读）；
 * P4 节目单条（左缘彩色频道条，completed 盖 CLEAR 章）；
 * P3 战术条（白/浅青斜面，selected 亮蓝反转+洋红角标）。
 *
 * 铁律（guide §22.3）：clip-path 只裁视觉层，button 本体 hit area 保持完整矩形；
 * 文字层恒水平。行高紧凑但可点区 ≥48px（guide §18.1）。
 */
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { UIChannel } from '../channel';
import { useUiChannel } from '../useUiChannel';
import { channelMotion } from '../motion';
import { SignalStripes } from '../motifs';

export interface PersonaListRowProps {
  channel?: UIChannel;
  title: string;
  subtitle?: string;
  /** 日期 / 等级 / 奖励等小信息（title 右侧或行尾） */
  meta?: ReactNode;
  /** 状态符号 / 头像 / 属性图标 */
  leading?: ReactNode;
  /** 更多 / 完成钮 / 进入箭头 */
  trailing?: ReactNode;
  selected?: boolean;
  completed?: boolean;
  danger?: boolean;
  onClick?: () => void;
  className?: string;
}

export const PersonaListRow = ({
  channel,
  title,
  subtitle,
  meta,
  leading,
  trailing,
  selected = false,
  completed = false,
  danger = false,
  onClick,
  className,
}: PersonaListRowProps) => {
  const inherited = useUiChannel();
  const ch = channel ?? inherited;
  const hit = channelMotion(ch).hit;

  const inner = (
    <>
      {leading && <div className="flex shrink-0 items-center">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`truncate font-bold leading-tight ${completed ? 'opacity-70' : ''}`}>{title}</span>
          {meta && <span className="ml-auto shrink-0 text-[11px] opacity-70">{meta}</span>}
        </div>
        {subtitle && <div className="mt-0.5 truncate text-xs opacity-65">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center">{trailing}</div>}
    </>
  );

  if (ch === 'p5') {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={onClick ? hit : undefined}
        className={`relative block w-full min-h-[48px] text-left ${className ?? ''}`}
        style={{ scale: selected ? 1.02 : 1, x: selected ? 4 : 0 }}
      >
        <div
          className={`relative flex items-center gap-3 border-2 px-3.5 py-2.5 ${
            danger ? 'border-[var(--ui-danger)]' : 'border-black'
          }`}
          style={{
            background: selected ? '#fffdf6' : 'var(--ui-paper)',
            color: '#0d0d0d',
            boxShadow: selected ? '5px 5px 0 var(--ui-accent)' : '3px 3px 0 rgba(0,0,0,0.8)',
            transform: 'rotate(-0.4deg)',
          }}
        >
          {inner}
          {/* completed：黑红斜纹划过（装饰层，字仍可读） */}
          {completed && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.16]"
              style={{ background: 'repeating-linear-gradient(-45deg, #000 0 6px, transparent 6px 14px, var(--ui-accent) 14px 18px, transparent 18px 28px)' }}
            />
          )}
          {/* selected：红色贴角 */}
          {selected && (
            <span aria-hidden className="absolute -right-1.5 -top-1.5 h-4 w-4 border-2 border-black" style={{ background: 'var(--ui-accent)', transform: 'rotate(12deg)' }} />
          )}
        </div>
      </motion.button>
    );
  }

  if (ch === 'p4') {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={onClick ? hit : undefined}
        className={`relative block w-full min-h-[48px] overflow-hidden rounded-lg border-2 border-black text-left ${className ?? ''}`}
        style={{
          background: selected ? '#111111' : 'var(--ui-paper)',
          color: selected ? 'var(--ui-bg)' : '#111111',
          boxShadow: '0 3px 0 #000',
        }}
      >
        <div className="relative flex items-center gap-3 py-2.5 pl-4 pr-3.5">
          {/* 左缘频道条：selected 全彩，未选中淡化 */}
          <SignalStripes className={`absolute inset-y-0 left-0 w-[5px] ${selected ? '' : 'opacity-40'}`} />
          {inner}
          {/* completed：CLEAR 章 */}
          {completed && (
            <span
              aria-hidden
              className="absolute right-2 top-1 rounded border-2 border-current px-1 text-[9px] font-black tracking-widest opacity-80"
              style={{ transform: 'rotate(8deg)', color: danger ? 'var(--ui-danger)' : selected ? 'var(--ui-bg)' : '#111' }}
            >
              CLEAR
            </span>
          )}
        </div>
      </motion.button>
    );
  }

  if (ch === 'p3') {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={onClick ? hit : undefined}
        aria-pressed={onClick ? selected : undefined}
        className={`relative block min-h-[48px] w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b5cff] focus-visible:ring-offset-2 ${className ?? ''}`}
      >
        {/* 视觉层裁切；hit area 是外层完整矩形 */}
        <div
          className="relative flex items-center gap-3 px-4 py-2.5"
          style={{
            clipPath: 'polygon(3% 0, 100% 0, 97% 100%, 0 100%)',
            background: selected
              ? 'var(--p3-blue, #0b5cff)'
              : completed
                ? 'rgba(218,246,255,0.9)'
                : 'rgba(255,255,255,0.94)',
            color: selected ? '#ffffff' : '#07143f',
            boxShadow: selected ? '0 10px 22px rgba(11,92,255,0.14)' : '0 8px 20px rgba(35,111,154,0.07)',
            opacity: completed ? 0.78 : 1,
          }}
        >
          {/* selected：洋红角标只承担当前状态，不参与命中。 */}
          {selected && (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-0 right-0 h-4 w-4 bg-[var(--ui-danger)]"
              style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
            />
          )}
          {completed && !selected && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 opacity-55"
              style={{ background: 'var(--p3-cyan, #20cfe8)', clipPath: 'polygon(45% 0, 100% 0, 100% 100%, 0 100%)' }}
            />
          )}
          {inner}
        </div>
      </motion.button>
    );
  }

  // neutral —— 现状卡片行
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={onClick ? hit : undefined}
      className={`relative block w-full min-h-[48px] rounded-xl border text-left transition-colors ${
        selected
          ? 'border-primary/50 bg-primary/5'
          : danger
            ? 'border-red-300 bg-white dark:border-red-800 dark:bg-gray-900'
            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900'
      } ${completed ? 'opacity-60' : ''} ${className ?? ''}`}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5 text-gray-800 dark:text-gray-100">{inner}</div>
    </motion.button>
  );
};
