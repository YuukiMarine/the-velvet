/**
 * WishBoard —— 首页「今日任务 ⇄ 愿望」里的愿望面（PRD_V2.6 §1 / §3）。
 *
 * 为什么是一块共享件而不是各频道各写一份：
 *   三个 Dashboard 变体（中性 / P3 / P5 / P4）的今日任务卡外壳差异很大，
 *   但**愿望面的信息结构是同一套**（窄条 → 列表 → 添加）。
 *   所以外壳留给宿主，内容收在这里，靠 skin 参数吃频道差分。
 *
 * 内容自上而下：
 *   ① 弹幕投稿窄条（仅 terminalDanmakuTokens > 0 时显形，§3）
 *   ② 愿望列表：标题 + 「已完成相关任务 N 次」+ ⋯ 二级菜单
 *   ③ 添加一行
 *
 * 愿望**不进今日任务列表**——它是"远处的灯"，不是今天要打的卡。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import type { Wish } from '@/types';
import { DanmakuCompose } from '@/components/danmaku/DanmakuCompose';
import { WishFulfillDialog } from './WishFulfillDialog';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import { triggerLightHaptic } from '@/utils/feedback';

export interface WishBoardSkin {
  /** 正文字色 */
  ink: string;
  /** 次级字色 */
  sub: string;
  /** 强调色（计数、加号） */
  accent: string;
  /** 行分隔线 */
  line: string;
  /** 行底（列表项背景） */
  rowBg: string;
  /** 直角/斜切等形状：留给宿主传 clipPath，缺省圆角 */
  rowClip?: string;
  radius: number;
}

export function WishBoard({ skin }: { skin: WishBoardSkin }) {
  const wishes = useAppStore(s => s.wishes);
  const settings = useAppStore(s => s.settings);
  const addWish = useAppStore(s => s.addWish);
  const getWishProgress = useAppStore(s => s.getWishProgress);
  const setWishStatus = useAppStore(s => s.setWishStatus);
  const deleteWish = useAppStore(s => s.deleteWish);

  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [fulfilling, setFulfilling] = useState<Wish | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const tokens = settings.terminalDanmakuTokens ?? 0;
  // 只显示"在途"愿望；实现/归档的进归档区（Menu → 归档）
  const active = wishes.filter(w => w.status === 'active' && !w.parentId);

  const submit = async () => {
    const t = draft.trim();
    if (!t) return;
    await addWish({ title: t, source: 'manual' });
    setDraft('');
    setAdding(false);
    triggerLightHaptic();
  };

  return (
    <div className="space-y-2">
      {/* ① 弹幕投稿窄条（§3）——只在真有投稿机会时占位，平时不打扰 */}
      {tokens > 0 && (
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
          style={{
            background: skin.rowBg,
            border: `1px solid ${skin.accent}`,
            borderRadius: skin.radius,
            clipPath: skin.rowClip,
          }}
        >
          <span className="shrink-0 text-[13px]" style={{ color: skin.accent }}>✦</span>
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold" style={{ color: skin.ink }}>
            你还有 {tokens} 次机会鼓励同样努力的人
          </span>
          <span className="shrink-0 text-[10px] font-black" style={{ color: skin.accent }}>去写 ›</span>
        </button>
      )}

      {/* ② 愿望列表 */}
      {active.length === 0 ? (
        <p className="px-1 py-5 text-center text-[12px] leading-relaxed" style={{ color: skin.sub }}>
          还没有愿望。<br />
          写下一个远一点的——记录时把事挂上去，就能看见自己在靠近它。
        </p>
      ) : (
        active.map((w) => {
          const times = getWishProgress(w.id);
          return (
            <div
              key={w.id}
              className="relative px-3 py-2"
              style={{ background: skin.rowBg, borderRadius: skin.radius, clipPath: skin.rowClip }}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-black" style={{ color: skin.ink }}>{w.title}</div>
                  <div className="mt-0.5 text-[11px] font-bold" style={{ color: times > 0 ? skin.accent : skin.sub }}>
                    {times > 0 ? `已完成相关任务 ${times} 次` : '还没有记录挂到这里'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMenuFor(menuFor === w.id ? null : w.id)}
                  aria-label={`「${w.title}」的操作`}
                  className="shrink-0 px-1.5 py-0.5 text-[15px] font-black leading-none"
                  style={{ color: skin.sub }}
                >
                  ⋯
                </button>
              </div>

              <AnimatePresence>
                {menuFor === w.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.16 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 flex gap-1.5 border-t pt-2" style={{ borderColor: skin.line }}>
                      <button
                        type="button"
                        onClick={() => { setMenuFor(null); setFulfilling(w); }}
                        className="flex-1 py-1.5 text-[11px] font-black"
                        style={{ background: skin.accent, color: skin.rowBg, borderRadius: skin.radius }}
                      >
                        愿望已实现
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMenuFor(null); void setWishStatus(w.id, 'archived'); }}
                        className="flex-1 py-1.5 text-[11px] font-black"
                        style={{ border: `1px solid ${skin.line}`, color: skin.sub, borderRadius: skin.radius }}
                      >
                        收起
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMenuFor(null); void deleteWish(w.id); }}
                        className="shrink-0 px-3 py-1.5 text-[11px] font-black"
                        style={{ border: `1px solid ${skin.line}`, color: skin.sub, borderRadius: skin.radius }}
                      >
                        删除
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })
      )}

      {/* ③ 添加 */}
      {adding ? (
        <div className="flex gap-1.5">
          <BufferedTextInput
            value={draft}
            onCommit={setDraft}
            debounceMs={150}
            placeholder="想实现的事…"
            className="min-w-0 flex-1 px-3 py-2 text-[13px] font-bold outline-none"
            aria-label="愿望标题"
          />
          <button
            type="button"
            onClick={() => void submit()}
            className="shrink-0 px-3 py-2 text-[11px] font-black"
            style={{ background: skin.accent, color: skin.rowBg, borderRadius: skin.radius }}
          >
            记下
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setDraft(''); }}
            className="shrink-0 px-2 py-2 text-[11px] font-black"
            style={{ color: skin.sub }}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full py-2 text-[11px] font-black"
          style={{ border: `1px dashed ${skin.line}`, color: skin.sub, borderRadius: skin.radius }}
        >
          ＋ 记下一个愿望
        </button>
      )}

      <WishFulfillDialog wish={fulfilling} onClose={() => setFulfilling(null)} />
      <DanmakuCompose isOpen={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}

/**
 * 首页任务卡的「今日任务 ⇄ 愿望」开关。三个 Dashboard 变体共用，
 * 状态落 settings.homeTaskPane 因而被记住（口径同 homeSkyMode）。
 */
export function useWishPane() {
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const wishes = useAppStore(s => s.wishes);
  const isWishPane = (settings.homeTaskPane ?? 'todos') === 'wishes';
  return {
    isWishPane,
    togglePane: () => { void updateSettings({ homeTaskPane: isWishPane ? 'todos' : 'wishes' }); },
    paneLabel: isWishPane ? '愿望（点击切回今日任务）' : '今日任务（点击切到愿望）',
    activeWishCount: wishes.filter(w => w.status === 'active' && !w.parentId).length,
  };
}

/** 频道 → WishBoard 皮。与各页卡面同源，避免愿望面在红/黄里读成「一块外来的灰卡」。 */
export function wishSkinFor(channel: 'p5' | 'p4' | 'p3' | 'neutral'): WishBoardSkin {
  switch (channel) {
    case 'p5':
      return { ink: '#050505', sub: '#494540', accent: '#c00008', line: 'rgba(5,5,5,0.22)',
               rowBg: '#f0e9df', radius: 0,
               rowClip: 'polygon(2px 0, 100% 1.5px, calc(100% - 2px) 100%, 0 calc(100% - 1.5px))' };
    case 'p4':
      return { ink: '#131313', sub: 'rgba(19,19,19,0.6)', accent: 'var(--p4-orange, #f9a11b)',
               line: 'rgba(19,19,19,0.16)', rowBg: '#fff9e3', radius: 14 };
    case 'p3':
      return { ink: 'var(--p3r-ink, #0a1230)', sub: 'var(--p3r-ink-soft, #3d4a66)',
               accent: 'var(--p3r-blue, #1b57ff)', line: 'rgba(147,190,222,0.5)',
               rowBg: 'var(--p3r-panel, #ffffff)', radius: 12 };
    default:
      return { ink: 'var(--ui-surface-ink, #111827)', sub: 'var(--ui-muted, #6b7280)',
               accent: 'var(--color-primary)', line: 'var(--ui-line, #e5e7eb)',
               rowBg: 'var(--ui-surface, #ffffff)', radius: 12 };
  }
}
