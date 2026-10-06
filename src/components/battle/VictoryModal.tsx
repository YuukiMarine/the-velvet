import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { AttributeId } from '@/types';
import { generateVictoryNarrative } from '@/utils/battleAI';
import { triggerSuccessFeedback, playSound } from '@/utils/feedback';
import { HP_BONUS_PER_DEFEAT, ATTR_REWARD_PER_DEFEAT } from '@/constants';
import { MOON_BOSS_SP } from '@/battle/numbers';
import { monthLabelOf } from '@/battle/moonBoss';
import { orphanBossOf } from '@/battle/tower';
import { db } from '@/db';
import { useBackHandler } from '@/utils/useBackHandler';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function VictoryModal({ isOpen, onClose }: Props) {
  const { persona, shadow, stratum, settings, battleState, defeatShadow, addActivity } = useAppStore(useShallow(s => ({ persona: s.persona, shadow: s.shadow, stratum: s.stratum, settings: s.settings, battleState: s.battleState, defeatShadow: s.defeatShadow, addActivity: s.addActivity })));
  // VictoryModal 没有 X 按钮、点遮罩也不关 —— 原本就强制让用户点"领取奖励"完成结算。
  // 为保持语义一致，Android 返回键在此阶段也做 no-op（消费事件但不关闭，防止误触跳过结算）。
  useBackHandler(isOpen, () => { /* no-op */ });
  const [narrative, setNarrative] = useState('');
  const [selectedAttr, setSelectedAttr] = useState<AttributeId>('knowledge');
  const [claimed, setClaimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [daysElapsed, setDaysElapsed] = useState(0);
  // 第 13 轮：领奖失败不再静默（原来 throw 进 onClick 就没了，用户看到的就是「按钮按不动」）
  const [claimError, setClaimError] = useState<string | null>(null);
  /** 同步在途锁：claimed 是异步 state，挡不住同一 tick 的双击（连点会发双倍属性点和 SP） */
  const claimingRef = useRef(false);
  /** 属性记录已落库：失败后重试只补后半段（档案 / 清本体），不再发第二份属性点 */
  const awardedRef = useRef(false);

  /**
   * 第 13 轮 孤儿胜利兜底：status=victory 但本体没了（旧状态写回滚 / 同步 / 存档损坏）。
   * 区层还在爬 = 奖没领过 → 用区层名与等级拼一个占位心魔，奖励照发、档案照记；
   * 以前 handleClaim 一看 !shadow 就 return，按钮永远没反应，战场页每次进来都被这屏挡住。
   */
  const foe = shadow ?? (battleState?.status === 'victory' ? orphanBossOf(stratum) : null);
  const moonMonth = shadow?.moonMonth;

  useEffect(() => {
    if (!isOpen || !persona || !foe) return;
    triggerSuccessFeedback();
    setLoading(true);
    setNarrative('');
    setClaimed(false);
    setClaimError(null);
    awardedRef.current = false;
    claimingRef.current = false;
    const days = Math.max(1, Math.floor((Date.now() - new Date(foe.createdAt).getTime()) / 86400000));
    setDaysElapsed(days);
    const displayName = persona.equippedMaskAttribute
      ? (persona.attributePersonas?.[persona.equippedMaskAttribute]?.name ?? '反抗者')
      : '反抗者';
    generateVictoryNarrative(settings, displayName, foe.name, foe.level)
      .then(text => setNarrative(text))
      .catch(() => setNarrative(''))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /** 击破奖励属性点：按心魔等级 2..6（R19 用户拍板，原本一律 +10 太多） */
  const attrReward = foe
    ? (ATTR_REWARD_PER_DEFEAT[Math.min(foe.level - 1, ATTR_REWARD_PER_DEFEAT.length - 1)] ?? 2)
    : 2;
  const hpReward = foe
    ? (HP_BONUS_PER_DEFEAT[Math.min(foe.level - 1, HP_BONUS_PER_DEFEAT.length - 1)] ?? 2)
    : 2;

  const handleClaim = async () => {
    if (claimed || claimingRef.current || !persona || !foe) return;
    claimingRef.current = true;
    setClaimError(null);
    const pts = { [selectedAttr]: attrReward } as Record<string, number>;
    // Only first defeat at this Shadow level counts as important
    const prevAtLevel = (battleState?.defeatedShadowLog ?? []).filter(r => r.level === foe.level);
    const isFirstAtLevel = prevAtLevel.length === 0;
    // Build mask display name: use equipped attribute persona name, fall back to base persona name
    const equippedAttr = persona.equippedMaskAttribute;
    const maskDisplayName = equippedAttr
      ? (persona.attributePersonas?.[equippedAttr]?.name ?? '反抗者')
      : '反抗者';
    const attrDisplayName = settings.attributeNames[selectedAttr as keyof typeof settings.attributeNames];
    const description = equippedAttr
      ? `使用面具${maskDisplayName}击败了${foe.name}，${attrDisplayName}属性获得奖励`
      : `击败了${foe.name}，${attrDisplayName}属性获得奖励`;
    try {
      if (!awardedRef.current) {
        await addActivity(
          description,
          pts,
          'battle',
          { important: isFirstAtLevel, category: 'shadow_defeat' }
        );
        awardedRef.current = true;
      }
      await defeatShadow();
      // Clear shadow from store and DB
      await db.shadows.clear();
      useAppStore.setState({ shadow: null });
    } catch (err) {
      claimingRef.current = false; // 没领成：放开锁让用户再点一次
      console.error('[battle] 领取奖励失败', err);
      const msg = err instanceof Error ? err.message : String(err);
      setClaimError(`没领成：${msg.slice(0, 80)}——再点一次试试；还不行就重启 App 再进战场`);
      return;
    }
    playSound('/battle-critical.mp3');
    setClaimed(true);
    setTimeout(onClose, 1500);
  };

  if (!isOpen) return null;

  const attrNamesMap = settings.attributeNames as Record<AttributeId, string>;

  // R18：portal 到 body（页面内容层 z 语境压不过底导，结算屏不该露导航）
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.95)' }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="w-full max-w-md rounded-2xl overflow-hidden p-6"
        style={{
          background: 'linear-gradient(135deg, #0f0c29, #302b63)',
          border: '1px solid rgba(250,204,21,0.4)',
        }}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
            <span className="text-5xl">⭐</span>
          </motion.div>
          <h2 className="text-yellow-300 text-2xl font-black mt-2">Shadow·击破</h2>
          {persona && foe && (
            <>
              <p className="text-gray-300 text-sm mt-1">反抗者 vs {foe.name}</p>
              <p className="text-yellow-300/60 text-xs mt-0.5">历经 {daysElapsed} 天</p>
              {moonMonth && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black text-amber-100" style={{ background: 'rgba(253,230,138,0.12)', boxShadow: 'inset 0 0 0 1px rgba(253,230,138,0.35)' }}>
                  🌕 月度心魔 · {monthLabelOf(moonMonth)} · 额外 +{MOON_BOSS_SP} SP
                </p>
              )}
            </>
          )}
        </div>

        {/* Narrative */}
        <div
          className="mb-5 p-4 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {loading ? (
            <div className="text-center py-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-6 h-6 rounded-full border-2 border-yellow-400 border-t-transparent mx-auto"
              />
            </div>
          ) : (
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{narrative}</p>
          )}
        </div>

        {/* Reward selection */}
        {!claimed ? (
          <div>
            <p className="text-gray-400 text-sm italic mb-2">阴影消散，化为了你的力量</p>
            {foe && (
              <p className="text-emerald-400 text-sm font-semibold mb-1">
                HP 上限 +{hpReward}
              </p>
            )}
            <p className="text-white text-sm font-semibold mb-3">选择奖励属性 (+{attrReward}点)</p>
            <div className="grid grid-cols-5 gap-1 mb-4">
              {(Object.keys(settings.attributeNames) as AttributeId[]).map(attr => (
                <button
                  key={attr}
                  onClick={() => setSelectedAttr(attr)}
                  className="py-2 rounded-lg text-xs font-bold transition-all"
                  style={{
                    background: selectedAttr === attr ? 'rgba(250,204,21,0.3)' : 'rgba(255,255,255,0.1)',
                    color: selectedAttr === attr ? '#fde68a' : '#9ca3af',
                    border: selectedAttr === attr ? '1px solid rgba(250,204,21,0.6)' : '1px solid transparent',
                  }}
                >
                  {attrNamesMap[attr]}
                </button>
              ))}
            </div>
            {claimError && (
              <p role="alert" className="mb-3 rounded-lg px-3 py-2 text-xs leading-relaxed text-rose-200" style={{ background: 'rgba(244,63,94,0.14)', border: '1px solid rgba(244,63,94,0.4)' }}>
                {claimError}
              </p>
            )}
            <button
              onClick={handleClaim}
              className="w-full py-3 rounded-xl text-black font-black text-sm"
              style={{ background: 'linear-gradient(90deg, #fde68a, #fbbf24)' }}
            >
              ✦ 领取奖励
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-4"
          >
            <span className="text-green-400 text-lg">
              ✓ 已获得 +{attrReward} {attrNamesMap[selectedAttr]}
            </span>
            {foe && (
              <p className="text-emerald-400/70 text-sm mt-1.5">
                HP 上限 +{hpReward}
              </p>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
