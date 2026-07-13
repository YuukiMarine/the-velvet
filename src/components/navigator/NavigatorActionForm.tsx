/**
 * NavigatorActionForm — 黑猫菜单层的统一迷你表单（与确认卡同构：表单产出的就是 NavigatorDraft）。
 *
 * 用途双栖（已确认设计）：
 *   1. chips 直接新建（空白草稿）；2. 确认卡上「编辑」回改参数（带值草稿）。
 * 提交只回传草稿，不落库——落库统一走确认卡的「确认」（executeDraft）。
 * 皮肤：board 频道 = P3R（p3-modal-14 稿 1:1）——LOG 竖排幽灵字 + 大黑斜体标题 +
 * 浅青斜切字段面 + 属性加点浅青斜条（青三角 ∓ 钮、逐级错位）+ 洋红旗重要事件 +
 * 「写好了」蓝斜块（洋红角）/「取消」白斜块（青角）；其余 = 中性深色兜底。
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
import { P3R, slantClip, SlantButton } from '@/components/p3r/kit';

interface Props {
  /** null = 关闭 */
  draft: NavigatorDraft | null;
  bright: boolean;
  onSubmit: (d: NavigatorDraft) => void;
  onClose: () => void;
}

/** 表单左缘竖排幽灵词（整行横排词顺时针 90°，定稿口径） */
const FORM_GHOST: Record<NavigatorDraft['kind'], string> = {
  activity: 'LOG',
  todo: 'TODO',
  ledger: 'NOTE',
  completeTodo: 'DONE',
};

/** 青色三角步进钮（p3-modal-14 稿：◀− / ▶＋） */
const TriStepBtn = ({ dir, disabled, onClick, label }: {
  dir: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
  label: string;
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="relative flex h-9 w-10 shrink-0 items-center justify-center disabled:opacity-30"
  >
    <span aria-hidden className="absolute inset-0" style={{ background: '#35d1e8', clipPath: dir === 'left' ? 'polygon(100% 0, 100% 100%, 0 50%)' : 'polygon(0 0, 0 100%, 100% 50%)' }} />
    <span className="relative text-[15px] font-black leading-none text-white" style={dir === 'left' ? { marginLeft: 10 } : { marginRight: 10 }}>
      {dir === 'left' ? '−' : '＋'}
    </span>
  </button>
);

export const NavigatorActionForm = ({ draft, bright, onSubmit, onClose }: Props) => {
  const open = draft !== null;
  const a11yRef = useModalA11y(open, onClose, { closeOnEscape: true, trapFocus: true });
  useBackHandler(open, onClose);
  // key 由调用方通过重新挂载保证草稿刷新（draft 变化即换 key），这里持一份可编辑副本
  const [d, setD] = useState<NavigatorDraft | null>(draft);
  if (draft !== null && d === null) setD(draft);
  if (draft === null && d !== null) setD(null);

  if (typeof document === 'undefined') return null;

  const ink = bright ? { color: P3R.ink } : undefined;
  const panelCls = bright
    ? 'bg-[#f4fafd] shadow-[0_24px_60px_rgba(6,30,90,.4)]'
    : 'border border-white/10 bg-[#15181f] text-gray-100 shadow-2xl';
  const labelCls = bright
    ? 'mb-2 block text-[15px] font-black'
    : 'mb-1.5 block text-xs font-bold text-gray-400';
  const inputCls = bright
    ? 'w-full bg-[#dbeff8] px-4 py-3 text-[16px] font-bold outline-none placeholder:text-[#8fb1dc]'
    : 'w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-[16px] outline-none placeholder:text-gray-500 focus:border-primary';
  const inputStyle = bright ? { ...ink, clipPath: slantClip(12) } : ink;
  const chipCls = (active: boolean) => bright
    ? `px-3.5 py-1.5 text-xs font-black transition [clip-path:polygon(8px_0,100%_0,calc(100%_-_8px)_100%,0_100%)] ${active ? 'bg-[#1b57ff] text-white shadow-[0_6px_16px_rgba(27,87,255,.3)]' : 'bg-white shadow-[0_4px_12px_rgba(7,40,120,.10)]'}`
    : `rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-primary text-white' : 'border border-white/15 bg-white/5 text-gray-300'}`;
  const stepBtnCls = 'flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sm font-bold disabled:opacity-30';

  const patch = (p: Partial<NavigatorDraft>) => setD((prev) => (prev ? ({ ...prev, ...p } as NavigatorDraft) : prev));

  const body = d && (
    <div className="space-y-4">
      {d.kind === 'activity' && (
        <>
          <div>
            <label className={labelCls} style={ink} htmlFor="nav-form-text">做了什么</label>
            {bright ? (
              <div className="relative">
                <textarea
                  id="nav-form-text"
                  autoFocus
                  rows={4}
                  value={d.text}
                  onChange={(e) => patch({ text: e.target.value })}
                  placeholder="用一句话描述你的行动…"
                  className={`${inputCls} resize-none`}
                  style={inputStyle}
                />
                <span aria-hidden className="pointer-events-none absolute bottom-2 right-1 h-[12px] w-[20px]" style={{ background: '#35d1e8', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
              </div>
            ) : (
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
            )}
          </div>
          <div>
            <div className={labelCls} style={ink}>加点（0–5）</div>
            <div className="space-y-2">
              {ATTR_IDS.map((id, i) => bright ? (
                // p3-modal-14 稿：浅青斜条行，逐级右移错位；青三角 ∓ 钮 + 大黑数字
                <div key={id} className="flex items-center gap-2 py-1.5 pl-5 pr-3" style={{ background: '#dbeff8', clipPath: slantClip(12), marginLeft: i * 7, marginRight: (4 - i) * 3 }}>
                  <span className="w-14 truncate text-[16px] font-black" style={ink}>{navAttrName(id)}</span>
                  <span className="flex-1" />
                  <TriStepBtn dir="left" disabled={d.points[id] <= 0} label={`${navAttrName(id)} 减一`}
                    onClick={() => patch({ points: { ...d.points, [id]: d.points[id] - 1 } })} />
                  <span className="w-12 text-center text-[24px] font-black italic leading-none" style={ink}>{d.points[id]}</span>
                  <TriStepBtn dir="right" disabled={d.points[id] >= 5} label={`${navAttrName(id)} 加一`}
                    onClick={() => patch({ points: { ...d.points, [id]: d.points[id] + 1 } })} />
                </div>
              ) : (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-16 truncate text-sm font-bold">{navAttrName(id)}</span>
                  <button type="button" className={stepBtnCls} disabled={d.points[id] <= 0}
                    onClick={() => patch({ points: { ...d.points, [id]: d.points[id] - 1 } })} aria-label={`${navAttrName(id)} 减一`}>−</button>
                  <span className="w-6 text-center text-sm font-black">{d.points[id]}</span>
                  <button type="button" className={stepBtnCls} disabled={d.points[id] >= 5}
                    onClick={() => patch({ points: { ...d.points, [id]: d.points[id] + 1 } })} aria-label={`${navAttrName(id)} 加一`}>＋</button>
                </div>
              ))}
            </div>
          </div>
          {bright ? (
            <button type="button" onClick={() => patch({ important: !d.important })} className="flex items-center gap-2.5 text-[16px] font-black" style={ink} aria-pressed={d.important}>
              <span aria-hidden className="h-0 w-0 border-t-[18px] border-r-[22px] border-r-transparent transition-colors" style={{ borderTopColor: d.important ? '#f0417f' : '#bcd3e2' }} />
              重要事件{d.important ? '（已标记）' : ''}
            </button>
          ) : (
            <button type="button" onClick={() => patch({ important: !d.important })} className={chipCls(d.important)}>
              ⭐ 重要事件{d.important ? '（已标记）' : ''}
            </button>
          )}
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
              style={inputStyle}
            />
          </div>
          <div>
            <div className={labelCls} style={ink}>绑定属性</div>
            <div className="flex flex-wrap gap-1.5">
              {ATTR_IDS.map((id) => (
                <button key={id} type="button" onClick={() => patch({ attribute: id })} className={chipCls(d.attribute === id)} style={bright && d.attribute !== id ? ink : undefined}>
                  {navAttrName(id)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <div className={labelCls} style={ink}>奖励点数</div>
              <div className="flex items-center gap-2">
                {bright ? (
                  <>
                    <TriStepBtn dir="left" disabled={d.points <= 1} label="点数减一" onClick={() => patch({ points: d.points - 1 })} />
                    <span className="w-8 text-center text-[22px] font-black italic" style={ink}>{d.points}</span>
                    <TriStepBtn dir="right" disabled={d.points >= 5} label="点数加一" onClick={() => patch({ points: d.points + 1 })} />
                  </>
                ) : (
                  <>
                    <button type="button" className={stepBtnCls} disabled={d.points <= 1}
                      onClick={() => patch({ points: d.points - 1 })} aria-label="点数减一">−</button>
                    <span className="w-6 text-center text-sm font-black">{d.points}</span>
                    <button type="button" className={stepBtnCls} disabled={d.points >= 5}
                      onClick={() => patch({ points: d.points + 1 })} aria-label="点数加一">＋</button>
                  </>
                )}
              </div>
            </div>
            <div>
              <div className={labelCls} style={ink}>频率</div>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => patch({ repeatDaily: false })} className={chipCls(!d.repeatDaily)} style={bright && d.repeatDaily ? ink : undefined}>单次</button>
                <button type="button" onClick={() => patch({ repeatDaily: true })} className={chipCls(d.repeatDaily)} style={bright && !d.repeatDaily ? ink : undefined}>每日</button>
              </div>
            </div>
          </div>
        </>
      )}

      {d.kind === 'ledger' && (
        <>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => patch({ direction: 'expense' })} className={chipCls(d.direction === 'expense')} style={bright && d.direction !== 'expense' ? ink : undefined}>支出</button>
            <button type="button" onClick={() => patch({ direction: 'income' })} className={chipCls(d.direction === 'income')} style={bright && d.direction !== 'income' ? ink : undefined}>收入</button>
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
              style={inputStyle}
            />
          </div>
          {d.direction === 'expense' ? (
            <div>
              <div className={labelCls} style={ink}>类目</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_KEYS.map((t) => (
                  <button key={t} type="button" onClick={() => patch({ type: t })} className={chipCls(d.type === t)} style={bright && d.type !== t ? ink : undefined}>
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
                  <button key={t} type="button" onClick={() => patch({ incomeType: t })} className={chipCls(d.incomeType === t)} style={bright && d.incomeType !== t ? ink : undefined}>
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
              style={inputStyle}
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
                style={inputStyle}
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
            className={`relative w-full max-w-md overflow-hidden ${panelCls}`}
            style={bright ? { clipPath: 'polygon(0 2%, 100% 0, 99% 100%, 0 98%)' } : { borderRadius: '1.25rem' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* LOG/TODO/NOTE 竖排幽灵字（整行横排词顺时针 90°，沿左缘——定稿口径） */}
            {bright && (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[-14px] flex w-[72px] select-none items-center justify-center overflow-hidden">
                <span className="whitespace-nowrap font-black italic leading-none" style={{ fontFamily: 'Arial, sans-serif', fontSize: '4.8rem', color: 'rgba(53,209,232,0.22)', transform: 'rotate(90deg)' }}>
                  {FORM_GHOST[d.kind]}
                </span>
              </div>
            )}

            {bright ? (
              <header className="relative flex items-center gap-2.5 px-5 pt-5">
                <span aria-hidden className="h-[24px] w-[9px] shrink-0" style={{ background: '#35d1e8', transform: 'skewX(-18deg)' }} />
                <h2 className="flex-1 text-[26px] font-black italic leading-none" style={{ color: P3R.ink, fontFamily: '"Arial Black", "Noto Sans SC", sans-serif' }}>
                  {ACTION_META[d.kind].label}
                </h2>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={onClose}
                  className="flex h-9 w-12 shrink-0 items-center justify-center text-lg font-black text-white"
                  style={{ background: '#35d1e8', clipPath: slantClip(10) }}
                >
                  ✕
                </button>
              </header>
            ) : (
              <header className="flex items-center gap-2 px-5 pt-4">
                <span aria-hidden>{ACTION_META[d.kind].icon}</span>
                <h2 className="flex-1 text-base font-black">{ACTION_META[d.kind].label}</h2>
                <button
                  type="button"
                  aria-label="关闭"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center text-lg font-black text-gray-400"
                >
                  ✕
                </button>
              </header>
            )}
            <div className={`relative max-h-[62vh] overflow-y-auto py-4 ${bright ? 'pl-8 pr-5' : 'px-5'}`}>{body}</div>
            <footer className={`relative flex gap-2.5 pb-5 ${bright ? 'pl-8 pr-5' : 'px-5'}`}>
              {bright ? (
                <>
                  <SlantButton
                    tone="primary"
                    magentaCorner
                    disabled={!draftReady(d)}
                    className="min-h-12 flex-1 text-[17px]"
                    onClick={() => { onSubmit(d); }}
                  >
                    写好了
                  </SlantButton>
                  <button
                    type="button"
                    onClick={onClose}
                    className="relative min-h-12 bg-white px-6 text-[15px] font-black"
                    style={{ color: P3R.ink, clipPath: slantClip(10), boxShadow: '0 8px 20px rgba(7,40,120,.12)' }}
                  >
                    取消
                    <span aria-hidden className="absolute bottom-0 right-1 h-[8px] w-[14px]" style={{ background: '#35d1e8', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!draftReady(d)}
                    onClick={() => { onSubmit(d); }}
                    className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-40"
                  >
                    写好了
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-bold text-gray-300"
                  >
                    取消
                  </button>
                </>
              )}
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
