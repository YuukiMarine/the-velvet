import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { AttributeId } from '@/types';
import { reshuffleAttributePersonaAI, generateSkillsForManualPersona, generateAISkillsForPersona } from '@/utils/battleAI';
import { triggerLightHaptic, playSound } from '@/utils/feedback';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

export function PersonaShuffleModal({ isOpen, onClose }: Props) {
  const { persona, settings, savePersona } = useAppStore();
  const [selectedAttr, setSelectedAttr] = useState<AttributeId | null>(null);
  const [mode, setMode] = useState<'choose' | 'manual' | 'generating' | 'done'>('choose');
  const [manualName, setManualName] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [useAISkills, setUseAISkills] = useState(true);
  const [error, setError] = useState('');
  const [resultName, setResultName] = useState('');

  const attrNamesMap = settings.attributeNames as Record<AttributeId, string>;

  const reset = () => {
    setSelectedAttr(null);
    setMode('choose');
    setManualName('');
    setManualDesc('');
    setUseAISkills(true);
    setError('');
    setResultName('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAIReshuffle = async () => {
    if (!selectedAttr || !persona) return;
    setMode('generating');
    setError('');
    try {
      const current = persona.attributePersonas?.[selectedAttr];
      const result = await reshuffleAttributePersonaAI(
        settings,
        selectedAttr,
        attrNamesMap[selectedAttr],
        current?.name ?? '',
      );
      if (!result) {
        setError('AI 不可用，请尝试手动输入');
        setMode('choose');
        return;
      }
      const newAttrPersonas = { ...persona.attributePersonas, [selectedAttr]: { name: result.name, description: result.description } } as Record<AttributeId, { name: string; description: string }>;
      const newSkills = { ...persona.skills, [selectedAttr]: result.skills };
      await savePersona({ ...persona, attributePersonas: newAttrPersonas, skills: newSkills });
      setResultName(result.name);
      triggerLightHaptic();
      playSound('/battle-evoker-summon.mp3');
      setMode('done');
    } catch {
      setError('洗牌失败，请重试');
      setMode('choose');
    }
  };

  const handleManualSave = async () => {
    if (!selectedAttr || !persona || !manualName.trim()) return;
    const name = manualName.trim().slice(0, 15);
    const desc = manualDesc.trim() || `${name}，${attrNamesMap[selectedAttr]}的化身`;

    let skills;
    if (useAISkills) {
      setMode('generating');
      setError('');
      const aiSkills = await generateAISkillsForPersona(settings, name, attrNamesMap[selectedAttr]);
      if (aiSkills) {
        skills = aiSkills;
      } else {
        // AI failed, fall back to default
        skills = generateSkillsForManualPersona(name, attrNamesMap[selectedAttr]);
      }
    } else {
      skills = generateSkillsForManualPersona(name, attrNamesMap[selectedAttr]);
    }

    const newAttrPersonas = { ...persona.attributePersonas, [selectedAttr]: { name, description: desc } } as Record<AttributeId, { name: string; description: string }>;
    const newSkills = { ...persona.skills, [selectedAttr]: skills };
    await savePersona({ ...persona, attributePersonas: newAttrPersonas, skills: newSkills });
    setResultName(name);
    triggerLightHaptic();
    playSound('/battle-evoker-summon.mp3');
    setMode('done');
  };

  if (!isOpen || !persona) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.85)' }}
        onClick={(e) => e.target === e.currentTarget && handleClose()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="w-full max-w-md rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 100%)',
            border: '1px solid rgba(139,92,246,0.4)',
            maxHeight: '85vh',
            overflowY: 'auto',
          }}
        >
          <div className="p-6">
            <h2 className="text-white text-lg font-black text-center mb-1">Persona 洗牌</h2>
            <p className="text-purple-300/60 text-xs text-center mb-5">选择要重置的属性Persona</p>

            {error && (
              <p className="text-red-400 text-xs text-center mb-3 px-2">{error}</p>
            )}

            {/* Step 1: Select attribute */}
            {!selectedAttr && (
              <div className="space-y-2">
                {ATTR_IDS.map(attr => {
                  const ap = persona.attributePersonas?.[attr];
                  return (
                    <button
                      key={attr}
                      onClick={() => { setSelectedAttr(attr); setMode('choose'); }}
                      className="w-full text-left rounded-xl px-4 py-3 transition-all"
                      style={{
                        background: 'rgba(139,92,246,0.08)',
                        border: '1px solid rgba(139,92,246,0.2)',
                      }}
                    >
                      <p className="text-[10px] font-bold tracking-widest uppercase text-purple-400/60">
                        {attrNamesMap[attr]}
                      </p>
                      <p className="text-white text-sm font-bold mt-0.5">{ap?.name ?? '未设定'}</p>
                      {ap?.description && (
                        <p className="text-gray-400 text-xs mt-0.5 truncate">{ap.description}</p>
                      )}
                    </button>
                  );
                })}
                <button
                  onClick={handleClose}
                  className="w-full mt-3 py-2.5 rounded-xl text-sm text-gray-400"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  取消
                </button>
              </div>
            )}

            {/* Step 2: Choose mode */}
            {selectedAttr && mode === 'choose' && (
              <div className="space-y-3">
                <div className="text-center mb-2">
                  <p className="text-purple-300 text-sm">
                    重置 <span className="font-bold text-white">{attrNamesMap[selectedAttr]}</span> 属性的Persona
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    当前：{persona.attributePersonas?.[selectedAttr]?.name ?? '未设定'}
                  </p>
                </div>
                <button
                  onClick={handleAIReshuffle}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: 'linear-gradient(90deg, #7c3aed, #6d28d9)', border: '1px solid rgba(139,92,246,0.5)' }}
                >
                  AI 重新匹配
                  <span className="block text-[10px] text-purple-200/60 font-normal mt-0.5">由AI根据文化多样性随机匹配新人物</span>
                </button>
                <button
                  onClick={() => setMode('manual')}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-gray-200 transition-all"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  手动输入
                  <span className="block text-[10px] text-gray-400 font-normal mt-0.5">自定义人物名称与描述，自动生成技能</span>
                </button>
                <button
                  onClick={() => { setSelectedAttr(null); setError(''); }}
                  className="w-full py-2 text-sm text-gray-500"
                >
                  返回
                </button>
              </div>
            )}

            {/* Manual input */}
            {selectedAttr && mode === 'manual' && (
              <div className="space-y-4">
                <p className="text-purple-300 text-sm text-center">
                  手动设定 <span className="font-bold text-white">{attrNamesMap[selectedAttr]}</span> Persona
                </p>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">人物名称</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={e => setManualName(e.target.value)}
                    placeholder="如：诸葛亮、雅典娜、福尔摩斯……"
                    maxLength={15}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(139,92,246,0.3)' }}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">描述（可选）</label>
                  <input
                    type="text"
                    value={manualDesc}
                    onChange={e => setManualDesc(e.target.value)}
                    placeholder="一句话说明该人物与此属性的契合点"
                    maxLength={50}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(139,92,246,0.3)' }}
                  />
                </div>
                {/* AI skill generation toggle */}
                <button
                  onClick={() => setUseAISkills(v => !v)}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
                  style={{
                    background: useAISkills ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)',
                    border: useAISkills ? '1px solid rgba(139,92,246,0.35)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div
                    className="relative w-9 h-5 rounded-full flex-shrink-0 transition-colors"
                    style={{ background: useAISkills ? '#7c3aed' : 'rgba(255,255,255,0.15)' }}
                  >
                    <div
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                      style={{ left: useAISkills ? 18 : 2 }}
                    />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-white">AI 生成技能</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {useAISkills ? '根据人物特质定制专属技能名称' : '使用通用默认技能组'}
                    </p>
                  </div>
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setMode('choose')}
                    className="flex-1 py-2.5 rounded-xl text-sm text-gray-400"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    返回
                  </button>
                  <button
                    onClick={handleManualSave}
                    disabled={!manualName.trim()}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(90deg, #7c3aed, #6d28d9)' }}
                  >
                    确认
                  </button>
                </div>
              </div>
            )}

            {/* Generating */}
            {mode === 'generating' && (
              <div className="text-center py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent mx-auto mb-4"
                />
                <p className="text-purple-300 text-sm">正在匹配新的Persona……</p>
                <p className="text-white/20 text-xs mt-2">请稍等片刻</p>
              </div>
            )}

            {/* Done */}
            {mode === 'done' && selectedAttr && (
              <div className="text-center py-6 space-y-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.3, 1] }}
                  transition={{ duration: 0.5 }}
                  className="text-4xl"
                >
                  ✦
                </motion.div>
                <p className="text-white font-bold text-lg">{resultName}</p>
                <p className="text-purple-300/60 text-xs">
                  已成为新的{attrNamesMap[selectedAttr]}Persona
                </p>
                <button
                  onClick={handleClose}
                  className="mt-2 px-8 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(90deg, #7c3aed, #6d28d9)' }}
                >
                  完成
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
