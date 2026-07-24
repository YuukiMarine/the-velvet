/**
 * 批3 · 镜之自问：本地出题器（§10.1，批2 挂账的"真实问答"落地）
 *
 * 从玩家过去七天的真实记录出 2 道选择题——素材不足时返回 null（执行层回落直接发奖）。
 * 全对 +SP，答错无惩罚（拍板口径）。
 *
 * ⚠️ 只允许相对导入（模拟战脚本用 tsx 直跑）。
 */
import type { AttributeId } from '../types';

export interface QuizSourceActivity {
  date: Date | string;
  description: string;
  important?: boolean;
  pointsAwarded: Record<AttributeId, number>;
}

export interface MirrorQuestion {
  q: string;
  options: string[];
  correctIdx: number;
}

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 出 2 道题；素材不足返回 null */
export function buildMirrorQuiz(
  activities: QuizSourceActivity[],
  attrNames: Record<AttributeId, string>,
  now: Date = new Date(),
  rng: () => number = Math.random,
): MirrorQuestion[] | null {
  const weekAgo = now.getTime() - 7 * 86400000;
  const recent = activities.filter(a => new Date(a.date).getTime() >= weekAgo);
  const pool: MirrorQuestion[] = [];

  // Q1：本周加点最多的属性（需唯一最大值）
  if (recent.length >= 2) {
    const sums = ATTRS.map(attr => recent.reduce((s, a) => s + (a.pointsAwarded?.[attr] ?? 0), 0));
    const max = Math.max(...sums);
    if (max > 0 && sums.filter(s => s === max).length === 1) {
      const correctAttr = ATTRS[sums.indexOf(max)];
      const options = shuffle(ATTRS, rng).slice(0, 4);
      if (!options.includes(correctAttr)) options[0] = correctAttr;
      const shuffled = shuffle(options, rng);
      pool.push({
        q: '镜中的你问：「过去七天，你在哪个方向走得最远？」',
        options: shuffled.map(a => attrNames[a]),
        correctIdx: shuffled.indexOf(correctAttr),
      });
    }
  }

  // Q2：本周记录条数
  if (recent.length >= 1) {
    const n = recent.length;
    const distract = new Set<number>();
    for (const d of [n + 1, Math.max(0, n - 1), n + 3, n + 2, Math.max(0, n - 2)]) {
      if (d !== n) distract.add(d);
      if (distract.size >= 3) break;
    }
    const opts = shuffle([n, ...[...distract].slice(0, 3)], rng);
    pool.push({
      q: '镜中的你问：「过去七天，你一共留下了几条记录？」',
      options: opts.map(v => `${v} 条`),
      correctIdx: opts.indexOf(n),
    });
  }

  // Q3：最近一条重要记录（需另有 ≥3 条不同描述做干扰项）
  const important = [...activities].reverse().find(a => a.important && a.description.trim());
  if (important) {
    const trim = (s: string) => (s.length > 18 ? s.slice(0, 18) + '…' : s);
    const others = [...new Set(
      activities.filter(a => a !== important && a.description.trim() && a.description !== important.description)
        .map(a => trim(a.description)),
    )];
    if (others.length >= 3) {
      const correct = trim(important.description);
      const opts = shuffle([correct, ...shuffle(others, rng).slice(0, 3)], rng);
      pool.push({
        q: '镜中的你问：「你最近一次郑重写下的，是哪件事？」',
        options: opts,
        correctIdx: opts.indexOf(correct),
      });
    }
  }

  if (pool.length < 2) return null;
  return shuffle(pool, rng).slice(0, 2);
}
