/**
 * PersonaCodex —— Persona 页重设计（R17 #4：告别灰白管理台）。
 *
 * 三段层级（自上而下一条视线）：
 *   ① 面具轨：五属性一排常显（换掉旧 ‹ 1/5 › 翻页——五张面具是并列身份，不该藏在分页里）；
 *   ② 英雄板：当前面具的属性色大板——衬线名 + 人设词 + 面具增益 + 召唤台词 + 佩戴钮；
 *   ③ 技能典：每技一行版——等级徽 / 字形图标 / 特化·誓约·迷思徽 / 威力·SP，
 *      底条是**熟练度**：星级 + 斜节进度（mastery 字段一直在数据里，这次真正上屏）。
 *
 * 战场本地暗色语言（靛蓝 + 属性色），三频道通用；数据与行为完全沿用旧页
 * （equipMask / MASK_BUFFS / SKILL_EFFECT_MAP 特化 / unlocked 双条件）。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import type { AttributeId, PersonaSkill } from '@/types';
import { SKILL_EFFECT_MAP } from '@/constants';
import {
  healAmount, masteryStars, MASTERY_FULL_BY_LEVEL, MASTERY_STAR_ADD,
  maskBondTier, MASK_BOND_THRESHOLDS, MASK_BOND_ADD_PER_TIER,
} from '@/battle/numbers';
import { MYTH_POOL, mythEntryText, QUALITY_LABEL } from '@/battle/loot';
import { blazingAttrsToday } from '@/battle/preparation';
import { playSound } from '@/utils/feedback';
import { slantPoly, SlantGauge, SkillGlyph } from '@/components/battle/warKit';
import { ModalPortal } from '@/components/ModalPortal';
import { useUiChannel } from '@/ui/useUiChannel';

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

/** 属性色相（面具身份色）：轨 chip / 英雄板色带 / 等级徽共用 */
const ATTR_HUE: Record<AttributeId, { accent: string; rgb: string }> = {
  knowledge: { accent: '#38bdf8', rgb: '56,189,248' },
  guts:      { accent: '#f87171', rgb: '248,113,113' },
  dexterity: { accent: '#34d399', rgb: '52,211,153' },
  kindness:  { accent: '#f9a8d4', rgb: '249,168,212' },
  charm:     { accent: '#c4b5fd', rgb: '196,181,253' },
};

const MASK_BUFFS: Record<AttributeId, string> = {
  knowledge: '弱点攻击额外+2伤害，日常该属性+1',
  guts: '出战时暴击率+15%，日常该属性+1',
  dexterity: '每使用5次技能获得追加行动，日常该属性+1',
  kindness: '体力耗尽后保留1点体力（每场一次），日常该属性+1',
  charm: '每次战斗仅一次，使用技能不消耗SP，日常该属性+1',
};

const SKILL_TYPE_TAG: Record<string, { label: string; color: string; bg: string }> = {
  damage:       { label: '伤害', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  crit:         { label: '暴击', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  buff:         { label: '增伤', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  debuff:       { label: '易伤', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  charge:       { label: '蓄力', color: 'rgb(var(--color-battle-bright-rgb))', bg: 'rgb(var(--color-battle-bright-rgb) / 0.12)' },
  heal:         { label: '回复', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  attack_boost: { label: '攻击增益', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
};

const SKILL_EFFECT_HINT: Record<string, string> = {
  buff:         '下次+50%',
  debuff:       '易伤+30%',
  charge:       '下次×2',
  attack_boost: '+6伤·3回合',
};

/** 熟练度条（③ 的行底条）：★×3 + 斜节进度 + 计数；满星且非誓约 → 露出「觉醒」钮。
 *  R18 觉醒轮：每星价值 ×(轮+1)——文案随轮次报真实数字 */
const MasteryStrip = ({ skill, accent, onAwaken }: { skill: PersonaSkill; accent: string; onAwaken?: () => void }) => {
  const uses = skill.mastery ?? 0;
  const full = MASTERY_FULL_BY_LEVEL[Math.min(4, Math.max(0, skill.level - 1))];
  const stars = masteryStars(uses, skill.level);
  const perStar = Math.round(MASTERY_STAR_ADD * 100 * ((skill.awakenRound ?? 0) + 1));
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="flex items-center gap-[2px] text-[13px] leading-none" aria-label={`熟练度 ${stars}/3 星`}>
        {[0, 1, 2].map(k => (
          <span key={k} style={{ color: k < stars ? '#fbbf24' : 'rgba(255,255,255,0.16)' }}>★</span>
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <SlantGauge value={Math.min(uses, full)} max={full} segments={10} height={4} onColor={stars >= 3 ? '#fbbf24' : accent} gap={2} />
      </div>
      <span className="shrink-0 text-[10px] font-bold tabular-nums text-white/45">
        {Math.min(uses, full)}/{full}
      </span>
      {stars >= 3 && !skill.oath && onAwaken ? (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onAwaken}
          animate={{ opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="shrink-0 px-2 py-0.5 text-[10px] font-black text-amber-200"
          style={{ clipPath: slantPoly(4), background: 'rgba(251,191,36,0.18)', border: '1px solid rgba(251,191,36,0.5)' }}
        >
          ☄ 觉醒
        </motion.button>
      ) : (
        <span className="shrink-0 text-[9px] font-semibold text-white/30">每星+{perStar}%</span>
      )}
    </div>
  );
};

export function PersonaCodex({ attrIdx, onSelectAttr }: { attrIdx: number; onSelectAttr: (i: number) => void }) {
  const codexChannel = useUiChannel();
  const { persona, settings, attributes, equipMask, battleState, todos, todoCompletions } = useAppStore();
  const [equipAnim, setEquipAnim] = useState<AttributeId | null>(null);
  // R18 觉醒：目标技能等级（弹层）+ 选中迷思 + 手动改名
  const [awakenLevel, setAwakenLevel] = useState<number | null>(null);
  const [awakenStone, setAwakenStone] = useState<string | null>(null);
  const [awakenName, setAwakenName] = useState('');
  const [awakenErr, setAwakenErr] = useState<string | null>(null);
  if (!persona) return null;

  const attr = ATTR_IDS[attrIdx];
  const hue = ATTR_HUE[attr];
  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const sub = persona.attributePersonas?.[attr];
  const skills = persona.skills[attr] ?? [];
  const attrLevel = attributes.find(a => a.id === attr)?.level ?? 1;
  const isEquipped = persona.equippedMaskAttribute === attr;
  const summonLine = persona.summonLines?.[attr];
  // R18 面具羁绊 / 燃起
  const battlesOf = (a: AttributeId) => battleState?.maskBattles?.[a] ?? 0;
  const bondTier = maskBondTier(battlesOf(attr));
  const nextBondAt = bondTier < 3 ? MASK_BOND_THRESHOLDS[bondTier] : null;
  const blazing = blazingAttrsToday(todos, todoCompletions);
  // 觉醒可用迷思：背包里未镶嵌在别处的石头（烧录会吞掉它）
  const freeMyths = (battleState?.arsenal?.myths ?? []).filter(m =>
    !Object.values(persona.skills).flat().some(s => s.socket?.stoneId === m.id && !s.socket.permanent));
  const awakenTarget = awakenLevel != null ? skills.find(s => s.level === awakenLevel) ?? null : null;

  const doAwaken = async () => {
    if (awakenLevel == null || !awakenStone) return;
    const err = await useAppStore.getState().awakenSkill(attr, awakenLevel, awakenStone, awakenName);
    if (err) { setAwakenErr(err); return; }
    playSound('/battle-seal.mp3', 0.6);
    setAwakenLevel(null); setAwakenStone(null); setAwakenName(''); setAwakenErr(null);
  };

  const handleEquip = () => {
    equipMask(isEquipped ? null : attr);
    if (!isEquipped) {
      playSound('/battle-mask-swap.mp3');
      setEquipAnim(attr);
      setTimeout(() => setEquipAnim(null), 2200);
    }
  };

  return (
    // 自带暗色舞台：技能行/面具轨全是半透明白面，必须坐在自己的深靛底上——
    // 三频道页面底色（白日水面/纸面/黄舞台）一概不透进来
    <div
      className="relative space-y-3 overflow-hidden px-3 pb-3.5 pt-3"
      style={{
        clipPath: slantPoly(14),
        background: 'linear-gradient(170deg, #131840 0%, #0b0f2b 55%, #080b20 100%)',
        border: '1px solid rgba(139,124,246,0.28)',
      }}
    >
      {/* ── ① 面具轨 ── */}
      <div className="grid grid-cols-5 gap-1.5" role="tablist" aria-label="面具切换">
        {ATTR_IDS.map((a, i) => {
          const active = i === attrIdx;
          const h = ATTR_HUE[a];
          const equipped = persona.equippedMaskAttribute === a;
          return (
            <button
              key={a}
              role="tab"
              aria-selected={active}
              onClick={() => { if (!active) playSound('/ui-menu.mp3', 0.4); onSelectAttr(i); }}
              className="relative py-2.5 text-center text-[12px] font-black transition-transform active:scale-95"
              style={{
                clipPath: slantPoly(6),
                background: active ? `linear-gradient(155deg, rgba(${h.rgb},0.36), rgba(${h.rgb},0.1))` : 'rgba(255,255,255,0.05)',
                border: `1px solid rgba(${h.rgb},${active ? 0.65 : 0.16})`,
                color: active ? '#ffffff' : 'rgba(255,255,255,0.45)',
              }}
            >
              {attrNames[a]}
              {/* R18 羁绊档位小钻：出战场次 3/10/25 场点亮 Ⅰ/Ⅱ/Ⅲ */}
              <span className="mt-1 flex items-center justify-center gap-[3px]" aria-label={`羁绊 ${maskBondTier(battlesOf(a))}/3`}>
                {[0, 1, 2].map(k => (
                  <span
                    key={k}
                    aria-hidden
                    className="h-[5px] w-[5px]"
                    style={{
                      clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
                      background: k < maskBondTier(battlesOf(a)) ? h.accent : 'rgba(255,255,255,0.14)',
                    }}
                  />
                ))}
              </span>
              {/* 底缘属性色签：常亮身份条，佩戴中的面具再加 🎭；燃起加 🔥 */}
              <span aria-hidden className="absolute inset-x-2 bottom-0 h-[3px]" style={{ background: active ? h.accent : `rgba(${h.rgb},0.3)` }} />
              {equipped && <span className="absolute -top-0.5 right-0.5 text-[10px]" aria-label="佩戴中">🎭</span>}
              {blazing.includes(a) && <span className="absolute -top-0.5 left-0.5 text-[10px]" aria-label="今晚燃起">🔥</span>}
            </button>
          );
        })}
      </div>

      {/* ── ② 英雄板 ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={attr}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ duration: 0.18 }}
          className="relative overflow-hidden px-4 pb-4 pt-3.5"
          style={{
            clipPath: slantPoly(12),
            background: `linear-gradient(165deg, rgba(${hue.rgb},0.16) 0%, #10142f 44%, #0a0d24 100%)`,
            border: `1px solid rgba(${hue.rgb},0.35)`,
          }}
        >
          {/* 佩戴演出（沿用旧页：居中毛玻璃小卡，2.2s 自散） */}
          <AnimatePresence>
            {equipAnim === attr && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.85, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-[85%] rounded-2xl px-5 py-3 text-center shadow-xl"
                  style={{
                    background: `rgba(${hue.rgb},0.6)`,
                    backdropFilter: 'blur(8px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(8px) saturate(140%)',
                    border: '1px solid rgba(255,255,255,0.35)',
                  }}
                >
                  <p className="text-sm font-black text-white">🎭 Persona 已佩戴</p>
                  <p className="mt-1 text-[11px] leading-snug text-white/85">{MASK_BUFFS[attr]}</p>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* 幽灵属性字 */}
          <span aria-hidden className="pointer-events-none absolute -right-2 -top-4 select-none text-[88px] font-black italic leading-none" style={{ color: `rgba(${hue.rgb},0.07)` }}>
            {attrNames[attr]}
          </span>

          {/* 眉标：MASK · 属性 · 属性等级 ＋ 佩戴态章 */}
          <div className="relative flex items-center gap-2">
            <span className="text-[10px] font-black tracking-[0.24em]" style={{ color: hue.accent }}>
              MASK · {attrNames[attr]}
            </span>
            <span className="px-1.5 py-0.5 text-[9px] font-black tabular-nums" style={{ clipPath: slantPoly(4), background: `rgba(${hue.rgb},0.16)`, color: hue.accent }}>
              属性 Lv.{attrLevel}
            </span>
            {isEquipped && (
              <span className="ml-auto px-2 py-0.5 text-[10px] font-black text-white" style={{ clipPath: slantPoly(5), background: `rgba(${hue.rgb},0.5)` }}>
                🎭 佩戴中
              </span>
            )}
          </div>

          <p className="relative mt-2 text-[24px] font-black leading-tight text-white" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>
            {sub?.name ?? '反抗者'}
          </p>
          {sub?.description && (
            <p className="relative mt-1 text-[11.5px] leading-relaxed text-white/60">{sub.description}</p>
          )}

          {/* 面具增益（佩戴即生效的三行价值，不该等佩戴后才可见） */}
          <div className="relative mt-3 px-3 py-2 text-[11px] font-semibold leading-relaxed" style={{ clipPath: slantPoly(7), background: 'rgba(251,191,36,0.1)', color: '#fcd34d' }}>
            🎭 {MASK_BUFFS[attr]}
          </div>

          {/* R18 面具羁绊：出战场次 → 伤害加算档 */}
          <div className="relative mt-2 flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold" style={{ clipPath: slantPoly(7), background: `rgba(${hue.rgb},0.1)`, color: hue.accent }}>
            <span className="font-black">羁绊 {['—', 'Ⅰ', 'Ⅱ', 'Ⅲ'][bondTier]}</span>
            <span className="text-white/55">出战 {battlesOf(attr)} 场</span>
            {bondTier > 0 && <span>伤害 +{Math.round(bondTier * MASK_BOND_ADD_PER_TIER * 100)}%</span>}
            {nextBondAt != null && <span className="ml-auto text-white/40">下一档 {nextBondAt} 场</span>}
          </div>

          {blazing.includes(attr) && (
            <div className="relative mt-2 px-3 py-1.5 text-[11px] font-black" style={{ clipPath: slantPoly(7), background: 'rgba(251,146,60,0.14)', color: '#fdba74' }}>
              🔥 今晚燃起——白天{attrNames[attr]}待办达标，首个技能免 SP
            </div>
          )}

          {summonLine && (
            <p className="relative mt-2.5 text-[11px] italic leading-relaxed text-white/45">「{summonLine}」</p>
          )}

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleEquip}
            className="relative mt-3.5 w-full py-2.5 text-[14px] font-black tracking-widest text-white"
            style={{
              clipPath: slantPoly(9),
              background: isEquipped ? 'rgba(255,255,255,0.1)' : `linear-gradient(135deg, rgba(${hue.rgb},0.85), rgba(${hue.rgb},0.5))`,
              border: isEquipped ? `1px solid rgba(${hue.rgb},0.4)` : 'none',
            }}
          >
            {isEquipped ? '卸下面具' : '佩戴面具'}
          </motion.button>
        </motion.div>
      </AnimatePresence>

      {/* ── ③ 技能典 ── */}
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[11px] font-black tracking-[0.24em] text-white/55">技能 · 熟练度</span>
        <span className="text-[9px] font-semibold text-white/30">使用即涨 · 满星伤害/效果 +15%</span>
      </div>
      <div className="space-y-1.5">
        {skills.length === 0 ? (
          <p className="py-5 text-center text-sm text-white/35">暂无技能</p>
        ) : (
          skills.map((skill, i) => {
            const locked = skill.unlocked === false;
            const isDmg = skill.type === 'damage' || skill.type === 'crit' || skill.type === 'attack_boost';
            const baseTag = SKILL_TYPE_TAG[skill.type];
            const mapped = SKILL_EFFECT_MAP[attr]?.[skill.type];
            const tagLabel = mapped?.label ?? baseTag?.label;
            const effectHint = skill.type === 'heal'
              ? `+${healAmount(skill.power, attr)}HP`
              : (mapped?.hint ?? SKILL_EFFECT_HINT[skill.type] ?? '');
            return (
              <div
                key={i}
                className="relative px-3 py-2.5"
                style={{
                  clipPath: slantPoly(8),
                  background: locked ? 'rgba(255,255,255,0.028)' : 'rgba(255,255,255,0.06)',
                  borderLeft: `3px solid ${locked ? 'rgba(255,255,255,0.1)' : hue.accent}`,
                }}
              >
                <div className="flex items-start gap-2.5">
                  {/* 等级徽 */}
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[12px] font-black text-white"
                    style={{ clipPath: slantPoly(5), background: locked ? 'rgba(255,255,255,0.08)' : `rgba(${hue.rgb},0.3)` }}
                  >
                    {locked ? '🔒' : skill.level}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!locked && (
                        <span className="shrink-0" style={{ color: baseTag?.color }}>
                          <SkillGlyph type={skill.type} size={13} />
                        </span>
                      )}
                      <span className={`text-[14px] font-black leading-tight ${locked ? 'text-white/35' : 'text-white/90'}`}>
                        {skill.name}
                      </span>
                      {!locked && skill.type !== 'damage' && baseTag && tagLabel && (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold" style={{ clipPath: slantPoly(4), color: baseTag.color, background: baseTag.bg }}>
                          {mapped?.icon ? `${mapped.icon} ${tagLabel}` : tagLabel}
                        </span>
                      )}
                      {skill.oath && (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold" style={{ clipPath: slantPoly(4), color: '#fcd34d', background: 'rgba(252,211,77,0.14)' }}>
                          誓约
                        </span>
                      )}
                      {skill.socket && (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold" style={{ clipPath: slantPoly(4), color: '#c4b5fd', background: 'rgba(196,181,253,0.14)' }}>
                          ◆ {skill.socket.permanent ? '烧录' : '迷思'}
                        </span>
                      )}
                      {(skill.awakenRound ?? 0) > 0 && (
                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-black" style={{ clipPath: slantPoly(4), color: '#fbbf24', background: 'rgba(251,191,36,0.16)' }}>
                          ☄ 觉醒{(skill.awakenRound ?? 0) > 1 ? `×${skill.awakenRound}` : ''}
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 truncate text-[10.5px] ${locked ? 'font-bold text-amber-200/70' : 'text-white/45'}`}>
                      {locked ? `解锁 · ${attrNames[attr]} Lv.${skill.level} ＋ 前技 ★★★` : skill.description}
                    </p>
                    {!locked && skill.socket?.permanent && (
                      <p className="mt-0.5 truncate text-[10px] font-semibold" style={{ color: '#c4b5fd' }}>
                        ◆ {MYTH_POOL[skill.socket.kind].name}：{mythEntryText({ id: skill.socket.stoneId, kind: skill.socket.kind, value: skill.socket.value, quality: 'full', obtainedAt: '' })}（烧录）
                      </p>
                    )}
                    {!locked && (
                      <MasteryStrip
                        skill={skill}
                        accent={hue.accent}
                        onAwaken={() => { setAwakenLevel(skill.level); setAwakenStone(null); setAwakenName(''); setAwakenErr(null); }}
                      />
                    )}
                  </div>
                  {/* 右列：威力 / 效果 + SP */}
                  <div className="shrink-0 text-right">
                    {isDmg ? (
                      <p className="text-[17px] font-black italic leading-none tabular-nums" style={{ color: locked ? 'rgba(255,255,255,0.25)' : hue.accent }}>
                        {skill.power}
                      </p>
                    ) : (
                      <p className="text-[10px] font-bold leading-tight" style={{ color: locked ? 'rgba(255,255,255,0.25)' : baseTag?.color }}>
                        {effectHint}
                      </p>
                    )}
                    <p className={`mt-1 text-[10px] font-bold tabular-nums ${locked ? 'text-white/25' : 'text-yellow-300/80'}`}>
                      SP {skill.spCost}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── R18 觉醒弹层：满星技 + 一颗迷思 → 词条烧录 + 改名（可手动，留空 = 原名·觉醒） ──
          portal 到 body：本组件长在战场页正文里，页内浮层被 PageShell 的 stacking
          context 摁成 z=1，底部导航（z-40）会盖住弹层下缘（见 components/ModalPortal.tsx）。
          战场页根带 .p5-reskin，红频道下要跟着搬，毯式换肤认祖先类。 */}
      <ModalPortal className={codexChannel === 'p5' ? 'p5-reskin' : ''}>
      <AnimatePresence>
        {awakenTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center px-6"
            style={{ background: 'rgba(4,3,12,0.9)' }}
            onClick={() => setAwakenLevel(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="w-full max-w-sm px-4 pb-4 pt-3.5"
              style={{ clipPath: slantPoly(12), background: 'linear-gradient(170deg, #1c1503 0%, #0e0b20 55%)', border: '1px solid rgba(251,191,36,0.45)' }}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-[10px] font-black tracking-[0.24em] text-amber-300">☄ 技能觉醒</p>
              <p className="mt-1.5 text-[18px] font-black text-white" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>
                {awakenTarget.name}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/55">
                满星的技艺将烧录一颗迷思为「永久词条」，星级清零进入下一轮——每星价值翻倍
                （+{Math.round(MASTERY_STAR_ADD * 100 * ((awakenTarget.awakenRound ?? 0) + 2))}%/星）。迷思石将被消耗。
              </p>

              <p className="mt-3 text-[10px] font-black tracking-[0.2em] text-white/45">选择要烧录的迷思</p>
              <div className="mt-1.5 max-h-[168px] space-y-1.5 overflow-y-auto pr-1">
                {freeMyths.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-white/35">背包里没有可用的迷思石——去塔里搜刮吧</p>
                ) : freeMyths.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setAwakenStone(m.id); setAwakenErr(null); }}
                    className="w-full px-2.5 py-2 text-left"
                    style={{
                      clipPath: slantPoly(6),
                      background: awakenStone === m.id ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${awakenStone === m.id ? 'rgba(251,191,36,0.7)' : 'rgba(255,255,255,0.1)'}`,
                    }}
                  >
                    <span className="flex items-center justify-between text-[12px] font-black text-white">
                      {MYTH_POOL[m.kind].name}
                      <span className="text-[9px] font-bold" style={{ color: '#c4b5fd' }}>{QUALITY_LABEL[m.quality]}</span>
                    </span>
                    <span className="mt-0.5 block text-[10px] text-white/55">{mythEntryText(m)}</span>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-[10px] font-black tracking-[0.2em] text-white/45">新的名号（可选）</p>
              <input
                value={awakenName}
                onChange={e => setAwakenName(e.target.value)}
                maxLength={14}
                placeholder={`${awakenTarget.name}·觉醒`}
                className="mt-1.5 w-full bg-transparent px-2.5 py-2 text-[13px] font-bold text-white outline-none placeholder:text-white/25"
                style={{ clipPath: slantPoly(6), background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}
              />

              {awakenErr && <p className="mt-2 text-[11px] font-bold text-red-300">{awakenErr}</p>}

              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={() => setAwakenLevel(null)}
                  className="flex-1 py-2.5 text-[13px] font-black text-white/60"
                  style={{ clipPath: slantPoly(8), background: 'rgba(255,255,255,0.08)' }}
                >
                  再想想
                </button>
                <button
                  onClick={() => void doAwaken()}
                  disabled={!awakenStone}
                  className="flex-1 py-2.5 text-[13px] font-black text-black disabled:opacity-40"
                  style={{ clipPath: slantPoly(8), background: 'linear-gradient(90deg, #fde68a, #fbbf24)' }}
                >
                  ☄ 觉醒
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </ModalPortal>
    </div>
  );
}
