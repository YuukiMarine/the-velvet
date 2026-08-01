/**
 * FateDrawSheet — 抽签仪式（TASKS_MERGE_PRD §4.2，决策短路的转世）。
 *
 * 纯单抽（D1）：闸门（三源开关+池数）→ 洗牌（卡背抖动 + 弹幕环境层）→ 翻面揭示
 * → 接住 / 先不了（零惩罚，但该条目当日沉底）。bold 降级直出揭示相。
 * 暗色舞台 = 全站仪式层通用语言（月匣/战利品同族）；createPortal(body) 越过页面层叠。
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { triggerSuccessFeedback, triggerLevelFeedback } from '@/utils/feedback';
import { TERMINAL_DANMAKU_SEEDS } from '@/constants/terminalDanmaku';
import { zClass } from '@/utils/zIndex';
import type { FateCandidate } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Phase = 'gate' | 'spin' | 'reveal';

const KIND_META: Record<FateCandidate['kind'], { tag: string; hint: string }> = {
  todo: { tag: '今日待办', hint: '命运替你把入口选好了——别的先不管' },
  wish: { tag: '愿望纸片', hint: '接住就转正成今天的任务，纸片功成身退' },
  history: { tag: '旧日回响', hint: '你做过的事，再做一次不需要勇气' },
};

const SOURCE_LABEL: Record<FateCandidate['kind'], string> = { todo: '今日待办', wish: '愿望', history: '旧事' };

export const FateDrawSheet = ({ open, onClose }: Props) => {
  const { getFateDrawPool, drawFate, acceptFateDraw } = useAppStore();
  const bold = useBoldness();
  const [phase, setPhase] = useState<Phase>('gate');
  const [sources, setSources] = useState<Record<FateCandidate['kind'], boolean>>({ todo: true, wish: true, history: true });
  const [picked, setPicked] = useState<FateCandidate | null>(null);
  const [busy, setBusy] = useState(false);

  // 池子随开关实时过滤；展示与抽取共用同一采样（≤12，诚实原则）
  const pool = useMemo(() => {
    if (!open) return [];
    const full = getFateDrawPool().filter(c => sources[c.kind]);
    if (full.length <= 12) return full;
    const shuffled = [...full];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sources, phase === 'gate']);

  const danmaku = useMemo(
    () => [...TERMINAL_DANMAKU_SEEDS].sort(() => Math.random() - 0.5).slice(0, 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const reset = () => {
    setPhase('gate');
    setPicked(null);
    setBusy(false);
  };
  const close = () => {
    if (phase === 'spin') return; // 洗牌 1s 内不可打断，防状态残留
    reset();
    onClose();
  };

  const draw = async () => {
    if (busy || pool.length === 0) return;
    setBusy(true);
    try {
      const c = await drawFate(pool);
      if (!c) return;
      setPicked(c);
      if (bold) {
        setPhase('spin');
        window.setTimeout(() => {
          setPhase('reveal');
          triggerSuccessFeedback();
        }, 1150);
      } else {
        setPhase('reveal');
      }
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      await acceptFateDraw(picked);
      triggerLevelFeedback();
      reset();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.modal} flex items-center justify-center px-5`}
          style={{ background: 'radial-gradient(circle at 50% 18%, rgba(36,28,80,0.97) 0%, rgba(14,10,34,0.98) 55%, rgba(4,3,12,0.99) 100%)' }}
          onMouseDown={close}
        >
          {/* 弹幕环境层（D7）：同样不知道从哪开始的人说…… */}
          {bold && phase !== 'reveal' && danmaku.map((line, i) => (
            <motion.span
              key={i}
              aria-hidden
              className="pointer-events-none absolute whitespace-nowrap text-xs font-medium text-white/25"
              style={{ top: `${18 + i * 62}%` }}
              initial={{ x: '60vw' }}
              animate={{ x: '-110vw' }}
              transition={{ duration: 14 + i * 5, ease: 'linear', repeat: Infinity }}
            >
              {line}
            </motion.span>
          ))}

          <div className="w-full max-w-sm" onMouseDown={(e) => e.stopPropagation()}>
            <AnimatePresence mode="wait">
              {/* ── 闸门：三源开关 + 池数 + 抽 ── */}
              {phase === 'gate' && (
                <motion.div key="gate" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">FATE DRAW</div>
                  <h2 className="mt-1 text-2xl font-black text-white">不知道从哪开始？</h2>
                  <p className="mt-1.5 text-sm text-white/55">把选择权交出来。抽一张，只做这一件。</p>

                  <div className="mt-5 flex justify-center gap-2">
                    {(Object.keys(SOURCE_LABEL) as Array<FateCandidate['kind']>).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSources(prev => ({ ...prev, [k]: !prev[k] }))}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                          sources[k] ? 'bg-white/90 text-gray-900' : 'border border-white/25 text-white/45'
                        }`}
                      >
                        {SOURCE_LABEL[k]}
                      </button>
                    ))}
                  </div>

                  {/* 卡背扇（静态预览；数量即池数，≤12） */}
                  <div className="relative mx-auto mt-7 h-36 w-full">
                    {pool.slice(0, 7).map((c, i, arr) => {
                      const mid = (arr.length - 1) / 2;
                      const off = i - mid;
                      return (
                        <div
                          key={c.key}
                          aria-hidden
                          className="absolute left-1/2 top-2 h-28 w-20 rounded-xl border border-white/20"
                          style={{
                            background: 'linear-gradient(160deg, rgba(120,110,255,0.35), rgba(40,32,110,0.7))',
                            transform: `translateX(calc(-50% + ${off * 34}px)) rotate(${off * 7}deg)`,
                            transformOrigin: '50% 130%',
                            boxShadow: '0 10px 24px rgba(0,0,0,0.4)',
                          }}
                        >
                          <span className="flex h-full items-center justify-center text-xl text-white/35">✦</span>
                        </div>
                      );
                    })}
                    {pool.length === 0 && (
                      <p className="pt-10 text-sm text-white/45">池子空了——去许个愿，或先把今天过完</p>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-white/35">{pool.length > 0 ? `${pool.length} 张候选在池中` : ''}</div>

                  <button
                    type="button"
                    onClick={() => void draw()}
                    disabled={pool.length === 0 || busy}
                    className="mt-5 w-full rounded-2xl bg-white py-3.5 text-base font-black text-gray-900 disabled:opacity-40"
                  >
                    抽一张
                  </button>
                  <button type="button" onClick={close} className="mt-3 text-sm font-medium text-white/45">
                    今天先不抽
                  </button>
                </motion.div>
              )}

              {/* ── 洗牌：卡背抖动（bold 门控才会进入此相） ── */}
              {phase === 'spin' && (
                <motion.div key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-64 items-center justify-center">
                  <div className="relative h-40 w-28">
                    {[0, 1, 2, 3, 4].map(i => (
                      <motion.div
                        key={i}
                        aria-hidden
                        className="absolute inset-0 rounded-2xl border border-white/25"
                        style={{ background: 'linear-gradient(160deg, rgba(130,120,255,0.4), rgba(40,32,110,0.85))', boxShadow: '0 12px 30px rgba(0,0,0,0.45)' }}
                        animate={{
                          rotate: [i * 4 - 8, -(i * 3) + 6, i * 5 - 10, 0],
                          x: [0, (i % 2 ? 14 : -14), (i % 2 ? -10 : 10), 0],
                          y: [0, -6, 4, 0],
                        }}
                        transition={{ duration: 1.05, ease: 'easeInOut' }}
                      >
                        <span className="flex h-full items-center justify-center text-3xl text-white/30">✦</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── 揭示：翻面 + 接住/先不了 ── */}
              {phase === 'reveal' && picked && (
                <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                  <motion.div
                    initial={bold ? { rotateY: 90, scale: 0.9 } : false}
                    animate={{ rotateY: 0, scale: 1 }}
                    transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                    className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-2xl bg-white px-5 pb-6 pt-5 text-left shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
                    style={{ transformPerspective: 700 }}
                  >
                    <span aria-hidden className="pointer-events-none absolute -right-4 -top-6 select-none text-[90px] font-black italic leading-none text-black/5">✦</span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary">
                      {KIND_META[picked.kind].tag}
                    </span>
                    <h3 className="mt-3 break-words text-xl font-black leading-snug text-gray-900">{picked.title}</h3>
                    <p className="mt-2.5 text-xs leading-relaxed text-gray-400">{KIND_META[picked.kind].hint}</p>
                    <p className="mt-1 text-[11px] text-gray-300">今天完成有命运加成 +1</p>
                  </motion.div>

                  <div className="mx-auto mt-5 flex max-w-[300px] gap-2.5">
                    <button
                      type="button"
                      onClick={() => void accept()}
                      disabled={busy}
                      className="flex-1 rounded-2xl bg-white py-3 text-base font-black text-gray-900 disabled:opacity-50"
                    >
                      接住它
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-2xl border border-white/25 px-5 py-3 text-sm font-bold text-white/60"
                    >
                      先不了
                    </button>
                  </div>
                  <p className="mt-3 text-[11px] text-white/30">先不了也没关系——这张今天不会再出现</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
