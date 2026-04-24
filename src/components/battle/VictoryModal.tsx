import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store';
import { AttributeId } from '@/types';
import { generateVictoryNarrative } from '@/utils/battleAI';
import { triggerSuccessFeedback, playSound } from '@/utils/feedback';
import { HP_BONUS_PER_DEFEAT } from '@/constants';
import { db } from '@/db';
import { useBackHandler } from '@/utils/useBackHandler';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function VictoryModal({ isOpen, onClose }: Props) {
  const { persona, shadow, settings, battleState, defeatShadow, addActivity } = useAppStore();
  // VictoryModal 没有 X 按钮、点遮罩也不关 —— 原本就强制让用户点"领取奖励"完成结算。
  // 为保持语义一致，Android 返回键在此阶段也做 no-op（消费事件但不关闭，防止误触跳过结算）。
  useBackHandler(isOpen, () => { /* no-op */ });
  const [narrative, setNarrative] = useState('');
  const [selectedAttr, setSelectedAttr] = useState<AttributeId>('knowledge');
  const [claimed, setClaimed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [daysElapsed, setDaysElapsed] = useState(0);

  useEffect(() => {
    if (!isOpen || !persona || !shadow) return;
    triggerSuccessFeedback();
    setLoading(true);
    setNarrative('');
    setClaimed(false);
    const days = Math.max(1, Math.floor((Date.now() - new Date(shadow.createdAt).getTime()) / 86400000));
    setDaysElapsed(days);
    const displayName = persona.equippedMaskAttribute
      ? (persona.attributePersonas?.[persona.equippedMaskAttribute]?.name ?? '反抗者')
      : '反抗者';
    generateVictoryNarrative(settings, displayName, shadow.name, shadow.level)
      .then(text => setNarrative(text))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleClaim = async () => {
    if (claimed || !persona || !shadow) return;
    const pts = { [selectedAttr]: 10 } as Record<string, number>;
    // Only first defeat at this Shadow level counts as important
    const prevAtLevel = (battleState?.defeatedShadowLog ?? []).filter(r => r.level === shadow.level);
    const isFirstAtLevel = prevAtLevel.length === 0;
    // Build mask display name: use equipped attribute persona name, fall back to base persona name
    const equippedAttr = persona.equippedMaskAttribute;
    const maskDisplayName = equippedAttr
      ? (persona.attributePersonas?.[equippedAttr]?.name ?? '反抗者')
      : '反抗者';
    const attrDisplayName = settings.attributeNames[selectedAttr as keyof typeof settings.attributeNames];
    await addActivity(
      `使用面具${maskDisplayName}击败了${shadow.name}，${attrDisplayName}属性获得奖励`,
      pts,
      'battle',
      { important: isFirstAtLevel, category: 'shadow_defeat' }
    );
    await defeatShadow();
    // Clear shadow from store and DB
    await db.shadows.clear();
    useAppStore.setState({ shadow: null });
    playSound('/battle-critical.mp3');
    setClaimed(true);
    setTimeout(onClose, 1500);
  };

  if (!isOpen) return null;

  const attrNamesMap = settings.attributeNames as Record<AttributeId, string>;

  return (
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
          {persona && shadow && (
            <>
              <p className="text-gray-300 text-sm mt-1">反抗者 vs {shadow.name}</p>
              <p className="text-yellow-300/60 text-xs mt-0.5">历经 {daysElapsed} 天</p>
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
            {shadow && (
              <p className="text-emerald-400 text-sm font-semibold mb-1">
                HP 上限 +{HP_BONUS_PER_DEFEAT[Math.min(shadow.level - 1, 4)] ?? 2}
              </p>
            )}
            <p className="text-white text-sm font-semibold mb-3">选择奖励属性 (+10点)</p>
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
              ✓ 已获得 +10 {attrNamesMap[selectedAttr]}
            </span>
            {shadow && (
              <p className="text-emerald-400/70 text-sm mt-1.5">
                HP 上限 +{HP_BONUS_PER_DEFEAT[Math.min(shadow.level - 1, 4)] ?? 2}
              </p>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
