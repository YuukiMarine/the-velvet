/**
 * 公告板「＋ 分享记录」（第 35 批）：从公告板这头也能分享——以前只有记录页长按一条记录这一个入口，很多人不知道。
 *   列最近 10 条**能分享**的记录（自己记的 / 收官 / 愿望实现 / 宣告卡达成 / 周目标完成；系统记录不列），
 *   选一条 → 交给 ShareToOrgSheet（和长按走的是同一张编辑页）；底下一行灰字说长按记录也能到这里。
 *   不标「已分享过」：公告板的快照里没存记录 id，只能按日期和加点猜，用户 10-28 拍板不做。
 */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { slantClip } from '@/components/p3r/kit';
import { roughQuad } from '@/components/p5r/kit';
import { SHARE_KIND_LABEL, canShareActivity, shareKindOf } from '@/utils/orgLogic';
import { useOrgTone } from './orgUi';
import type { Activity } from '@/types';

export const RECENT_PICK_LIMIT = 10;

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (d: Date, now = new Date()): string => {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((b - a) / 86400_000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAY[d.getDay()]}`;
};

/** 最近 N 条能分享的记录（新的在前） */
export function recentShareableActivities(activities: Activity[], limit = RECENT_PICK_LIMIT): Activity[] {
  return [...activities]
    .filter(canShareActivity)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

export function RecentRecordPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (a: Activity) => void }) {
  const tone = useOrgTone();
  const activities = useAppStore(s => s.activities);
  const recent = useMemo(() => (open ? recentShareableActivities(activities) : []), [open, activities]);
  const pts = (a: Activity): number => Object.values(a.pointsAwarded ?? {}).reduce((n, v) => n + (Number(v) || 0), 0);

  return (
    <SheetModal isOpen={open} onClose={onClose} title="选一条最近的记录" maxHeightClass="max-h-[80vh]">
      <div className="space-y-3 px-4 pb-4">
        {recent.length === 0 ? (
          <div className="py-6 text-center text-[13px] font-bold" style={{ color: tone.sub }}>最近没有可以分享的记录</div>
        ) : (
          <div className="space-y-2" role="list">
            {recent.map((a, i) => {
              const kind = shareKindOf(a);
              const kindLabel = kind ? SHARE_KIND_LABEL[kind] : '';
              const total = pts(a);
              return (
                <motion.button
                  key={a.id}
                  type="button"
                  role="listitem"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onPick(a)}
                  className="block w-full px-3.5 py-2.5 text-left"
                  style={{
                    background: tone.soft,
                    color: tone.ink,
                    borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 12,
                    clipPath: tone.channel === 'p3' ? slantClip(6) : tone.channel === 'p5' ? roughQuad(i + 0.7, 2) : undefined,
                  }}
                >
                  <div className="line-clamp-2 break-words text-[14px] font-black leading-snug" style={{ fontFamily: tone.titleFont }}>{a.description}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-bold" style={{ color: tone.sub }}>
                    <span>{dayLabel(new Date(a.date))}</span>
                    {total > 0 && <span>+{total}</span>}
                    {kindLabel && <span>{kindLabel}</span>}
                    {a.backfilled && <span>补记</span>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
        <p className="text-[11px] font-semibold leading-relaxed" style={{ color: tone.sub }}>
          在记录页长按一条记录、选「分享到据点」，也能到同一个地方。
        </p>
      </div>
    </SheetModal>
  );
}
