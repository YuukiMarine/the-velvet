/**
 * 一起进步的小标记（v2.7.0.6）：挂在今日任务条（首页 / 任务页）和羁绊页的好友卡上。
 *
 * 任务条上（PactTodoTag）：与 X · Ta 已完成 / 等 Ta / 已同步 ✓；被催了显示「X 催你了」。
 * 好友卡上（PactPartnerTag）：一起进步 · 还差你 / Ta 还没完成 / 今天已同步 ✓ / 待回应。
 * 约定的实时状态来自 cloudSocial.pacts（社交同步时拉）；没拉到时任务条只显示「与 X」。
 * 四个频道各一套皮；「热」= 需要你动一下（被催 / 待回应），「暖」= 对方已完成、就差你。
 * 组织作战的待办（第 8 轮，OrgOpTodoTag）用同一个壳：作战 · 组织名 · 3/5 / 就差你了 / 已达成 ✓。
 */
import type { CSSProperties } from 'react';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { toLocalDateKey } from '@/store';
import { useUiChannel } from '@/ui/useUiChannel';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_FONT, roughQuad } from '@/components/p5r/kit';
import { isPactLive, pactStatusWith, pactTodayView } from '@/utils/pactLogic';
import { opProgress } from '@/utils/orgOps';
import type { PactTone } from '@/utils/pactLogic';
import type { CoopPact, Todo } from '@/types';

type Tone = PactTone;

/** night：放在固定深色底上（专辑墙的卡背），中性频道的浅色皮在那上面发灰，换一套浅字 */
function TagShell({ tone, children, seed = 3, night = false }: { tone: Tone; children: string; seed?: number; night?: boolean }) {
  const channel = useUiChannel();
  const base = 'inline-flex shrink-0 items-center whitespace-nowrap text-[10px] font-black leading-none';
  if (channel === 'p3') {
    const bg = tone === 'hot' ? P3R.magenta : tone === 'warm' ? P3R.blue : tone === 'done' ? P3R.cyan : P3R.cyanFaint;
    const fg = tone === 'plain' ? P3R.blueDeep : '#fff';
    return <span className={`${base} px-2 py-[3px]`} style={{ background: bg, color: fg, clipPath: slantClip(4) }}>{children}</span>;
  }
  if (channel === 'p4') {
    const bg = tone === 'hot' ? 'var(--p4-orange, #f9a11b)' : tone === 'done' ? '#1668d8' : '#131313';
    const fg = tone === 'hot' ? '#131313' : '#fff6d0';
    return <span className={`${base} rounded-full px-2 py-[3px]`} style={{ background: bg, color: fg }}>{children}</span>;
  }
  if (channel === 'p5') {
    const bg = tone === 'hot' || tone === 'warm' ? P5R.red : tone === 'done' ? P5R.grey : P5R.ink;
    const style: CSSProperties = { background: bg, color: P5R.white, fontFamily: P5_FONT, clipPath: roughQuad(seed, 2) };
    return <span className={`${base} px-2 py-[3px]`} style={style}>{children}</span>;
  }
  if (night) {
    const nightCls = tone === 'hot'
      ? 'bg-rose-500/25 text-rose-200'
      : tone === 'warm'
        ? 'bg-amber-400/25 text-amber-200'
        : tone === 'done'
          ? 'bg-emerald-500/25 text-emerald-200'
          : 'bg-white/10 text-[#e6dcff]';
    return <span className={`${base} rounded-full px-1.5 py-0.5 ${nightCls}`}>{children}</span>;
  }
  const cls = tone === 'hot'
    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
    : tone === 'warm'
      ? 'bg-amber-400/20 text-amber-700 dark:text-amber-300'
      : tone === 'done'
        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
        : 'bg-pink-500/10 text-pink-600 dark:text-pink-300';
  return <span className={`${base} rounded-full px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

/** 「我」是谁：约定两方里不是对方的那个（不必为此引入 PB 客户端） */
const meOf = (p: CoopPact, partnerId: string) => (p.fromId === partnerId ? p.toId : p.fromId);

/** 任务条上的标记 */
export function PactTodoTag({ todo }: { todo: Todo }) {
  const pact = useCloudSocialStore(s => (todo.pact ? s.pacts.find(p => p.id === todo.pact!.id) : undefined));
  if (!todo.pact) return null;
  const name = todo.pact.partnerName;
  if (!pact || pact.status !== 'active') return <TagShell tone="plain">{`与 ${name}`}</TagShell>;
  const v = pactTodayView(pact, meOf(pact, todo.pact.partnerId), toLocalDateKey());
  if (!v.mineDone && v.nudgedMe) return <TagShell tone="hot">{`${name} 催你了`}</TagShell>;
  if (!v.mineDone && v.theirsDone) return <TagShell tone="warm">{`与 ${name} · Ta 已完成`}</TagShell>;
  if (v.mineDone && v.theirsDone) return <TagShell tone="done">{`与 ${name} · 已同步 ✓`}</TagShell>;
  if (v.mineDone) return <TagShell tone="plain">{`与 ${name} · 等 Ta`}</TagShell>;
  return <TagShell tone="plain">{`与 ${name}`}</TagShell>;
}

/** 羁绊页好友卡上的标记（没有进行中 / 待回应的约定就不画）；surface='night' 用在固定深色的卡背上 */
export function PactPartnerTag({ partnerId, surface = 'default' }: { partnerId: string; surface?: 'default' | 'night' }) {
  const pact = useCloudSocialStore(s => s.pacts.find(p => isPactLive(p) && (p.fromId === partnerId || p.toId === partnerId)));
  if (!pact) return null;
  const { text, tone } = pactStatusWith(pact, partnerId, toLocalDateKey());
  // 「催你了」「已同步」自己就说得清；其余带上「一起进步」前缀，免得在卡上看不出是哪件事
  const label = text === 'Ta 催你了' || text === '今天已同步 ✓' ? text : `一起进步 · ${text}`;
  return <TagShell tone={tone} seed={pact.status === 'pending' ? 5 : 6} night={surface === 'night'}>{label}</TagShell>;
}

/** 这位好友的约定状态（没有约定为 null）：名片选项卡上的小红点、详情页快捷入口的副标题用 */
export function usePactStatus(partnerId: string | undefined): { text: string; tone: Tone } | null {
  const pact = useCloudSocialStore(s => (partnerId ? s.pacts.find(p => isPactLive(p) && (p.fromId === partnerId || p.toId === partnerId)) : undefined));
  if (!pact || !partnerId) return null;
  return pactStatusWith(pact, partnerId, toLocalDateKey());
}

/** 作战待办上的标记（第 8 轮）：作战 · 组织名 · 做完几人；别人都做完了只差我 = 暖；达成 = 已达成 ✓。没拉到作战时只写「作战 · 组织名」 */
export function OrgOpTodoTag({ todo }: { todo: Todo }) {
  const view = useCloudSocialStore(s => (todo.orgOp ? s.orgs.find(v => v.org.id === todo.orgOp!.orgId) : undefined));
  if (!todo.orgOp) return null;
  const org = [...todo.orgOp.orgName].slice(0, 6).join('') + ([...todo.orgOp.orgName].length > 6 ? '…' : '');
  const op = view?.ops?.find(o => o.id === todo.orgOp!.opId);
  if (!view || !op) return <TagShell tone="plain" seed={7}>{`作战 · ${org}`}</TagShell>;
  const p = opProgress(view, op);
  if (p.status === 'achieved') return <TagShell tone="done" seed={7}>{`作战 · 已达成 ✓`}</TagShell>;
  const mine = p.rows.find(r => r.userId === view.me.userId);
  if (mine?.state === 'todo' && p.counted > 1 && p.done === p.counted - 1) return <TagShell tone="warm" seed={7}>{`作战 · 就差你了`}</TagShell>;
  return <TagShell tone="plain" seed={7}>{`作战 · ${org} · ${p.done}/${p.counted}`}</TagShell>;
}
