import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { zClass } from '@/utils/zIndex';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBackHandler } from '@/utils/useBackHandler';
import { triggerLightHaptic, playSound } from '@/utils/feedback';
import type { CallingCard } from '@/types';

interface Props {
  card: CallingCard | null;
  onClose: () => void;
}

/**
 * 宣告·达成 / 时之至 全屏结算屏（v2.2 cinematic 重写）。
 *
 * 触发：
 *   - sweepCallingCards 把达成 / 过期的卡 archive → cutInShown=false
 *   - completeTodo 完成最后一项关联待办时也会 sweep，立即弹出（不必等回 Dashboard）
 *   - App.tsx 顶层 GlobalCallingCardCutIn 取队首一张渲染
 *
 * 动画分镜（约 1.6s 入场）：
 *   ① 0.00–0.25s: 黑底 flash + 主题色 radial 冲击波从中心扩散，斜条纹底纹随后铺入
 *   ② 0.25–0.55s: "CALLING CARD" tracking 字符 stagger 揭出
 *   ③ 0.40–0.80s: "宣告·达成 / 时之至" 大字带 motion-blur shutter 揭幕（clip-path 横向开合）
 *   ④ 0.65–1.05s: 卡身 box 弹入；title spring，subtitle 跟入；同时一道斜向 sweep 高光从左上掠到右下
 *   ⑤ 1.00–1.30s: 印章 SLAM —— 从 scale 3 砸到 1，触发径向 shockwave ring + 粒子四溅
 *   ⑥ 1.30–1.70s: 操作按钮淡入；底部"─ Velvet"落款渐显
 *
 * 持续效果：
 *   - 微小相机抖动 (印章 SLAM 后 350ms)
 *   - 浮升金粒子（fixed inset 12 颗）
 *   - 主题色径向光晕 1.6s 慢呼吸
 */

/**
 * ── 四频道皮（用户口径：这块要按三个主题 + 粉色各自的风格重做）─────────────
 *
 * 这曾是宣告卡里**唯一没有频道分支**的一块：底色、字体、印章、粒子全跟着
 * var(--color-primary) 换个色调就算数，于是在黄的拼贴舞台和红的报纸舞台上都很出戏
 * ——四个主题下它长得一模一样，只是色相不同。
 *
 * 分镜（六段编排）保持不变，换的是皮：底纹语言、标题字形、卡身形状、印章形制、
 * 粒子与按钮。粉色**单独成一档**而不是跟着蓝走：p3 那套是硬斜切 + 青洋红对撞，
 * 粉主题的性格是柔的，硬边在这里读起来像另一个 app。
 */
type CutinSkinKey = 'p3' | 'p4' | 'p5' | 'pink' | 'neutral';

interface CutinSkin {
  /** 全屏底 */
  bg: string;
  /** 底纹语言 */
  texture: 'stripes' | 'halftone' | 'caustics' | 'bokeh';
  /** 冲击波 / 呼吸光晕的颜色 */
  flash: string;
  flashSoft: string;
  /** 眉标 ✦ CALLING CARD ✦ */
  eyebrowInk: string;
  eyebrowTrack: string;
  /** 主标题（宣告·时之至） */
  headFont: string;
  headSize: string;
  headInk: string;
  headItalic: boolean;
  /** 白描边：黄/蓝这种高饱和底上，纯色大字需要描边才立得住 */
  headStroke?: string;
  headShadow: string;
  /** 副标题 */
  hintInk: string;
  /** 卡身 */
  panelBg: string;
  panelBorder: string;
  panelRadius: number;
  panelClip?: string;
  panelShadow?: string;
  /** 卡内标题 */
  titleFont: string;
  titleInk: string;
  titleShadow: string;
  subInk: string;
  iconInk: string;
  /** 印章 */
  stampInk: string;
  stampBg: string;
  stampBorder: string;
  stampRadius: number;
  stampRotate: number;
  /** 粒子 / 尘屑 */
  particle: string;
  /** 按钮 */
  btnBg: string;
  btnInk: string;
  btnDoneBg: string;
  ghostBg: string;
  ghostInk: string;
  /** 落款 */
  signInk: string;
  signFont: string;
}

const CUTIN_SKIN: Record<CutinSkinKey, CutinSkin> = {
  /** 蓝 · 水下斜切：深靛底 + 青色焦散 + 硬斜切卡身 + 青/洋红贴角（同 p3-modal 语言） */
  p3: {
    bg: 'linear-gradient(150deg, #061437 0%, #0a2358 52%, #02060f 100%)',
    texture: 'caustics',
    flash: 'rgba(53,209,232,0.55)',
    flashSoft: 'rgba(27,87,255,0.28)',
    eyebrowInk: 'rgba(207,234,246,0.75)',
    eyebrowTrack: '6px',
    headFont: '"Arial Black", "Noto Sans SC Black", "Noto Sans SC", sans-serif',
    headSize: '3.1rem',
    headInk: '#ffffff',
    headItalic: true,
    headStroke: undefined,
    headShadow: '0 4px 26px rgba(53,209,232,0.6)',
    hintInk: 'rgba(207,234,246,0.72)',
    panelBg: 'rgba(255,255,255,0.95)',
    panelBorder: 'transparent',
    panelRadius: 0,
    panelClip: 'polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)',
    panelShadow: '0 22px 50px rgba(3,20,58,0.6)',
    titleFont: '"Noto Sans SC Black", "Noto Sans SC", sans-serif',
    titleInk: '#0a3bd6',
    titleShadow: 'none',
    subInk: '#3d4a66',
    iconInk: '#35d1e8',
    stampInk: '#ffffff',
    stampBg: '#1b57ff',
    stampBorder: '#1b57ff',
    stampRadius: 0,
    stampRotate: -7,
    particle: '#7fe3f4',
    btnBg: '#1b57ff',
    btnInk: '#ffffff',
    btnDoneBg: 'rgba(27,87,255,0.35)',
    ghostBg: 'rgba(255,255,255,0.1)',
    ghostInk: 'rgba(226,242,250,0.85)',
    signInk: 'rgba(207,234,246,0.6)',
    signFont: "'Caveat', cursive",
  },

  /** 黄 · 拼贴贴纸：奶油底 + 墨色斜章标题 + 硬投影卡身 + 橙星花 */
  p4: {
    bg: 'linear-gradient(160deg, #ffd900 0%, #ffb61c 58%, #f08a00 100%)',
    texture: 'bokeh',
    flash: 'rgba(255,255,255,0.7)',
    flashSoft: 'rgba(255,246,208,0.42)',
    eyebrowInk: 'rgba(19,19,19,0.72)',
    eyebrowTrack: '5px',
    headFont: 'var(--p4-display-font, Georgia, serif)',
    headSize: '3.2rem',
    headInk: '#131313',
    headItalic: false,
    headShadow: '3px 3px 0 rgba(255,255,255,0.55)',
    hintInk: 'rgba(19,19,19,0.7)',
    panelBg: '#fff9e3',
    panelBorder: '#131313',
    panelRadius: 20,
    panelShadow: '0 10px 0 rgba(19,19,19,0.32)',
    titleFont: 'var(--p4-display-font, Georgia, serif)',
    titleInk: '#131313',
    titleShadow: 'none',
    subInk: 'rgba(19,19,19,0.62)',
    iconInk: '#f9a11b',
    stampInk: '#ffd900',
    stampBg: '#131313',
    stampBorder: '#131313',
    stampRadius: 8,
    stampRotate: -10,
    particle: '#fff6d0',
    btnBg: '#131313',
    btnInk: '#ffd900',
    btnDoneBg: 'rgba(19,19,19,0.35)',
    ghostBg: 'rgba(19,19,19,0.1)',
    ghostInk: '#131313',
    signInk: 'rgba(19,19,19,0.6)',
    signFont: 'var(--p4-display-font, Georgia, serif)',
  },

  /** 红 · 报纸撕边：纯黑舞台 + 猩红 + 米白纸卡 + 网点 */
  p5: {
    bg: 'linear-gradient(135deg, #000000 0%, #1a0003 55%, #000000 100%)',
    texture: 'halftone',
    flash: 'rgba(192,0,8,0.7)',
    flashSoft: 'rgba(192,0,8,0.3)',
    eyebrowInk: 'rgba(240,233,223,0.7)',
    eyebrowTrack: '7px',
    headFont: '"Arial Black", "Noto Sans SC Black", "Noto Sans SC", sans-serif',
    headSize: '3.3rem',
    headInk: '#f0e9df',
    headItalic: true,
    headShadow: '4px 4px 0 #c00008',
    hintInk: 'rgba(240,233,223,0.68)',
    panelBg: '#f0e9df',
    panelBorder: '#050505',
    panelRadius: 0,
    panelClip: 'polygon(1.5% 0, 100% 2%, 98% 100%, 0 97%)',
    panelShadow: '7px 8px 0 #c00008',
    titleFont: '"Noto Sans SC Black", "Noto Sans SC", sans-serif',
    titleInk: '#050505',
    titleShadow: 'none',
    subInk: '#494540',
    iconInk: '#c00008',
    stampInk: '#f0e9df',
    stampBg: '#c00008',
    stampBorder: '#050505',
    stampRadius: 0,
    stampRotate: -14,
    particle: '#ff5a5a',
    btnBg: '#c00008',
    btnInk: '#f0e9df',
    btnDoneBg: 'rgba(192,0,8,0.38)',
    ghostBg: 'rgba(240,233,223,0.12)',
    ghostInk: 'rgba(240,233,223,0.85)',
    signInk: 'rgba(240,233,223,0.6)',
    signFont: "'Caveat', cursive",
  },

  /** 粉 · 独立一档：夜樱紫红底 + 柔光 + 圆角玫瑰金卡，全程无硬边 */
  pink: {
    bg: 'linear-gradient(150deg, #2a0c22 0%, #5c1440 55%, #170512 100%)',
    texture: 'bokeh',
    flash: 'rgba(255,168,209,0.55)',
    flashSoft: 'rgba(236,72,153,0.26)',
    eyebrowInk: 'rgba(255,225,240,0.72)',
    eyebrowTrack: '6px',
    headFont: "'Caveat', cursive",
    headSize: '3.6rem',
    headInk: '#ffe1ef',
    headItalic: false,
    headShadow: '0 4px 26px rgba(255,138,190,0.65)',
    hintInk: 'rgba(255,225,240,0.7)',
    panelBg: 'rgba(255,241,247,0.96)',
    panelBorder: 'rgba(236,72,153,0.5)',
    panelRadius: 26,
    panelShadow: '0 22px 48px rgba(90,10,60,0.55)',
    titleFont: "'Caveat', cursive",
    titleInk: '#b0296b',
    titleShadow: 'none',
    subInk: '#a3707f',
    iconInk: '#ec4899',
    stampInk: '#ffffff',
    stampBg: '#ec4899',
    stampBorder: 'rgba(255,255,255,0.7)',
    stampRadius: 999,
    stampRotate: -8,
    particle: '#ffc8e0',
    btnBg: '#ec4899',
    btnInk: '#ffffff',
    btnDoneBg: 'rgba(236,72,153,0.35)',
    ghostBg: 'rgba(255,255,255,0.12)',
    ghostInk: 'rgba(255,225,240,0.85)',
    signInk: 'rgba(255,225,240,0.6)',
    signFont: "'Caveat', cursive",
  },

  /** 自定义主题：保留原来那套跟随 --color-primary 的中性演出 */
  neutral: {
    bg: 'linear-gradient(135deg, color-mix(in hsl, var(--color-primary) 12%, #0a0a0d) 0%, color-mix(in hsl, var(--color-primary) 22%, #14141a) 60%, #02020a 100%)',
    texture: 'stripes',
    flash: 'color-mix(in hsl, var(--color-primary) 60%, transparent)',
    flashSoft: 'color-mix(in hsl, var(--color-primary) 25%, transparent)',
    eyebrowInk: 'rgba(255,255,255,0.55)',
    eyebrowTrack: '6px',
    headFont: "'Caveat', cursive",
    headSize: '3rem',
    headInk: 'var(--color-primary)',
    headItalic: false,
    headShadow: '0 2px 16px color-mix(in hsl, var(--color-primary) 60%, transparent)',
    hintInk: 'rgba(255,255,255,0.7)',
    panelBg: 'rgba(0,0,0,0.32)',
    panelBorder: 'var(--color-primary)',
    panelRadius: 12,
    titleFont: "'Caveat', cursive",
    titleInk: '#ffffff',
    titleShadow: '0 0 24px color-mix(in hsl, var(--color-primary) 60%, transparent)',
    subInk: 'rgba(255,255,255,0.6)',
    iconInk: 'rgba(255,255,255,0.85)',
    stampInk: 'var(--color-primary)',
    stampBg: 'rgba(0,0,0,0.4)',
    stampBorder: 'var(--color-primary)',
    stampRadius: 6,
    stampRotate: -12,
    particle: 'color-mix(in hsl, var(--color-primary) 70%, #fff)',
    btnBg: 'var(--color-primary)',
    btnInk: '#ffffff',
    btnDoneBg: 'color-mix(in hsl, var(--color-primary) 30%, transparent)',
    ghostBg: 'rgba(255,255,255,0.06)',
    ghostInk: 'rgba(255,255,255,0.7)',
    signInk: 'rgba(255,255,255,0.6)',
    signFont: "'Caveat', cursive",
  },
};

/** 底纹：四种语言各画一张全屏 SVG（都是静态 pattern，零逐帧成本） */
const CutinTexture = ({ kind, ink }: { kind: CutinSkin['texture']; ink: string }) => {
  const id = `cutin-tex-${kind}`;
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full pointer-events-none">
      <defs>
        {kind === 'stripes' && (
          <pattern id={id} patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
          </pattern>
        )}
        {kind === 'halftone' && (
          <pattern id={id} patternUnits="userSpaceOnUse" width="12" height="12">
            <circle cx="3" cy="3" r="1.9" fill={ink} opacity="0.22" />
            <circle cx="9" cy="9" r="1.2" fill={ink} opacity="0.14" />
          </pattern>
        )}
        {kind === 'caustics' && (
          <pattern id={id} patternUnits="userSpaceOnUse" width="90" height="70" patternTransform="rotate(-12)">
            <path d="M0 40 Q22 18 45 40 T90 40" fill="none" stroke={ink} strokeWidth="1.6" opacity="0.2" />
            <path d="M0 62 Q22 44 45 62 T90 62" fill="none" stroke={ink} strokeWidth="1" opacity="0.12" />
          </pattern>
        )}
        {kind === 'bokeh' && (
          <pattern id={id} patternUnits="userSpaceOnUse" width="72" height="72">
            <circle cx="18" cy="20" r="9" fill={ink} opacity="0.1" />
            <circle cx="54" cy="52" r="14" fill={ink} opacity="0.07" />
            <circle cx="60" cy="14" r="4" fill={ink} opacity="0.12" />
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
};

export function CallingCardCutIn({ card, onClose }: Props) {
  // 逐字段订阅（A2）：本组件在 App 顶层常驻（多数时间不显形），
  // 无选择器订阅会让它跟着每一次 store 写入白重渲染一遍，连带整棵子树
  const writeCallingCardLedger = useAppStore(s => s.writeCallingCardLedger);
  const markCallingCardCutInShown = useAppStore(s => s.markCallingCardCutInShown);
  // 皮按频道选，粉色单独一档（它和蓝共用 p3 频道，但性格是柔的，不能共用硬斜切那套）
  const channel = useUiChannel();
  const theme = useAppStore(s => s.user?.theme);
  const S = CUTIN_SKIN[
    theme === 'pink' ? 'pink'
      : channel === 'p3' ? 'p3'
        : channel === 'p4' ? 'p4'
          : channel === 'p5' ? 'p5'
            : 'neutral'
  ];
  const [ledgerWriting, setLedgerWriting] = useState(false);
  const [ledgered, setLedgered] = useState(false);
  // 印章是否已经 SLAM（控制 shockwave 触发时机）
  const [stampLanded, setStampLanded] = useState(false);
  const cardKeyRef = useRef<string | null>(null);

  // 进入时播一次主题音 + 触感
  useEffect(() => {
    if (!card) {
      cardKeyRef.current = null;
      setStampLanded(false);
      return;
    }
    if (cardKeyRef.current === card.id) return;
    cardKeyRef.current = card.id;
    setStampLanded(false);
    triggerLightHaptic();
    playSound('/battle-fanfare.mp3', 0.6);
    setLedgered(!!card.ledgerWritten);
    // 印章 SLAM 时间点：约 1.05s（与 framer-motion delay 对齐）
    const t = setTimeout(() => {
      setStampLanded(true);
      // SLAM 时再来一次轻触感，制造"砸下来"的物理感
      triggerLightHaptic();
    }, 1050);
    return () => clearTimeout(t);
  }, [card?.id]);

  const handleClose = async () => {
    if (card) await markCallingCardCutInShown(card.id);
    onClose();
  };

  useBackHandler(!!card, handleClose);

  const onLedger = async () => {
    if (!card || ledgered || ledgerWriting) return;
    setLedgerWriting(true);
    try {
      await writeCallingCardLedger(card.id);
      setLedgered(true);
    } finally {
      setLedgerWriting(false);
    }
  };

  // 浮升粒子的随机参数（card 切换时重算）
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        leftPct: Math.random() * 100,
        size: 1.5 + Math.random() * 2.5,
        duration: 5 + Math.random() * 5,
        delay: Math.random() * 2,
        opacity: 0.25 + Math.random() * 0.4,
      })),
    [card?.id],
  );
  // 印章 SLAM 时四溅的尘屑（8 片，由 stampLanded 触发）
  const dust = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
        return {
          id: i,
          x: Math.cos(angle) * (60 + Math.random() * 40),
          y: Math.sin(angle) * (60 + Math.random() * 40),
          size: 2 + Math.random() * 2,
          duration: 0.6 + Math.random() * 0.3,
        };
      }),
    [card?.id, stampLanded],
  );

  // B14 根治（UI_AUDIT_V2.5.md §2）：原先这里有 `if (!card) return null` ——
  // 它位于 AnimatePresence 外侧，card 变 null 时整个组件（连同 AnimatePresence）
  // 直接卸载，exit 淡出从不播放。现改为始终渲染 AnimatePresence，把条件留给
  // 内部的 {card && …}，关闭时 exit 才能真正播完。
  // 下面的派生值在 card 为 null 时落到兜底分支，但不会被渲染（exit 期间
  // AnimatePresence 展示的是上一次渲染的快照），仅为通过 TS 空值检查。
  const reasonHeading =
    card?.archiveReason === 'auto_date'
      ? '宣告 · 时之至'
      : card?.archiveReason === 'auto_todos'
      ? '宣告 · 达成'
      : '宣告 · 已收';
  const reasonStamp = card?.archiveReason === 'auto_date' ? 'EXPIRED' : 'CLEARED';
  const reasonHint =
    card?.archiveReason === 'auto_date'
      ? '约定的那一日已经到来。'
      : card?.archiveReason === 'auto_todos'
      ? '所有任务已被你跨过。'
      : '收存于档案。';

  // ── 字符 stagger 用：把"✦ CALLING CARD ✦"切碎 ──
  const headerLetters = ['✦', ' ', 'C', 'A', 'L', 'L', 'I', 'N', 'G', ' ', 'C', 'A', 'R', 'D', ' ', '✦'];

  // portal 到 body：脱离 App.tsx `relative z-10` stacking context（见 zIndex.ts 头注释），
  // 使 zClass.cutin（120，与原 z-[120] 同值，仅统一出处）在 body 级阶梯中真实生效。
  // createPortal 必须包在 AnimatePresence 外侧，否则 exit 失效（参考 ConfirmDialog）。
  return createPortal(
    <AnimatePresence>
      {card && (
        <motion.div
          key={card.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`fixed inset-0 ${zClass.cutin} flex items-center justify-center p-6`}
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
          aria-label="宣告卡 · 达成"
        >
          {/* ① 黑底 + 主题色径向冲击波（从中心向外脉冲） */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: S.bg }} />
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 0.85, 0.4, 0.5], scale: [0.4, 1.4, 1.0, 1.05] }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${S.flash} 0%, transparent 55%)`,
            }}
          />
          {/* 慢呼吸（持续） */}
          <motion.div
            aria-hidden
            animate={{ opacity: [0.3, 0.55, 0.3] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${S.flashSoft} 0%, transparent 55%)`,
            }}
          />

          {/* 底纹（频道语言：蓝焦散 / 黄光斑 / 红网点 / 中性斜条纹），从顶部滑入 */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 0.55, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
            className="absolute inset-0 pointer-events-none"
          >
            <CutinTexture kind={S.texture} ink={S.particle} />
          </motion.div>

          {/* 浮升粒子层（持续） */}
          <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map(p => (
              <motion.span
                key={p.id}
                className="absolute rounded-full"
                style={{
                  left: `${p.leftPct}%`,
                  bottom: -8,
                  width: p.size,
                  height: p.size,
                  background: S.particle,
                  opacity: p.opacity,
                  boxShadow: `0 0 ${p.size * 3}px ${S.particle}`,
                }}
                animate={{ y: [0, -window.innerHeight - 40] }}
                transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'linear' }}
              />
            ))}
          </div>

          {/* ── 内容（带 SLAM 后的相机抖动） ── */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={
              stampLanded
                ? {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    x: [0, -3, 3, -2, 2, 0],
                  }
                : { opacity: 1, y: 0, scale: 1 }
            }
            transition={{
              opacity: { duration: 0.4, delay: 0.1 },
              y: { duration: 0.5, delay: 0.1, type: 'spring', damping: 18 },
              scale: { duration: 0.5, delay: 0.1, type: 'spring', damping: 18 },
              x: { duration: 0.35, ease: 'easeOut' }, // 相机抖动
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md text-center"
          >
            {/* ② 顶端 ✦ CALLING CARD ✦ —— 字符 stagger 揭幕 */}
            <div className="text-[10px] font-black mb-2 flex justify-center" style={{ color: S.eyebrowInk, letterSpacing: S.eyebrowTrack }}>
              {headerLetters.map((ch, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: 0.25 + i * 0.025 }}
                  className="inline-block"
                  style={{ minWidth: ch === ' ' ? '0.4em' : undefined }}
                >
                  {ch === ' ' ? ' ' : ch}
                </motion.span>
              ))}
            </div>

            {/* ③ 宣告·达成 大字 —— shutter 揭幕（clipPath 从右往左收尾） */}
            <motion.h1
              initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)', filter: 'blur(8px)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)', filter: 'blur(0px)' }}
              transition={{ duration: 0.55, delay: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-3xl font-black mb-1"
              style={{
                color: S.headInk,
                fontFamily: S.headFont,
                fontSize: S.headSize,
                fontStyle: S.headItalic ? 'italic' : 'normal',
                lineHeight: 1.05,
                textShadow: S.headShadow,
                ...(S.headStroke ? { WebkitTextStroke: S.headStroke, paintOrder: 'stroke fill' as const } : {}),
              }}
            >
              {reasonHeading}
            </motion.h1>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.65 }}
              className="text-sm mb-6"
              style={{ color: S.hintInk }}
            >
              {reasonHint}
            </motion.div>

            {/* ④ 核心 title block —— 弹入 + 内部斜向 sweep 高光

                结构：外层 motion.div（不裁切，让印章 / 尘屑可以悬于卡身之上）
                     + 内层"裁剪层" .absolute inset-0 overflow-hidden（关住 sweep 光不溢出圆角）
                     + 内容（带 relative 抢到比裁剪层更高的层级） */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.75, type: 'spring', damping: 16 }}
              className="relative mb-6 mx-auto"
              style={{
                padding: '20px 24px',
                maxWidth: 340,
                // isolation 是**必须**的：形状层用 zIndex:-1 垫在内容之下，而 Framer
                // 在动画结束后会把 transform/opacity 收回去，卡身就不再自成层叠上下文，
                // 那个 -1 会一路穿到全屏背景后面（实测：红频道的纸面整张消失、
                // 深墨标题直接压在暗红底上没法读）。isolate 把它钉在本卡内部。
                isolation: 'isolate',
                // 有 clip 的皮（蓝斜切 / 红撕边）：卡身本体**不能**自己 clip，
                // 否则会把探出边缘的印章一起裁掉（clip-path 连后代一起裁）。
                // 形状交给下面那层专门的 span，外壳只负责定位与阴影。
                ...(S.panelClip
                  ? {}
                  : {
                      background: S.panelBg,
                      border: `2px solid ${S.panelBorder}`,
                      borderRadius: S.panelRadius,
                      boxShadow: S.panelShadow,
                    }),
              }}
            >
              {/* 形状层（仅 clip 皮走这条）：硬投影用一片同形偏移的实色垫在后面，
                  因为 clip-path 会连 box-shadow 一起裁掉 */}
              {S.panelClip && (
                <>
                  {S.panelShadow && (
                    <span
                      aria-hidden
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: S.stampBg,
                        clipPath: S.panelClip,
                        transform: 'translate(6px, 7px)',
                        zIndex: -2,
                      }}
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: S.panelBg, clipPath: S.panelClip, zIndex: -1 }}
                  />
                </>
              )}
              {/* 裁剪子层：仅约束 sweep 光不超出圆角；印章 / shockwave / 尘屑都在这层之外 */}
              <div className="absolute inset-0 rounded-[10px] overflow-hidden pointer-events-none">
                {/* 斜向 sweep 光：左上 → 右下，宽窄渐变模拟金属反光 */}
                <motion.div
                  aria-hidden
                  initial={{ x: '-150%', opacity: 0 }}
                  animate={{ x: '150%', opacity: [0, 0.7, 0] }}
                  transition={{ duration: 0.9, delay: 0.95, ease: 'easeOut' }}
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(115deg, transparent 30%, ${S.flash} 48%, rgba(255,255,255,0.55) 50%, ${S.flash} 52%, transparent 70%)`,
                    mixBlendMode: 'screen',
                  }}
                />
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.85 }}
                className="text-2xl mb-1 relative"
                style={{ color: S.iconInk }}
              >
                {card.icon || '✦'}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 0.5, delay: 0.9 }}
                className="text-3xl font-black relative"
                style={{
                  color: S.titleInk,
                  fontFamily: S.titleFont,
                  fontSize: '2.4rem',
                  lineHeight: 1.1,
                  textShadow: S.titleShadow,
                }}
              >
                {card.title}
              </motion.div>
              {card.subtitle && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 1.05 }}
                  className="text-xs italic mt-2 relative"
                  style={{ color: S.subInk }}
                >
                  「{card.subtitle}」
                </motion.div>
              )}

              {/* ⑤ 印章 SLAM：scale 3 → 1，伴随 shockwave + 尘屑 */}
              <motion.div
                initial={{ opacity: 0, scale: 3, rotate: -28 }}
                animate={{ opacity: 0.96, scale: 1, rotate: S.stampRotate }}
                transition={{ duration: 0.45, delay: 1.05, type: 'spring', damping: 12 }}
                className="absolute -top-2 -right-2 px-2.5 py-1 text-[10px] font-black tracking-[3px]"
                style={{
                  color: S.stampInk,
                  border: `2px solid ${S.stampBorder}`,
                  background: S.stampBg,
                  borderRadius: S.stampRadius,
                }}
              >
                {reasonStamp}
              </motion.div>

              {/* 印章砸下时的 shockwave ring + 尘屑（仅在 stampLanded=true 时挂载） */}
              {stampLanded && (
                <>
                  <motion.div
                    aria-hidden
                    initial={{ opacity: 0.7, scale: 0.4 }}
                    animate={{ opacity: 0, scale: 4 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    className="absolute -top-2 -right-2 w-12 h-12 rounded-full pointer-events-none"
                    style={{
                      border: `2px solid ${S.stampBg}`,
                      transform: 'translate(50%, -50%)',
                    }}
                  />
                  {dust.map(d => (
                    <motion.span
                      key={d.id}
                      aria-hidden
                      initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                      animate={{ opacity: 0, x: d.x, y: d.y, scale: 0.4 }}
                      transition={{ duration: d.duration, ease: 'easeOut' }}
                      className="absolute pointer-events-none rounded-full"
                      style={{
                        top: 0,
                        right: 0,
                        width: d.size,
                        height: d.size,
                        background: S.particle,
                        boxShadow: `0 0 ${d.size * 2}px ${S.particle}`,
                      }}
                    />
                  ))}
                </>
              )}
            </motion.div>

            {/* ⑥ 操作按钮 */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 1.4 }}
              className="flex flex-col gap-2 max-w-[280px] mx-auto"
            >
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onLedger}
                disabled={ledgered || ledgerWriting}
                className="w-full py-3 font-bold text-sm transition-all"
                style={{
                  background: ledgered ? S.btnDoneBg : S.btnBg,
                  color: S.btnInk,
                  borderRadius: S.panelRadius >= 20 ? 999 : S.panelRadius === 0 ? 0 : 16,
                  opacity: ledgered ? 0.85 : 1,
                }}
              >
                {ledgered ? '✓ 已留下记录' : ledgerWriting ? '正在落墨…' : '留下记录'}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleClose}
                className="w-full py-2.5 text-sm font-medium"
                style={{
                  color: S.ghostInk,
                  background: S.ghostBg,
                  borderRadius: S.panelRadius >= 20 ? 999 : S.panelRadius === 0 ? 0 : 16,
                }}
              >
                收下卡片
              </motion.button>
            </motion.div>

            {/* 底部落款 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.5, delay: 1.6 }}
              className="mt-4 italic text-sm"
              style={{ color: S.signInk, fontFamily: S.signFont }}
            >
              ─ Velvet
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
