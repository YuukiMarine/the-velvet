import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { Shadow, AttributeId } from '@/types';
import { generateShadow } from '@/utils/battleAI';
import { SHADOW_LEVEL_CONFIG } from '@/constants';
import { playSound } from '@/utils/feedback';
import { ShadowWarningOverlay } from '@/components/battle/ShadowWarningOverlay';
import { useBackHandler } from '@/utils/useBackHandler';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ShadowCreateModal({ isOpen, onClose }: Props) {
  const { settings, attributes, saveShadow, saveBattleState, battleState } = useAppStore();
  const [mode, setMode] = useState<'choose' | 'manual'>('choose');
  const [level, setLevel] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualWeak, setManualWeak] = useState<AttributeId>('knowledge');
  const [error, setError] = useState('');
  const [warnShadow, setWarnShadow] = useState<{ name: string; level: number; weakAttribute: AttributeId } | null>(null);

  // Android 返回键：
  //   - warnShadow 面板打开中 → 关掉警告（让玩家回到 Shadow 生成界面）
  //   - generating 中 → 点遮罩已被阻止，back 同样 no-op
  //   - 其他 → 关闭整个 Modal（匹配点遮罩）
  useBackHandler(isOpen, () => {
    if (warnShadow) { setWarnShadow(null); return; }
    if (generating) return;
    onClose();
  });

  const attrValues = Object.fromEntries(attributes.map(a => [a.id, a.points])) as Record<AttributeId, number>;
  const attrNames = settings.attributeNames as Record<AttributeId, string>;
  const lastWeak = battleState?.lastDefeatedWeakAttribute;

  // 逐级解锁：已击败的最高等级 + 1 = 当前可挑战最高等级（最少为 1）
  const highestDefeated = Math.max(0, ...(battleState?.defeatedShadowLog?.map(r => r.level) ?? []));
  const maxUnlockedLevel = Math.min(highestDefeated + 1, SHADOW_LEVEL_CONFIG.length);

  // 每次打开弹窗时重置等级为允许的最小值
  useEffect(() => {
    if (isOpen) {
      setLevel(l => Math.min(l, maxUnlockedLevel));
      setMode('choose');
      setError('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const createShadow = async (data: {
    name: string;
    description: string;
    invertedAttributes: Record<AttributeId, string>;
    responseLines: string[];
    weakAttribute: AttributeId;
  }) => {
    const cfg = SHADOW_LEVEL_CONFIG[level - 1];
    const shadow: Shadow = {
      id: uuidv4(),
      level,
      name: data.name,
      description: data.description,
      invertedAttributes: data.invertedAttributes,
      weakAttribute: data.weakAttribute,
      maxHp: cfg.maxHp,
      currentHp: cfg.maxHp,
      maxHp2: cfg.maxHp2,
      currentHp2: cfg.maxHp2,
      responseLines: data.responseLines,
      attackPower: settings.battleShadowAttack ?? 2,
      createdAt: new Date(),
    };
    await saveShadow(shadow);
    if (battleState) {
      await saveBattleState({ ...battleState, shadowId: shadow.id, status: 'idle' });
    }
    playSound('/battle-seal.mp3');
    setMode('choose');
    setManualName('');
    setError('');
    // 先显示 WARNING 动画，用户看完后统一关闭弹窗
    setWarnShadow({ name: shadow.name, level: shadow.level, weakAttribute: shadow.weakAttribute });
  };

  const handleWarnDone = () => {
    setWarnShadow(null);
    onClose();
  };

  const handleAIGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const data = await generateShadow(settings, attrNames, level, attrValues, lastWeak);
      await createShadow(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const handleManual = async () => {
    if (!manualName.trim()) return;
    const attrs = Object.keys(attrNames) as AttributeId[];
    await createShadow({
      name: manualName.trim(),
      description: `${manualName}从你内心的阴暗面诞生。`,
      invertedAttributes: Object.fromEntries(attrs.map(a => [a, `缺乏${attrNames[a]}`])) as Record<AttributeId, string>,
      responseLines: [
        '你以为这就能击败我？',
        '这点伤害不过如此。',
        '有趣，继续吧。',
        '你真的了解自己吗？',
        '我是你内心的一部分！',
        '就这点实力还妄想战胜我？',
        '你在变强……但还不够。',
        '小心……我也在变强。',
      ],
      weakAttribute: manualWeak,
    });
  };

  return (
    <>
    <ShadowWarningOverlay
      isOpen={!!warnShadow}
      shadowName={warnShadow?.name ?? ''}
      level={warnShadow?.level ?? 1}
      weakAttribute={warnShadow?.weakAttribute}
      weakAttributeName={warnShadow ? attrNames[warnShadow.weakAttribute] : undefined}
      onDone={handleWarnDone}
    />
    <AnimatePresence>
      {isOpen && !warnShadow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={e => { if (generating || warnShadow) return; if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #1a0a0a 0%, #3b0f0f 50%, #1a0a1a 100%)',
              border: '1px solid rgba(220,38,38,0.4)',
            }}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-4 text-center">👁 识破暗影</h2>

              {generating ? (
                <div className="text-center py-8">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-10 h-10 rounded-full border-2 border-red-500 border-t-transparent mx-auto mb-4"
                  />
                  <p className="text-red-300 text-sm">Shadow 正在具现化……</p>
                </div>
              ) : mode === 'choose' ? (
                <div className="space-y-4">
                  {/* Level picker */}
                  <div>
                    <p className="text-gray-300 text-xs mb-2">选择 Shadow 等级</p>
                    <div className="flex gap-2">
                      {SHADOW_LEVEL_CONFIG.map(c => {
                        const unlocked = c.level <= maxUnlockedLevel;
                        const selected = level === c.level;
                        return (
                          <button
                            key={c.level}
                            onClick={() => unlocked && setLevel(c.level)}
                            disabled={!unlocked}
                            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all relative"
                            style={{
                              background: selected ? 'rgba(220,38,38,0.5)' : unlocked ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                              color: selected ? '#fca5a5' : unlocked ? '#9ca3af' : '#4b5563',
                              border: selected ? '1px solid rgba(220,38,38,0.6)' : unlocked ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
                              cursor: unlocked ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {unlocked ? `Lv${c.level}` : '🔒'}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-gray-400 leading-relaxed">
                      <span>
                        HP: {SHADOW_LEVEL_CONFIG[level - 1].maxHp}
                        {SHADOW_LEVEL_CONFIG[level - 1].maxHp2 ? ` + ${SHADOW_LEVEL_CONFIG[level - 1].maxHp2}` : ''}
                        {' '}· 攻击: {settings.battleShadowAttack ?? 2}
                        {SHADOW_LEVEL_CONFIG[level - 1].maxHp2 ? ' +1(第二形态)' : ''}
                      </span>
                      {maxUnlockedLevel < SHADOW_LEVEL_CONFIG.length && (
                        <span className="ml-2 text-gray-500">· 击败 Lv{maxUnlockedLevel} 后解锁下一级</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleAIGenerate}
                      className="flex-1 py-3 rounded-xl text-white text-sm font-semibold"
                      style={{ background: error ? 'linear-gradient(90deg, #ef4444, #b91c1c)' : 'linear-gradient(90deg, #dc2626, #7c3aed)' }}
                    >
                      {error ? '🔄 重试识破' : '✨ 识破暗影'}
                    </button>
                    <button
                      onClick={() => setMode('manual')}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                      ✏️ 手动
                    </button>
                  </div>
                  {error && (
                    <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
                      <p className="text-red-300 text-xs leading-relaxed">{error}</p>
                      <p className="text-red-400/60 text-[10px]">请确认 API 配置可用后重试，也可选「手动」模式自行设定。</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <input
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="Shadow 名称…"
                    className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                    onKeyDown={e => e.key === 'Enter' && handleManual()}
                  />
                  {/* Weakness picker */}
                  <div>
                    <p className="text-gray-400 text-xs mb-1.5">弱点属性（受到该属性技能×1.5伤害）</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(attrNames) as AttributeId[]).map(attr => (
                        <button
                          key={attr}
                          onClick={() => setManualWeak(attr)}
                          className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: manualWeak === attr ? 'rgba(220,38,38,0.4)' : 'rgba(255,255,255,0.1)',
                            color: manualWeak === attr ? '#fca5a5' : '#9ca3af',
                            border: manualWeak === attr ? '1px solid rgba(220,38,38,0.6)' : '1px solid transparent',
                          }}
                        >
                          {attrNames[attr]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMode('choose')}
                      className="py-2 px-4 rounded-xl text-gray-300 text-sm"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      返回
                    </button>
                    <button
                      onClick={handleManual}
                      className="flex-1 py-2 rounded-xl text-white text-sm font-semibold"
                      style={{ background: 'linear-gradient(90deg, #dc2626, #7c3aed)' }}
                    >
                      识破
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
