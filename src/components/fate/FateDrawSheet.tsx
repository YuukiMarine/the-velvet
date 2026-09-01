/**
 * FateDrawSheet — 抽签仪式（TASKS_MERGE_PRD §4.2，决策短路的转世）。
 *
 * 纯单抽（D1）：闸门（三源开关+池数）→ 洗牌（卡背抖动 + 弹幕环境层）→ 翻面揭示
 * → 去完成 / 再想想（零惩罚，但该条目当日沉底）。bold 降级直出揭示相。
 * 四频道舞台：p5=剪报占卜台（黑红+纸牌硬影）/ p4=深夜演播厅（紫黑+黄管）/
 * p3=深海水面（藏青+青斜）/ neutral=靛蓝虚空。舞台自带暗色，明暗模式免疫。
 * 弹幕环境层 = 官方种子池 + 云端已过审（listApprovedDanmaku，离线静默回退）。
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { useBoldness } from '@/utils/boldness';
import { useUiChannel } from '@/ui/useUiChannel';
import { triggerSuccessFeedback, triggerLevelFeedback } from '@/utils/feedback';
import { TERMINAL_DANMAKU_SEEDS } from '@/constants/terminalDanmaku';
import { listApprovedDanmaku, type DanmakuItem } from '@/services/danmaku';
import { DanmakuLayer } from '@/components/danmaku/DanmakuLayer';
import { cloudEnabled } from '@/services/pocketbase';
import { zClass } from '@/utils/zIndex';
import type { FateCandidate } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Phase = 'gate' | 'spin' | 'reveal';

const KIND_META: Record<FateCandidate['kind'], { tag: string; hint: string }> = {
  todo: { tag: '今日待办', hint: '可能性的辉光折射出了新的方向' },
  wish: { tag: '愿望纸片', hint: '接住就转正成今天的任务，纸片功成身退' },
  history: { tag: '旧日回响', hint: '你做过的事，再做一次不需要勇气' },
};

const SOURCE_LABEL: Record<FateCandidate['kind'], string> = { todo: '今日待办', wish: '愿望', history: '旧事' };

/** 频道舞台皮：舞台恒暗（仪式层通用语言），差分在纸/管/水的材质上 */
interface StageSkin {
  stage: string;
  /** 舞台纹理层（半调/扫描线/水点），可空 */
  texture?: { backgroundImage: string; backgroundSize?: string; opacity: number };
  eyebrow: string;
  title: string;
  lead: string;
  titleFont?: string;
  chipOn: string;
  chipOff: string;
  chipClip?: string;
  cardBack: { className: string; style: React.CSSProperties; glyph: string };
  reveal: { panel: string; panelStyle?: React.CSSProperties; tag: string; tagStyle?: React.CSSProperties; title: string; titleFont?: string; hint: string; sub: string };
  accept: string;
  acceptStyle?: React.CSSProperties;
  decline: string;
  declineStyle?: React.CSSProperties;
  note: string;
  danmaku: string;
}

const SKINS: Record<'p5' | 'p4' | 'p3' | 'neutral', StageSkin> = {
  // 红 · 剪报占卜台：黑红舞台 + 纸牌黑描边硬影 + 红章
  p5: {
    stage: 'radial-gradient(circle at 50% 16%, #2b070b 0%, #17040a 52%, #060203 100%)',
    texture: { backgroundImage: 'radial-gradient(circle, rgba(230,0,18,0.18) 1.2px, transparent 1.7px)', backgroundSize: '9px 9px', opacity: 0.5 },
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-[#ff2233]',
    title: 'mt-1 text-[26px] font-black italic text-[#f0e9df]',
    titleFont: '"Noto Sans SC Black", "Velvet Sans SC", sans-serif',
    lead: 'mt-1.5 text-sm font-bold text-[#f0e9df]/60',
    chipOn: 'border-2 border-[#050505] bg-[#f0e9df] px-3.5 py-1.5 text-xs font-black text-[#131313] shadow-[2px_2px_0_rgba(0,0,0,0.6)]',
    chipOff: 'border-2 border-[#f0e9df]/30 px-3.5 py-1.5 text-xs font-black text-[#f0e9df]/40',
    cardBack: {
      className: 'border-[3px] border-[#050505]',
      style: { background: '#f0e9df', boxShadow: '5px 6px 0 rgba(0,0,0,0.55)' },
      glyph: 'text-[#c00008]/70',
    },
    reveal: {
      panel: 'border-[3px] border-[#050505] bg-[#f0e9df] px-5 pb-6 pt-5',
      panelStyle: { boxShadow: '9px 10px 0 rgba(0,0,0,0.55)', clipPath: 'polygon(0 1.5%, 100% 0, 99% 100%, 1% 98.5%)' },
      tag: 'inline-block border-2 border-[#050505] bg-[#c00008] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white',
      tagStyle: { transform: 'rotate(-2.5deg)' },
      title: 'mt-3 break-words text-xl font-black italic leading-snug text-[#131313]',
      titleFont: '"Noto Sans SC Black", "Velvet Sans SC", sans-serif',
      hint: 'mt-2.5 text-xs font-bold leading-relaxed text-[#131313]/60',
      sub: 'mt-1 text-[11px] font-bold text-[#c00008]',
    },
    accept: 'flex-1 border-[3px] border-[#050505] bg-[#c00008] py-3 text-base font-black text-white shadow-[4px_4px_0_rgba(0,0,0,0.6)] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_rgba(0,0,0,0.6)] disabled:opacity-50',
    decline: 'border-[3px] border-[#050505] bg-[#f0e9df] px-5 py-3 text-sm font-black text-[#131313] shadow-[4px_4px_0_rgba(0,0,0,0.6)] transition active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_rgba(0,0,0,0.6)]',
    note: 'mt-3 text-[11px] font-bold text-[#f0e9df]/35',
    danmaku: 'text-xs font-bold text-[#f0e9df]/25',
  },
  // 黄 · 深夜演播厅：紫黑舞台 + 黑管黄边卡背 + 黄纸揭示
  p4: {
    stage: 'radial-gradient(circle at 50% 14%, #241542 0%, #150b2c 55%, #08040f 100%)',
    texture: { backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 4px)', opacity: 0.8 },
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-[#ffe100]',
    title: 'mt-1 text-[26px] font-black text-white',
    titleFont: 'var(--p4-display-font, Georgia, serif)',
    lead: 'mt-1.5 text-sm font-bold text-white/55',
    chipOn: 'rounded-full border-2 border-[#131313] bg-[#ffe100] px-3.5 py-1.5 text-xs font-black text-[#131313]',
    chipOff: 'rounded-full border-2 border-white/30 px-3.5 py-1.5 text-xs font-black text-white/45',
    cardBack: {
      className: 'rounded-[14px] border-[3px] border-[#ffe100]',
      style: { background: '#131313', boxShadow: '0 8px 0 rgba(0,0,0,0.5)' },
      glyph: 'text-[#ffe100]/60',
    },
    reveal: {
      panel: 'rounded-[20px] border-[3px] border-[#131313] bg-[#fff7b0] px-5 pb-6 pt-5',
      panelStyle: { boxShadow: '0 7px 0 #ff9a00' },
      tag: 'inline-block rounded-full border-2 border-[#131313] bg-[#131313] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#ffe100]',
      title: 'mt-3 break-words text-xl font-black leading-snug text-[#131313]',
      titleFont: 'var(--p4-display-font, Georgia, serif)',
      hint: 'mt-2.5 text-xs font-bold leading-relaxed text-[#131313]/60',
      sub: 'mt-1 text-[11px] font-bold text-[#131313]/45',
    },
    accept: 'flex-1 rounded-full border-[3px] border-[#131313] bg-[#131313] py-3 text-base font-black tracking-[0.08em] text-[#ffe100] shadow-[0_5px_0_#ff6a00] transition active:translate-y-0.5 active:shadow-[0_1px_0_#ff6a00] disabled:opacity-50',
    decline: 'rounded-full border-[3px] border-[#131313] bg-white px-5 py-3 text-sm font-black text-[#131313]',
    note: 'mt-3 text-[11px] font-bold text-white/30',
    danmaku: 'text-xs font-medium text-white/25',
  },
  // 蓝 · 深海水面：藏青舞台 + 青斜卡背 + 白斜揭示板
  p3: {
    stage: 'radial-gradient(circle at 50% 16%, #16294a 0%, #0d1b36 55%, #060d1d 100%)',
    texture: { backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.22) 1px, transparent 1.5px)', backgroundSize: '14px 14px', opacity: 0.25 },
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-[#35d1e8]',
    title: 'mt-1 text-[26px] font-black italic text-white',
    titleFont: '"Noto Sans SC Black", "Velvet Sans SC", sans-serif',
    lead: 'mt-1.5 text-sm font-bold text-white/55',
    chipOn: 'bg-[#1b57ff] px-3.5 py-1.5 text-xs font-black text-white shadow-[0_6px_16px_rgba(27,87,255,.35)]',
    chipOff: 'border border-white/25 px-3.5 py-1.5 text-xs font-black text-white/45',
    chipClip: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
    cardBack: {
      className: 'border border-[#35d1e8]/50',
      style: { background: 'linear-gradient(165deg, rgba(27,87,255,0.4), rgba(13,29,60,0.9))', boxShadow: '0 10px 24px rgba(0,0,0,0.45)', clipPath: 'polygon(6% 0, 100% 2%, 94% 100%, 0 98%)' },
      glyph: 'text-[#35d1e8]/60',
    },
    reveal: {
      panel: 'bg-white px-5 pb-6 pt-5',
      panelStyle: { clipPath: 'polygon(0 3.5%, 100% 0, 98.5% 100%, 1% 100%)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
      tag: 'inline-block bg-[#1b57ff] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white [clip-path:polygon(6px_0,100%_0,calc(100%_-_6px)_100%,0_100%)]',
      title: 'mt-3 break-words text-xl font-black leading-snug text-[#0a1230]',
      hint: 'mt-2.5 text-xs font-bold leading-relaxed text-[#3d4a66]/75',
      sub: 'mt-1 text-[11px] font-bold text-[#1b57ff]',
    },
    accept: 'relative flex-1 bg-[#1b57ff] py-3 text-base font-black text-white shadow-[0_10px_24px_rgba(27,87,255,.4)] transition active:translate-y-0.5 disabled:opacity-50 [clip-path:polygon(10px_0,100%_0,calc(100%_-_10px)_100%,0_100%)]',
    decline: 'bg-white px-5 py-3 text-sm font-black text-[#0a1230] [clip-path:polygon(10px_0,100%_0,calc(100%_-_10px)_100%,0_100%)]',
    note: 'mt-3 text-[11px] font-bold text-white/30',
    danmaku: 'text-xs font-medium text-white/25',
  },
  // 中性 / 自定义：靛蓝虚空（自暗，明暗模式免疫）
  neutral: {
    stage: 'radial-gradient(circle at 50% 18%, rgba(36,28,80,0.97) 0%, rgba(14,10,34,0.98) 55%, rgba(4,3,12,0.99) 100%)',
    eyebrow: 'text-[10px] font-black uppercase tracking-[0.4em] text-white/40',
    title: 'mt-1 text-2xl font-black text-white',
    lead: 'mt-1.5 text-sm text-white/55',
    chipOn: 'rounded-full bg-white/90 px-3.5 py-1.5 text-xs font-bold text-gray-900',
    chipOff: 'rounded-full border border-white/25 px-3.5 py-1.5 text-xs font-bold text-white/45',
    cardBack: {
      className: 'rounded-xl border border-white/20',
      style: { background: 'linear-gradient(160deg, rgba(120,110,255,0.35), rgba(40,32,110,0.7))', boxShadow: '0 10px 24px rgba(0,0,0,0.4)' },
      glyph: 'text-white/35',
    },
    reveal: {
      panel: 'rounded-2xl bg-white px-5 pb-6 pt-5',
      panelStyle: { boxShadow: '0 24px 60px rgba(0,0,0,0.5)' },
      tag: 'inline-block rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary',
      title: 'mt-3 break-words text-xl font-black leading-snug text-gray-900',
      hint: 'mt-2.5 text-xs leading-relaxed text-gray-400',
      sub: 'mt-1 text-[11px] text-gray-300',
    },
    accept: 'flex-1 rounded-2xl bg-white py-3 text-base font-black text-gray-900 disabled:opacity-50',
    decline: 'rounded-2xl border border-white/25 px-5 py-3 text-sm font-bold text-white/60',
    note: 'mt-3 text-[11px] text-white/30',
    danmaku: 'text-xs font-medium text-white/25',
  },
};

export const FateDrawSheet = ({ open, onClose }: Props) => {
  const { getFateDrawPool, drawFate, acceptFateDraw } = useAppStore();
  const bold = useBoldness();
  const channel = useUiChannel();
  const sk = SKINS[channel === 'p5' || channel === 'p4' || channel === 'p3' ? channel : 'neutral'];
  const [phase, setPhase] = useState<Phase>('gate');
  const [sources, setSources] = useState<Record<FateCandidate['kind'], boolean>>({ todo: true, wish: true, history: true });
  const [picked, setPicked] = useState<FateCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<DanmakuItem[]>([]);

  // 环境弹幕 = 官方种子 + 云端已过审（打开时拉一次；离线/未建集合静默回退种子池）
  useEffect(() => {
    if (open && cloudEnabled) listApprovedDanmaku().then(setApproved).catch(() => {});
  }, [open]);

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

  const danmaku = useMemo<DanmakuItem[]>(
    () => [...TERMINAL_DANMAKU_SEEDS.map(text => ({ id: '', text })), ...approved].sort(() => Math.random() - 0.5).slice(0, 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, approved],
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
          style={{ background: sk.stage }}
          onMouseDown={close}
        >
          {/* 舞台材质层（半调 / 扫描线 / 水点） */}
          {sk.texture && (
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: sk.texture.backgroundImage, backgroundSize: sk.texture.backgroundSize, opacity: sk.texture.opacity }} />
          )}
          {/* 弹幕环境层（官方种子 + 云端已过审；云端条目可点击举报并隐藏） */}
          <DanmakuLayer items={danmaku} lineClassName={sk.danmaku} bold={bold && phase !== 'reveal'} topBase={18} topStep={62} durBase={14} durStep={5} />

          <div className="w-full max-w-sm" onMouseDown={(e) => e.stopPropagation()}>
            <AnimatePresence mode="wait">
              {/* ── 闸门：三源开关 + 池数 + 抽 ── */}
              {phase === 'gate' && (
                <motion.div key="gate" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-center">
                  <div className={sk.eyebrow}>FATE DRAW</div>
                  <h2 className={sk.title} style={sk.titleFont ? { fontFamily: sk.titleFont } : undefined}>不知道做什么好？</h2>
                  <p className={sk.lead}>命运会替你选择</p>

                  <div className="mt-5 flex justify-center gap-2">
                    {(Object.keys(SOURCE_LABEL) as Array<FateCandidate['kind']>).map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSources(prev => ({ ...prev, [k]: !prev[k] }))}
                        className={sources[k] ? sk.chipOn : sk.chipOff}
                        style={sk.chipClip ? { clipPath: sk.chipClip } : undefined}
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
                          className={`absolute left-1/2 top-2 h-28 w-20 ${sk.cardBack.className}`}
                          style={{
                            ...sk.cardBack.style,
                            transform: `translateX(calc(-50% + ${off * 34}px)) rotate(${off * 7}deg)`,
                            transformOrigin: '50% 130%',
                          }}
                        >
                          <span className={`flex h-full items-center justify-center text-xl ${sk.cardBack.glyph}`}>✦</span>
                        </div>
                      );
                    })}
                    {pool.length === 0 && (
                      <p className="pt-10 text-sm text-white/45">命运的力量正在苏醒…请多记录几条再来</p>
                    )}
                  </div>
                  <div className={`mt-1 text-[11px] ${channel === 'p5' ? 'text-[#f0e9df]/35' : 'text-white/35'}`}>{pool.length > 0 ? `${pool.length} 张候选在池中` : ''}</div>

                  <button
                    type="button"
                    onClick={() => void draw()}
                    disabled={pool.length === 0 || busy}
                    className={`mt-5 w-full ${sk.accept}`}
                  >
                    抽一张
                  </button>
                  <button type="button" onClick={close} className={`mt-3 text-sm font-medium ${channel === 'p5' ? 'text-[#f0e9df]/45' : 'text-white/45'}`}>
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
                        className={`absolute inset-0 ${sk.cardBack.className}`}
                        style={sk.cardBack.style}
                        animate={{
                          rotate: [i * 4 - 8, -(i * 3) + 6, i * 5 - 10, 0],
                          x: [0, (i % 2 ? 14 : -14), (i % 2 ? -10 : 10), 0],
                          y: [0, -6, 4, 0],
                        }}
                        transition={{ duration: 1.05, ease: 'easeInOut' }}
                      >
                        <span className={`flex h-full items-center justify-center text-3xl ${sk.cardBack.glyph}`}>✦</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── 揭示：翻面 + 去完成/再想想 ── */}
              {phase === 'reveal' && picked && (
                <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                  <motion.div
                    initial={bold ? { rotateY: 90, scale: 0.9 } : false}
                    animate={{ rotateY: 0, scale: 1 }}
                    transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                    className={`relative mx-auto w-full max-w-[300px] overflow-hidden text-left ${sk.reveal.panel}`}
                    style={{ transformPerspective: 700, ...sk.reveal.panelStyle }}
                  >
                    <span aria-hidden className="pointer-events-none absolute -right-4 -top-6 select-none text-[90px] font-black italic leading-none text-black/5">✦</span>
                    <span className={sk.reveal.tag} style={sk.reveal.tagStyle}>{KIND_META[picked.kind].tag}</span>
                    <h3 className={sk.reveal.title} style={sk.reveal.titleFont ? { fontFamily: sk.reveal.titleFont } : undefined}>{picked.title}</h3>
                    <p className={sk.reveal.hint}>{KIND_META[picked.kind].hint}</p>
                    <p className={sk.reveal.sub}>完成它会有额外奖励</p>
                  </motion.div>

                  <div className="mx-auto mt-5 flex max-w-[300px] gap-2.5">
                    <button
                      type="button"
                      onClick={() => void accept()}
                      disabled={busy}
                      className={sk.accept}
                    >
                      去完成
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className={sk.decline}
                      style={sk.declineStyle}
                    >
                      再想想
                    </button>
                  </div>
                  <p className={sk.note}>关闭会重新抽取其他的可能性</p>
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
