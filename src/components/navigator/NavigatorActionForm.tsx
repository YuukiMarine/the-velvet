/**
 * NavigatorActionForm — 黑猫菜单层的统一迷你表单（与确认卡同构：表单产出的就是 NavigatorDraft）。
 *
 * 用途双栖（已确认设计）：
 *   1. chips 直接新建（空白草稿）；2. 确认卡上「编辑」回改参数（带值草稿）。
 * 提交只回传草稿，不落库——落库统一走确认卡的「确认」（executeDraft）。
 * 皮肤：board 频道 = P3 亮蓝白纸（站内信附件单）；其余 = 中性深色兜底。
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { zClass } from '@/utils/zIndex';
import { useModalA11y } from '@/utils/useModalA11y';
import { useBackHandler } from '@/utils/useBackHandler';
import { CATEGORY_KEYS, CATEGORY_META, INCOME_TYPES, INCOME_META } from '@/utils/ledgerFormat';
import {
  ACTION_META, ATTR_IDS, draftReady, navAttrName,
  type NavigatorDraft,
} from '@/utils/navigatorRegistry';
import { P3 } from '@/components/terminal/p3Kit';

interface Props {
  /** null = 关闭 */
  draft: NavigatorDraft | null;
  bright: boolean;
  onSubmit: (d: NavigatorDraft) => void;
  onClose: () => void;
}

export const NavigatorActionForm = ({ draft, bright, onSubmit, onClose }: Props) => {
  const open = draft !== null;
  const a11yRef = useModalA11y(open, onClose, { closeOnEscape: true, trapFocus: true });
  useBackHandler(open, onClose);
  // key 由调用方通过重新挂载保证草稿刷新（draft 变化即换 key），这里持一份可编辑副本
  const [d, setD] = useState<NavigatorDraft | null>(draft);
  if (draft !== null && d === null) setD(draft);
  if (draft === null && d !== null) setD(null);

  if (typeof document === 'undefined') return null;

  const ink = bright ? { color: P3.ink } : undefined;
  const panelCls = bright
    ? 'bg-[#f7fbff] shadow-[0_24px_60px_rgba(6,30,90,.4)]'
    : 'border border-white/10 bg-[#15181f] text-gray-100 shadow-2xl';
  const labelCls = `mb-1.5 block text-xs font-bold ${bright ? '' : 'text-gray-400'}`;
  const inputCls = bright
    ? 'w-full rounded-none border-2 border-[#cfe4fb] bg-white px-3 py-2.5 text-[16px] font-bold outline-none placeholder:text-[#8fb1dc] focus:border-[#2fd2ff]'
    : 'w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-[16px] outline-none placeholder:text-gray-500 focus:border-primary';
  const chipCls = (active: boolean) => bright
    ? `px-3 py-1.5 text-xs font-black transition ${active ? 'bg-[color-mix(in_srgb,var(--color-primary)_30%,#061c50)] text-white' : 'border border-[#bcd9f8] bg-white text-[color-mix(in_srgb,var(--color-primary)_50%,#1d4ab0)]'}`
    : `rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-primary text-white' : 'border border-white/15 bg-white/5 text-gray-300'}`;
  const stepBtnCls = bright
    ? 'flex h-8 w-8 items-center justify-center border-2 border-[#cfe4fb] bg-white text-sm font-black disabled:opacity-30'
    : 'flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sm font-bold disabled:opacity-30';

  const patch = (p: Partial<NavigatorDraft>) => setD((prev) => (prev ? ({ ...prev, ...p } as NavigatorDraft) : prev));

  const body = d && (
    <div className="space-y-4">
      {d.kind === 'activity' && (
        <>
          <div>
            <label className={labelCls} style={ink} htmlFor="nav-form-text">做了什么</label>
            <textarea
              id="nav-form-text"
              autoFocus
              rows={3}
              value={d.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder="用一句话描述你的行动…"
              className={`${inputCls} resize-none`}
              style={ink}
            />
          </div>
          <div>
            <div className={labelCls} style={ink}>加点（0–5）</div>
            <div className="space-y-2">
              {ATTR_IDS.map((id) => (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-16 truncate text-sm font-bold" style={ink}>{navAttrName(id)}</span>
                  <button type="button" className={stepBtnCls} style={ink} disabled={d.points[id] <= 0}
                    onClick={() => patch({ points: { ...d.points, [id]: d.points[id] - 1 } })} aria-label={`${navAttrName(id)} 减一`}>−</button>
                  <span className="w-6 text-center text-sm font-black" style={ink}>{d.points[id]}</span>
                  <button type="button" className={stepBtnCls} style={ink} disabled={d.points[id] >= 5}
                    onClick={() => patch({ points: { ...d.points, [id]: d.points[id] + 1 } })} aria-label={`${navAttrName(id)} 加一`}>＋</button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => patch({ important: !d.important })} className={chipCls(d.important)}>
            ⭐ 重要事件{d.important ? '（已标记）' : ''}
          </button>
        </>
      )}

      {d.kind === 'todo' && (
        <>
          <div>
            <label className={labelCls} style={ink} htmlFor="nav-form-title">任务名</label>
            <input
              id="nav-form-title"
              autoFocus
              value={d.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="要做的事…"
              className={inputCls}
              style={ink}
            />
          </div>
          <div>
            <div className={labelCls} style={ink}>绑定属性</div>
            <div className="flex flex-wrap gap-1.5">
              {ATTR_IDS.map((id) => (
                <button key={id} type="button" onClick={() => patch({ attribute: id })} className={chipCls(d.attribute === id)}>
                  {navAttrName(id)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <div className={labelCls} style={ink}>奖励点数</div>
              <div className="flex items-center gap-2">
                <button type="button" className={stepBtnCls} style={ink} disabled={d.points <= 1}
                  onClick={() => patch({ points: d.points - 1 })} aria-label="点数减一">−</button>
                <span className="w-6 text-center text-sm font-black" style={ink}>{d.points}</span>
                <button type="button" className={stepBtnCls} style={ink} disabled={d.points >= 5}
                  onClick={() => patch({ points: d.points + 1 })} aria-label="点数加一">＋</button>
              </div>
            </div>
            <div>
              <div className={labelCls} style={ink}>频率</div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => patch({ repeatDaily: false })} className={chipCls(!d.repeatDaily)}>单次</button>
                <button type="button" onClick={() => patch({ repeatDaily: true })} className={chipCls(d.repeatDaily)}>每日</button>
              </div>
            </div>
          </div>
        </>
      )}

      {d.kind === 'ledger' && (
        <>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => patch({ direction: 'expense' })} className={chipCls(d.direction === 'expense')}>支出</button>
            <button type="button" onClick={() => patch({ direction: 'income' })} className={chipCls(d.direction === 'income')}>收入</button>
          </div>
          <div>
            <label className={labelCls} style={ink} htmlFor="nav-form-amount">金额（¥）</label>
            <input
              id="nav-form-amount"
              autoFocus
              inputMode="decimal"
              value={d.amount || ''}
              onChange={(e) => {
                const n = Number(e.target.value);
                patch({ amount: Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0 });
              }}
              placeholder="0.00"
              className={inputCls}
              style={ink}
            />
          </div>
          {d.direction === 'expense' ? (
            <div>
              <div className={labelCls} style={ink}>类目</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_KEYS.map((t) => (
                  <button key={t} type="button" onClick={() => patch({ type: t })} className={chipCls(d.type === t)}>
                    {CATEGORY_META[t].icon} {CATEGORY_META[t].label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className={labelCls} style={ink}>来源</div>
              <div className="flex gap-1.5">
                {INCOME_TYPES.map((t) => (
                  <button key={t} type="button" onClick={() => patch({ incomeType: t })} className={chipCls(d.incomeType === t)}>
                    {INCOME_META[t].label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className={labelCls} style={ink} htmlFor="nav-form-note">备注（可选）</label>
            <input
              id="nav-form-note"
              value={d.note}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="星巴克咖啡…"
              className={inputCls}
              style={ink}
            />
          </div>
          {d.direction === 'expense' && (
            <div>
              <label className={labelCls} style={ink} htmlFor="nav-form-channel">渠道（可选）</label>
              <input
                id="nav-form-channel"
                value={d.channel}
                onChange={(e) => patch({ channel: e.target.value })}
                placeholder="支付宝 / 微信 / 卡…"
                className={inputCls}
                style={ink}
              />
            </div>
          )}
        </>
      )}
    </div>
  );

  return createPortal(
    <AnimatePresence>
      {open && d && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 ${zClass.confirm} flex items-end justify-center bg-black/70 px-3 pb-4 pt-10 backdrop-blur-sm sm:items-center sm:p-6`}
          onMouseDown={onClose}
        >
          <motion.div
            ref={a11yRef}
            role="dialog"
            aria-modal="true"
            aria-label={ACTION_META[d.kind].label}
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={`w-full max-w-md overflow-hidden ${panelCls}`}
            style={bright ? { clipPath: 'polygon(0 2%, 100% 0, 99% 100%, 0 98%)' } : { borderRadius: '1.25rem' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className={`flex items-center gap-2 px-5 pt-4 ${bright ? '' : ''}`}>
              <span aria-hidden>{ACTION_META[d.kind].icon}</span>
              <h2 className="flex-1 text-base font-black" style={ink}>{ACTION_META[d.kind].label}</h2>
              <button
                type="button"
                aria-label="关闭"
                onClick={onClose}
                className={`flex h-8 w-8 items-center justify-center text-lg font-black ${bright ? '' : 'text-gray-400'}`}
                style={ink}
              >
                ✕
              </button>
            </header>
            <div className="max-h-[62vh] overflow-y-auto px-5 py-4">{body}</div>
            <footer className="flex gap-2 px-5 pb-5">
              <button
                type="button"
                disabled={!draftReady(d)}
                onClick={() => { onSubmit(d); }}
                className={bright
                  ? 'min-h-11 flex-1 bg-[color-mix(in_srgb,var(--color-primary)_30%,#061c50)] px-4 text-sm font-black text-white disabled:opacity-40'
                  : 'min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-40'}
              >
                写好了
              </button>
              <button
                type="button"
                onClick={onClose}
                className={bright
                  ? 'min-h-11 border-2 border-[#bcd9f8] bg-white px-4 text-sm font-black text-[color-mix(in_srgb,var(--color-primary)_50%,#1d4ab0)]'
                  : 'min-h-11 rounded-xl border border-white/15 px-4 text-sm font-bold text-gray-300'}
              >
                取消
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
