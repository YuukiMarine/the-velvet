/**
 * AttrDetailInlineP4 —— P4 黄频道的「属性档案原地展开」。
 *
 * 与 p3 的 AttrDetailInline 同一交互契约（点花瓣 → 花层旋转放大沉为衬底、详情在原位
 * 撑开、再点任意处倒放收回），数据口径也同源（等级/阈值/称号阶梯/关联成就）；
 * 差别只在视觉语汇：p3 是蓝斜切片，这里是 P4 的衬线大字 + 橙贴纸 + 奶油面板 + 花瓣。
 *
 * 铁律：容器 skew 只作用于外壳，字恒水平（内容层反向回正）。
 */
import { useRef } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import type { AttributeId } from '@/types';
import { getAttributeLevelTitle } from '@/utils/attributeLevelTitles';
import { P4Flower, P4Sparkle, P4Check } from '@/ui/p4Kit';

const ORANGE = 'var(--p4-orange, #f9a11b)';
const INK = '#131313';
const PAPER = 'var(--ui-paper)';

export const AttrDetailInlineP4 = ({ attrId, level: fallbackLevel, onBack }: {
  attrId: AttributeId; level: number; onBack: () => void;
}) => {
  // 逐字段订阅（A2）：首页常驻件，别让每次 store 写入都把它重算一遍
  const attributes = useAppStore(s => s.attributes);
  const achievements = useAppStore(s => s.achievements);
  const settings = useAppStore(s => s.settings);
  const attr = attributes.find((a) => a.id === attrId);
  const thresholds = settings.levelThresholds?.length ? settings.levelThresholds : attr?.levelThresholds ?? [];
  const lvlMax = thresholds.length || 5;
  const level = attr?.level ?? fallbackLevel;
  const isMax = level >= lvlMax;
  const curThreshold = level > 1 ? thresholds[level - 1] : 0;
  const nextThreshold = !isMax ? thresholds[level] : thresholds[lvlMax - 1];
  const points = attr?.points ?? 0;
  const progress = isMax ? 1 : Math.max(0, Math.min(1, (points - curThreshold) / Math.max(1, nextThreshold - curThreshold)));
  const name = settings.attributeNames?.[attrId] || attr?.displayName || '';
  const curTitle = getAttributeLevelTitle(settings.attributeLevelTitles, attrId, level);
  const related = achievements.filter((a) => a.condition.attribute === attrId || a.condition.type === 'all_attributes_max');
  const unlockedCount = related.filter((a) => a.unlocked).length;
  const achScrollRef = useRef<HTMLDivElement>(null);

  // 纯位移进出（同 p3 口径）：名字从左飞入，数据块从右逐条飞入；exit 反向倒放
  const container = {
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
    hide: { transition: { staggerChildren: 0.05, staggerDirection: -1 as const } },
  };
  const fromRight = { hide: { x: '118%' }, show: { x: '0%' } };
  const spring = { type: 'spring' as const, stiffness: 250, damping: 26 };

  return (
    <motion.div
      className="relative z-10 cursor-pointer pb-2 pt-1"
      onClick={onBack}
      variants={container}
      initial="hide"
      animate="show"
      exit="hide"
    >
      {/* 属性名衬线大字 + 橙 LV 贴纸（进：曲线位移+缩放到左上；退：渐隐，避免曲线倒放卡顿） */}
      <motion.div
        className="relative origin-top-left"
        initial={{ x: '30%', y: 40, scale: 0.58 }}
        animate={{ x: ['30%', '8%', '0%'], y: [40, -8, 0], scale: [0.58, 0.94, 1], transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1], times: [0, 0.58, 1] } }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
      >
        <div className="flex items-end gap-2">
          <span className="text-[50px] font-black leading-none" style={{ color: INK, fontFamily: 'var(--p4-display-font, serif)' }}>{name}</span>
          <P4Sparkle size={20} color={ORANGE} className="mb-2" />
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="relative inline-flex items-baseline gap-1 px-4 py-1" style={{ background: ORANGE, borderRadius: 16, transform: 'skewX(-8deg)' }}>
            <span className="flex items-baseline gap-1" style={{ transform: 'skewX(8deg)' }}>
              <span className="text-[11px] font-black tracking-wider" style={{ color: INK }}>LV</span>
              <span className="text-[20px] font-black leading-none tabular-nums" style={{ color: INK }}>{level}</span>
            </span>
          </span>
          <span className="text-[16px] font-black" style={{ color: INK }}>{curTitle}</span>
          <span className="ml-auto text-[12px] font-black tabular-nums" style={{ color: 'rgba(19,19,19,0.55)' }}>{points} pt</span>
        </div>
      </motion.div>

      {/* 进度（奶油槽 + 橙填充，斜切胶囊） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1 flex items-baseline justify-between text-[11px] font-black" style={{ color: INK }}>
          <span>{isMax ? '已达最高等级' : `距 Lv.${level + 1}`}</span>
          <span className="tabular-nums">{isMax ? 'MAX' : `${points - curThreshold}/${nextThreshold - curThreshold}`}</span>
        </div>
        <div className="relative h-[12px] w-full overflow-hidden" style={{ background: PAPER, borderRadius: 8 }}>
          <div className="absolute inset-y-0 left-0" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${ORANGE}, #ffd043)`, borderRadius: 8 }} />
        </div>
      </motion.div>

      {/* 称号阶梯 */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1.5 flex items-center gap-1.5">
          <P4Flower size={13} color={INK} />
          <span className="text-[12px] font-black" style={{ color: INK }}>称号阶梯</span>
        </div>
        <div className="space-y-1">
          {Array.from({ length: lvlMax }, (_, i) => {
            const lv = i + 1;
            const reached = level >= lv;
            const current = level === lv;
            return (
              <div
                key={lv}
                className="flex items-center gap-2.5 px-3 py-1.5 text-[13px]"
                style={{
                  background: current ? INK : reached ? PAPER : 'rgba(19,19,19,0.06)',
                  borderRadius: 12,
                  color: current ? PAPER : reached ? INK : 'rgba(19,19,19,0.45)',
                }}
              >
                <span className="w-9 shrink-0 text-[11px] font-black tabular-nums">Lv.{lv}</span>
                <span className="flex-1 font-black">{getAttributeLevelTitle(settings.attributeLevelTitles, attrId, lv)}</span>
                {current && <span className="text-[10px] font-black" style={{ color: ORANGE }}>◀ 现在</span>}
                {!reached && <span className="text-[10px] tabular-nums">{thresholds[i] ?? 0} pt</span>}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* 关联成就（横滑奶油小卡） */}
      <motion.div className="relative mt-4" variants={fromRight} transition={spring}>
        <div className="mb-1.5 flex items-center gap-1.5">
          <P4Flower size={13} color={INK} />
          <span className="text-[12px] font-black" style={{ color: INK }}>关联成就（{unlockedCount}/{related.length}）</span>
        </div>
        {related.length === 0 ? (
          <div className="px-3 py-4 text-center text-[12px] font-black" style={{ background: PAPER, borderRadius: 14, color: 'rgba(19,19,19,0.5)' }}>
            这个方向还没有专属成就
          </div>
        ) : (
          <div
            ref={achScrollRef}
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-x' }}
          >
            {related.map((a) => (
              <div
                key={a.id}
                className="flex w-[132px] shrink-0 flex-col gap-1 px-3 py-2.5"
                style={{ background: a.unlocked ? ORANGE : PAPER, borderRadius: 14, boxShadow: '0 2px 0 rgba(19,19,19,0.12)' }}
              >
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="text-[15px] leading-none">{a.icon}</span>
                  {a.unlocked && <P4Check size={11} color={INK} />}
                </div>
                <span className="truncate text-[12px] font-black" style={{ color: INK }}>{a.title}</span>
                <span className="truncate text-[10px] font-bold" style={{ color: 'rgba(19,19,19,0.6)' }}>{a.description}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <motion.div className="relative mt-3 text-[11px] font-black" style={{ color: 'rgba(19,19,19,0.5)' }} variants={fromRight} transition={spring}>
        点击任意处返回花瓣图 ▸
      </motion.div>
    </motion.div>
  );
};
