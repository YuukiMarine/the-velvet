/**
 * FateGlimpse — 「窥探命运」（v2.7）：七日连星 + 总占卜仪式。
 *
 * 组成：
 *   · FateGlimpseSection —— 挂在「今日塔罗」tab 下方的七日收集区：
 *     七个日槽（已抽=迷你牌面 / 未抽=虚线空位）、进度与状态、入口按钮。
 *   · FateRitual —— 全屏仪式 overlay（portal）：
 *     七张牌上四下三入场 → 中央命运卡背 → **长按**蓄力（魔法阵生长 + 粒子上升 +
 *     四角星迸现，松手回退）→ 蓄满翻面 → 结语烫印在牌上，总结/展望/建议依次展开，
 *     并降下 3 天 buff（战场伤害 +10% / 每日首次记录 +1 点）。
 *
 * 视觉刻意独立于三频道：仪式发生在「房间之外的命运空间」——深靛蓝星空 + 鎏金，
 * 全频道一致（这里本来就是靛蓝色房间的底色）。D0（校直/低机能）下粒子与星屑静默、
 * 长按缩短，仪式仍完整可用。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore, toLocalDateKey } from '@/store';
import { TAROT_BY_ID, FORTUNE_META, inferFortune } from '@/constants/tarot';
import { DailyDivination, FateGlimpse, FateGlimpseDay } from '@/types';
import { CardBack } from './CardBack';
import { TarotCardSVG } from './TarotCardSVG';
import {
  buildFateGlimpseRequest, callFateGlimpseAI, buildOfflineFateGlimpse,
  type FateGlimpseAIResult,
} from '@/utils/fateGlimpseAI';
import { formatApiError } from '@/utils/tarotAI';
import { renderMarkdown } from '@/utils/markdown';
import { playSound, triggerLightHaptic } from '@/utils/feedback';
import { useBoldness } from '@/utils/boldness';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import { useUiChannel } from '@/ui/useUiChannel';
import { slantClip } from '@/components/p3r/kit';
import { roughQuad } from '@/components/p5r/kit';
import { zClass } from '@/utils/zIndex';

const GOLD = '#d4af37';
const GOLD_SOFT = 'rgba(212,175,55,0.55)';
const INK_STAGE = 'radial-gradient(120% 90% at 50% 30%, #1c1548 0%, #120e33 46%, #080617 100%)';
const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

type FateWindowState = Awaited<ReturnType<ReturnType<typeof useAppStore.getState>['getFateWindow']>>;

// ══════════════════════════════════════════════════════════════════
// 收集区（挂在「今日塔罗」下方；抽完今日的牌才现身）
// ══════════════════════════════════════════════════════════════════

/**
 * 收集区皮肤：跟随频道语言 + 夜间模式（配色全走 CSS 变量，夜间由
 * index.css 的 .dark[data-ui-channel=*] 覆盖自动翻转；P5 黑舞台恒定）。
 * 仪式 overlay 刻意不套频道皮——那是「房间之外的命运空间」，全频道同一副深靛蓝。
 */
interface SectionSkin {
  ink: string;
  sub: string;
  accent: string;
  accentInk: string;
  faint: string;
  shellClass: string;
  shellStyle: React.CSSProperties;
  btnStyle: React.CSSProperties;
  chipStyle: React.CSSProperties;
}

const sectionSkin = (channel: string): SectionSkin => {
  if (channel === 'p3') {
    return {
      ink: 'var(--p3r-ink, #0a1230)',
      sub: 'var(--p3r-ink-soft, #3d4a66)',
      accent: 'var(--p3r-blue, #1b57ff)',
      accentInk: '#ffffff',
      faint: 'var(--p3r-cyan-pale, #cfeaf6)',
      shellClass: 'px-4 pb-4 pt-3.5',
      shellStyle: { background: 'var(--p3r-panel, #ffffff)', clipPath: slantClip(14), boxShadow: '0 14px 30px rgba(38,96,140,0.14)' },
      btnStyle: { background: 'var(--p3r-blue, #1b57ff)', color: '#ffffff', clipPath: slantClip(10) },
      chipStyle: { background: 'var(--p3r-cyan-pale, #cfeaf6)', color: 'var(--p3r-blue-deep, #0a3bd6)', clipPath: slantClip(8) },
    };
  }
  if (channel === 'p4') {
    return {
      ink: 'var(--ui-ink, #131313)',
      sub: 'var(--ui-muted, rgba(19,19,19,0.62))',
      accent: 'var(--p4-orange, #f9a11b)',
      accentInk: '#131313',
      faint: 'rgba(19,19,19,0.10)',
      shellClass: 'rounded-[18px] px-4 pb-4 pt-3.5',
      shellStyle: { background: 'var(--ui-paper, #fff6d0)', boxShadow: '0 5px 0 rgba(19,19,19,0.15)' },
      btnStyle: { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 14 },
      chipStyle: { background: 'rgba(249,161,27,0.2)', color: 'var(--ui-ink, #131313)', borderRadius: 9999 },
    };
  }
  if (channel === 'p5') {
    return {
      ink: '#050505',
      sub: '#494540',
      accent: '#c00008',
      accentInk: '#f0e9df',
      faint: '#dcd4c4',
      shellClass: 'p5-paper px-4 pb-4 pt-3.5',
      shellStyle: { background: '#f0e9df', clipPath: roughQuad(611, 5), boxShadow: '0 0 0 2.5px #050505, 5px 6px 0 #000000' },
      btnStyle: { background: '#c00008', color: '#f0e9df', clipPath: 'polygon(8px 2px, calc(100% - 2px) 0, calc(100% - 10px) calc(100% - 2px), 0 100%)', boxShadow: '0 0 0 2px #050505' },
      chipStyle: { background: '#050505', color: '#f0e9df', clipPath: 'polygon(4px 1px, calc(100% - 1px) 3px, calc(100% - 5px) calc(100% - 1px), 0 calc(100% - 3px))' },
    };
  }
  return {
    ink: 'var(--ui-ink, #1f2937)',
    sub: 'var(--ui-muted, #6b7280)',
    accent: 'var(--color-primary, #6366f1)',
    accentInk: '#ffffff',
    faint: 'rgba(99,102,241,0.12)',
    shellClass: 'rounded-2xl border border-gray-200 dark:border-gray-700/60 px-4 pb-4 pt-3.5',
    shellStyle: { background: 'var(--ui-paper, #ffffff)' },
    btnStyle: { background: 'var(--color-primary, #6366f1)', color: '#ffffff', borderRadius: 14 },
    chipStyle: { background: 'rgba(var(--color-primary-rgb, 99 102 241) / 0.14)', color: 'var(--color-primary, #6366f1)', borderRadius: 9999 },
  };
};

export function FateGlimpseSection() {
  const fateGlimpses = useAppStore(s => s.fateGlimpses);
  const dailyDivination = useAppStore(s => s.dailyDivination);
  const getFateWindow = useAppStore(s => s.getFateWindow);
  const getActiveFateBuff = useAppStore(s => s.getActiveFateBuff);
  const channel = useUiChannel();
  const sk = sectionSkin(channel);

  const [win, setWin] = useState<FateWindowState | null>(null);
  const [ritual, setRitual] = useState<null | { mode: 'new' } | { mode: 'review'; glimpse: FateGlimpse }>(null);
  const [dayDetail, setDayDetail] = useState<DailyDivination | null>(null);

  const today = toLocalDateKey();
  const drawnToday = !!dailyDivination && dailyDivination.date === today;

  useEffect(() => {
    if (!drawnToday) return;
    let alive = true;
    void getFateWindow().then(w => { if (alive) setWin(w); });
    return () => { alive = false; };
    // 今日抽卡完成 / 新窥探保存后重查窗口
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawnToday, dailyDivination?.id, fateGlimpses.length]);

  // 抽完今日的牌，七日连星才现身（用户口径：窗口只出现在抽取卡牌之后）
  if (!drawnToday) return null;

  const buff = getActiveFateBuff();
  const buffDaysLeft = buff
    ? Math.max(1, Math.round((Date.parse(buff.buffEnd) - Date.parse(today)) / 86400_000) + 1)
    : 0;
  const drawnCount = win ? win.days.filter(d => d.drawn).length : 0;

  return (
    <div className="mt-6">
      <div className={`relative overflow-hidden ${sk.shellClass}`} style={sk.shellStyle}>
        {/* 头部 */}
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FourStar size={13} color={sk.accent} />
              <span className="text-[13px] font-black tracking-[0.2em]" style={{ color: sk.ink }}>七日连星</span>
            </div>
            <div className="mt-0.5 text-[10px] font-bold tracking-[0.14em]" style={{ color: sk.sub }}>
              GLIMPSE OF FATE · {drawnCount}/7
            </div>
          </div>
          {buff && (
            <div className="px-2.5 py-1 text-[10px] font-black" style={sk.chipStyle}>
              祝福生效中 · 余 {buffDaysLeft} 天
            </div>
          )}
        </div>

        {/* 七个日槽（点已抽的卡面 → 查看那天的解读） */}
        <div className="relative mt-3 flex items-end justify-between gap-1">
          {(win?.days ?? Array.from({ length: 7 }, () => ({ date: '', drawn: null as DailyDivination | null }))).map((d, i) => (
            <DaySlot key={i} date={d.date} drawn={d.drawn} isToday={d.date === today} sk={sk} onOpen={setDayDetail} />
          ))}
        </div>

        {/* 状态行 / 入口 */}
        <div className="relative mt-3.5">
          {buff ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-relaxed" style={{ color: sk.sub }}>
                命运的祝福生效中：战场伤害 +10%，每日首次记录 +1 点。七日计数已重新开始。
              </p>
              <button
                type="button"
                onClick={() => setRitual({ mode: 'review', glimpse: buff })}
                className="shrink-0 px-3 py-1.5 text-[11px] font-black"
                style={sk.btnStyle}
              >
                查看解读
              </button>
            </div>
          ) : win?.eligible ? (
            <motion.button
              type="button"
              onClick={() => setRitual({ mode: 'new' })}
              whileTap={{ scale: 0.97 }}
              className="relative block w-full overflow-hidden py-3 text-center text-[15px] font-black tracking-[0.3em]"
              style={sk.btnStyle}
            >
              {/* 流光扫过 */}
              <motion.span
                aria-hidden
                className="absolute inset-y-0 w-16"
                style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.45), transparent)' }}
                animate={{ left: ['-20%', '120%'] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut', repeatDelay: 1.2 }}
              />
              窥 探 命 运
            </motion.button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] leading-relaxed" style={{ color: sk.sub }}>
                连续七日抽取每日塔罗，七星连缀之时，可窥探一次命运。
              </p>
              {win?.lastGlimpse && (
                <button
                  type="button"
                  onClick={() => setRitual({ mode: 'review', glimpse: win.lastGlimpse! })}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-black"
                  style={sk.chipStyle}
                >
                  回顾上次
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {ritual && win && (
        <FateRitual
          mode={ritual.mode}
          window={win}
          glimpse={ritual.mode === 'review' ? ritual.glimpse : null}
          onClose={() => setRitual(null)}
        />
      )}
      {dayDetail && <DayDetailSheet d={dayDetail} sk={sk} onClose={() => setDayDetail(null)} />}
    </div>
  );
}

/** 单个日槽：已抽 = 迷你牌面（可点开当日解读）；未抽/未到 = 虚线空位（今日高亮） */
function DaySlot({ date, drawn, isToday, sk, onOpen }: {
  date: string; drawn: DailyDivination | null; isToday: boolean; sk: SectionSkin;
  onOpen: (d: DailyDivination) => void;
}) {
  const card = drawn ? TAROT_BY_ID[drawn.cardId] : null;
  const d = date ? new Date(`${date}T12:00:00`) : null;
  const label = d ? (isToday ? '今日' : `${d.getMonth() + 1}/${d.getDate()}`) : '·';
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      {card && drawn ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onOpen(drawn)}
          aria-label={`查看 ${label} 的塔罗解读`}
          className="cursor-pointer"
        >
          <TarotCardSVG card={card} orientation={drawn.orientation} width={36} staticCard showOrientationTag={false} />
        </motion.button>
      ) : (
        <div
          className="flex h-[58px] w-[36px] items-center justify-center rounded-[5px]"
          style={{
            border: `1.5px dashed ${isToday ? sk.accent : sk.faint}`,
            background: isToday ? sk.faint : 'transparent',
          }}
        >
          <FourStar size={9} color={isToday ? sk.accent : sk.faint} />
        </div>
      )}
      <span className="text-[9px] font-bold" style={{ color: isToday ? sk.accent : sk.sub }}>
        {label}{d && !isToday ? ` 周${WEEKDAY_CN[d.getDay()]}` : ''}
      </span>
    </div>
  );
}

/** 当日塔罗回看（点日槽卡面弹出）：牌面 + 运势 + 建议 + 当日解读全文 */
function DayDetailSheet({ d, sk, onClose }: { d: DailyDivination; sk: SectionSkin; onClose: () => void }) {
  const attributeNames = useAppStore(s => s.settings.attributeNames);
  const card = TAROT_BY_ID[d.cardId];
  useBackHandler(true, onClose);
  if (!card || typeof document === 'undefined') return null;
  const date = new Date(`${d.date}T12:00:00`);
  const fortune = d.fortune ?? inferFortune(d.cardId, d.orientation);
  const fm = FORTUNE_META[fortune];
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`fixed inset-0 ${zClass.modal} flex items-end justify-center bg-black/55 sm:items-center`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="当日塔罗回看"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className={`max-h-[82vh] w-full max-w-md overflow-y-auto overscroll-contain ${sk.shellClass} !pt-4`}
        style={{ ...sk.shellStyle, clipPath: undefined }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.18em]" style={{ color: sk.sub }}>
              {date.getMonth() + 1}/{date.getDate()} · 周{WEEKDAY_CN[date.getDay()]}
            </div>
            <div className="mt-0.5 text-[17px] font-black" style={{ color: sk.ink }}>
              {card.name}{d.orientation === 'reversed' ? ' · 逆位' : ' · 正位'}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="px-2 py-1 text-base font-black" style={{ color: sk.sub }}>✕</button>
        </div>

        <div className="mt-3 flex gap-4">
          <div className="shrink-0">
            <TarotCardSVG card={card} orientation={d.orientation} width={104} staticCard showOrientationTag={false} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-black" style={sk.chipStyle}>
              <span>{fm.icon}</span><span>{fm.label}</span>
            </div>
            <div className="text-[11px] font-bold" style={{ color: sk.sub }}>
              当日加成：{attributeNames[d.effect.attribute]} × {d.effect.multiplier}
            </div>
            {d.advice && (
              <p className="text-[12px] leading-relaxed" style={{ color: sk.ink }}>{d.advice}</p>
            )}
          </div>
        </div>

        {d.narration && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: sk.faint }}>
            <div className="mb-1.5 text-[10px] font-black tracking-[0.2em]" style={{ color: sk.sub }}>当日解读</div>
            <div
              className="prose-sm text-[12.5px] leading-relaxed"
              style={{ color: sk.ink }}
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(`<p class="mb-2">${renderMarkdown(d.narration)}</p>`) }}
            />
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// ══════════════════════════════════════════════════════════════════
// 仪式 overlay
// ══════════════════════════════════════════════════════════════════

const HOLD_MS = 2200;
const HOLD_MS_D0 = 600;

type RitualStage = 'gather' | 'await' | 'flipping' | 'revealed';

function FateRitual({
  mode, window: win, glimpse, onClose,
}: {
  mode: 'new' | 'review';
  window: FateWindowState;
  glimpse: FateGlimpse | null;
  onClose: () => void;
}) {
  const d0 = !useBoldness(); // bold=false 即 D0：校直/低机能/reduced-motion
  const holdMs = d0 ? HOLD_MS_D0 : HOLD_MS;
  const a11yRef = useModalA11y(true, onClose, { closeOnEscape: true, trapFocus: true });
  useBackHandler(true, onClose);

  // 七日牌组：new 用窗口，review 用存档
  const days: FateGlimpseDay[] = useMemo(() => {
    if (mode === 'review' && glimpse) return glimpse.days;
    return win.days
      .filter((d): d is { date: string; drawn: DailyDivination } => !!d.drawn)
      .map(d => ({
        date: d.date,
        cardId: d.drawn.cardId,
        orientation: d.drawn.orientation,
        fortune: d.drawn.fortune,
        attribute: d.drawn.effect.attribute,
      }));
  }, [mode, glimpse, win]);

  const [stage, setStage] = useState<RitualStage>(mode === 'review' ? 'revealed' : 'gather');
  const [progress, setProgress] = useState(0);      // 长按蓄力 0..1
  const [locked, setLocked] = useState(mode === 'review'); // 蓄满后魔法阵常亮
  const [result, setResult] = useState<FateGlimpseAIResult | null>(
    glimpse ? { verdict: glimpse.verdict, summary: glimpse.summary, outlook: glimpse.outlook, advice: glimpse.advice } : null,
  );
  const [aiStatus, setAiStatus] = useState<'pending' | 'ready' | 'error'>(glimpse ? 'ready' : 'pending');
  const [errMsg, setErrMsg] = useState('');
  const sourceRef = useRef<'ai' | 'offline'>('ai');
  const savedRef = useRef(mode === 'review');
  const abortRef = useRef<AbortController | null>(null);

  // ── 入场：gather → await ──
  useEffect(() => {
    if (stage !== 'gather') return;
    const t = setTimeout(() => setStage('await'), d0 ? 100 : 1150);
    return () => clearTimeout(t);
  }, [stage, d0]);

  // ── 占卜请求：开场即预取（长按仪式的时间刚好用来等 AI）──
  useEffect(() => {
    if (mode !== 'new') return;
    void startDivination();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDivination = async () => {
    const s = useAppStore.getState();
    setAiStatus('pending');
    setErrMsg('');
    if (!s.settings.summaryApiKey) {
      sourceRef.current = 'offline';
      setResult(buildOfflineFateGlimpse(days, s.settings.attributeNames));
      setAiStatus('ready');
      return;
    }
    try {
      const since = Date.now() - 7 * 86400_000;
      const req = buildFateGlimpseRequest({
        settings: s.settings,
        attributes: s.attributes,
        days,
        recentActivities: s.activities.filter(a => !a.category && new Date(a.date).getTime() >= since),
        wishes: s.wishes
          .filter(w => w.status === 'active' && !w.parentId)
          .map(w => ({ title: w.title, currentState: w.currentState })),
        userName: s.user?.name ?? '客人',
      });
      const ac = new AbortController();
      abortRef.current = ac;
      const r = await callFateGlimpseAI(req, ac.signal);
      sourceRef.current = 'ai';
      setResult(r);
      setAiStatus('ready');
    } catch (e) {
      if (abortRef.current?.signal.aborted) return;
      setErrMsg(formatApiError(e));
      setAiStatus('error');
    }
  };

  const useOffline = () => {
    const s = useAppStore.getState();
    sourceRef.current = 'offline';
    setResult(buildOfflineFateGlimpse(days, s.settings.attributeNames));
    setAiStatus('ready');
  };

  // ── 结果落库（翻面完成 + 结果就绪，两条件齐了就存，只存一次）──
  useEffect(() => {
    if (mode !== 'new' || savedRef.current || stage !== 'revealed' || !result) return;
    savedRef.current = true;
    const today = toLocalDateKey();
    const g: FateGlimpse = {
      id: uuidv4(),
      days,
      verdict: result.verdict,
      summary: result.summary,
      outlook: result.outlook,
      advice: result.advice,
      source: sourceRef.current,
      buffStart: today,
      buffEnd: toLocalDateKey(new Date(Date.now() + 2 * 86400_000)),
      createdAt: new Date(),
    };
    void useAppStore.getState().createFateGlimpse(g);
  }, [mode, stage, result, days]);

  // ── 长按蓄力（rAF 前进；松手回退）──
  const rafRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const stopRaf = () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); rafRef.current = null; };

  const beginHold = (e: React.PointerEvent) => {
    if (stage !== 'await') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holdingRef.current = true;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    stopRaf();
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress(p => {
        const next = Math.min(1, p + dt / holdMs);
        if (next >= 1) {
          holdingRef.current = false;
          stopRaf();
          completeHold();
          return 1;
        }
        return next;
      });
      if (holdingRef.current) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const cancelHold = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    stopRaf();
    // 松手：蓄力回退
    let last = performance.now();
    const back = (now: number) => {
      const dt = now - last;
      last = now;
      let done = false;
      setProgress(p => {
        const next = Math.max(0, p - dt / 500);
        if (next <= 0) done = true;
        return next;
      });
      if (!done) rafRef.current = requestAnimationFrame(back);
    };
    rafRef.current = requestAnimationFrame(back);
  };

  const moveHold = (e: React.PointerEvent) => {
    if (!holdingRef.current || !startPosRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (dx * dx + dy * dy > 18 * 18) cancelHold();
  };

  const completeHold = () => {
    setLocked(true);
    triggerLightHaptic();
    playSound('/tarots.mp3', 0.6);
    setStage('flipping');
  };

  useEffect(() => () => stopRaf(), []);

  // 卡片布局
  const topRow = days.slice(0, 4);
  const bottomRow = days.slice(4, 7);
  const revealed = stage === 'revealed';
  const compact = revealed; // 揭晓后牌阵收紧，给解读腾位置

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      ref={a11yRef}
      role="dialog"
      aria-modal="true"
      aria-label="窥探命运"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 ${zClass.modal} overflow-y-auto overscroll-contain`}
      style={{ background: INK_STAGE }}
    >
      <MiniStars seed={23} count={64} fixed />

      {/* 关闭 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="fixed right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full text-lg font-black"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)', color: GOLD, background: 'rgba(18,14,51,0.6)', boxShadow: `inset 0 0 0 1px ${GOLD_SOFT}` }}
      >
        ✕
      </button>

      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col items-center px-4 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 40px)' }}>
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-1 text-center"
        >
          <div className="text-[19px] font-black tracking-[0.5em]" style={{ color: '#efe6c8', textShadow: `0 0 18px ${GOLD_SOFT}` }}>
            窥探命运
          </div>
          <div className="mt-1 text-[10px] font-semibold tracking-[0.3em]" style={{ color: 'rgba(239,230,200,0.45)' }}>
            SEVEN STARS · ONE THREAD
          </div>
        </motion.div>

        {/* 引导语 */}
        <div className="mb-3 h-4 text-[11px] font-semibold" style={{ color: 'rgba(239,230,200,0.55)' }}>
          {stage === 'gather' && '七日的牌正在聚拢……'}
          {stage === 'await' && (progress > 0.04 ? '别松手——命运正在显形' : '长按中央的命运之牌')}
          {stage === 'flipping' && '……'}
          {revealed && (aiStatus === 'pending' ? '命运正在凝聚成文字……' : ' ')}
        </div>

        {/* ── 牌阵 ── */}
        <motion.div
          animate={{ scale: compact ? 0.86 : 1 }}
          transition={{ type: 'spring', damping: 22, stiffness: 180 }}
          className="relative flex flex-col items-center"
        >
          {/* 上四 */}
          <div className="flex items-center justify-center gap-2">
            {topRow.map((d, i) => (
              <SpreadCard key={d.date} day={d} index={i} charged={progress} entered={stage !== 'gather'} d0={d0} />
            ))}
          </div>

          {/* 中央：魔法阵 + 命运之牌 */}
          <div className="relative my-2 flex items-center justify-center" style={{ width: 240, height: 208 }}>
            <MagicCircle progress={mode === 'review' ? 1 : progress} locked={locked} d0={d0} />
            {!d0 && stage === 'await' && progress > 0.05 && <RisingMotes intensity={progress} />}
            {!d0 && stage === 'await' && progress > 0.3 && <StarBursts />}

            <div style={{ perspective: 1100 }} className="relative z-10">
              <motion.div
                animate={{ rotateY: stage === 'flipping' || revealed ? 180 : 0, scale: stage === 'await' && progress > 0 ? 1 + progress * 0.06 : 1 }}
                transition={{ rotateY: { duration: 0.85, ease: 'easeInOut' }, scale: { duration: 0.1 } }}
                onAnimationComplete={() => { if (stage === 'flipping') setStage('revealed'); }}
                style={{ transformStyle: 'preserve-3d', width: 126, height: 202 }}
                onPointerDown={beginHold}
                onPointerMove={moveHold}
                onPointerUp={cancelHold}
                onPointerCancel={cancelHold}
                onPointerLeave={cancelHold}
                className={stage === 'await' ? 'cursor-pointer touch-none select-none' : 'select-none'}
              >
                <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', filter: `drop-shadow(0 0 ${8 + progress * 26}px ${GOLD_SOFT})` }}>
                  <CardBack width={126} hoverable={false} />
                </div>
                <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                  <FateCardFace verdict={result?.verdict ?? null} width={126} />
                </div>
              </motion.div>
            </div>
          </div>

          {/* 下三 */}
          <div className="flex items-center justify-center gap-2">
            {bottomRow.map((d, i) => (
              <SpreadCard key={d.date} day={d} index={i + 4} charged={progress} entered={stage !== 'gather'} d0={d0} />
            ))}
          </div>
        </motion.div>

        {/* ── 解读面板 ── */}
        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 w-full space-y-3"
            >
              {aiStatus === 'pending' && (
                <PanelShell>
                  <div className="flex items-center justify-center gap-2 py-6 text-[12px]" style={{ color: 'rgba(239,230,200,0.7)' }}>
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}>
                      <FourStar size={14} color={GOLD} />
                    </motion.span>
                    七张牌的线索正在汇成一段命运……
                  </div>
                </PanelShell>
              )}

              {aiStatus === 'error' && (
                <PanelShell>
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: '#e8a0a0' }}>{errMsg}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => void startDivination()} className="flex-1 rounded-lg py-2.5 text-[12px] font-black" style={{ background: GOLD, color: '#120e33' }}>
                      重试 AI 解读
                    </button>
                    <button type="button" onClick={useOffline} className="flex-1 rounded-lg py-2.5 text-[12px] font-bold" style={{ color: GOLD, boxShadow: `inset 0 0 0 1px ${GOLD_SOFT}` }}>
                      使用离线兜底
                    </button>
                  </div>
                </PanelShell>
              )}

              {aiStatus === 'ready' && result && (
                <>
                  <ReadingBlock label="总结" en="RETROSPECT" delay={0} text={result.summary} />
                  <ReadingBlock label="展望" en="OUTLOOK" delay={0.12} text={result.outlook} />
                  <ReadingBlock label="建议" en="GUIDANCE" delay={0.24} text={result.advice} />

                  {/* buff 横幅 */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 }}
                    className="relative overflow-hidden rounded-xl px-4 py-3"
                    style={{ background: 'linear-gradient(120deg, rgba(212,175,55,0.2), rgba(212,175,55,0.08))', boxShadow: `inset 0 0 0 1px ${GOLD_SOFT}` }}
                  >
                    <div className="flex items-center gap-2">
                      <FourStar size={14} color={GOLD} />
                      <span className="text-[12px] font-black tracking-[0.14em]" style={{ color: '#efe6c8' }}>命运的祝福 · 三日</span>
                      {sourceRef.current === 'offline' && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ color: 'rgba(239,230,200,0.6)', boxShadow: 'inset 0 0 0 1px rgba(239,230,200,0.3)' }}>离线</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(239,230,200,0.85)' }}>
                      逆影战场伤害 <b style={{ color: GOLD }}>+10%</b> · 每日首次记录，最高的那项属性加点额外 <b style={{ color: GOLD }}>+1</b>
                    </p>
                  </motion.div>

                  <button type="button" onClick={onClose} className="mx-auto block rounded-full px-6 py-2 text-[12px] font-bold" style={{ color: 'rgba(239,230,200,0.65)' }}>
                    收下命运的低语
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>,
    document.body,
  );
}

// ── 牌阵单卡：依次飞入，蓄力时被中央牵引发光 ─────────────────────

function SpreadCard({ day, index, charged, entered, d0 }: {
  day: FateGlimpseDay; index: number; charged: number; entered: boolean; d0: boolean;
}) {
  const card = TAROT_BY_ID[day.cardId];
  if (!card) return null;
  const rot = [-5, -2, 2, 5, -4, 0, 4][index % 7];
  return (
    <motion.div
      initial={d0 ? false : { opacity: 0, y: index < 4 ? -60 : 60, rotate: rot * 3, scale: 0.6 }}
      animate={entered ? { opacity: 1, y: 0, rotate: rot, scale: 1 } : undefined}
      transition={{ delay: d0 ? 0 : 0.1 + index * 0.09, type: 'spring', damping: 16, stiffness: 160 }}
      style={{ filter: charged > 0 ? `drop-shadow(0 0 ${charged * 14}px ${GOLD_SOFT})` : undefined }}
    >
      <TarotCardSVG card={card} orientation={day.orientation} width={64} staticCard showOrientationTag={false} />
    </motion.div>
  );
}

// ── 揭面后的「命运之牌」卡面 ─────────────────────────────────────

function FateCardFace({ verdict, width }: { verdict: string | null; width: number }) {
  const height = Math.round(width * 1.6);
  return (
    <div
      className="relative flex flex-col items-center justify-between overflow-hidden rounded-xl px-2 py-3"
      style={{
        width, height,
        background: 'linear-gradient(160deg, #241a5e 0%, #14103c 55%, #0c0925 100%)',
        boxShadow: `inset 0 0 0 2px ${GOLD}, inset 0 0 0 5px rgba(212,175,55,0.25), 0 0 28px ${GOLD_SOFT}`,
      }}
    >
      <div className="text-[8px] font-black tracking-[0.35em]" style={{ color: GOLD }}>FATE</div>
      <div className="relative flex flex-1 items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 26, ease: 'linear' }}
          className="absolute"
        >
          <FourStar size={64} color="rgba(212,175,55,0.18)" />
        </motion.div>
        <FourStar size={34} color={GOLD} />
      </div>
      <div className="min-h-[30px] px-1 text-center text-[11px] font-black leading-snug" style={{ color: '#efe6c8' }}>
        {verdict ?? '……'}
      </div>
      <div className="text-[7px] font-bold tracking-[0.3em]" style={{ color: 'rgba(239,230,200,0.4)' }}>THE VELVET ROOM</div>
    </div>
  );
}

// ── 装饰件 ───────────────────────────────────────────────────────

/** 四角星（✦ 的矢量版） */
function FourStar({ size, color, className }: { size: number; color: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 0 C13.2 7.4 16.6 10.8 24 12 C16.6 13.2 13.2 16.6 12 24 C10.8 16.6 7.4 13.2 0 12 C7.4 10.8 10.8 7.4 12 0 Z" fill={color} />
    </svg>
  );
}

/** 星屑背景（确定性伪随机，不闪帧） */
function MiniStars({ seed, count, fixed }: { seed: number; count: number; fixed?: boolean }) {
  const stars = useMemo(() => {
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    return Array.from({ length: count }, () => ({
      x: rnd() * 100, y: rnd() * 100, r: 0.6 + rnd() * 1.3, o: 0.25 + rnd() * 0.5,
    }));
  }, [seed, count]);
  return (
    <svg aria-hidden className={`${fixed ? 'fixed' : 'absolute'} inset-0 h-full w-full`} style={{ pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 100 100">
      {stars.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.r * 0.16} fill="#efe6c8" opacity={st.o} />
      ))}
    </svg>
  );
}

/** 魔法阵：双环 + 刻度 + 内星，随蓄力生长旋转；蓄满常亮 */
function MagicCircle({ progress, locked, d0 }: { progress: number; locked: boolean; d0: boolean }) {
  const p = locked ? 1 : progress;
  if (p <= 0.01) return null;
  const ticks = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
      style={{ opacity: 0.25 + p * 0.75 }}
    >
      <motion.svg
        width={230} height={230} viewBox="0 0 230 230" aria-hidden
        animate={d0 ? undefined : { rotate: locked ? 360 : p * 140 }}
        transition={d0 ? undefined : locked ? { repeat: Infinity, duration: 24, ease: 'linear' } : { duration: 0.1 }}
        style={{ scale: 0.4 + p * 0.6 }}
      >
        {/* 外环（蓄力弧） */}
        <circle cx={115} cy={115} r={106} fill="none" stroke="rgba(212,175,55,0.18)" strokeWidth={1.5} />
        <circle
          cx={115} cy={115} r={106} fill="none" stroke={GOLD} strokeWidth={2.5}
          strokeDasharray={`${p * 666} 666`} strokeLinecap="round" transform="rotate(-90 115 115)"
          style={{ filter: `drop-shadow(0 0 6px ${GOLD_SOFT})` }}
        />
        {/* 刻度 */}
        {ticks.map((a, i) => (
          <line
            key={i}
            x1={115 + Math.cos(a) * 96} y1={115 + Math.sin(a) * 96}
            x2={115 + Math.cos(a) * (i % 6 === 0 ? 86 : 91)} y2={115 + Math.sin(a) * (i % 6 === 0 ? 86 : 91)}
            stroke={i / 24 <= p ? GOLD : 'rgba(212,175,55,0.25)'} strokeWidth={i % 6 === 0 ? 2 : 1}
          />
        ))}
        {/* 内环 + 方阵 */}
        <circle cx={115} cy={115} r={74} fill="none" stroke="rgba(212,175,55,0.5)" strokeWidth={1} strokeDasharray="3 6" />
        <rect x={115 - 52} y={115 - 52} width={104} height={104} fill="none" stroke="rgba(212,175,55,0.35)" strokeWidth={1} transform="rotate(45 115 115)" />
        <rect x={115 - 52} y={115 - 52} width={104} height={104} fill="none" stroke="rgba(212,175,55,0.22)" strokeWidth={1} />
      </motion.svg>
    </motion.div>
  );
}

/** 蓄力粒子：自魔法阵缘升起的小光点 */
function RisingMotes({ intensity }: { intensity: number }) {
  const motes = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      left: 8 + ((i * 37) % 84),
      delay: (i % 7) * 0.18,
      dur: 1.2 + (i % 5) * 0.22,
      size: 2 + (i % 3),
    })), []);
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {motes.slice(0, Math.max(4, Math.round(intensity * 14))).map((m, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ left: `${m.left}%`, bottom: 8, width: m.size, height: m.size, background: GOLD, boxShadow: `0 0 6px ${GOLD_SOFT}` }}
          animate={{ y: [-4, -150], opacity: [0, 0.9, 0] }}
          transition={{ repeat: Infinity, duration: m.dur, delay: m.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

/** 四角星迸现：蓄力后段在牌周随机位置闪出 */
function StarBursts() {
  const bursts = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => ({
      left: 12 + ((i * 53) % 76),
      top: 10 + ((i * 71) % 74),
      delay: i * 0.3,
      size: 10 + (i % 3) * 5,
    })), []);
  return (
    <div className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {bursts.map((b, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ left: `${b.left}%`, top: `${b.top}%` }}
          animate={{ scale: [0, 1, 0], rotate: [0, 45], opacity: [0, 1, 0] }}
          transition={{ repeat: Infinity, duration: 1.1, delay: b.delay, repeatDelay: 0.8 }}
        >
          <FourStar size={b.size} color={GOLD} />
        </motion.span>
      ))}
    </div>
  );
}

/** 解读段落壳 */
function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3.5" style={{ background: 'rgba(18,14,51,0.72)', boxShadow: 'inset 0 0 0 1px rgba(212,175,55,0.25)' }}>
      {children}
    </div>
  );
}

function ReadingBlock({ label, en, text, delay }: { label: string; en: string; text: string; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
      <PanelShell>
        <div className="mb-1.5 flex items-center gap-2">
          <FourStar size={10} color={GOLD} />
          <span className="text-[12px] font-black tracking-[0.24em]" style={{ color: '#efe6c8' }}>{label}</span>
          <span className="text-[9px] font-bold tracking-[0.2em]" style={{ color: 'rgba(239,230,200,0.35)' }}>{en}</span>
        </div>
        <p className="whitespace-pre-wrap text-[12.5px] leading-[1.75]" style={{ color: 'rgba(239,230,200,0.88)' }}>{text}</p>
      </PanelShell>
    </motion.div>
  );
}
