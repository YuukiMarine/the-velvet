/**
 * StagnationConsole — F3 的核心体验：停滞诊断室。
 *
 * 用户不是来管理任务，而是来把「卡住」重新变成一个可启动的小动作。
 * 因此入口先收纳模糊停滞感，再由系统判断类型、接入历史、只生成一个当前小步。
 */
import { AnimatePresence, motion } from 'motion/react';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import { minimalStep, terminalChannel, terminalSkin } from '@/utils/terminalSkin';
import { useBoldness } from '@/utils/boldness';
import { zClass } from '@/utils/zIndex';
import type { AttributeId, TerminalProblemKind, Todo, Wish } from '@/types';

type StagnationMode = 'long_term' | 'pressure' | 'lost' | 'exhausted';
type ConsolePhase = 'intake' | 'generating' | 'result';
type ContinuationKind = 'memory' | 'today' | 'new';

interface StagnationDiagnosis {
  mode: StagnationMode;
  kind: TerminalProblemKind;
  label: string;
  summary: string;
  reason: string;
  principle: string;
}

interface DiagnosisResult {
  action: string;
  sourceKind: 'wish' | 'todo';
  sourceId?: string;
  goalId?: string;
  goalTitle?: string;
  pendingGoal?: {
    title: string;
    kind: TerminalProblemKind;
    currentState?: string;
    note?: string;
  };
  pendingChildTitle?: string;
  attribute?: AttributeId;
  usedAI: boolean;
  fromMemory: boolean;
  continuation: ContinuationKind;
  diagnosis: StagnationDiagnosis;
  sourceLabel: string;
  stasisText: string;
  currentState?: string;
  historyLine?: string;
  queueLine?: string;
}

type ExistingCandidate =
  | { kind: 'wish'; goal: Wish; child?: Wish }
  | { kind: 'todo'; todo: Todo };

type StagnationStyleKey = 'p5' | 'p4' | 'p3';
type MotionDivProps = ComponentProps<typeof motion.div>;

interface StagnationStyle {
  key: StagnationStyleKey;
  pageName: string;
  heroShell: string;
  heroBackdrop: string;
  heroTitle: string;
  heroLead: string;
  heroVisual: string;
  metric: string;
  metricLabel: string;
  metricValue: string;
  primaryButton: string;
  ghostButton: string;
  dialogPanel: string;
  dialogHeader: string;
  inputWrap: string;
  input: string;
  protocolRow: string;
  selectedMemory: string;
  idleMemory: string;
  notePanel: string;
  diagnosisPanel: string;
  sourcePanel: string;
  actionPanel: string;
  actionText: string;
  badge: string;
  clip: string;
  actionClip: string;
  backdropPattern: string;
  heroPattern: string;
  actionPattern: string;
  lockLabel: string;
  readyLabel: string;
  timeReady: string;
  timeRunning: string;
  recentEmpty: string;
  motion: Pick<MotionDivProps, 'initial' | 'animate' | 'exit' | 'transition'>;
}

const visualKeyForChannel = (channel: ReturnType<typeof terminalChannel>): StagnationStyleKey =>
  channel === 'thief' ? 'p5' : channel === 'tv' ? 'p4' : 'p3';

const STAGNATION_STYLES: Record<StagnationStyleKey, StagnationStyle> = {
  p5: {
    key: 'p5',
    pageName: 'TARGET LOCK',
    heroShell: 'border-[3px] border-[#050505] bg-[#e60012] text-[#f7f4ea] shadow-[8px_8px_0_#050505]',
    heroBackdrop: 'bg-[#050505]/20',
    heroTitle: 'font-black uppercase text-[#f7f4ea] [font-family:Impact,Arial_Black,sans-serif] drop-shadow-[4px_4px_0_#050505]',
    heroLead: 'max-w-xl bg-[#050505] px-3 py-2 text-sm font-black leading-relaxed text-[#f7f4ea]',
    heroVisual: 'border-[3px] border-[#050505] bg-[#f7f4ea] text-[#050505] shadow-[6px_6px_0_#050505]',
    metric: 'border-[3px] border-[#050505] bg-[#f7f4ea] px-3 py-2 text-[#050505] shadow-[4px_4px_0_#050505]',
    metricLabel: 'text-[9px] font-black uppercase text-[#e60012]',
    metricValue: 'mt-1 truncate text-sm font-black text-[#050505]',
    primaryButton: 'min-h-[52px] border-[3px] border-[#050505] bg-[#f7f4ea] px-5 py-2.5 text-sm font-black uppercase text-[#050505] shadow-[5px_5px_0_#050505] transition hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0_#050505] disabled:opacity-45',
    ghostButton: 'min-h-[42px] border-[3px] border-[#f7f4ea] bg-[#050505] px-4 py-2 text-xs font-black uppercase text-[#f7f4ea] shadow-[4px_4px_0_#050505] transition hover:border-[#18e7d3] hover:text-[#18e7d3]',
    dialogPanel: 'border-[3px] border-[#050505] bg-[#e60012] text-[#f7f4ea] shadow-[9px_9px_0_#050505]',
    dialogHeader: 'border-b-[3px] border-[#050505] bg-[#f7f4ea] text-[#050505]',
    inputWrap: 'border-[3px] border-[#050505] bg-[#f7f4ea] px-3 py-3 text-[#050505] shadow-[5px_5px_0_#050505]',
    input: 'w-full resize-none border-[3px] border-[#050505] bg-[#fff7ee] px-3 py-2.5 text-[16px] font-bold leading-relaxed text-[#050505] outline-none placeholder:text-[#050505]/35 focus:bg-white focus:shadow-[4px_4px_0_#050505]',
    protocolRow: 'border-[3px] border-[#050505] bg-[#050505] px-3 py-2 text-[#f7f4ea]',
    selectedMemory: 'border-[3px] border-[#050505] bg-[#f7f4ea] text-[#050505] shadow-[4px_4px_0_#050505]',
    idleMemory: 'border-[3px] border-[#050505] bg-[#050505] text-[#f7f4ea]',
    notePanel: 'border-[3px] border-[#050505] bg-[#050505] px-3 py-2 text-xs font-bold leading-relaxed text-[#f7f4ea]',
    diagnosisPanel: 'border-[3px] border-[#050505] bg-[#f7f4ea] px-4 py-4 text-[#050505] shadow-[5px_5px_0_#050505]',
    sourcePanel: 'border-[3px] border-[#050505] bg-[#050505] px-4 py-3 text-[#f7f4ea]',
    actionPanel: 'border-[4px] border-[#050505] bg-[#f7f4ea] px-4 py-5 text-[#050505] shadow-[7px_7px_0_#050505]',
    actionText: 'max-w-full break-words text-[24px] font-black leading-tight text-[#050505] [overflow-wrap:anywhere] [word-break:break-word] sm:text-[30px] [font-family:Impact,Arial_Black,Noto_Sans_SC,sans-serif]',
    badge: 'border-2 border-[#050505] bg-[#e60012] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#f7f4ea]',
    clip: 'polygon(2% 0, 100% 0, 97% 100%, 0 96%)',
    actionClip: 'polygon(0 0, 98% 4%, 100% 94%, 3% 100%)',
    backdropPattern: 'radial-gradient(circle, rgba(255,255,255,.12) 1px, transparent 1px)',
    heroPattern: 'radial-gradient(circle, rgba(5,5,5,.34) 1px, transparent 1px)',
    actionPattern: 'linear-gradient(135deg, transparent 0 42%, rgba(230,0,18,.18) 42% 48%, transparent 48%)',
    lockLabel: '目标已锁定',
    readyLabel: '目标可锁定',
    timeReady: '待夺回',
    timeRunning: '行动中',
    recentEmpty: '尚无战果',
    motion: {
      initial: { opacity: 0, x: -24, rotate: -2, scale: 0.98 },
      animate: { opacity: 1, x: 0, rotate: 0, scale: 1 },
      exit: { opacity: 0, x: 24, rotate: 2, scale: 0.98 },
      transition: { duration: 0.22, ease: [0.2, 0.9, 0.2, 1] },
    },
  },
  p4: {
    key: 'p4',
    pageName: 'REC STASIS',
    heroShell: 'border-[3px] border-[#111] bg-[#ffe100] text-[#111] shadow-[0_7px_0_#111]',
    heroBackdrop: 'bg-[#fff7b0]/35',
    heroTitle: 'font-black text-[#111] [font-family:Georgia,Times_New_Roman,Noto_Serif_SC,serif]',
    heroLead: 'max-w-xl rounded-[12px] border-[2px] border-[#111] bg-[#fff4b8] px-3 py-2 text-sm font-black leading-relaxed text-[#111] shadow-[0_3px_0_#ff9a00]',
    heroVisual: 'rounded-[18px] border-[3px] border-[#111] bg-[#fff7b0] text-[#111] shadow-[0_6px_0_#111]',
    metric: 'rounded-[14px] border-[3px] border-[#111] bg-[#fff4b8] px-3 py-2 text-[#111]',
    metricLabel: 'text-[9px] font-black uppercase tracking-[0.18em] text-[#20bff2]',
    metricValue: 'mt-1 truncate text-sm font-black text-[#111]',
    primaryButton: 'min-h-[52px] rounded-full border-[3px] border-[#111] bg-[#111] px-5 py-2.5 text-sm font-black tracking-[0.14em] text-[#ffe100] shadow-[0_5px_0_#ff6a00] transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#ff6a00] disabled:opacity-45',
    ghostButton: 'min-h-[42px] rounded-full border-[3px] border-[#111] bg-[#fff7b0] px-4 py-2 text-xs font-black text-[#111] transition hover:bg-[#20bff2]',
    dialogPanel: 'rounded-[22px] border-[3px] border-[#111] bg-[#ffe100] text-[#111] shadow-[0_8px_0_#ff9a00]',
    dialogHeader: 'border-b-[3px] border-[#111] bg-[#fff4b8] text-[#111]',
    inputWrap: 'rounded-[16px] border-[3px] border-[#111] bg-[#fff7b0] px-3 py-3 text-[#111] shadow-[0_5px_0_#111]',
    input: 'w-full resize-none rounded-[12px] border-[3px] border-[#111] bg-white px-3 py-2.5 text-[16px] font-bold leading-relaxed text-[#111] outline-none placeholder:text-[#111]/35 focus:border-[#20bff2]',
    protocolRow: 'rounded-[12px] border-[3px] border-[#111] bg-[#fff4b8] px-3 py-2 text-[#111]',
    selectedMemory: 'rounded-[12px] border-[3px] border-[#111] bg-[#24c8f2] text-[#111]',
    idleMemory: 'rounded-[12px] border-[2px] border-[#111] bg-[#fff7b0] text-[#111]',
    notePanel: 'rounded-[12px] border-[2px] border-[#111] bg-[#fff4b8] px-3 py-2 text-xs font-bold leading-relaxed text-[#111] shadow-[0_3px_0_#ff9a00]',
    diagnosisPanel: 'rounded-[16px] border-[3px] border-[#111] bg-[#fff7b0] px-4 py-4 text-[#111] shadow-[0_4px_0_#111]',
    sourcePanel: 'rounded-[14px] border-[3px] border-[#111] bg-[#fff8d6] px-4 py-3 text-[#111]',
    actionPanel: 'rounded-[22px] border-[3px] border-[#1a1710] bg-[#fff4b8] px-4 py-5 text-[#1a1710] shadow-[0_6px_0_#ff9a00]',
    actionText: 'max-w-full break-words text-[24px] font-black leading-tight text-[#1a1710] [overflow-wrap:anywhere] [word-break:break-word] sm:text-[30px] [font-family:Georgia,Times_New_Roman,Noto_Serif_SC,serif]',
    badge: 'rounded-full border-2 border-[#111] bg-[#20bff2] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#111]',
    clip: 'polygon(0 0, 100% 0, 96% 100%, 0 100%)',
    actionClip: 'polygon(0 0, 100% 0, 98% 100%, 2% 100%)',
    backdropPattern: 'repeating-linear-gradient(0deg, rgba(255,238,112,.05) 0 1px, rgba(0,0,0,.24) 1px 3px, transparent 3px 5px), radial-gradient(circle, rgba(255,225,0,.08) 1px, transparent 1.8px)',
    heroPattern: 'radial-gradient(circle at 76% 22%, transparent 0 28%, rgba(255,185,0,.85) 29% 31%, transparent 32%)',
    actionPattern: 'linear-gradient(90deg, #d71920 0 7px, #ffe100 7px 16px, #ff6a00 16px 25px, #20bff2 25px 34px, #0057ff 34px 40px, transparent 40px)',
    lockLabel: '本期正在播出',
    readyLabel: '节目待开播',
    timeReady: '待开播',
    timeRunning: 'ON AIR',
    recentEmpty: '暂无通关片段',
    motion: {
      initial: { opacity: 0, y: 18, scale: 0.96 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: 12, scale: 0.98 },
      transition: { type: 'spring', stiffness: 260, damping: 28 },
    },
  },
  p3: {
    key: 'p3',
    pageName: 'TRACE READY',
    heroShell: 'border border-[#00d8ff]/70 bg-[#001c7a] text-[#f6fbff] shadow-[6px_7px_0_rgba(0,0,0,.45)]',
    heroBackdrop: 'bg-[#0057ff]/15',
    heroTitle: 'font-black italic text-[#f6fbff] [font-family:Arial_Narrow,Roboto_Condensed,Noto_Sans_SC,sans-serif]',
    heroLead: 'max-w-xl border-l-4 border-[#ff3daa] bg-[#05070d]/70 px-3 py-2 text-sm font-bold leading-relaxed text-[#dcecff]',
    heroVisual: 'border border-[#00d8ff]/65 bg-[#05070d]/78 text-[#f6fbff] shadow-[5px_6px_0_rgba(0,0,0,.35)]',
    metric: 'border-l-2 border-[#00d8ff] bg-[#05070d]/78 px-3 py-2 text-[#f6fbff]',
    metricLabel: 'text-[9px] font-black uppercase tracking-[0.16em] text-[#00d8ff]',
    metricValue: 'mt-1 truncate text-sm font-black text-[#f6fbff]',
    primaryButton: 'min-h-[52px] border border-[#f6fbff] bg-[#f6fbff] px-5 py-2.5 text-sm font-black italic text-[#05070d] shadow-[inset_0_-4px_0_#00d8ff,4px_4px_0_rgba(0,0,0,.45)] transition hover:translate-x-0.5 hover:shadow-[inset_0_-6px_0_#00d8ff,6px_4px_0_rgba(0,0,0,.45)] active:translate-x-1 disabled:opacity-45',
    ghostButton: 'min-h-[42px] border border-[#00d8ff]/70 bg-[#05070d]/60 px-4 py-2 text-xs font-black italic text-[#bdefff] transition hover:border-[#ff3daa] hover:text-white',
    dialogPanel: 'border border-[#00d8ff]/70 bg-[#001c7a] text-[#f6fbff] shadow-[8px_8px_0_rgba(0,0,0,.55)]',
    dialogHeader: 'border-b border-[#00d8ff]/35 bg-[#05070d]/86 text-[#f6fbff]',
    inputWrap: 'border border-[#00d8ff]/45 bg-[#05070d]/70 px-3 py-3 text-[#f6fbff]',
    input: 'w-full resize-none border border-[#00d8ff]/35 bg-[#001141]/75 px-3 py-2.5 text-[16px] leading-relaxed text-[#f6fbff] outline-none placeholder:text-[#8da0b8] focus:border-[#ff3daa]',
    protocolRow: 'border border-[#00d8ff]/40 bg-[#05070d]/70 px-3 py-2 text-[#dcecff]',
    selectedMemory: 'border border-[#f6fbff] bg-[#f6fbff] text-[#05070d] shadow-[inset_0_-3px_0_#ff3daa]',
    idleMemory: 'border border-[#00d8ff]/35 bg-[#05070d]/60 text-[#dcecff]',
    notePanel: 'border border-[#00d8ff]/35 bg-[#05070d]/70 px-3 py-2 text-xs leading-relaxed text-[#8da0b8]',
    diagnosisPanel: 'border border-[#00d8ff]/50 bg-[#05070d]/72 px-4 py-4 text-[#f6fbff]',
    sourcePanel: 'border border-[#f6fbff]/15 bg-[#05070d]/70 px-4 py-3 text-[#dcecff]',
    actionPanel: 'border border-[#00d8ff]/70 bg-[#f6fbff] px-4 py-5 text-[#05070d] shadow-[inset_0_-6px_0_#00d8ff,6px_7px_0_rgba(0,0,0,.45)]',
    actionText: 'max-w-full break-words text-[24px] font-black italic leading-tight text-[#05070d] [overflow-wrap:anywhere] [word-break:break-word] sm:text-[30px] [font-family:Arial_Narrow,Roboto_Condensed,Noto_Sans_SC,sans-serif]',
    badge: 'border border-[#00d8ff] bg-[#05070d] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#00d8ff]',
    clip: 'polygon(0 0, 100% 0, 97% 100%, 0 100%)',
    actionClip: 'polygon(0 0, 100% 0, 96% 100%, 2% 100%)',
    backdropPattern: 'linear-gradient(120deg, rgba(0,216,255,.16) 0 1px, transparent 1px 22px)',
    heroPattern: 'linear-gradient(135deg, rgba(246,251,255,.12) 0 18%, transparent 18%), linear-gradient(110deg, transparent 0 62%, rgba(255,61,170,.18) 62% 64%, transparent 64%)',
    actionPattern: 'linear-gradient(90deg, rgba(0,216,255,.2), transparent 46%, rgba(255,61,170,.2))',
    lockLabel: '协议运行中',
    readyLabel: '协议待接入',
    timeReady: '待接入',
    timeRunning: 'TRACE ON',
    recentEmpty: '暂无回收记录',
    motion: {
      initial: { opacity: 0, x: -18, skewX: -4 },
      animate: { opacity: 1, x: 0, skewX: 0 },
      exit: { opacity: 0, x: 18, skewX: 4 },
      transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] },
    },
  },
};

const DIAGNOSIS_COPY: Record<StagnationMode, StagnationDiagnosis> = {
  long_term: {
    mode: 'long_term',
    kind: 'long_term',
    label: '连续性中断',
    summary: '这更像一条长期愿望停住了。问题不是今天要做完，而是先把链条重新接上。',
    reason: '长期愿望一旦断线，最难的通常不是能力，而是重新找到入口。',
    principle: '先恢复连续性，不追求一次推进很多。',
  },
  pressure: {
    mode: 'pressure',
    kind: 'pressure',
    label: '压力堵塞',
    summary: '这更像短期压力把入口堵住了。现在先止血，只切出最靠近当下的一步。',
    reason: '压力越急，越容易把任务压成一整块，反而无法开始。',
    principle: '先处理最小的外部压力点，不整理整个人生。',
  },
  lost: {
    mode: 'lost',
    kind: 'pressure',
    label: '选择过载',
    summary: '你现在不像是没有事情可做，而是入口太多，系统先替你只保留一个。',
    reason: '选择过多会消耗启动能量，当前最重要的是停止比较。',
    principle: '把选择权交给终端，当前只处理一件。',
  },
  exhausted: {
    mode: 'exhausted',
    kind: 'pressure',
    label: '启动能量不足',
    summary: '这不是意志力问题。现在要把动作降到足够小，小到不需要证明自己。',
    reason: '低能量时，任何完整计划都会变成新的负担。',
    principle: '只做能让时间重新流动的一下。',
  },
};

const channelCopy = (channel: ReturnType<typeof terminalChannel>) => {
  if (channel === 'thief') {
    return {
      eyebrow: 'STASIS HEIST',
      title: '锁定停滞点',
      lead: '不制定完整计划。只偷回一个能开始的入口。',
      memory: '查看作战档案',
      generate: '锁定一个入口',
      accept: '发出预告状',
      redo: '重定路线',
      result: '潜入路线',
      intake: '现在从哪里失控了？',
    };
  }
  if (channel === 'tv') {
    return {
      eyebrow: 'MIDNIGHT PROGRAM',
      title: '本期接入',
      lead: '只写一句脚本，然后交给终端决定。',
      memory: '节目单',
      generate: '写下脚本',
      accept: '开拍这一幕',
      redo: '重剪一次',
      result: '本期行动',
      intake: '今天卡在哪个镜头？',
    };
  }
  return {
    eyebrow: 'stasis.log',
    title: '停滞诊断室',
    lead: '这里不整理人生。只判断你卡在哪里，然后回一条能开始的下一步。',
    memory: '打开启动帖库',
    generate: '接入下一步',
    accept: '接住这一小步',
    redo: '换一种说法',
    result: '回复草稿',
    intake: '现在卡住你的是什么？',
  };
};

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
const asDate = (value: Date | string) => new Date(value).getTime();

const firstActiveChild = (wishes: Wish[], parentId: string) =>
  wishes
    .filter((w) => w.parentId === parentId && w.status === 'active')
    .sort((a, b) => asDate(a.createdAt) - asDate(b.createdAt))[0];

const lastDoneChild = (wishes: Wish[], parentId: string) =>
  wishes
    .filter((w) => w.parentId === parentId && w.status === 'done')
    .sort((a, b) => asDate(b.archivedAt ?? b.createdAt) - asDate(a.archivedAt ?? a.createdAt))[0];

const diagnosisFromMode = (mode: StagnationMode): StagnationDiagnosis => ({ ...DIAGNOSIS_COPY[mode] });

const hasAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

const inferDiagnosis = (text: string, state: string, goal?: Wish): StagnationDiagnosis => {
  const raw = `${text} ${state} ${goal?.title ?? ''} ${goal?.currentState ?? ''}`.toLowerCase();
  if (hasAny(raw, ['没力气', '没劲', '动不了', '不想动', '疲惫', '好累', '很累', '麻木', '崩溃', '撑不住'])) {
    return diagnosisFromMode('exhausted');
  }
  if (hasAny(raw, ['不知道先', '不知道要', '不知道该', '不知道做', '选哪个', '太多', '很乱', '脑子乱', '无从下手'])) {
    return diagnosisFromMode('lost');
  }
  if (goal?.kind === 'long_term') return diagnosisFromMode('long_term');
  if (goal?.kind === 'pressure') return diagnosisFromMode('pressure');
  if (hasAny(raw, ['今天', '明天', '今晚', '截止', 'ddl', 'deadline', '汇报', '作业', '考试', '会议', '催', '来不及', '急', '压力'])) {
    return diagnosisFromMode('pressure');
  }
  if (hasAny(raw, ['一直', '长期', '想要', '希望', '成为', '坚持', '学会', '练习', '健身', '写作', '作品', '项目', '愿望'])) {
    return diagnosisFromMode('long_term');
  }
  return diagnosisFromMode('lost');
};

const goalTitleFromText = (text: string) => {
  const firstLine = normalize(text.split(/[。！？!?；;\n]/)[0] ?? text);
  return firstLine.slice(0, 34) || '一个停住的目标';
};

const scoreGoalMatch = (text: string, goal: Wish) => {
  const a = normalize(text).replace(/[^\p{L}\p{N}]/gu, '');
  const b = normalize(`${goal.title}${goal.note ?? ''}${goal.currentState ?? ''}`).replace(/[^\p{L}\p{N}]/gu, '');
  if (!a || !b) return 0;
  if (b.includes(a) || a.includes(goal.title.replace(/[^\p{L}\p{N}]/gu, ''))) return 1;
  const chars = Array.from(new Set(Array.from(a).filter((ch) => !'我现在这个那个事情任务目标有点就是但是然后因为所以'.includes(ch))));
  if (chars.length < 2) return 0;
  const hits = chars.filter((ch) => b.includes(ch)).length;
  return hits / Math.min(chars.length, 10);
};

export const StagnationConsole = ({ onOpenMemory }: { onOpenMemory: () => void }) => {
  const {
    wishes,
    todos,
    todoCompletions,
    user,
    addWish,
    saveWish,
    decomposeWishAI,
    decomposeStepAI,
    createTerminalTask,
    getActiveTerminalTask,
    getDueTodosToday,
    getTodayTodoProgress,
    setCurrentPage,
  } = useAppStore();
  const skin = terminalSkin(user?.theme);
  const channel = terminalChannel(user?.theme);
  const visual = STAGNATION_STYLES[visualKeyForChannel(channel)];
  const copy = channelCopy(channel);
  const memoryNoun = channel === 'thief' ? '作战档案' : channel === 'tv' ? '节目单' : '启动帖库';
  const bold = useBoldness();
  const activeTask = getActiveTerminalTask();
  const [stasisText, setStasisText] = useState('');
  const [currentState, setCurrentState] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [phase, setPhase] = useState<ConsolePhase>('intake');
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [autoCursor, setAutoCursor] = useState(0);

  const goals = useMemo(
    () => wishes
      .filter((w) => !w.parentId && w.status !== 'archived' && w.status !== 'done')
      .sort((a, b) => asDate(a.createdAt) - asDate(b.createdAt)),
    [wishes],
  );

  const dueTodos = useMemo(
    () => getDueTodosToday().filter((t) => !getTodayTodoProgress(t.id).isComplete),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todos, todoCompletions],
  );

  const selectedGoal = selectedGoalId ? goals.find((g) => g.id === selectedGoalId) : undefined;

  useEffect(() => {
    if (!modalOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase !== 'generating') {
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalOpen, phase]);

  const findRelatedGoal = (text: string) => {
    if (!text) return undefined;
    const ranked = goals
      .map((goal) => ({ goal, score: scoreGoalMatch(text, goal) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 0.72 ? ranked[0].goal : undefined;
  };

  const candidateQueue = useMemo<ExistingCandidate[]>(() => {
    const pressureGoals = goals.filter((goal) => goal.kind === 'pressure');
    const longTermGoals = goals.filter((goal) => goal.kind !== 'pressure');
    const wishCandidate = (goal: Wish): ExistingCandidate => ({
      kind: 'wish',
      goal,
      child: firstActiveChild(wishes, goal.id),
    });
    return [
      ...pressureGoals.map(wishCandidate),
      ...dueTodos.map((todo) => ({ kind: 'todo' as const, todo })),
      ...longTermGoals.map(wishCandidate),
    ];
  }, [dueTodos, goals, wishes]);

  const pickExistingCandidate = (offset = 0): ExistingCandidate | null => {
    if (candidateQueue.length === 0) return null;
    const index = ((offset % candidateQueue.length) + candidateQueue.length) % candidateQueue.length;
    return candidateQueue[index];
  };

  const historyLineForGoal = (goal: Wish) => {
    const lastHistory = goal.stepHistory?.slice(-1)[0];
    if (lastHistory) return `上次你完成了「${lastHistory.title}」，这次从这里继续。`;
    const done = lastDoneChild(wishes, goal.id);
    if (done) return `之前你已经完成过「${done.title}」，这不是从零开始。`;
    return undefined;
  };

  const queueLineForGoal = (goal: Wish) => {
    const activeChildren = wishes
      .filter((w) => w.parentId === goal.id && w.status === 'active')
      .sort((a, b) => asDate(a.createdAt) - asDate(b.createdAt));
    if (activeChildren.length === 0) return '这个方向还没有排队中的小步，终端会补一条新的入口。';
    return `已有 ${activeChildren.length} 个未完成小步，当前只接住最前面的「${activeChildren[0].title}」。`;
  };

  const contextForGoal = (goal: Wish, diagnosis: StagnationDiagnosis, child?: Wish) => {
    const completed = goal.stepHistory?.map((h) => h.title).filter(Boolean).slice(-4) ?? [];
    return [
      child?.note,
      `诊断：${diagnosis.label}`,
      `处理原则：${diagnosis.principle}`,
      goal.kind === 'pressure' ? '类型：短期压力' : '类型：长期愿望',
      goal.currentState ? `当前进度/水平：${goal.currentState}` : '',
      completed.length ? `已完成记录：${completed.join('；')}` : '',
    ].filter(Boolean).join('\n') || undefined;
  };

  const generateStepForChild = async (child: Wish, diagnosis: StagnationDiagnosis, goal?: Wish) => {
    try {
      const text = await decomposeStepAI(child.title, goal ? contextForGoal(goal, diagnosis, child) : `诊断：${diagnosis.label}\n${child.note ?? ''}`);
      return { action: text, usedAI: true };
    } catch {
      return { action: minimalStep(skin, child.title), usedAI: false };
    }
  };

  const generateForGoal = async (goal: Wish, diagnosis: StagnationDiagnosis, children: Wish[]) => {
    const activeChild = firstActiveChild(children, goal.id);
    if (activeChild) {
      const next = await generateStepForChild(activeChild, diagnosis, goal);
      return {
        action: next.action,
        sourceKind: 'wish' as const,
        sourceId: activeChild.id,
        goalId: goal.id,
        goalTitle: goal.title,
        attribute: activeChild.attribute,
        usedAI: next.usedAI,
        pendingChildTitle: undefined,
      };
    }
    try {
      const list = await decomposeWishAI(
        {
          ...goal,
          kind: diagnosis.kind,
          note: [goal.note, `诊断：${diagnosis.label}`, diagnosis.principle].filter(Boolean).join('\n'),
        },
        children.filter((w) => w.parentId === goal.id),
      );
      if (list[0]) {
        return {
          action: list[0],
          sourceKind: 'wish' as const,
          goalId: goal.id,
          goalTitle: goal.title,
          pendingChildTitle: list[0],
          attribute: goal.attribute,
          usedAI: true,
        };
      }
    } catch {
      /* fallback below */
    }
    const action = minimalStep(skin, goal.title);
    return {
      action,
      sourceKind: 'wish' as const,
      goalId: goal.id === 'draft' ? undefined : goal.id,
      goalTitle: goal.title,
      pendingChildTitle: action,
      attribute: goal.attribute,
      usedAI: false,
    };
  };

  const generateForTodo = async (todo: Todo, diagnosis: StagnationDiagnosis) => {
    try {
      const action = await decomposeStepAI(todo.title, `诊断：${diagnosis.label}\n处理原则：${diagnosis.principle}`);
      return { action, usedAI: true };
    } catch {
      return { action: minimalStep(skin, todo.title), usedAI: false };
    }
  };

  const generate = async (override?: { text?: string; state?: string; selectedGoalId?: string | null; pickOffset?: number }) => {
    if (activeTask) return;
    const cleanText = normalize(override?.text ?? stasisText);
    const cleanState = normalize(override?.state ?? currentState);
    const overrideGoal =
      override?.selectedGoalId === undefined
        ? selectedGoal
        : override.selectedGoalId
          ? goals.find((g) => g.id === override.selectedGoalId)
          : undefined;
    const matchedGoal = overrideGoal ?? findRelatedGoal(cleanText);
    setError(null);
    setPhase('generating');
    setResult(null);
    try {
      if (!cleanText && !matchedGoal) {
        const candidate = pickExistingCandidate(override?.pickOffset ?? autoCursor);
        if (candidate) setAutoCursor((n) => n + 1);
        if (candidate?.kind === 'wish') {
          const diagnosis = inferDiagnosis('', '', candidate.goal);
          const next = await generateForGoal(candidate.goal, diagnosis, wishes);
          setResult({
            ...next,
            diagnosis,
            continuation: 'memory',
            sourceLabel: candidate.goal.title,
            stasisText: `接上「${candidate.goal.title}」`,
            currentState: candidate.goal.currentState,
            historyLine: historyLineForGoal(candidate.goal),
            queueLine: queueLineForGoal(candidate.goal),
            fromMemory: true,
          });
          setPhase('result');
          return;
        }
        if (candidate?.kind === 'todo') {
          const diagnosis = diagnosisFromMode('lost');
          const next = await generateForTodo(candidate.todo, diagnosis);
          setResult({
            action: next.action,
            sourceKind: 'todo',
            sourceId: candidate.todo.id,
            goalTitle: candidate.todo.title,
            attribute: candidate.todo.attribute,
            usedAI: next.usedAI,
            fromMemory: true,
            continuation: 'today',
            diagnosis,
            sourceLabel: candidate.todo.title,
            stasisText: `从今日压力接入「${candidate.todo.title}」`,
            queueLine: '你没有输入新的描述，所以终端从今日未完成事项里接入最前面的一件。',
          });
          setPhase('result');
          return;
        }
        setError('先丢一句现在卡住的事进来，或者在停滞记忆里选一个旧目标。');
        setPhase('intake');
        return;
      }

      const diagnosis = inferDiagnosis(cleanText, cleanState, matchedGoal);
      const draftTitle = goalTitleFromText(cleanText || matchedGoal?.title || '');
      const goal: Wish = matchedGoal ?? {
        id: 'draft',
        title: draftTitle,
        kind: diagnosis.kind,
        currentState: cleanState || undefined,
        note: cleanText && cleanText !== draftTitle ? cleanText : undefined,
        status: 'active',
        source: 'manual',
        createdAt: new Date(),
      };
      const goalForAI: Wish = {
        ...goal,
        kind: diagnosis.kind,
        currentState: cleanState || goal.currentState,
        note: [goal.note, cleanText && cleanText !== goal.title ? `用户这次描述：${cleanText}` : ''].filter(Boolean).join('\n') || undefined,
      };
      const next = await generateForGoal(goalForAI, diagnosis, wishes);
      const isExistingGoal = Boolean(matchedGoal && matchedGoal.id !== 'draft');
      setResult({
        ...next,
        diagnosis,
        pendingGoal: isExistingGoal ? undefined : {
          title: draftTitle,
          kind: diagnosis.kind,
          currentState: cleanState || undefined,
          note: cleanText && cleanText !== draftTitle ? cleanText : undefined,
        },
        continuation: isExistingGoal ? 'memory' : 'new',
        sourceLabel: goal.title,
        stasisText: cleanText || goal.title,
        currentState: cleanState || goal.currentState,
        historyLine: isExistingGoal ? historyLineForGoal(goal) : undefined,
        queueLine: isExistingGoal ? queueLineForGoal(goal) : `这是一个新的停滞点。接住小步后，它会进入${memoryNoun}，之后可以继续接着走。`,
        fromMemory: isExistingGoal,
      });
      setPhase('result');
    } catch (e) {
      setError(e instanceof Error ? e.message : '终端这次没有接上信号。');
      setPhase('intake');
    }
  };

  const accept = async () => {
    if (!result || activeTask) return;
    setError(null);
    let sourceId = result.sourceId;
    let goalTitle = result.goalTitle;
    let attribute = result.attribute;

    if (result.sourceKind === 'wish') {
      let parent = result.goalId ? wishes.find((w) => w.id === result.goalId) : undefined;
      if (!parent && result.pendingGoal) {
        parent = await addWish({
          title: result.pendingGoal.title,
          kind: result.pendingGoal.kind,
          currentState: result.pendingGoal.currentState,
          note: result.pendingGoal.note,
          source: 'manual',
        });
      } else if (parent) {
        const nextState = normalize(result.currentState ?? currentState) || parent.currentState;
        if (parent.kind !== result.diagnosis.kind || nextState !== parent.currentState) {
          parent = { ...parent, kind: result.diagnosis.kind, currentState: nextState };
          await saveWish(parent);
        }
      }
      if (!parent) return;
      goalTitle = parent.title;
      if (!sourceId) {
        const child = await addWish({
          title: result.pendingChildTitle ?? result.action,
          parentId: parent.id,
          attribute,
          source: result.usedAI ? 'ai' : 'manual',
        });
        sourceId = child.id;
        attribute = child.attribute;
      }
    }

    if (!sourceId) return;
    const created = await createTerminalTask({
      stepTitle: result.action,
      sourceKind: result.sourceKind,
      sourceId,
      attribute,
      goalTitle,
    });
    if (created) {
      setPhase('intake');
      setResult(null);
      setStasisText('');
      setCurrentState('');
      setSelectedGoalId(null);
      setModalOpen(false);
      setCurrentPage('dashboard');
    }
  };

  const selectGoal = (goal: Wish) => {
    setSelectedGoalId(goal.id);
    setStasisText(goal.title);
    setCurrentState(goal.currentState ?? '');
    setError(null);
  };

  const resetIntake = () => {
    setStasisText('');
    setCurrentState('');
    setSelectedGoalId(null);
    setError(null);
    setResult(null);
    setPhase('intake');
  };

  const buttonPrimary = visual.primaryButton;
  const buttonGhost = visual.ghostButton;

  const heroCopy = channel === 'thief'
    ? {
      title: '今晚只夺回一件事',
      lead: '不用整理整个人生。终端会替你锁定一个大目标，再切出当前能下手的一步。',
      cta: '接下今晚的任务',
      signal: 'TARGET LOCK',
    }
    : channel === 'tv'
      ? {
        title: '深夜特别节目',
        lead: '',
        cta: 'LIVE NOW',
        signal: 'REC STASIS',
      }
      : {
        title: '今晚只接一件事',
        lead: '不要求你解释状态。系统会从愿望、压力和今日任务里接入一个方向，只返回一个能开始的动作。',
        cta: '接下今晚的任务',
        signal: 'TRACE READY',
      };

  const openManualIntake = () => {
    setError(null);
    setResult(null);
    setPhase('intake');
    setModalOpen(true);
  };

  const openQuickDecision = () => {
    setError(null);
    setResult(null);
    setStasisText('');
    setCurrentState('');
    setSelectedGoalId(null);
    setAutoCursor(0);
    setModalOpen(true);
    if (activeTask) {
      setPhase('intake');
      return;
    }
    if (candidateQueue.length === 0) {
      setPhase('intake');
      setError(`先在${memoryNoun}里放一个愿望或压力，然后交给终端决定。`);
      return;
    }
    void generate({ text: '', state: '', selectedGoalId: null, pickOffset: 0 });
  };

  const closeDiagnosis = () => {
    if (phase === 'generating') return;
    setModalOpen(false);
  };

  const tvIntakeContent = (
    <motion.div key="intake" {...visual.motion} className="space-y-3">
      <div className="relative overflow-hidden rounded-[1.6rem] border-[3px] border-black bg-[#fff7b0] p-4 text-black shadow-[0_5px_0_#111]">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-25" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,.2) 0px, rgba(0,0,0,.2) 1px, transparent 1px, transparent 4px)' }} />
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border-[14px] border-[#ff9a00]/45" />
        <div aria-hidden className="pointer-events-none absolute right-5 top-6 h-14 w-28 opacity-25" style={{ backgroundImage: 'radial-gradient(circle, #111 1.5px, transparent 2px)', backgroundSize: '8px 8px' }} />

        <div className="relative flex items-center gap-2">
          <span className="rounded-full border-[2px] border-black bg-[#24c8f2] px-3 py-1 text-[0.72rem] font-black uppercase tracking-[0.16em]">SCENE 01</span>
          <span className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-black/60">LIVE SCRIPT</span>
        </div>
        <h3 className="relative mt-3 text-2xl font-black leading-none">把卡住的镜头写成一句</h3>
        <p className="relative mt-2 text-sm font-black leading-relaxed text-black/72">
          只写一句就够。它会成为一个新入口，然后交给终端决定。
        </p>

        <div className="relative mt-4 rounded-[1.1rem] border-[3px] border-black bg-white shadow-[0_4px_0_rgba(0,0,0,.18)]">
          <textarea
            value={stasisText}
            onChange={(e) => {
              setStasisText(e.target.value);
              setSelectedGoalId(null);
            }}
            placeholder="一句话就够：论文写不下去 / 明天要汇报但脑子很乱 / 想学画画但停了很久"
            rows={4}
            className="min-h-[9.5rem] w-full resize-none rounded-[0.9rem] bg-white px-4 py-4 text-[1rem] font-black leading-relaxed text-black outline-none placeholder:text-black/32 focus:shadow-[inset_0_0_0_3px_#24c8f2]"
          />
        </div>
      </div>

      {goals.length > 0 && (
        <div className="relative overflow-hidden rounded-[1.2rem] border-[3px] border-[#111] bg-[#fff4b8] p-3 text-[#111] shadow-[0_4px_0_#ff9a00]">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-25 tv-crt-scanlines" />
          <div aria-hidden className="pointer-events-none absolute right-4 top-4 h-12 w-28 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, #111 1.5px, transparent 2px)', backgroundSize: '8px 8px' }} />
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[0.72rem] font-black uppercase tracking-[0.22em] text-[#24c8f2]">PROGRAM ROUTE</span>
            <span className="h-[2px] flex-1 bg-[#111]/20" />
          </div>
          <div className="relative flex snap-x gap-2 overflow-x-auto pb-1">
            {goals.slice(0, 6).map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => selectGoal(goal)}
                className={`snap-start min-h-[3.5rem] min-w-[10rem] max-w-[13rem] rounded-xl border-[2px] px-3 py-2 text-left text-xs font-black transition ${
                  selectedGoalId === goal.id
                    ? 'border-[#111] bg-[#24c8f2] text-black shadow-[0_3px_0_#111]'
                    : 'border-[#111]/55 bg-[#fff8d6] text-[#111] hover:border-[#111]'
                }`}
              >
                <span className="block truncate">{goal.title}</span>
                <span className="mt-1 block truncate text-[10px] opacity-65">
                  {historyLineForGoal(goal) ?? (goal.kind === 'pressure' ? '短期压力' : '长期愿望')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!stasisText.trim() && !selectedGoalId && (goals.length > 0 || dueTodos.length > 0) && (
        <div className="rounded-2xl border-[2px] border-black bg-[#fff4b8] px-4 py-3 text-sm font-black leading-relaxed text-black shadow-[0_3px_0_#ff9a00]">
          不写也可以，终端会按节目单顺序接入第一件未完成的小步。
        </div>
      )}

      {error && <div className="rounded-2xl border-[2px] border-black bg-[#fff4b8] px-4 py-3 text-sm font-black leading-relaxed text-black shadow-[0_3px_0_#ff9a00]">{error}</div>}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!stasisText.trim() && !selectedGoalId && !goals.length && !dueTodos.length}
          className="min-h-[4.5rem] rounded-full border-[3px] border-black bg-[#090906] px-8 text-lg font-black text-[#ffe100] shadow-[0_6px_0_#ff6a00] transition hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#ff6a00] disabled:opacity-40"
        >
          {copy.generate}
        </button>
        {(stasisText || selectedGoalId || currentState) && (
          <button type="button" onClick={resetIntake} className="min-h-[3.25rem] rounded-full border-[3px] border-black bg-[#fff7b0] px-5 text-sm font-black text-black">
            清空
          </button>
        )}
      </div>
    </motion.div>
  );

  const intakeContent = channel === 'tv' ? tvIntakeContent : (
    <motion.div key="intake" {...visual.motion}>
      <div className={visual.inputWrap} style={{ clipPath: visual.key === 'p4' ? undefined : visual.clip }}>
        <div className={visual.metricLabel}>{copy.intake}</div>
        <div className="mb-2 mt-1 text-xs font-bold opacity-65">
          只写一句就够。它会成为一个新入口，之后终端会替你接着走。
        </div>
        <textarea
          value={stasisText}
          onChange={(e) => {
            setStasisText(e.target.value);
            setSelectedGoalId(null);
          }}
          placeholder="一句话就够：论文写不下去 / 明天要汇报但脑子很乱 / 想学画画但停了很久"
          rows={4}
          className={visual.input}
        />
      </div>

      {goals.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/55">memory route</div>
          <div className="flex snap-x gap-2 overflow-x-auto pb-1">
            {goals.slice(0, 6).map((goal) => (
              <button
                key={goal.id}
                type="button"
                onClick={() => selectGoal(goal)}
                style={{ clipPath: visual.key === 'p4' ? undefined : visual.clip }}
                className={`snap-start min-h-[52px] min-w-[9.5rem] max-w-[13rem] px-3 py-2 text-left text-xs font-black transition ${
                  selectedGoalId === goal.id
                    ? visual.selectedMemory
                    : visual.idleMemory
                }`}
              >
                <span className="block truncate">{goal.title}</span>
                <span className="mt-1 block truncate text-[10px] opacity-60">
                  {historyLineForGoal(goal) ?? (goal.kind === 'pressure' ? '短期压力' : '长期愿望')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!stasisText.trim() && !selectedGoalId && (goals.length > 0 || dueTodos.length > 0) && (
        <div className={`mt-3 ${visual.notePanel}`} style={{ clipPath: visual.key === 'p4' ? undefined : visual.clip }}>
          也可以什么都不写，终端会按已有愿望和今日压力的顺序接入第一件未完成的小步。
        </div>
      )}

      {error && <div className={`mt-3 ${visual.notePanel}`} style={{ clipPath: visual.key === 'p4' ? undefined : visual.clip }}>{error}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!stasisText.trim() && !selectedGoalId && !goals.length && !dueTodos.length}
          className={`${buttonPrimary} disabled:opacity-40`}
        >
          {copy.generate}
        </button>
        {(stasisText || selectedGoalId || currentState) && (
          <button type="button" onClick={resetIntake} className={buttonGhost}>
            清空
          </button>
        )}
      </div>
    </motion.div>
  );

  const resultContent = result && (
    <motion.div key="result" {...visual.motion}>
      <div className={`relative overflow-hidden ${visual.actionPanel}`} style={{ clipPath: visual.actionClip }}>
        <div aria-hidden className="absolute inset-0 opacity-35" style={{ background: visual.actionPattern }} />
        <div className="relative">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={visual.badge}>
              {result.continuation === 'today' ? '今日压力' : result.diagnosis.kind === 'pressure' ? '短期压力' : '长期愿望'}
            </span>
            <span className="text-[10px] font-black uppercase opacity-55">{result.usedAI ? 'AI ROUTE' : 'LOCAL ROUTE'}</span>
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-55">这次处理</div>
          <h3 className="mt-1 break-words text-2xl font-black leading-tight">「{result.sourceLabel}」</h3>
          <p className="mt-3 text-sm font-bold leading-relaxed opacity-75">{result.diagnosis.principle}</p>
          {(result.historyLine || result.queueLine) && (
            <p className="mt-2 text-xs font-bold leading-relaxed opacity-60">
              {result.historyLine ?? result.queueLine}
            </p>
          )}
          <div className="mt-5 border-t-2 border-current/25 pt-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] opacity-55">{copy.result}</div>
            <p className={visual.actionText}>{result.action}</p>
            <p className="mt-3 text-xs font-bold leading-relaxed opacity-65">接下后会回到首页。完成它只记录一次启动，不会把原目标直接判完。</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={accept} className={buttonPrimary}>{copy.accept}</button>
        <button type="button" onClick={() => void generate()} className={buttonGhost}>{copy.redo}</button>
        <button type="button" onClick={resetIntake} className={buttonGhost}>重新描述</button>
      </div>
    </motion.div>
  );

  const diagnosisContent = activeTask ? (
    <div className={`relative overflow-hidden ${visual.actionPanel}`} style={{ clipPath: visual.actionClip }}>
      <div aria-hidden className="absolute inset-0 opacity-35" style={{ background: visual.actionPattern }} />
      <div className="relative">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={visual.badge}>{visual.lockLabel}</span>
          <span className="text-[10px] font-black uppercase opacity-55">one step only</span>
        </div>
        <p className={visual.actionText}>{activeTask.title}</p>
        <p className="mt-3 text-sm font-bold leading-relaxed opacity-65">
          这一步还在流动。你现在不用处理整个人生，只处理这一件。完成它之后，诊断室会重新开放新的入口。
        </p>
      </div>
    </div>
  ) : (
    <AnimatePresence mode="wait">
      {phase === 'intake' && intakeContent}
      {phase === 'generating' && (
        <motion.div key="generating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`flex min-h-[16rem] flex-col items-center justify-center gap-3 text-center ${visual.notePanel}`} style={{ clipPath: visual.key === 'p4' ? undefined : visual.clip }}>
          <motion.div
            aria-hidden
            className={visual.key === 'p5' ? 'h-16 w-16 border-[4px] border-[#f7f4ea] bg-[#050505]' : visual.key === 'p4' ? 'h-16 w-16 rounded-full border-[4px] border-[#ffe100] bg-[#20bff2]' : 'h-16 w-16 border border-[#00d8ff] bg-[#001141]/75'}
            animate={bold ? { rotate: [0, 90, 180, 270, 360], borderRadius: ['16%', '50%', '16%'] } : { opacity: 1 }}
            transition={bold ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
          />
          <div className="text-sm font-bold opacity-75">正在判断停滞点，只保留一个下一步…</div>
        </motion.div>
      )}
      {phase === 'result' && resultContent}
    </AnimatePresence>
  );

  const modal = typeof document === 'undefined' ? null : createPortal(
    <AnimatePresence>
      {modalOpen && (
        <motion.div
          className={`fixed inset-0 ${zClass.modal} flex items-end justify-center bg-black/80 px-3 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:p-6`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={closeDiagnosis}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-45" style={{ background: visual.backdropPattern, backgroundSize: visual.key === 'p5' ? '9px 9px' : undefined }} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stagnation-dialog-title"
            className={`relative w-full max-w-2xl overflow-hidden ${visual.dialogPanel}`}
            style={{ maxHeight: 'min(86vh, 760px)', clipPath: visual.key === 'p4' ? undefined : visual.clip }}
            {...visual.motion}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20" style={{ background: visual.heroPattern }} />
            <header className={`relative flex items-start gap-3 px-4 py-3 sm:px-5 ${visual.dialogHeader}`}>
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[10px] font-black uppercase tracking-[4px] opacity-70">{copy.eyebrow}</div>
                <h2 id="stagnation-dialog-title" className="text-xl font-black leading-tight">{copy.title}</h2>
              </div>
              <button
                type="button"
                aria-label="关闭诊断"
                onClick={closeDiagnosis}
                disabled={phase === 'generating'}
                className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-current text-lg font-black leading-none transition hover:scale-105 disabled:opacity-40"
              >
                ✕
              </button>
            </header>
            <div className="relative max-h-[calc(86vh-5rem)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
              {diagnosisContent}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );

  const pressureCount = goals.filter((goal) => goal.kind === 'pressure').length + dueTodos.length;
  const longTermCount = goals.filter((goal) => goal.kind !== 'pressure').length;
  const heroStatus = activeTask
    ? `当前正在执行：「${activeTask.title}」`
    : candidateQueue.length > 0
      ? `${pressureCount} 个压力入口 · ${longTermCount} 个长期愿望`
      : `还没有入口。先在${memoryNoun}里放一件事`;

  if (channel === 'tv') {
    return (
      <>
        <section className="relative mb-5">
          <motion.button
            type="button"
            onClick={openQuickDecision}
            whileTap={{ scale: 0.988 }}
            aria-label={activeTask ? '查看当前小步' : 'LIVE NOW'}
            className="group relative block min-h-[25.5rem] w-full overflow-hidden rounded-[2rem] border-[3px] border-black bg-[#ffe100] px-5 py-6 text-left text-black shadow-[0_5px_0_#090906] sm:min-h-[30rem] sm:px-7 sm:py-7"
          >
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-35" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0px, rgba(0,0,0,.18) 1px, transparent 1px, transparent 4px)' }} />
            <div aria-hidden className="pointer-events-none absolute -right-10 top-2 h-72 w-72 rounded-full border-[18px] border-[#ff9a00]/45" />
            <div aria-hidden className="pointer-events-none absolute right-[18%] top-[20%] h-72 w-72 rounded-full border-[4px] border-white/55" />
            <div aria-hidden className="pointer-events-none absolute right-16 top-8 h-24 w-44 opacity-25" style={{ backgroundImage: 'radial-gradient(circle, #111 1.6px, transparent 2px)', backgroundSize: '10px 10px' }} />
            <div aria-hidden className="pointer-events-none absolute bottom-6 left-7 h-24 w-24 opacity-35" style={{ backgroundImage: 'radial-gradient(circle, #111 1.8px, transparent 2.4px)', backgroundSize: '9px 9px' }} />

            <div aria-hidden className="pointer-events-none absolute left-0 top-[5.7rem] h-[17rem] w-[56%] overflow-hidden sm:top-[6.4rem] sm:h-[19rem]" style={{ clipPath: 'polygon(0 12%, 100% 0, 38% 100%, 0 100%)' }}>
              <img
                src="/assets/terminal/p4-cloud-sky.png"
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: '34% 68%', filter: 'saturate(1.16) contrast(1.08)' }}
              />
              <div className="absolute inset-0 bg-[#00a6ff]/10 mix-blend-screen" />
            </div>

            <div aria-hidden className="pointer-events-none absolute right-16 top-[3.4rem] h-[66%] w-[0.22rem] bg-[#e62416]" />
            <div aria-hidden className="pointer-events-none absolute right-11 top-[6.2rem] h-[67%] w-[0.22rem] bg-[#ff6a00]" />
            <div aria-hidden className="pointer-events-none absolute right-7 top-[14rem] h-[46%] w-[0.22rem] bg-[#12cce4]" />
            <div aria-hidden className="pointer-events-none absolute right-4 top-[15rem] h-[45%] w-[0.22rem] bg-[#006bff]" />

            <div aria-hidden className="pointer-events-none absolute right-4 top-5 rounded-2xl bg-black px-4 py-4 text-center text-[#ffe100] shadow-[0_4px_0_#ff6a00]">
              <div className="text-xl font-black leading-none">CH</div>
              <div className="mt-1 text-2xl font-black leading-none">04</div>
              <div className="mx-auto my-2 h-[2px] w-9 bg-[#ffe100]" />
              <div className="[writing-mode:vertical-rl] text-sm font-black tracking-[0.18em]">CHANNEL</div>
            </div>
            <div aria-hidden className="pointer-events-none absolute right-[22%] top-[6.8rem] text-5xl font-black leading-none">✽</div>
            <div aria-hidden className="pointer-events-none absolute bottom-[5.45rem] right-5 text-4xl font-black leading-none">✽</div>
            <div aria-hidden className="pointer-events-none absolute bottom-[7.8rem] left-8 text-3xl font-black leading-none">✦</div>

            <div className="absolute left-5 top-[2.65rem] z-10 sm:left-7 sm:top-[3rem]">
              <div className="flex items-center gap-4">
                <span className="rounded-full border-[3px] border-black bg-[#24c8f2] px-4 py-1.5 text-[0.95rem] font-black uppercase tracking-[0.12em] text-black shadow-[0_2px_0_#111]">
                  {heroCopy.signal}
                </span>
                <span className="text-[0.9rem] font-black uppercase tracking-[0.3em] text-black/85">
                  {activeTask ? 'ON AIR' : 'READY'}
                </span>
              </div>
            </div>

            <div className="absolute left-5 top-[7.25rem] z-10 sm:left-7 sm:top-[8.2rem]">
              <h2 className="whitespace-nowrap text-[2.75rem] font-black leading-none tracking-normal text-black sm:text-[4rem]">
                {heroCopy.title}
              </h2>
            </div>

            <div className="absolute bottom-8 left-6 right-8 z-10 sm:left-8 sm:right-10">
              <div className="relative inline-flex w-full max-w-[34rem] items-center gap-5 rounded-full border-[3px] border-black bg-[#090906] px-5 py-4 text-[#ffe9a2] shadow-[0_7px_0_#ff6a00] transition-transform group-hover:-translate-y-0.5 group-active:translate-y-1 group-active:shadow-[0_2px_0_#ff6a00] sm:px-7">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[2px] border-[#ffe100] bg-black text-3xl text-[#ffe100] shadow-[inset_0_0_0_1px_rgba(255,225,0,.25)]" aria-hidden>
                  ▶
                </span>
                <span className="min-w-0 flex-1 text-[2.2rem] font-black italic leading-none tracking-wide text-[#fff0a8] sm:text-[2.65rem]">
                  {activeTask ? 'ON AIR' : heroCopy.cta}
                </span>
                <span className="absolute -bottom-3 right-8 rotate-[-4deg] rounded-full border-[3px] border-black bg-[#ffe100] px-3 py-0.5 text-[0.72rem] font-black tracking-[0.16em] text-black shadow-[0_2px_0_#ff6a00]">
                  ● ON AIR
                </span>
              </div>
            </div>
          </motion.button>
        </section>
        {modal}
      </>
    );
  }

  return (
    <>
      <section className="relative mb-5">
        <motion.button
          type="button"
          onClick={openQuickDecision}
          whileTap={{ scale: 0.985 }}
          className={`relative block min-h-[18rem] w-full overflow-hidden px-5 py-5 text-left sm:min-h-[20rem] sm:px-7 sm:py-7 ${visual.heroShell}`}
          style={{ clipPath: visual.key === 'p4' ? undefined : visual.clip }}
        >
          <div aria-hidden className={`pointer-events-none absolute inset-0 ${visual.heroBackdrop}`} />
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ background: visual.heroPattern, backgroundSize: visual.key === 'p5' ? '8px 8px' : undefined }} />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/2 opacity-35"
            style={{
              background: visual.key === 'p4'
                ? 'linear-gradient(110deg, transparent, rgba(255,255,255,.55), transparent)'
                : 'linear-gradient(110deg, transparent, rgba(255,255,255,.18), transparent)',
            }}
            animate={bold ? { x: ['0%', '280%'] } : undefined}
            transition={bold ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
          />

          <div className="relative flex min-h-[15.5rem] flex-col justify-between sm:min-h-[17rem]">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className={visual.badge}>{heroCopy.signal}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                  {activeTask ? 'ON AIR' : 'READY'}
                </span>
              </div>
              <h2 className={`max-w-[15ch] text-4xl leading-[0.96] sm:text-5xl ${visual.heroTitle}`}>{heroCopy.title}</h2>
              <p className={`mt-4 ${visual.heroLead}`}>{heroCopy.lead}</p>
            </div>

            <div className="mt-8">
              <div className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] opacity-60">{heroStatus}</div>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={visual.key === 'p4' ? 'flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] border-[#111] bg-[#111] text-[#ffe100] shadow-[0_5px_0_#ff6a00]' : 'flex h-14 w-14 shrink-0 items-center justify-center border-2 border-current bg-current/10 text-2xl font-black'}
                >
                  ▶
                </span>
                <span className="min-w-0 text-2xl font-black leading-tight sm:text-3xl">
                  {activeTask ? '查看当前小步' : heroCopy.cta}
                </span>
              </div>
            </div>
          </div>
        </motion.button>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={openManualIntake} className={buttonGhost}>
            我自己说一句
          </button>
          <button type="button" onClick={onOpenMemory} className={buttonGhost}>
            {copy.memory}
          </button>
        </div>
      </section>
      {modal}
    </>
  );
};
