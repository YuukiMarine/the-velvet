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
import { healAmount, masteryStars, MASTERY_FULL_BY_LEVEL } from '@/battle/numbers';
import { playSound } from '@/utils/feedback';
import { slantPoly, SlantGauge, SkillGlyph } from '@/components/battle/warKit';

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

/** 熟练度条（③ 的行底条）：★×3 + 斜节进度 + 计数——每星 +5% 直接写在行里 */
const MasteryStrip = ({ skill, accent }: { skill: PersonaSkill; accent: string }) => {
  const uses = skill.mastery ?? 0;
  const full = MASTERY_FULL_BY_LEVEL[Math.min(4, Math.max(0, skill.level - 1))];
  const stars = masteryStars(uses, skill.level);
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
      <span className="shrink-0 text-[9px] font-semibold text-white/30">每星+5%</span>
    </div>
  );
};

export function PersonaCodex({ attrIdx, onSelectAttr }: { attrIdx: number; onSelectAttr: (i: number) => void }) {
  const { persona, settings, attributes, equipMask } = useAppStore();
  const [equipAnim, setEquipAnim] = useState<AttributeId | null>(null);
  if (!persona) return null;

  const attr = ATTR_IDS[attrIdx];
  const hue = ATTR_HUE[attr];
  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const sub = persona.attributePersonas?.[attr];
  const skills = persona.skills[attr] ?? [];
  const attrLevel = attributes.find(a => a.id === attr)?.level ?? 1;
  const isEquipped = persona.equippedMaskAttribute === attr;
  const summonLine = persona.summonLines?.[attr];

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
              {/* 底缘属性色签：常亮身份条，佩戴中的面具再加 🎭 */}
              <span aria-hidden className="absolute inset-x-2 bottom-0 h-[3px]" style={{ background: active ? h.accent : `rgba(${h.rgb},0.3)` }} />
              {equipped && <span className="absolute -top-0.5 right-0.5 text-[10px]" aria-label="佩戴中">🎭</span>}
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
                          ◆ 迷思
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 truncate text-[10.5px] ${locked ? 'font-bold text-amber-200/70' : 'text-white/45'}`}>
                      {locked ? `解锁 · ${attrNames[attr]} Lv.${skill.level} ＋ 前技 ★★★` : skill.description}
                    </p>
                    {!locked && <MasteryStrip skill={skill} accent={hue.accent} />}
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
    </div>
  );
}
