import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useState } from 'react';
import { AttributeId, AttributeNames } from '@/types';

// 预设选项（前两项为固定预设，第三项为自定义占位）
const PRESETS: Array<{
  label: string;
  icon: string;
  desc: string;
  names: AttributeNames;
  isCustom?: boolean;
}> = [
  {
    label: '学习成长',
    icon: '📚',
    desc: '适合注重知识积累与综合成长的你',
    names: {
      knowledge: '知识',
      guts: '胆量',
      dexterity: '灵巧',
      kindness: '温柔',
      charm: '魅力'
    }
  },
  {
    label: '冒险勇士',
    icon: '⚔️',
    desc: '适合喜欢挑战与行动导向的你',
    names: {
      knowledge: '智慧',
      guts: '勇气',
      dexterity: '敏捷',
      kindness: '仁慈',
      charm: '威望'
    }
  },
  {
    label: '自定义',
    icon: '✏️',
    desc: '自由设定五项属性的名称',
    isCustom: true,
    names: {
      knowledge: '',
      guts: '',
      dexterity: '',
      kindness: '',
      charm: ''
    }
  }
];

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const DEFAULT_ATTR_ICONS: Record<AttributeId, string> = {
  knowledge: '📖',
  guts: '💪',
  dexterity: '✨',
  kindness: '💝',
  charm: '👑'
};
const DEFAULT_ATTR_PLACEHOLDERS: Record<AttributeId, string> = {
  knowledge: '如：知识、智慧、学识…',
  guts: '如：胆量、勇气、意志…',
  dexterity: '如：灵巧、敏捷、技艺…',
  kindness: '如：温柔、仁慈、共情…',
  charm: '如：魅力、威望、气质…'
};

// ── 使用引导组件 ──────────────────────────────────────────
const GUIDE_SLIDES = [
  {
    icon: '📝',
    title: '记录事项',
    subtitle: 'Journal — 历史记录',
    color: 'from-blue-500/10 to-sky-500/5',
    accent: 'text-blue-600 dark:text-blue-300',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200',
    points: [
      { icon: '✍️', text: '点击右下角 + 按钮，用自然语言描述你做了什么' },
      { icon: '🔍', text: '点击「分析关键词」自动匹配规则加点，也可手动调整每项属性分值（0–5）' },
      { icon: '⭐', text: '标记为「重要事件」后，日历视图会用琥珀色圆点高亮显示' },
      { icon: '🗂️', text: '按年 / 月 / 日归档，支持搜索、属性筛选与日历热力图' },
    ],
  },
  {
    icon: '✅',
    title: '待办事项',
    subtitle: 'Todos — 待办',
    color: 'from-emerald-500/10 to-teal-500/5',
    accent: 'text-emerald-600 dark:text-emerald-300',
    badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200',
    points: [
      { icon: '🎯', text: '创建待办时绑定属性与奖励点数，完成即自动加点' },
      { icon: '🔁', text: '支持「每日重复」与「长期目标」两种模式，养成习惯' },
      { icon: '📊', text: '可设置目标次数，记录每日累计进度' },
      { icon: '📌', text: '标记为重要的待办完成时会在历史记录中特别标注' },
    ],
  },
  {
    icon: '🏆',
    title: '成就 & 技能',
    subtitle: 'Achievements & Skills',
    color: 'from-amber-500/10 to-yellow-500/5',
    accent: 'text-amber-600 dark:text-amber-300',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200',
    points: [
      { icon: '🌟', text: '成就在达成条件后，进入「成就」页手动点击解锁，给自己一个仪式感' },
      { icon: '⚡', text: '技能与属性等级绑定，当等级达标后可在「技能」页解锁' },
      { icon: '✨', text: '解锁技能后，对应属性的加点会获得额外百分比加成（技能Buff）' },
      { icon: '📈', text: '「统计」页查看成长曲线、属性分布与连续打卡天数' },
    ],
  },
];

interface GuideStepProps {
  name: string;
  onFinish: () => void;
  onBack: () => void;
}

const GuideStep = ({ name, onFinish, onBack }: GuideStepProps) => {
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = GUIDE_SLIDES[slideIndex];
  const isLast = slideIndex === GUIDE_SLIDES.length - 1;

  return (
    <motion.div
      key="guide"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <h2 className="text-2xl font-bold mb-1 text-gray-800 dark:text-white">
        快速上手
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
        {name}，了解三个核心系统，马上就能开始成长之旅
      </p>

      {/* 幻灯片指示器 */}
      <div className="flex items-center justify-center gap-1.5 mb-4">
        {GUIDE_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlideIndex(i)}
            className={`rounded-full transition-all duration-300 ${
              i === slideIndex
                ? 'w-6 h-2 bg-primary'
                : 'w-2 h-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          />
        ))}
      </div>

      {/* 幻灯片内容 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slideIndex}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className={`rounded-2xl bg-gradient-to-br ${slide.color} border border-black/5 dark:border-white/5 p-5 mb-5`}
        >
          {/* 标题行 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-2xl flex-shrink-0">
              {slide.icon}
            </div>
            <div>
              <div className="font-extrabold text-gray-900 dark:text-white text-base leading-tight">
                {slide.title}
              </div>
              <div className={`text-xs font-medium mt-0.5 ${slide.accent}`}>
                {slide.subtitle}
              </div>
            </div>
          </div>

          {/* 要点列表 */}
          <ul className="space-y-2.5">
            {slide.points.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-base flex-shrink-0 mt-0.5">{p.icon}</span>
                <span className="text-sm text-gray-700 dark:text-gray-200 leading-snug">{p.text}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>

      {/* 导航按钮 */}
      <div className="flex gap-3">
        <button
          onClick={slideIndex === 0 ? onBack : () => setSlideIndex(i => i - 1)}
          className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
        >
          ←
        </button>
        {!isLast ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSlideIndex(i => i + 1)}
            className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold"
          >
            下一条 →
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onFinish}
            className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold text-base"
          >
            开始旅程 🦋
          </motion.button>
        )}
      </div>
    </motion.div>
  );
};

type Step = 'welcome' | 'name' | 'preset' | 'customize' | 'done' | 'guide' | 'blessing';

export const WelcomeModal = () => {
  const { user, createUser } = useAppStore();
  const [isOpen, setIsOpen] = useState(!user);
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  // selectedPreset: 0/1 = 固定预设, 2 = 自定义
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [attrNames, setAttrNames] = useState<AttributeNames>({
    knowledge: '',
    guts: '',
    dexterity: '',
    kindness: '',
    charm: ''
  });
  const [blessingAttr, setBlessingAttr] = useState<AttributeId | null>(null);

  if (user) return null;

  const isCustomMode = selectedPreset === 2;

  const handleSelectPreset = (index: number) => {
    setSelectedPreset(index);
    if (index !== 2) {
      // 固定预设：直接写入属性名
      setAttrNames({ ...PRESETS[index].names });
    } else {
      // 自定义：清空等待用户填写（但如果已有内容保留）
      setAttrNames(prev => ({
        knowledge: prev.knowledge || '',
        guts: prev.guts || '',
        dexterity: prev.dexterity || '',
        kindness: prev.kindness || '',
        charm: prev.charm || ''
      }));
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await createUser(name.trim(), attrNames, blessingAttr ?? undefined);
    setIsOpen(false);
  };

  const canProceedName = name.trim().length > 0;
  // 自定义模式需要五项都填写；固定预设选中即可
  const canProceedPreset =
    selectedPreset !== null &&
    (!isCustomMode || ATTR_IDS.every(id => attrNames[id].trim().length > 0));

  // customize 步骤（固定预设选中后的微调页）中的判断
  const canProceedCustomize = ATTR_IDS.every(id => attrNames[id].trim().length > 0);

  const steps: Step[] = ['welcome', 'name', 'preset', 'customize', 'done', 'guide', 'blessing'];
  const stepIndex = steps.indexOf(step);

  // 从 preset 步骤点击"下一步"的逻辑
  const handlePresetNext = () => {
    if (isCustomMode) {
      // 自定义模式：直接跳到 done（已在 preset 步骤内完成编辑）
      setStep('done');
    } else {
      // 固定预设：进入 customize 微调页
      setStep('customize');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
        >
          <motion.div
            key={step}
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="bg-white dark:bg-gray-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            {/* 步骤指示器 */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s <= stepIndex ? 'bg-primary w-8' : 'bg-gray-200 dark:bg-gray-700 w-4'
                  }`}
                />
              ))}
            </div>

            <AnimatePresence mode="wait">
              {/* Step 1: Welcome */}
              {step === 'welcome' && (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="text-6xl mb-6">🦋</div>
                  <h2 className="text-3xl font-bold mb-3 text-primary">靛蓝色房间</h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-2 text-lg">欢迎来到你的成长空间</p>
                  <p className="text-gray-500 dark:text-gray-500 text-sm mb-8 leading-relaxed">
                    在这里，你可以追踪日常行为、提升属性、解锁技能与成就。<br />
                    让我们花几步时间来完成初始设定。
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setStep('name')}
                    className="w-full bg-primary text-white py-3 rounded-xl font-semibold text-lg"
                  >
                    开始设定 →
                  </motion.button>
                </motion.div>
              )}

              {/* Step 2: Name */}
              {step === 'name' && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">你叫什么名字？</h2>
                   <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">这将是你在靛蓝色房间中的称呼</p>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && canProceedName && setStep('preset')}
                    placeholder="输入你的昵称"
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl mb-6 focus:outline-none focus:border-primary dark:bg-gray-700 dark:text-white text-lg"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('welcome')}
                      className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
                    >
                      ←
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStep('preset')}
                      disabled={!canProceedName}
                      className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      下一步 →
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Preset Selection（含自定义内联编辑） */}
              {step === 'preset' && (
                <motion.div
                  key="preset"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">选择你的成长风格</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
                    这将预设你的五项属性名称，之后也可以在设置中修改
                  </p>
                  <div className="space-y-3 mb-5">
                    {PRESETS.map((preset, index) => {
                      const isSelected = selectedPreset === index;
                      const isThis = preset.isCustom;
                      return (
                        <div key={index}>
                          <motion.button
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectPreset(index)}
                            className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                              isSelected
                                ? isThis
                                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                                  : 'border-primary bg-primary/5 dark:bg-primary/10'
                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{preset.icon}</span>
                              <div className="flex-1">
                                <span className="font-bold text-gray-800 dark:text-white">{preset.label}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{preset.desc}</p>
                              </div>
                              {isSelected && (
                                <span className={`text-lg ${isThis ? 'text-violet-500' : 'text-primary'}`}>✓</span>
                              )}
                            </div>
                            {/* 固定预设：展示属性名标签 */}
                            {!isThis && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {ATTR_IDS.map(id => (
                                  <span key={id} className="text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                    {DEFAULT_ATTR_ICONS[id]} {preset.names[id]}
                                  </span>
                                ))}
                              </div>
                            )}
                          </motion.button>

                          {/* 自定义模式：选中后内联展开属性编辑 */}
                          <AnimatePresence initial={false}>
                            {isSelected && isThis && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="mt-2 p-4 rounded-2xl border-2 border-violet-200 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-900/10 space-y-2.5">
                                  <p className="text-xs text-violet-600 dark:text-violet-300 font-medium mb-3">
                                    填写你的五项属性名称
                                  </p>
                                  {ATTR_IDS.map((id) => (
                                    <div key={id} className="flex items-center gap-2">
                                      <span className="text-lg w-7 text-center flex-shrink-0">{DEFAULT_ATTR_ICONS[id]}</span>
                                      <input
                                        type="text"
                                        value={attrNames[id]}
                                        onChange={(e) => setAttrNames(prev => ({ ...prev, [id]: e.target.value }))}
                                        placeholder={DEFAULT_ATTR_PLACEHOLDERS[id]}
                                        className="flex-1 px-3 py-1.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:border-violet-400 dark:bg-gray-700 dark:text-white"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('name')}
                      className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
                    >
                      ←
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handlePresetNext}
                      disabled={!canProceedPreset}
                      className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      下一步 →
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Customize（固定预设后的微调页） */}
              {step === 'customize' && (
                <motion.div
                  key="customize"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">微调属性名称</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
                    以下是基于预设的属性名，可以自由修改。<br/>
                    初始化后也可随时在设置中调整。
                  </p>
                  <div className="space-y-3 mb-6">
                    {ATTR_IDS.map((id) => (
                      <div key={id} className="flex items-center gap-3">
                        <span className="text-xl w-8 text-center">{DEFAULT_ATTR_ICONS[id]}</span>
                        <input
                          type="text"
                          value={attrNames[id]}
                          onChange={(e) => setAttrNames(prev => ({ ...prev, [id]: e.target.value }))}
                          placeholder={`属性 ${id}`}
                          className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-primary dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('preset')}
                      className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
                    >
                      ←
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStep('done')}
                      disabled={!canProceedCustomize}
                      className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      下一步 →
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* Step 5: Done / Confirm */}
              {step === 'done' && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="text-6xl mb-4">🎊</div>
                  <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">
                    你好，{name}！
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                    你的五项属性已就绪
                  </p>
                  <div className="grid grid-cols-5 gap-2 mb-8">
                    {ATTR_IDS.map(id => (
                      <div key={id} className="flex flex-col items-center gap-1 p-2 rounded-xl bg-primary/5 dark:bg-primary/10">
                        <span className="text-xl">{DEFAULT_ATTR_ICONS[id]}</span>
                        <span className="text-xs font-medium text-primary truncate w-full text-center">{attrNames[id]}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mb-6">
                    所有技能描述、成就说明将随属性名同步更新。<br/>
                    后续可在「设置」中随时修改属性名。
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(isCustomMode ? 'preset' : 'customize')}
                      className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
                    >
                      ←
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setStep('guide')}
                      className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold text-lg"
                    >
                      下一步 →
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* Step 6: Guide — 使用引导 */}
              {step === 'guide' && (
                <GuideStep name={name} onFinish={() => setStep('blessing')} onBack={() => setStep('done')} />
              )}

              {/* Step 7: Blessing — 赐福选择 */}
              {step === 'blessing' && (
                <motion.div
                  key="blessing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="text-center mb-5">
                    <div className="text-5xl mb-3">🌟</div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                      馆长的赐福
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                      尊敬的客人，既然你踏入了靛蓝色房间，<br/>
                      说明你并非等闲之辈。
                    </p>
                    <p className="text-gray-600 dark:text-gray-300 text-sm mt-2 leading-relaxed">
                      作为初次来访的礼遇，馆长将为你的专长<br/>
                      <span className="text-primary font-bold">赐予一项永久祝福</span>
                      <span className="text-gray-400 dark:text-gray-500 text-xs ml-1">（每次加点额外 +1）</span>
                    </p>
                  </div>

                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 text-center">
                    请选择你最擅长的领域
                  </p>
                  <div className="space-y-2 mb-6">
                    {ATTR_IDS.map(id => {
                      const selected = blessingAttr === id;
                      return (
                        <motion.button
                          key={id}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setBlessingAttr(id)}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all ${
                            selected
                              ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                        >
                          <span className="text-2xl w-9 text-center flex-shrink-0">{DEFAULT_ATTR_ICONS[id]}</span>
                          <div className="flex-1 min-w-0">
                            <span className={`font-bold ${selected ? 'text-primary' : 'text-gray-800 dark:text-white'}`}>
                              {attrNames[id]}
                            </span>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              {attrNames[id]}每次加点额外 +1
                            </p>
                          </div>
                          {selected && <span className="text-primary text-lg flex-shrink-0">✓</span>}
                        </motion.button>
                      );
                    })}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('guide')}
                      className="px-5 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium"
                    >
                      ←
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSubmit}
                      disabled={!blessingAttr}
                      className="flex-1 bg-primary text-white py-3 rounded-xl font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      接受赐福，开始旅程 🦋
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
