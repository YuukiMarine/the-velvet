/**
 * AntechamberBoard — F3 玄关「匿名讨论板」皮肤（蓝/粉主题，千禧年 BBS / 论坛风）。
 *
 * 手搓 Y2K 论坛质感（不复用通用件）：等宽字、老式窗口边框(斜角凸边 + 标题栏 + 假窗钮)、
 * CRT 扫描线、打字机逐字揭幕觉醒语 + 闪烁光标、把鼓励弹幕渲染成「楼层帖」、米色斜角「登入」按钮。
 * D0/reduced-motion 直接出全文、不打字、不闪。
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { triggerLightHaptic, triggerThemeSwitchFeedback } from '@/utils/feedback';
import type { TerminalSkin } from '@/utils/terminalSkin';

interface Props {
  skin: TerminalSkin;
  onEnter: () => void;
  onBack: () => void;
  danmakuPool: string[];
}

let _boardIntroSeen = false;

const mono = "'JetBrains Mono','Cascadia Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export const AntechamberBoard = ({ skin, onEnter, onBack, danmakuPool }: Props) => {
  const user = useAppStore((s) => s.user);
  const bold = useBoldness();

  const lines = skin.awaken;
  const fullLen = lines.reduce((s, l) => s + l.length, 0);
  const [typed, setTyped] = useState(() => (bold && !_boardIntroSeen ? 0 : fullLen));

  useEffect(() => {
    if (!bold || _boardIntroSeen) { setTyped(fullLen); _boardIntroSeen = true; return; }
    const id = setInterval(() => {
      setTyped((t) => {
        const n = t + 1;
        if (n >= fullLen) { clearInterval(id); _boardIntroSeen = true; return fullLen; }
        return n;
      });
    }, 55);
    return () => clearInterval(id);
  }, [bold, fullLen]);

  const done = typed >= fullLen;
  const skip = () => { if (!done) setTyped(fullLen); };

  const enter = () => {
    triggerLightHaptic();
    if (user?.theme) triggerThemeSwitchFeedback(user.theme);
    onEnter();
  };

  const posts = (danmakuPool.length ? danmakuPool : ['有人也这样熬过来。']).slice(0, 4);

  const Cursor = () => (
    <motion.span
      aria-hidden
      className="inline-block w-[0.55em] bg-primary align-baseline"
      style={{ height: '1em' }}
      animate={bold ? { opacity: [1, 1, 0, 0] } : { opacity: 1 }}
      transition={bold ? { duration: 0.9, repeat: Infinity, ease: 'linear', times: [0, 0.5, 0.5, 1] } : undefined}
    >
      &nbsp;
    </motion.span>
  );

  // 逐行算可见字数
  let consumed = 0;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-[#070b11] px-5"
      style={{ fontFamily: mono }}
      onClick={skip}
    >
      {/* CRT 扫描线 + 暗角 */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 3px)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 55%, rgba(0,0,0,0.6) 100%)' }} />

      {/* 返回 */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onBack(); }} aria-label="返回" className="absolute left-4 top-4 z-20 text-xs text-primary/80 hover:text-primary">‹ 返回</button>

      {/* 老式窗口 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: bold ? 0.3 : 0.15 }}
        className="relative z-10 w-full max-w-sm"
        style={{ border: '2px solid', borderColor: 'color-mix(in srgb, var(--color-primary) 70%, #fff) var(--color-primary) var(--color-primary) color-mix(in srgb, var(--color-primary) 70%, #fff)', boxShadow: '0 0 0 1px #000, 6px 8px 0 rgba(0,0,0,0.5)' }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-2 py-1 text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>
          <span className="tracking-wide">▓ {skin.label}.bbs</span>
          <span className="flex gap-1 text-white/90">
            <span className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">_</span>
            <span className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">□</span>
            <span className="flex h-3.5 w-3.5 items-center justify-center border border-white/60 leading-none">✕</span>
          </span>
        </div>

        {/* 窗体 */}
        <div className="bg-[#0a1019] px-3 py-3 text-[13px] leading-relaxed text-[#bcd6f5]">
          <div className="text-primary/70">» 在线 1 人 · {user?.name || '你'}　|　{skin.tagline}</div>
          <div aria-hidden className="my-1.5 text-primary/40">────────────────────────</div>

          {/* 打字机觉醒语 */}
          {lines.map((line, i) => {
            const start = consumed;
            consumed += line.length;
            const revealed = Math.max(0, Math.min(line.length, typed - start));
            const visible = line.slice(0, revealed);
            const isCurrent = typed > start && typed < consumed;
            const isLast = i === lines.length - 1;
            if (revealed <= 0 && !isCurrent) return <div key={i} className="min-h-[1.4em]">&nbsp;</div>;
            return (
              <div key={i} className="min-h-[1.4em] text-white">
                <span className="text-primary">&gt; </span>{visible}
                {(isCurrent || (done && isLast)) && <Cursor />}
              </div>
            );
          })}

          {/* 楼层帖（鼓励弹幕） */}
          <div aria-hidden className="my-2 text-primary/40">──── 最近回帖 ────</div>
          {posts.map((p, i) => (
            <div key={i} className="truncate text-[12px] text-[#8fb3dd]">
              <span className="text-primary/70">#{String(i + 1).padStart(2, '0')}</span> 匿名 » {p}
            </div>
          ))}

          <div aria-hidden className="my-2 text-primary/40">────────────────────────</div>
          <div className="text-[#bcd6f5]">[公告] {skin.heroSub}</div>

          {/* 登入按钮 */}
          <div className="mt-3 flex justify-center">
            <motion.button
              type="button"
              onClick={(e) => { e.stopPropagation(); enter(); }}
              aria-label={skin.enterLabel}
              whileTap={{ scale: 0.96 }}
              className="px-6 py-1.5 text-sm font-bold tracking-widest text-[#0a1019]"
              style={{ background: 'color-mix(in srgb, var(--color-primary) 30%, #e8eef7)', border: '2px solid', borderColor: '#fff var(--color-primary) var(--color-primary) #fff', boxShadow: '2px 2px 0 #000' }}
            >
              [ {skin.enterLabel} ]
            </motion.button>
          </div>
        </div>
      </motion.div>

      <div className="absolute bottom-6 left-0 right-0 text-center text-[11px] tracking-widest text-primary/40">
        {done ? '点 [登入] 进入' : '轻点跳过打字'}
      </div>
    </div>
  );
};
