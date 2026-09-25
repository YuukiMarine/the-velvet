/**
 * 任务截止日（DDL）标记：剩 N 天 / 今天截止 / 逾期 N 天。
 * 挂在首页（三套 Dashboard）与任务页的任务条标题后面，紧跟一起进步的标记。
 * BIG DEAL 的截止日由聚合卡自己画，这里不管；今天已达成的不画（划掉的条目上再倒数没有意义）。
 * 四个频道各一套皮：三天内转暖色，当天 / 逾期转热色。
 */
import type { CSSProperties } from 'react';
import { toLocalDateKey } from '@/store';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_FONT, roughQuad } from '@/components/p5r/kit';
import { deadlineStatus, type DeadlineTone } from '@/utils/deadline';
import type { Todo } from '@/types';

const hot = (t: DeadlineTone) => t === 'due' || t === 'over';

export function DeadlineTag({ todo, done = false }: { todo: Todo; done?: boolean }) {
  const channel = useUiChannel();
  if (todo.isBigDeal || done) return null;
  const st = deadlineStatus(todo.deadline, toLocalDateKey());
  if (!st) return null;
  const { text, tone } = st;
  const base = 'inline-flex shrink-0 items-center whitespace-nowrap text-[10px] font-black leading-none tabular-nums';
  const label = `截止日 ${todo.deadline}，${text}`;

  if (channel === 'p3') {
    const bg = hot(tone) ? P3R.magenta : tone === 'soon' ? P3R.blue : P3R.cyanFaint;
    const fg = tone === 'plain' ? P3R.blueDeep : '#fff';
    return <span aria-label={label} className={`${base} px-2 py-[3px]`} style={{ background: bg, color: fg, clipPath: slantClip(4) }}>{text}</span>;
  }
  if (channel === 'p4') {
    const bg = hot(tone) ? '#e0301e' : tone === 'soon' ? 'var(--p4-orange, #f9a11b)' : '#131313';
    const fg = tone === 'soon' ? '#131313' : '#fff6d0';
    return <span aria-label={label} className={`${base} rounded-full px-2 py-[3px]`} style={{ background: bg, color: fg }}>{text}</span>;
  }
  if (channel === 'p5') {
    const style: CSSProperties = { background: tone === 'plain' ? P5R.ink : P5R.red, color: P5R.white, fontFamily: P5_FONT, clipPath: roughQuad(7, 2) };
    return <span aria-label={label} className={`${base} px-2 py-[3px]`} style={style}>{text}</span>;
  }
  const cls = hot(tone)
    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
    : tone === 'soon'
      ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300'
      : 'bg-gray-500/10 text-gray-600 dark:text-gray-300';
  return <span aria-label={label} className={`${base} rounded-full px-1.5 py-0.5 ${cls}`}>{text}</span>;
}
