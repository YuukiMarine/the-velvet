/**
 * NavigatorWindow — F6 黑猫（Navigator）对话窗（Batch1 地基）。
 *
 * 全屏 overlay（portal，非页面路由）。本批 = 菜单层：每日问候（模板+状态拼接）、
 * chips 快捷动作 → 统一迷你表单 → 确认卡 → 执行回执（增强反馈免费继承），
 * 自由输入由黑猫模板接话（AI 对话层随 Batch2 接管，布局零改动）。
 *
 * 皮肤：board（蓝/粉/自定义）= P3R「深夜站内信」（复用 p3Kit 水面语言，-2° 斜置签名件）；
 * thief/tv = 中性深色兜底（其风格化随各自频道批次）。
 * 会话：当日延续、跨天清流（store/navigator，Batch1 仅内存）。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useNavigatorStore, formatBubbleTime, TIME_GAP_MS, type NavigatorMessage } from '@/store/navigator';
import { zClass } from '@/utils/zIndex';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import { useBoldness } from '@/utils/boldness';
import { terminalChannel } from '@/utils/terminalSkin';
import { P3, P3_WATER_WIDE } from '@/components/terminal/p3Kit';
import { P4ArcRings, P4Flower, P4Sparkle } from '@/ui/p4Kit';
import { NavigatorActionForm } from './NavigatorActionForm';
import { PresetAvatar } from './PresetAvatar';
import { BubbleMark, bubbleMarkOf, type MarkChannel } from '@/components/p5r/kit';
import { NavigatorNotebook } from './NavigatorNotebook';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { mergedNavigatorPresets } from '@/constants/navigatorPresets';
import {
  ACTION_META, buildPreviewLines, emptyDraft, executeDraft, navAttrName,
  type NavigatorActionKind, type NavigatorDraft,
} from '@/utils/navigatorRegistry';

/** 当前人格的头像（剪影集/上传双轨；订阅 sessionId——切人格必换会话，借它触发重渲染）
 *
 *  修正（用户上报：三个主题上传头像都只有中间小小一个）：
 *  剪影是字形，只占 18px 合适；上传照片则应该**铺满头像壳**。
 *  fill 为真时改走绝对定位满框 + object-cover。 */
const CatFace = ({ className, fillWhenPhoto = true }: { className?: string; fillWhenPhoto?: boolean }) => {
  const avatar = useNavigatorStore((s) => (void s.sessionId, s.activePreset().avatar));
  const isPhoto = !!avatar?.startsWith('data:');
  if (isPhoto && fillWhenPhoto) {
    return <img src={avatar} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />;
  }
  return <PresetAvatar avatar={avatar} className={className} />;
};

// 人格名随 activePreset 动态取（Batch3）；'黑猫' 仅作窗口未初始化时的兜底

// ── 皮肤 token（p4 = 黄频道节目窗 / bright = P3R 白日水面（p3-navigator-reference-v2）/ 暗 = 中性兜底） ──
const skinOf = (bright: boolean, p4 = false, p5 = false) => p5
  ? {
    // p5-navigator-reference-v2：红舞台（黑斜杠装饰）+ 纸信头 + 黑/纸尖角气泡（白圈硬影）+ 红发送
    root: undefined as string | undefined,
    // 纯红舞台：黑色图形全交给生长折线脊（背景斜纹会与之打架）
    rootStyle: { background: '#c00008' } as React.CSSProperties,
    headerSlab: 'bg-[#f0e9df]',
    headerStyle: { clipPath: 'polygon(2px 3px, 46% 0, calc(100% - 3px) 5px, calc(100% - 16px) calc(100% - 2px), 40% 100%, 0 calc(100% - 5px))', boxShadow: '0 5px 0 #000000' } as React.CSSProperties,
    headerText: { color: '#050505' } as React.CSSProperties,
    // 猫话：黑面白字，左缘一个尖尾指向头像（p5-navigator 稿）
    catBubble: 'text-[#f0e9df] font-bold',
    catBubbleStyle: {
      background: '#050505',
      clipPath: 'polygon(14px 6px, 62% 0, 100% 5px, calc(100% - 5px) calc(100% - 4px), 40% 100%, 15px calc(100% - 7px), 0 46%)',
      filter: 'drop-shadow(5px 6px 0 #6d0000)',
      borderRadius: 0,
    } as React.CSSProperties,
    // 用户话：纸面黑字，右缘尖尾
    userBubble: 'text-[#050505] font-bold',
    userBubbleStyle: {
      background: '#f0e9df',
      clipPath: 'polygon(0 4px, 55% 0, calc(100% - 14px) 6px, 100% 48%, calc(100% - 15px) calc(100% - 6px), 42% 100%, 4px calc(100% - 5px))',
      filter: 'drop-shadow(5px 6px 0 #6d0000)',
      borderRadius: 0,
    } as React.CSSProperties,
    avatar: 'text-[#c00008]',
    avatarStyle: { background: '#050505' } as React.CSSProperties,
    chip: 'text-[13px] font-black bg-[#f0e9df] text-[#050505]',
    chipStyle: { clipPath: 'polygon(10px 1px, calc(100% - 1px) 3px, calc(100% - 8px) calc(100% - 1px), 0 calc(100% - 3px))', boxShadow: '0 0 0 2px #050505, 3px 3.5px 0 #000000', paddingLeft: 16, paddingRight: 16 } as React.CSSProperties,
    inputBar: undefined as string | undefined,
    inputBarStyle: { background: 'transparent' } as React.CSSProperties,
    input: 'flex-1 bg-[#f0e9df] px-4 py-2.5 text-[16px] font-bold outline-none placeholder:text-[#6b6862]',
    inputStyle: { color: '#050505', clipPath: 'polygon(6px 0, 100% 2px, calc(100% - 4px) 100%, 0 calc(100% - 3px))', boxShadow: '0 0 0 2.5px #050505' } as React.CSSProperties,
    send: 'flex h-11 w-14 shrink-0 items-center justify-center text-lg font-black text-white disabled:opacity-40',
    sendStyle: { background: '#c00008', clipPath: 'polygon(11px 2px, calc(100% - 2px) 0, calc(100% - 8px) calc(100% - 2px), 0 100%)', boxShadow: '0 0 0 2.5px #050505, 4px 4px 0 #000000' } as React.CSSProperties,
    card: 'bg-[#f0e9df] text-[#050505]',
    cardStyle: { clipPath: 'polygon(8px 2px, 40% 0, calc(100% - 4px) 6px, calc(100% - 9px) calc(100% - 4px), 50% 100%, 4px calc(100% - 8px))', boxShadow: '0 0 0 2.5px #050505, 4px 5px 0 #000000' } as React.CSSProperties,
    cardBtn: 'min-h-10 px-4 text-[13px] font-black text-white disabled:opacity-40 bg-[#c00008] [clip-path:polygon(4px_1px,calc(100%-1px)_3px,calc(100%-4px)_calc(100%-1px),1px_calc(100%-3px))]',
    cardBtnGhost: 'min-h-10 px-3.5 text-[13px] font-black text-[#050505] bg-[#dcd4c4] [clip-path:polygon(4px_1px,calc(100%-1px)_3px,calc(100%-4px)_calc(100%-1px),1px_calc(100%-3px))]',
    cardBtnText: 'min-h-10 px-2 text-[13px] font-bold text-[#6b6862]',
    stamp: 'px-2 py-0.5 text-[10px] font-black tracking-[0.12em]',
    stampStyle: { background: '#050505', color: '#f0e9df', transform: 'rotate(-2deg)' } as React.CSSProperties,
  }
  : p4
  ? {
    // p4-navigator-reference-v2：黄舞台 + 奶油斜切信头（蓝圆黑猫）+ 奶油/黑气泡 + 蓝圆发送
    root: undefined as string | undefined,
    rootStyle: { background: '#ffd900' } as React.CSSProperties,
    headerSlab: 'bg-[#fff6d0] shadow-[0_6px_0_rgba(19,19,19,0.15)]',
    headerStyle: { clipPath: 'polygon(0 0, 100% 0, 97% 100%, 0 100%)', borderRadius: 18 } as React.CSSProperties,
    headerText: { color: '#131313' } as React.CSSProperties,
    catBubble: 'bg-[#fff6d0] shadow-[0_4px_0_rgba(19,19,19,0.12)] font-bold',
    catBubbleStyle: { clipPath: 'polygon(0 4%, 100% 0, 98.4% 100%, 0.8% 100%)', borderRadius: 16, color: '#131313' } as React.CSSProperties,
    userBubble: 'text-[#ffd900] shadow-[0_4px_0_rgba(19,19,19,0.25)] font-bold',
    userBubbleStyle: { background: '#131313', clipPath: 'polygon(1.6% 0, 100% 4%, 99.2% 100%, 0 100%)', borderRadius: 16 } as React.CSSProperties,
    avatar: 'text-[#131313]',
    avatarStyle: { background: 'var(--ui-accent, #2e6be0)', borderRadius: 9999, boxShadow: '0 0 0 3px #131313' } as React.CSSProperties,
    chip: 'text-[13px] font-black bg-[#fff6d0] text-[#131313] shadow-[0_3px_0_rgba(19,19,19,0.18)]',
    chipStyle: { clipPath: 'polygon(8% 0, 100% 0, 92% 100%, 0 100%)', borderRadius: 10, paddingLeft: 18, paddingRight: 18 } as React.CSSProperties,
    inputBar: undefined as string | undefined,
    inputBarStyle: { background: 'transparent' } as React.CSSProperties,
    input: 'flex-1 bg-[#fff6d0] px-4 py-2.5 text-[16px] font-bold outline-none placeholder:text-[#131313]/40 rounded-2xl',
    inputStyle: { color: '#131313', clipPath: 'polygon(0 0, 100% 0, 98% 100%, 0 100%)' } as React.CSSProperties,
    send: 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black text-white disabled:opacity-40',
    sendStyle: { background: 'var(--ui-accent, #2e6be0)', boxShadow: '0 3px 0 rgba(19,19,19,0.25)' } as React.CSSProperties,
    card: 'bg-[#fff6d0] shadow-[0_5px_0_rgba(19,19,19,0.15)]',
    cardStyle: { borderRadius: 18, color: '#131313' } as React.CSSProperties,
    cardBtn: 'min-h-10 px-4 text-[13px] font-black text-white disabled:opacity-40 rounded-xl bg-[var(--ui-accent,#2e6be0)]',
    cardBtnGhost: 'min-h-10 px-3.5 text-[13px] font-black text-[#131313] rounded-xl bg-[#ffd900]',
    cardBtnText: 'min-h-10 px-2 text-[13px] font-bold text-[#131313]/60',
    stamp: 'px-2 py-0.5 text-[10px] font-black tracking-[0.12em]',
    stampStyle: { background: 'var(--p4-orange, #f9a11b)', color: '#131313', transform: 'rotate(-2deg)', borderRadius: 6 } as React.CSSProperties,
  }
  : bright
  ? {
    root: undefined as string | undefined,
    rootStyle: { background: 'linear-gradient(168deg, #f2f9fd 0%, #e6f3fa 52%, #cfeaf6 100%)' },
    headerSlab: 'bg-white shadow-[0_10px_26px_rgba(38,96,140,.14)]',
    headerStyle: { clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' } as React.CSSProperties,
    headerText: { color: '#0a1230' },
    catBubble: 'shadow-[0_8px_22px_rgba(38,96,140,.12)]',
    // 右下角青三角：渐变在右下 14px 处硬切一刀（clip 斜切后正好是设计稿的小角）
    catBubbleStyle: { clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', background: 'linear-gradient(315deg, #35d1e8 13px, #c9e9f6 13px)', color: '#0a1230' } as React.CSSProperties,
    userBubble: 'text-white shadow-[0_8px_22px_rgba(27,87,255,.25)]',
    userBubbleStyle: { background: '#1b57ff', clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 100%, 14px 100%)' } as React.CSSProperties,
    avatar: 'text-[#1b57ff]',
    avatarStyle: { background: '#cfeaf6' } as React.CSSProperties,
    chip: 'bg-white text-[13px] font-black shadow-[0_6px_14px_rgba(38,96,140,.08)]',
    chipStyle: { color: '#0a1230', clipPath: 'polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)' } as React.CSSProperties,
    inputBar: undefined as string | undefined,
    inputBarStyle: undefined as React.CSSProperties | undefined,
    input: 'flex-1 bg-white px-4 py-3 text-[15px] font-bold outline-none placeholder:text-[#9ab4c9] shadow-[0_8px_18px_rgba(38,96,140,.08)]',
    inputStyle: { color: '#0a1230', clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' } as React.CSSProperties,
    send: 'flex h-12 w-16 shrink-0 items-center justify-center text-lg font-black text-white disabled:opacity-40',
    sendStyle: { background: '#1b57ff', clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)' } as React.CSSProperties,
    card: 'bg-white shadow-[0_14px_32px_rgba(38,96,140,.16)]',
    cardStyle: { clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)', color: '#0a1230' } as React.CSSProperties,
    cardBtn: 'min-h-10 px-4 text-[13px] font-black text-white disabled:opacity-40 [clip-path:polygon(8px_0,100%_0,calc(100%-8px)_100%,0_100%)] bg-[#1b57ff]',
    cardBtnGhost: 'min-h-10 px-3.5 text-[13px] font-black text-[#0a3bd6] [clip-path:polygon(8px_0,100%_0,calc(100%-8px)_100%,0_100%)] bg-[#cfeaf6]',
    cardBtnText: 'min-h-10 px-2 text-[13px] font-bold opacity-60',
    stamp: 'px-2 py-0.5 text-[11px] font-black tracking-[0.14em]',
    stampStyle: { color: '#1b57ff' } as React.CSSProperties,
  }
  : {
    root: 'bg-[#0d1017]',
    rootStyle: undefined as React.CSSProperties | undefined,
    headerSlab: 'border border-white/10 bg-[#151923] rounded-2xl',
    headerStyle: undefined as React.CSSProperties | undefined,
    headerText: { color: '#fff' } as React.CSSProperties,
    catBubble: 'rounded-2xl rounded-tl-md border border-white/10 bg-[#171c27] text-gray-100',
    catBubbleStyle: undefined as React.CSSProperties | undefined,
    userBubble: 'rounded-2xl rounded-tr-md bg-primary/25 text-white',
    userBubbleStyle: undefined as React.CSSProperties | undefined,
    avatar: 'text-primary',
    avatarStyle: { background: 'rgba(255,255,255,.08)' } as React.CSSProperties,
    chip: 'rounded-full border border-white/15 bg-white/5 text-[13px] font-bold text-gray-200',
    chipStyle: undefined as React.CSSProperties | undefined,
    inputBar: 'bg-[#12151d]',
    inputBarStyle: undefined as React.CSSProperties | undefined,
    input: 'flex-1 rounded-xl bg-white/8 px-3 py-2.5 text-[16px] text-white outline-none placeholder:text-gray-500',
    inputStyle: undefined as React.CSSProperties | undefined,
    send: 'flex h-11 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-black text-white disabled:opacity-40',
    sendStyle: undefined as React.CSSProperties | undefined,
    card: 'rounded-2xl border border-white/12 bg-[#171c27] text-gray-100',
    cardStyle: undefined as React.CSSProperties | undefined,
    cardBtn: 'min-h-10 rounded-xl bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-40',
    cardBtnGhost: 'min-h-10 rounded-xl border border-white/15 px-3.5 text-[13px] font-bold text-gray-200',
    cardBtnText: 'min-h-10 px-2 text-[13px] font-bold text-gray-400',
    stamp: 'rounded px-2 py-0.5 text-[10px] font-black tracking-[0.12em] bg-primary/25 text-primary',
    stampStyle: undefined as React.CSSProperties | undefined,
  };
type Skin = ReturnType<typeof skinOf>;

/* ── 头像框（照用户手绘 tx.svg 转译）────────────────────────
   原稿是两条带洞的路径：外黑环 + 内白环，两圈各自是歪的四边形。
   这里把三圈轮廓（黑外 / 白中 / 照面）归一化为百分比多边形，
   三层同框叠放，露出来的就是两道宽窄不一的不规则环。bbox 103.12×91.56。 */
/* 舞台巨星（粗描边）的五角星点集 */
const P5_BIG_STAR = '50,3 61.8,38.2 98.8,38.2 68.9,60.1 80.4,95.4 50,73.6 19.6,95.4 31.1,60.1 1.2,38.2 38.2,38.2';

const P5_AV_BLACK = 'polygon(0 0, 84.9% 7.3%, 100% 88.3%, 26.7% 100%)';
const P5_AV_WHITE = 'polygon(11.6% 7.3%, 81.9% 11.7%, 92.7% 83%, 30.6% 91.8%)';
const P5_AV_FACE = 'polygon(16.1% 10.3%, 80.6% 14.3%, 88.7% 79.9%, 32.3% 89.2%)';

/** P5 头像壳：黑外环 → 白环 → 照面（内容居中） */
const P5Avatar = ({ size = 38, children }: { size?: number; children: React.ReactNode }) => (
  <span
    className="relative mt-0.5 flex shrink-0 items-center justify-center"
    style={{ width: size, height: size * (91.56 / 103.12) }}
  >
    <span aria-hidden className="absolute inset-0" style={{ background: '#050505', clipPath: P5_AV_BLACK }} />
    <span aria-hidden className="absolute inset-0" style={{ background: '#f0e9df', clipPath: P5_AV_WHITE }} />
    <span aria-hidden className="absolute inset-0" style={{ background: '#050505', clipPath: P5_AV_FACE }} />
    {/* 内容层满框：上传照片靠 absolute inset-0 铺满，剪影仍居中 */}
    <span className="relative flex h-full w-full items-center justify-center overflow-hidden text-[#c00008]" style={{ clipPath: P5_AV_FACE }}>{children}</span>
  </span>
);

/* ── 对话框（照用户手绘 dhk.svg 转译）──────────────────────
   原稿：白多边形（描边）+ 黑多边形（面），左缘一个尖刺尾。bbox 241.16×61.17。
   缩放口径：X 用 px（尾巴与右缘斜刀口尺寸恒定，气泡变宽不会把尾巴拉长），
   Y 用 %（随行数等比）—— 这样样式比例在任意尺寸下都立得住。 */
/* 缩放口径（修正版）：Y 不再用 %——百分比会让白描边的厚度随气泡变高而等比变粗
   （用户上报：气泡高时白边过大），长文时更会把尾巴拉成巨刺。
   改成三种锚定：顶边离顶 px / 底边离底 px / 尾巴锚在垂直中心 ±px。
   于是描边厚度与尾巴尺寸在任意宽高下恒定，只有身体面积在长。 */
const BUB_EDGE_L = 'polygon(0 calc(50% + 6.1px), 22.8px calc(50% - 14.4px), 24px calc(50% - 7.8px), 30.5px calc(50% - 11.4px), 39.3px 2.5px, 100% 0, calc(100% - 36.8px) 100%, 13.3px calc(100% - 9.3px), 23.7px calc(50% + 7.6px), 15.3px calc(50% + 11.6px), 12.8px calc(50% + 4.9px))';
const BUB_FACE_L = 'polygon(6.2px calc(50% + 2.4px), 20px calc(50% - 8.9px), 22.7px calc(50% - 3.3px), 32.8px calc(50% - 6.9px), 40.8px 9px, calc(100% - 18.3px) 4.2px, calc(100% - 38px) calc(100% - 6.2px), 20.7px calc(100% - 14.8px), 27px calc(50% + 5.4px), 17.3px calc(50% + 8.8px), 15.3px 50%)';
/* 右尾版 = 水平镜像（x → 100% - x） */
const BUB_EDGE_R = 'polygon(100% calc(50% + 6.1px), calc(100% - 22.8px) calc(50% - 14.4px), calc(100% - 24px) calc(50% - 7.8px), calc(100% - 30.5px) calc(50% - 11.4px), calc(100% - 39.3px) 2.5px, 0 0, 36.8px 100%, calc(100% - 13.3px) calc(100% - 9.3px), calc(100% - 23.7px) calc(50% + 7.6px), calc(100% - 15.3px) calc(50% + 11.6px), calc(100% - 12.8px) calc(50% + 4.9px))';
const BUB_FACE_R = 'polygon(calc(100% - 6.2px) calc(50% + 2.4px), calc(100% - 20px) calc(50% - 8.9px), calc(100% - 22.7px) calc(50% - 3.3px), calc(100% - 32.8px) calc(50% - 6.9px), calc(100% - 40.8px) 9px, 18.3px 4.2px, 38px calc(100% - 6.2px), calc(100% - 20.7px) calc(100% - 14.8px), calc(100% - 27px) calc(50% + 5.4px), calc(100% - 17.3px) calc(50% + 8.8px), calc(100% - 15.3px) 50%)';

/**
 * BubbleIn —— 气泡首次出现的入场（三频道共用）：
 * 从下方 60° 逆时针转回正位，同时透明度 0→1；旋转轴取气泡尾巴那侧的底角，
 * 所以看上去是“从头像那头甩上来”。缓动非线性（过冲一点再回收）。D0 直接终态。
 */
const BubbleIn = ({ side, mark, markCh, children }: {
  side: 'cat' | 'user';
  mark?: '!' | '?' | null;
  markCh?: MarkChannel;
  children: React.ReactNode;
}) => {
  const anim = useBoldness();
  return (
    <motion.div
      // max-w 必须挂在这层：挂在内层时百分比参照的是“内容宽”，会把短气泡挤成一列字
      className="relative max-w-[86%]"
      style={{ transformOrigin: side === 'cat' ? '0% 100%' : '100% 100%' }}
      initial={anim ? { rotate: 60, opacity: 0 } : false}
      animate={{ rotate: 0, opacity: 1 }}
      transition={{ duration: 0.52, ease: [0.18, 1.3, 0.32, 1] }}
    >
      {/* 角标画在这层：气泡本体带 clip-path，放在内部会被裁成半截 */}
      {mark && (
        <BubbleMark
          mark={mark}
          channel={markCh ?? 'p5'}
          size={19}
          style={{ left: 16, top: -10, zIndex: 3 }}
        />
      )}
      {children}
    </motion.div>
  );
};

/** P5 气泡：描边层 + 面层两张多边形叠放，文字避开尾巴与斜刀口 */
const P5Bubble = ({ side, children }: { side: 'cat' | 'user'; children: React.ReactNode }) => {
  const left = side === 'cat';
  return (
    <div className="relative" style={{ minHeight: 56 }}>
      <span aria-hidden className="absolute inset-0" style={{ background: left ? '#f0e9df' : '#050505', clipPath: left ? BUB_EDGE_L : BUB_EDGE_R }} />
      <span aria-hidden className="absolute inset-0" style={{ background: left ? '#050505' : '#f0e9df', clipPath: left ? BUB_FACE_L : BUB_FACE_R }} />
      <div
        className={`relative flex min-h-[56px] items-center whitespace-pre-wrap text-sm font-bold leading-relaxed ${
          left ? 'pl-[46px] pr-[32px] text-[#f0e9df]' : 'pl-[32px] pr-[46px] text-[#050505]'
        }`}
        // overflowWrap:anywhere：用户粘一千字无空格长串时不会把气泡撞爆
        style={{ paddingTop: 12, paddingBottom: 14, overflowWrap: 'anywhere', wordBreak: 'break-word' }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * P5Spine —— p5-navigator 稿的黑色生长折线脊。
 *
 * 沿消息流从上往下走一条粗黑折线，每条消息在它自己那侧（猫左 / 用户右）
 * 提供一个拐点，于是整条线在左右之间 zigzag。线画在消息列内部的绝对层，
 * 所以会随列表一起滚动；新消息到达时用非线性缓动把 pathLength 从旧值
 * 长到新值（“延伸到对话框处”）。装饰件：aria-hidden + 不吃指针。
 */
const P5Spine = ({ containerRef, count, phase }: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  count: number;
  phase: string;
}) => {
  const anim = useBoldness();
  const [geo, setGeo] = useState<{ w: number; h: number; d: string }>({ w: 0, h: 0, d: '' });

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const measure = () => {
      const rows = Array.from(host.querySelectorAll<HTMLElement>('[data-spine-side]'));
      const hostBox = host.getBoundingClientRect();
      const w = host.clientWidth;
      const h = Math.max(host.scrollHeight, host.clientHeight);
      if (rows.length === 0 || w === 0) { setGeo({ w, h, d: '' }); return; }
      const pts: Array<[number, number]> = [];
      rows.forEach((row) => {
        const side = row.dataset.spineSide;
        const b = row.getBoundingClientRect();
        const y = b.top - hostBox.top + host.scrollTop + b.height / 2;
        // 拐点靠到气泡那侧的内侧（留出头像宽度）
        const x = side === 'user' ? w - 26 : 26;
        pts.push([x, y]);
      });
      // 只从顶部接一段进来；末端**不**再往下拖垂直段（用户：停下来那根竖线不要）。
      // 同侧连着多条时，相邻拐点 x 相同，自然就是一段竖向延伸——这是要的。
      const first = pts[0];
      const all: Array<[number, number]> = [[first[0], Math.max(0, first[1] - 44)], ...pts];
      const d = all.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
      setGeo({ w, h, d });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    const t = window.setTimeout(measure, 260); // 等气泡入场动画落定再量一次
    return () => { ro.disconnect(); window.clearTimeout(t); };
  }, [containerRef, count, phase]);

  if (!geo.d) return null;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0"
      width={geo.w}
      height={geo.h}
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      style={{ zIndex: 0 }}
    >
      {/* 暗红错位影（与气泡硬影同语言） */}
      <path d={geo.d} fill="none" stroke="#6d0000" strokeWidth={19} strokeLinejoin="miter" strokeLinecap="butt" strokeMiterlimit={12} transform="translate(5 6)" />
      <motion.path
        key={count}
        d={geo.d}
        fill="none"
        stroke="#050505"
        strokeWidth={19}
        strokeLinejoin="miter"
        strokeMiterlimit={12}
        strokeLinecap="butt"
        initial={anim ? { pathLength: 0.82 } : false}
        animate={{ pathLength: 1 }}
        // 非线性：先猛窜再收尾（稿上折线“甩”到位的手感）
        transition={{ duration: 0.92, ease: [0.16, 1.06, 0.3, 1] }}
      />
    </svg>
  );
};

export const NavigatorWindow = () => {
  const { user, settings, setCurrentPage, getDueTodosToday, getTodayTodoProgress } = useAppStore();
  const nav = useNavigatorStore();
  const bold = useBoldness();
  const bright = terminalChannel(user?.theme) === 'board';
  const isP4 = user?.theme === 'yellow';
  const isP5 = user?.theme === 'red';
  const sk = skinOf(bright, isP4, isP5);
  const preset = nav.activePreset();

  const a11yRef = useModalA11y(nav.isOpen, nav.close, { closeOnEscape: true, trapFocus: true });
  useBackHandler(nav.isOpen, nav.close);

  const [formDraft, setFormDraft] = useState<NavigatorDraft | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [personaMenuOpen, setPersonaMenuOpen] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null);
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // 打开：加载自定义人格 + 挂载当日会话 + 问候（逻辑收在 store.greet，内部先 hydrate）
  useEffect(() => {
    if (!nav.isOpen) return;
    const st = useNavigatorStore.getState();
    void st.loadPresets();
    st.greet();
  }, [nav.isOpen]);

  // 批4 §6.6 黑猫败因信：有待投递的信 → 问候落定后作为站内信推送（一次性，投完即清）
  useEffect(() => {
    if (!nav.isOpen) return;
    const letter = useAppStore.getState().battleState?.pendingCatLetter;
    if (!letter) return;
    const t = setTimeout(() => {
      const app = useAppStore.getState();
      const cur = app.battleState;
      if (!cur?.pendingCatLetter) return; // 已被其他实例投递
      useNavigatorStore.getState().pushCat(`📮 逆影战场·败因复盘\n${cur.pendingCatLetter.text}`);
      void app.saveBattleState({ ...cur, pendingCatLetter: undefined });
    }, 2200);
    return () => clearTimeout(t);
  }, [nav.isOpen]);

  // 打开期间锁 body 滚动
  useEffect(() => {
    if (!nav.isOpen || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [nav.isOpen]);

  // 新消息 / 打字指示出现时自动贴底（上拉加载历史时跳过，见 loadingOlderRef）
  const msgCount = nav.messages.length;
  const loadingOlderRef = useRef(false);
  useEffect(() => {
    if (loadingOlderRef.current) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgCount, nav.phase, nav.isOpen]);

  // 上拉到顶：加载更早一天的对话（当前人格线，7 天保存期），并保持滚动位置不跳
  const onListScroll = async () => {
    const el = listRef.current;
    if (!el || el.scrollTop > 30 || loadingOlderRef.current || !nav.hasOlder) return;
    loadingOlderRef.current = true;
    const prevHeight = el.scrollHeight;
    const loaded = await useNavigatorStore.getState().loadOlder();
    requestAnimationFrame(() => {
      if (loaded && listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight - prevHeight;
      }
      loadingOlderRef.current = false;
    });
  };

  const openForm = (kind: NavigatorActionKind) => {
    if (kind === 'completeTodo') { setPickerOpen(true); return; }
    setEditingCardId(null);
    setFormDraft(emptyDraft(kind));
    setFormKey((k) => k + 1);
  };
  const editCard = (m: NavigatorMessage) => {
    if (!m.draft) return;
    setEditingCardId(m.id);
    setFormDraft(m.draft);
    setFormKey((k) => k + 1);
  };
  const onFormSubmit = (d: NavigatorDraft) => {
    // userEdited 一并落下：卡片实录里会标出「用户已手改」，模型才知道内容被动过
    if (editingCardId) nav.updateCard(editingCardId, { draft: d, userEdited: true });
    else nav.pushCard(d);
    setFormDraft(null);
    setEditingCardId(null);
  };
  const confirmCard = async (m: NavigatorMessage) => {
    if (!m.draft || busyCardId) return;
    setBusyCardId(m.id);
    try {
      const receipt = await executeDraft(m.draft);
      nav.updateCard(m.id, { cardStatus: 'done', receipt });
    } catch (e) {
      nav.pushCat(e instanceof Error ? `没记上：${e.message}` : '没记上，稍后再试一次。');
    } finally {
      setBusyCardId(null);
    }
  };
  const send = () => {
    const text = input.trim();
    if (!text) return;
    nav.userSend(text); // 进仲裁器：收口/打断由它裁决
    setInput('');
    nav.setInputActive(false);
  };
  const jump = (page: string) => { nav.close(); setCurrentPage(page); };

  const dueTodos = nav.isOpen
    ? getDueTodosToday().filter((t) => !getTodayTodoProgress(t.id).isComplete)
    : [];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <AnimatePresence>
        {nav.isOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={preset.name}
            initial={bold ? { opacity: 0, y: 24 } : { opacity: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={bold ? { opacity: 0, y: 18 } : { opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed inset-0 ${zClass.modal} flex flex-col overflow-hidden ${sk.root ?? ''}`}
            style={sk.rootStyle}
          >
            {/* P5 舞台装饰：半调网点 + 四缘暗红巨星粗描边（只在边缘露一截） */}
            {isP5 && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
                <svg className="absolute" style={{ left: -150, top: 40, width: 330, height: 330 }} viewBox="0 0 100 100">
                  <polygon points={P5_BIG_STAR} fill="none" stroke="#8e0000" strokeWidth={7} strokeLinejoin="miter" />
                </svg>
                <svg className="absolute" style={{ right: -170, top: '38%', width: 380, height: 380 }} viewBox="0 0 100 100">
                  <polygon points={P5_BIG_STAR} fill="none" stroke="#8e0000" strokeWidth={6} strokeLinejoin="miter" transform="rotate(18 50 50)" />
                </svg>
                <svg className="absolute" style={{ left: -120, bottom: -60, width: 300, height: 300 }} viewBox="0 0 100 100">
                  <polygon points={P5_BIG_STAR} fill="none" stroke="#8e0000" strokeWidth={7} strokeLinejoin="miter" transform="rotate(-12 50 50)" />
                </svg>
                {/* 半调：两块暗红网点贴在上下边缘 */}
                <div
                  className="absolute"
                  style={{
                    right: 0, top: 0, width: 150, height: 190,
                    backgroundImage: 'radial-gradient(circle, #8e0000 2px, transparent 2.4px)',
                    backgroundSize: '11px 11px',
                  }}
                />
                <div
                  className="absolute"
                  style={{
                    left: 0, bottom: 90, width: 120, height: 170,
                    backgroundImage: 'radial-gradient(circle, #8e0000 1.7px, transparent 2.1px)',
                    backgroundSize: '10px 10px',
                  }}
                />
              </div>
            )}
            {/* P3R 房景装饰（p3-navigator 设计稿：整行 NAVIGATOR 横排词整体顺时针旋转 90°，
                字母躺倒、正常字距，沿左缘纵向纵贯全高（N 顶 R 底，自上而下读）——竖屏侧边字样。 */}
            {bright && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute inset-y-0 left-0 flex w-[96px] select-none items-center justify-center">
                  <span
                    className="whitespace-nowrap font-black italic leading-none"
                    style={{ fontFamily: 'Arial, sans-serif', fontSize: '6.6rem', color: 'rgba(147,190,222,0.30)', transform: 'rotate(90deg)' }}
                  >
                    NAVIGATOR
                  </span>
                </div>
                <div className="absolute right-[-18%] top-[-10%] h-[150%] w-[42%]" style={{ background: 'linear-gradient(180deg, rgba(53,209,232,0.28) 0%, rgba(127,216,238,0.5) 100%)', transform: 'skewX(-14deg)' }} />
                <div className="absolute inset-x-0 bottom-0 h-[24%] opacity-60">
                  <img
                    src={P3_WATER_WIDE}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ maskImage: 'linear-gradient(180deg, transparent 0%, #000 62%)', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 62%)' }}
                  />
                </div>
              </div>
            )}

            {/* P4 舞台装饰：聊天页原本是一整片纯黄（用户上报不好看），补上与全站同源的
                巨型橙弧环 + 大花剪影 + 星闪。静态一层、pointer-events-none；
                正文容器自带 relative，天然压在其上。 */}
            {isP4 && (
              <div aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden">
                <P4ArcRings
                  size={620}
                  className="absolute"
                  style={{ right: '-34vw', top: '-26vh' }}
                  rings={[
                    [0.34, 40, 'rgba(249,161,27,0.22)'],
                    [0.58, 30, 'rgba(255,200,60,0.22)'],
                    [0.80, 22, 'rgba(249,161,27,0.14)'],
                  ]}
                />
                <P4ArcRings
                  size={480}
                  className="absolute"
                  style={{ left: '-30vw', bottom: '-20vh' }}
                  rings={[
                    [0.44, 30, 'rgba(249,161,27,0.15)'],
                    [0.72, 20, 'rgba(255,214,90,0.18)'],
                  ]}
                />
                <P4Flower size={240} color="rgba(255,248,214,0.36)" className="absolute" style={{ left: '-70px', top: '26%' }} />
                <P4Flower size={150} color="rgba(255,248,214,0.28)" className="absolute" style={{ right: '-28px', bottom: '22%' }} />
                <P4Sparkle size={26} color="rgba(255,255,255,0.5)" className="absolute" style={{ left: '14%', top: '13%' }} />
                <P4Sparkle size={18} color="rgba(46,107,224,0.3)" className="absolute" style={{ right: '16%', top: '34%' }} />
                <P4Sparkle size={22} color="rgba(249,161,27,0.4)" className="absolute" style={{ left: '10%', bottom: '18%' }} />
              </div>
            )}

            {/* a11y 焦点陷阱挂内层容器（挂 AnimatePresence 直接子元素会触发 framer PopChild 的 ref 警告） */}
            <div ref={a11yRef} className="relative mx-auto flex h-full w-full max-w-2xl flex-col">
              {/* 页头：站内信信头（头像可点开人格菜单） */}
              <div className="relative px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
                <div className={`flex items-center gap-3 px-4 py-3 ${sk.headerSlab}`} style={sk.headerStyle}>
                  <button
                    type="button"
                    aria-label="人格菜单"
                    aria-expanded={personaMenuOpen}
                    onClick={() => setPersonaMenuOpen((v) => !v)}
                    className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${sk.avatar}`}
                    style={{ ...sk.avatarStyle, clipPath: bright ? 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' : undefined, borderRadius: bright ? undefined : isP4 ? 9999 : '0.75rem' }}
                  >
                    <CatFace className="h-6 w-6" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-black ${isP4 ? 'text-[22px]' : 'text-base'}`} style={{ ...sk.headerText, ...(isP4 ? { fontFamily: 'var(--p4-display-font, serif)' } : {}) }}>{preset.name}</div>
                    <div className={`text-[11px] font-bold ${bright ? '' : 'opacity-60'}`} style={bright ? { color: '#1b57ff' } : sk.headerText}>万能记录 · 有事直说</div>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭助手"
                    onClick={nav.close}
                    className="flex h-9 w-9 shrink-0 items-center justify-center text-xl font-black opacity-70 transition hover:opacity-100"
                    style={sk.headerText}
                  >
                    ✕
                  </button>
                </div>

                {/* 人格快捷菜单（头像下拉浮层） */}
                <AnimatePresence>
                  {personaMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setPersonaMenuOpen(false)} aria-hidden />
                      <motion.div
                        initial={bold ? { opacity: 0, y: -8 } : { opacity: 0 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        role="menu"
                        aria-label="人格菜单"
                        className={`absolute left-4 top-full z-20 mt-1 w-64 ${bright ? '' : 'overflow-hidden rounded-2xl border border-white/12 bg-[#171c27] shadow-2xl'}`}
                        style={bright ? { color: P3.ink } : { color: '#e5e7eb' }}
                      >
                        {/* p3-modal-12 稿：层叠独立斜块菜单——标签白斜片，人格行逐级右移，当前=蓝块+当前+洋红角，
                            工具行三块白斜片再逐级右移；暗色频道保持整面板下拉不变 */}
                        {bright ? (
                          <div className="space-y-1.5">
                            <div className="inline-block bg-white px-4 py-1.5 text-[12px] font-black shadow-[0_8px_20px_rgba(7,40,120,.16)]" style={{ clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)' }}>
                              切换人格
                            </div>
                            {mergedNavigatorPresets(nav.presets).map((p, i) => {
                              const active = p.id === preset.id;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  role="menuitem"
                                  onClick={() => { setPersonaMenuOpen(false); if (p.id !== preset.id) void nav.switchPreset(p.id); }}
                                  className={`relative flex items-center gap-2.5 px-4 py-2.5 text-left text-sm font-black transition ${active ? 'w-full text-white' : 'bg-white hover:bg-[#e3f0fd]'}`}
                                  style={{
                                    width: active ? undefined : `calc(100% - ${i * 10}px)`,
                                    marginLeft: active ? 0 : i * 10,
                                    background: active ? '#1b57ff' : undefined,
                                    clipPath: 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
                                    boxShadow: active ? '0 10px 26px rgba(27,87,255,.35)' : '0 8px 20px rgba(7,40,120,.14)',
                                  }}
                                >
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: active ? '#ffffff' : '#35d1e8' }}>
                                    <PresetAvatar avatar={p.avatar} className="h-5 w-5" />
                                  </span>
                                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                  {active && <span className="shrink-0 text-[11px] font-black text-white/90">当前</span>}
                                  {active && <span aria-hidden className="absolute bottom-0 right-4 h-[9px] w-[16px]" style={{ background: '#f0417f', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />}
                                </button>
                              );
                            })}
                            <div className="mx-3 my-2 h-px bg-[#9fc4e4]/70" aria-hidden />
                            {([
                              { label: `上传头像（${preset.name}）`, onPick: () => avatarFileRef.current?.click() },
                              { label: '记事本', onPick: () => setNotebookOpen(true) },
                              { label: '更多设置…', onPick: () => { nav.close(); setCurrentPage('settings'); } },
                            ] as const).map((item, i) => (
                              <button
                                key={item.label}
                                type="button"
                                role="menuitem"
                                onClick={() => { setPersonaMenuOpen(false); item.onPick(); }}
                                className="block bg-white px-4 py-2.5 text-left text-sm font-black transition hover:bg-[#e3f0fd]"
                                style={{
                                  width: `calc(100% - ${i * 10}px)`,
                                  marginLeft: i * 10,
                                  clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)',
                                  boxShadow: '0 8px 20px rgba(7,40,120,.14)',
                                }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <>
                            <div className="px-4 pb-1 pt-3 text-[10px] font-black uppercase tracking-[0.18em] opacity-55">切换人格</div>
                            {mergedNavigatorPresets(nav.presets).map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                role="menuitem"
                                onClick={() => { setPersonaMenuOpen(false); if (p.id !== preset.id) void nav.switchPreset(p.id); }}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-bold transition hover:bg-white/8"
                              >
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center text-primary" style={{ background: 'rgba(255,255,255,.08)', borderRadius: '0.5rem' }}>
                                  <PresetAvatar avatar={p.avatar} className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                {p.id === preset.id && <span className="text-[10px] font-black opacity-60">当前</span>}
                              </button>
                            ))}
                            <div className="mx-4 my-1 h-px bg-white/10" aria-hidden />
                            <button type="button" role="menuitem" onClick={() => { setPersonaMenuOpen(false); avatarFileRef.current?.click(); }}
                              className="block w-full px-4 py-2 text-left text-sm font-bold transition hover:bg-white/8">
                              上传头像（{preset.name}）
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setPersonaMenuOpen(false); setNotebookOpen(true); }}
                              className="block w-full px-4 py-2 text-left text-sm font-bold transition hover:bg-white/8">
                              记事本
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setPersonaMenuOpen(false); nav.close(); setCurrentPage('settings'); }}
                              className="block w-full px-4 pb-3 pt-2 text-left text-sm font-bold transition hover:bg-white/8">
                              更多设置…
                            </button>
                          </>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
                <input ref={avatarFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { setAvatarCropFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
              </div>

              {/* 消息流（顶部上拉加载更早；隔 >5 分钟插居中时间戳） */}
              <div ref={listRef} onScroll={() => void onListScroll()} className="relative flex-1 space-y-3 overflow-y-auto px-4 pb-3 pt-4">
                {isP5 && <P5Spine containerRef={listRef} count={nav.messages.length} phase={nav.phase} />}
                {nav.hasOlder && (
                  <div className={`pb-1 text-center text-[11px] font-bold ${bright ? 'text-[#3c69c9]' : 'text-gray-500'}`}>
                    {bright && <span aria-hidden className="mb-0.5 block text-[13px] leading-none">⌃</span>}
                    上拉查看更早的对话
                  </div>
                )}
                {nav.messages.map((m, i) => {
                  const prev = nav.messages[i - 1];
                  const showStamp = !prev || m.createdAt - prev.createdAt > TIME_GAP_MS;
                  return (
                    <div key={m.id} className="relative space-y-3" style={{ zIndex: 1 }}>
                      {showStamp && (
                        <div className={`pt-1 text-center text-[10px] font-bold ${bright ? 'text-[#3c69c9]' : isP5 ? '' : 'text-gray-500'}`}>
                          {isP5 ? (
                            <span className="relative inline-flex items-center px-3 py-1 text-[11px] font-black" style={{ color: '#f0e9df' }}>
                              <span aria-hidden className="absolute inset-0" style={{ background: '#f0e9df', clipPath: 'polygon(4px 0, 100% 2px, calc(100% - 5px) 100%, 0 calc(100% - 3px))' }} />
                              <span aria-hidden className="absolute inset-[2.5px]" style={{ background: '#c00008', clipPath: 'polygon(3px 0, 100% 2px, calc(100% - 4px) 100%, 0 calc(100% - 2px))' }} />
                              <span className="relative">{formatBubbleTime(m.createdAt)}</span>
                            </span>
                          ) : formatBubbleTime(m.createdAt)}
                        </div>
                      )}
                      <MessageRow m={m} sk={sk} bright={bright} p5={isP5} p4={isP4} busy={busyCardId === m.id}
                        onConfirm={() => void confirmCard(m)} onEdit={() => editCard(m)}
                        onCancel={() => nav.updateCard(m.id, { cardStatus: 'cancelled' })} />
                    </div>
                  );
                })}
                {(nav.phase === 'thinking' || nav.phase === 'replying') && (
                  <TypingRow sk={sk} bright={bright} bold={bold} />
                )}
              </div>

              {/* chips：快捷动作 + 跳转（bright：白斜块 + 左侧蓝/青竖斜片，p3-navigator 设计稿） */}
              <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1">
                {(['activity', 'todo', 'ledger', 'completeTodo'] as NavigatorActionKind[]).map((kind, i) => (
                  <button key={kind} type="button" onClick={() => openForm(kind)}
                    className={`shrink-0 ${bright ? 'flex items-center gap-2 py-2 pl-2.5 pr-3.5' : 'px-3.5 py-2'} ${sk.chip}`} style={sk.chipStyle}>
                    {bright && <span aria-hidden className="h-[16px] w-[7px] shrink-0" style={{ background: i === 0 ? '#1b57ff' : i % 2 ? '#35d1e8' : '#7fd8ee', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />}
                    {bright ? ACTION_META[kind].label : <>{ACTION_META[kind].icon} {ACTION_META[kind].label}</>}
                  </button>
                ))}
                <button type="button" onClick={() => jump('astrology')} className={`shrink-0 ${bright ? 'flex items-center gap-2 py-2 pl-2.5 pr-3.5' : 'px-3.5 py-2'} ${sk.chip}`} style={sk.chipStyle}>
                  {bright && <span aria-hidden className="h-[16px] w-[7px] shrink-0" style={{ background: '#35d1e8', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />}
                  {bright ? '去抽塔罗' : '🔮 去抽塔罗'}
                </button>
                {settings.terminalEnabled && (
                  <button type="button" onClick={() => jump('terminal')} className={`shrink-0 ${bright ? 'flex items-center gap-2 py-2 pl-2.5 pr-3.5' : 'px-3.5 py-2'} ${sk.chip}`} style={sk.chipStyle}>
                    {bright && <span aria-hidden className="h-[16px] w-[7px] shrink-0" style={{ background: '#7fd8ee', clipPath: 'polygon(38% 0, 100% 0, 62% 100%, 0 100%)' }} />}
                    {bright ? '打开终端' : '✦ 打开终端'}
                  </button>
                )}
              </div>

              {/* 输入栏 */}
              <div className={`px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 ${sk.inputBar ?? ''}`} style={sk.inputBarStyle}>
                <div className="flex items-center gap-2">
                  <input
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // 输入活动信号：仲裁器的收口窗口据此挂起，等用户把话说完
                      nav.setInputActive(e.target.value.trim().length > 0);
                    }}
                    onFocus={(e) => nav.setInputActive(e.target.value.trim().length > 0)}
                    onBlur={() => nav.setInputActive(false)}
                    onCompositionStart={() => nav.setInputActive(true)}
                    onCompositionEnd={(e) => nav.setInputActive((e.target as HTMLInputElement).value.trim().length > 0)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(); }}
                    placeholder={`跟${preset.name}说点什么…`}
                    aria-label={`给${preset.name}的消息`}
                    className={sk.input}
                    style={sk.inputStyle}
                  />
                  <button type="button" onClick={send} disabled={!input.trim()} aria-label="发送" className={sk.send} style={sk.sendStyle}>
                    ▶
                  </button>
                </div>
              </div>
            </div>

            {/* 完成任务：候选拣选 */}
            <AnimatePresence>
              {pickerOpen && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className={`absolute inset-0 ${zClass.confirm} flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center`}
                  onMouseDown={() => setPickerOpen(false)}
                >
                  <motion.div
                    role="dialog" aria-modal="true" aria-label="选择要完成的任务"
                    initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }}
                    className={`w-full max-w-md overflow-hidden ${sk.card}`}
                    style={sk.cardStyle}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="px-5 pb-2 pt-4 text-base font-black">今天做到了哪件？</div>
                    <div className="max-h-[50vh] overflow-y-auto px-5 pb-5">
                      {dueTodos.length === 0 ? (
                        <div className="py-6 text-center text-sm font-bold opacity-60">
                          今天没有待完成的任务——要么全清了，要么清单还空着。
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dueTodos.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                nav.pushCard({ kind: 'completeTodo', todoId: t.id, todoTitle: t.title });
                                setPickerOpen(false);
                              }}
                              className={`block w-full px-4 py-3 text-left ${bright ? 'border-2 border-[#cfe4fb] bg-white' : 'rounded-xl border border-white/12 bg-white/5'}`}
                            >
                              <span className="block truncate text-sm font-black">{t.title}</span>
                              <span className="mt-0.5 block text-[11px] font-bold opacity-60">
                                {navAttrName(t.attribute)} +{t.points}{t.repeatDaily ? ' · 每日' : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 迷你表单（新建 / 编辑确认卡共用） */}
      <NavigatorActionForm
        key={formKey}
        draft={formDraft}
        bright={bright}
        onSubmit={onFormSubmit}
        onClose={() => { setFormDraft(null); setEditingCardId(null); }}
      />
      {/* 记事本（头像菜单入口） */}
      <NavigatorNotebook isOpen={notebookOpen} onClose={() => setNotebookOpen(false)} />
      {/* 当前人格头像上传（内置人格 → 同 id 影子行覆盖，删除影子即恢复默认） */}
      <ImageCropDialog
        isOpen={!!avatarCropFile}
        file={avatarCropFile}
        title={`调整${preset.name}的头像`}
        onCancel={() => setAvatarCropFile(null)}
        onConfirm={(dataUrl) => {
          void nav.savePreset({ ...preset, avatar: dataUrl });
          setAvatarCropFile(null);
        }}
      />
    </>,
    document.body,
  );
};

// ── 打字指示（thinking/replying 相位；等待本身就是拟人） ──
const TypingRow = ({ sk, bright, bold }: { sk: Skin; bright: boolean; bold: boolean }) => (
  <div className="flex items-start gap-2.5" role="status" aria-label="助手正在输入">
    <span
      className={`relative mt-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden ${sk.avatar}`}
      style={{ ...sk.avatarStyle, clipPath: bright ? 'polygon(0 8%, 100% 0, 96% 100%, 2% 96%)' : undefined, borderRadius: bright ? undefined : ((sk.avatarStyle as React.CSSProperties | undefined)?.borderRadius ?? '0.65rem') }}
      aria-hidden
    >
      <CatFace className="h-[22px] w-[22px]" />
    </span>
    <div className={`flex items-center gap-1.5 px-4 py-3.5 ${sk.catBubble}`} style={sk.catBubbleStyle} aria-hidden>
      {[0, 1, 2].map((i) =>
        bold ? (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-current opacity-60"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ) : (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
        ),
      )}
    </div>
  </div>
);

// ── 单条消息 ──
const MessageRow = ({ m, sk, bright, p5 = false, p4 = false, busy, onConfirm, onEdit, onCancel }: {
  m: NavigatorMessage; sk: Skin; bright: boolean; p5?: boolean; p4?: boolean; busy: boolean;
  onConfirm: () => void; onEdit: () => void; onCancel: () => void;
}) => {
  // 角标频道：红 / 黄 / 蓝（其余中性也借蓝套配色）
  const markCh: MarkChannel = p5 ? 'p5' : p4 ? 'p4' : 'p3';
  const mark = bubbleMarkOf(m.text);
  if (m.role === 'summary') {
    // compact 产物：早前对话的折叠占位
    return (
      <div className={`mx-auto max-w-[90%] px-4 py-2 text-center text-[11px] font-bold leading-relaxed ${bright ? 'text-white/75' : 'text-gray-500'}`}>
        —— 早前的对话已收进记忆 ——
        <span className="mt-0.5 block opacity-80">{m.text}</span>
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div className="flex justify-end" data-spine-side="user">
        <BubbleIn side="user">
          {p5 ? (
            <P5Bubble side="user">{m.text}</P5Bubble>
          ) : (
            <div className={`whitespace-pre-wrap px-4 py-2.5 text-sm font-bold leading-relaxed ${sk.userBubble}`} style={{ ...sk.userBubbleStyle, overflowWrap: 'anywhere' }}>
              {m.text}
            </div>
          )}
        </BubbleIn>
      </div>
    );
  }
  if (m.role === 'cat') {
    return (
      <div className="flex items-start gap-2.5" data-spine-side="cat">
        {p5 ? (
          <P5Avatar size={62}><CatFace className="h-[18px] w-[18px]" /></P5Avatar>
        ) : (
          <span className={`relative mt-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden ${sk.avatar}`} style={{ ...sk.avatarStyle, clipPath: bright ? 'polygon(0 8%, 100% 0, 96% 100%, 2% 96%)' : undefined, borderRadius: bright ? undefined : ((sk.avatarStyle as React.CSSProperties | undefined)?.borderRadius ?? '0.65rem') }}>
            <CatFace className="h-[22px] w-[22px]" />
          </span>
        )}
        <BubbleIn side="cat" mark={mark} markCh={markCh}>
          {p5 ? (
            <P5Bubble side="cat">{m.text}</P5Bubble>
          ) : (
            <div className={`whitespace-pre-wrap px-4 py-2.5 text-sm font-bold leading-relaxed ${sk.catBubble}`} style={{ ...sk.catBubbleStyle, overflowWrap: 'anywhere' }}>
              {m.text}
            </div>
          )}
        </BubbleIn>
      </div>
    );
  }
  // 确认卡
  if (!m.draft) return null;
  const meta = ACTION_META[m.draft.kind];
  const lines = buildPreviewLines(m.draft);
  const cancelled = m.cardStatus === 'cancelled';
  const done = m.cardStatus === 'done';
  return (
    <div className={`px-4 py-4 ${sk.card} ${cancelled ? 'opacity-55' : ''}`} style={sk.cardStyle}>
      <div className="flex items-center gap-2">
        <span aria-hidden>{meta.icon}</span>
        <span className="flex-1 text-sm font-black">{meta.label}</span>
        {done && <span className={sk.stamp} style={sk.stampStyle}>已记录 ✓</span>}
        {cancelled && <span className="text-[11px] font-bold opacity-60">已取消</span>}
      </div>
      <div className="mt-2 space-y-1">
        {lines.map((l, i) => (
          <p key={i} className={`text-sm leading-relaxed ${i === 0 ? 'font-black' : 'font-bold opacity-75'}`}>{l}</p>
        ))}
      </div>
      {m.cardStatus === 'pending' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={onConfirm} className={sk.cardBtn}>
            {busy ? '记录中…' : '✓ 确认'}
          </button>
          <button type="button" disabled={busy} onClick={onEdit} className={sk.cardBtnGhost}>编辑</button>
          <button type="button" disabled={busy} onClick={onCancel} className={sk.cardBtnText}>取消</button>
        </div>
      )}
      {done && m.receipt && (
        <div className={`mt-3 flex items-start gap-2 border-t pt-3 ${bright ? 'border-[#dcebfb]' : 'border-white/10'}`}>
          <span aria-hidden style={bright ? { color: P3.accent } : undefined} className={bright ? '' : 'text-primary'}>
            <CatFace className="h-4 w-4" />
          </span>
          <p className="text-[13px] font-bold leading-relaxed opacity-80">{m.receipt}</p>
        </div>
      )}
    </div>
  );
};
