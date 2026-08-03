/**
 * 批3 · 装备库（遗物 / 迷思 / 誓约 / 共鸣链）+ 阴影档案馆
 *
 * 战斗域暗面语言（warKit 斜切 + 噪点），从战场页进入。
 *  - 遗物：区层期栏位（Lv1期1 / Lv2-4期2 / Lv5期3），装备/卸下/分解转SP
 *  - 迷思：镶入普通技能（每技能1枚、誓约技不可镶、淬毒仅伤害/暴击）
 *  - 誓约：占技能槽、每 Persona 限1、完全可逆；LLM 按人设命名并缓存
 *  - 共鸣链：两两缔结，同时生效 1 条，仅战斗内生效
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { AttributeId, MythStone, OathStone, PersonaSkill, RelicInstance } from '@/types';
import { RELIC_SLOTS_BY_STRATUM, RELIC_SALVAGE_SP, masteryStars, MASTERY_FULL_BY_LEVEL } from '@/battle/numbers';
import {
  RELIC_POOL, MYTH_POOL, OATH_POOL, CHAIN_POOL, CHAIN_KEYS, AFFIX_POOL,
  QUALITY_LABEL, relicEntryText, mythEntryText,
} from '@/battle/loot';
import { generateOathSkill } from '@/utils/battleAI';
import { playSound } from '@/utils/feedback';
import { useBackHandler } from '@/utils/useBackHandler';
import { slantPoly, NoiseLayer, IconOrb, IconMask, IconCrescent, IconBolt } from '@/components/battle/warKit';

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const QUALITY_STYLE = {
  waning: { color: '#94a3b8', bg: 'rgba(148,163,184,0.16)', edge: 'rgba(148,163,184,0.4)' },
  half:   { color: '#7dd3fc', bg: 'rgba(125,211,252,0.14)', edge: 'rgba(125,211,252,0.45)' },
  full:   { color: '#fcd34d', bg: 'rgba(252,211,77,0.14)', edge: 'rgba(252,211,77,0.5)' },
} as const;

type SectionKey = 'relic' | 'myth' | 'oath' | 'chain';

function QualityChip({ quality }: { quality: RelicInstance['quality'] }) {
  const st = QUALITY_STYLE[quality];
  return (
    <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black"
          style={{ color: st.color, background: st.bg, clipPath: slantPoly(4), lineHeight: 1.2 }}>
      <IconCrescent size={9} />{QUALITY_LABEL[quality]}
    </span>
  );
}

/** 双层法斜切卡（描边随品质/状态变化） */
function Card({ edge, children, dim }: { edge: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div style={{ clipPath: slantPoly(10), background: edge, padding: 1, opacity: dim ? 0.55 : 1 }}>
      <div style={{ clipPath: slantPoly(10), background: 'rgba(16,10,40,0.96)' }} className="px-3 py-2.5">
        {children}
      </div>
    </div>
  );
}

function ActionBtn({ label, onClick, tone = 'normal', disabled }: {
  label: string; onClick: () => void; tone?: 'normal' | 'danger' | 'primary'; disabled?: boolean;
}) {
  const style = tone === 'danger'
    ? { color: '#fca5a5', background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)' }
    : tone === 'primary'
      ? { color: '#0b1020', background: 'linear-gradient(135deg,#7dd3fc,#38bdf8)', border: '1px solid rgba(125,211,252,0.6)' }
      : { color: '#c7d2fe', background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.4)' };
  return (
    <button onClick={onClick} disabled={disabled}
            className="flex-shrink-0 px-2.5 py-1 text-[11px] font-black disabled:opacity-40"
            style={{ ...style, clipPath: slantPoly(6) }}>
      {label}
    </button>
  );
}

// ── 主体 ─────────────────────────────────────────────────────
export function ArsenalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    persona, battleState, stratum, settings,
    toggleEquipRelic, salvageRelic, socketMyth, unsocketMyth,
    equipOathStone, unequipOathStone, renameOathSkill, setActiveChain,
  } = useAppStore();
  const [section, setSection] = useState<SectionKey>('relic');
  const [confirmSalvageId, setConfirmSalvageId] = useState<string | null>(null);
  const [pickerMyth, setPickerMyth] = useState<MythStone | null>(null);
  const [pickerOath, setPickerOath] = useState<OathStone | null>(null);
  const [pickerAttr, setPickerAttr] = useState<AttributeId | null>(null);
  const [namingStoneId, setNamingStoneId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useBackHandler(open, () => {
    if (pickerMyth || pickerOath) { setPickerMyth(null); setPickerOath(null); setPickerAttr(null); return; }
    onClose();
  });

  const arsenal = battleState?.arsenal;
  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const slots = RELIC_SLOTS_BY_STRATUM[Math.min(4, Math.max(0, (stratum?.level ?? 1) - 1))];
  const equippedRelics = arsenal?.relics.filter(r => r.equipped) ?? [];

  /** 迷思石 → 所镶技能（displayName） */
  const mythLocation = useMemo(() => {
    const map = new Map<string, string>();
    if (!persona) return map;
    for (const attr of ATTR_IDS) {
      for (const s of persona.skills[attr] ?? []) {
        if (s.socket) map.set(s.socket.stoneId, `${attrNames[attr]}·${s.name}`);
      }
    }
    return map;
  }, [persona, attrNames]);

  const showToast = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2000); };

  if (!open) return null;

  const handleSalvage = async (r: RelicInstance) => {
    if (confirmSalvageId !== r.id) { setConfirmSalvageId(r.id); return; }
    setConfirmSalvageId(null);
    const sp = await salvageRelic(r.id);
    playSound('/battle-seal.mp3', 0.4);
    showToast(`「${RELIC_POOL[r.kind].name}」化作月尘 · +${sp} SP`);
  };

  const handleSocket = async (skill: PersonaSkill) => {
    if (!pickerMyth || !pickerAttr) return;
    const err = await socketMyth(pickerAttr, skill.level, pickerMyth.id);
    if (err) { showToast(err); return; }
    playSound('/battle-seal.mp3', 0.5);
    showToast(`「${MYTH_POOL[pickerMyth.kind].name}」已镶入 ${skill.name}`);
    setPickerMyth(null); setPickerAttr(null);
  };

  const handleOathEquip = async (skill: PersonaSkill) => {
    if (!pickerOath || !pickerAttr || !persona) return;
    const stone = pickerOath;
    const attr = pickerAttr;
    const err = await equipOathStone(attr, skill.level, stone.id);
    if (err) { showToast(err); return; }
    playSound('/battle-mask-swap.mp3', 0.6);
    setPickerOath(null); setPickerAttr(null);
    const def = OATH_POOL[stone.kind];
    showToast(`誓约缔结——「${skill.name}」已被置换（可随时解除复原）`);
    // LLM 命名（缓存命中则 store 已直接使用，不再调 AI）
    if (!stone.namedCache?.[attr]) {
      setNamingStoneId(stone.id);
      const p = persona.attributePersonas?.[attr];
      const named = await generateOathSkill(
        settings, p?.name ?? persona.name, p?.description ?? '', attrNames[attr], def.stoneName, def.effectText,
      ).catch(() => null);
      if (named) await renameOathSkill(attr, named.name, named.description);
      setNamingStoneId(null);
    }
  };

  // 誓约技当前所在（attr → 誓约技能）
  const oathSkillOf = (attr: AttributeId) => persona?.skills[attr]?.find(s => s.oath);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0b0620 0%, #140a2e 55%, #0b0620 100%)' }}
    >
      <NoiseLayer opacity={0.05} />
      {/* 头部 */}
      <div className="flex-shrink-0 px-4 pb-2" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <button onClick={onClose} className="text-gray-400 text-sm px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)' }}>
            ✕ 返回
          </button>
          <p className="text-white font-black text-base tracking-widest">装 备 库</p>
          <span className="w-14" />
        </div>
        <div className="flex">
          {([
            { key: 'relic', label: '遗物', count: arsenal?.relics.length ?? 0 },
            { key: 'myth', label: '迷思', count: arsenal?.myths.length ?? 0 },
            { key: 'oath', label: '誓约', count: arsenal?.oaths.length ?? 0 },
            { key: 'chain', label: '共鸣链', count: arsenal?.chains.length ?? 0 },
          ] as const).map((t, i) => {
            const active = section === t.key;
            return (
              <button key={t.key} onClick={() => setSection(t.key)}
                      className="relative flex-1 py-2 text-[13px] font-black"
                      style={{
                        clipPath: slantPoly(9),
                        marginLeft: i > 0 ? -5 : 0,
                        zIndex: active ? 2 : 1,
                        background: active ? 'linear-gradient(135deg,#312e81,#4338ca)' : 'rgba(255,255,255,0.07)',
                        color: active ? '#e0e7ff' : '#6b7280',
                      }}>
                {t.label}<span className="ml-1 text-[10px] opacity-70">{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2" style={{ paddingBottom: 'calc(1.2rem + env(safe-area-inset-bottom))' }}>
        {/* ── 遗物 ── */}
        {section === 'relic' && (
          <>
            <p className="text-[11px] text-indigo-200/60 font-bold">
              栏位 <span className="text-indigo-100">{equippedRelics.length}/{slots}</span>
              <span className="opacity-60">（随区层等级：Lv1期1 · Lv2-4期2 · Lv5期3）</span>
            </p>
            {(arsenal?.relics.length ?? 0) === 0 && (
              <p className="text-center text-sm text-gray-500 py-10">还没有遗物——月匣、强敌与心魔会掉落它们</p>
            )}
            {arsenal?.relics.map(r => (
              <Card key={r.id} edge={r.equipped ? 'rgba(125,211,252,0.55)' : QUALITY_STYLE[r.quality].edge}>
                <div className="flex items-center gap-2">
                  <QualityChip quality={r.quality} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-black text-white truncate">{RELIC_POOL[r.kind].name}</p>
                    <p className="text-[11px] text-indigo-200/70">{relicEntryText(r)}</p>
                  </div>
                  <ActionBtn
                    label={r.equipped ? '卸下' : '装备'}
                    tone={r.equipped ? 'normal' : 'primary'}
                    onClick={async () => {
                      const ok = await toggleEquipRelic(r.id);
                      if (!ok && !r.equipped) showToast(`栏位已满（${slots} 格）——先卸下一件`);
                      else playSound('/ui-menu.mp3', 0.4);
                    }}
                  />
                  <ActionBtn
                    label={confirmSalvageId === r.id ? `确认 +${RELIC_SALVAGE_SP[r.quality]}SP` : '分解'}
                    tone="danger"
                    onClick={() => void handleSalvage(r)}
                  />
                </div>
              </Card>
            ))}
          </>
        )}

        {/* ── 迷思 ── */}
        {section === 'myth' && (
          <>
            <p className="text-[11px] text-indigo-200/60 font-bold">镶入普通技能追加附带效果 · 每技能 1 枚 · 可自由拆装 · 誓约技不可镶</p>
            {(arsenal?.myths.length ?? 0) === 0 && (
              <p className="text-center text-sm text-gray-500 py-10">还没有迷思石——与遗物同渠道掉落</p>
            )}
            {arsenal?.myths.map(m => {
              const loc = mythLocation.get(m.id);
              return (
                <Card key={m.id} edge={loc ? 'rgba(196,181,253,0.55)' : QUALITY_STYLE[m.quality].edge}>
                  <div className="flex items-center gap-2">
                    <QualityChip quality={m.quality} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-white truncate inline-flex items-center gap-1">
                        <IconOrb size={11} className="text-purple-300" />{MYTH_POOL[m.kind].name}
                      </p>
                      <p className="text-[11px] text-indigo-200/70">{mythEntryText(m)}</p>
                      {loc && <p className="text-[10px] text-purple-300/80 mt-0.5">已镶 · {loc}</p>}
                    </div>
                    {loc ? (
                      <ActionBtn label="拆下" onClick={() => {
                        if (!persona) return;
                        for (const attr of ATTR_IDS) {
                          const sk = persona.skills[attr]?.find(s => s.socket?.stoneId === m.id);
                          if (sk) { void unsocketMyth(attr, sk.level); showToast(`「${MYTH_POOL[m.kind].name}」已返还背包`); break; }
                        }
                      }} />
                    ) : (
                      <ActionBtn label="镶嵌" tone="primary" onClick={() => { setPickerMyth(m); setPickerAttr(null); }} />
                    )}
                  </div>
                </Card>
              );
            })}
          </>
        )}

        {/* ── 誓约 ── */}
        {section === 'oath' && (
          <>
            <p className="text-[11px] text-indigo-200/60 font-bold">占一个技能槽 · 每 Persona 限 1 · 随时解除、原技能完整复原</p>
            {(arsenal?.oaths.length ?? 0) === 0 && (
              <p className="text-center text-sm text-gray-500 py-10">还没有誓约石——击破心魔时或有机缘</p>
            )}
            {arsenal?.oaths.map(o => {
              const def = OATH_POOL[o.kind];
              const equippedAttr = o.equippedAttr;
              const naming = namingStoneId === o.id;
              return (
                <Card key={o.id} edge={equippedAttr ? 'rgba(252,211,77,0.5)' : 'rgba(99,102,241,0.45)'}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-white truncate inline-flex items-center gap-1">
                        <IconMask size={12} className="text-amber-300" />{def.stoneName}
                      </p>
                      <p className="text-[11px] text-indigo-200/70">{def.effectText} · SP {def.skill.spCost}</p>
                      {equippedAttr && (
                        <p className="text-[10px] text-amber-300/80 mt-0.5">
                          已缔结 · {attrNames[equippedAttr]}「{oathSkillOf(equippedAttr)?.name ?? '…'}」
                          {naming && <span className="ml-1 animate-pulse">命名中…</span>}
                        </p>
                      )}
                    </div>
                    {equippedAttr ? (
                      <ActionBtn label="解除" tone="danger" onClick={() => {
                        void unequipOathStone(equippedAttr);
                        showToast('誓约解除——原技能已复原，石返还背包');
                      }} />
                    ) : (
                      <ActionBtn label="缔结" tone="primary" onClick={() => { setPickerOath(o); setPickerAttr(null); }} />
                    )}
                  </div>
                </Card>
              );
            })}
          </>
        )}

        {/* ── 共鸣链 ── */}
        {section === 'chain' && (
          <>
            <p className="text-[11px] text-indigo-200/60 font-bold">击破心魔概率掉落 · 两两联系 · 同时生效 1 条 · 仅战斗内生效</p>
            {CHAIN_KEYS.map(key => {
              const def = CHAIN_POOL[key];
              const owned = arsenal?.chains.some(c => c.key === key) ?? false;
              const active = arsenal?.activeChainKey === key;
              const pairLabel = `${attrNames[def.pair[0]]} × ${attrNames[def.pair[1]]}`;
              return (
                <Card key={key} edge={active ? 'rgba(252,211,77,0.55)' : owned ? 'rgba(125,211,252,0.4)' : 'rgba(75,85,99,0.35)'} dim={!owned}>
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-black text-white truncate inline-flex items-center gap-1">
                        <IconBolt size={11} className={active ? 'text-amber-300' : 'text-sky-300'} />
                        {owned ? def.name : '？？？'}
                        <span className="text-[10px] font-bold text-indigo-300/70">{pairLabel}</span>
                      </p>
                      <p className="text-[11px] text-indigo-200/70">{owned ? def.effectText : '尚未缔结的共鸣'}</p>
                    </div>
                    {owned && (
                      <ActionBtn
                        label={active ? '收起' : '生效'}
                        tone={active ? 'normal' : 'primary'}
                        onClick={() => { void setActiveChain(active ? null : key); playSound('/ui-menu.mp3', 0.4); }}
                      />
                    )}
                  </div>
                </Card>
              );
            })}
          </>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 max-w-[88%]"
                      style={{ clipPath: slantPoly(8), background: 'rgba(30,20,70,0.96)', border: '1px solid rgba(125,211,252,0.4)' }}>
            <span className="text-[12px] font-bold text-indigo-100">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 镶嵌 / 缔结选择器 ── */}
      <AnimatePresence>
        {(pickerMyth || pickerOath) && persona && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 z-40 flex items-end justify-center"
                      style={{ background: 'rgba(0,0,0,0.72)' }}
                      onClick={() => { setPickerMyth(null); setPickerOath(null); setPickerAttr(null); }}>
            <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}
                        className="w-full max-h-[70%] overflow-y-auto px-4 pt-4 space-y-2"
                        style={{ background: 'rgba(14,8,36,0.98)', borderTop: '1px solid rgba(99,102,241,0.4)',
                                 paddingBottom: 'calc(1.2rem + env(safe-area-inset-bottom))' }}
                        onClick={e => e.stopPropagation()}>
              <p className="text-white font-black text-sm">
                {pickerMyth ? `镶嵌「${MYTH_POOL[pickerMyth.kind].name}」` : `缔结「${OATH_POOL[pickerOath!.kind].stoneName}」`}
                <span className="ml-2 text-[11px] font-bold text-indigo-300/70">
                  {pickerAttr ? '选择技能' : '选择 Persona'}
                </span>
              </p>
              {!pickerAttr ? (
                ATTR_IDS.map(attr => {
                  const p = persona.attributePersonas?.[attr];
                  const oathTaken = pickerOath && oathSkillOf(attr);
                  return (
                    <button key={attr} disabled={!!oathTaken}
                            onClick={() => setPickerAttr(attr)}
                            className="w-full text-left px-3 py-2.5 disabled:opacity-40"
                            style={{ clipPath: slantPoly(8), background: 'rgba(255,255,255,0.07)' }}>
                      <span className="text-[13px] font-black text-white">{attrNames[attr]} · {p?.name ?? '反抗者'}</span>
                      {oathTaken && <span className="ml-2 text-[10px] text-amber-300/80">已有誓约</span>}
                    </button>
                  );
                })
              ) : (
                (persona.skills[pickerAttr] ?? []).map(sk => {
                  const blockedMyth = pickerMyth && (
                    sk.oath ? '誓约技' : sk.socket ? '已有迷思'
                    : (MYTH_POOL[pickerMyth.kind].damageOnly && sk.type !== 'damage' && sk.type !== 'crit') ? '仅伤害/暴击' : null);
                  const blockedOath = pickerOath && (sk.oath ? '已是誓约' : sk.socket ? '镶有迷思' : null);
                  const blocked = pickerMyth ? blockedMyth : blockedOath;
                  const locked = sk.unlocked === false;
                  return (
                    <button key={sk.level} disabled={!!blocked || locked}
                            onClick={() => void (pickerMyth ? handleSocket(sk) : handleOathEquip(sk))}
                            className="w-full text-left px-3 py-2.5 disabled:opacity-40"
                            style={{ clipPath: slantPoly(8), background: 'rgba(255,255,255,0.07)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-black text-white truncate">Lv{sk.level} · {sk.name}</span>
                        <span className="flex-shrink-0 text-[10px] font-bold text-indigo-300/70">
                          {locked ? '未解锁' : blocked ? blocked : pickerOath ? '置换此槽' : '镶入'}
                        </span>
                      </div>
                      {pickerOath && !blocked && !locked && (
                        <p className="text-[10px] text-gray-500 mt-0.5">原技能将被快照保存，解除誓约时完整复原</p>
                      )}
                    </button>
                  );
                })
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── 阴影档案馆（批3 §5.2：替换战场页折叠列表） ────────────────
export function ShadowArchiveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { battleState, settings } = useAppStore();
  useBackHandler(open, onClose);
  if (!open) return null;
  const records = [...(battleState?.defeatedShadowLog ?? [])].reverse();
  void settings;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #0b0620 0%, #17092b 55%, #0b0620 100%)' }}
    >
      <NoiseLayer opacity={0.05} />
      <div className="flex-shrink-0 px-4 pb-3" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={onClose} className="text-gray-400 text-sm px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)' }}>
            ✕ 返回
          </button>
          <p className="text-white font-black text-base tracking-widest">阴影档案馆</p>
          <span className="text-[11px] font-bold text-indigo-300/70 w-14 text-right">{records.length} 座</span>
        </div>
        <p className="text-[11px] text-indigo-200/50 mt-1 text-center">被你击败的心魔在此永久收录——它们曾是你的一部分</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 space-y-2.5" style={{ paddingBottom: 'calc(1.2rem + env(safe-area-inset-bottom))' }}>
        {records.length === 0 && (
          <p className="text-center text-sm text-gray-500 py-12">档案馆空无一物——第一座雕像等待着你的凯旋</p>
        )}
        {records.map((rec, i) => {
          // Lv6 = 伪神：档案里单独一档「终局」，镀金而不是紫——它不与常规心魔混在一起
          const isFinal = rec.level >= 6 || rec.stratumLevel === 6;
          return (
          <div key={i} style={{ clipPath: slantPoly(12), background: isFinal ? 'rgba(232,182,76,0.5)' : 'rgba(147,51,234,0.35)', padding: 1 }}>
            <div style={{ clipPath: slantPoly(12), background: isFinal ? 'rgba(26,18,4,0.97)' : 'rgba(16,10,40,0.97)' }} className="px-4 py-3">
              {isFinal && (
                <p className="text-[9px] font-black tracking-[0.4em] uppercase mb-1" style={{ color: '#e8b64c' }}>finale</p>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-black text-white truncate">{rec.shadowName}</p>
                  {rec.description && <p className="text-[11px] text-indigo-200/60 mt-0.5 line-clamp-2">{rec.description}</p>}
                </div>
                <span className="flex-shrink-0 text-[11px] font-black px-1.5 py-0.5"
                      style={isFinal
                        ? { clipPath: slantPoly(4), background: 'rgba(232,182,76,0.22)', color: '#e8b64c' }
                        : { clipPath: slantPoly(4), background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                  {isFinal ? '终局' : `Lv.${rec.level}`}
                </span>
              </div>
              {(rec.affixes?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {rec.affixes!.map(a => (
                    <span key={a} className="text-[9px] font-bold px-1.5 py-0.5"
                          style={{ clipPath: slantPoly(4), background: 'rgba(147,51,234,0.22)', color: '#d8b4fe' }}>
                      {AFFIX_POOL[a].name}
                    </span>
                  ))}
                </div>
              )}
              {rec.quote && <p className="text-[11px] italic text-gray-400 mt-1.5">「{rec.quote}」</p>}
              <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500 font-bold tabular-nums">
                <span>识破 {rec.breachDate} → 击败 {rec.defeatDate} · 历时 {rec.daysElapsed} 天</span>
                <span>
                  {rec.stratumLevel ? `${rec.stratumLevel === 6 ? '顶阙' : `第${rec.stratumLevel}区层`} · ` : ''}
                  {rec.playerTotalLevel ? `讨伐时的你 Lv${rec.playerTotalLevel}` : ''}
                </span>
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** 技能行内的熟练度星显（批3 §4.1，Arena/BattleModal 复用） */
export function MasteryStars({ skill, showCount }: { skill: PersonaSkill; showCount?: boolean }) {
  const stars = masteryStars(skill.mastery ?? 0, skill.level);
  const full = MASTERY_FULL_BY_LEVEL[Math.min(4, Math.max(0, skill.level - 1))];
  return (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0" title={`熟练度 ${skill.mastery ?? 0}/${full}（每星伤害/效果+5%）`}>
      {[0, 1, 2].map(k => (
        <span key={k} className={`text-[9px] leading-none ${k < stars ? 'text-amber-300' : 'text-gray-600'}`}>★</span>
      ))}
      {showCount && <span className="ml-0.5 text-[9px] font-bold text-gray-500 tabular-nums">{Math.min(skill.mastery ?? 0, full)}/{full}</span>}
    </span>
  );
}
