/**
 * NavigatorNotebook — 记事本弹窗（体验优化④）。
 *
 * 两层记忆的可视面：
 *   · 顶部「TA 眼里的你」= AI 维护的用户画像总览（ChatGPT Memory 式：常驻注入、
 *     compact 增量更新、此处可随时手改——改完立即生效，下次 compact 以手改版为基准）。
 *   · 下方原子记忆列表：查看/编辑/删除/置顶（置顶=importance 拉满+免疫遗忘）。
 * 入口：设置→黑猫区按钮 + 对话窗头像菜单。所有内容 local-only。
 */
import { useEffect, useState } from 'react';
import { db } from '@/db';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { findDuplicateMemos, getProfileBlocks, listBits, mergeMemos, PROFILE_KEYS, PROFILE_LABELS, PROFILE_LIMITS, saveProfileBlocks, undoProfile, type MergeProposal } from '@/utils/navigatorMemory';
import { deletePromise, isPromise, listPromises, promisePhase, updatePromiseDate, type PromiseMemo } from '@/utils/navigatorPromise';
import { dayLabelCN } from '@/utils/navigatorClock';
import { toLocalDateKey, useAppStore } from '@/store';
import { useNavigatorStore } from '@/store/navigator';
import { mergedNavigatorPresets } from '@/constants/navigatorPresets';
import { PresetAvatar } from './PresetAvatar';
import { useUiChannel } from '@/ui/useUiChannel';
import type { NavigatorMemo, NavigatorPreset, ProfileBlocks } from '@/types';

/** 约定此刻的状态写法（记事本「约好的事」） */
function promiseStatusLabel(m: PromiseMemo): string {
  const state = m.promiseState ?? 'waiting';
  if (state === 'asked') return '问过了';
  if (state === 'resolved') return '你说过结果了';
  if (state === 'expired') return '没来得及问';
  const phase = promisePhase(m);
  return phase === 'today' ? '就是今天' : phase === 'due' ? '该问了' : phase === 'late' ? '没来得及问' : '还没到';
}
const WHEN_TEXT: Record<string, string> = { morning: '上午', day: '', evening: '晚上' };

export const NavigatorNotebook = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const p3 = useUiChannel() === 'p3';
  // 画像分五块（第 26 批 · B3）：各有上限，有上一版就能撤回
  const [profile, setProfile] = useState<ProfileBlocks>({});
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileHasPrev, setProfileHasPrev] = useState(false);
  const [memos, setMemos] = useState<NavigatorMemo[]>([]);
  // 已作废的（被新事实替代 / 用户让忘掉 / 合并掉的）：默认收着
  const [archived, setArchived] = useState<NavigatorMemo[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  // 你们之间的说法（第 26 批 · §24.11）：跟人格走
  const [bits, setBits] = useState<NavigatorMemo[]>([]);
  // 整理：近似重复的提议
  const [merges, setMerges] = useState<MergeProposal[] | null>(null);
  const [memoEdit, setMemoEdit] = useState<{ id: string; text: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // 第二批「回访约定」：静默记下的带日子的事，只在这里看得见（能改日子、能删）
  const [promises, setPromises] = useState<PromiseMemo[]>([]);
  const [dateEdit, setDateEdit] = useState<{ id: string; date: string } | null>(null);
  const [deletePromiseId, setDeletePromiseId] = useState<string | null>(null);
  // 记忆隔离（第 23 批）：开着时按人格翻看——scope = 人格 id，'' = 只看共享的；默认落在当前人格
  const isolated = useAppStore((s) => !!s.settings.navigatorMemoryIsolated);
  const nav = useNavigatorStore();
  const personas: NavigatorPreset[] = mergedNavigatorPresets(nav.presets);
  const [scope, setScope] = useState<string>('');
  useEffect(() => { if (isOpen) setScope(isolated ? nav.activePreset().id : ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isOpen, isolated]);
  // 人格多了条子会横向滚：打开时把当前那枚滚到看得见的地方（蓝频道右边还让给了「保存画像」，更容易藏在外面）
  useEffect(() => {
    if (!isOpen || !isolated) return;
    const t = window.setTimeout(() => {
      const bar = document.querySelector<HTMLElement>('[data-testid=memory-scope]');
      const chip = bar?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (bar && chip) bar.scrollLeft = Math.max(0, chip.offsetLeft - 12);
    }, 350);
    return () => window.clearTimeout(t);
  }, [isOpen, isolated, scope]);
  const inScope = (m: Pick<NavigatorMemo, 'presetId'>): boolean => !isolated || (scope ? (!m.presetId || m.presetId === scope) : !m.presetId);
  const scopeId = isolated && scope ? scope : undefined;
  const personaName = (id?: string): string => (id ? personas.find((p) => p.id === id)?.name ?? '（已删的人格）' : '共享');

  const load = async () => {
    setProfile(await getProfileBlocks(scopeId));
    setProfileDirty(false);
    try {
      const pid = isolated && scope ? `navigator-user-profile:${scope}` : 'navigator-user-profile';
      const row = await db.navigatorMemos.get(pid);
      setProfileHasPrev(!!row?.profilePrev);
    } catch { setProfileHasPrev(false); }
    const rows = await db.navigatorMemos.orderBy('createdAt').reverse().toArray();
    setMemos(rows.filter((m) => m.status === 'active' && m.source !== 'profile' && m.source !== 'bit' && !isPromise(m) && inScope(m)));
    setArchived(rows.filter((m) => m.status === 'archived' && !!m.invalidAt && m.source !== 'profile' && m.source !== 'bit' && !isPromise(m) && inScope(m)).slice(0, 30));
    const bitOwner = isolated && scope ? scope : nav.activePreset().id;
    setBits(await listBits(bitOwner));
    const all = (await listPromises()).filter(inScope);
    // 还在等着的在前（按日子）；关了的只留最近 5 条
    const open = all.filter((m) => (m.promiseState ?? 'waiting') === 'waiting');
    const closed = all.filter((m) => (m.promiseState ?? 'waiting') !== 'waiting')
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate)).slice(0, 5);
    setPromises([...open, ...closed]);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isOpen) void load(); }, [isOpen, scope, isolated]);

  const commitProfile = async () => {
    if (!profileDirty) return;
    await saveProfileBlocks(profile, scopeId);
    setProfileDirty(false);
    await load();
  };
  // 停手 1 秒就存（手机上点别处不一定触发 blur；关掉弹窗时也会存一次）
  useEffect(() => {
    if (!profileDirty) return;
    const t = window.setTimeout(() => { void commitProfile(); }, 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileDirty]);
  const revertProfile = async () => {
    if (await undoProfile(scopeId)) await load();
  };
  const setBlock = (k: keyof ProfileBlocks, v: string) => { setProfile((p) => ({ ...p, [k]: v })); setProfileDirty(true); };
  const runTidy = async () => { setMerges(await findDuplicateMemos(scopeId)); };
  const applyTidy = async () => {
    for (const m of merges ?? []) await mergeMemos(m.keep.id, m.drop.id);
    setMerges(null);
    await load();
  };
  const dropBit = async (id: string) => { await db.navigatorMemos.update(id, { status: 'archived', invalidAt: new Date() }); await load(); };
  const restoreMemo = async (id: string) => { await db.navigatorMemos.update(id, { status: 'active', invalidAt: undefined, supersededBy: undefined, muted: false }); await load(); };
  /** 把一条记忆 / 约定挪给别的人格，或设为共享（'' = 共享） */
  const moveTo = async (id: string, to: string) => {
    await db.navigatorMemos.update(id, { presetId: to || undefined });
    await load();
  };
  const OwnerSelect = ({ m }: { m: NavigatorMemo }) => isolated ? (
    <select
      value={m.presetId ?? ''}
      onChange={(e) => void moveTo(m.id, e.target.value)}
      aria-label="这条归谁"
      className={`shrink-0 max-w-[6.5em] rounded border bg-transparent px-1 py-0.5 text-[10px] ${p3 ? 'border-[#9cc3e6] text-[#4b8fd9]' : 'border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400'}`}
    >
      <option value="">共享</option>
      {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  ) : null;

  const togglePin = async (m: NavigatorMemo) => {
    await db.navigatorMemos.update(m.id, { pinned: !m.pinned, importance: !m.pinned ? 5 : m.importance });
    await load();
  };
  const saveMemoEdit = async () => {
    if (!memoEdit) return;
    const text = memoEdit.text.trim();
    if (text) await db.navigatorMemos.update(memoEdit.id, { text: text.slice(0, 80) });
    setMemoEdit(null);
    await load();
  };
  const confirmDelete = async () => {
    if (deleteId) { await db.navigatorMemos.delete(deleteId); await load(); }
    setDeleteId(null);
  };
  const saveDateEdit = async () => {
    if (!dateEdit) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateEdit.date)) await updatePromiseDate(dateEdit.id, dateEdit.date);
    setDateEdit(null);
    await load();
  };
  const confirmDeletePromise = async () => {
    if (deletePromiseId) { await deletePromise(deletePromiseId); await load(); }
    setDeletePromiseId(null);
  };
  const today = toLocalDateKey();

  return (
    <>
      <SheetModal isOpen={isOpen} onClose={() => { void commitProfile(); onClose(); }} position="bottom" title="记事本">
        <div className="relative pb-2">
          {isolated && (
            // 记忆隔离开着：按人格翻看（第 23 批）
            // 蓝频道右上角有绝对定位的「保存画像」白斜片：条子本身收窄（margin，不是 padding），不从它底下穿过去
            <div className={`mb-3 flex gap-1.5 overflow-x-auto pb-1 ${p3 ? 'mr-[96px]' : ''}`} data-testid="memory-scope">
              {[{ id: '', name: '共享', avatar: undefined as string | undefined }, ...personas].map((p) => {
                const on = scope === p.id;
                return (
                  <button
                    key={p.id || '__shared'}
                    type="button"
                    onClick={() => setScope(p.id)}
                    aria-pressed={on}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold transition ${
                      on
                        ? (p3 ? 'border-[#1b57ff] bg-[#1b57ff] text-white' : 'border-primary bg-primary text-white')
                        : (p3 ? 'border-[#9cc3e6] bg-white text-[#0a1230]' : 'border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300')
                    }`}
                  >
                    {p.id ? <PresetAvatar avatar={p.avatar} className="h-4 w-4" /> : <span aria-hidden>∞</span>}
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          {p3 && (
            <>
              {/* MEMORY 竖排幽灵字（整行横排词顺时针 90°，沿左缘自上而下——定稿口径） */}
              <div aria-hidden className="pointer-events-none absolute -left-10 top-8 flex h-[430px] w-[74px] select-none items-center justify-center overflow-hidden">
                <span className="whitespace-nowrap font-black italic leading-none" style={{ fontFamily: 'Arial, sans-serif', fontSize: '4.4rem', color: 'rgba(53,209,232,0.26)', transform: 'rotate(90deg)' }}>
                  MEMORY
                </span>
              </div>
              {/* 保存画像 白斜片（内容区右上，与首行标签同行——p3-modal-13 稿的标题行右钮位） */}
              <button
                type="button"
                onClick={() => void commitProfile()}
                className={`absolute -top-1 right-0 z-10 bg-white px-4 py-1.5 text-[13px] font-black transition ${profileDirty ? '' : 'opacity-60'}`}
                style={{ color: 'var(--p3r-blue, #1b57ff)', clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', boxShadow: '0 8px 20px rgba(7,40,120,.14)' }}
              >
                保存画像
                <span aria-hidden className="absolute bottom-0 right-1 h-[8px] w-[12px]" style={{ background: 'var(--p3r-cyan, #35d1e8)', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
              </button>
            </>
          )}

          {/* 画像总览 */}
          <div className="relative">
            <div className={`mb-1.5 flex items-center justify-between ${p3 ? 'pr-[96px]' : ''}`}>
              <span className={p3 ? 'text-[13px] font-black' : 'text-xs font-bold text-gray-500 dark:text-gray-400'} style={p3 ? { color: 'var(--p3r-ink, #0a1230)' } : undefined}>
                TA 眼里的你（长期画像，可直接修改）
              </span>
              {!p3 && profileDirty && (
                <button type="button" onClick={() => void commitProfile()} className="text-xs font-bold text-primary">保存</button>
              )}
            </div>
            <div className="space-y-2" data-profile-blocks>
              {PROFILE_KEYS.map((k) => (
                <label key={k} className="block">
                  <span className={p3 ? 'mb-0.5 block text-[11px] font-black' : 'mb-0.5 block text-[10px] font-bold text-gray-400 dark:text-gray-500'} style={p3 ? { color: '#4b8fd9' } : undefined}>
                    {PROFILE_LABELS[k]}{k === 'rules' ? '（他希望你怎么对他）' : ''} <span className="opacity-60">{(profile[k] ?? '').length}/{PROFILE_LIMITS[k]}</span>
                  </span>
                  <textarea
                    value={profile[k] ?? ''}
                    onChange={(e) => setBlock(k, e.target.value.slice(0, PROFILE_LIMITS[k]))}
                    onBlur={() => void commitProfile()}
                    aria-label={`画像 · ${PROFILE_LABELS[k]}`}
                    placeholder={k === 'identity' ? '它对你的整体印象：身份、处境…（也可以你直接写）' : k === 'goals' ? '长期在追的事' : k === 'preferences' ? '喜欢什么、受不了什么' : k === 'recent' ? '最近这阵子的状态' : '例：我说累的时候别催我'}
                    rows={k === 'identity' ? 3 : 2}
                    className={p3
                      ? 'w-full resize-none px-4 py-2.5 text-sm font-semibold leading-relaxed outline-none'
                      : 'w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white'}
                    style={p3 ? { background: '#dbeff8', color: 'var(--p3r-ink, #0a1230)', clipPath: 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' } : undefined}
                  />
                </label>
              ))}
              {profileHasPrev && (
                <button type="button" onClick={() => void revertProfile()} aria-label="撤回到上一版画像" className={`text-xs font-bold ${p3 ? 'text-[#4b8fd9]' : 'text-primary'}`}>
                  撤回到上一版
                </button>
              )}
            </div>
            <p className={p3 ? 'mt-1.5 text-[11px] font-bold leading-relaxed' : 'mt-1 text-[10px] text-gray-400 dark:text-gray-500'} style={p3 ? { color: '#4b8fd9' } : undefined}>
              每次对话都会带上这段画像；它整理对话时只改有变化的那一块，你的手改优先，改坏了能撤回上一版。{isolated && (scope ? `这是「${personaName(scope)}」自己的画像；它还没写过时会先读共享的那份。` : '这是共享的画像，各人格都读得到。')}
            </p>
          </div>

          {/* 约好的事（回访约定） */}
          <div className={p3 ? 'mt-5 text-[13px] font-black' : 'mt-4 text-xs font-bold text-gray-500 dark:text-gray-400'} style={p3 ? { color: 'var(--p3r-ink, #0a1230)' } : undefined}>
            约好的事（过后问你一句结果，只问一次）
          </div>
          {promises.length === 0 ? (
            <p
              className={p3 ? 'mt-2 px-5 py-4 text-center text-[12px] font-bold leading-relaxed' : 'mt-2 rounded-xl border border-dashed border-gray-300 px-4 py-4 text-center text-xs text-gray-400 dark:border-gray-600'}
              style={p3 ? { background: '#dbeff8', color: '#4b8fd9', clipPath: 'polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' } : undefined}
            >
              还没有——聊天时说到带日子的事（面试、考试、体检……），它会记下，过后问你一句结果。
            </p>
          ) : (
            <div className="mt-2 space-y-2" data-promise-list>
              {promises.map((m) => {
                const open = (m.promiseState ?? 'waiting') === 'waiting';
                return (
                  <div
                    key={m.id}
                    data-promise={m.promiseTopic}
                    className={p3 ? 'bg-white px-3.5 py-2.5' : 'rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700'}
                    style={p3 ? { clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', boxShadow: '0 6px 16px rgba(7,40,120,.10)', opacity: open ? 1 : 0.6 } : { opacity: open ? 1 : 0.6 }}
                  >
                    {dateEdit?.id === m.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          autoFocus
                          value={dateEdit.date}
                          min={today}
                          onChange={(e) => setDateEdit({ id: m.id, date: e.target.value })}
                          aria-label={`「${m.promiseTopic}」改到哪天`}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                        />
                        <button type="button" onClick={() => void saveDateEdit()} className="shrink-0 text-xs font-bold text-primary">存</button>
                        <button type="button" onClick={() => setDateEdit(null)} className="shrink-0 text-xs text-gray-400">取消</button>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className={p3 ? 'text-sm font-semibold leading-relaxed' : 'text-sm leading-relaxed text-gray-700 dark:text-gray-200'} style={p3 ? { color: 'var(--p3r-ink, #0a1230)' } : undefined}>
                            {m.promiseTopic}
                          </p>
                          <p className={p3 ? 'mt-0.5 text-[10px] font-bold' : 'mt-0.5 text-[10px] text-gray-400 dark:text-gray-500'} style={p3 ? { color: '#6a7ba3' } : undefined}>
                            {dayLabelCN(m.dueDate, today)}{WHEN_TEXT[m.dueWhen ?? 'day']} · {promiseStatusLabel(m)}
                          </p>
                        </div>
                        <OwnerSelect m={m} />
                        {open && (
                          <button type="button" onClick={() => setDateEdit({ id: m.id, date: m.dueDate })} aria-label={`改「${m.promiseTopic}」的日子`}
                            className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-primary">改日子</button>
                        )}
                        <button type="button" onClick={() => setDeletePromiseId(m.id)} aria-label={`删掉约定「${m.promiseTopic}」`}
                          className={`shrink-0 rounded p-1 text-xs ${p3 ? 'text-gray-400 hover:text-[#f0417f]' : 'text-gray-400 hover:text-red-400'}`}>删</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 你们之间的说法（第 26 批） */}
          {bits.length > 0 && (
            <>
              <div className={p3 ? 'mt-5 text-[13px] font-black' : 'mt-4 text-xs font-bold text-gray-500 dark:text-gray-400'} style={p3 ? { color: 'var(--p3r-ink, #0a1230)' } : undefined}>
                你们之间的说法（它会偶尔用；不想再听到的就删）
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5" data-bits-list>
                {bits.map((b) => (
                  <span key={b.id} data-bit={b.text} className={`inline-flex max-w-full items-center gap-1 px-2.5 py-1 text-[12px] font-bold ${p3 ? 'bg-white' : 'rounded-full border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300'}`}
                    style={p3 ? { color: 'var(--p3r-ink, #0a1230)', clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)', boxShadow: '0 4px 12px rgba(7,40,120,.10)' } : undefined}
                    title={[b.bitMeaning, b.bitOrigin].filter(Boolean).join(' · ')}>
                    「{b.text}」{b.bitMeaning ? <span className="opacity-60">= {b.bitMeaning}</span> : null}
                    <button type="button" onClick={() => void dropBit(b.id)} aria-label={`这个梗别提了：${b.text}`} className="ml-0.5 opacity-50 hover:opacity-100">×</button>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* 原子记忆 */}
          <div className={`flex items-center justify-between ${p3 ? 'mt-5 text-[13px] font-black' : 'mt-4 text-xs font-bold text-gray-500 dark:text-gray-400'}`} style={p3 ? { color: 'var(--p3r-ink, #0a1230)' } : undefined}>
            <span>零散记忆（按相关性取用；置顶的永不遗忘）</span>
            {memos.length >= 2 && (
              <button type="button" onClick={() => void runTidy()} aria-label="整理重复的记忆" className={`text-xs font-bold ${p3 ? 'text-[#4b8fd9]' : 'text-primary'}`}>整理</button>
            )}
          </div>
          {memos.length === 0 ? (
            p3 ? (
              <div className="relative mt-2">
                <span aria-hidden className="absolute -top-1.5 left-0 z-10 h-0 w-0 border-r-[18px] border-t-[15px] border-r-transparent" style={{ borderTopColor: 'var(--p3r-magenta, #f0417f)' }} />
                <p className="px-5 py-7 text-center text-[13px] font-bold leading-relaxed" style={{ background: '#dbeff8', color: '#4b8fd9', clipPath: 'polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' }}>
                  还没有记忆——多聊几天，它会自己记住重要的事。
                </p>
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-xs text-gray-400 dark:border-gray-600">
                还没有记忆——多聊几天，它会自己记住重要的事。
              </p>
            )
          ) : (
            <div className="mt-2 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
              {memos.map((m) => (
                <div
                  key={m.id}
                  className={p3 ? 'bg-white px-3.5 py-2.5' : 'rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700'}
                  style={p3 ? { clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', boxShadow: '0 6px 16px rgba(7,40,120,.10)' } : undefined}
                >
                  {memoEdit?.id === m.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={memoEdit.text}
                        onChange={(e) => setMemoEdit({ id: m.id, text: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') void saveMemoEdit(); }}
                        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                      <button type="button" onClick={() => void saveMemoEdit()} className="shrink-0 text-xs font-bold text-primary">存</button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={p3 ? 'text-sm font-semibold leading-relaxed' : 'text-sm leading-relaxed text-gray-700 dark:text-gray-200'} style={p3 ? { color: 'var(--p3r-ink, #0a1230)' } : undefined}>
                          {m.pinned && <span className="mr-1 text-primary" aria-hidden>📌</span>}
                          {m.text}
                        </p>
                        <p className={p3 ? 'mt-0.5 text-[10px] font-bold' : 'mt-0.5 text-[10px] text-gray-400 dark:text-gray-500'} style={p3 ? { color: '#6a7ba3' } : undefined}>
                          {new Date(m.createdAt).toLocaleDateString()} · 重要度 {m.importance}{m.followUp ? ' · 有待追问话头' : ''}{isolated && scope && !m.presetId ? ' · 共享' : ''}
                        </p>
                      </div>
                      <OwnerSelect m={m} />
                      <button type="button" onClick={() => void togglePin(m)} aria-label={m.pinned ? '取消置顶' : '置顶'}
                        className={`shrink-0 rounded p-1 text-xs ${m.pinned ? 'text-primary' : 'text-gray-300 hover:text-primary dark:text-gray-600'}`}>📌</button>
                      <button type="button" onClick={() => setMemoEdit({ id: m.id, text: m.text })} aria-label="编辑记忆"
                        className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-primary">改</button>
                      <button type="button" onClick={() => setDeleteId(m.id)} aria-label="删除记忆"
                        className={`shrink-0 rounded p-1 text-xs ${p3 ? 'text-gray-400 hover:text-[#f0417f]' : 'text-gray-400 hover:text-red-400'}`}>删</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {archived.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className={`text-xs font-bold ${p3 ? 'text-[#4b8fd9]' : 'text-gray-400'}`}>
                已作废的（{archived.length}）{showArchived ? '▴' : '▾'}
              </button>
              {showArchived && (
                <div className="mt-2 space-y-1.5" data-archived-list>
                  {archived.map((m) => (
                    <div key={m.id} className={`flex items-start gap-2 text-[12px] leading-relaxed ${p3 ? 'text-[#6a7ba3]' : 'text-gray-400'}`}>
                      <span className="min-w-0 flex-1 line-through">{m.text}</span>
                      <span className="shrink-0 text-[10px]">{m.supersededBy ? '被新的替代' : m.muted ? '你让它忘的' : '作废'}</span>
                      <button type="button" onClick={() => void restoreMemo(m.id)} aria-label={`恢复记忆：${m.text}`} className="shrink-0 text-[11px] font-bold text-primary">恢复</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetModal>
      <ConfirmDialog
        isOpen={merges !== null}
        tone="warning"
        title={merges && merges.length ? `合并 ${merges.length} 组重复的记忆？` : '没有发现重复的记忆'}
        description={merges && merges.length ? merges.slice(0, 6).map((m) => `「${m.drop.text}」并入「${m.keep.text}」`).join('；') + (merges.length > 6 ? `；…等 ${merges.length} 组` : '') : '每条都不一样，不用整理。'}
        confirmText={merges && merges.length ? '合并' : '好'}
        cancelText="取消"
        onConfirm={() => void (merges && merges.length ? applyTidy() : Promise.resolve(setMerges(null)))}
        onCancel={() => setMerges(null)}
      />
      <ConfirmDialog
        isOpen={!!deleteId}
        tone="danger"
        title="删除这条记忆？"
        description="它会忘掉这件事。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        isOpen={!!deletePromiseId}
        tone="danger"
        title="删掉这个约定？"
        description="删掉之后它就不会再问你这件事了。"
        confirmText="删掉"
        cancelText="取消"
        onConfirm={() => void confirmDeletePromise()}
        onCancel={() => setDeletePromiseId(null)}
      />
    </>
  );
};
