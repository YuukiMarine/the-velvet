/**
 * 满月团战面板（组织 P2 · PRD §17 / §18）：地图中心的首领标记、地图下面的横条打开它。
 *   · 上面是一块小舞台（SVG）：夜空、满月、地面上站着这次的首领（按首领生成的面具样子），血条和名字压在舞台顶上；
 *     出手时首领一抖、一闪、一刀划过，伤害数字往上飘；击退了首领淡掉，盖一枚「暗影击退」。
 *   · 下面「今日的锋芒」：五张面具左右切换（‹ › 或在面具卡上横划），先停在能打弱点的那一张；
 *     每张面具列出解锁了的技能（回复类不算）和普攻，点一下展开（预估伤害怎么算的），再点「释放」出手——按那一招的 SP 扣，普攻不花。
 *   · 再往下：总攻击、出过手的人（不排名次）、怎么打。
 * 击退了，庆祝卡等面板关掉再弹（OrgCelebrationCutIn 自己会等）。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { SheetModal } from '@/components/SheetModal';
import { useAppStore } from '@/store';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { sumDamagePlus } from '@/utils/confidantLevels';
import { useBoldness } from '@/utils/boldness';
import { displayCodename } from '@/utils/orgLogic';
import {
  RAID_BASIC_POWER, RAID_FULL_MOON_MULT, RAID_WEAK_MULT, RAID_XP_PER_HITTER, allOutDamage, allOutThreshold, avgLvOf, myRaidOptions, raidNow, raidSeed,
  raidSpOf, raidStateOf, strikeDamage, type RaidNow, type RaidState,
} from '@/utils/orgRaid';
import { allOutFromUi, strikeFromUi, type RaidHitResult } from '@/services/orgRaidSync';
import { getUserId } from '@/services/pocketbase';
import { triggerLightHaptic, triggerSuccessFeedback } from '@/utils/feedback';
import { OrgButton, OrgEmblem, OrgPanel, useOrgTone, type OrgTone } from './orgUi';
import type { AttributeId, OrgMember, OrgRaid, OrgView, PersonaSkill } from '@/types';

const ATTRS: AttributeId[] = ['knowledge', 'guts', 'dexterity', 'kindness', 'charm'];
const TYPE_LABEL: Record<PersonaSkill['type'], string> = { damage: '伤害', crit: '暴击', buff: '增益', debuff: '削弱', charge: '蓄力', heal: '回复', attack_boost: '增伤' };

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const md = (key: string) => `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
const NIGHT_NAME = ['前一晚', '满月夜', '后一晚'] as const;

/** 这一刻该看哪一场：正在打的 / 刚结束的那一场（有就带上战况），没有就只有窗口 */
export function useRaidNow(view: OrgView, tick = 0): { now: RaidNow; raid?: OrgRaid; state?: RaidState } {
  return useMemo(() => {
    const now = raidNow(new Date(), view.org.tz);
    const raid = now.phase !== 'before' ? view.raids?.find(r => r.slot === now.slot) : undefined;
    return { now, raid, state: raid ? raidStateOf(raid, view.raidHits, view.org.tz) : undefined };
    // tick：每分钟重算一次（跨到晚上 18 点、跨到第二晚）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.org.tz, view.raids, view.raidHits, tick]);
}

/** 每分钟跳一下：团战面板 / 横条跨过 18:00、07:00 时自己变 */
export function useMinuteTick(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT(x => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return t;
}

const accentOf = (tone: OrgTone) => (tone.channel === 'p5' ? P5R.red : tone.channel === 'p3' ? P3R.blue : tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : tone.accent);
const barOf = (tone: OrgTone) => (tone.channel === 'p3' ? P3R.magenta : tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : tone.channel === 'p5' ? P5R.red : '#8b5cf6');
const shapeOf = (tone: OrgTone, seed: number, cut = 6, r = 12): CSSProperties =>
  tone.channel === 'p3' ? { clipPath: slantClip(cut) } : tone.channel === 'p5' ? { clipPath: roughQuad(seed + 2.3, 2) } : { borderRadius: r };
const chipShape = (tone: OrgTone, seed = 1): CSSProperties => (tone.channel === 'p3' ? { clipPath: slantClip(4) } : tone.channel === 'p5' ? { clipPath: roughQuad(seed + 2.2, 1.5) } : { borderRadius: 999 });

// ── 地图下面的横条（三晚里才有）────────────────────────────────────────────────

export function RaidBanner({ view, onOpen }: { view: OrgView; onOpen: () => void }) {
  const tone = useOrgTone();
  const tick = useMinuteTick();
  const { now, raid, state } = useRaidNow(view, tick);
  const me = view.me.userId;
  if (now.phase !== 'open' || !raid || !state) return null;
  const opt = myRaidOptions(state, me, now, view.members.length);
  const line = state.defeated
    ? `「${raid.boss.name}」已击退 · ${state.hitters.length} 人出过手`
    : `「${raid.boss.name}」还剩 ${Math.round((state.left / raid.hpMax) * 100)}%${now.night ? (opt.struckTonight ? ' · 今晚已出手' : ' · 今晚还没出手') : ' · 18:00 开打'}`;
  const head = now.nightIndex >= 0 ? `满月团战 · ${NIGHT_NAME[now.nightIndex]}` : `满月团战 · ${md(now.nights[1])} 满月`;
  return (
    <OrgPanel padded={false} seed={41}>
      <button type="button" onClick={onOpen} className={`flex w-full items-center gap-3 py-3 text-left ${tone.channel === 'p5' ? 'px-5' : 'px-4'}`} aria-label={`${head}：${line}。点了打开团战面板`}>
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center" style={{ background: tone.channel === 'p4' ? '#131313' : '#1b1240', ...(tone.channel === 'p3' ? { clipPath: slantClip(6) } : tone.channel === 'p5' ? { clipPath: roughQuad(3.3, 2) } : { borderRadius: 999 }) }}>
          <OrgEmblem id="moon" size={18} color={tone.channel === 'p4' ? '#ffe066' : '#ffffff'} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black tracking-[0.18em]" style={{ color: tone.sub }}>{head}</span>
          <span className="mt-0.5 block truncate text-[13px] font-black" style={{ fontFamily: tone.titleFont }}>{line}</span>
          {!state.defeated && (
            <span className="mt-1.5 block h-[5px] overflow-hidden" style={{ background: 'rgba(127,127,127,0.22)', borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 99 : 0 }}>
              <span className="block h-full" style={{ width: `${Math.max(2, (state.left / raid.hpMax) * 100)}%`, background: barOf(tone) }} />
            </span>
          )}
        </span>
        <span className="relative shrink-0 text-[12px] font-black" style={{ color: tone.channel === 'p4' ? '#131313' : accentOf(tone) }}>
          {opt.canStrike ? '出手' : '查看'} ›
          {opt.canStrike && <span aria-hidden className="absolute -right-2 -top-1.5 h-2 w-2 rounded-full" style={{ background: '#f43f5e' }} />}
        </span>
      </button>
    </OrgPanel>
  );
}

// ── 舞台 ─────────────────────────────────────────────────────────────────────

/** 舞台的配色（舞台自己是一块夜景，不跟白天 / 夜间走；按频道换色调） */
const STAGE: Record<OrgTone['channel'], { skyTop: string; skyBottom: string; body: [string, string]; eye: string; rim: string; ground: string }> = {
  p5: { skyTop: '#000000', skyBottom: '#3a0408', body: ['#2a0a0e', '#000000'], eye: '#ff3b3b', rim: '#c00008', ground: 'rgba(240,233,223,0.08)' },
  p3: { skyTop: '#04102e', skyBottom: '#0b2a63', body: ['#0f2552', '#020617'], eye: '#35d1e8', rim: '#1b57ff', ground: 'rgba(53,209,232,0.1)' },
  p4: { skyTop: '#140d2a', skyBottom: '#33245e', body: ['#2a2150', '#0e0a1c'], eye: '#ffe066', rim: '#f9a11b', ground: 'rgba(255,224,102,0.1)' },
  neutral: { skyTop: '#0b0a1f', skyBottom: '#25205a', body: ['#241a4a', '#07061a'], eye: '#c4b5fd', rim: '#8b5cf6', ground: 'rgba(196,181,253,0.1)' },
};

interface HitFx { key: string; damage: number; isWeak: boolean; fullMoon: boolean; kind: 'strike' | 'allout'; defeated: boolean; finisher: boolean }

function RaidStage({ tone, raid, state, hit, weakName }: { tone: OrgTone; raid: OrgRaid; state: RaidState; hit: HitFx | null; weakName: string }) {
  const anim = useBoldness();
  const c = STAGE[tone.channel];
  const seed = raidSeed(raid.orgId, raid.slot);
  const variant = seed % 3;
  const left = state.left / raid.hpMax;
  const id = `raid-${raid.id}`;
  // 星星：按首领的种子撒，每次打开都一样
  const stars = useMemo(() => {
    let x = seed || 1;
    const r = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
    return Array.from({ length: 16 }, () => ({ cx: 8 + r() * 344, cy: 6 + r() * 92, r: 0.6 + r() * 1.2, o: 0.25 + r() * 0.5 }));
  }, [seed]);
  return (
    <div className={`relative w-full overflow-hidden ${anim ? '' : 'raid-still'}`} style={{ aspectRatio: '360 / 210', ...shapeOf(tone, 7, 12, 18) }} data-raid-stage>
      <svg aria-hidden viewBox="0 0 360 210" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.skyTop} />
            <stop offset="1" stopColor={c.skyBottom} />
          </linearGradient>
          <radialGradient id={`${id}-moon`}>
            <stop offset="0" stopColor="#fffbea" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#f6e7b0" stopOpacity="0.35" />
            <stop offset="1" stopColor="#f6e7b0" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-aura`}>
            <stop offset="0" stopColor={c.eye} stopOpacity="0.32" />
            <stop offset="1" stopColor={c.eye} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={c.body[0]} />
            <stop offset="1" stopColor={c.body[1]} />
          </linearGradient>
        </defs>
        {/* 夜空、星星、满月 */}
        <rect width="360" height="210" fill={`url(#${id}-sky)`} />
        {tone.channel === 'p5' && <polygon points="0,150 360,40 360,72 0,182" fill="#c00008" fillOpacity="0.22" />}
        {stars.map((s, i) => <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#ffffff" fillOpacity={s.o} />)}
        <circle cx="300" cy="46" r="46" fill={`url(#${id}-moon)`} />
        <circle cx="300" cy="46" r="20" fill="#fdf6dc" />
        <circle cx="293" cy="41" r="4" fill="#000000" fillOpacity="0.06" />
        <circle cx="306" cy="52" r="3" fill="#000000" fillOpacity="0.05" />
        {/* 地面 */}
        <ellipse cx="180" cy="196" rx="170" ry="22" fill={c.ground} />
        <ellipse cx="180" cy="203" rx="44" ry="5.5" fill="#000000" fillOpacity="0.55" />
        {tone.channel === 'p3' && [150, 170, 190, 210].map(x => <path key={x} d={`M${x} 178 L${(x - 180) * 2.2 + 180} 210`} stroke={c.rim} strokeOpacity="0.18" strokeWidth="1" />)}
        {/* 首领：光晕 → 雾 → 身体（浮动）；挨打时整组一抖 */}
        {/* 首领放在名字和血条下面：舞台在面板里约 300 宽，顶上那一截压着名字 / 弱点 / 血条（约 70 个单位），
            角 / 王冠最高到 -66、斗篷下摆到 +88：缩到八成、中心放在 131，头顶 ≈ 78、下摆 ≈ 201，320 宽也不碰 */}
        <g transform="translate(180 131) scale(0.8)" className={state.defeated ? 'raid-fade' : undefined}>
          <circle cx="0" cy="18" r="84" fill={`url(#${id}-aura)`} />
          {[-40, -14, 18, 44].map((x, i) => (
            <circle key={x} cx={x} cy={70} r={3 + (i % 2)} fill={c.eye} fillOpacity="0.5" className="raid-wisp" style={{ animationDelay: `${i * 0.9}s` }} />
          ))}
          <g key={hit?.key ?? 'idle'} className={hit ? 'raid-hit' : undefined}>
            <g className="raid-float">
              <ShadowFigure variant={variant} body={`url(#${id}-body)`} eye={c.eye} rim={c.rim} />
            </g>
          </g>
        </g>
        {/* 挨打：一闪、一刀（总攻击三刀） */}
        {hit && (
          <g key={`fx-${hit.key}`}>
            <rect width="360" height="210" fill="#ffffff" className="raid-flash" />
            {(hit.kind === 'allout' ? [0, 1, 2] : [0]).map(i => (
              <path key={i} d={`M${236 - i * 26} ${36 + i * 8} L${124 - i * 22} ${156 + i * 6}`} stroke="#ffffff" strokeWidth={hit.kind === 'allout' ? 4 : 5} strokeLinecap="round" className="raid-slash" style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </g>
        )}
      </svg>

      {/* 顶上：名字、弱点、血条 */}
      <div className="absolute inset-x-0 top-0 px-3 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-black leading-tight text-white" style={{ fontFamily: tone.channel === 'p5' ? P5_TITLE_FONT : tone.channel === 'p4' ? 'var(--p4-display-font, serif)' : undefined, textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>「{raid.boss.name}」</div>
            <div className="mt-1 flex items-center gap-1">
              <span className="inline-flex items-center whitespace-nowrap px-1.5 py-[2px] text-[10px] font-black leading-none text-white" style={{ background: c.rim, ...chipShape(tone, 3) }}>弱点 · {weakName}</span>
              {/* 首领等级 = 开团时的据点等级：血量和击退奖励都按它算，中途据点升级也不变 */}
              <span className="inline-flex items-center whitespace-nowrap bg-white/15 px-1.5 py-[2px] text-[10px] font-black leading-none tabular-nums text-white/90" style={chipShape(tone, 7)} data-boss-lv>Lv.{raid.boss.lv ?? 1}</span>
            </div>
          </div>
          <div className="shrink-0 text-right text-[11px] font-black tabular-nums text-white/85" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            {state.defeated ? '暗影击退' : `${state.left} / ${raid.hpMax}`}
          </div>
        </div>
        <div className="mt-1.5 h-[6px] overflow-hidden bg-white/15" style={{ borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 99 : 0 }} role="progressbar" aria-label="首领还剩的血" aria-valuemin={0} aria-valuemax={raid.hpMax} aria-valuenow={state.left}>
          <motion.div className="h-full" style={{ background: c.rim }} initial={false} animate={{ width: `${Math.max(state.defeated ? 0 : 2, left * 100)}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
        </div>
      </div>

      {/* 伤害数字 */}
      <AnimatePresence>
        {hit && (
          <motion.div
            key={`num-${hit.key}`}
            initial={{ opacity: 0, y: 14, scale: 0.7 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ type: 'spring', stiffness: 360, damping: 20 }}
            className="pointer-events-none absolute inset-x-0 top-[34%] flex flex-col items-center"
            role="status"
          >
            <span className="text-[11px] font-black tracking-[0.22em] text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
              {hit.kind === 'allout' ? '总攻击！' : hit.isWeak ? '打中弱点！' : '出手！'}
            </span>
            <span className="text-[42px] font-black tabular-nums leading-none" style={{ color: tone.channel === 'p5' ? '#ff4d4d' : '#ffe066', fontFamily: tone.channel === 'p5' ? P5_TITLE_FONT : undefined, textShadow: '0 3px 12px rgba(0,0,0,0.7)' }}>−{hit.damage}</span>
            <span className="mt-0.5 text-[11px] font-bold text-white/90" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
              {hit.defeated ? (hit.finisher ? '最后一击！暗影击退' : '暗影击退') : hit.fullMoon ? `满月 ×${RAID_FULL_MOON_MULT}` : ' '}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 击退了：盖一枚章 */}
      {state.defeated && !hit && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="px-3 py-1 text-[22px] font-black tracking-[0.2em] text-white" style={{ background: c.rim, transform: 'rotate(-10deg)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)', fontFamily: tone.channel === 'p5' ? P5_TITLE_FONT : undefined, ...chipShape(tone, 5) }}>
            暗影击退
          </span>
        </div>
      )}
    </div>
  );
}

/** 首领的样子：一身斗篷、两条手、一张面具（按种子：椭圆 / 双角 / 王冠）、两只发光的眼睛 */
function ShadowFigure({ variant, body, eye, rim }: { variant: number; body: string; eye: string; rim: string }) {
  return (
    <g>
      {/* 两条手 */}
      <path d="M-40 4 C-70 -2 -88 24 -76 54" fill="none" stroke="#06040c" strokeWidth="10" strokeLinecap="round" />
      <path d="M40 4 C70 -2 88 24 76 54" fill="none" stroke="#06040c" strokeWidth="10" strokeLinecap="round" />
      <path d="M-76 54 L-84 62 M-76 54 L-74 64 M-76 54 L-66 62" stroke="#06040c" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M76 54 L84 62 M76 54 L74 64 M76 54 L66 62" stroke="#06040c" strokeWidth="3.5" strokeLinecap="round" />
      {/* 斗篷 */}
      <path d="M0 -50 C28 -50 44 -26 46 4 C48 30 54 54 60 80 L46 72 L36 86 L24 74 L12 88 L0 76 L-12 88 L-24 74 L-36 86 L-46 72 L-60 80 C-54 54 -48 30 -46 4 C-44 -26 -28 -50 0 -50 Z" fill={body} />
      <path d="M-40 -18 C-30 -44 30 -44 40 -18" fill="none" stroke={rim} strokeOpacity="0.55" strokeWidth="1.6" />
      {/* 面具 */}
      {variant === 1 && <path d="M-16 -40 L-32 -66 L-6 -44 Z M16 -40 L32 -66 L6 -44 Z" fill="#e8dfcd" stroke="#1a1a1a" strokeWidth="0.8" />}
      {variant === 2 && <path d="M-18 -42 L-15 -58 L-8 -45 L0 -62 L8 -45 L15 -58 L18 -42 Z" fill={rim} stroke="#1a1a1a" strokeWidth="0.8" />}
      <path d="M-24 -30 C-24 -48 24 -48 24 -30 C24 -9 12 7 0 9 C-12 7 -24 -9 -24 -30 Z" fill="#efe6d6" stroke="#1a1a1a" strokeWidth="0.9" />
      <path d="M-20 -40 C-12 -45 12 -45 20 -40" fill="none" stroke="#000000" strokeOpacity="0.12" strokeWidth="2" />
      {/* 眼睛：外面一圈光，里面亮 */}
      <g className="raid-eye">
        <path d="M-16 -26 C-12 -32 -4 -32 -2 -26 C-6 -22 -12 -22 -16 -26 Z M16 -26 C12 -32 4 -32 2 -26 C6 -22 12 -22 16 -26 Z" fill="none" stroke={eye} strokeOpacity="0.45" strokeWidth="4" />
        <path d="M-16 -26 C-12 -32 -4 -32 -2 -26 C-6 -22 -12 -22 -16 -26 Z M16 -26 C12 -32 4 -32 2 -26 C6 -22 12 -22 16 -26 Z" fill={eye} />
      </g>
      <path d="M-10 -6 L-6 -3 L-2 -7 L2 -3 L6 -7 L10 -4" fill="none" stroke="#2a2a2a" strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  );
}

// ── 面板 ─────────────────────────────────────────────────────────────────────

interface StrikePick {
  key: string;
  attr: AttributeId;
  skill: string;
  type: PersonaSkill['type'] | 'basic';
  power: number;
  plus: number;
  spCost: number;
  level: number;
}

export function RaidSheet({ view, open, onClose, onFlash }: {
  view: OrgView;
  open: boolean;
  onClose: () => void;
  onFlash: (s: string) => void;
}) {
  const tone = useOrgTone();
  const tick = useMinuteTick();
  const { now, raid, state } = useRaidNow(view, tick);
  const persona = useAppStore(s => s.persona);
  const attributes = useAppStore(s => s.attributes);
  const confidants = useAppStore(s => s.confidants);
  const battleState = useAppStore(s => s.battleState);
  const myNames = useAppStore(s => s.settings.attributeNames) as Record<AttributeId, string>;
  const me = getUserId() ?? view.me.userId;
  const sp = battleState?.sp ?? 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hit, setHit] = useState<HitFx | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  // 面具：先停在能打弱点的那一张
  const weak = raid?.boss.weak ?? 'knowledge';
  const [maskIdx, setMaskIdx] = useState(() => Math.max(0, ATTRS.indexOf(weak)));
  const [expanded, setExpanded] = useState<string | null>(null);
  const hitTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!open) { setError(''); setHit(null); setExpanded(null); return; }
    setMaskIdx(Math.max(0, ATTRS.indexOf(weak)));
  }, [open, weak]);
  useEffect(() => () => window.clearTimeout(hitTimer.current), []);

  const plusMap = useMemo(() => sumDamagePlus(confidants), [confidants]);
  const maskAttr = ATTRS[maskIdx];
  const maskName = persona?.attributePersonas?.[maskAttr]?.name?.trim() || persona?.name || '反抗者';
  const attrLevel = attributes.find(a => a.id === maskAttr)?.level ?? 1;
  // 这张面具能用的招：解锁了的技能（回复类不算），强的在前；最后是普攻（不花 SP）
  const picks = useMemo<StrikePick[]>(() => {
    const out: StrikePick[] = [];
    for (const sk of persona?.skills?.[maskAttr] ?? []) {
      if (sk.type === 'heal' || !(sk.unlocked ?? sk.level <= attrLevel)) continue;
      out.push({ key: `${maskAttr}-${sk.level}-${sk.name}`, attr: maskAttr, skill: sk.name, type: sk.type, power: sk.power, plus: plusMap[maskAttr] ?? 0, spCost: sk.spCost ?? 0, level: sk.level });
    }
    out.sort((a, b) => b.power - a.power || b.level - a.level);
    out.push({ key: `${maskAttr}-basic`, attr: maskAttr, skill: '普攻', type: 'basic', power: RAID_BASIC_POWER, plus: 0, spCost: 0, level: 0 });
    return out;
  }, [persona, maskAttr, attrLevel, plusMap]);
  const nightForPreview = now.night ?? now.nights[1];
  const preview = (p: StrikePick) => (raid ? strikeDamage({ power: p.power, plus: p.plus, attr: p.attr, weak: raid.boss.weak, night: nightForPreview, nights: now.nights }) : { damage: p.power, isWeak: false, fullMoon: false });

  const opt = state ? myRaidOptions(state, me, now, view.members.length) : null;
  const byUser = new Map<string, OrgMember>(view.members.map(m => [m.userId, m]));
  const avgLv = avgLvOf(view.members);
  const allOutPreview = state ? allOutDamage(avgLv, state.strikes) : 0;
  const reward = raidSpOf(raid?.boss.lv ?? 1);
  const myStat = state?.stats.get(me);
  const myTonight = state && now.night ? state.valid.find(h => h.userId === me && h.kind === 'strike' && h.night === now.night) : undefined;

  const showHit = (r: RaidHitResult, kind: 'strike' | 'allout') => {
    setHit({ key: r.hit.id, damage: r.damage, isWeak: r.isWeak, fullMoon: r.fullMoon, kind, defeated: r.defeated, finisher: r.finisher });
    window.clearTimeout(hitTimer.current);
    hitTimer.current = window.setTimeout(() => setHit(null), 1700);
  };
  const strike = async (p: StrikePick) => {
    if (busy) return;
    setBusy(true);
    setError('');
    triggerLightHaptic();
    try {
      const r = await strikeFromUi(view.org.id, { attr: p.attr, power: p.power, plus: p.plus, skill: p.skill, spCost: p.spCost });
      showHit(r, 'strike');
      setExpanded(null);
      if (r.dup) onFlash('今晚另一台设备已经出过手了');
      if (r.defeated) triggerSuccessFeedback();
    } catch (e) {
      setError(errText(e, '没打出去，稍后再试'));
    } finally {
      setBusy(false);
    }
  };
  const allOut = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    triggerLightHaptic();
    try {
      const r = await allOutFromUi(view.org.id);
      showHit(r, 'allout');
      if (r.defeated) triggerSuccessFeedback();
    } catch (e) {
      setError(errText(e, '没打出去，稍后再试'));
    } finally {
      setBusy(false);
    }
  };
  const cycle = (dir: 1 | -1) => {
    setMaskIdx(i => (i + dir + ATTRS.length) % ATTRS.length);
    setExpanded(null);
    triggerLightHaptic();
  };
  const onPan = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 36 && Math.abs(info.offset.x) > Math.abs(info.offset.y)) cycle(info.offset.x < 0 ? 1 : -1);
  };

  const accent = accentOf(tone);
  const linkInk = tone.channel === 'p4' ? '#131313' : accent;
  const weakName = raid ? myNames[raid.boss.weak] ?? raid.boss.weak : '';
  const status = now.phase === 'before' ? `下次满月 · ${md(now.nights[1])}`
    : now.phase === 'after' ? '这次团战已经结束'
      : state?.defeated ? `${md(now.nights[1])} 满月`  // 「暗影击退」舞台上已经写了两处；三个打了勾的晚上挤着，这里只留日子
        : now.nightIndex >= 0 ? `${NIGHT_NAME[now.nightIndex]} · ${opt?.struckTonight ? '今晚已出手' : '现在能出手'}` : '白天 · 18:00 开打';

  return (
    <SheetModal isOpen={open} onClose={() => { if (!busy) onClose(); }} title="满月团战" busy={busy} maxHeightClass="max-h-[92vh]">
      <div className="space-y-3.5 px-4 pb-6" data-raid-sheet>
        {raid && state ? (
          <RaidStage tone={tone} raid={raid} state={state} hit={hit} weakName={weakName} />
        ) : (
          <p className="text-[13px] font-semibold text-gray-600 dark:text-gray-300">
            {now.phase === 'open' && view.raidsFailed ? '团战暂时拉不到（可能是网络，或者服务器还没准备好）。稍后刷新再看看。' : '月亮正在升起……刷新一下就能看到首领。'}
          </p>
        )}

        {/* 状态 + 三晚 */}
        {/* 窄屏放不下时三个晚上换到下一行靠右，状态不截 */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <div className="min-w-0 truncate text-[12px] font-black tracking-[0.08em] text-gray-500 dark:text-gray-400" data-raid-status>{status}</div>
          <div className="ml-auto flex shrink-0 gap-1" role="list" aria-label="三个晚上" data-raid-nights>
            {now.nights.map((n, i) => {
              const here = now.phase === 'open' && now.nightIndex === i;
              const done = !!myStat?.nights.includes(n);
              return (
                <span
                  key={n}
                  role="listitem"
                  aria-label={`${NIGHT_NAME[i]} ${md(n)}${i === 1 ? '（满月，伤害 ×1.2）' : ''}${done ? '，我出过手' : ''}${here ? '，就是今晚' : ''}`}
                  className="relative px-1.5 py-1 text-[10px] font-black leading-tight"
                  style={{ background: here ? accent : 'rgba(127,127,127,0.12)', color: here ? '#ffffff' : undefined, ...chipShape(tone, i + 1) }}
                >
                  {NIGHT_NAME[i]}{done ? '✓' : ''}
                </span>
              );
            })}
          </div>
        </div>

        {/* 今日的锋芒 */}
        {now.phase === 'open' && raid && state && opt && !state.defeated && (
          opt.canStrike ? (
            <section className="space-y-2.5" aria-label="今日的锋芒">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[16px] font-black text-gray-900 dark:text-white" style={{ fontFamily: tone.channel === 'p5' ? P5_TITLE_FONT : tone.channel === 'p4' ? 'var(--p4-display-font, serif)' : undefined }}>今日的锋芒</h3>
                <span className="shrink-0 px-2 py-[3px] text-[11px] font-black tabular-nums" style={{ background: 'rgba(250,204,21,0.18)', color: tone.channel === 'p4' ? '#131313' : '#b45309', ...chipShape(tone, 4) }} aria-label={`现在有 ${sp} SP`}>SP {battleState ? sp : '—'}</span>
              </div>
              {/* 面具：‹ 卡 ›，卡上横划也能切；下面一排五个点 */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => cycle(-1)} aria-label="上一张面具" className="flex h-9 w-9 shrink-0 items-center justify-center text-[18px] font-black text-gray-500 dark:text-gray-300" style={{ background: 'rgba(127,127,127,0.1)', ...shapeOf(tone, 1, 5, 12) }}>‹</button>
                <motion.div onPanEnd={onPan} style={{ touchAction: 'pan-y' }} className="min-w-0 flex-1" data-mask-card={maskAttr}>
                  <div className="flex items-center gap-2.5 px-3 py-2" style={{ background: maskAttr === weak ? accent : 'rgba(127,127,127,0.1)', color: maskAttr === weak ? '#ffffff' : undefined, ...shapeOf(tone, maskIdx + 3, 7, 14) }}>
                    <OrgEmblem id="mask" size={22} color="currentColor" className="shrink-0 opacity-90" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-black leading-tight text-gray-900 dark:text-white" style={maskAttr === weak ? { color: '#ffffff' } : undefined}>{maskName}</span>
                      <span className="block text-[11px] font-bold opacity-80">{myNames[maskAttr] ?? maskAttr} · Lv.{attrLevel}</span>
                    </span>
                    {maskAttr === weak && <span className="shrink-0 bg-white/25 px-1.5 py-[2px] text-[10px] font-black" style={chipShape(tone, 6)}>打弱点 ×{RAID_WEAK_MULT}</span>}
                  </div>
                </motion.div>
                <button type="button" onClick={() => cycle(1)} aria-label="下一张面具" className="flex h-9 w-9 shrink-0 items-center justify-center text-[18px] font-black text-gray-500 dark:text-gray-300" style={{ background: 'rgba(127,127,127,0.1)', ...shapeOf(tone, 2, 5, 12) }}>›</button>
              </div>
              <div className="flex justify-center gap-1.5" aria-hidden>
                {ATTRS.map((a, i) => <span key={a} className="h-1.5 rounded-full transition-all" style={{ width: i === maskIdx ? 16 : 6, background: i === maskIdx ? accent : a === weak ? 'rgba(244,63,94,0.55)' : 'rgba(127,127,127,0.3)' }} />)}
              </div>
              {/* 招：点一下展开，再点「释放」 */}
              <div className="space-y-1.5" role="list" aria-label={`${maskName} 的招`}>
                {picks.map((p, i) => {
                  const d = preview(p);
                  const open1 = expanded === p.key;
                  const short = p.spCost > sp || (p.spCost > 0 && !battleState);
                  return (
                    <div key={p.key} role="listitem" style={{ background: open1 ? 'rgba(127,127,127,0.14)' : 'rgba(127,127,127,0.07)', ...shapeOf(tone, i + 5, 6, 12) }}>
                      <button
                        type="button"
                        onClick={() => setExpanded(open1 ? null : p.key)}
                        aria-expanded={open1}
                        aria-label={`${p.skill}：预估 ${d.damage}${p.spCost ? `，${p.spCost} SP` : '，不花 SP'}${short ? '，SP 不够' : ''}`}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left"
                        style={{ opacity: short ? 0.5 : 1 }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-black text-gray-900 dark:text-white">{p.skill}</span>
                          <span className="mt-0.5 block text-[11px] font-bold text-gray-500 dark:text-gray-400">
                            {p.type === 'basic' ? '普攻' : TYPE_LABEL[p.type]} · 威力 {p.power}{p.plus ? ` +${p.plus}` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          <span className="text-[18px] font-black tabular-nums leading-none text-gray-900 dark:text-white">{d.damage}</span>
                          <span className="mt-0.5 text-[10px] font-black tabular-nums" style={{ color: short ? '#f43f5e' : tone.channel === 'p4' ? '#8a6d00' : '#b45309' }}>{p.spCost ? `${p.spCost} SP` : '0 SP'}</span>
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {open1 && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                            <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
                              <span className="min-w-0 text-[11px] font-semibold leading-snug text-gray-600 dark:text-gray-300">
                                {p.power + p.plus}{d.isWeak ? ` × 弱点 ${RAID_WEAK_MULT}` : ''}{d.fullMoon ? ` × 满月 ${RAID_FULL_MOON_MULT}` : ''} = {d.damage}
                                {short ? <span className="block font-black text-rose-500">SP 不够（现在 {sp}）</span> : null}
                              </span>
                              <OrgButton small onClick={() => void strike(p)} disabled={busy || short}>{busy ? '出手中…' : `释放${p.spCost ? ` · ${p.spCost} SP` : ''}`}</OrgButton>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
              {!battleState && <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">逆影战场还没开始，没有 SP：这次先用普攻。</p>}
            </section>
          ) : (
            <Note tone={tone}>
              {opt.struckTonight
                ? <>今日的锋芒已经出过了{myTonight ? `：${myTonight.skill} · ${myTonight.damage}` : ''}。{now.nightIndex < 2 ? '明晚 18:00 再来。' : '这是最后一晚。'}</>
                : '白天不能出手，18:00 开打。'}
            </Note>
          )
        )}

        {/* 总攻击 */}
        {now.phase === 'open' && raid && state && opt && !state.defeated && (
          <div className="flex items-center gap-2.5">
            <OrgButton tone="ghost" onClick={() => void allOut()} disabled={busy || !opt.canAllOut}>总攻击 · {allOutPreview}</OrgButton>
            <span className="text-[11px] font-semibold leading-snug text-gray-500 dark:text-gray-400">
              {opt.allOutUsed ? '这次满月你已经用过了' : !myStat ? '先出一次手才能发动' : opt.allOutNeed > 0 ? `全队再出手 ${opt.allOutNeed} 次解锁` : '已解锁：每人每次满月一次，不花 SP'}
            </span>
          </div>
        )}
        {raid && state?.defeated && (
          <Note tone={tone}>
            {state.stats.has(me) ? `暗影击退！出过手的人各 +${reward} SP，岁时册多一枚印记，据点每人 +${RAID_XP_PER_HITTER} 经验。` : '暗影击退！这次你没赶上，下次满月再一起。'}
            {state.finisher && <span className="mt-1 block text-[11px] font-bold opacity-75">最后一击：{byUser.get(state.finisher) ? displayCodename(byUser.get(state.finisher)!) : '已离开的成员'}{state.finisher === me ? '（就是你）' : ''}</span>}
          </Note>
        )}
        {now.phase === 'after' && raid && state && !state.defeated && <Note tone={tone}>这次还差 {Math.round((state.left / raid.hpMax) * 100)}%。下次满月再来。</Note>}
        {error && <p role="alert" className="text-[12px] font-bold text-rose-600 dark:text-rose-400">{error}</p>}

        {/* 出过手的人（按第一次出手的时间，不排名次） */}
        {raid && state && (
          <div>
            <div className="text-[11px] font-black tracking-[0.18em] text-gray-500 dark:text-gray-400">出过手的人 · {state.hitters.length}</div>
            {state.hitters.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {state.hitters.map(uid => {
                  const m = byUser.get(uid);
                  const st = state.stats.get(uid)!;
                  const name = m ? displayCodename(m) : '已离开的成员';
                  return (
                    <span key={uid} className="inline-flex items-center gap-1.5 py-1 pl-1 pr-2" style={{ background: 'rgba(127,127,127,0.1)', ...chipShape(tone, uid.length) }} aria-label={`${name}：出手 ${st.nights.length} 晚${st.allout ? '，用过总攻击' : ''}`}>
                      <MiniFace member={m} tone={tone} />
                      <span className="max-w-[6em] truncate text-[12px] font-black text-gray-800 dark:text-gray-100">{name}</span>
                      <span aria-hidden className="flex gap-[3px]">
                        {now.nights.map(n => <span key={n} className="h-[6px] w-[6px] rounded-full" style={{ background: st.nights.includes(n) ? barOf(tone) : 'rgba(127,127,127,0.35)' }} />)}
                      </span>
                      {st.allout && <span aria-hidden className="text-[11px] font-black" style={{ color: barOf(tone) }}>★</span>}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1 text-[12px] font-semibold text-gray-500 dark:text-gray-400">还没有人出手。</div>
            )}
          </div>
        )}

        {/* 怎么打 */}
        <div>
          <button type="button" onClick={() => setRulesOpen(o => !o)} aria-expanded={rulesOpen} className="text-[12px] font-black" style={{ color: linkInk }}>
            怎么打 {rulesOpen ? '▴' : '▾'}
          </button>
          {rulesOpen && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] font-semibold leading-relaxed text-gray-600 dark:text-gray-300">
              <li>满月那天的前一晚、当晚、后一晚，每晚 18:00 到第二天 07:00 能出手（按据点的时区）。</li>
              <li>每人每晚出手一次：五张面具左右切，挑一招释放，按那一招的 SP 扣（普攻不花）。伤害 = 威力 + 同伴增伤；打首领的弱点 ×{RAID_WEAK_MULT}，满月当晚 ×{RAID_FULL_MOON_MULT}。</li>
              <li>全队出手满 {allOutThreshold(view.members.length)} 次后能发动总攻击：每人每次满月一次、不花 SP，伤害随全队等级和出手次数涨（现在是 {allOutPreview}）。</li>
              <li>首领的等级就是开团时的据点等级，血量按名册和它定（每高一级 +5%），三晚里据点升级也不变；之后进来的人也能出手。只显示谁出过手，不排名次。</li>
              <li>暗影击退：出过手的人各 +{reward} SP（首领 Lv.1 是 25，每高一级 +5）、岁时册一枚印记，据点每人 +{RAID_XP_PER_HITTER} 经验；这周出过手的人拿「月下同行」。</li>
            </ul>
          )}
        </div>
      </div>
    </SheetModal>
  );
}

function Note({ tone, children }: { tone: OrgTone; children: ReactNode }) {
  return (
    <div className="px-3 py-2.5 text-[13px] font-bold leading-relaxed text-gray-700 dark:text-gray-200" style={{ background: 'rgba(127,127,127,0.08)', ...shapeOf(tone, 9, 6, 12) }}>
      {children}
    </div>
  );
}

/** 出手名单上的小头像：有头像放头像，没有放代号首字 */
function MiniFace({ member, tone }: { member?: OrgMember; tone: OrgTone }) {
  const name = member ? displayCodename(member) : '?';
  const shape: CSSProperties = tone.channel === 'p3' ? { clipPath: slantClip(3) } : tone.channel === 'p5' ? { clipPath: roughQuad((member?.seat ?? 1) + 0.9, 1.5) } : { borderRadius: 999 };
  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden text-[11px] font-black text-white" style={{ background: accentOf(tone), ...shape }}>
      {member?.avatarUrl ? <img src={member.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : [...name][0]}
    </span>
  );
}
