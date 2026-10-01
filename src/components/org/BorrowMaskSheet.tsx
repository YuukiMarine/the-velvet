/**
 * 借面具（第 8 轮 · PRD §13.5）：从别人的成员牌（放大牌下面 /「⋯」）打开。
 * 列出 Ta 展示的面具（最多 3 张）：每个技能的类型、按据点系数折算后的威力、SP；选一张「借这张」。
 * 顶上写清规则：本周还能带进几场、据点系数、只在本周有效；本周已经借着一张时说明「换成这张会替换它」。
 */
import { useState } from 'react';
import { SheetModal } from '@/components/SheetModal';
import { useAppStore } from '@/store';
import { DEFAULT_ATTRIBUTE_NAMES } from '@/constants/index';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, roughQuad } from '@/components/p5r/kit';
import { borrowMaskFromUi } from '@/services/borrowMask';
import { BORROW_BATTLES_PER_WEEK, borrowNow, borrowedPower, borrowedSkillCost, sanitizePersona } from '@/utils/orgBorrow';
import { orgLevelOfView } from '@/utils/orgOps';
import { displayCodename, shownPersonas } from '@/utils/orgLogic';
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
    case 'debuff': return '让它易伤：下次 +30%';
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
  const cur = now.mask;
  const same = (p: OrgPersonaSnapshot) => !!cur && !!member && cur.ownerId === member.userId && cur.persona.name === p.name && cur.persona.attribute === p.attribute;
  const accent = tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.blue : tone.accent;

  const take = async (p: OrgPersonaSnapshot) => {
    if (!member || busy) return;
    setBusy(true);
    setError('');
    try {
      await borrowMaskFromUi(view, member, p);
      onFlash(`借到了「${p.name}」：去逆影战场，技能区下面会多一段`);
      onClose();
    } catch (e) {
      setError(errText(e, '没借成，稍后再试'));
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
    <SheetModal isOpen={open && !!member} onClose={() => { if (!busy) onClose(); }} title="借面具" busy={busy} maxHeightClass="max-h-[88vh]">
      <div className="space-y-4 px-4 pb-6">
        {/* 代号放正文里：红频道的标题是一个字一格的拼贴，长代号会把标题撑出屏幕 */}
        <div className="text-[15px] font-black text-gray-900 dark:text-white">{name} 展示的面具</div>
        <div className="flex flex-wrap gap-1.5">
          {chip(`本周还能带进 ${now.left} 场`, 0)}
          {chip(`据点 Lv.${level.level} · 威力 ×${level.mult.toFixed(1)}`, 1)}
          {chip('只在本周有效', 2)}
        </div>
        <p className="text-[12px] font-semibold leading-relaxed text-gray-600 dark:text-gray-300">
          借来的面具会出现在逆影战场技能区的下面：每周能带进 {BORROW_BATTLES_PER_WEEK} 场战斗（一场里第一次用它时算一场，这一场之后随便用），
          伤害 = 威力 × 据点系数，不吃属性克制和弱点，也不影响你自己的面具。
        </p>
        {cur && (
          <p className="rounded-xl bg-black/[0.04] px-3 py-2 text-[12px] font-bold leading-relaxed text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
            你现在借着「{cur.persona.name}」（{cur.ownerCodename} 的）。{masks.some(same) ? '' : '借这里的任何一张都会替换它。'}
          </p>
        )}
        {!bs && <p className="text-[12px] font-bold leading-relaxed text-amber-600 dark:text-amber-400">你还没有自己的人格面具：先去逆影战场唤醒一张，才能借用别人的。</p>}
        {masks.length === 0 && <p className="text-[13px] font-bold text-gray-500 dark:text-gray-400">Ta 没有展示面具。</p>}

        {masks.map((p, i) => (
          <div key={`${p.attribute}-${p.name}-${i}`} className="rounded-2xl border border-gray-200 px-3.5 py-3 dark:border-gray-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[16px] font-black text-gray-900 dark:text-white">{p.name}</div>
                <div className="mt-0.5 text-[11px] font-bold text-gray-500 dark:text-gray-400">{DEFAULT_ATTRIBUTE_NAMES[p.attribute] ?? p.attribute} · Lv.{p.level}</div>
              </div>
              <OrgButton small tone={same(p) ? 'ghost' : 'primary'} onClick={() => void take(p)} disabled={busy || !bs || same(p) || !p.skills.length}>
                {same(p) ? '借着呢' : '借这张'}
              </OrgButton>
            </div>
            <ul className="mt-2.5 space-y-1.5">
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
          </div>
        ))}
        {error && <p role="alert" className="text-[12px] font-bold leading-relaxed text-rose-500">{error}</p>}
      </div>
    </SheetModal>
  );
}
