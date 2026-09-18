/**
 * thinkProgress — 思维链阶段的「预估进度」（v2.7.0.6）。
 *
 * 思维链模型（deepseek-v4-pro 一类）在写正文之前可能想几十秒到几分钟，这段时间
 * 一个正文字都不吐，界面只能干等。这里按模型记住"上几次想了多久、想了多少字"，
 * 本次按已过时间与已到达的思维链字数各算一个比例、取大者，喂给魔法阵当进度。
 *
 * 口径：
 *   · 估算永远只到 0.97——真正的 100% 是正文第一个字到达，那一刻由调用方切到流式正文；
 *   · 统计只在"真的想过"（收到过思维链增量）时记账，非思维链模型不污染；
 *   · 没有历史时按模型名猜：pro / reasoner / r1 / think 一族按两分半，其余按十来秒。
 *   · 统计存 localStorage（几十字节），读写失败一律静默。
 */
import { useEffect, useState } from 'react';

const KEY = 'velvet.thinkStats.v1';

interface Stat {
  n: number;
  avgMs: number;
  avgChars: number;
}

const load = (): Record<string, Stat> => {
  try {
    const raw = localStorage.getItem(KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return typeof obj === 'object' && obj !== null ? obj : {};
  } catch {
    return {};
  }
};

const save = (m: Record<string, Stat>) => {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 隐私模式 / 配额满 */ }
};

/** 首次没有历史时的猜测（按 deepseek-v4-pro / v4-flash 实测：135s·8.4k 字 / 10s·3.5k 字） */
const guess = (model: string): Stat =>
  /pro|reasoner|r1|think|max/i.test(model)
    ? { n: 0, avgMs: 140_000, avgChars: 9000 }
    : { n: 0, avgMs: 11_000, avgChars: 3500 };

export interface ThinkTracker {
  /** 思维链增量到达 */
  onReasoning: (delta: string) => void;
  /** 正文第一个字到达（幂等）：进度封顶为 1，并把本次时长记进统计 */
  onContent: () => void;
  /** 0..1 的预估进度；正文到达后恒为 1 */
  progress: () => number;
  /** 本次已过去的毫秒 */
  elapsed: () => number;
}

export function createThinkTracker(model: string): ThinkTracker {
  const stats = load();
  const stat = stats[model] ?? guess(model);
  const t0 = Date.now();
  let chars = 0;
  let sawReasoning = false;
  let firstContent: number | null = null;

  return {
    onReasoning(delta) {
      chars += delta.length;
      sawReasoning = true;
    },
    onContent() {
      if (firstContent !== null) return;
      firstContent = Date.now();
      if (!sawReasoning) return;
      const ms = firstContent - t0;
      // 权重最多 1/5：相当于 EMA，模型换了预算也能在几次内跟上
      const n = Math.min(stat.n, 4);
      stats[model] = {
        n: stat.n + 1,
        avgMs: (stat.avgMs * n + ms) / (n + 1),
        avgChars: (stat.avgChars * n + chars) / (n + 1),
      };
      save(stats);
    },
    progress() {
      if (firstContent !== null) return 1;
      // 预期取历史均值的六成：用户口径——模型常在预估四成处就开始输出，阵图还没画完；
      // 宁可提前画满等着，也不要正文到了阵才画一半
      const expectMs = Math.max(1000, stat.avgMs) * 0.6;
      const expectChars = stat.avgChars * 0.6;
      const t = (Date.now() - t0) / expectMs;
      const c = expectChars > 0 ? chars / expectChars : 0;
      const raw = Math.max(t, c);
      // 0.85 之前线性，之后渐近到 0.97：超过预期也不会"卡在 100%"
      if (raw < 0.85) return raw;
      return 0.85 + (1 - Math.exp(-(raw - 0.85) * 2)) * 0.12;
    },
    elapsed() {
      return Date.now() - t0;
    },
  };
}

/**
 * 给 UI 用：active 期间每 200ms 读一次 tracker.progress() 触发重绘。
 * tracker 为 null 或 active=false 时返回 0 且不起定时器。
 */
export function useThinkProgress(tracker: ThinkTracker | null, active: boolean): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!tracker || !active) return;
    setP(tracker.progress());
    const id = window.setInterval(() => setP(tracker.progress()), 200);
    return () => window.clearInterval(id);
  }, [tracker, active]);
  return tracker && active ? p : 0;
}
