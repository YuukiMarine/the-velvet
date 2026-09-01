/**
 * 弹幕环境层（共享）：官方种子 + 云端已过审弹幕的飘动展示。
 *
 * App Store UGC 合规（审核指南 1.2：用户生成内容必须有举报与屏蔽机制）：
 *   - 云端条目（id 非空）可点击 → 弹「举报并隐藏」确认卡 → reportAndBlockDanmaku
 *     （提交 danmaku_reports + 写本地屏蔽名单），该条即刻从本机消失；
 *   - 官方种子池条目（id 空串）不是 UGC，保持纯装饰不可点；
 *   - 内容本身已是「先审后发」（PB Admin 人工过审才公开），举报是过审内容的兜底。
 *
 * 布局/速度参数取自原 BigDealClearCutIn 与 FateDrawSheet 两处内联实现的现值，
 * 皮肤（字色/透明度）由调用方经 lineClassName 传入，本组件不関频道。
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { reportAndBlockDanmaku, type DanmakuItem } from '@/services/danmaku';

export const DanmakuLayer = ({
  items,
  lineClassName,
  bold,
  topBase = 14,
  topStep = 34,
  durBase = 13,
  durStep = 4,
}: {
  items: DanmakuItem[];
  lineClassName: string;
  bold: boolean;
  topBase?: number;
  topStep?: number;
  durBase?: number;
  durStep?: number;
}) => {
  const [target, setTarget] = useState<DanmakuItem | null>(null);
  // 本会话已举报的条目（服务层的持久名单管跨会话；这份 state 管「点完立刻消失」）
  const [gone, setGone] = useState<string[]>([]);
  const [toast, setToast] = useState(false);

  const visible = items.filter(it => !(it.id && gone.includes(it.id)));

  const confirmReport = () => {
    const t = target;
    setTarget(null);
    if (!t?.id) return;
    setGone(g => [...g, t.id]);
    void reportAndBlockDanmaku(t.id);
    setToast(true);
    setTimeout(() => setToast(false), 2200);
  };

  return (
    <>
      {bold &&
        visible.map((it, i) => (
          <motion.span
            key={`${i}-${it.id || it.text}`}
            aria-hidden={it.id ? undefined : true}
            role={it.id ? 'button' : undefined}
            aria-label={it.id ? `弹幕：${it.text}（点击可举报）` : undefined}
            className={`absolute whitespace-nowrap ${it.id ? 'pointer-events-auto cursor-pointer px-2 py-1' : 'pointer-events-none'} ${lineClassName}`}
            style={{ top: `${topBase + i * topStep}%` }}
            initial={{ x: '60vw' }}
            animate={{ x: '-110vw' }}
            transition={{ duration: durBase + i * durStep, ease: 'linear', repeat: Infinity }}
            onClick={it.id ? () => setTarget(it) : undefined}
          >
            {it.text}
          </motion.span>
        ))}

      <AnimatePresence>
        {target && (
          <motion.div
            key="danmaku-report"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-0 bottom-20 z-50 flex justify-center px-8"
          >
            <div className="w-full max-w-xs rounded-2xl bg-black/85 p-4 text-center text-white shadow-2xl backdrop-blur-sm">
              <p className="text-[14px] font-bold">举报这条内容？</p>
              <p className="mt-1.5 break-all text-[11px] leading-relaxed text-white/60">
                「{target.text}」将提交给审核方处理，并立即在你的设备上隐藏。
              </p>
              <div className="mt-3.5 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-white/15 py-2.5 text-[13px] font-bold"
                  onClick={() => setTarget(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-[13px] font-bold"
                  onClick={confirmReport}
                >
                  举报并隐藏
                </button>
              </div>
            </div>
          </motion.div>
        )}
        {toast && (
          <motion.div
            key="danmaku-toast"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-0 bottom-20 z-50 flex justify-center"
          >
            <span className="rounded-full bg-black/80 px-4 py-2 text-[12px] font-bold text-white">
              已举报并隐藏，感谢反馈
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
