import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useState, useRef } from 'react';
import { AttributeId, AttributeNames } from '@/types';
import { isNative } from '@/utils/native';
import { LoginModal } from '@/components/auth/LoginModal';
import { syncOnLogin } from '@/services/sync';

// ── Constants ─────────────────────────────────────────────────────────

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
    names: { knowledge: '知识', guts: '胆量', dexterity: '灵巧', kindness: '温柔', charm: '魅力' },
  },
  {
    label: '冒险勇士',
    icon: '⚔️',
    desc: '适合喜欢挑战与行动导向的你',
    names: { knowledge: '智慧', guts: '勇气', dexterity: '敏捷', kindness: '仁慈', charm: '威望' },
  },
  {
    label: '自定义',
    icon: '✏️',
    desc: '自由设定五项属性的名称',
    isCustom: true,
    names: { knowledge: '', guts: '', dexterity: '', kindness: '', charm: '' },
  },
];

const ATTR_IDS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];

const DEFAULT_ATTR_ICONS: Record<AttributeId, string> = {
  knowledge: '📖',
  guts: '💪',
  dexterity: '✨',
  kindness: '💝',
  charm: '👑',
};

const DEFAULT_ATTR_PLACEHOLDERS: Record<AttributeId, string> = {
  knowledge: '如：知识、智慧、学识…',
  guts: '如：胆量、勇气、意志…',
  dexterity: '如：灵巧、敏捷、技艺…',
  kindness: '如：温柔、仁慈、共情…',
  charm: '如：魅力、威望、气质…',
};

const GUIDE_SLIDES = [
  {
    icon: '📝',
    title: '记录事项',
    subtitle: 'Journal — 历史记录',
    gradient: 'linear-gradient(135deg, rgba(59,130,246,0.14) 0%, rgba(14,165,233,0.07) 100%)',
    border: 'rgba(59,130,246,0.22)',
    accent: '#93c5fd',
    points: [
      { icon: '✍️', text: '点击右下角 + 按钮，用自然语言描述你做了什么' },
      { icon: '🔍', text: '点击「分析关键词」自动匹配规则加点，也可手动调整每项属性分值（0–5）' },
      { icon: '📅', text: '支持补充一周以内的历史记录，选择日期后即可回填' },
      { icon: '⭐', text: '标记为「重要事件」后，日历视图会用琥珀色圆点高亮显示' },
      { icon: '📊', text: '「统计」页提供每周 / 每月 AI 总结，回顾阶段成长轨迹' },
      { icon: '🗂️', text: '按年 / 月 / 日归档，支持搜索、属性筛选与日历热力图' },
    ],
  },
  {
    icon: '✅',
    title: '任务',
    subtitle: 'Todos — 任务',
    gradient: 'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(20,184,166,0.07) 100%)',
    border: 'rgba(16,185,129,0.22)',
    accent: '#6ee7b7',
    points: [
      { icon: '🎯', text: '创建任务时绑定属性与奖励点数，完成即自动加点' },
      { icon: '🔁', text: '支持「每日重复」与「长期目标」两种模式，养成习惯' },
      { icon: '📊', text: '可设置目标次数，记录每日累计进度' },
      { icon: '📌', text: '标记为重要的任务完成时会在历史记录中特别标注' },
    ],
  },
  {
    icon: '🏆',
    title: '成就 & 技能',
    subtitle: 'Achievements & Skills',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.14) 0%, rgba(234,179,8,0.07) 100%)',
    border: 'rgba(245,158,11,0.22)',
    accent: '#fcd34d',
    points: [
      { icon: '🌟', text: '成就在达成条件后，进入「成就」页手动点击解锁，给自己一个仪式感' },
      { icon: '⚡', text: '技能与属性等级绑定，当等级达标后可在「技能」页解锁' },
      { icon: '✨', text: '解锁技能后，对应属性的加点会获得额外百分比加成（技能 Buff）' },
      { icon: '📈', text: '「统计」页查看成长曲线、属性分布与连续打卡天数' },
    ],
  },
  {
    icon: '🤝',
    title: '同伴',
    subtitle: 'Confidant — 羁绊系统',
    gradient: 'linear-gradient(135deg, rgba(236,72,153,0.14) 0%, rgba(168,85,247,0.07) 100%)',
    border: 'rgba(236,72,153,0.25)',
    accent: '#f9a8d4',
    points: [
      { icon: '🃏', text: '用 22 张大阿卡纳塔罗代表你身边的重要的人或关系，在「同伴」页创建羁绊' },
      { icon: '💬', text: '记录与同伴的互动后亲密度增长，等级提升解锁羁绊战斗道具与日常 Buff' },
      { icon: '✦', text: '每天可向同伴发起祈愿（4AM 重置），获得 SP；互相祈愿额外 +1 SP 反射' },
      { icon: '☁', text: '登录后输入对方 UserID 可邀请在线好友缔结 COOP；亲密度与历史双向同步' },
      { icon: '🌟', text: '在线同伴可在 GUEST PROFILE 中查看对方的等级、属性、总点数与已解锁数' },
    ],
  },
  {
    icon: '⚔️',
    title: '逆影战场',
    subtitle: 'Battle — 影时间',
    gradient: 'linear-gradient(135deg, rgba(124,58,237,0.14) 0%, rgba(79,70,229,0.07) 100%)',
    border: 'rgba(124,58,237,0.25)',
    accent: '#c4b5fd',
    points: [
      { icon: '🌑', text: '「影时间」降临时（默认周五至周日 20:00），暗影随机出现，等待你的挑战' },
      { icon: '🎭', text: '在 Persona 标签页召唤并命名专属人格面具，为每项属性绑定技能' },
      { icon: '⚔️', text: '选择技能发动攻击：伤害、暴击、蓄力、易伤各有战术价值' },
      { icon: '🏆', text: '击败暗影可获得大量属性点数奖励；每天仅可挑战一次' },
      { icon: '🔮', text: '暗影血量会随日期自动恢复，越拖越强——把握影时间！' },
    ],
  },
];

// Deterministic particle data (avoids Math.random in render)
const PARTICLES = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  x: `${(i * 37 + 11) % 95}%`,
  y: `${(i * 53 + 7) % 93}%`,
  size: [1, 1, 1.5, 2, 1, 1][i % 6],
  duration: 4 + (i % 6),
  delay: (i * 0.37) % 6,
  opacity: [0.08, 0.14, 0.18, 0.1, 0.16, 0.06][i % 6],
}));

// ── Aurora Background ─────────────────────────────────────────────────

const AuroraBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
    {/* Orb 1 — violet */}
    <motion.div
      animate={{ x: ['-10%', '15%', '-5%', '-10%'], y: ['-5%', '18%', '-12%', '-5%'] }}
      transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
      style={{
        position: 'absolute',
        top: '-20%',
        left: '-10%',
        width: '65%',
        height: '65%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(109,40,217,0.32) 0%, transparent 70%)',
        filter: 'blur(90px)',
      }}
    />
    {/* Orb 2 — indigo */}
    <motion.div
      animate={{ x: ['15%', '-18%', '8%', '15%'], y: ['15%', '-10%', '20%', '15%'] }}
      transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      style={{
        position: 'absolute',
        bottom: '-20%',
        right: '-10%',
        width: '60%',
        height: '60%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(67,56,202,0.38) 0%, transparent 70%)',
        filter: 'blur(90px)',
      }}
    />
    {/* Orb 3 — blue-cyan */}
    <motion.div
      animate={{ x: ['-8%', '12%', '-15%', '-8%'], y: ['8%', '-18%', '10%', '8%'] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      style={{
        position: 'absolute',
        top: '30%',
        right: '15%',
        width: '45%',
        height: '45%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.22) 0%, transparent 70%)',
        filter: 'blur(70px)',
      }}
    />
    {/* Orb 4 — rose accent (subtle) */}
    <motion.div
      animate={{ x: ['5%', '-12%', '18%', '5%'], y: ['-15%', '5%', '-8%', '-15%'] }}
      transition={{ duration: 35, repeat: Infinity, ease: 'linear' }}
      style={{
        position: 'absolute',
        top: '60%',
        left: '5%',
        width: '40%',
        height: '40%',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)',
        filter: 'blur(80px)',
      }}
    />

    {/* Floating particles */}
    {PARTICLES.map(p => (
      <motion.div
        key={p.id}
        style={{
          position: 'absolute',
          left: p.x,
          top: p.y,
          width: p.size,
          height: p.size,
          borderRadius: '50%',
          background: 'white',
          opacity: p.opacity,
        }}
        animate={{
          y: [0, -22, 0],
          opacity: [p.opacity * 0.3, p.opacity, p.opacity * 0.3],
        }}
        transition={{
          duration: p.duration,
          repeat: Infinity,
          delay: p.delay,
          ease: 'easeInOut',
        }}
      />
    ))}

    {/* Dot-grid texture */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage:
          'radial-gradient(circle, rgba(255,255,255,0.032) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
      }}
    />
  </div>
);

// ── Guide Step ────────────────────────────────────────────────────────

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
    <motion.div key="guide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h2 className="text-2xl font-bold mb-1 text-white">快速上手</h2>
      <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.38)' }}>
        {name}，了解四个核心系统，马上就能开始成长之旅
      </p>

      {/* Slide indicators */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {GUIDE_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlideIndex(i)}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === slideIndex ? 24 : 8,
              height: 8,
              background: i === slideIndex ? '#a78bfa' : 'rgba(255,255,255,0.15)',
              boxShadow: i === slideIndex ? '0 0 10px rgba(167,139,250,0.65)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Slide content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slideIndex}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="rounded-2xl p-5 mb-5"
          style={{ background: slide.gradient, border: `1px solid ${slide.border}` }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {slide.icon}
            </div>
            <div>
              <div className="font-extrabold text-white text-base leading-tight">{slide.title}</div>
              <div className="text-xs font-medium mt-0.5" style={{ color: slide.accent }}>
                {slide.subtitle}
              </div>
            </div>
          </div>
          <ul className="space-y-2.5">
            {slide.points.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-base flex-shrink-0 mt-0.5">{p.icon}</span>
                <span className="text-sm leading-snug" style={{ color: 'rgba(255,255,255,0.68)' }}>
                  {p.text}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={slideIndex === 0 ? onBack : () => setSlideIndex(i => i - 1)}
          className="px-5 py-3 rounded-xl font-medium transition-colors"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.45)',
          }}
        >
          ←
        </button>
        {!isLast ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSlideIndex(i => i + 1)}
            className="flex-1 py-3 rounded-xl font-semibold text-white"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              boxShadow: '0 4px 18px rgba(124,58,237,0.35)',
            }}
          >
            下一条 →
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onFinish}
            className="flex-1 py-3 rounded-xl font-semibold text-base text-white"
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
              boxShadow: '0 4px 18px rgba(124,58,237,0.35)',
            }}
          >
            开始旅程 🦋
          </motion.button>
        )}
      </div>
    </motion.div>
  );
};

// ── Main Component ────────────────────────────────────────────────────

type Step =
  | 'welcome'
  | 'name'
  | 'preset'
  | 'customize'
  | 'done'
  | 'guide'
  | 'blessing'
  | 'import';

const STEP_ORDER: Step[] = [
  'welcome',
  'name',
  'preset',
  'customize',
  'done',
  'guide',
  'blessing',
];

const PRIMARY_BTN_STYLE = {
  background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)',
  boxShadow: '0 4px 22px rgba(124,58,237,0.38)',
};

export const WelcomeModal = () => {
  const { user, createUser, importData } = useAppStore();
  const cloudEnabled = useCloudStore(s => s.cloudEnabled);

  const [step, setStep] = useState<Step>('welcome');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [name, setName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [attrNames, setAttrNames] = useState<AttributeNames>({
    knowledge: '',
    guts: '',
    dexterity: '',
    kindness: '',
    charm: '',
  });
  const [blessingAttr, setBlessingAttr] = useState<AttributeId | null>(null);

  // Import state
  const [importJson, setImportJson] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (user) return null;

  const isCustomMode = selectedPreset === 2;
  const stepIndex = STEP_ORDER.indexOf(step);

  const handleSelectPreset = (index: number) => {
    setSelectedPreset(index);
    if (index !== 2) {
      setAttrNames({ ...PRESETS[index].names });
    } else {
      setAttrNames(prev => ({
        knowledge: prev.knowledge || '',
        guts: prev.guts || '',
        dexterity: prev.dexterity || '',
        kindness: prev.kindness || '',
        charm: prev.charm || '',
      }));
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    await createUser(name.trim(), attrNames, blessingAttr ?? undefined);
  };

  const canProceedName = name.trim().length > 0;
  const canProceedPreset =
    selectedPreset !== null &&
    (!isCustomMode || ATTR_IDS.every(id => attrNames[id].trim().length > 0));
  const canProceedCustomize = ATTR_IDS.every(id => attrNames[id].trim().length > 0);

  const handlePresetNext = () => {
    if (isCustomMode) setStep('done');
    else setStep('customize');
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setImportError('请选择 JSON 格式的备份文件');
      return;
    }
    setImportError(null);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      if (text) setImportJson(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = async () => {
    if (!importJson.trim()) return;
    setImportLoading(true);
    setImportError(null);
    try {
      await importData(importJson);
      // On success, user is set in store → component unmounts automatically
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '导入失败，请检查备份文件格式');
      setImportLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: '#06061a' }}
    >
      <AuroraBackground />

      {/* Scrollable container */}
      <div className="relative z-10 w-full max-w-md mx-4 max-h-[92vh] overflow-y-auto">
        {/* Glass card */}
        <div
          className="rounded-3xl p-8"
          style={{
            background: 'rgba(10, 6, 38, 0.80)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow:
              '0 0 80px rgba(109,40,217,0.18), 0 25px 60px rgba(0,0,0,0.75)',
          }}
        >
          {/* Progress indicator (hidden on import step) */}
          {step !== 'import' && (
            <div className="flex items-center justify-center gap-2 mb-8">
              {[1, 2, 3, 4, 5].map(s => (
                <div
                  key={s}
                  className="h-1 rounded-full transition-all duration-500"
                  style={{
                    width: s <= stepIndex ? 32 : 12,
                    background:
                      s <= stepIndex ? '#a78bfa' : 'rgba(255,255,255,0.1)',
                    boxShadow:
                      s <= stepIndex
                        ? '0 0 8px rgba(167,139,250,0.55)'
                        : 'none',
                  }}
                />
              ))}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ── Welcome ── */}
            {step === 'welcome' && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="text-center"
              >
                {/* Animated butterfly */}
                <motion.div
                  animate={{ scale: [1, 1.1, 1], rotate: [0, 4, -4, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-7xl mb-6 select-none"
                  style={{ filter: 'drop-shadow(0 0 24px rgba(167,139,250,0.5))' }}
                >
                  🦋
                </motion.div>

                {/* Eyebrow label */}
                <p
                  className="text-[10px] font-semibold tracking-[0.28em] uppercase mb-2"
                  style={{ color: '#a78bfa' }}
                >
                  Persona Growth Tracker
                </p>

                {/* Title */}
                <h1
                  className="text-4xl font-black mb-2 text-white"
                  style={{ textShadow: '0 0 48px rgba(167,139,250,0.45)' }}
                >
                  靛蓝色房间
                </h1>

                {/* Divider line */}
                <div
                  className="w-20 h-px mx-auto mb-5 rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, transparent, rgba(167,139,250,0.7), transparent)',
                  }}
                />

                <p className="text-base mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  欢迎来到你的成长空间
                </p>
                <p
                  className="text-sm mb-10 leading-relaxed"
                  style={{ color: 'rgba(255,255,255,0.28)' }}
                >
                  在这里，每一次行动都将化作<br />灵魂成长的印记。
                </p>

                {/* CTA */}
                <motion.button
                  whileHover={{
                    scale: 1.02,
                    boxShadow: '0 8px 32px rgba(124,58,237,0.55)',
                  }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setStep('name')}
                  className="w-full py-3.5 rounded-xl font-semibold text-lg text-white mb-5 transition-shadow"
                  style={PRIMARY_BTN_STYLE}
                >
                  开始设定 →
                </motion.button>

                {/* Guest entry — 进入数据管理（云登录 + 本地备份导入合并一屏） */}
                <button
                  onClick={() => setStep('import')}
                  className="text-xs transition-colors"
                  style={{ color: 'rgba(255,255,255,0.22)' }}
                  onMouseEnter={e =>
                    ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)')
                  }
                  onMouseLeave={e =>
                    ((e.target as HTMLElement).style.color = 'rgba(255,255,255,0.22)')
                  }
                >
                  我已经是客人了
                </button>
              </motion.div>
            )}

            {/* ── Import ── */}
            {step === 'import' && (
              <motion.div
                key="import"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.3 }}
              >
                {/* 云端登录入口（醒目，放在最上方） */}
                {cloudEnabled && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="mb-6"
                  >
                    <motion.button
                      whileHover={{
                        scale: 1.02,
                        boxShadow: '0 10px 40px rgba(124,58,237,0.5)',
                      }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowLoginModal(true)}
                      className="w-full p-4 rounded-2xl text-left transition-shadow relative overflow-hidden"
                      style={{
                        background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)',
                        boxShadow: '0 6px 24px rgba(124,58,237,0.4)',
                        color: '#fff',
                      }}
                    >
                      {/* 装饰光晕 */}
                      <div
                        className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none"
                        style={{
                          background:
                            'radial-gradient(circle, rgba(255,255,255,0.25), transparent 70%)',
                        }}
                      />
                      <div className="flex items-center gap-3 relative">
                        <div className="text-3xl">☁️</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-base mb-0.5">登录云端同步</div>
                          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.78)' }}>
                            邮箱验证码登录，自动拉取你的所有数据
                          </div>
                        </div>
                        <div className="text-xl opacity-70">→</div>
                      </div>
                    </motion.button>
                  </motion.div>
                )}

                {/* 分隔：本地备份导入区 */}
                <div className="text-center mb-6">
                  {cloudEnabled && (
                    <div className="flex items-center gap-3 mb-5">
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                      <span className="text-[10px] tracking-[0.3em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        OR
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                  )}
                  <motion.div
                    animate={{ rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-4xl mb-2"
                  >
                    🗝️
                  </motion.div>
                  <h2 className="text-lg font-bold text-white mb-1">从本地备份导入</h2>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    粘贴备份内容或选择备份文件
                  </p>
                </div>

                {/* Textarea */}
                <textarea
                  rows={4}
                  placeholder={'粘贴备份 JSON 文本\n（以 {"user":... 开头）'}
                  value={importJson}
                  onChange={e => {
                    setImportJson(e.target.value);
                    setImportError(null);
                  }}
                  className="w-full px-3 py-2.5 text-xs rounded-xl resize-none focus:outline-none font-mono mb-3 text-white/80 placeholder-white/20 bg-white/[0.04] border border-white/10 focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/20 transition-colors"
                />

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                    e.target.value = '';
                  }}
                />

                {/* File select area */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3.5 rounded-xl text-sm mb-3 transition-colors"
                  style={{
                    border: '1px dashed rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.02)',
                    color: importJson
                      ? '#34d399'
                      : 'rgba(255,255,255,0.38)',
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                >
                  {importJson ? (
                    <span className="font-medium">✓ 文件已加载</span>
                  ) : isNative() ? (
                    <span>📁 从文件管理器选择备份文件</span>
                  ) : (
                    <span>
                      📁 选择备份文件{' '}
                      <span style={{ opacity: 0.5 }}>或拖拽至此</span>
                    </span>
                  )}
                </motion.button>

                {/* Error message */}
                {importError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs mb-3 text-center"
                  >
                    {importError}
                  </motion.p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStep('welcome');
                      setImportJson('');
                      setImportError(null);
                    }}
                    className="px-5 py-3 rounded-xl font-medium transition-colors"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    ←
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleImport}
                    disabled={!importJson.trim() || importLoading}
                    className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={PRIMARY_BTN_STYLE}
                  >
                    {importLoading ? '正在导入…' : '确认导入'}
                  </motion.button>
                </div>

                <p
                  className="text-xs mt-3 text-center"
                  style={{ color: 'rgba(255,255,255,0.18)' }}
                >
                  导入会覆盖当前所有数据
                </p>
              </motion.div>
            )}

            {/* ── Name ── */}
            {step === 'name' && (
              <motion.div
                key="name"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="text-2xl font-bold mb-2 text-white">你叫什么名字？</h2>
                <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  这将是你在靛蓝色房间中的称呼
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e =>
                    e.key === 'Enter' && canProceedName && setStep('preset')
                  }
                  placeholder="输入你的昵称"
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-violet-400/25 focus:border-violet-400/50 border border-white/10 bg-white/[0.05] text-lg mb-1 transition-all"
                  autoFocus
                />
                <p
                  className="text-xs mb-6"
                  style={{ color: 'rgba(255,255,255,0.15)' }}
                >
                  可以是你的名字、代号或任何你喜欢的称呼
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('welcome')}
                    className="px-5 py-3 rounded-xl font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    ←
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep('preset')}
                    disabled={!canProceedName}
                    className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={PRIMARY_BTN_STYLE}
                  >
                    下一步 →
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Preset ── */}
            {step === 'preset' && (
              <motion.div
                key="preset"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="text-2xl font-bold mb-2 text-white">选择你的成长风格</h2>
                <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>
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
                          className="w-full p-4 rounded-2xl text-left transition-all"
                          style={{
                            background: isSelected
                              ? isThis
                                ? 'rgba(124,58,237,0.13)'
                                : 'rgba(109,40,217,0.12)'
                              : 'rgba(255,255,255,0.03)',
                            border: isSelected
                              ? isThis
                                ? '2px solid rgba(124,58,237,0.5)'
                                : '2px solid rgba(109,40,217,0.45)'
                              : '2px solid rgba(255,255,255,0.07)',
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{preset.icon}</span>
                            <div className="flex-1">
                              <span className="font-bold text-white">{preset.label}</span>
                              <p
                                className="text-xs mt-0.5"
                                style={{ color: 'rgba(255,255,255,0.35)' }}
                              >
                                {preset.desc}
                              </p>
                            </div>
                            {isSelected && (
                              <span style={{ color: '#a78bfa' }} className="text-lg">
                                ✓
                              </span>
                            )}
                          </div>
                          {!isThis && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {ATTR_IDS.map(id => (
                                <span
                                  key={id}
                                  className="text-xs px-2 py-1 rounded-full"
                                  style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(255,255,255,0.09)',
                                    color: 'rgba(255,255,255,0.45)',
                                  }}
                                >
                                  {DEFAULT_ATTR_ICONS[id]} {preset.names[id]}
                                </span>
                              ))}
                            </div>
                          )}
                        </motion.button>

                        {/* Custom inline editor */}
                        <AnimatePresence initial={false}>
                          {isSelected && isThis && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div
                                className="mt-2 p-4 rounded-2xl space-y-2.5"
                                style={{
                                  background: 'rgba(124,58,237,0.07)',
                                  border: '1px solid rgba(124,58,237,0.22)',
                                }}
                              >
                                <p
                                  className="text-xs font-medium mb-3"
                                  style={{ color: '#c4b5fd' }}
                                >
                                  填写你的五项属性名称
                                </p>
                                {ATTR_IDS.map(id => (
                                  <div key={id} className="flex items-center gap-2">
                                    <span className="text-lg w-7 text-center flex-shrink-0">
                                      {DEFAULT_ATTR_ICONS[id]}
                                    </span>
                                    <input
                                      type="text"
                                      value={attrNames[id]}
                                      onChange={e =>
                                        setAttrNames(prev => ({
                                          ...prev,
                                          [id]: e.target.value,
                                        }))
                                      }
                                      placeholder={DEFAULT_ATTR_PLACEHOLDERS[id]}
                                      className="flex-1 px-3 py-1.5 rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition-colors"
                                      style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                      }}
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
                    className="px-5 py-3 rounded-xl font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    ←
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePresetNext}
                    disabled={!canProceedPreset}
                    className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={PRIMARY_BTN_STYLE}
                  >
                    下一步 →
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Customize ── */}
            {step === 'customize' && (
              <motion.div
                key="customize"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h2 className="text-2xl font-bold mb-2 text-white">微调属性名称</h2>
                <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  以下是基于预设的属性名，可以自由修改。
                  <br />
                  初始化后也可随时在设置中调整。
                </p>
                <div className="space-y-3 mb-6">
                  {ATTR_IDS.map(id => (
                    <div key={id} className="flex items-center gap-3">
                      <span className="text-xl w-8 text-center">{DEFAULT_ATTR_ICONS[id]}</span>
                      <input
                        type="text"
                        value={attrNames[id]}
                        onChange={e =>
                          setAttrNames(prev => ({ ...prev, [id]: e.target.value }))
                        }
                        placeholder={`属性 ${id}`}
                        className="flex-1 px-3 py-2 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-1 focus:ring-violet-400/30 transition-colors"
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('preset')}
                    className="px-5 py-3 rounded-xl font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    ←
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep('done')}
                    disabled={!canProceedCustomize}
                    className="flex-1 py-3 rounded-xl font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={PRIMARY_BTN_STYLE}
                  >
                    下一步 →
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Done / Confirm ── */}
            {step === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 180, damping: 14 }}
                  className="text-6xl mb-4"
                >
                  🎊
                </motion.div>
                <h2 className="text-2xl font-bold mb-2 text-white">你好，{name}！</h2>
                <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  你的五项属性已就绪
                </p>
                <div className="grid grid-cols-5 gap-2 mb-8">
                  {ATTR_IDS.map((id, i) => (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex flex-col items-center gap-1 p-2 rounded-xl"
                      style={{
                        background: 'rgba(167,139,250,0.09)',
                        border: '1px solid rgba(167,139,250,0.18)',
                      }}
                    >
                      <span className="text-xl">{DEFAULT_ATTR_ICONS[id]}</span>
                      <span
                        className="text-xs font-medium truncate w-full text-center"
                        style={{ color: '#c4b5fd' }}
                      >
                        {attrNames[id]}
                      </span>
                    </motion.div>
                  ))}
                </div>
                <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  所有技能描述、成就说明将随属性名同步更新。
                  <br />
                  后续可在「设置」中随时修改属性名。
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(isCustomMode ? 'preset' : 'customize')}
                    className="px-5 py-3 rounded-xl font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    ←
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep('guide')}
                    className="flex-1 py-3 rounded-xl font-semibold text-lg text-white"
                    style={PRIMARY_BTN_STYLE}
                  >
                    下一步 →
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── Guide ── */}
            {step === 'guide' && (
              <GuideStep
                name={name}
                onFinish={() => setStep('blessing')}
                onBack={() => setStep('done')}
              />
            )}

            {/* ── Blessing ── */}
            {step === 'blessing' && (
              <motion.div
                key="blessing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="text-center mb-5">
                  <motion.div
                    animate={{ rotate: [0, 6, -6, 0], scale: [1, 1.08, 1] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-5xl mb-3"
                    style={{ filter: 'drop-shadow(0 0 16px rgba(250,204,21,0.5))' }}
                  >
                    🌟
                  </motion.div>
                  <h2 className="text-2xl font-bold text-white mb-2">馆长的赐福</h2>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    尊敬的客人，既然你踏入了靛蓝色房间，
                    <br />
                    说明你并非等闲之辈。
                  </p>
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    作为初次来访的礼遇，馆长将为你的专长
                    <br />
                    <span className="font-bold" style={{ color: '#c4b5fd' }}>
                      赐予一项永久祝福
                    </span>
                    <span className="text-xs ml-1" style={{ color: 'rgba(255,255,255,0.22)' }}>
                      （每次加点额外 +1）
                    </span>
                  </p>
                </div>

                <p className="text-xs mb-3 text-center" style={{ color: 'rgba(255,255,255,0.25)' }}>
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
                        className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
                        style={{
                          background: selected
                            ? 'rgba(167,139,250,0.12)'
                            : 'rgba(255,255,255,0.03)',
                          border: selected
                            ? '2px solid rgba(167,139,250,0.45)'
                            : '2px solid rgba(255,255,255,0.07)',
                          boxShadow: selected
                            ? '0 0 16px rgba(167,139,250,0.18)'
                            : 'none',
                        }}
                      >
                        <span className="text-2xl w-9 text-center flex-shrink-0">
                          {DEFAULT_ATTR_ICONS[id]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span
                            className="font-bold"
                            style={{ color: selected ? '#c4b5fd' : 'rgba(255,255,255,0.8)' }}
                          >
                            {attrNames[id]}
                          </span>
                          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                            {attrNames[id]}每次加点额外 +1
                          </p>
                        </div>
                        {selected && (
                          <span className="text-lg flex-shrink-0" style={{ color: '#a78bfa' }}>
                            ✓
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('guide')}
                    className="px-5 py-3 rounded-xl font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    ←
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmit}
                    disabled={!blessingAttr}
                    className="flex-1 py-3 rounded-xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={PRIMARY_BTN_STYLE}
                  >
                    接受赐福，开始旅程 🦋
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 云端登录弹窗 —— 首屏"我已经是客人了"入口 */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        origin="welcome"
        onSuccess={async () => {
          try {
            const result = await syncOnLogin();
            if (result === 'conflict') {
              useCloudStore.getState().setConflictPending(true);
            }
          } catch {
            /* 错误已由 sync 内部记录到 cloudStore.lastError */
          }
        }}
      />
    </div>
  );
};
