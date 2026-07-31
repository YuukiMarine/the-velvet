/**
 * LootReveal —— 战利品揭示仪式（R17 #2/#5：告别「toast 一闪当没掉」）。
 *
 * 两种开场：
 *   · chest（月匣）＝开匣：月匣图腾震动 → 爆光 → 卡背自匣心弹出；
 *   · elite/golden/boss（强敌/金色/心魔）＝抽卡：卡背从屏下扇形飞入。
 * 共通主体：逐张点翻（或 5s 后自动连翻）——卡面按品质走 残月/弦月/满月 三档色。
 * 终幕：战斗来源在全翻后进入 MG——水波纹环爆 + 无衬线巨字「DONE AND DUSTED.」；
 * 月匣走轻收尾（收下按钮），胜利语气的大字只留给战斗。
 *
 * 层级：z-[70]——压过塔屏(z-40)与战斗(z-50)，低于……没有更高的了；
 * 心魔流程是 reveal 关闭后才拉 VictoryModal(z-60)，两者不同帧共存。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { LootDrop } from '@/battle/loot';
import {
  RELIC_POOL, MYTH_POOL, OATH_POOL, CHAIN_POOL, QUALITY_LABEL,
  relicEntryText, mythEntryText,
} from '@/battle/loot';
import type { LootQuality } from '@/types';
import { playSound } from '@/utils/feedback';
import { useBackHandler } from '@/utils/useBackHandler';
import { slantPoly, NoiseLayer, IconCrescent, IconTower, IconCase, IconOrb, IconGuard, IconBolt, IconSpark } from '@/components/battle/warKit';

export type LootRevealSource = 'chest' | 'elite' | 'golden' | 'boss';

interface Props {
  open: boolean;
  source: LootRevealSource;
  drops: LootDrop[];
  sp?: number;
  onClose: () => void;
}

const SOURCE_LABEL: Record<LootRevealSource, string> = {
  chest: '月匣开启',
  elite: '强敌讨伐',
  golden: '金色回响',
  boss: '心魔讨伐',
};

/** 品质三档：残月银蓝 / 弦月靛紫 / 满月暗金（深渊金同源） */
const TIER_STYLE: Record<LootQuality, { accent: string; rgb: string; face: string }> = {
  waning: { accent: '#9db4d8', rgb: '157,180,216', face: '#101a33' },
  half:   { accent: '#8b7cf6', rgb: '139,124,246', face: '#150f38' },
  full:   { accent: '#e8b64c', rgb: '232,182,76',  face: '#1c1303' },
};

interface CardData { tag: string; name: string; entry: string; tier: LootQuality; kind: LootDrop['kind'] }

const cardOf = (d: LootDrop): CardData => {
  switch (d.kind) {
    case 'relic': return { kind: d.kind, tag: '遗物', name: RELIC_POOL[d.relic.kind].name, entry: relicEntryText(d.relic), tier: d.relic.quality };
    case 'myth':  return { kind: d.kind, tag: '迷思', name: MYTH_POOL[d.myth.kind].name, entry: mythEntryText(d.myth), tier: d.myth.quality };
    case 'oath':  return { kind: d.kind, tag: '誓约石', name: OATH_POOL[d.oath.kind].stoneName, entry: OATH_POOL[d.oath.kind].effectText, tier: 'full' };
    case 'chain': return { kind: d.kind, tag: '共鸣链', name: CHAIN_POOL[d.chain.key].name, entry: CHAIN_POOL[d.chain.key].effectText, tier: 'full' };
    case 'sp':    return { kind: d.kind, tag: 'SP', name: `+${d.amount} SP`, entry: d.reason, tier: 'half' };
  }
};

/** 卡面中央的类别图腾（水印级弱化——填满卡腹，不与文字抢） */
const KIND_GLYPH: Record<LootDrop['kind'], typeof IconCase> = {
  relic: IconCase, myth: IconOrb, oath: IconGuard, chain: IconBolt, sp: IconSpark,
};

/** motion 补间 SVG r：环放大时描边恒粗（P3 轮盘同款技法，战场本地复刻） */
const Ring = ({ r1, stroke, width, delay, duration }: { r1: number; stroke: string; width: number; delay: number; duration: number }) => (
  <motion.circle
    cx="50%" cy="50%" fill="none" stroke={stroke} strokeWidth={width}
    initial={{ r: 18, opacity: 0 }}
    animate={{ r: r1, opacity: [0, 0.9, 0.4, 0] }}
    transition={{ duration, delay, ease: [0.16, 0.7, 0.35, 1], opacity: { duration, delay, times: [0, 0.1, 0.4, 0.75] } }}
  />
);

/** 单张战利品卡：卡背（塔徽 + 斜纹）⇄ 卡面（品质带 + 名 + 词条） */
const LootCard = ({ card, flipped, delay, fromCase, onFlip }: {
  card: CardData; flipped: boolean; delay: number; fromCase: boolean; onFlip: () => void;
}) => {
  const t = TIER_STYLE[card.tier];
  return (
    <motion.button
      type="button"
      onClick={onFlip}
      className="relative h-[176px] w-[122px] shrink-0 focus-visible:outline-none"
      style={{ perspective: 700 }}
      initial={fromCase ? { y: 26, scale: 0.2, opacity: 0 } : { y: 240, rotate: -8 + Math.random() * 16, opacity: 0 }}
      animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26, delay }}
      aria-label={flipped ? card.name : '翻开战利品'}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.5, ease: [0.3, 0.1, 0.2, 1] }}
      >
        {/* 卡背 */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{
            backfaceVisibility: 'hidden',
            clipPath: slantPoly(9),
            background: 'linear-gradient(160deg, #171c46 0%, #0c1030 58%, #090c24 100%)',
            border: '1px solid rgba(139,124,246,0.35)',
          }}
        >
          <span aria-hidden className="absolute inset-0 opacity-40" style={{ background: 'repeating-linear-gradient(125deg, transparent 0 9px, rgba(139,124,246,0.12) 9px 11px)' }} />
          <IconTower size={30} className="relative text-indigo-300/80" />
          <span className="relative text-[9px] font-bold tracking-[0.3em] text-indigo-200/50">SPOILS</span>
        </div>
        {/* 卡面（预翻 180°） */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden px-2.5 pb-2.5 pt-2 text-left"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            clipPath: slantPoly(9),
            background: `linear-gradient(170deg, ${t.face} 0%, #0a0e26 70%)`,
            border: `1px solid rgba(${t.rgb},0.55)`,
            boxShadow: `0 0 22px rgba(${t.rgb},0.28)`,
          }}
        >
          {/* 品质带 */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-[5px]" style={{ background: `linear-gradient(90deg, transparent, ${t.accent}, transparent)` }} />
          {/* 类别图腾水印 */}
          {(() => { const G = KIND_GLYPH[card.kind]; return (
            <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: `rgba(${t.rgb},0.2)` }}>
              <G size={54} />
            </span>
          ); })()}
          <div className="flex items-center justify-between pt-1.5">
            <span className="text-[9px] font-black tracking-[0.18em]" style={{ color: t.accent }}>{card.tag}</span>
            {card.tag !== 'SP' && card.tag !== '誓约石' && card.tag !== '共鸣链' && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold" style={{ color: t.accent }}>
                <IconCrescent size={9} />{QUALITY_LABEL[card.tier]}
              </span>
            )}
          </div>
          <p className="mt-2 text-[15px] font-black leading-snug text-white" style={{ fontFamily: 'Georgia, "Noto Serif SC", serif' }}>
            {card.name}
          </p>
          <p className="mt-auto text-[10px] font-semibold leading-relaxed" style={{ color: `rgba(${t.rgb},0.9)` }}>
            {card.entry}
          </p>
          {/* 满月加冕：翻面即闪四道细光 */}
          {card.tier === 'full' && flipped && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              style={{ background: `radial-gradient(circle at 50% 42%, rgba(${t.rgb},0.5) 0%, transparent 62%)` }}
            />
          )}
        </div>
      </motion.div>
    </motion.button>
  );
};

export function LootReveal({ open, source, drops, sp = 0, onClose }: Props) {
  const cards = useMemo(() => drops.map(cardOf), [drops]);
  const isChest = source === 'chest';
  const [phase, setPhase] = useState<'case' | 'draw' | 'finale'>(isChest ? 'case' : 'draw');
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const finaleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allFlipped = flipped.length === cards.length && flipped.every(Boolean);

  // 开场复位（open 沿）
  useEffect(() => {
    if (!open) return;
    setPhase(isChest ? 'case' : 'draw');
    setFlipped(cards.map(() => false));
    playSound(isChest ? '/battle-seal.mp3' : '/ui-menu.mp3', 0.55);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 月匣：震 1.05s 后爆开进入抽卡
  useEffect(() => {
    if (!open || phase !== 'case') return;
    const t = setTimeout(() => { setPhase('draw'); playSound('/battle-impact.mp3', 0.45); }, 1050);
    return () => clearTimeout(t);
  }, [open, phase]);

  // 抽卡阶段 5s 未翻完 → 自动连翻（懒人保险，也是演出兜底）
  useEffect(() => {
    if (!open || phase !== 'draw' || allFlipped || cards.length === 0) return;
    const t = setTimeout(() => {
      cards.forEach((_, i) => {
        setTimeout(() => setFlipped(prev => { const n = [...prev]; n[i] = true; return n; }), i * 300);
      });
    }, 5000);
    return () => clearTimeout(t);
  }, [open, phase, allFlipped, cards]);

  // 全翻 → 战斗来源入终幕；月匣停在确认。
  // 2.4s 缓冲：翻完最后一张要给人读卡的时间（终幕会盖掉卡面）；性急可点按提前。
  useEffect(() => {
    if (!open || phase !== 'draw' || !allFlipped || cards.length === 0) return;
    if (isChest) return;
    finaleTimer.current = setTimeout(() => {
      setPhase('finale');
      playSound('/battle-fanfare.mp3', 0.55);
    }, 2400);
    return () => { if (finaleTimer.current) clearTimeout(finaleTimer.current); };
  }, [open, phase, allFlipped, cards.length, isChest]);

  const advanceFinale = () => {
    if (isChest || phase !== 'draw' || !allFlipped) return;
    if (finaleTimer.current) clearTimeout(finaleTimer.current);
    setPhase('finale');
    playSound('/battle-fanfare.mp3', 0.55);
  };

  useBackHandler(open, () => { if (phase !== 'case') handleDone(); });

  const handleDone = () => {
    if (!isChest && phase !== 'finale' && !allFlipped) return; // 战斗来源必须走完仪式
    onClose();
  };

  const flipOne = (i: number) => {
    if (phase !== 'draw' || flipped[i]) return;
    playSound('/ui-menu.mp3', 0.5);
    setFlipped(prev => { const n = [...prev]; n[i] = true; return n; });
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden px-6"
      style={{ background: 'radial-gradient(circle at 50% 38%, rgba(19,23,58,0.97) 0%, rgba(4,3,12,0.99) 62%)' }}
      onClick={phase === 'finale' ? handleDone : advanceFinale}
    >
      <NoiseLayer opacity={0.06} />
      {/* 幽灵大字 */}
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-[9%] -translate-x-1/2 select-none whitespace-nowrap text-[64px] font-black italic tracking-[-0.02em] text-white/[0.05]">
        {isChest ? 'MOON CASE' : 'SPOILS'}
      </span>

      {/* 眉标：来源 + SP */}
      <AnimatePresence>
        {phase !== 'finale' && (
          <motion.div
            initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-[15%] flex items-center gap-2"
          >
            <span className="px-3 py-1 text-[13px] font-black tracking-[0.22em] text-indigo-100" style={{ clipPath: slantPoly(7), background: 'rgba(139,124,246,0.22)', border: '1px solid rgba(139,124,246,0.45)' }}>
              {SOURCE_LABEL[source]}
            </span>
            {sp > 0 && (
              <span className="px-2.5 py-1 text-[12px] font-black tabular-nums text-yellow-200" style={{ clipPath: slantPoly(6), background: 'rgba(250,204,21,0.14)', border: '1px solid rgba(250,204,21,0.4)' }}>
                +{sp} SP
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 月匣图腾（chest 开场）── */}
      <AnimatePresence>
        {phase === 'case' && (
          <motion.div
            key="case"
            className="flex h-[132px] w-[132px] items-center justify-center"
            style={{ clipPath: slantPoly(14), background: 'linear-gradient(160deg, #1b2050 0%, #0d1132 70%)', border: '1px solid rgba(139,124,246,0.5)' }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, x: [0, -4, 5, -6, 6, -3, 0] }}
            exit={{ scale: 1.55, opacity: 0, transition: { duration: 0.22 } }}
            transition={{ x: { duration: 0.95, times: [0, 0.2, 0.4, 0.55, 0.7, 0.85, 1] } }}
          >
            <IconCrescent size={52} className="text-indigo-200" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 抽卡主体 ── */}
      {phase === 'draw' && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {cards.map((c, i) => (
              <LootCard key={i} card={c} flipped={!!flipped[i]} delay={0.08 + i * 0.14} fromCase={isChest} onFlip={() => flipOne(i)} />
            ))}
          </div>
          <p className="mt-7 text-[12px] font-bold tracking-[0.2em] text-indigo-200/60">
            {allFlipped ? (isChest ? '收获已定' : '点 按 收 束') : '点 卡 翻 开'}
          </p>
          {isChest && allFlipped && (
            <motion.button
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              onClick={handleDone}
              className="mt-4 px-10 py-3 text-[15px] font-black tracking-widest text-white"
              style={{ clipPath: slantPoly(10), background: 'linear-gradient(135deg, #4338ca, #8b7cf6)' }}
            >
              收下
            </motion.button>
          )}
        </>
      )}

      {/* ── 终幕 MG：水波纹环爆 + DONE AND DUSTED. ── */}
      {phase === 'finale' && (
        <>
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
            <Ring r1={340} stroke="rgba(255,255,255,0.9)" width={16} delay={0} duration={1.0} />
            <Ring r1={430} stroke="rgba(139,124,246,0.8)" width={22} delay={0.09} duration={1.15} />
            <Ring r1={520} stroke="rgba(255,255,255,0.5)" width={10} delay={0.2} duration={1.3} />
            <Ring r1={620} stroke="rgba(232,182,76,0.55)" width={14} delay={0.3} duration={1.45} />
          </svg>
          <motion.div
            className="relative select-none text-center"
            initial={{ scale: 0.86 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ rotate: -5 }}
          >
            {(['DONE AND', 'DUSTED.'] as const).map((line, i) => (
              <motion.div
                key={line}
                className="whitespace-nowrap font-black italic leading-[0.92] tracking-[-0.03em] text-white"
                style={{ fontFamily: '"Arial Black", Arial, sans-serif', fontSize: 64, textShadow: '0 4px 0 rgba(139,124,246,0.45)' }}
                initial={{ clipPath: 'inset(-10% 102% -10% -2%)', x: 30 }}
                animate={{ clipPath: 'inset(-10% -4% -10% -2%)', x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.13, ease: [0.2, 0.9, 0.25, 1] }}
              >
                {line}
              </motion.div>
            ))}
            {/* 终幕仍报全名——大字盖掉卡面后，收获清单不能跟着消失 */}
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
              className="mx-auto mt-4 max-w-[320px] text-[12px] font-bold leading-relaxed text-indigo-100/90"
            >
              {cards.map(c => c.name).join(' · ')}
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }}
              className="mt-2 text-[11px] font-bold tracking-[0.3em] text-indigo-200/60"
            >
              {SOURCE_LABEL[source]} · 战利品 ×{cards.length}{sp > 0 ? ` · +${sp} SP` : ''}
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}
              className="mt-6 text-[11px] font-semibold tracking-[0.2em] text-white/40"
            >
              点 按 继 续
            </motion.p>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
