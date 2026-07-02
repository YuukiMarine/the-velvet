/**
 * ClearContentBoard — 终端完成结算屏的讨论板内容层：BBS「小步记录」。
 * 老式窗口 + 打字机式标题 + 楼层回帖 + [已结帖] 戳。外层冲击/粒子/portal 在 TerminalClearCutIn。
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MusicalNotes } from '@/components/MusicalNotes';
import { BevelWindow, BevelButton, FloorPost, INK, INK_DIM } from './boardKit';
import type { ClearVM } from './ClearContentDefault';

export const ClearContentBoard = ({ vm }: { vm: ClearVM }) => {
  const { skin, stepTitle, rewardPoints, attrName, danmakuGranted, comboCount, comboAvailable, encourage, bold, onClose, onCombo } = vm;

  // 打字机揭幕标题（D0 直出）
  const heading = skin.clearHeading;
  const [typed, setTyped] = useState(() => (bold ? 0 : heading.length));
  useEffect(() => {
    if (!bold) { setTyped(heading.length); return; }
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setTyped(n);
      if (n >= heading.length) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, [bold, heading]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay: 0.1, type: 'spring', damping: 18 }}
      onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-md"
    >
      <BevelWindow title="step_done.bbs · 记录" onClose={onClose}>
        <div className="text-center text-[13px] leading-relaxed">
          <div className="text-[10px] font-bold tracking-[4px] bk-fg">{skin.label.toUpperCase()}</div>

          <div className="relative my-2 inline-block">
            <h1 className="text-2xl font-bold text-white">
              {heading.slice(0, typed)}
              {bold && typed < heading.length && <span className="bk-fg">▋</span>}
            </h1>
            <span aria-hidden className="absolute -right-10 -top-2 rotate-[-8deg] border-2 bk-bd px-1.5 py-0.5 text-[10px] font-black tracking-[2px] bk-fg">{skin.clearStamp}</span>
          </div>

          <div aria-hidden className="my-1.5 bk-fg opacity-40">────────────────────────</div>

          <p style={{ color: INK }}>
            你让停滞的时间再度流动了起来。
          </p>
          <p className="mt-1 text-xs italic" style={{ color: INK_DIM }}>「{stepTitle}」</p>

          {/* 楼层回帖 */}
          <div className="my-2.5 space-y-0.5 text-left">
            <FloorPost index={1}>{encourage}</FloorPost>
            {danmakuGranted && <FloorPost index={2} author="系统">你可以写一句话，送给同样卡住的人。</FloorPost>}
          </div>

          {/* 奖励 */}
          <div className="mb-3 flex flex-col items-center gap-1">
            {rewardPoints > 0 ? (
              <span className="relative border-2 bk-bd bg-primary/15 px-3 py-1 text-sm font-bold text-white">
                +{rewardPoints} {attrName}
                {bold && <MusicalNotes count={rewardPoints} />}
              </span>
            ) : (
              <span className="text-xs" style={{ color: INK_DIM }}>今天的加成已经领过了，但这一小步照样算数。</span>
            )}
            {comboCount && comboCount > 1 && <span className="text-xs font-bold bk-fg">combo x{comboCount}</span>}
          </div>

          <div className="grid gap-2">
            {comboAvailable && onCombo && (
              <BevelButton primary onClick={onCombo} className="w-full" ariaLabel="继续连击">继续连击</BevelButton>
            )}
            <BevelButton primary={!comboAvailable} onClick={onClose} className="w-full" ariaLabel="记录这一刻">记录这一刻</BevelButton>
          </div>

          <div className="mt-3 text-xs italic" style={{ color: INK_DIM }}>─ Velvet</div>
        </div>
      </BevelWindow>
    </motion.div>
  );
};
