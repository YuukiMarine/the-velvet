/**
 * 菜单页证卡里自己的状态 / 目标（v2.7.0.6 第 6 项）。证卡不能再变高，所以都「占位替换」：
 *   蓝 MEMBER PASS   状态 → 顶条右侧（替掉 ROOM 03 的位置）的白斜签；目标 → 底缘磁条换成 GOAL 进度条
 *   黄 STUDENT PASS  状态 → 黑校条右侧（替掉 CH 04）的橙色小圆签；目标 → 底缘条码换成 GOAL 进度条
 *   红 头牌纸卡      状态 → LV / 阶位章后面再贴一枚白底红字小章；目标 → 底行上方那道分隔线变成红色进度条，
 *                    底行中间补一枚「GOAL xx%」
 * 进度条是纯色、只标百分比；目标的名字不在菜单上出现（点开资料卡才看得到）。
 */
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_FONT } from '@/components/p5r/kit';
import { useAppStore } from '@/store';
import { liveStatus, type StatusPreset } from '@/constants/profileStatus';
import { buildGoalSnapshot, goalPercent } from '@/utils/profilePresence';

/** 自己的状态预设与目标百分比；都跟着 store 刷新 */
export function useMyPresence(): { preset: StatusPreset | null; pct: number | null } {
  const profileStatus = useAppStore(s => s.settings.profileStatus);
  const profileGoal = useAppStore(s => s.settings.profileGoal);
  // 订阅这几样：宣告卡本身、待办与完成记录（「按待办」的宣告卡进度从这儿算）
  useAppStore(s => s.callingCards);
  useAppStore(s => s.todos);
  useAppStore(s => s.todoCompletions);
  const preset = liveStatus(profileStatus);
  const goal = profileGoal ? buildGoalSnapshot(useAppStore.getState()) : null;
  return { preset, pct: goal ? goalPercent(goal) : null };
}

const statusLabel = (p: StatusPreset) => (
  <>
    <span aria-hidden>{p.emoji}</span>
    <span className="truncate">{p.label}</span>
  </>
);

// ── 蓝 ───────────────────────────────────────────────────────────────

/** 顶条右侧：有状态放白斜签，没有就照旧「ROOM 03」 */
export function P3PassStatus() {
  const { preset } = useMyPresence();
  if (!preset) return <span className="text-[11px] font-black tracking-[0.14em] text-white/70">ROOM 03</span>;
  return (
    <span
      className="inline-flex min-w-0 max-w-[55%] items-center gap-1 bg-white py-[2px] pl-2.5 pr-3 text-[10.5px] font-black italic leading-tight"
      style={{ clipPath: slantClip(5), color: P3R.blue }}
    >
      {statusLabel(preset)}
    </span>
  );
}

/** 底缘：有目标 = GOAL 进度条，没有就是原来的青 / 蓝条码 */
export function P3PassGoal() {
  const { pct } = useMyPresence();
  if (pct === null) {
    return (
      <span aria-hidden className="flex h-[14px] items-stretch gap-[3px] pb-2 pl-9 pr-8">
        {[3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1].map((w, bi) => (
          <span key={bi} style={{ width: w, background: bi % 3 === 2 ? P3R.cyan : P3R.blue }} />
        ))}
      </span>
    );
  }
  return (
    <span className="flex h-[14px] items-center gap-2 pb-2 pl-9 pr-11" aria-label={`目标进度 ${pct}%`}>
      <span className="shrink-0 text-[9px] font-black italic leading-none tracking-[0.2em]" style={{ color: P3R.blue }}>GOAL</span>
      <span className="relative h-[6px] flex-1 overflow-hidden" style={{ background: P3R.cyanPale, clipPath: slantClip(3) }}>
        <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: P3R.blue }} />
      </span>
      <span className="shrink-0 text-[10px] font-black italic leading-none tabular-nums" style={{ color: P3R.blue }}>{pct}%</span>
    </span>
  );
}

// ── 黄 ───────────────────────────────────────────────────────────────

/** 黑校条右侧：有状态放橙色小圆签，没有就照旧「CH 04」 */
export function P4PassStatus() {
  const { preset } = useMyPresence();
  if (!preset) return <span className="text-[12px] font-black tracking-[0.12em] text-white/80">CH 04</span>;
  return (
    <span className="inline-flex min-w-0 max-w-[48%] items-center gap-1 rounded-full bg-[var(--p4-orange,#f9a11b)] px-2 py-[1px] text-[11px] font-black leading-tight text-[#131313]">
      {statusLabel(preset)}
    </span>
  );
}

/** 底缘：有目标 = GOAL 进度条（纯橙），没有就是原来的黑条码 */
export function P4PassGoal() {
  const { pct } = useMyPresence();
  if (pct === null) {
    return (
      <div aria-hidden className="flex h-4 items-stretch gap-[3px] px-3 pb-2.5 opacity-75">
        {[3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3].map((w, bi) => (
          <span key={bi} className="bg-[#131313]" style={{ width: w }} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex h-4 items-center gap-1.5 px-3 pb-2.5" aria-label={`目标进度 ${pct}%`}>
      <span className="shrink-0 text-[9px] font-black leading-none tracking-[0.18em] text-[#131313]">GOAL</span>
      <span className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-[#131313]/15">
        <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--p4-orange,#f9a11b)]" style={{ width: `${pct}%` }} />
      </span>
      <span className="shrink-0 text-[10px] font-black leading-none tabular-nums text-[#131313]">{pct}%</span>
    </div>
  );
}

// ── 红 ───────────────────────────────────────────────────────────────

/** 章排最后再贴一枚：白底红字 + 黑硬影，微微歪 */
export function P5StatusStamp() {
  const { preset } = useMyPresence();
  if (!preset) return null;
  return (
    <span
      className="relative ml-2 inline-flex min-w-0 shrink items-center gap-1 px-2 py-[3px] text-[12px] font-black leading-tight"
      style={{ background: '#ffffff', color: P5R.red, boxShadow: `2px 2px 0 ${P5R.ink}`, transform: 'rotate(-3deg)', fontFamily: P5_FONT }}
    >
      {statusLabel(preset)}
    </span>
  );
}

/** 底行上方的分隔线：有目标就是红色进度条（4px），没有就是原来那道 2px 淡线 */
export function P5GoalRule() {
  const { pct } = useMyPresence();
  if (pct === null) return <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: '#0000001f' }} />;
  return (
    <span aria-hidden className="absolute inset-x-0 top-0 h-[4px]" style={{ background: '#0000001f', clipPath: 'polygon(0 0, 100% 1px, 100% 100%, 1px 100%)' }}>
      <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: P5R.red }} />
    </span>
  );
}

/** 底行中间：GOAL xx% */
export function P5GoalLabel() {
  const { pct } = useMyPresence();
  if (pct === null) return null;
  return (
    <span className="text-[12px] font-black tabular-nums tracking-[0.08em]" style={{ color: P5R.redHot, fontFamily: P5_FONT }}>
      GOAL {pct}%
    </span>
  );
}
