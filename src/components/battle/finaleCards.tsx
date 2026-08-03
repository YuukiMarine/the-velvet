/**
 * Lv6 终局 · 记录卡阵（PRD_FINAL_BOSS §5.3）
 *
 * 楔形：细的一端指向伪神，左三右三，发光。出现前先炸一次四角星。
 * 点一张 → 飞向中心 → 巨额伤害，伪神无法还击，每命中一次它回一句。
 *
 * D0：星芒不闪、卡不飞，直接出现／直接消失——流程一步不少，只是不动。
 */
import { motion, AnimatePresence } from 'motion/react';
import type { AttributeId } from '@/types';
import type { FinaleCard } from '@/utils/finaleRecords';
import { useBoldness } from '@/utils/boldness';

/** 卡面染色：跟随该条记录当时加点最多的属性 */
const ATTR_INK: Record<string, string> = {
  knowledge: '#5b8cff',
  guts: '#ff5b5b',
  dexterity: '#3fd0b8',
  kindness: '#7ee06a',
  charm: '#e879f9',
};
const DEFAULT_INK = '#e8b64c';
export const inkOf = (attr?: AttributeId) => (attr && ATTR_INK[attr]) || DEFAULT_INK;

/** 四角星（与站内 ✦ / OnlineStarBadge 同族，放大版） */
export function StarFlash({ size = 64, ink = DEFAULT_INK, delay = 0 }: { size?: number; ink?: string; delay?: number }) {
  const bold = useBoldness();
  return (
    <motion.svg
      viewBox="0 0 24 24" width={size} height={size} aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{ marginLeft: -size / 2, marginTop: -size / 2, filter: `drop-shadow(0 0 8px ${ink})` }}
      initial={bold ? { scale: 0.2, opacity: 0, rotate: -25 } : { opacity: 1 }}
      animate={bold ? { scale: [0.2, 1.25, 0.9], opacity: [0, 1, 0] } : { opacity: [1, 0] }}
      transition={{ duration: bold ? 0.5 : 0.2, delay, ease: 'easeOut' }}
    >
      <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill={ink} />
    </motion.svg>
  );
}

/**
 * 楔形卡。side='left' 时细端在右（朝中心的伪神），right 反之。
 * clip-path 只吃百分比，卡本身是普通矩形盒——飞行用 transform，不动布局。
 */
export function WedgeCard({
  card, side, index, onHit, disabled,
}: {
  card: FinaleCard;
  side: 'left' | 'right';
  index: number;
  onHit: () => void;
  disabled?: boolean;
}) {
  const bold = useBoldness();
  const ink = inkOf(card.attr);
  // 左侧：左宽右尖；右侧镜像
  const clip = side === 'left'
    ? 'polygon(0 0, 100% 16%, 100% 84%, 0 100%)'
    : 'polygon(0 16%, 100% 0, 100% 100%, 0 84%)';
  const from = side === 'left' ? -40 : 40;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onHit}
      initial={bold ? { x: from, opacity: 0, rotate: side === 'left' ? -6 : 6 } : { opacity: 1 }}
      animate={{ x: 0, opacity: 1, rotate: side === 'left' ? -3 : 3 }}
      exit={bold
        // 命中：朝中心（伪神）飞过去并缩小，像被吸进去
        ? { x: side === 'left' ? 150 : -150, y: -90, scale: 0.35, opacity: 0, rotate: 0 }
        : { opacity: 0 }}
      transition={{ duration: bold ? 0.42 : 0.15, delay: bold ? index * 0.13 : 0, ease: 'easeOut' }}
      whileTap={bold ? { scale: 0.94 } : undefined}
      className="relative block w-full text-left disabled:opacity-40"
      style={{
        clipPath: clip,
        background: `linear-gradient(${side === 'left' ? 100 : 260}deg, rgba(0,0,0,0.82), ${ink}22)`,
        border: 'none',
        padding: side === 'left' ? '10px 22px 10px 12px' : '10px 12px 10px 22px',
        boxShadow: `0 0 14px ${ink}55`,
      }}
    >
      {/* 边光：clip 之后 border 会被切掉，用一层同形状的底色描边替代 */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ clipPath: clip, background: ink, opacity: 0.22 }}
      />
      <span className="relative block">
        <span className="block text-[9px] font-bold tabular-nums tracking-wider" style={{ color: ink }}>
          {card.dateKey}{card.important ? ' ★' : ''}
        </span>
        <span className="mt-0.5 block text-[12px] font-bold leading-snug text-white/95 line-clamp-2">
          {card.text}
        </span>
      </span>
    </motion.button>
  );
}

/** 一轮 6 张（左 3 右 3）；命中的那张从 DOM 里移除，其余留在原位 */
export function CardArena({
  cards, onHit, busy,
}: {
  cards: FinaleCard[];
  onHit: (card: FinaleCard) => void;
  busy?: boolean;
}) {
  const left = cards.filter((_, i) => i % 2 === 0);
  const right = cards.filter((_, i) => i % 2 === 1);
  const col = (list: FinaleCard[], side: 'left' | 'right') => (
    <div className="flex flex-1 flex-col gap-2.5">
      <AnimatePresence mode="popLayout">
        {list.map((c, i) => (
          <div key={c.id} className="relative">
            <StarFlash size={44} ink={inkOf(c.attr)} delay={i * 0.13} />
            <WedgeCard card={c} side={side} index={i} onHit={() => onHit(c)} disabled={busy} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
  return (
    <div className="flex w-full items-center gap-2.5">
      {col(left, 'left')}
      {col(right, 'right')}
    </div>
  );
}
