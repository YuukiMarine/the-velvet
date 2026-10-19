/**
 * AIJobsBanner — 顶部「正在写」横幅（第 27 批 · PRD §21.3 ①②）。
 *
 * 读 utils/aiJobs 的表：在跑的每条一行「中长期占卜 · 思考中 42%」，写好了没看的一行「成长总结写好了 · 点开看」。
 * 点一行直达那个弹层（openAIJob）；右上角可收起成一枚小标，新任务开跑 / 写完时自动再展开。
 * 正开着看的（弹层登记了 watch）那一行不显示——人就在那页，没必要再提。
 * 进度是时间推的（thinkProgress），不经过仓：横幅自己每半秒读一次 liveStatusOf。
 * portal 到 body，z 用 nav 档（40）：压在页面上、让位给任何弹层（弹层 z≥50）。
 */
import { useEffect, useMemo, useReducer } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAIJobs, openAIJob, dismissAIJobNote, setAIJobsCollapsed, liveStatusOf, type AIJobKey } from '@/utils/aiJobs';
import { useUiChannel } from '@/ui/useUiChannel';
import { zClass } from '@/utils/zIndex';
import { P3R } from '@/components/p3r/kit';
import { P5R } from '@/components/p5r/kit';

interface Skin { bg: string; fg: string; sub: string; accent: string; border: string; radius: number }

const skinOf = (channel: string, dark: boolean): Skin => {
  if (channel === 'p5') return { bg: '#050505', fg: P5R.paper, sub: 'rgba(240,233,223,0.7)', accent: P5R.red, border: `1.5px solid ${P5R.paper}`, radius: 4 };
  if (channel === 'p3') return { bg: '#0a1230', fg: '#ffffff', sub: 'rgba(255,255,255,0.72)', accent: P3R.cyan, border: 'none', radius: 6 };
  if (channel === 'p4') return { bg: '#131313', fg: '#ffffff', sub: 'rgba(255,255,255,0.72)', accent: 'var(--p4-orange, #f9a11b)', border: 'none', radius: 18 };
  return dark
    ? { bg: 'rgba(243,244,246,0.96)', fg: '#111827', sub: 'rgba(17,24,39,0.65)', accent: '#6366f1', border: 'none', radius: 16 }
    : { bg: 'rgba(17,24,39,0.94)', fg: '#ffffff', sub: 'rgba(255,255,255,0.7)', accent: '#a5b4fc', border: 'none', radius: 16 };
};

const PenIcon = ({ className = 'h-3.5 w-3.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** 一行的小字（每半秒刷一次） */
function LiveText({ jobKey }: { jobKey: AIJobKey }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);
  const live = liveStatusOf(jobKey);
  return <>{live.text}</>;
}

function ProgressBar({ jobKey, color }: { jobKey: AIJobKey; color: string }) {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, []);
  const live = liveStatusOf(jobKey);
  return (
    <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden" style={{ opacity: 0.9 }}>
      {live.pct !== null ? (
        <span className="block h-full transition-[width] duration-500" style={{ width: `${Math.round(live.pct * 100)}%`, background: color }} />
      ) : (
        // 正文阶段没有百分比：一段光条来回扫，表示「还在写」
        <motion.span
          className="block h-full w-1/3"
          style={{ background: color }}
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </span>
  );
}

export function AIJobsBanner() {
  const running = useAIJobs(s => s.running);
  const notes = useAIJobs(s => s.notes);
  const watching = useAIJobs(s => s.watching);
  const collapsed = useAIJobs(s => s.collapsed);
  const channel = useUiChannel();
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const skin = skinOf(channel, dark);

  const rows = useMemo(() => running.filter(v => !((watching[v.key] ?? 0) > 0)), [running, watching]);
  const visible = rows.length > 0 || notes.length > 0;
  const count = rows.length + notes.length;

  // 展开着别一直压在页头上：8 秒后自己收成小标（新任务开跑 / 写完时登记簿会再展开一次）；底导的小圆点一直在
  useEffect(() => {
    if (!visible || collapsed) return;
    const t = window.setTimeout(() => setAIJobsCollapsed(true), 8000);
    return () => window.clearTimeout(t);
  }, [visible, collapsed]);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          key="aijobs"
          data-aijobs-banner={collapsed ? 'collapsed' : 'open'}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22 }}
          className={`pointer-events-none fixed inset-x-0 top-0 wide:left-60 ${zClass.nav}`}
          style={{ paddingTop: 'calc(var(--app-safe-top) + 6px)' }}
        >
          {collapsed ? (
            <div className="flex justify-end px-3">
              <button
                type="button"
                aria-label="展开后台任务"
                onClick={() => setAIJobsCollapsed(false)}
                className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-black shadow-lg"
                style={{ background: skin.bg, color: skin.fg, border: skin.border, borderRadius: skin.radius }}
              >
                <span style={{ color: skin.accent }}><PenIcon className="h-3 w-3" /></span>
                {rows.length > 0 ? <LiveText jobKey={rows[0].key} /> : `${notes.length} 件写好了`}
                {count > 1 && <span style={{ color: skin.sub }}>+{count - 1}</span>}
              </button>
            </div>
          ) : (
            <div
              className="pointer-events-auto mx-3 overflow-hidden shadow-xl backdrop-blur-sm"
              style={{ background: skin.bg, color: skin.fg, border: skin.border, borderRadius: skin.radius }}
            >
              <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
                <span className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.18em]" style={{ color: skin.sub }}>
                  <span style={{ color: skin.accent }}><PenIcon className="h-3 w-3" /></span>
                  {rows.length > 0 ? '正在写' : '写好了'}
                </span>
                <button
                  type="button"
                  aria-label="收起后台任务横幅"
                  onClick={() => setAIJobsCollapsed(true)}
                  className="-mr-1 px-1.5 py-0.5 text-[11px] font-black"
                  style={{ color: skin.sub }}
                >
                  收起
                </button>
              </div>
              <div className="pb-1">
                {rows.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    data-aijob={v.key}
                    data-state="running"
                    onClick={() => openAIJob(v.key, v.ref)}
                    className="relative flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left active:opacity-80"
                  >
                    <span className="text-[13px] font-black">{v.label}</span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: skin.sub }}><LiveText jobKey={v.key} /></span>
                    <ProgressBar jobKey={v.key} color={skin.accent} />
                  </button>
                ))}
                {notes.map(n => (
                  <div key={n.id} data-aijob={n.key} data-state={n.state} className="flex items-center gap-1 pl-3 pr-1">
                    <button
                      type="button"
                      onClick={() => openAIJob(n.key, n.ref)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1.5 text-left active:opacity-80"
                    >
                      <span className="text-[13px] font-black">
                        {n.label}
                        <span style={{ color: n.state === 'done' ? skin.accent : skin.sub }}>{n.state === 'done' ? '写好了' : '中断了'}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-bold" style={{ color: skin.sub }}>{n.state === 'done' ? '点开看 ›' : '点开处理 ›'}</span>
                    </button>
                    <button
                      type="button"
                      aria-label="知道了"
                      onClick={() => dismissAIJobNote(n.key)}
                      className="px-2 py-1 text-[13px] font-black"
                      style={{ color: skin.sub }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
