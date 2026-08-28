/**
 * 回归面板 —— 「欢迎回来」（PRD_V2.6 §12；v2.7.1 视觉重做二稿）。
 *
 * 【这个界面最容易做错的地方】
 * 一个 7 天以上没回来的人，大概率是忙崩了、倦了、或者正经历些什么。
 * 在他重新打开 App 的第一秒甩一张**画满空格的日历**给他，等于把他的缺席
 * 可视化成一堵洞——那不是邀请，是成绩单。很多人会当场退出去。
 *
 * 所以第一屏的主 CTA 永远是「我回来了」；补记/概括是它**下方**的次级入口
 * （用户定稿：两个入口收进 footer、置于主按钮之下），点进二级后由同一枚
 * 「我回来了」完成提交。绝大多数回归用户只想安静地回来，默认路径必须最短。
 *
 * 【两档】
 *   · recent（7–14 天）：可选逐日补记，也可以只用一句话概括；
 *   · distant（14 天以上）：只给一句话。半个月前的事逐日回忆就是在编故事。
 *
 * 【收场演出「返场印章 · 三幕」（ReturnOutro，~1.9s，D0 直出）】
 *   幕一·聚气：整屏纱压暗，八条频道色速度线从屏缘急扫向心；
 *   幕二·盖章：星章 2.4× 砸落定格，落地瞬间双冲击环扩散 + 整层震屏 + 星屑爆射；
 *   幕三·铭牌：WELCOME BACK 黑体逐字母弹入、字距呼吸展开，余烬星屑缓慢上浮。
 *   收场层必须 portal 到 body：App 树是 z-10 堆叠上下文，SheetModal 又 portal
 *   在 body（z-50），不出树的话 cutin 层 z 再高也被弹窗整个压住。
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import type { BackfillEntry, ReturnPayload } from '@/types';
import { SheetModal } from '@/components/SheetModal';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import { ReturnBackfillCalendar } from './ReturnBackfillCalendar';
import { triggerSuccessFeedback } from '@/utils/feedback';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBoldness } from '@/utils/boldness';
import { zClass } from '@/utils/zIndex';
import { P5R, roughQuad, starPts, P5_TITLE_FONT } from '@/components/p5r/kit';
import { P3R, slantClip } from '@/components/p3r/kit';

/**
 * 欢迎语（用户定稿的文案红线）：
 *   · 两句，**逐句换行**，句末不带句号；
 *   · **唯一的变量是「离开了多少天」**，第二句是固定的一行话——
 *     不挑属性、不报等级。原先那套「取等级最高的属性」的选法本身就靠不住：
 *     它只比 level 不看 points，平局时又落到 Dexie 主键的**字母序**上
 *     （charm 恒排第一），新用户五维齐平时永远命中同一个名字，
 *     "这是你最拿得出手的一项"的潜台词根本立不住。
 */
type Seg = { t: string; em?: boolean };
function welcomeLines(p: ReturnPayload): Seg[][] {
  return [
    [{ t: '你不在的 ' }, { t: `${p.daysAway} 天`, em: true }, { t: ' 里' }],
    [{ t: '流转的岁月并未削减你的勇气' }],
  ];
}

type Mode = 'welcome' | 'calendar' | 'summary';
type Chan = ReturnType<typeof useUiChannel>;

/** 频道皮肤 token（内容层用；外壳皮肤由 SheetModal 基座负责） */
const skinOf = (ch: Chan) => {
  switch (ch) {
    case 'p5':
      return {
        accent: P5R.red,
        body: 'text-[#1c1a17]',
        meta: 'text-[#6b675f]',
        divider: 'border-[#05050526]',
        outroVeil: 'rgba(5,5,5,0.8)',
      };
    case 'p3':
      return {
        accent: P3R.blue,
        body: 'text-gray-800 dark:text-gray-100',
        meta: 'text-gray-400 dark:text-gray-500',
        divider: 'border-gray-100 dark:border-gray-700/60',
        outroVeil: 'rgba(9,24,45,0.7)',
      };
    case 'p4':
      return {
        accent: '#e8890c',
        body: 'text-[#131313] dark:text-gray-100',
        meta: 'text-[#131313]/55 dark:text-gray-500',
        divider: 'border-[#13131322] dark:border-gray-700/60',
        outroVeil: 'rgba(42,30,2,0.66)',
      };
    default:
      return {
        accent: 'var(--color-primary)',
        body: 'text-gray-800 dark:text-gray-100',
        meta: 'text-gray-400 dark:text-gray-500',
        divider: 'border-gray-100 dark:border-gray-700/60',
        outroVeil: 'rgba(15,23,42,0.66)',
      };
  }
};

/** 元信息徽章（上次日期 / 第 N 次回来）：小而有形，频道化描边 */
const MetaBadge = ({ ch, rot = 0, children }: { ch: Chan; rot?: number; children: React.ReactNode }) => {
  if (ch === 'p5') {
    return (
      <span
        className="inline-block bg-[#faf6ee] px-2.5 py-1 text-[11px] font-black text-[#050505]"
        style={{ border: '2px solid #050505', boxShadow: '2px 2px 0 #050505', transform: `rotate(${rot}deg)` }}
      >
        {children}
      </span>
    );
  }
  if (ch === 'p3') {
    return (
      <span
        className="inline-block px-3 py-1 text-[11px] font-black"
        style={{ background: '#e4f2fa', color: P3R.ink, clipPath: slantClip(6) }}
      >
        {children}
      </span>
    );
  }
  if (ch === 'p4') {
    return (
      <span className="inline-block rounded-lg px-2.5 py-1 text-[11px] font-black text-[#131313]" style={{ background: 'var(--ui-paper, #fff6d0)', border: '1.5px solid #13131333' }}>
        {children}
      </span>
    );
  }
  return (
    <span className="inline-block rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      {children}
    </span>
  );
};

/**
 * 大按钮（各频道主按钮制式）。首屏的两个入口与二级的「我回来了」共用同一副骨架——
 * 用户定稿：**首屏不放「我回来了」**，只给两个入口；进了二级、真的做出选择之后，
 * 才出现提交键。这样就不存在"什么都没选、手一滑就直接进去了"。
 * tone='ghost' 是同制式的次要皮（弱一档的底色，形状/投影全都保留）。
 */
const ReturnButton = ({ ch, label, tone = 'solid', disabled, onPress }: {
  ch: Chan; label: string; tone?: 'solid' | 'ghost'; disabled?: boolean; onPress: () => void;
}) => {
  const ghost = tone === 'ghost';
  if (ch === 'p5') {
    return (
      <motion.button type="button" whileTap={disabled ? undefined : { x: 2, y: 3 }} onClick={onPress} disabled={disabled} className="relative mb-1 mr-1 w-full disabled:opacity-60">
        <span aria-hidden className="absolute inset-0" style={{ transform: 'translate(4px,5px)', background: '#050505', clipPath: roughQuad(ghost ? 91.3 : 77.3, 6) }} />
        <span aria-hidden className="absolute inset-0" style={{ background: ghost ? '#faf6ee' : P5R.red, clipPath: roughQuad(ghost ? 91.7 : 77.7, 5) }} />
        <span className="relative block py-3.5 text-center text-[16px] font-black tracking-[0.14em]" style={{ fontFamily: P5_TITLE_FONT, color: ghost ? '#050505' : '#ffffff' }}>
          {label}
        </span>
      </motion.button>
    );
  }
  if (ch === 'p3') {
    return (
      <motion.button type="button" whileTap={disabled ? undefined : { scale: 0.97 }} onClick={onPress} disabled={disabled} className="relative w-full disabled:opacity-60">
        <span className="block py-3.5 text-center text-[15px] font-black tracking-[0.14em] text-white" style={{ background: ghost ? P3R.grey : P3R.blue, clipPath: slantClip(12) }}>
          {label}
        </span>
        {!ghost && <span aria-hidden className="absolute bottom-0 right-5 h-[6px] w-[16px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />}
      </motion.button>
    );
  }
  if (ch === 'p4') {
    return (
      <motion.button type="button" whileTap={disabled ? undefined : { scale: 0.97 }} onClick={onPress} disabled={disabled} className="w-full disabled:opacity-60">
        <span
          className="block py-3.5 text-center text-[15px] font-black tracking-[0.1em]"
          style={ghost
            ? { background: 'var(--ui-paper, #fff6d0)', color: '#131313', border: '2px solid #131313', borderRadius: 16, transform: 'skewX(-6deg)' }
            : { background: '#131313', color: 'var(--ui-bg, #ffd900)', borderRadius: 16, transform: 'skewX(-6deg)' }}
        >
          <span className="inline-block" style={{ transform: 'skewX(6deg)' }}>{label}</span>
        </span>
      </motion.button>
    );
  }
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={ghost
        ? 'w-full rounded-2xl border border-gray-300 py-3.5 text-sm font-black text-gray-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300'
        : 'w-full rounded-2xl bg-primary py-3.5 text-sm font-black text-white disabled:opacity-50'}
    >
      {label}
    </button>
  );
};

// ── 收场演出「返场印章 · 三幕」──────────────────────────────────────────────

/** 速度线（幕一）：以中心为原点的放射条，从远处急扫向心。
 *  rotate 必须由外层静态 div 承担——motion 的 x 快捷通道在合成 transform 时
 *  translate 在 rotate 之前（世界坐标平移），叠在同一元素上就不再沿角度走。 */
const Ray = ({ angle, delay, color }: { angle: number; delay: number; color: string }) => (
  <div className="absolute left-1/2 top-1/2" style={{ transform: `rotate(${angle}deg)` }}>
    <motion.div
      initial={{ x: 250, opacity: 0 }}
      animate={{ x: 70, opacity: [0, 0.9, 0] }}
      transition={{ delay, duration: 0.32, ease: 'easeIn' }}
      className="h-[3px] w-[92px] rounded-full"
      style={{ background: `linear-gradient(to left, ${color}, transparent)` }}
    />
  </div>
);

/** 冲击环（幕二落地）：星章身后扩散消散的圆环 */
const ShockRing = ({ delay, to, color }: { delay: number; to: number; color: string }) => (
  <motion.div
    initial={{ scale: 0.45, opacity: 0 }}
    animate={{ scale: to, opacity: [0, 0.75, 0] }}
    transition={{ delay, duration: 0.55, ease: 'easeOut' }}
    className="pointer-events-none absolute h-[170px] w-[170px] rounded-full"
    style={{ border: `3px solid ${color}` }}
  />
);

/** 收场总时长。幕三铭牌落定后必须**留足静止的注视时间**——
 *  初版 1.9s 里字母 1.3s 才落位，只剩 0.6s 就整层撤走，观感是「大字没出现过」。 */
const OUTRO_MS = 2600;

const ReturnOutro = ({ ch }: { ch: Chan }) => {
  const sk = skinOf(ch);
  const starFill = ch === 'p5' ? P5R.red : ch === 'p3' ? P3R.blue : ch === 'p4' ? 'var(--p4-orange, #f9a11b)' : 'var(--color-primary)';
  const lineColor = ch === 'p5' ? P5R.red : ch === 'p3' ? P3R.cyan : ch === 'p4' ? '#f9a11b' : 'var(--color-primary)';
  const sealInk = ch === 'p4' ? '#131313' : '#ffffff';
  const sparkFill = ch === 'p5' ? '#f0e9df' : ch === 'p4' ? '#131313' : '#ffffff';
  // 背景巨字：无衬线黑体、低透明度当装饰层（与 P3 GhostWords 同一语汇）
  const bigTypeFont = '"Noto Sans SC Black", Arial, Helvetica, sans-serif';
  const bigTypeColor = ch === 'p5' ? 'rgba(240,233,223,0.14)'
    : ch === 'p4' ? 'rgba(19,19,19,0.16)'
    : 'rgba(255,255,255,0.15)';

  // 幕一 8 条速度线；幕二 9 颗爆射星屑；幕三 5 颗余烬（确定性布点，挂载一次）
  const rays = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ angle: i * 45 + 12, delay: 0.02 + (i % 4) * 0.028 })), []);
  const burst = useMemo(
    () => Array.from({ length: 9 }, (_, i) => {
      const a = (i / 9) * Math.PI * 2 + 0.35;
      const dist = 125 + (i % 3) * 46;
      return { x: Math.cos(a) * dist, y: Math.sin(a) * dist, size: 10 + (i % 3) * 5, delay: 0.56 + (i % 4) * 0.03 };
    }),
    [],
  );
  const embers = useMemo(
    () => Array.from({ length: 5 }, (_, i) => ({ x: -70 + i * 35 + (i % 2) * 9, size: 7 + (i % 3) * 3, delay: 0.95 + i * 0.1 })),
    [],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className={`fixed inset-0 ${zClass.cutin} flex items-center justify-center overflow-hidden backdrop-blur-md`}
      style={{ background: sk.outroVeil }}
      aria-hidden
    >
      {/* 背景装饰巨字（用户定稿）：WELCOME 从左推入、BACK 从右推入，
          **压在星章底下的一层**——不是排在星章下方的一行小字。
          两行反向对推，星章正落在它们的交叠处；出界部分由外层 overflow-hidden 裁掉。 */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <motion.span
          initial={{ x: '-115%', opacity: 0 }}
          animate={{ x: '-6%', opacity: 1 }}
          transition={{ delay: 0.06, type: 'spring', stiffness: 120, damping: 20, mass: 0.9 }}
          className="whitespace-nowrap font-black uppercase leading-[0.8] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(64px, 23vw, 190px)', fontFamily: bigTypeFont, color: bigTypeColor }}
        >
          Welcome
        </motion.span>
        <motion.span
          initial={{ x: '115%', opacity: 0 }}
          animate={{ x: '6%', opacity: 1 }}
          transition={{ delay: 0.16, type: 'spring', stiffness: 120, damping: 20, mass: 0.9 }}
          className="whitespace-nowrap font-black uppercase leading-[0.8] tracking-[-0.02em]"
          style={{ fontSize: 'clamp(64px, 23vw, 190px)', fontFamily: bigTypeFont, color: bigTypeColor }}
        >
          Back
        </motion.span>
      </div>

      {/* 震屏容器：星章落地时整层抖两下（幕二冲击） */}
      <motion.div
        animate={{ x: [0, 0, -4, 3, -2, 0] }}
        transition={{ delay: 0.5, duration: 0.3, times: [0, 0.05, 0.3, 0.55, 0.8, 1] }}
        className="relative flex flex-col items-center"
        style={{ zIndex: 1 }}
      >
        {/* 幕一 · 聚气：放射速度线急扫向心 */}
        {rays.map((r, i) => <Ray key={i} angle={r.angle} delay={r.delay} color={lineColor} />)}

        {/* 幕二 · 盖章：星章砸落 + 双冲击环 + 星屑爆射 */}
        <div className="relative flex h-[200px] w-[200px] items-center justify-center">
          <ShockRing delay={0.52} to={2.0} color={lineColor} />
          <ShockRing delay={0.64} to={2.6} color={lineColor} />
          <motion.div
            initial={{ scale: 2.4, rotate: -24, opacity: 0 }}
            animate={{ scale: 1, rotate: -8, opacity: 1 }}
            transition={{ delay: 0.24, type: 'spring', stiffness: 380, damping: 20 }}
            className="relative flex h-full w-full items-center justify-center"
          >
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
              <polygon points={starPts(50, 50, 49)} fill={ch === 'p5' ? '#050505' : 'rgba(0,0,0,0.28)'} transform="translate(2.6 3.2)" />
              <polygon points={starPts(50, 50, 49)} fill={starFill} />
              <polygon points={starPts(50, 50, 49)} fill="none" stroke={ch === 'p5' ? '#f0e9df' : 'rgba(255,255,255,0.85)'} strokeWidth="1.8" />
            </svg>
            <motion.span
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.42, type: 'spring', stiffness: 420, damping: 24 }}
              className="relative text-[36px] font-black leading-none tracking-[0.08em]"
              style={{ color: sealInk, fontFamily: ch === 'p5' ? P5_TITLE_FONT : undefined, transform: 'rotate(8deg)' }}
            >
              归来
            </motion.span>
          </motion.div>
          {burst.map((s, i) => (
            <motion.svg
              key={i}
              viewBox="0 0 100 100"
              className="absolute left-1/2 top-1/2"
              style={{ width: s.size, height: s.size, marginLeft: -s.size / 2, marginTop: -s.size / 2 }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
              animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: 0.4 }}
              transition={{ duration: 0.72, delay: s.delay, ease: 'easeOut' }}
            >
              <polygon points={starPts(50, 50, 48)} fill={sparkFill} />
            </motion.svg>
          ))}
          {/* 幕三余烬：小星屑缓慢上浮消散 */}
          {embers.map((e, i) => (
            <motion.svg
              key={`e${i}`}
              viewBox="0 0 100 100"
              className="absolute left-1/2 top-1/2"
              style={{ width: e.size, height: e.size, marginLeft: e.x, marginTop: 30 }}
              initial={{ y: 40, opacity: 0, scale: 1 }}
              animate={{ y: -95, opacity: [0, 0.85, 0], scale: 0.5 }}
              transition={{ delay: e.delay, duration: 1.05, ease: 'easeOut' }}
            >
              <polygon points={starPts(50, 50, 48)} fill={sparkFill} />
            </motion.svg>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export function ReturnPanel({ payload, onClose }: { payload: ReturnPayload | null; onClose: () => void }) {
  const commitReturn = useAppStore(s => s.commitReturn);
  const ch = useUiChannel();
  const anim = useBoldness();
  const sk = skinOf(ch);
  const [mode, setMode] = useState<Mode>('welcome');
  const [entries, setEntries] = useState<BackfillEntry[]>([]);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [outro, setOutro] = useState(false);

  const lines2 = useMemo(() => (payload ? welcomeLines(payload) : []), [payload]);

  const finish = async () => {
    if (!payload || busy) return;
    setBusy(true);
    try {
      await commitReturn(payload, entries, mode === 'summary' ? summary : undefined);
      triggerSuccessFeedback();
      if (!anim) { onClose(); return; }
      // 收场演出：面板保持锁死（busy），三幕播完再真正关闭
      setOutro(true);
      window.setTimeout(() => { setOutro(false); onClose(); }, OUTRO_MS);
    } catch {
      setBusy(false); // 只有失败才解锁重试；成功路径面板即将关闭
    }
  };

  return (
    <>
      <SheetModal
        isOpen={!!payload}
        onClose={onClose}
        position="center"
        title="欢迎回来"
        busy={busy}
        backdropBlur
        footer={
          mode === 'welcome' ? (
            /* 首屏只给两个入口，**不放「我回来了」**（用户定稿）：
               提交键必须出现在做完选择之后的二级页，否则一次误触就算走完了整个回归。
               真的什么都不想写，走标题栏的关闭键即可（那条路不落任何记录）。 */
            <div className="space-y-2.5">
              <p className={`text-center text-[11px] leading-relaxed ${sk.meta}`}>
                {payload?.tier === 'recent'
                  ? '想补上这几天也行，不补也行，空着的日子也是日子。'
                  : '隔了有一阵子了。逐日回忆多半不准，不如用一句话说说这段时间。'}
              </p>
              {payload?.tier === 'recent' && (
                <ReturnButton ch={ch} label="补记这几天" onPress={() => setMode('calendar')} />
              )}
              <ReturnButton
                ch={ch}
                label="用一句话概括"
                tone={payload?.tier === 'recent' ? 'ghost' : 'solid'}
                onPress={() => setMode('summary')}
              />
            </div>
          ) : (
            <ReturnButton ch={ch} label={busy ? '…' : '我回来了'} disabled={busy} onPress={() => void finish()} />
          )
        }
      >
        {payload && (
          <div className="space-y-4">
            {/* ── 第一屏：两句欢迎，逐句换行、句末无句号；数字与属性名抬成频道强调色大字 ── */}
            <div className={`text-[15px] font-bold leading-[1.7] ${sk.body}`}>
              {lines2.map((line, li) => (
                <motion.p
                  key={li}
                  initial={anim ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.38, delay: anim ? li * 0.12 : 0 }}
                  className={li > 0 ? 'mt-1.5' : undefined}
                >
                  {line.map((s, i) =>
                    s.em ? (
                      <motion.em
                        key={i}
                        initial={anim ? { opacity: 0, scale: 1.35 } : false}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.2 + li * 0.12 + i * 0.05 }}
                        className="mx-0.5 inline-block align-baseline text-[24px] font-black not-italic leading-none tabular-nums"
                        style={{ color: sk.accent }}
                      >
                        {s.t}
                      </motion.em>
                    ) : (
                      <span key={i}>{s.t}</span>
                    ),
                  )}
                </motion.p>
              ))}
            </div>

            <motion.div
              initial={anim ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: anim ? 0.16 : 0 }}
              className="flex flex-wrap items-center gap-2"
            >
              <MetaBadge ch={ch} rot={-1.2}>上次 · {payload.lastSeenKey}</MetaBadge>
              <MetaBadge ch={ch} rot={0.9}>第 {payload.returnCount} 次回来</MetaBadge>
            </motion.div>

            {mode === 'calendar' && (
              <ReturnBackfillCalendar
                days={payload.backfillDays}
                entries={entries}
                onChange={setEntries}
                onBack={() => { setEntries([]); setMode('welcome'); }}
              />
            )}

            {mode === 'summary' && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <label className={`text-[12px] font-black ${sk.body}`}>这段时间过得怎么样</label>
                  <button
                    type="button"
                    onClick={() => { setSummary(''); setMode('welcome'); }}
                    className={`inline-flex items-center gap-1 text-[11px] font-bold ${sk.meta}`}
                  >
                    {/* 带回箭头：这是一步「返回」，不带箭头看起来像不可逆的放弃 */}
                    <span aria-hidden>←</span>
                    算了
                  </button>
                </div>
                <BufferedTextInput
                  value={summary}
                  onCommit={setSummary}
                  debounceMs={150}
                  placeholder="一句话就够，比如：忙完了一个大项目"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  aria-label="这段时间的一句话概括"
                />
                <p className={`text-[10px] leading-relaxed ${sk.meta}`}>
                  会记在 {payload.lastSeenKey} 那一天，讲的是那段时间的事，不是今天的。
                </p>
              </div>
            )}

            <p className={`border-t pt-3 text-[10px] leading-relaxed ${sk.divider} ${sk.meta}`}>
              补记的条目<b>不加点数</b>，也<b>不会修复连续天数</b>。
              那个数字记的是「没有断过」，补得回来它就不再代表任何东西了。
              回来这件事，本来就该有自己的名字。
            </p>
          </div>
        )}
      </SheetModal>
      {/* 收场演出 portal 到 body（原因见文件头注释） */}
      {createPortal(<AnimatePresence>{outro && <ReturnOutro ch={ch} />}</AnimatePresence>, document.body)}
    </>
  );
}
