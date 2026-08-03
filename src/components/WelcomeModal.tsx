import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { useCloudStore } from '@/store/cloud';
import { useState, useRef } from 'react';
import { AttributeId, AttributeNames } from '@/types';
import { isNative } from '@/utils/native';
import { prefersReducedMotion } from '@/utils/boldness';
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

/**
 * 快速上手的七张卡（2026-08-03 按用户口径重排）。
 *
 * 改动口径：
 *   · 新增「记账」与「助手」两张 —— 上一版只讲到战场就停了，而这两块现在是日常主力；
 *   · 「愿望」不单开一张，并进任务里一句带过（用户口径）；
 *   · 爬塔并入「逆影战场」—— 它不是另一个玩法，是战场里往上走的那条线；
 *   · 全文不再出现「黑猫」：那是开发期的临时代号，对外一律叫「助手」
 *     （内置人格里那只叫「黑猫」的角色是另一回事，那是它的名字，保留）。
 */
const GUIDE_SLIDES = [
  {
    icon: '✍',
    title: '记录',
    subtitle: 'JOURNAL',
    accent: '#7dd3fc',
    points: [
      '在「行动」页写下你做了什么，用大白话就行',
      '点「分析关键词」自动配点，也可以自己调每项属性（0–5）',
      '忘了记也没关系——一周内的事都能补，选个日期就行',
      '标成「重要事件」的，日历上会用琥珀色圆点亮出来',
      '「统计」页有每周 / 每月的 AI 总结，替你回头看一眼',
    ],
  },
  {
    icon: '⚡',
    title: '任务',
    subtitle: 'TASKS',
    accent: '#6ee7b7',
    points: [
      '建任务时绑定属性与点数，完成就自动加点',
      '「每日重复」用来养习惯，「长期目标」记累计次数',
      '大事可以拆成子步，一步步勾掉，收官时有一次结算',
      '还没想清楚的事先写成「愿望」，想动手了再转成任务',
    ],
  },
  {
    icon: '★',
    title: '成就与技能',
    subtitle: 'GROWTH',
    accent: '#fcd34d',
    points: [
      '成就达成后要你自己去点亮 —— 那一下是留给你的仪式',
      '技能跟属性等级绑定，够级了在「技能」页解锁',
      '解锁之后，对应属性的每次加点都会多拿一点',
      '「统计」页看成长曲线、属性分布和连续天数',
    ],
  },
  {
    icon: '🃏',
    title: '同伴',
    subtitle: 'CONFIDANT',
    accent: '#f9a8d4',
    points: [
      '用 22 张大阿卡纳代表你身边重要的人或关系',
      '记录互动会涨亲密度，等级上去解锁道具与日常加成',
      '每天可以向同伴祈愿（凌晨 4 点重置），互相祈愿双方都多拿',
      '登录后输入对方 UserID 就能缔结 COOP，亲密度与历史双向同步',
    ],
  },
  {
    icon: '¥',
    title: '记账',
    subtitle: 'LEDGER',
    accent: '#fdba74',
    points: [
      '一句话记一笔，AI 替你认出金额和类目',
      '首页看总余额与本月预算环，还有「今天还可以花多少」',
      '「成长」类的支出会回过来给属性加点 —— 花在自己身上的不算白花',
      '可以给一笔标「值 / 不值」，月底回头看的时候最有用',
    ],
  },
  {
    icon: '⚔',
    title: '逆影战场',
    subtitle: 'BATTLE',
    accent: '#c4b5fd',
    points: [
      '「影时间」降临时（默认周五至周日 20:00），暗影出现',
      '先召唤属于你的 Persona，为五项属性各绑一套技能',
      '出招看局势：伤害、暴击、蓄力、易伤各有各的用处',
      '打赢有大量属性点；拖着不打，暗影会自己回血',
      '想再往深处走，就顺着高塔一层层往上爬，越高奖励越重',
    ],
  },
  {
    icon: '◈',
    title: '助手',
    subtitle: 'NAVIGATOR',
    accent: '#a5b4fc',
    points: [
      '底部中央的 ◈ 随时叫出来，说人话就能记账、加任务、写记录',
      '它记得你手头在做的事，会在合适的时候提一句',
      '人格可以换，也可以自己捏一个',
      '聊天原文只存在你的设备上，永远不上传',
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

/**
 * 快速上手（2026-08-03 重做）。
 *
 * 上一版是「圆角卡 + 渐变底 + emoji 项目符号 + 左右淡入淡出」——一套 2020 年的
 * bootstrap 观感，跟 App 里已经成型的三套频道语言完全不搭，用户口径「动效过时」。
 *
 * 这版的做法：
 *   · 左侧一条**进度轨**，走到第几张就点亮到第几段——七张卡不能再用小圆点，数不过来；
 *   · 巨大的幽灵序号压在背景上，序号本身就是"你走到哪了"的读数；
 *   · 图标改成单字符徽章（不再是彩色 emoji 拼盘），颜色由当张卡的 accent 决定；
 *   · 条目逐条错峰揭入（不是整块淡入），读起来有节奏；
 *   · **可以左右滑**——七张卡全靠点按钮翻太累；
 *   · 全程只动 transform / opacity；reduced-motion 下直接落终态。
 */
const GuideStep = ({ name, onFinish, onBack }: GuideStepProps) => {
  const [slideIndex, setSlideIndex] = useState(0);
  // dir 只用来决定进出场从哪一侧走，不参与布局
  const [dir, setDir] = useState(1);
  const slide = GUIDE_SLIDES[slideIndex];
  const total = GUIDE_SLIDES.length;
  const isLast = slideIndex === total - 1;
  const reduce = prefersReducedMotion();

  const go = (next: number) => {
    if (next < 0 || next >= total) return;
    setDir(next > slideIndex ? 1 : -1);
    setSlideIndex(next);
  };

  return (
    <motion.div key="guide" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.28em] uppercase mb-1" style={{ color: slide.accent }}>
            GUIDE
          </p>
          <h2 className="text-2xl font-bold text-white leading-none">快速上手</h2>
          <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {name}，七件事，看完就能开始
          </p>
        </div>
        <button
          onClick={onFinish}
          className="text-xs pb-1 transition-colors"
          style={{ color: 'rgba(255,255,255,0.28)' }}
        >
          直接开始 →
        </button>
      </div>

      <div className="flex gap-3.5">
        {/* 进度轨：七段，走到哪亮到哪；每段都可点，回看不用一路倒退 */}
        <div className="flex flex-col gap-1.5 pt-1 flex-shrink-0">
          {GUIDE_SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`第 ${i + 1} 条：${s.title}`}
              aria-current={i === slideIndex}
              className="rounded-full transition-all duration-300"
              style={{
                width: 3,
                height: i === slideIndex ? 26 : 12,
                background: i === slideIndex ? slide.accent : i < slideIndex ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.1)',
                boxShadow: i === slideIndex ? `0 0 8px ${slide.accent}88` : 'none',
              }}
            />
          ))}
        </div>

        {/* 卡体 */}
        <div className="relative min-w-0 flex-1 overflow-hidden" style={{ minHeight: 268 }}>
          {/* 幽灵序号：压在背景上的巨大 0N，本身就是进度读数 */}
          <div
            aria-hidden
            // 不再用 -right-2/-top-6 往外顶：外层卡体是 overflow-hidden，
            // 这个 6.5rem 的斜体数字右上角会被整整切掉一角。实测越界量：右 8px、上 41px。
            // 光贴 right-0/top-0 还不够——leading-none 的行盒只有 1em，
            // 字形的 ascent 比它高，墨迹仍会探出 17px。所以上下都留内边距：
            // pr 给斜体的横向探出、pt 给 ascent 的纵向探出（实测改后 右 −14.6 / 上 −3.8，都在框内）。
            className="pointer-events-none absolute right-0 top-0 select-none font-black italic leading-none"
            style={{ fontSize: '6.5rem', color: `${slide.accent}14`, paddingRight: '0.14em', paddingTop: '0.2em' }}
          >
            {String(slideIndex + 1).padStart(2, '0')}
          </div>

          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={slideIndex}
              custom={dir}
              drag={reduce ? false : 'x'}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.16}
              onDragEnd={(_, info) => {
                if (info.offset.x < -56) go(slideIndex + 1);
                else if (info.offset.x > 56) go(slideIndex - 1);
              }}
              initial={reduce ? false : { opacity: 0, x: dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -20 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center text-xl font-black"
                  style={{
                    color: slide.accent,
                    background: `${slide.accent}1a`,
                    border: `1px solid ${slide.accent}44`,
                    clipPath: 'polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)',
                  }}
                >
                  {slide.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-extrabold leading-tight text-white">{slide.title}</div>
                  <div className="mt-0.5 text-[10px] font-bold tracking-[0.22em]" style={{ color: slide.accent }}>
                    {slide.subtitle}
                  </div>
                </div>
              </div>

              <ul className="space-y-2.5">
                {slide.points.map((text, i) => (
                  <motion.li
                    key={i}
                    className="flex items-start gap-2.5"
                    initial={reduce ? false : { opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.055, duration: 0.3, ease: 'easeOut' }}
                  >
                    <span
                      aria-hidden
                      className="mt-[7px] h-[9px] w-[6px] flex-shrink-0"
                      style={{ background: slide.accent, clipPath: 'polygon(34% 0, 100% 0, 66% 100%, 0 100%)' }}
                    />
                    <span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      {text}
                    </span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <p className="mb-3 mt-4 text-center text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>
        左右滑动也能翻页
      </p>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={slideIndex === 0 ? onBack : () => go(slideIndex - 1)}
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
          onClick={isLast ? onFinish : () => go(slideIndex + 1)}
          className="flex-1 py-3 rounded-xl font-semibold text-white"
          style={PRIMARY_BTN_STYLE}
        >
          {isLast ? '开始旅程 🦋' : `下一条 → ${slideIndex + 1} / ${total}`}
        </motion.button>
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
  /** 建档失败时的可见反馈：以前 createUser 一抛错就是"按钮点了没反应"，用户完全没法自救 */
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createUser(name.trim(), attrNames, blessingAttr ?? undefined);
      // 成功即 user 落库 → 本组件整体卸载，不需要复位 submitting
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '建档失败，请重试');
      setSubmitting(false);
    }
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

                {submitError && (
                  <div
                    role="alert"
                    className="mb-3 rounded-xl px-4 py-3 text-xs leading-relaxed"
                    style={{ background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}
                  >
                    <span className="font-bold">建档没能完成：</span>
                    <span className="break-all">{submitError}</span>
                  </div>
                )}

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
                    disabled={!blessingAttr || submitting}
                    className="flex-1 py-3 rounded-xl font-semibold text-base text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    style={PRIMARY_BTN_STYLE}
                  >
                    {submitting ? '正在建档…' : submitError ? '再试一次 🦋' : '接受赐福，开始旅程 🦋'}
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
