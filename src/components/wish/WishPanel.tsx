/**
 * WishPanel —— 愿望二级面板（PRD_V2.6 §8）。
 *
 * 对照 BigDealPanel：结构刻意做成同一套（环 + 子步清单 + 追加 + AI 续拆），
 * 因为用户在这两处要做的事是同一件事——「把一件远的事拆到够得着」。
 * 差别只在两点，而且都是有意的：
 *   ① 愿望的子步**勾掉不加点**（愿望不占任务位；要加点就去建今日任务挂上来）；
 *   ② 顶部环画的是 AI 评的**主观距离**百分比，不是 N/M 客观计数。
 *
 * 外壳走 SheetModal（四频道皮齐全），内部沿用通用灰阶——与 BigDealPanel 同源，
 * 不在这里再造一套频道分支。
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { SheetModal } from '@/components/SheetModal';
import { Toggle } from '@/components/Toggle';
import { BufferedTextInput } from '@/components/ui/BufferedTextInput';
import { WishRing } from './WishRing';
import { triggerLightHaptic } from '@/utils/feedback';

interface Props {
  /** null = 关闭 */
  wishId: string | null;
  onClose: () => void;
}

/** 距离档位 → 一句话语气。数字本身不会说话，得有人替它说。 */
const distanceLabel = (pct: number): string => {
  if (pct >= 90) return '几乎到了';
  if (pct >= 70) return '看得见了';
  if (pct >= 45) return '走到一半';
  if (pct >= 20) return '起步了';
  return '刚上路';
};

export function WishPanel({ wishId, onClose }: Props) {
  const wishes = useAppStore(s => s.wishes);
  const getWishRing = useAppStore(s => s.getWishRing);
  const addWishStep = useAppStore(s => s.addWishStep);
  const toggleWishStep = useAppStore(s => s.toggleWishStep);
  const removeWishStep = useAppStore(s => s.removeWishStep);
  const decomposeWishStepsAI = useAppStore(s => s.decomposeWishStepsAI);
  const evaluateWishProgress = useAppStore(s => s.evaluateWishProgress);
  const setWishProgress = useAppStore(s => s.setWishProgress);
  const saveWish = useAppStore(s => s.saveWish);
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);

  const [newStep, setNewStep] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const wish = wishId ? wishes.find(w => w.id === wishId) : undefined;
  const ring = wishId ? getWishRing(wishId) : { pct: 0, evaluated: false, done: 0, total: 0, times: 0 };
  const steps = wish?.steps ?? [];

  const addStep = async () => {
    const t = newStep.trim();
    if (!wish || !t) return;
    await addWishStep(wish.id, t);
    setNewStep('');
  };

  const runAI = async () => {
    if (!wish || aiBusy) return;
    setAiBusy(true);
    setNotice(null);
    try {
      const list = await decomposeWishStepsAI(wish.id);
      if (list.length === 0) {
        setNotice('AI 这次没拆出新步。手写一条也行');
      } else {
        for (const t of list) await addWishStep(wish.id, t, { source: 'ai' });
        setNotice(`AI 拆了 ${list.length} 条——不合适的直接删`);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'AI 没接通，手写一条也行');
    } finally {
      setAiBusy(false);
    }
  };

  const runEval = async () => {
    if (!wish || evalBusy) return;
    setEvalBusy(true);
    setNotice(null);
    try {
      // 手动评估允许下调：这是用户主动要一个诚实的数，不是完成任务后的奖励
      const r = await evaluateWishProgress(wish.id, { allowDecrease: true });
      if (!r) { setNotice('这条愿望已经了结了'); return; }
      triggerLightHaptic();
      setNotice(
        r.source === 'local'
          ? `按子步与记录估了个数：${r.pct}%（配好 AI 会更准）`
          : `${r.pct}%${r.delta !== 0 ? `（${r.delta > 0 ? '+' : ''}${r.delta}）` : '（和上次一样）'}`,
      );
    } finally {
      setEvalBusy(false);
    }
  };

  return (
    <SheetModal isOpen={!!wish} onClose={onClose} position="bottom" title={wish?.title ?? ''}>
      {wish && (
        <div className="space-y-4">
          {/* 头部：距离环 + 依据 */}
          <div className="flex items-center gap-3">
            <WishRing
              pct={ring.pct}
              evaluated={ring.evaluated}
              size={58}
              strokeWidth={4}
              color="var(--color-primary)"
              track="rgba(148,163,184,0.35)"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black text-gray-800 dark:text-white">
                {ring.evaluated ? `离这个愿望 · ${distanceLabel(ring.pct)}` : '还没评估过距离'}
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">愿望</span>
              </div>
              <div className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
                {ring.times > 0 ? `已完成相关任务 ${ring.times} 次` : '还没有记录挂到这里'}
                {ring.total > 0 && ` · 子任务 ${ring.done}/${ring.total}`}
              </div>
              {wish.progressBasis && (
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  {wish.progressBasis}
                </p>
              )}
            </div>
          </div>

          {/* 评估操作行 */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runEval()}
              disabled={evalBusy}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-black text-white disabled:opacity-45"
            >
              {evalBusy ? '评估中…' : ring.evaluated ? '↻ 重新评估距离' : '✦ 评估一次距离'}
            </button>
            <button
              type="button"
              onClick={() => setManualOpen(v => !v)}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-500 dark:border-gray-600 dark:text-gray-400"
            >
              手动设定
            </button>
          </div>

          {manualOpen && (
            <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400">
                <span>你觉得走到哪了？</span>
                <span className="tabular-nums text-primary">{ring.pct}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={99}
                value={ring.pct}
                onChange={(e) => void setWishProgress(wish.id, Number(e.target.value), { source: 'manual' })}
                className="mt-2 w-full accent-[var(--color-primary)]"
                aria-label="愿望进度百分比"
              />
              <p className="mt-1 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                100% 留给「愿望已实现」——那一下要你自己按。
              </p>
            </div>
          )}

          {/* 现状一句话：喂给 AI 评估与拆解的关键上下文。
              走 BufferedTextInput——这是个中文长句输入位，直连 store 会被输入法叠字 */}
          <div>
            <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400">现在走到哪了（AI 评估会读它）</label>
            <div className="mt-1 flex gap-2">
              <BufferedTextInput
                value={wish.currentState ?? ''}
                onCommit={(v) => {
                  const t = v.trim();
                  if (t === (wish.currentState ?? '')) return;
                  void saveWish({ ...wish, currentState: t || undefined });
                }}
                placeholder="一句话说说现在的位置…"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                aria-label="愿望现状"
              />
            </div>
          </div>

          {/* 子任务清单 */}
          <div className="space-y-1.5">
            {steps.map(s => (
              <div key={s.id} className="flex items-center gap-2.5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.85 }}
                  onClick={() => void toggleWishStep(wish.id, s.id)}
                  aria-label={s.done ? '撤销这一步' : '完成这一步'}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    s.done
                      ? 'border-primary bg-primary text-white'
                      : 'border-gray-300 text-transparent dark:border-gray-600'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </motion.button>
                <span className={`min-w-0 flex-1 text-sm ${s.done ? 'text-gray-400 line-through dark:text-gray-600' : 'text-gray-700 dark:text-gray-200'}`}>
                  {s.title}
                  {s.source === 'ai' && <span className="ml-1 text-[10px] text-gray-300 dark:text-gray-600">AI</span>}
                </span>
                <button
                  type="button"
                  aria-label="删除子任务"
                  onClick={() => void removeWishStep(wish.id, s.id)}
                  className="shrink-0 rounded p-1 text-gray-300 hover:text-red-400 dark:text-gray-600"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {steps.length === 0 && (
              <p className="py-2 text-center text-sm text-gray-400 dark:text-gray-500">
                还没有子任务——先拆一个够得着的
              </p>
            )}
          </div>

          {/* 追加 + AI 拆解 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void addStep(); }}
                placeholder="拆一个够得着的小步…"
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <button
                type="button"
                onClick={() => void addStep()}
                disabled={!newStep.trim()}
                className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                添加
              </button>
            </div>
            <button
              type="button"
              onClick={() => void runAI()}
              disabled={aiBusy}
              className="rounded-full border border-primary/40 px-3 py-1 text-xs font-bold text-primary disabled:opacity-45"
            >
              {aiBusy ? '正在拆…' : '✦ AI 拆下一组'}
            </button>
          </div>

          {notice && <p className="text-xs font-medium text-primary">{notice}</p>}

          {/* 自动重估开关。放在这里而不是设置深处：用户是在看见弹窗之后才会想关它的，
              那个念头发生在这个面板，不在设置页。标注「所有愿望」避免被读成本条专属 */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700">
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-gray-700 dark:text-gray-200">完成任务后自动重估</div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
                挂到愿望的记录一落，就重算距离并弹一张卡（作用于所有愿望）。
              </p>
            </div>
            <Toggle
              checked={settings.wishAutoEvaluate !== false}
              onChange={(v) => void updateSettings({ wishAutoEvaluate: v })}
              aria-label="完成任务后自动重估愿望进度"
            />
          </div>

          <p className="text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
            愿望的子任务勾掉<b>不加点</b>——它只是把路标出来。要拿点数，去今日任务建一条挂到这个愿望上。
          </p>
        </div>
      )}
    </SheetModal>
  );
}
