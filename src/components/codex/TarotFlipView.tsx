import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import type { TarotCardData } from '@/constants/tarot';
import { FlipBackPanel, FlipCardView } from './FlipCardView';
import type { TarotEntry } from './codexData';

/**
 * 图鉴的塔罗放大页（第 6 轮）：正面牌图，背面牌名 / 关键词 / 正位与逆位牌意 / 首次收录与次数。
 * 翻面与阻尼在 FlipCardView 里，和岁时卡共用。
 */
export const TarotFlipView = ({ card, entry, open, onClose }: {
  card: TarotCardData | null;
  entry?: TarotEntry;
  open: boolean;
  onClose: () => void;
}) => {
  if (!card) return null;
  const collectedUp = !!entry?.upright.count;
  const collectedRev = !!entry?.reversed.count;
  return (
    <FlipCardView
      open={open}
      onClose={onClose}
      label={`${card.name} · 图鉴`}
      resetKey={card.id}
      hint="点一下或左右拖动翻面 · 背面是牌意"
      front={(w) => <TarotCardSVG card={card} orientation="upright" width={w} staticCard showOrientationTag={false} />}
      back={() => (
        <FlipBackPanel>
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[22px] font-black leading-none">{card.name}</div>
              <div className="mt-1 text-[11px] font-bold tracking-[0.2em] opacity-60">{card.nameEn.toUpperCase()}</div>
            </div>
            {card.roman && <div className="text-[28px] font-black leading-none opacity-30">{card.roman}</div>}
          </div>
          <div className="mt-4 space-y-3 text-[13px] leading-relaxed">
            <div>
              <div className="mb-1 flex items-center gap-2 text-[11px] font-black tracking-wider">
                <span className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5" style={{ background: 'rgba(26,23,18,0.08)' }}>正位</span>
                <span className="opacity-60">{card.upright.keywords.join(' · ')}</span>
              </div>
              <p>{card.upright.meaning}</p>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 text-[11px] font-black tracking-wider">
                <span className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5" style={{ background: 'rgba(26,23,18,0.08)' }}>逆位</span>
                <span className="opacity-60">{card.reversed.keywords.join(' · ')}</span>
              </div>
              <p>{card.reversed.meaning}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-black/10 pt-3 text-[11px] font-bold opacity-70">
            <div>正位 {collectedUp ? `首次 ${entry!.upright.first} · ${entry!.upright.count} 次` : '尚未抽到'}</div>
            <div className="mt-0.5">逆位 {collectedRev ? `首次 ${entry!.reversed.first} · ${entry!.reversed.count} 次` : '尚未抽到'}</div>
          </div>
        </FlipBackPanel>
      )}
    />
  );
};
