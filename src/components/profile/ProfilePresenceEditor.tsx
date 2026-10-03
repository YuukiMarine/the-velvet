/**
 * 用户资料卡里的「状态 · 目标」（v2.7.0.6 第 6 项）。平时只是两样小东西，点了才展开编辑：
 *
 *   PresencePills    LV 旁边：状态小胶囊（没设是虚线「＋状态」）
 *   PresenceGoalBar  头部下面一条 GOAL 进度条（纯色，只标百分比）；没挂目标时是一行虚线入口
 *   PresencePanels   展开的编辑面板：状态预设网格（24 小时后自动消失）/ 挑一张宣告卡 + 对外显示为
 *
 * 目标只能挂宣告卡；「对外显示为」是挂着卡时才能写的那一句（别人眼里你的目标叫什么），过一道屏蔽词。
 * 改完立刻推一次云端（只推这两样）。三块共享「哪个面板开着」，由 PresenceEditorProvider 包住。
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from '@/store';
import { STATUS_PRESETS, liveStatus, statusAgeText } from '@/constants/profileStatus';
import { PROFILE_GOAL_MAX, buildGoalSnapshot, goalPercent, goalSnapshotIssue } from '@/utils/profilePresence';
import { auditText } from '@/utils/textAudit';

type Panel = 'status' | 'goal' | null;
const Ctx = createContext<{ panel: Panel; setPanel: (p: Panel) => void }>({ panel: null, setPanel: () => {} });

export function PresenceEditorProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<Panel>(null);
  return <Ctx.Provider value={{ panel, setPanel }}>{children}</Ctx.Provider>;
}

const pushPresence = () => {
  void import('@/services/sync').then(({ pushProfilePresence }) => pushProfilePresence()).catch(() => { /* 未登录 / 离线：下次同步再推 */ });
};

/** 自己的目标快照（跟着宣告卡、待办完成记录刷新） */
function useMyGoal() {
  const profileGoal = useAppStore(s => s.settings.profileGoal);
  const callingCards = useAppStore(s => s.callingCards);
  const todos = useAppStore(s => s.todos);
  const completions = useAppStore(s => s.todoCompletions);
  return useMemo(
    () => (profileGoal ? buildGoalSnapshot(useAppStore.getState()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileGoal, callingCards, todos, completions],
  );
}

const pillBase = 'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-bold leading-none transition-colors';
const ghost = 'inline-flex items-center rounded-full border border-dashed border-gray-400/50 dark:border-white/25 px-1.5 py-[3px] text-[11px] font-bold leading-none text-gray-500 dark:text-gray-400 transition-colors hover:bg-white/40 dark:hover:bg-white/10';

export function PresencePills() {
  const { panel, setPanel } = useContext(Ctx);
  const profileStatus = useAppStore(s => s.settings.profileStatus);
  const preset = liveStatus(profileStatus);
  const toggle = (p: Exclude<Panel, null>) => setPanel(panel === p ? null : p);
  return (
    <>
      {preset ? (
        <button
          type="button"
          onClick={() => toggle('status')}
          aria-expanded={panel === 'status'}
          className={`${pillBase} bg-primary/10 text-primary hover:bg-primary/20`}
          title="改状态"
        >
          <span aria-hidden>{preset.emoji}</span>
          <span className="truncate">{preset.label}</span>
        </button>
      ) : (
        <button type="button" onClick={() => toggle('status')} aria-expanded={panel === 'status'} className={ghost}>＋状态</button>
      )}
    </>
  );
}

export function PresenceGoalBar() {
  const { panel, setPanel } = useContext(Ctx);
  const profileGoal = useAppStore(s => s.settings.profileGoal);
  const goal = useMyGoal();
  const open = () => setPanel(panel === 'goal' ? null : 'goal');
  if (!profileGoal) {
    return (
      <button
        type="button"
        onClick={open}
        aria-expanded={panel === 'goal'}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-gray-400/40 dark:border-white/20 py-1.5 text-[11px] font-bold text-gray-500 dark:text-gray-400 transition-colors hover:bg-white/30 dark:hover:bg-white/5"
      >
        ＋ 挂一张宣告卡作为目标
      </button>
    );
  }
  if (!goal) {
    // 两种算不出来：卡不在本机 / 文字过不了屏蔽词（后者不静默下架，云端留着上次那句，这里提示改）
    const issue = goalSnapshotIssue(useAppStore.getState());
    return (
      <button type="button" onClick={open} className={`mt-3 w-full rounded-xl px-2 py-1.5 text-left text-[11px] hover:bg-white/30 dark:hover:bg-white/5 ${issue === 'audit' ? 'font-semibold text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>
        {issue === 'audit' ? '目标的文字需要稍微调整下措辞 · 点这里改' : '挂着的宣告卡不在这台设备上 · 点这里重新挑'}
      </button>
    );
  }
  const pct = goalPercent(goal);
  return (
    <button
      type="button"
      onClick={open}
      aria-expanded={panel === 'goal'}
      aria-label={`目标进度 ${pct}%，点开修改`}
      className="mt-3 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/30 dark:hover:bg-white/5"
    >
      <span className="shrink-0 text-[10px] font-black tracking-[0.2em] text-primary">GOAL</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-primary/15">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 24 }}
        />
      </span>
      <span className="shrink-0 text-[11px] font-black tabular-nums text-primary">{pct}%</span>
    </button>
  );
}

export function PresencePanels() {
  const { panel, setPanel } = useContext(Ctx);
  const settings = useAppStore(s => s.settings);
  const updateSettings = useAppStore(s => s.updateSettings);
  const callingCards = useAppStore(s => s.callingCards);
  const preset = liveStatus(settings.profileStatus);

  const activeCards = useMemo(
    () => callingCards.filter(c => !c.archived).sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [callingCards],
  );
  const [cardId, setCardId] = useState('');
  const [alias, setAlias] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (panel !== 'goal') return;
    const cur = settings.profileGoal;
    setCardId(cur && activeCards.some(c => c.id === cur.cardId) ? cur.cardId : (activeCards[0]?.id ?? ''));
    setAlias(cur?.alias ?? '');
    setError('');
    // 只在面板打开的那一刻取当前值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const setStatus = async (id: string | null) => {
    await updateSettings({ profileStatus: id ? { id, at: new Date().toISOString() } : undefined });
    setPanel(null);
    pushPresence();
  };

  const selected = activeCards.find(c => c.id === cardId);
  const saveGoal = async () => {
    if (!selected) { setError('先挑一张宣告卡'); return; }
    const a = alias.trim().slice(0, PROFILE_GOAL_MAX);
    // 别人看到的是哪几句，就查哪几句
    const shown = a ? [a] : [selected.title, selected.subtitle ?? ''];
    const bad = shown.map(auditText).find(r => !r.ok);
    if (bad && !bad.ok) { setError(a ? bad.reason : `${bad.reason}（这是宣告卡上的文字——可以在下面写一个对外的说法）`); return; }
    await updateSettings({ profileGoal: { kind: 'card', cardId: selected.id, ...(a ? { alias: a } : {}) } });
    setPanel(null);
    pushPresence();
  };
  const clearGoal = async () => {
    await updateSettings({ profileGoal: undefined });
    setPanel(null);
    pushPresence();
  };

  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
    on ? 'bg-primary text-white' : 'bg-white/70 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/15'
  }`;
  const small = 'rounded-full px-3 py-1 text-[11px] font-bold';

  return (
    <AnimatePresence initial={false} mode="wait">
      {panel && (
        <motion.div
          key={panel}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden"
        >
          <div className="mt-2 rounded-2xl border border-white/50 dark:border-white/10 bg-white/55 dark:bg-white/[0.06] p-3">
            {panel === 'status' ? (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[10px] font-black tracking-[0.25em] text-gray-400 dark:text-gray-500">STATUS</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {preset && settings.profileStatus ? `设于${statusAgeText(settings.profileStatus)} · ` : ''}24 小时后自动消失
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_PRESETS.map(p => (
                    <button key={p.id} type="button" onClick={() => void setStatus(p.id)} aria-pressed={preset?.id === p.id} className={chip(preset?.id === p.id)}>
                      <span aria-hidden className="mr-1">{p.emoji}</span>{p.label}
                    </button>
                  ))}
                </div>
                {preset && (
                  <div className="mt-2.5 flex justify-end">
                    <button type="button" onClick={() => void setStatus(null)} className={`${small} text-rose-500 hover:bg-rose-500/10`}>清除状态</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[10px] font-black tracking-[0.25em] text-gray-400 dark:text-gray-500">GOAL</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">挂一张宣告卡，进度跟着它走</span>
                </div>
                {activeCards.length ? (
                  <>
                    <div className="space-y-1">
                      {activeCards.map(c => {
                        const on = cardId === c.id;
                        const prog = useAppStore.getState().getCallingCardProgress(c.id);
                        const pct = prog ? Math.round(Math.max(0, Math.min(1, prog.overallProgress)) * 100) : 0;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setCardId(c.id); setError(''); }}
                            aria-pressed={on}
                            className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors ${
                              on ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10'
                            }`}
                          >
                            <span aria-hidden>{c.icon || '✦'}</span>
                            <span className="min-w-0 flex-1 truncate font-bold text-gray-800 dark:text-white">{c.title}</span>
                            <span className="shrink-0 text-[10px] font-bold tabular-nums text-gray-400">{pct}%</span>
                          </button>
                        );
                      })}
                    </div>
                    <label className="mt-2.5 block">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">对外显示为（可选：别人眼里你的目标叫什么）</span>
                      <input
                        value={alias}
                        maxLength={PROFILE_GOAL_MAX}
                        onChange={e => { setAlias(e.target.value); setError(''); }}
                        placeholder={selected?.title || '不写就用宣告卡的标题'}
                        className="mt-1 w-full rounded-xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-gray-900/60 px-2.5 py-2 text-sm text-gray-900 dark:text-white outline-none focus:bg-white dark:focus:bg-gray-900/80"
                      />
                    </label>
                  </>
                ) : (
                  <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">还没有进行中的宣告卡——先去首页立一张，再回来把它挂上名片。</p>
                )}
                {error && <p className="mt-2 text-[11px] font-semibold text-rose-500">{error}</p>}
                <div className="mt-2.5 flex items-center justify-end gap-1.5">
                  {settings.profileGoal && (
                    <button type="button" onClick={() => void clearGoal()} className={`${small} mr-auto text-rose-500 hover:bg-rose-500/10`}>取下目标</button>
                  )}
                  <button type="button" onClick={() => setPanel(null)} className={`${small} bg-white/70 dark:bg-white/10 text-gray-600 dark:text-gray-300`}>取消</button>
                  {activeCards.length > 0 && (
                    <button type="button" onClick={() => void saveGoal()} className={`${small} bg-primary text-white`}>挂上名片</button>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
