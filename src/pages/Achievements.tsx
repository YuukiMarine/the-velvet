import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';
import { Achievement, AttributeId } from '@/types';
import { triggerNavFeedback } from '@/utils/feedback';

type ConditionType = Achievement['condition']['type'];

/* ─────────────────────────────────────────────
   Shared helpers
───────────────────────────────────────────── */

/* ─────────────────────────────────────────────
   Shared form modal (achievements)
───────────────────────────────────────────── */
const AchievementFormFields = ({
  editForm,
  setEditForm,
  isCustom,
  attributeNames,
  maxLevel,
}: {
  editForm: {
    title: string;
    description: string;
    icon: string;
    condition: {
      type: ConditionType;
      value: number;
      keywords: string[];
      attribute: AttributeId;
      currentProgress: number;
    };
  };
  setEditForm: React.Dispatch<React.SetStateAction<typeof editForm>>;
  isCustom: boolean;
  attributeNames: Record<string, string>;
  maxLevel: number;
}) => {
  const buildCondition = (type: ConditionType, current: typeof editForm.condition) => {
    if (type === 'attribute_level') return { ...current, type, attribute: current.attribute || 'knowledge', value: Math.min(current.value, maxLevel) };
    if (type === 'keyword_match') return { ...current, type, keywords: current.keywords || [] };
    return { ...current, type };
  };

  const isAttrLevel = isCustom && editForm.condition.type === 'attribute_level';

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={editForm.title}
        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
        placeholder="成就标题"
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <textarea
        value={editForm.description}
        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
        placeholder="成就描述"
        rows={3}
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <input
        type="text"
        value={editForm.icon}
        onChange={(e) => setEditForm(prev => ({ ...prev, icon: e.target.value }))}
        placeholder="图标 (emoji)"
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      {isCustom && (
        <div className="grid grid-cols-2 gap-3">
          <select
            value={editForm.condition.type}
            onChange={(e) => {
              const nextType = e.target.value as ConditionType;
              setEditForm(prev => ({ ...prev, condition: buildCondition(nextType, prev.condition) }));
            }}
            className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white"
          >
            <option value="total_points">总点数</option>
            <option value="consecutive_days">连续天数</option>
            <option value="attribute_level">属性等级</option>
            <option value="keyword_match">关键字匹配</option>
            <option value="todo_completions">完成待办次数</option>
          </select>

          {isAttrLevel ? (
            /* ── 属性等级：加减号步进器 ── */
            <div className="flex items-center gap-0 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700">
              <button
                type="button"
                onClick={() => setEditForm(prev => ({
                  ...prev,
                  condition: { ...prev.condition, value: Math.max(1, prev.condition.value - 1) }
                }))}
                disabled={editForm.condition.value <= 1}
                className="px-3 py-2 text-lg font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors select-none"
              >−</button>
              <span className="flex-1 text-center text-sm font-semibold dark:text-white tabular-nums">
                Lv.{editForm.condition.value}
              </span>
              <button
                type="button"
                onClick={() => setEditForm(prev => ({
                  ...prev,
                  condition: { ...prev.condition, value: Math.min(maxLevel, prev.condition.value + 1) }
                }))}
                disabled={editForm.condition.value >= maxLevel}
                className="px-3 py-2 text-lg font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors select-none"
              >+</button>
            </div>
          ) : (
            <input
              type="number"
              value={editForm.condition.value}
              onChange={(e) => setEditForm(prev => ({
                ...prev,
                condition: { ...prev.condition, value: parseInt(e.target.value) || 1 }
              }))}
              min="1"
              placeholder="条件值"
              className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white"
            />
          )}

          <p className="text-xs text-red-500 dark:text-red-400 col-span-2">成就条件值必须大于0</p>
        </div>
      )}

      {isCustom && editForm.condition.type === 'attribute_level' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">选择属性</label>
          <select
            value={editForm.condition.attribute}
            onChange={(e) => setEditForm(prev => ({
              ...prev, condition: { ...prev.condition, attribute: e.target.value as AttributeId }
            }))}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white"
          >
            {Object.entries(attributeNames).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {isCustom && editForm.condition.type === 'keyword_match' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">关键字（用逗号分隔）</label>
          <input
            type="text"
            value={editForm.condition.keywords?.join(', ') || ''}
            onChange={(e) => setEditForm(prev => ({
              ...prev,
              condition: {
                ...prev.condition,
                keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
              }
            }))}
            placeholder="例如：阅读,学习,看书"
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 dark:text-white"
          />
        </div>
      )}
    </div>
  );
};

/* ─────────────────────────────────────────────
   Skills sub-page (embedded)
───────────────────────────────────────────── */
const SkillsTab = () => {
  const { skills, attributes, settings, unlockSkill, updateCustomSkill, deleteCustomSkill, addCustomSkill, toggleSkillUnlock } = useAppStore();

  const savedFilter = typeof window !== 'undefined' ? window.localStorage.getItem('pg_skills_filter') : null;
  const [filterStatus, setFilterStatus] = useState<'all' | 'locked' | 'unlocked'>(
    savedFilter === 'locked' || savedFilter === 'unlocked' ? savedFilter : 'all'
  );
  const filterCycle: Array<'all' | 'locked' | 'unlocked'> = ['all', 'locked', 'unlocked'];
  const filterLabels: Record<'all' | 'locked' | 'unlocked', string> = { all: '全部', locked: '未解锁', unlocked: '已解锁' };

  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    requiredAttribute: 'knowledge' as AttributeId,
    requiredLevel: 2,
    bonusMultiplier: 1.2
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; skillId: string | null }>({ open: false, skillId: null });

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('pg_skills_filter', filterStatus);
  }, [filterStatus]);

  const generateSkillEffect = (attrId: AttributeId, multiplier: number): string => {
    const attrName = settings.attributeNames[attrId] || attrId;
    const pct = Math.round((multiplier - 1) * 100);
    return `${attrName}积累额外提升 ${pct}%`;
  };

  const isCustomSkill = (skill: typeof skills[0]) => skill.id.startsWith('custom_');
  const isBlessingSkill = (skill: typeof skills[0]) => skill.id.startsWith('blessing_');
  const canUnlock = (skill: typeof skills[0]) => {
    const attr = attributes.find(a => a.id === skill.requiredAttribute);
    return attr && attr.level >= skill.requiredLevel && !skill.unlocked;
  };

  const handleUnlock = async (skillId: string) => {
    const skill = skills.find(s => s.id === skillId);
    if (skill && canUnlock(skill)) await unlockSkill(skillId);
  };

  const handleEdit = (skill: typeof skills[0]) => {
    if (!isCustomSkill(skill) && skill.unlocked) return;
    setEditingSkill(skill.id);
    setEditForm({
      name: skill.name,
      requiredAttribute: skill.requiredAttribute,
      requiredLevel: skill.requiredLevel,
      bonusMultiplier: skill.bonusMultiplier || 1.2
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSkill) return;
    const target = skills.find(s => s.id === editingSkill);
    if (!target) return;
    const nextMultiplier = Math.min(3, Math.max(1, Number(editForm.bonusMultiplier) || 1));
    if (isCustomSkill(target) && editForm.requiredLevel <= 1) {
      setFormError('技能开启等级不能为1级，请设置2级或以上');
      return;
    }
    setFormError(null);
    const autoDesc = generateSkillEffect(editForm.requiredAttribute, nextMultiplier);
    const updates = { name: editForm.name, description: autoDesc, requiredAttribute: editForm.requiredAttribute, requiredLevel: editForm.requiredLevel, bonusMultiplier: nextMultiplier };
    if (isCustomSkill(target)) {
      await updateCustomSkill(editingSkill, updates);
    } else if (!target.unlocked) {
      await updateCustomSkill(editingSkill, { name: updates.name, description: autoDesc });
    }
    setEditingSkill(null);
  };

  const handleAddSkill = async () => {
    if (editForm.requiredLevel <= 1) {
      setFormError('技能开启等级不能为1级，请设置2级或以上');
      return;
    }
    setFormError(null);
    const nextMultiplier = Math.min(3, Math.max(1, Number(editForm.bonusMultiplier) || 1));
    const autoDesc = generateSkillEffect(editForm.requiredAttribute, nextMultiplier);
    await addCustomSkill({
      id: `custom_${Date.now()}`,
      name: editForm.name,
      description: autoDesc,
      requiredAttribute: editForm.requiredAttribute,
      requiredLevel: editForm.requiredLevel,
      bonusMultiplier: nextMultiplier
    });
    setShowAddForm(false);
    setEditForm({ name: '', requiredAttribute: 'knowledge', requiredLevel: 2, bonusMultiplier: 1.2 });
  };

  const handleDelete = (skillId: string) => {
    setConfirmDialog({ open: true, skillId });
  };

  const filteredSkills = skills.filter(skill => {
    if (filterStatus === 'locked') return !skill.unlocked;
    if (filterStatus === 'unlocked') return skill.unlocked;
    return true;
  });

  // Group by attribute
  const byAttr = filteredSkills.reduce((acc, skill) => {
    if (!acc[skill.requiredAttribute]) acc[skill.requiredAttribute] = [];
    acc[skill.requiredAttribute].push(skill);
    return acc;
  }, {} as Record<string, typeof skills>);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 justify-end">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            const nextIndex = (filterCycle.indexOf(filterStatus) + 1) % filterCycle.length;
            setFilterStatus(filterCycle[nextIndex]);
          }}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          {filterLabels[filterStatus]}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setShowAddForm(true);
            setEditForm({ name: '', requiredAttribute: 'knowledge', requiredLevel: 2, bonusMultiplier: 1.2 });
          }}
          className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium"
        >
          添加技能
        </motion.button>
      </div>

      {/* Skill groups by attribute */}
      {Object.entries(byAttr).map(([attrId, attrSkills]) => {
        const attrName = settings.attributeNames[attrId as keyof typeof settings.attributeNames] || attrId;
        return (
          <div key={attrId} className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <span className="text-base font-bold text-gray-800 dark:text-white">{attrName}</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                {attrSkills.filter(s => s.unlocked).length}/{attrSkills.length} 已解锁
              </span>
            </div>
            <div className="p-3 space-y-2">
              {attrSkills
                .sort((a, b) => a.requiredLevel - b.requiredLevel)
                .map((skill, idx) => {
                   const canUnlockSkill = canUnlock(skill);
                  const isCustom = isCustomSkill(skill);
                  const isBlessing = isBlessingSkill(skill);
                  return (
                    <motion.div
                      key={skill.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className={`rounded-xl px-4 py-3 relative flex items-start gap-3 ${
                        isBlessing
                          ? skill.unlocked
                            ? 'bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border border-amber-200/60 dark:border-amber-700/40'
                            : 'bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60'
                          : skill.unlocked
                          ? 'bg-gradient-to-r from-violet-500/10 to-pink-500/10 border border-violet-200/60 dark:border-violet-700/40'
                          : canUnlockSkill
                          ? 'bg-primary/5 border border-primary/30 dark:border-primary/20'
                          : 'bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60'
                      }`}
                    >
                      {/* Status icon */}
                      <div className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                        isBlessing
                          ? skill.unlocked ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                          : skill.unlocked ? 'bg-violet-500 text-white' : canUnlockSkill ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                      }`}>
                        {isBlessing ? (skill.unlocked ? '✦' : '✧') : skill.unlocked ? '✓' : canUnlockSkill ? '!' : `${skill.requiredLevel}`}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold text-sm ${
                            isBlessing
                              ? skill.unlocked ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'
                              : skill.unlocked ? 'text-violet-700 dark:text-violet-300' : canUnlockSkill ? 'text-primary' : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {skill.name}
                          </span>
                          {isBlessing && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full font-medium">
                              赐福
                            </span>
                          )}
                          {!isBlessing && !skill.unlocked && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                              需 Lv.{skill.requiredLevel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{skill.description}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Blessing: toggle switch + delete */}
                        {isBlessing && (
                          <>
                            <button
                              onClick={() => toggleSkillUnlock(skill.id)}
                              className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                                skill.unlocked ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                              }`}
                            >
                              <div
                                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform"
                                style={{ transform: skill.unlocked ? 'translateX(18px)' : 'translateX(2px)' }}
                              />
                            </button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => handleDelete(skill.id)}
                              className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                            >
                              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                                <path d="M5 2h6l1 1H3L5 2zm-2 2h10l-1 9H4L3 4zm3 2v6h1V6H6zm3 0v6h1V6H9z" />
                              </svg>
                            </motion.button>
                          </>
                        )}
                        {/* Normal / Custom skills */}
                        {!isBlessing && canUnlockSkill && (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleUnlock(skill.id)}
                            className="px-2.5 py-1 bg-primary text-white text-xs rounded-lg font-medium"
                          >
                            解锁
                          </motion.button>
                        )}
                        {!isBlessing && (!skill.unlocked || isCustom) && (
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleEdit(skill)}
                            className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                              <path d="M11.5 2.5a1.5 1.5 0 012.121 2.121L5.561 12.682l-2.829.707.707-2.829L11.5 2.5z" />
                            </svg>
                          </motion.button>
                        )}
                        {!isBlessing && isCustom && !skill.unlocked && (
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(skill.id)}
                            className="w-7 h-7 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                          >
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
                              <path d="M5 2h6l1 1H3L5 2zm-2 2h10l-1 9H4L3 4zm3 2v6h1V6H6zm3 0v6h1V6H9z" />
                            </svg>
                          </motion.button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          </div>
        );
      })}

      {filteredSkills.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
          暂无技能
        </div>
      )}

      {/* Add / Edit modal */}
      <AnimatePresence>
        {(showAddForm || editingSkill) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setEditingSkill(null); setShowAddForm(false); } }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-5 text-gray-900 dark:text-white">
                {editingSkill ? '编辑技能' : '添加技能'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">技能名称</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="技能名称"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">技能效果（自动生成）</label>
                  <div className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-500 dark:text-gray-400 min-h-[42px]">
                    {generateSkillEffect(editForm.requiredAttribute, Math.min(3, Math.max(1, Number(editForm.bonusMultiplier) || 1)))}
                  </div>
                </div>
                {(!editingSkill || isCustomSkill(skills.find(s => s.id === editingSkill)!)) && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">需求属性</label>
                      <select
                        value={editForm.requiredAttribute}
                        onChange={(e) => setEditForm(prev => ({ ...prev, requiredAttribute: e.target.value as AttributeId }))}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white"
                      >
                        {Object.entries(settings.attributeNames).map(([key, name]) => (
                          <option key={key} value={key}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">
                        需求等级（2–{settings.levelThresholds.length}）
                      </label>
                      <div className="flex items-center gap-0 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800">
                        <button
                          type="button"
                          onClick={() => setEditForm(prev => ({ ...prev, requiredLevel: Math.max(2, prev.requiredLevel - 1) }))}
                          disabled={editForm.requiredLevel <= 2}
                          className="px-4 py-2.5 text-lg font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors select-none"
                        >−</button>
                        <span className="flex-1 text-center text-sm font-semibold dark:text-white tabular-nums">
                          Lv.{editForm.requiredLevel}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditForm(prev => ({ ...prev, requiredLevel: Math.min(settings.levelThresholds.length, prev.requiredLevel + 1) }))}
                          disabled={editForm.requiredLevel >= settings.levelThresholds.length}
                          className="px-4 py-2.5 text-lg font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 transition-colors select-none"
                        >+</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">额外加成倍数（1.0–3.0）</label>
                      <input
                        type="number"
                        value={editForm.bonusMultiplier}
                        onChange={(e) => {
                          const next = parseFloat(e.target.value);
                          setEditForm(prev => ({ ...prev, bonusMultiplier: Number.isFinite(next) ? Math.min(3, Math.max(1, next)) : 1 }));
                        }}
                        min="1" max="3" step="0.1"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800 dark:text-white"
                      />
                    </div>
                  </>
                )}
              </div>
              {formError && (
                <div className="mt-4 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
                  {formError}
                </div>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={editingSkill ? handleSaveEdit : handleAddSkill}
                  className="flex-1 bg-primary text-white py-2.5 rounded-xl font-medium"
                >
                  {editingSkill ? '保存' : '添加'}
                </button>
                <button
                  onClick={() => { setEditingSkill(null); setShowAddForm(false); setFormError(null); }}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium"
                >
                  取消
                </button>
              </div>
              {editingSkill && skills.find(s => s.id === editingSkill)?.id.startsWith('custom_') && (
                <button
                  onClick={() => handleDelete(editingSkill)}
                  className="w-full mt-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-2.5 rounded-xl font-medium"
                >
                  删除技能
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 内置删除确认弹窗 */}
      <AnimatePresence>
        {confirmDialog.open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-xs w-full shadow-2xl"
            >
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">⚠️</div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">确认删除</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">确定要删除这个技能吗？此操作不可恢复。</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (confirmDialog.skillId) await deleteCustomSkill(confirmDialog.skillId);
                    setConfirmDialog({ open: false, skillId: null });
                    setEditingSkill(null);
                  }}
                  className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-medium"
                >
                  删除
                </button>
                <button
                  onClick={() => setConfirmDialog({ open: false, skillId: null })}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Achievements sub-page (embedded)
───────────────────────────────────────────── */
const AchievementsTab = () => {
  const {
    achievements,
    activities,
    attributes,
    settings,
    todoCompletions,
    updateCustomAchievement,
    deleteCustomAchievement,
    addCustomAchievement,
    unlockAchievement
  } = useAppStore();

  const savedFilter = typeof window !== 'undefined' ? window.localStorage.getItem('pg_achievements_filter') : null;
  const [filterStatus, setFilterStatus] = useState<'all' | 'locked' | 'unlocked'>(
    savedFilter === 'locked' || savedFilter === 'unlocked' ? savedFilter : 'all'
  );
  const filterCycle: Array<'all' | 'locked' | 'unlocked'> = ['all', 'locked', 'unlocked'];
  const filterLabels: Record<'all' | 'locked' | 'unlocked', string> = { all: '全部', locked: '未完成', unlocked: '已完成' };

  const [editingAchievement, setEditingAchievement] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const defaultEditForm = {
    title: '',
    description: '',
    icon: '',
    condition: {
      type: 'total_points' as ConditionType,
      value: 10,
      keywords: [] as string[],
      attribute: 'knowledge' as AttributeId,
      currentProgress: 0
    }
  };
  const [editForm, setEditForm] = useState(defaultEditForm);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('pg_achievements_filter', filterStatus);
  }, [filterStatus]);

  const getProgress = (achievement: typeof achievements[0]) => {
    switch (achievement.condition.type) {
      case 'consecutive_days': {
        const dates = activities.map(a => new Date(a.date).toDateString());
        const ts = [...new Set(dates)].map(d => new Date(d).getTime()).sort((a, b) => a - b);
        const ONE_DAY = 86400000;
        let max = ts.length > 0 ? 1 : 0, cur = 1;
        for (let i = 1; i < ts.length; i++) {
          if (ts[i] - ts[i - 1] === ONE_DAY) { cur++; max = Math.max(max, cur); } else cur = 1;
        }
        return Math.min(max, achievement.condition.value);
      }
      case 'total_points':
        return Math.min(attributes.reduce((sum, a) => sum + a.points, 0), achievement.condition.value);
      case 'attribute_level': {
        const attr = attributes.find(a => a.id === achievement.condition.attribute);
        return attr ? Math.min(attr.level, achievement.condition.value) : 0;
      }
      case 'keyword_match':
        return Math.min(achievement.condition.currentProgress || 0, achievement.condition.value);
      case 'all_attributes_max':
        return Math.min(attributes.filter(a => a.level >= achievement.condition.value).length, attributes.length);
      case 'todo_completions':
        return Math.min(todoCompletions.reduce((sum, item) => sum + item.count, 0), achievement.condition.value);
      default:
        return 0;
    }
  };

  const isCustomAchievement = (a: typeof achievements[0]) => a.id.startsWith('custom_');
  const isWildHeart = (a: typeof achievements[0]) => a.id === 'wild_heart';

  const handleEdit = (achievement: typeof achievements[0]) => {
    if (achievement.unlocked && !isCustomAchievement(achievement)) return;
    if (isWildHeart(achievement)) return;
    setEditingAchievement(achievement.id);
    setEditForm({
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      condition: {
        type: achievement.condition.type,
        value: achievement.condition.value,
        attribute: achievement.condition.attribute || 'knowledge',
        keywords: achievement.condition.keywords || [],
        currentProgress: achievement.condition.currentProgress || 0
      }
    });
  };

  const startPress = (achievement: typeof achievements[0]) => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    setPressedId(achievement.id);
    pressTimerRef.current = setTimeout(() => { handleEdit(achievement); setPressedId(null); }, 520);
  };
  const cancelPress = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    setPressedId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingAchievement) return;
    if (editForm.condition.value <= 0) { setFormError('成就条件值必须大于0'); return; }
    setFormError(null);
    const target = achievements.find(a => a.id === editingAchievement);
    if (!target) return;
    const updates = { title: editForm.title, description: editForm.description, icon: editForm.icon, condition: editForm.condition };
    if (isCustomAchievement(target)) {
      await updateCustomAchievement(editingAchievement, updates);
    } else {
      await updateCustomAchievement(editingAchievement, { title: updates.title, description: updates.description, icon: updates.icon });
    }
    setEditingAchievement(null);
  };

  const handleDelete = (id: string) => {
    if (!id.startsWith('custom_')) return;
    setConfirmDeleteId(id);
  };

  const handleAddAchievement = async () => {
    if (!editForm.title || !editForm.description || !editForm.icon) { setFormError('请填写完整的成就信息'); return; }
    if (editForm.condition.value <= 0) { setFormError('成就条件值必须大于0'); return; }
    setFormError(null);
    await addCustomAchievement({
      id: `custom_${Date.now()}`,
      title: editForm.title,
      description: editForm.description,
      icon: editForm.icon,
      condition: editForm.condition
    });
    setShowAddForm(false);
    setEditForm(defaultEditForm);
  };

  const filtered = achievements.filter(a => {
    if (filterStatus === 'locked') return !a.unlocked;
    if (filterStatus === 'unlocked') return a.unlocked;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 justify-end">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            const nextIndex = (filterCycle.indexOf(filterStatus) + 1) % filterCycle.length;
            setFilterStatus(filterCycle[nextIndex]);
          }}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
        >
          {filterLabels[filterStatus]}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => { setShowAddForm(true); setEditForm(defaultEditForm); }}
          className="px-4 py-1.5 bg-primary text-white rounded-lg text-sm font-medium"
        >
          添加成就
        </motion.button>
      </div>

      {/* Achievement cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((achievement) => {
          const progress = getProgress(achievement);
          const percentage = (progress / achievement.condition.value) * 100;
          const isCustom = isCustomAchievement(achievement);
          const isWild = isWildHeart(achievement);
          const canUnlock = !achievement.unlocked && percentage >= 100;

          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: pressedId === achievement.id ? 0.97 : 1 }}
              onMouseDown={() => { if (isCustom) startPress(achievement); }}
              onMouseUp={cancelPress}
              onMouseLeave={cancelPress}
              onTouchStart={() => { if (isCustom) startPress(achievement); }}
              onTouchEnd={cancelPress}
              onTouchCancel={cancelPress}
              onClick={() => { if (canUnlock) unlockAchievement(achievement.id); }}
              className={`rounded-2xl p-4 border cursor-pointer relative transition-all ${
                achievement.unlocked
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 border-transparent text-white shadow-md shadow-amber-200/50 dark:shadow-amber-900/30'
                  : canUnlock
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600'
                  : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 shadow-sm'
              }`}
            >
              {/* Edit/Delete buttons */}
              <div className="absolute top-2.5 right-2.5 flex gap-1">
                {!isWild && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); handleEdit(achievement); }}
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      achievement.unlocked ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                      <path d="M11.5 2.5a1.5 1.5 0 012.121 2.121L5.561 12.682l-2.829.707.707-2.829L11.5 2.5z" />
                    </svg>
                  </motion.button>
                )}
                {isCustom && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); handleDelete(achievement.id); }}
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      achievement.unlocked ? 'bg-white/20 text-white' : 'bg-red-50 dark:bg-red-900/20 text-red-400'
                    }`}
                  >
                    <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                      <path d="M5 2h6l1 1H3L5 2zm-2 2h10l-1 9H4L3 4zm3 2v6h1V6H6zm3 0v6h1V6H9z" />
                    </svg>
                  </motion.button>
                )}
              </div>

              <div className="text-3xl mb-2 text-center">{achievement.icon}</div>
              <h3 className={`font-bold text-base mb-1 text-center ${achievement.unlocked ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                {achievement.title}
              </h3>
              <p className={`text-xs mb-3 text-center leading-relaxed ${achievement.unlocked ? 'text-white/90' : 'text-gray-500 dark:text-gray-400'}`}>
                {achievement.description}
              </p>

              {!achievement.unlocked && (
                <>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mb-1.5 overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${canUnlock ? 'bg-amber-500' : 'bg-primary'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, percentage)}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                    />
                  </div>
                  <div className={`text-[10px] text-center ${canUnlock ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                    {canUnlock ? '已达成，点击解锁 ✨' : `${progress} / ${achievement.condition.value}`}
                  </div>
                </>
              )}

              {achievement.unlocked && achievement.unlockedDate && (
                <div className="text-[10px] text-center text-white/75 mt-1">
                  解锁于 {new Date(achievement.unlockedDate).toLocaleDateString('zh-CN')}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">暂无成就</div>
      )}

      {/* Add modal */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowAddForm(false); setFormError(null); } }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-5 text-gray-900 dark:text-white">添加自定义成就</h3>
              <AchievementFormFields
                editForm={editForm}
                setEditForm={setEditForm as any}
                isCustom={true}
                attributeNames={settings.attributeNames}
                maxLevel={settings.levelThresholds.length}
              />
              {formError && (
                <div className="mt-4 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">{formError}</div>
              )}
              <div className="flex gap-3 mt-4">
                <button onClick={handleAddAchievement} className="flex-1 bg-primary text-white py-2.5 rounded-xl font-medium">添加</button>
                <button onClick={() => { setShowAddForm(false); setEditForm(defaultEditForm); setFormError(null); }} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium">取消</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit modal */}
      <AnimatePresence>
        {editingAchievement && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setEditingAchievement(null); setFormError(null); } }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <h3 className="text-lg font-bold mb-5 text-gray-900 dark:text-white">编辑成就</h3>
              <AchievementFormFields
                editForm={editForm}
                setEditForm={setEditForm as any}
                isCustom={!!editingAchievement?.startsWith('custom_')}
                attributeNames={settings.attributeNames}
                maxLevel={settings.levelThresholds.length}
              />
              {formError && (
                <div className="mt-4 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">{formError}</div>
              )}
              <div className="flex gap-3 mt-4">
                <button onClick={handleSaveEdit} className="flex-1 bg-primary text-white py-2.5 rounded-xl font-medium">保存</button>
                <button onClick={() => { setEditingAchievement(null); setFormError(null); }} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium">取消</button>
              </div>
              {editingAchievement.startsWith('custom_') && (
                <button
                  onClick={() => handleDelete(editingAchievement)}
                  className="w-full mt-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-2.5 rounded-xl font-medium"
                >
                  删除成就
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 内置删除确认弹窗 */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-xs w-full shadow-2xl"
            >
              <div className="text-center mb-5">
                <div className="text-3xl mb-2">⚠️</div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">确认删除</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">确定要删除这个成就吗？此操作不可恢复。</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    await deleteCustomAchievement(confirmDeleteId);
                    setConfirmDeleteId(null);
                    setEditingAchievement(null);
                  }}
                  className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-medium"
                >
                  删除
                </button>
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Main page: tabs
───────────────────────────────────────────── */
export const Achievements = () => {
  const [activeTab, setActiveTab] = useState<'achievements' | 'skills'>('achievements');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
        {([
          { key: 'achievements', label: '成就' },
          { key: 'skills', label: '技能' }
        ] as const).map(tab => (
          <motion.button
            key={tab.key}
            onClick={() => { triggerNavFeedback(); setActiveTab(tab.key); }}
            className={`relative flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {activeTab === tab.key && (
              <motion.div
                layoutId="achievements-tab-indicator"
                className="absolute inset-0 bg-white dark:bg-gray-900 rounded-xl shadow-sm"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'achievements' ? <AchievementsTab /> : <SkillsTab />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};
