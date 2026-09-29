import type { Activity } from '@/types';

/**
 * 回忆之光（第 6 轮 · PRD §11.7）的素材：最近 14 天自己记的（非系统类目、非补记）、至少 4 个字的记录。
 * 同一个节点每次打开都是同一条（按节点 id 做种）。
 */
export const MEMORY_ECHO_DAYS = 14;

export function memoryEchoCandidates(activities: Activity[], now: Date = new Date()): Activity[] {
  const since = now.getTime() - MEMORY_ECHO_DAYS * 86400000;
  return activities
    .filter((a) => !a.category && !a.backfilled && (a.description ?? '').trim().length >= 4 && new Date(a.date).getTime() >= since && new Date(a.date).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

export function pickMemoryEcho(candidates: Activity[], seed: string): Activity | null {
  if (!candidates.length) return null;
  return candidates[fnv1a(seed) % candidates.length];
}

/** 把事件文案里的 {date} / {title} 换成那条记录 */
export function memoryEchoText(text: string, a: Activity | null): string {
  if (!a) return text.replace('{date}', '那天').replace('{title}', '继续向上，别停下');
  const d = new Date(a.date);
  const title = a.description.replace(/\s+/g, ' ').trim();
  return text
    .replace('{date}', `${d.getMonth() + 1}月${d.getDate()}日`)
    .replace('{title}', title.length > 20 ? `${title.slice(0, 20)}…` : title);
}
