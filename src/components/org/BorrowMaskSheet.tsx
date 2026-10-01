/**
 * 同调（借面具，第 8 轮 · PRD §13.5；验收后据点里改叫「同调」）：从别人的成员牌（放大牌下面 /「⋯」）打开。
 * Ta 展示的面具（最多 3 张）横着排，左右滑动切换：每个技能的类型、按据点系数折算后的威力、SP；选一张「借用」。
 * 每张卡左上角一枚面具角标（装饰）。顶上写清规则：本周还能带进几场、据点系数、只在本周有效；本周已经同调着一张时说明「换成这张会替换它」。
 */
import { useEffect, useRef, useState } from 'react';
import { SheetModal } from '@/components/SheetModal';
import { useAppStore } from '@/store';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, roughQuad } from '@/components/p5r/kit';
import { borrowMaskFromUi } from '@/services/borrowMask';
import { IconMask } from '@/components/battle/warKit';
import { BORROW_BATTLES_PER_WEEK, borrowNow, borrowedPower, borrowedSkillCost, sanitizePersona } from '@/utils/orgBorrow';
import { orgLevelOfView } from '@/utils/orgOps';
import { displayCodename, memberAttrNames, shownPersonas } from '@/utils/orgLogic';
import { OrgButton, useOrgTone } from './orgUi';
import type { OrgMember, OrgPersonaSnapshot, OrgView, PersonaSkill } from '@/types';

const TYPE_LABEL: Record<PersonaSkill['type'], string> = {
  damage: '伤害', crit: '暴击', buff: '增伤', debuff: '易伤', charge: '蓄力', heal: '回复', attack_boost: '攻击增益',
};
const isDamage = (t: PersonaSkill['type']) => t === 'damage' || t === 'crit' || t === 'attack_boost';
const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** 非伤害类技能借来之后干什么（不吃属性，按通用效果算） */
function effectText(s: { type: PersonaSkill['type']; power: number }, mult: number): string {
  switch (s.type) {
    case 'buff': return '下次伤害 +50%';
    case 'debuff': return '易伤：下次 +30%';
    case 'charge': return '蓄力：下次伤害 ×2';
    case 'heal': return `回复 ${Math.max(1, Math.round(borrowedPower(s.power, mult) * 0.3))} HP`;
    default: return '';
  }
}

export function BorrowMaskSheet({ view, member, open, onClose, onFlash }: {
  view: OrgView;
  member: OrgMember | null;
  open: boolean;
  onClose: () => void;
  onFlash: (s: string) => void;
}) {
  const tone = useOrgTone();
  const bs = useAppStore(s => s.battleState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const now = borrowNow(bs);
  const level = orgLevelOfView(view);
  const masks = member ? shownPersonas(member.card).map(sanitizePersona).filter((p): p is OrgPersonaSnapshot => !!p) : [];
  const name = member ? displayCodename(member) : '';
  // 面具的属性写 Ta 自己起的名字
  const attrNames = memberAttrNames(member?.card);
  const cur = now.mask;
  const same = (p: OrgPersonaSnapshot) => !!cur && !!member && cur.ownerId === member.userId && cur.persona.name === p.name && cur.persona.attribute === p.attribute;
  const accent = tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.blue : tone.accent;
  // 面具横排：左右滑动切换，下面一排点；打开时停在借着的那张（是 Ta 的话）。
  // 横排本身是 relative：卡片的 offsetLeft 才是相对横排算的，和 scrollLeft 同一个坐标系
  const railRef = useRef<HTMLDivElement>(null);
  /** 打开时那一次「停到借着的那张」：用户先动手（点了下面的点）就取消，别把人家的选择盖回去 */
  const initTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [idx, setIdx] = useState(0);
  const memberKey = member?.userId ?? '';
  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, masks.findIndex(same));
    setIdx(i);
    initTimer.current = setTimeout(() => {
      initTimer.current = null;
      const rail = railRef.current;
      const el = rail?.children[i] as HTMLElement | undefined;
      if (rail && el) rail.scrollLeft = el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2;
    }, 60);
    return () => { if (initTimer.current) clearTimeout(initTimer.current); initTimer.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memberKey]);
  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    [...rail.children].forEach((c, i) => {
      const el = c as HTMLElement;
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (d < dist) { dist = d; best = i; }
    });
    if (best !== idx) setIdx(best);
  };
  // 点下面的点：直接跳到那一张（手指左右划是原生的平滑滑动）。不用平滑滚动：和 scroll-snap 叠在一起时
  // 有的 WebView 会卡在半路，滚动过程中高亮又被改回去；也不用 scrollIntoView——它会连带外面的抽屉一起滚
  const goTo = (i: number) => {
    const rail = railRef.current;
    const el = rail?.children[i] as HTMLElement | undefined;
    if (!rail || !el) return;
    if (initTimer.current) { clearTimeout(initTimer.current); initTimer.current = null; }
    rail.scrollLeft = el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2;
    setIdx(i);
  };

  const take = async (p: OrgPersonaSnapshot) => {
    if (!member || busy) return;
    setBusy(true);
    setError('');
    try {
      await borrowMaskFromUi(view, member, p);
      onFlash(`同调成功：「${p.name}」在逆影战场面具切换栏的最后一格`);
      onClose();
    } catch (e) {
      setError(errText(e, '没同调成，稍后再试'));
    } finally {
      setBusy(false);
    }
  };

  const chip = (text: string, i: number) => (
    <span
      key={text}
      className="inline-flex items-center whitespace-nowrap px-2 py-[3px] text-[11px] font-black leading-none"
      style={{
        background: i === 0 ? accent : 'rgba(127,127,127,0.12)',
        color: i === 0 ? '#ffffff' : 'currentColor',
        borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 999,
        clipPath: tone.channel === 'p3' ? slantClip(4) : tone.channel === 'p5' ? roughQuad(i + 2.2, 1.5) : undefined,
      }}
    >
      {text}
    </span>
  );

  return (
    <SheetModal isOpen={open && !!member} onClose={() => { if (!busy) onClose(); }} title="同调" busy={busy} maxHeightClass="max-h-[88vh]">
      <div className="space-y-4 px-4 pb-6">
        {/* 代号放正文里：红频道的标题是一个字一格的拼贴，长代号会把标题撑出屏幕 */}
        <div className="text-[15px] font-black text-gray-900 dark:text-white">{name} 展示的面具</div>
        <div className="flex flex-wrap gap-1.5">
          {chip(`本周还能带进 ${now.left} 场`, 0)}
          {chip(`据点 Lv.${level.level} · 威力 ×${level.mult.toFixed(1)}`, 1)}
          {chip('只在本周有效', 2)}
        </div>
        <p className="text-[12px] font-semibold leading-relaxed text-gray-600 dark:text-gray-300">
          同调来的面具是逆影战场面具切换栏的第六格：每周能带进 {BORROW_BATTLES_PER_WEEK} 场战斗（一场里第一次戴着它出手才算一场，之后这一场随便用），
          伤害 = 威力 × 据点系数，万能属性（出招、挨打都不吃克制和弱点）；戴着它的时候，你自己面具的被动不生效。
        </p>
        {cur && (
          <p className="rounded-xl bg-black/[0.04] px-3 py-2 text-[12px] font-bold leading-relaxed text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
            你现在同调着「{cur.persona.name}」（{cur.ownerCodename} 的）。{masks.some(same) ? '' : '借用这里的任何一张都会替换它。'}
          </p>
        )}
        {!bs && <p className="text-[12px] font-bold leading-relaxed text-amber-600 dark:text-amber-400">你还没有自己的人格面具：先去逆影战场唤醒一张，才能同调别人的。</p>}
        {masks.length === 0 && <p className="text-[13px] font-bold text-gray-500 dark:text-gray-400">Ta 没有展示面具。</p>}

        {masks.length > 0 && (
          <div>
            <div
              ref={railRef}
              onScroll={onRailScroll}
              className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label={`${name} 展示的面具，左右滑动切换`}
            >
              {masks.map((p, i) => {
                const on = same(p);
                return (
                  <div
                    key={`${p.attribute}-${p.name}-${i}`}
                    className="relative flex w-[86%] shrink-0 snap-center flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-4 pt-4 dark:border-gray-700 dark:bg-gray-900"
                    aria-label={`第 ${i + 1} 张：${p.name}`}
                  >
                    <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent, opacity: i === idx ? 1 : 0.35 }} />
                    <MaskCorner tone={tone} accent={accent} active={i === idx} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 pl-6">
                        <div className="truncate text-[19px] font-black leading-tight text-gray-900 dark:text-white">{p.name}</div>
                        <div className="mt-0.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">{attrNames[p.attribute] ?? p.attribute} · Lv.{p.level}</div>
                      </div>
                      <span className="shrink-0 text-[11px] font-black tabular-nums text-gray-400">{i + 1} / {masks.length}</span>
                    </div>
                    <ul className="mt-3 flex-1 space-y-2">
                      {p.skills.map((s, j) => (
                        <li key={j} className="flex items-center gap-2 text-[12px] font-bold text-gray-800 dark:text-gray-100">
                          <span className="shrink-0 rounded-md bg-black/[0.06] px-1.5 py-[2px] text-[10px] font-black text-gray-600 dark:bg-white/10 dark:text-gray-300">{TYPE_LABEL[s.type]}</span>
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          <span className="shrink-0 text-[11px] font-black tabular-nums" style={{ color: accent }}>
                            {isDamage(s.type) ? `威力 ${s.power} → ${borrowedPower(s.power, level.mult)}` : effectText(s, level.mult)}
                          </span>
                          <span className="shrink-0 text-[10px] font-black tabular-nums text-amber-600 dark:text-amber-300">SP {borrowedSkillCost(s.level)}</span>
                        </li>
                      ))}
                      {p.skills.length === 0 && <li className="text-[12px] font-bold text-gray-500 dark:text-gray-400">这张面具还没有解锁的技能</li>}
                    </ul>
                    <OrgButton tone={on ? 'ghost' : 'primary'} onClick={() => void take(p)} disabled={busy || !bs || on || !p.skills.length} className="mt-4 w-full">
                      {on ? '已装备' : '借用'}
                    </OrgButton>
                  </div>
                );
              })}
            </div>
            {masks.length > 1 && (
              <div className="mt-2.5 flex justify-center gap-1.5">
                {masks.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`看第 ${i + 1} 张：${p.name}`}
                    aria-current={i === idx}
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: i === idx ? 18 : 6, background: i === idx ? accent : 'rgba(127,127,127,0.35)' }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="text-[12px] font-bold leading-relaxed text-rose-500">{error}</p>}
      </div>
    </SheetModal>
  );
}

/** 卡片左上角的面具角标（装饰）：一块三角，压一枚面具图标；四频道换色 / 换边 */
function MaskCorner({ tone, accent, active }: { tone: ReturnType<typeof useOrgTone>; accent: string; active: boolean }) {
  const size = 44;
  const fill = tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : accent;
  const ink = tone.channel === 'p4' ? '#131313' : '#ffffff';
  const shape = tone.channel === 'p5'
    ? 'polygon(0 0, 100% 0, 92% 9%, 9% 92%, 0 100%)'
    : 'polygon(0 0, 100% 0, 0 100%)';
  return (
    <span aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ width: size, height: size, opacity: active ? 1 : 0.55, transition: 'opacity 160ms' }}>
      {/* 黄频道：黑描边一圈（和别处的贴纸一个做法）；红频道：底下垫一层黑，错开一点 */}
      {tone.channel === 'p4' && <span className="absolute inset-0" style={{ background: '#131313', clipPath: shape, transform: 'translate(2px, 2px)' }} />}
      {tone.channel === 'p5' && <span className="absolute inset-0" style={{ background: P5R.ink, clipPath: shape, transform: 'translate(3px, 3px)' }} />}
      <span className="absolute inset-0" style={{ background: fill, clipPath: shape }} />
      {tone.channel === 'p3' && <span className="absolute left-[30px] top-[2px] h-[4px] w-[12px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />}
      <span className="absolute left-[5px] top-[5px] flex" style={{ color: ink }}><IconMask size={15} /></span>
    </span>
  );
}
