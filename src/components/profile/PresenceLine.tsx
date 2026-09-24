/**
 * 名片状态 / 目标（v2.7.0.6 第 6 项）的展示件。
 *
 *   useStatusSwap + SwapFaces   状态和 LV / RANK 共用一枚标签：有状态时先显示状态，
 *                               3 秒或点一下「快速渐变」切到等级，再 3 秒切回来；没状态只显示等级
 *   GoalLine                   「TARGET 「背完 3000 词」 还有 12 天 · 60%」
 *
 * 颜色：GoalLine 不传 colors 走 tailwind 明暗色；固定深色底（好友名片、专辑墙卡背）传一套 colors。
 */
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { liveStatus, type StatusPreset } from '@/constants/profileStatus';
import { goalLineText, goalPercent } from '@/utils/profilePresence';
import type { ProfileGoalSnapshot, ProfileStatus } from '@/types';

export interface PresenceColors {
  ink: string;
  sub: string;
  accent: string;
}

/** 好友名片（固定深紫底）用的一套 */
export const PRESENCE_NIGHT: PresenceColors = {
  ink: '#f5e6ff',
  sub: '#a89dc0',
  accent: '#c4b5fd',
};

/** 状态 ⇄ 等级的切换间隔 */
const SWAP_MS = 3000;

export interface StatusSwap {
  preset: StatusPreset | null;
  /** 当前这一面是不是状态 */
  showStatus: boolean;
  /** 点一下切换（顺手拦住冒泡：标签多半在可点的卡片里） */
  toggle: (e?: { stopPropagation?: () => void }) => void;
}

export function useStatusSwap(status?: ProfileStatus | null): StatusSwap {
  const preset = liveStatus(status);
  const id = preset?.id;
  const [showStatus, setShowStatus] = useState(true);
  const [kick, setKick] = useState(0);
  // 换了状态（或换了人）：先显示状态
  useEffect(() => { setShowStatus(true); }, [id]);
  // 每一面停 3 秒；点过就从点的那一刻重新数
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => setShowStatus(v => !v), SWAP_MS);
    return () => clearTimeout(t);
  }, [id, showStatus, kick]);
  const toggle = useCallback((e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    if (!id) return;
    setShowStatus(v => !v);
    setKick(k => k + 1);
  }, [id]);
  return { preset, showStatus: !!preset && showStatus, toggle };
}

const stopPointer = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * 标签外框上要挂的点击与读屏属性（没状态时什么都不加，标签照旧）。
 * pointer 事件也拦住：标签常在可翻面 / 可拖的卡片上，点标签不该顺带翻牌、换牌。
 * 光标样式另加 cursor-pointer class（这里不带 style，免得盖掉标签自己的 style）。
 */
export const swapTagProps = (swap: StatusSwap, lvText: string) => (swap.preset
  ? {
      onClick: swap.toggle,
      onPointerDown: stopPointer,
      onPointerUp: stopPointer,
      role: 'button' as const,
      'aria-label': `${swap.preset.label}（状态） / ${lvText}`,
    }
  : {});

const layer = (on: boolean): CSSProperties => ({
  gridArea: '1 / 1',
  opacity: on ? 1 : 0,
  transform: on ? 'none' : 'scale(0.9)',
  filter: on ? 'none' : 'blur(1.5px)',
  transition: 'opacity 180ms ease-out, transform 180ms ease-out, filter 180ms ease-out',
  pointerEvents: 'none',
});

/**
 * 标签里面的两面：等级（原来的内容）与状态（emoji + 名字），叠在同一格里渐变切换。
 * 宽度取两面较宽的那个，切换时标签不伸缩、旁边的东西不跳。
 */
export function SwapFaces({ swap, lv, statusClassName = '' }: { swap: StatusSwap; lv: ReactNode; statusClassName?: string }) {
  if (!swap.preset) return <>{lv}</>;
  return (
    <span className="inline-grid items-center justify-items-center">
      <span style={layer(!swap.showStatus)} aria-hidden={swap.showStatus} className="inline-flex items-baseline justify-center">{lv}</span>
      <span style={layer(swap.showStatus)} aria-hidden={!swap.showStatus} className={`inline-flex items-center gap-1 whitespace-nowrap ${statusClassName}`}>
        <span aria-hidden>{swap.preset.emoji}</span>{swap.preset.label}
      </span>
    </span>
  );
}

export function GoalLine({ goal, colors, compact = false, className = '' }: {
  goal?: ProfileGoalSnapshot | null;
  colors?: PresenceColors;
  compact?: boolean;
  className?: string;
}) {
  if (!goal) return null;
  // 窄处（卡背 / 列表卡 / 详情头部）只带百分比，把地方让给目标名字；宽处（名片）再加「还有几天」
  const line = compact
    ? (goal.done ? '✓' : typeof goal.progress === 'number' ? `${goalPercent(goal)}%` : '')
    : goalLineText(goal);
  const labelStyle: CSSProperties | undefined = colors ? { color: colors.accent } : undefined;
  const titleStyle: CSSProperties | undefined = colors ? { color: colors.ink } : undefined;
  const subStyle: CSSProperties | undefined = colors ? { color: colors.sub } : undefined;
  return (
    <div className={`flex min-w-0 items-baseline gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'} ${className}`}>
      <span className={`shrink-0 text-[9px] font-black tracking-[0.2em] ${colors ? '' : 'text-indigo-500 dark:text-indigo-300'}`} style={labelStyle}>TARGET</span>
      <span className={`min-w-0 truncate font-bold ${colors ? '' : 'text-gray-800 dark:text-gray-100'}`} style={titleStyle}>「{goal.title}」</span>
      {line && <span className={`shrink-0 tabular-nums ${colors ? '' : 'text-gray-500 dark:text-gray-400'}`} style={subStyle}>{line}</span>}
    </div>
  );
}
