/**
 * NavigatorNotebook — 记事本弹窗（体验优化④；第 33 批翻新成分页签）。
 *
 * 五个页签：
 *   · 画像：AI 维护的用户画像五块（常驻注入、归档时增量更新、这里随时手改——改完立即生效，下次整理以手改版为基准）。
 *     第 33 批起每块右上角标着最后是谁、哪天、按什么改的；能锁住（锁了 AI 不动）；顶上「现在整理一次」先给你看改了哪几块，确认才写。
 *   · 记忆：零散记忆卡片流（来源 / 重要度 / 线索词），搜索 + 筛选（置顶 / 有话头 / 已作废）；隔离开着时每条能多选归哪几位人格。
 *   · 约好的事：回访约定按日子排成时间线（改日子 / 删 / 归谁）。
 *   · 说法：「你们之间的说法」小签墙（跟人格走）。
 *   · 足迹：它替你做过的事（卡片确认过的操作，撤销过的标着）。
 * 皮肤用新版设置那套原语（四个频道各一套，夜间全走变量）。入口：设置 → 助手 + 对话窗头像菜单。所有内容只存本机。
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { db } from '@/db';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  findDuplicateMemos, getProfileState, listBits, memoOwners, mergeMemos, ownersPatch, PROFILE_KEYS, PROFILE_LABELS, PROFILE_LIMITS,
  saveProfileBlocks, setProfileLock, undoProfile, type MergeProposal,
} from '@/utils/navigatorMemory';
import { applyProfileProposal, proposeProfileRefresh, type ProfileProposal } from '@/utils/navigatorProfileRefresh';
import { briefingEnabled } from '@/utils/navigatorBriefing';
import { getAIConfig } from '@/utils/aiClient';
import { deletePromise, isPromise, listPromises, promisePhase, updatePromiseDate, type PromiseMemo } from '@/utils/navigatorPromise';
import { dayLabelCN, relativeDayCN } from '@/utils/navigatorClock';
import { listActions } from '@/utils/navigatorActions';
import { toLocalDateKey, useAppStore } from '@/store';
import { useNavigatorStore } from '@/store/navigator';
import { mergedNavigatorPresets } from '@/constants/navigatorPresets';
import { PresetAvatar } from './PresetAvatar';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, P5Rough, roughQuad } from '@/components/p5r/kit';
import { Btn, Glyph, Input, Note, Textarea, skinTokens, useSettingsSkin, type GlyphName, type SettingsSkin } from '@/pages/settings/kit';
import type { NavigatorActionRow, NavigatorMemo, NavigatorPreset, ProfileBlockMeta, ProfileBlocks } from '@/types';

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

type Tab = 'profile' | 'memos' | 'promises' | 'bits' | 'trail';
type MemoFilter = 'all' | 'pinned' | 'topic' | 'archived';

const BLOCK_GLYPH: Record<keyof ProfileBlocks, GlyphName> = { identity: 'mask', goals: 'wish', preferences: 'tag', recent: 'clock', rules: 'bubble' };
const BLOCK_HINT: Record<keyof ProfileBlocks, string> = {
  identity: '它对你的整体印象：身份、处境…（也可以你直接写）',
  goals: '长期在追的事',
  preferences: '喜欢什么、受不了什么',
  recent: '最近这阵子的状态',
  rules: '例：我说累的时候别催我',
};
const SOURCE_META: Record<string, { glyph: GlyphName; label: string }> = {
  chat: { glyph: 'bubble', label: '聊天里' },
  observation: { glyph: 'eye', label: '观察' },
  manual: { glyph: 'pen', label: '手记' },
  image: { glyph: 'image', label: '图片' },
};

/** 「10-26」：今年的只写月日 */
const shortDay = (day: string): string => {
  const [y, m, d] = day.split('-');
  return y && y !== String(new Date().getFullYear()) ? `${y.slice(2)}-${m}-${d}` : `${m}-${d}`;
};
const metaTagText = (meta: ProfileBlockMeta | undefined): string => {
  if (!meta) return '';
  if (meta.by === 'user') return `你改的 · ${shortDay(meta.day)}`;
  return `AI · ${shortDay(meta.day)}${meta.from === 'records' ? ' · 来自记录' : meta.from === 'chat' ? ' · 来自聊天' : ''}`;
};

// ── 皮肤小件（都在模块顶层：写在组件里每次渲染都是新组件，整列重挂） ──

/** 卡片底：P3 斜切面板 / P4 黑描边奶油 / P5 黑撕边纸上黑块 / 中性白卡 */
const Panel = ({ skin, seed, children, className, style, dim }: { skin: SettingsSkin; seed: number; children: ReactNode; className?: string; style?: CSSProperties; dim?: boolean }) => {
  const op = dim ? 0.72 : 1;
  if (skin === 'p5') {
    return (
      <div className={`relative px-3.5 py-3 ${className ?? ''}`} style={{ opacity: op, ...style }}>
        <P5Rough seed={seed} jag={4} frame={2.5} face={P5R.ink} frameColor={P5R.ink} shadow={{ x: 3, y: 3.5 }} shadowColor={P5R.red} />
        <div className="relative">{children}</div>
      </div>
    );
  }
  if (skin === 'p4') {
    return <div className={`relative px-3.5 py-3 ${className ?? ''}`} style={{ opacity: op, background: 'var(--ui-paper, #fff6d0)', borderRadius: 16, boxShadow: '0 0 0 2px #131313, 0 4px 0 rgba(19,19,19,0.18)', ...style }}>{children}</div>;
  }
  if (skin === 'p3') {
    return <div className={`relative px-4 py-3 ${className ?? ''}`} style={{ opacity: op, clipPath: slantClip(10), background: P3R.panel, boxShadow: '0 6px 16px rgba(7,40,120,.10)', ...style }}>{children}</div>;
  }
  return <div className={`relative rounded-2xl bg-white px-3.5 py-3 shadow-[0_8px_20px_rgba(27,87,255,0.07)] dark:bg-gray-800 ${className ?? ''}`} style={{ opacity: op, ...style }}>{children}</div>;
};

/** 卡片上的字色：P5 是黑块上的纸色字，其余跟频道 token */
const inkOf = (skin: SettingsSkin) => (skin === 'p5' ? { ink: P5R.white, sub: P5R.greyLight } : skinTokens(skin));

/** 方形小图标块（画像每块 / 记忆来源） */
const IconSquare = ({ skin, glyph, size = 30, seed = 0 }: { skin: SettingsSkin; glyph: GlyphName; size?: number; seed?: number }) => {
  const g = <Glyph name={glyph} size={Math.round(size * 0.56)} />;
  const box = { width: size, height: size };
  if (skin === 'p5') return <span aria-hidden className="flex shrink-0 items-center justify-center" style={{ ...box, background: P5R.red, color: P5R.white, clipPath: roughQuad(500 + seed, 3) }}>{g}</span>;
  if (skin === 'p4') return <span aria-hidden className="flex shrink-0 items-center justify-center rounded-[9px]" style={{ ...box, background: '#131313', color: 'var(--ui-bg, #ffd900)' }}>{g}</span>;
  if (skin === 'p3') return <span aria-hidden className="flex shrink-0 items-center justify-center text-white" style={{ ...box, background: P3R.blue, clipPath: slantClip(5) }}>{g}</span>;
  return <span aria-hidden className="flex shrink-0 items-center justify-center rounded-[9px] bg-primary/10 text-primary" style={box}>{g}</span>;
};

/** 页签条：五个一排、不换行 */
const TabBar = ({ skin, value, onChange, items }: { skin: SettingsSkin; value: Tab; onChange: (t: Tab) => void; items: Array<{ id: Tab; label: string; n?: number }> }) => {
  const t = skinTokens(skin);
  return (
    <div role="tablist" aria-label="记事本分页" className={`mb-3 flex ${skin === 'p4' ? 'gap-1 rounded-full p-1' : 'gap-1'}`}
      style={skin === 'p4' ? { background: 'rgba(19,19,19,0.08)', boxShadow: 'inset 0 0 0 2px #131313' } : undefined}>
      {items.map((it, i) => {
        const on = it.id === value;
        const label = (
          <span className="relative inline-flex items-baseline justify-center gap-0.5 whitespace-nowrap">
            {it.label}
            {it.n ? <span className="text-[9.5px] font-black">{it.n > 99 ? '99+' : it.n}</span> : null}
          </span>
        );
        const base = 'relative min-w-0 flex-1 px-1 py-2 text-[12.5px] font-black';
        const common = { type: 'button' as const, role: 'tab', 'aria-selected': on, 'data-notebook-tab': it.id, onClick: () => onChange(it.id) };
        if (skin === 'p5') {
          return (
            <button key={it.id} {...common} className={base} style={{ color: on ? P5R.white : P5R.ink, fontFamily: P5_TITLE_FONT }}>
              <P5Rough seed={880 + i * 5} jag={3} frame={2} face={on ? P5R.red : P5R.paper} shadow={on ? { x: 2, y: 2 } : null} />
              {label}
            </button>
          );
        }
        if (skin === 'p4') {
          return <button key={it.id} {...common} className={`${base} rounded-full`} style={{ background: on ? '#131313' : 'transparent', color: on ? 'var(--ui-bg, #ffd900)' : t.ink }}>{label}</button>;
        }
        if (skin === 'p3') {
          return <button key={it.id} {...common} className={base} style={{ clipPath: slantClip(7), background: on ? P3R.blue : t.chip, color: on ? '#fff' : t.ink }}>{label}</button>;
        }
        return <button key={it.id} {...common} className={`${base} rounded-xl ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>{label}</button>;
      })}
    </div>
  );
};

/** 小签（画像来历 / 有话头 / 线索词）：颜色跟卡片字色走 */
const Tag = ({ skin, children, tone = 'sub', className }: { skin: SettingsSkin; children: ReactNode; tone?: 'sub' | 'accent'; className?: string }) => {
  const k = inkOf(skin);
  const accent = skin === 'p5' ? P5R.red : skin === 'p4' ? '#131313' : skin === 'p3' ? P3R.blue : 'var(--color-primary, #1b57ff)';
  const style: CSSProperties = tone === 'accent'
    ? (skin === 'p5' ? { background: P5R.red, color: P5R.white } : skin === 'p4' ? { background: '#131313', color: 'var(--ui-bg, #ffd900)' } : { background: skin === 'p3' ? P3R.cyanFaint : 'rgba(27,87,255,0.1)', color: accent })
    : { color: k.sub, boxShadow: `inset 0 0 0 1px ${skin === 'p5' ? 'rgba(248,248,246,0.28)' : 'currentColor'}`, opacity: skin === 'p5' ? 1 : 0.85 };
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap px-1.5 py-[1px] text-[10px] font-black leading-[15px] ${skin === 'p3' ? '' : 'rounded-[5px]'} ${className ?? ''}`}
      style={{ ...style, ...(skin === 'p3' ? { clipPath: slantClip(3) } : {}) }}>
      {children}
    </span>
  );
};

/** 方形小图标按钮（锁 / 置顶 / ⋯） */
const IconBtn = ({ skin, glyph, label, pressed, onClick }: { skin: SettingsSkin; glyph: GlyphName; label: string; pressed?: boolean; onClick: () => void }) => {
  const k = inkOf(skin);
  const on = !!pressed;
  const accent = skin === 'p5' ? P5R.red : skin === 'p4' ? '#131313' : skin === 'p3' ? P3R.blue : 'var(--color-primary, #1b57ff)';
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} {...(pressed !== undefined ? { 'aria-pressed': on } : {})}
      className={`flex h-7 w-7 shrink-0 items-center justify-center ${skin === 'neutral' || skin === 'p4' ? 'rounded-lg' : ''}`}
      style={{ color: on ? (skin === 'p4' ? 'var(--ui-bg, #ffd900)' : skin === 'p5' ? P5R.white : '#fff') : k.sub, background: on ? accent : 'transparent', ...(skin === 'p3' && on ? { clipPath: slantClip(4) } : {}) }}>
      <Glyph name={glyph} size={15} />
    </button>
  );
};

/** 重要度：五格 */
const Importance = ({ skin, n }: { skin: SettingsSkin; n: number }) => {
  const k = inkOf(skin);
  const fill = skin === 'p5' ? P5R.red : skin === 'p4' ? 'var(--p4-orange, #f9a11b)' : skin === 'p3' ? P3R.cyan : 'var(--color-primary, #1b57ff)';
  return (
    <span aria-label={`重要度 ${n}`} className="inline-flex items-center gap-[2px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className="h-[7px] w-[5px]" style={{ background: i <= n ? fill : k.sub, opacity: i <= n ? 1 : 0.25, clipPath: skin === 'p3' || skin === 'p5' ? 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' : undefined, borderRadius: skin === 'neutral' || skin === 'p4' ? 2 : 0 }} />
      ))}
    </span>
  );
};

/**
 * 归谁（第 33 批 · 多选）：一排人格头像，点亮 = 这位读得到；全部点亮 = 共享；最后一位点不灭（要么留一位，要么设共享）。
 * 共享时全部亮着。onChange 给的是选中的人格 id（空 = 共享），由调用方折成 presetId / presetIds。
 */
const OwnerPicker = ({ skin, owners, personas, onChange }: { skin: SettingsSkin; owners: string[]; personas: NavigatorPreset[]; onChange: (ids: string[]) => void }) => {
  const k = inkOf(skin);
  const all = personas.map((p) => p.id);
  const mine = owners.filter((o) => all.includes(o));
  const shared = owners.length === 0 || all.every((id) => mine.includes(id));
  const toggle = (id: string) => {
    const cur = shared ? all : mine;
    if (cur.includes(id)) { if (cur.length > 1) onChange(cur.filter((x) => x !== id)); }
    else onChange([...cur, id]);
  };
  const ring = skin === 'p5' ? P5R.red : skin === 'p4' ? '#131313' : skin === 'p3' ? P3R.blue : 'var(--color-primary, #1b57ff)';
  return (
    <div role="group" aria-label="这条归谁" className="flex flex-wrap items-center gap-1" data-owner-picker>
      <span className="mr-0.5 text-[10px] font-black" style={{ color: k.sub }}>谁读得到</span>
      <button type="button" onClick={() => onChange([])} aria-pressed={shared} aria-label="设为共享" title="共享：所有人格都读得到"
        className="flex h-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-black"
        style={{ color: shared ? '#fff' : k.sub, background: shared ? ring : 'transparent', boxShadow: shared ? undefined : `inset 0 0 0 1.5px ${skin === 'p5' ? 'rgba(248,248,246,0.4)' : 'currentColor'}` }}>
        ∞ 共享
      </button>
      {personas.map((p) => {
        const lit = shared || mine.includes(p.id);
        return (
          <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={lit} aria-label={`${p.name}读得到`} title={p.name}
            className="flex h-[22px] w-[22px] items-center justify-center rounded-full"
            style={{ color: lit ? (skin === 'p5' ? P5R.ink : '#fff') : k.sub, background: lit ? (skin === 'p5' ? P5R.white : ring) : 'transparent', opacity: lit ? 1 : 0.55, boxShadow: lit ? undefined : `inset 0 0 0 1.5px ${skin === 'p5' ? 'rgba(248,248,246,0.4)' : 'currentColor'}` }}>
            <PresetAvatar avatar={p.avatar} className="h-[14px] w-[14px]" />
          </button>
        );
      })}
    </div>
  );
};

/** 「⋯」菜单：点开在卡片右上角展开一小列；点外面收起 */
const MoreMenu = ({ skin, open, onToggle, items }: { skin: SettingsSkin; open: boolean; onToggle: () => void; items: Array<{ label: string; onClick: () => void; danger?: boolean }> }) => {
  const t = skinTokens(skin);
  return (
    <div className="relative shrink-0">
      <IconBtn skin={skin} glyph="dots" label="更多操作" onClick={onToggle} />
      {open && (
        <>
          <button type="button" aria-label="收起菜单" className="fixed inset-0 z-10 cursor-default" onClick={onToggle} />
          <div role="menu" className={`absolute right-0 top-8 z-20 min-w-[7.5em] py-1 ${skin === 'p4' || skin === 'neutral' ? 'rounded-xl' : ''}`}
            style={skin === 'p5'
              ? { background: P5R.paper, boxShadow: `0 0 0 2px ${P5R.ink}, 3px 3px 0 ${P5R.red}` }
              : skin === 'p4'
                ? { background: 'var(--ui-paper, #fff6d0)', boxShadow: '0 0 0 2px #131313, 0 4px 0 rgba(19,19,19,0.2)' }
                : skin === 'p3'
                  ? { background: P3R.panel, boxShadow: '0 10px 24px rgba(7,40,120,.22)', clipPath: slantClip(6) }
                  : { background: 'var(--ui-paper, #ffffff)', boxShadow: '0 10px 24px rgba(0,0,0,.16)' }}>
            {items.map((it) => (
              <button key={it.label} type="button" role="menuitem" onClick={() => { onToggle(); it.onClick(); }}
                className="block w-full px-3.5 py-2 text-left text-[12.5px] font-black"
                style={{ color: it.danger ? (skin === 'p5' ? P5R.red : skin === 'p3' ? P3R.magenta : '#e11d48') : (skin === 'p5' ? P5R.ink : t.ink) }}>
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/** 页签里的小标题 + 说明 */
const Lead = ({ skin, children, action }: { skin: SettingsSkin; children: ReactNode; action?: ReactNode }) => {
  const t = skinTokens(skin);
  return (
    <div className="mb-2 flex items-center gap-2">
      <p className="min-w-0 flex-1 text-[11.5px] font-bold leading-snug" style={{ color: skin === 'p5' ? P5R.grey : t.sub }}>{children}</p>
      {action}
    </div>
  );
};

const Empty = ({ skin, children }: { skin: SettingsSkin; children: ReactNode }) => {
  const t = skinTokens(skin);
  if (skin === 'p3') return <p className="px-5 py-6 text-center text-[12.5px] font-bold leading-relaxed" style={{ background: P3R.cyanFaint, color: t.sub, clipPath: slantClip(14) }}>{children}</p>;
  if (skin === 'p5') return <p className="px-4 py-6 text-center text-[12.5px] font-bold leading-relaxed" style={{ color: P5R.grey, boxShadow: `inset 0 0 0 2px ${P5R.paperDim}` }}>{children}</p>;
  if (skin === 'p4') return <p className="rounded-2xl px-4 py-6 text-center text-[12.5px] font-bold leading-relaxed" style={{ color: t.ink, opacity: 0.7, boxShadow: 'inset 0 0 0 2px rgba(19,19,19,0.3)' }}>{children}</p>;
  return <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-400 dark:border-gray-600">{children}</p>;
};

export const NavigatorNotebook = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const skin = useSettingsSkin();
  const t = skinTokens(skin);
  const k = inkOf(skin);
  const [tab, setTab] = useState<Tab>('profile');
  // 画像分五块（第 26 批 · B3）；第 33 批：每块的来历 / 锁 / 现在整理一次
  const [profile, setProfile] = useState<ProfileBlocks>({});
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileHasPrev, setProfileHasPrev] = useState(false);
  const [profileMeta, setProfileMeta] = useState<Partial<Record<keyof ProfileBlocks, ProfileBlockMeta>>>({});
  const [profileLocks, setProfileLocks] = useState<Array<keyof ProfileBlocks>>([]);
  const [refresh, setRefresh] = useState<{ state: 'running' } | { state: 'review'; p: ProfileProposal } | { state: 'note'; text: string } | null>(null);
  const [memos, setMemos] = useState<NavigatorMemo[]>([]);
  // 已作废的（被新事实替代 / 用户让忘掉 / 合并掉的）
  const [archived, setArchived] = useState<NavigatorMemo[]>([]);
  const [filter, setFilter] = useState<MemoFilter>('all');
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // 它替你做过的事（第 28 批 · G2）：最近 50 条操作日志，撤销过的标着
  const [actions, setActions] = useState<NavigatorActionRow[]>([]);
  useEffect(() => { if (isOpen) void listActions(50).then(setActions); }, [isOpen]);
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
  const settings = useAppStore((s) => s.settings);
  const isolated = !!settings.navigatorMemoryIsolated;
  const nav = useNavigatorStore();
  const personas: NavigatorPreset[] = useMemo(() => mergedNavigatorPresets(nav.presets), [nav.presets]);
  const personaIds = useMemo(() => personas.map((p) => p.id), [personas]);
  const [scope, setScope] = useState<string>('');
  useEffect(() => { if (isOpen) { setScope(isolated ? nav.activePreset().id : ''); setRefresh(null); setMenuFor(null); setQuery(''); setMemoEdit(null); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isOpen, isolated]);
  // 人格多了条子会横向滚：打开时把当前那枚滚到看得见的地方
  useEffect(() => {
    if (!isOpen || !isolated) return;
    const tm = window.setTimeout(() => {
      const bar = document.querySelector<HTMLElement>('[data-testid=memory-scope]');
      const chip = bar?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (bar && chip) bar.scrollLeft = Math.max(0, chip.offsetLeft - 12);
    }, 350);
    return () => window.clearTimeout(tm);
  }, [isOpen, isolated, scope]);
  const inScope = (m: Pick<NavigatorMemo, 'presetId' | 'presetIds'>): boolean => {
    if (!isolated) return true;
    const owners = memoOwners(m);
    return scope ? owners.length === 0 || owners.includes(scope) : owners.length === 0;
  };
  const scopeId = isolated && scope ? scope : undefined;
  const personaName = (id?: string): string => (id ? personas.find((p) => p.id === id)?.name ?? '（已删的人格）' : '共享');

  const load = async () => {
    const st = await getProfileState(scopeId);
    setProfile(st.blocks);
    setProfileMeta(st.meta);
    setProfileLocks(st.locks);
    setProfileHasPrev(st.hasPrev);
    setProfileDirty(false);
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
    const tm = window.setTimeout(() => { void commitProfile(); }, 1000);
    return () => window.clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, profileDirty]);
  const revertProfile = async () => {
    if (await undoProfile(scopeId)) await load();
  };
  const setBlock = (key: keyof ProfileBlocks, v: string) => { setProfile((p) => ({ ...p, [key]: v })); setProfileDirty(true); };
  const toggleLock = async (key: keyof ProfileBlocks) => {
    await commitProfile();
    await setProfileLock(key, !profileLocks.includes(key), scopeId);
    await load();
  };
  /** 现在整理一次：按最近的聊天 + 记录跑一遍，先看改了哪几块，确认才写 */
  const runRefresh = async () => {
    await commitProfile();
    if (!getAIConfig(useAppStore.getState().settings)) { setRefresh({ state: 'note', text: '要先在设置里配好 AI 服务，它才能帮你整理。' }); return; }
    const s = useAppStore.getState().settings;
    const records = s.navigatorProfileFromRecords !== false && briefingEnabled(s);
    setRefresh({ state: 'running' });
    const p = await proposeProfileRefresh(scopeId, { chat: true, records });
    if (!p) { setRefresh({ state: 'note', text: '这次没整理成，等会儿再试一次。' }); return; }
    if (!p.changed.length) { setRefresh({ state: 'note', text: `看了一遍最近的聊天${records ? '和记录' : ''}，画像不用改。` }); return; }
    setRefresh({ state: 'review', p });
  };
  const acceptRefresh = async () => {
    if (refresh?.state !== 'review') return;
    await applyProfileProposal(scopeId, refresh.p);
    setRefresh(null);
    await load();
  };

  const runTidy = async () => { setMerges(await findDuplicateMemos(scopeId)); };
  const applyTidy = async () => {
    for (const m of merges ?? []) await mergeMemos(m.keep.id, m.drop.id);
    setMerges(null);
    await load();
  };
  const dropBit = async (id: string) => { await db.navigatorMemos.update(id, { status: 'archived', invalidAt: new Date() }); await load(); };
  const restoreMemo = async (id: string) => { await db.navigatorMemos.update(id, { status: 'active', invalidAt: undefined, supersededBy: undefined, muted: false }); await load(); };
  /** 改一条记忆 / 约定归谁（第 33 批：多选；全选 = 共享） */
  const setOwners = async (id: string, ids: string[]) => {
    await db.navigatorMemos.update(id, ownersPatch(ids, personaIds));
    await load();
  };
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

  const q = query.trim().toLowerCase();
  const matches = (m: NavigatorMemo) => !q || m.text.toLowerCase().includes(q) || (m.cues ?? []).some((c) => c.toLowerCase().includes(q));
  const shownMemos = filter === 'archived' ? [] : memos.filter((m) => (filter === 'pinned' ? m.pinned : filter === 'topic' ? !!m.followUp : true) && matches(m));
  const shownArchived = archived.filter(matches);
  const openPromises = promises.filter((m) => (m.promiseState ?? 'waiting') === 'waiting').length;

  // ── 画像页 ──
  const profileTab = (
    <div>
      <Lead skin={skin} action={
        <span className="flex shrink-0 gap-1.5">
          {profileHasPrev && <Btn small tone="soft" onClick={() => void revertProfile()} ariaLabel="撤回到上一版画像">撤回</Btn>}
          <Btn small onClick={() => void runRefresh()} disabled={refresh?.state === 'running'} ariaLabel="现在整理一次">{refresh?.state === 'running' ? '整理中…' : '现在整理一次'}</Btn>
        </span>
      }>
        每次对话都会带上这段画像。{settings.navigatorProfileAuto === false ? '「画像自动更新」关着：只有你自己改。' : '它整理聊天时只改有变化的块，锁住的不动；你的手改优先。'}
      </Lead>
      {refresh?.state === 'note' && <div className="mb-2.5"><Note action={<Btn small tone="soft" onClick={() => setRefresh(null)}>好</Btn>}>{refresh.text}</Note></div>}
      {refresh?.state === 'review' && (
        <Panel skin={skin} seed={4} className="mb-3" style={skin === 'p3' ? { background: P3R.cyanFaint } : undefined}>
          <div data-profile-review>
            <p className="mb-2 text-[13px] font-black" style={{ color: k.ink }}>它想这样改（{refresh.p.changed.length} 块），你看一眼</p>
            <div className="space-y-2">
              {refresh.p.changed.map((key) => (
                <div key={key} data-review-block={key}>
                  <p className="text-[11px] font-black" style={{ color: k.sub }}>{PROFILE_LABELS[key]} · {refresh.p.fromByKey[key] === 'records' ? '按你的记录' : '按最近的聊天'}</p>
                  {profile[key] && <p className="text-[12px] leading-relaxed line-through" style={{ color: k.sub, opacity: 0.75 }}>{profile[key]}</p>}
                  <p className="text-[12.5px] font-bold leading-relaxed" style={{ color: k.ink }}>{refresh.p.next[key]}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Btn small onClick={() => void acceptRefresh()} ariaLabel="写进画像">写进去</Btn>
              <Btn small tone="soft" onClick={() => setRefresh(null)} ariaLabel="不用了">不用了</Btn>
            </div>
          </div>
        </Panel>
      )}
      <div className="space-y-2.5" data-profile-blocks>
        {PROFILE_KEYS.map((key, i) => {
          const locked = profileLocks.includes(key);
          const tag = metaTagText(profileMeta[key]);
          return (
            <Panel key={key} skin={skin} seed={20 + i * 3}>
              <div className="mb-1.5 flex items-center gap-2" data-profile-block={key}>
                <IconSquare skin={skin} glyph={BLOCK_GLYPH[key]} size={26} seed={i} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-black" style={{ color: k.ink, fontFamily: skin === 'p5' ? P5_TITLE_FONT : skin === 'p4' ? 'var(--p4-display-font, serif)' : undefined }}>
                  {PROFILE_LABELS[key]}
                  <span className="ml-1.5 text-[10px] font-bold" style={{ color: k.sub }}>{(profile[key] ?? '').length}/{PROFILE_LIMITS[key]}</span>
                </span>
                {tag && <Tag skin={skin} tone={profileMeta[key]?.by === 'ai' ? 'accent' : 'sub'}><span data-profile-meta={key}>{tag}</span></Tag>}
                <IconBtn skin={skin} glyph={locked ? 'lock' : 'unlock'} pressed={locked} label={locked ? `解锁「${PROFILE_LABELS[key]}」` : `锁住「${PROFILE_LABELS[key]}」`} onClick={() => void toggleLock(key)} />
              </div>
              <Textarea
                value={profile[key] ?? ''}
                onChange={(e) => setBlock(key, e.target.value.slice(0, PROFILE_LIMITS[key]))}
                onBlur={() => void commitProfile()}
                aria-label={`画像 · ${PROFILE_LABELS[key]}`}
                placeholder={BLOCK_HINT[key]}
                rows={key === 'identity' || (profile[key] ?? '').length > 56 ? 3 : 2}
                className="!text-[13.5px] !font-semibold leading-relaxed"
              />
              {locked && <p className="mt-1 text-[10.5px] font-bold" style={{ color: k.sub }}>锁着：它不会再改这一块，只有你改。</p>}
            </Panel>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11px] font-bold leading-relaxed" style={{ color: skin === 'p5' ? P5R.grey : t.sub }}>
        {isolated ? (scope ? `这是「${personaName(scope)}」自己的画像；它还没写过时会先读共享的那份。` : '这是共享的画像，各人格都读得到。') : '改坏了能撤回上一版。'}
      </p>
    </div>
  );

  // ── 记忆页 ──
  const filters: Array<{ id: MemoFilter; label: string; n: number }> = [
    { id: 'all', label: '全部', n: memos.length },
    { id: 'pinned', label: '置顶', n: memos.filter((m) => m.pinned).length },
    { id: 'topic', label: '有话头', n: memos.filter((m) => !!m.followUp).length },
    { id: 'archived', label: '已作废', n: archived.length },
  ];
  const memoCard = (m: NavigatorMemo, i: number) => {
    const src = SOURCE_META[m.source] ?? SOURCE_META.chat;
    const owners = memoOwners(m);
    return (
      <Panel key={m.id} skin={skin} seed={100 + i * 7} dim={false}>
        <div className="flex items-start gap-2.5" data-memo={m.id}>
          <span title={src.label}><IconSquare skin={skin} glyph={src.glyph} size={26} seed={i + 9} /></span>
          <div className="min-w-0 flex-1">
            {memoEdit?.id === m.id ? (
              <div className="flex items-center gap-2">
                <Input autoFocus value={memoEdit.text} aria-label="改这条记忆"
                  onChange={(e) => setMemoEdit({ id: m.id, text: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveMemoEdit(); }} />
                <Btn small onClick={() => void saveMemoEdit()}>存</Btn>
              </div>
            ) : (
              <p className="text-[13.5px] font-bold leading-relaxed" style={{ color: k.ink }}>
                {m.pinned && <span className="mr-1 inline-block align-[-2px]" style={{ color: skin === 'p5' ? P5R.red : t.accent }} aria-label="置顶的"><Glyph name="pin" size={13} /></span>}
                {m.text}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] font-bold" style={{ color: k.sub }}>
              <span>{src.label} · {dayLabelCN(toLocalDateKey(new Date(m.createdAt)), today)}</span>
              <Importance skin={skin} n={m.importance} />
              {m.followUp && <Tag skin={skin} tone="accent">有话头</Tag>}
              {isolated && scope && owners.length === 0 && <Tag skin={skin}>共享</Tag>}
            </div>
            {!!m.cues?.length && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.cues.slice(0, 5).map((c) => <span key={c} className="text-[10.5px] font-bold" style={{ color: k.sub }}>#{c}</span>)}
              </div>
            )}
            {isolated && <div className="mt-1.5"><OwnerPicker skin={skin} owners={owners} personas={personas} onChange={(ids) => void setOwners(m.id, ids)} /></div>}
          </div>
          <MoreMenu skin={skin} open={menuFor === m.id} onToggle={() => setMenuFor((v) => (v === m.id ? null : m.id))}
            items={[
              { label: m.pinned ? '取消置顶' : '置顶（不会忘）', onClick: () => void togglePin(m) },
              { label: '改', onClick: () => setMemoEdit({ id: m.id, text: m.text }) },
              { label: '删', onClick: () => setDeleteId(m.id), danger: true },
            ]} />
        </div>
      </Panel>
    );
  };
  const memosTab = (
    <div>
      <Lead skin={skin} action={memos.length >= 2 ? <Btn small tone="soft" onClick={() => void runTidy()} ariaLabel="整理重复的记忆">整理</Btn> : undefined}>
        按相关性取用；置顶的永不遗忘。
      </Lead>
      <div className="mb-2.5"><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜一搜它记得的事" aria-label="搜记忆" /></div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="筛选记忆">
        {filters.map((f, i) => {
          const on = filter === f.id;
          return (
            <button key={f.id} type="button" role="radio" aria-checked={on} onClick={() => setFilter(f.id)} data-memo-filter={f.id}
              className={`relative px-2.5 py-1 text-[11.5px] font-black ${skin === 'p4' || skin === 'neutral' ? 'rounded-full' : ''}`}
              style={skin === 'p5'
                ? { color: on ? P5R.white : P5R.ink, fontFamily: P5_TITLE_FONT }
                : skin === 'p4'
                  ? { background: on ? '#131313' : 'transparent', color: on ? 'var(--ui-bg, #ffd900)' : t.ink, boxShadow: '0 0 0 2px #131313' }
                  : skin === 'p3'
                    ? { clipPath: slantClip(6), background: on ? P3R.blue : t.chip, color: on ? '#fff' : t.ink }
                    : { background: on ? 'var(--color-primary, #1b57ff)' : 'rgba(107,122,153,0.12)', color: on ? '#fff' : t.ink }}>
              {skin === 'p5' && <P5Rough seed={930 + i * 3} jag={3} frame={2} face={on ? P5R.red : P5R.paper} shadow={null} />}
              <span className="relative">{f.label} {f.n}</span>
            </button>
          );
        })}
      </div>
      {filter === 'archived' ? (
        shownArchived.length === 0 ? <Empty skin={skin}>没有作废的记忆。</Empty> : (
          <div className="space-y-2" data-archived-list>
            {shownArchived.map((m, i) => (
              <Panel key={m.id} skin={skin} seed={300 + i * 5} dim>
                <div className="flex items-start gap-2 text-[12.5px] leading-relaxed" style={{ color: k.sub }}>
                  <span className="min-w-0 flex-1 font-bold line-through">{m.text}</span>
                  <span className="shrink-0 text-[10px] font-bold">{m.supersededBy ? '被新的替代' : m.muted ? '你让它忘的' : '作废'}</span>
                  <button type="button" onClick={() => void restoreMemo(m.id)} aria-label={`恢复记忆：${m.text}`} className="shrink-0 text-[11.5px] font-black" style={{ color: skin === 'p5' ? P5R.white : t.accent }}>恢复</button>
                </div>
              </Panel>
            ))}
          </div>
        )
      ) : memos.length === 0 ? (
        <Empty skin={skin}>还没有记忆——多聊几天，它会自己记住重要的事。</Empty>
      ) : shownMemos.length === 0 ? (
        <Empty skin={skin}>没有对得上的。</Empty>
      ) : (
        <div className="space-y-2" data-memo-list>{shownMemos.map(memoCard)}</div>
      )}
    </div>
  );

  // ── 约好的事 ──
  const promisesTab = (
    <div>
      <Lead skin={skin}>聊天时说到带日子的事（面试、考试、体检……），它会记下，过后问你一句结果，只问一次。</Lead>
      {promises.length === 0 ? (
        <Empty skin={skin}>还没有约好的事。</Empty>
      ) : (
        <div className="relative space-y-2.5" data-promise-list>
          <span aria-hidden className="absolute bottom-2 left-[25px] top-2 w-[2px]" style={{ background: skin === 'p5' ? P5R.ink : skin === 'p3' ? P3R.cyan : skin === 'p4' ? '#131313' : 'rgba(107,122,153,0.3)', opacity: skin === 'p3' ? 0.5 : 0.35 }} />
          {promises.map((m, i) => {
            const open = (m.promiseState ?? 'waiting') === 'waiting';
            const [, mo, d] = m.dueDate.split('-');
            return (
              <div key={m.id} className="relative flex items-start gap-2.5" data-promise={m.promiseTopic}>
                <span className="relative z-[1] flex w-[52px] shrink-0 flex-col items-center py-1.5 text-center"
                  style={skin === 'p5'
                    ? { background: open ? P5R.red : P5R.ink, color: P5R.white, clipPath: roughQuad(700 + i, 3), fontFamily: P5_TITLE_FONT }
                    : skin === 'p4'
                      ? { background: open ? '#131313' : 'var(--ui-paper, #fff6d0)', color: open ? 'var(--ui-bg, #ffd900)' : t.ink, borderRadius: 12, boxShadow: '0 0 0 2px #131313' }
                      : skin === 'p3'
                        ? { background: open ? P3R.blue : t.chip, color: open ? '#fff' : t.ink, clipPath: slantClip(5) }
                        : { background: open ? 'var(--color-primary, #1b57ff)' : 'rgba(107,122,153,0.15)', color: open ? '#fff' : t.ink, borderRadius: 12 }}>
                  <span className="text-[15px] font-black leading-none">{Number(mo)}/{Number(d)}</span>
                  <span className="mt-0.5 text-[9.5px] font-black opacity-85">{relativeDayCN(m.dueDate, today)}</span>
                </span>
                <Panel skin={skin} seed={400 + i * 3} dim={!open} className="min-w-0 flex-1">
                  {dateEdit?.id === m.id ? (
                    <div className="flex items-center gap-2">
                      <Input type="date" autoFocus value={dateEdit.date} min={today} onChange={(e) => setDateEdit({ id: m.id, date: e.target.value })} aria-label={`「${m.promiseTopic}」改到哪天`} />
                      <Btn small onClick={() => void saveDateEdit()}>存</Btn>
                      <Btn small tone="soft" onClick={() => setDateEdit(null)}>取消</Btn>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-bold leading-relaxed" style={{ color: k.ink }}>{m.promiseTopic}</p>
                        <p className="mt-0.5 text-[10.5px] font-bold" style={{ color: k.sub }}>
                          {dayLabelCN(m.dueDate, today)}{WHEN_TEXT[m.dueWhen ?? 'day']} · {promiseStatusLabel(m)}
                        </p>
                        {isolated && <div className="mt-1.5"><OwnerPicker skin={skin} owners={memoOwners(m)} personas={personas} onChange={(ids) => void setOwners(m.id, ids)} /></div>}
                      </div>
                      <MoreMenu skin={skin} open={menuFor === m.id} onToggle={() => setMenuFor((v) => (v === m.id ? null : m.id))}
                        items={[
                          ...(open ? [{ label: '改日子', onClick: () => setDateEdit({ id: m.id, date: m.dueDate }) }] : []),
                          { label: '删掉', onClick: () => setDeletePromiseId(m.id), danger: true },
                        ]} />
                    </div>
                  )}
                </Panel>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── 说法 ──
  const bitsTab = (
    <div>
      <Lead skin={skin}>你们之间的说法：昵称、代号、只有你们懂的梗。它会偶尔用；不想再听到的就删。</Lead>
      {bits.length === 0 ? <Empty skin={skin}>还没有——聊多了自然会有。</Empty> : (
        <div className="flex flex-wrap gap-2" data-bits-list>
          {bits.map((b, i) => (
            <span key={b.id} data-bit={b.text} title={[b.bitMeaning, b.bitOrigin].filter(Boolean).join(' · ')}
              className={`relative inline-flex max-w-full items-center gap-1 px-3 py-1.5 text-[12.5px] font-black ${skin === 'p4' || skin === 'neutral' ? 'rounded-full' : ''}`}
              style={skin === 'p5'
                ? { color: P5R.white, fontFamily: P5_TITLE_FONT }
                : skin === 'p4'
                  ? { background: 'var(--ui-paper, #fff6d0)', color: t.ink, boxShadow: '0 0 0 2px #131313' }
                  : skin === 'p3'
                    ? { background: P3R.panel, color: t.ink, clipPath: slantClip(7), boxShadow: '0 4px 12px rgba(7,40,120,.10)' }
                    : { background: 'rgba(107,122,153,0.12)', color: t.ink }}>
              {skin === 'p5' && <P5Rough seed={820 + i * 3} jag={3} frame={2} face={P5R.ink} shadow={{ x: 2, y: 2 }} shadowColor={P5R.red} />}
              <span className="relative min-w-0 truncate">「{b.text}」{b.bitMeaning ? <span className="opacity-60">= {b.bitMeaning}</span> : null}</span>
              <button type="button" onClick={() => void dropBit(b.id)} aria-label={`这个梗别提了：${b.text}`} className="relative ml-0.5 opacity-60 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  // ── 足迹 ──
  const trailTab = (
    <div>
      <Lead skin={skin}>它替你做过的事：卡片确认过的操作，撤销过的划掉。</Lead>
      {actions.length === 0 ? <Empty skin={skin}>它还没替你做过事。</Empty> : (
        <div className="space-y-2" data-actions-list>
          {actions.map((a, i) => (
            <Panel key={a.id} skin={skin} seed={600 + i * 3} dim={!!a.undoneAt}>
              <div data-action-row className="flex items-start gap-2 text-[12.5px] leading-relaxed" style={{ color: k.ink }}>
                <span className="min-w-0 flex-1">
                  <span className={`font-black ${a.undoneAt ? 'line-through' : ''}`}>{a.label}</span>
                  <span className={`ml-1 font-semibold ${a.undoneAt ? 'line-through' : ''}`}>{a.summary}</span>
                  <span className="ml-1 text-[10.5px] font-bold" style={{ color: k.sub }}>{dayLabelCN(toLocalDateKey(new Date(a.createdAt)), today)} {new Date(a.createdAt).toTimeString().slice(0, 5)}</span>
                </span>
                <span className="shrink-0 text-[10.5px] font-bold" style={{ color: k.sub }}>{a.undoneAt ? '已撤销' : a.undoError ? '撤销失败' : ''}</span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <SheetModal isOpen={isOpen} onClose={() => { void commitProfile(); onClose(); }} position="bottom" title="记事本">
        {/* 最小高度：五个页签内容长短差很多，切页签时弹层别跟着一伸一缩 */}
        <div className="relative min-h-[64vh] pb-2" data-notebook>
          {isolated && (
            // 记忆隔离开着：按人格翻看（第 23 批）
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" data-testid="memory-scope">
              {[{ id: '', name: '共享', avatar: undefined as string | undefined }, ...personas].map((p, i) => {
                const on = scope === p.id;
                const style: CSSProperties = skin === 'p5'
                  ? { color: on ? P5R.white : P5R.ink, fontFamily: P5_TITLE_FONT }
                  : skin === 'p4'
                    ? { background: on ? '#131313' : 'var(--ui-paper, #fff6d0)', color: on ? 'var(--ui-bg, #ffd900)' : t.ink, boxShadow: '0 0 0 2px #131313' }
                    : skin === 'p3'
                      ? { background: on ? P3R.blue : P3R.panel, color: on ? '#fff' : t.ink, clipPath: slantClip(6) }
                      : { background: on ? 'var(--color-primary, #1b57ff)' : 'rgba(107,122,153,0.12)', color: on ? '#fff' : t.ink };
                return (
                  <button key={p.id || '__shared'} type="button" onClick={() => setScope(p.id)} aria-pressed={on}
                    className={`relative flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[12px] font-black ${skin === 'p4' || skin === 'neutral' ? 'rounded-full' : ''}`} style={style}>
                    {skin === 'p5' && <P5Rough seed={760 + i * 3} jag={3} frame={2} face={on ? P5R.red : P5R.paper} shadow={null} />}
                    <span className="relative flex items-center gap-1.5">{p.id ? <PresetAvatar avatar={p.avatar} className="h-4 w-4" /> : <span aria-hidden>∞</span>}{p.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          <TabBar skin={skin} value={tab} onChange={(v) => { setTab(v); setMenuFor(null); }} items={[
            { id: 'profile', label: '画像' },
            { id: 'memos', label: '记忆', n: memos.length },
            { id: 'promises', label: '约好的事', n: openPromises },
            { id: 'bits', label: '说法', n: bits.length },
            { id: 'trail', label: '足迹' },
          ]} />
          <div role="tabpanel" aria-label={tab}>
            {tab === 'profile' ? profileTab : tab === 'memos' ? memosTab : tab === 'promises' ? promisesTab : tab === 'bits' ? bitsTab : trailTab}
          </div>
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
