/**
 * 塔屏的塔图 + 侦察卡（第 9 轮 9a · PRD §14.7；预览拍板后并入）。
 *   · 塔图常驻整屏：走过的路是实线、下一步能去的是流动光轨、更远的是淡虚线；
 *     节点按类型分形分色（Shadow / 强敌 / 异变 / 回响 / 月匣 / 金色回响 / 心魔），能去的在呼吸、外面一圈转动的虚线环，选中的四角锁定；
 *     往上三层以外压雾、只剩问号；心魔一直钉在塔顶，滚到看不见塔顶时顶上挂一条心魔血条（点一下滚上去）；
 *     左边是全塔层号，我在的那层高亮、头上有光柱和脉冲；还没踏进第 1 层时，入口在最下面。
 *   · 侦察卡：点能去的房间先看它（类型、层数、离心魔几层；敌人全名 + 小剪影、危险度、HP、弱点、它的属性、词缀、打赢的收获），确认了才进。
 *     月蚀（词缀 / 深渊本周规则）时弱点写「？」；收获按真实的发奖规则算区间。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AttributeId, RelicInstance, Shadow, StratumNode, TowerStratum } from '@/types';
import { NodeGlyph, IconFigure, IconEvilEye, WarGhost } from '@/components/battle/warKit';
import { ShadowSVG } from '@/components/battle/ShadowSVG';
import { absoluteFloor } from '@/battle/tower';
import { AFFIX_POOL, towerRelicBonus } from '@/battle/loot';
import { ABYSS_RULE_THICK_SP, CHEST_MYTH_RATE, DEEPEN_SP_MULT, ECHO_HEAL_PCT, ELITE_LOOT_RATE, FLOOR_SP_BANDS, GOLDEN_SP_MULT, MOON_BOSS_SP, STRATUM_SP_COEF, bossSpReward } from '@/battle/numbers';
import { P5AttrGlyph } from '@/components/p5r/kit';
import { TowerChip, twShape, twSlant, type TowerSkin } from './towerKit';

type NodeType = StratumNode['type'];
export const TOWER_NODE: Record<NodeType, { label: string; color: string; rgb: string }> = {
  mob: { label: 'Shadow', color: '#cbd5f5', rgb: '203,213,245' },
  elite: { label: '强敌', color: '#ff8a4c', rgb: '255,138,76' },
  event: { label: '异变', color: '#c4a1ff', rgb: '196,161,255' },
  echo: { label: '回响', color: '#5eead4', rgb: '94,234,212' },
  chest: { label: '月匣', color: '#fcd34d', rgb: '252,211,77' },
  golden: { label: '金色回响', color: '#fde047', rgb: '253,224,71' },
  boss: { label: '心魔', color: '#ff3d63', rgb: '255,61,99' },
};
export const TOWER_LEGEND: NodeType[] = ['mob', 'elite', 'event', 'echo', 'chest', 'boss'];

const ROW = 88;
const TOP_PAD = 132;
const BOTTOM_PAD = 84;
const GUTTER = 50;

type NodeState = 'done' | 'here' | 'next' | 'ahead' | 'dim' | 'fog' | 'skipped';

/** 心魔还剩多少（三条血都算：伪神有第三条） */
export function bossHpPct(shadow: Shadow | null | undefined): number | null {
  if (!shadow) return null;
  const cur = shadow.currentHp + (shadow.currentHp2 ?? 0) + (shadow.currentHp3 ?? 0);
  const max = shadow.maxHp + (shadow.maxHp2 ?? 0) + (shadow.maxHp3 ?? 0);
  return Math.max(0, Math.min(100, Math.round((cur / Math.max(1, max)) * 100)));
}

/** 这一环 / 这只敌人的弱点是不是藏着（月蚀词缀，或深渊本周规则是月蚀） */
const weakHidden = (stratum: TowerStratum, affixes: string[] | undefined) =>
  !!affixes?.includes('eclipse') || (!!stratum.abyssRing && stratum.abyssRuleId === 'eclipse');

export function RouteMap({ stratum, shadow, skin, reachable, selected, interactive, still, onPick }: {
  stratum: TowerStratum;
  shadow: Shadow | null;
  skin: TowerSkin;
  reachable: Set<string>;
  selected: string | null;
  interactive: boolean;
  /** 粗犷度关掉：滚动用瞬时 */
  still: boolean;
  onPick: (n: StratumNode) => void;
}) {
  const s = stratum;
  const cur = s.nodes.find(n => n.id === s.currentNodeId) ?? null;
  const cf = cur?.floor ?? 0;
  const fogFloor = cf + 3;
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(366);
  const [scrollTop, setScrollTop] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = TOP_PAD + s.floors * ROW + BOTTOM_PAD;
  const yOf = (f: number) => H - BOTTOM_PAD - (f - 0.5) * ROW;
  const xOf = (lane: number) => GUTTER + (w - GUTTER - 10) * ((lane + 0.5) / 3);
  const hereX = cur ? xOf(cur.lane) : xOf(1);
  const hereY = cur ? yOf(cur.floor) : yOf(0) + 8;

  // 打开时 / 换了位置：把我在的那层放在视口偏下（往上看得到两三层；塔顶靠钉住的心魔条）
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    el.scrollTop = Math.max(0, hereY - el.clientHeight * 0.68);
    setScrollTop(el.scrollTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, s.currentNodeId]);

  const stateOf = (n: StratumNode): NodeState => {
    if (cur && n.id === cur.id) return 'here';
    if (n.cleared) return 'done';
    if (reachable.has(n.id)) return 'next';
    if (n.floor < cf) return 'skipped';
    if (n.floor <= cf + 2) return 'ahead';
    if (n.floor === fogFloor) return 'dim';
    return 'fog';
  };

  const edges = useMemo(() => {
    const out: Array<{ key: string; d: string; kind: 'walked' | 'next' | 'past' | 'future' | 'fog'; to: string }> = [];
    const byId = new Map(s.nodes.map(n => [n.id, n]));
    for (const n of s.nodes) {
      for (const tid of n.edges) {
        const t = byId.get(tid);
        if (!t) continue;
        const x1 = xOf(n.lane), y1 = yOf(n.floor) - 22;
        const x2 = xOf(t.lane), y2 = yOf(t.floor) + (t.type === 'boss' ? 34 : 22);
        const d = `M ${x1} ${y1} C ${x1} ${y1 - 28}, ${x2} ${y2 + 28}, ${x2} ${y2}`;
        const walked = n.cleared && t.cleared;
        const kind = walked ? 'walked' : cur && n.id === cur.id && reachable.has(t.id) ? 'next' : n.floor < cf ? 'past' : t.floor > fogFloor ? 'fog' : 'future';
        out.push({ key: `${n.id}-${t.id}`, d, kind, to: t.id });
      }
    }
    // 还没进第 1 层：从入口连到第 1 层
    if (!cur) {
      for (const t of s.nodes.filter(n => n.floor === 1)) {
        const x1 = xOf(1), y1 = yOf(0) - 6;
        const x2 = xOf(t.lane), y2 = yOf(1) + 22;
        out.push({ key: `entry-${t.id}`, d: `M ${x1} ${y1} C ${x1} ${y1 - 24}, ${x2} ${y2 + 24}, ${x2} ${y2}`, kind: reachable.has(t.id) ? 'next' : 'future', to: t.id });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, s.nodes, s.currentNodeId, reachable]);

  const boss = s.nodes.find(n => n.type === 'boss');
  const pct = bossHpPct(shadow);
  const bossName = s.moonBossPending ? '显形中…' : shadow?.name ?? '心魔';

  return (
    <div ref={wrap} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)} className="relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="塔图">
      {/* 心魔钉在塔顶：滚到看不见塔顶时，顶上挂一条（点一下滚上去） */}
      <div className="sticky top-0 z-30 h-0">
        <AnimatePresence>
          {boss && scrollTop > yOf(s.floors) - 40 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              onClick={() => wrap.current?.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })}
              aria-label={`心魔 ${bossName}${pct !== null ? `，还剩 ${pct}%` : ''}，还有 ${s.floors - cf} 层；点一下看塔顶`}
              className="absolute inset-x-2 top-1 flex items-center gap-2 px-3 py-1.5 text-left text-white"
              style={{ background: 'linear-gradient(90deg, rgba(80,6,28,0.92), rgba(30,4,16,0.85))', boxShadow: '0 0 0 1px rgba(255,61,99,0.55), 0 6px 22px rgba(255,61,99,0.25)', ...twShape(skin, 5.5, 10, 12) }}
            >
              <span className="tw-anim flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(255,61,99,0.2)', color: '#ffd1da', boxShadow: '0 0 12px rgba(255,61,99,0.7)', animation: 'tw-breathe 2.2s ease-in-out infinite' }}><IconEvilEye size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-black leading-tight">{shadow?.moonSlot ? '满月心魔' : '心魔'} · {bossName}</span>
                {pct !== null && (
                  <span className="mt-1 block h-[4px] w-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)', clipPath: twSlant(3) }}>
                    <span className="block h-full" style={{ width: `${pct}%`, background: TOWER_NODE.boss.color }} />
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right leading-tight">
                {pct !== null && <span className="block text-[13px] font-black tabular-nums" style={{ color: TOWER_NODE.boss.color }}>{pct}%</span>}
                <span className="block text-[9px] font-bold text-white/55">还有 {s.floors - cf} 层 ↑</span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="relative" style={{ height: H }}>
        <WarGhost text="ASCEND" className="text-[64px]" style={{ right: -6, top: Math.max(0, hereY + 40), color: `rgba(${skin.accentRgb},0.05)` }} />
        {/* 我在的位置往上打一道光柱 */}
        <div aria-hidden className="tw-anim pointer-events-none absolute" style={{ left: hereX - 18, top: hereY - 190, width: 36, height: 170, background: `linear-gradient(0deg, rgba(${skin.selRgb},0.32), rgba(${skin.selRgb},0))`, filter: 'blur(6px)', animation: 'tw-beam 2.6s ease-in-out infinite', zIndex: 1 }} />

        {/* 层号脊柱（全塔层号；顶层写 TOP） */}
        {Array.from({ length: s.floors }, (_, i) => i + 1).map(f => {
          const isCur = f === cf;
          const isBoss = f === s.floors;
          return (
            <div key={f} className="absolute left-0 flex items-center" style={{ top: yOf(f) - 14, height: 28, width: GUTTER - 4 }}>
              <span
                className={`block w-full text-right font-black italic leading-none tabular-nums ${isCur ? 'text-[19px]' : 'text-[16px]'}`}
                style={isCur
                  ? { color: skin.sel, textShadow: `0 0 12px rgba(${skin.selRgb},0.8)` }
                  : { color: 'transparent', WebkitTextStroke: `1px rgba(255,255,255,${f > fogFloor && !isBoss ? 0.12 : 0.3})` }}
              >
                {isBoss ? 'TOP' : `${absoluteFloor(s, f)}F`}
              </span>
            </div>
          );
        })}
        <div aria-hidden className="absolute bottom-0 top-0" style={{ left: GUTTER + 2, width: 1, background: `linear-gradient(180deg, transparent, rgba(${skin.selRgb},0.25) 30%, rgba(${skin.selRgb},0.25) 80%, transparent)` }} />
        {cf > 0 && <div aria-hidden className="absolute right-0" style={{ left: GUTTER, top: yOf(cf) - 1, height: 2, background: `linear-gradient(90deg, rgba(${skin.selRgb},0.5), transparent)` }} />}

        {/* 连线 */}
        <svg className="pointer-events-none absolute inset-0" width={w} height={H} aria-hidden>
          {edges.map(e => {
            const isSel = e.kind === 'next' && e.to === selected;
            const stroke = e.kind === 'walked' || e.kind === 'next' ? skin.sel
              : e.kind === 'past' ? 'rgba(255,255,255,0.08)'
                : e.kind === 'fog' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.2)';
            return (
              <path
                key={e.key}
                d={e.d}
                fill="none"
                stroke={stroke}
                strokeWidth={e.kind === 'walked' ? 3 : e.kind === 'next' ? (isSel ? 3.5 : 2.5) : 1.5}
                strokeDasharray={e.kind === 'next' ? '7 5' : e.kind === 'future' || e.kind === 'fog' ? '2 6' : undefined}
                strokeLinecap="round"
                className={e.kind === 'next' ? 'tw-anim' : undefined}
                style={{
                  animation: e.kind === 'next' ? `tw-flow ${isSel ? 0.5 : 0.9}s linear infinite` : undefined,
                  filter: e.kind === 'walked' || e.kind === 'next' ? `drop-shadow(0 0 ${isSel ? 6 : 4}px rgba(${skin.selRgb},0.9))` : undefined,
                  opacity: e.kind === 'next' && selected && !isSel ? 0.45 : 1,
                }}
              />
            );
          })}
        </svg>

        {/* 雾：往上三层以外 */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ height: Math.max(0, yOf(fogFloor) + ROW * 0.2), background: 'linear-gradient(180deg, rgba(5,8,26,0.96) 0%, rgba(5,8,26,0.88) 55%, rgba(5,8,26,0) 100%)', zIndex: 3 }}>
          <div className="tw-anim absolute left-[-20%] top-[30%] h-24 w-[90%] rounded-full blur-2xl" style={{ background: 'rgba(160,180,255,0.07)', animation: 'tw-drift 14s ease-in-out infinite' }} />
          <div className="tw-anim absolute right-[-25%] top-[58%] h-20 w-[80%] rounded-full blur-2xl" style={{ background: `rgba(${skin.accentRgb},0.06)`, animation: 'tw-drift 18s ease-in-out -6s infinite' }} />
        </div>

        {/* 入口（还没踏进第 1 层时，人站在这里） */}
        {!cur && (
          <div className="absolute flex flex-col items-center" style={{ left: xOf(1) - 40, top: yOf(0) - 18, width: 80, zIndex: 5 }}>
            {[0, 1].map(i => (
              <span key={i} aria-hidden className="tw-anim absolute left-1/2 top-[10px] block rounded-full" style={{ width: 34, height: 34, marginLeft: -17, boxShadow: `0 0 0 2px rgba(${skin.selRgb},0.8)`, animation: `tw-pulse 1.8s ease-out ${i * 0.9}s infinite` }} />
            ))}
            <span className="tw-anim relative mt-[16px]" style={{ color: skin.sel, animation: 'tw-bob 2.4s ease-in-out infinite' }}><IconFigure size={18} /></span>
            <span className="mt-1 rounded px-1.5 text-[10px] font-black text-white/70" style={{ background: 'rgba(5,8,26,0.82)' }}>入口</span>
          </div>
        )}

        {/* 节点 */}
        {s.nodes.map(n => (n.type === 'boss' ? null : (
          <MapNode
            key={n.id}
            node={n}
            state={stateOf(n)}
            live={interactive && reachable.has(n.id)}
            skin={skin}
            x={xOf(n.lane)}
            y={yOf(n.floor)}
            selected={n.id === selected}
            onPick={() => onPick(n)}
          />
        )))}

        {/* 心魔：钉在塔顶，压在雾上面 */}
        {boss && (
          <BossNode
            skin={skin}
            x={xOf(boss.lane)}
            y={yOf(boss.floor)}
            pct={pct}
            name={bossName}
            moon={!!shadow?.moonSlot || !!s.moonBossPending}
            live={interactive && reachable.has(boss.id)}
            selected={boss.id === selected}
            onPick={() => onPick(boss)}
          />
        )}
      </div>
    </div>
  );
}

// ── 节点 ─────────────────────────────────────────────────────────────────────

function MapNode({ node, state, live, skin, x, y, selected, onPick }: { node: StratumNode; state: NodeState; live: boolean; skin: TowerSkin; x: number; y: number; selected: boolean; onPick: () => void }) {
  const t = TOWER_NODE[node.type];
  const size = 46;
  const fog = state === 'fog';
  const ring = selected || live || state === 'here' ? skin.sel : `rgba(${t.rgb},${state === 'done' || state === 'skipped' ? 0.25 : state === 'dim' ? 0.35 : 0.6})`;
  const fill = selected ? skin.sel : fog ? 'rgba(255,255,255,0.02)' : state === 'here' ? `rgba(${skin.selRgb},0.22)` : 'rgba(8,10,34,0.9)';
  const glyphColor = selected ? skin.onSel : fog ? 'rgba(255,255,255,0.18)' : state === 'done' || state === 'skipped' ? 'rgba(255,255,255,0.3)' : state === 'dim' ? `rgba(${t.rgb},0.5)` : t.color;
  const shape: CSSProperties = skin.ch === 'p3'
    ? { clipPath: 'polygon(14% 0, 100% 0, 86% 100%, 0 100%)' }
    : skin.ch === 'p5'
      ? { clipPath: skin.shape(node.floor * 3 + node.lane + 0.5, 4) }
      : skin.ch === 'p4'
        ? { borderRadius: 12 }
        : { borderRadius: 999 };
  const outer = skin.ch === 'p3' ? size + 10 : size;
  const name = node.mob?.name;
  return (
    <div className="absolute" style={{ left: x - outer / 2, top: y - size / 2, width: outer, zIndex: fog ? 2 : 5 }}>
      {/* 悬浮台：节点脚下一圈光 */}
      {!fog && state !== 'skipped' && (
        <span aria-hidden className="pointer-events-none absolute left-1/2 block" style={{ top: size - 8, width: outer + 30, height: 16, marginLeft: -(outer + 30) / 2, borderRadius: '50%', background: `radial-gradient(ellipse at center, rgba(${live || selected ? skin.selRgb : t.rgb},${live || selected ? 0.45 : state === 'here' ? 0.4 : 0.18}), transparent 70%)` }} />
      )}
      {/* 现在的位置：两圈脉冲 + 头上的小人 */}
      {state === 'here' && (
        <>
          {[0, 1].map(i => (
            <span key={i} aria-hidden className="tw-anim absolute left-1/2 block rounded-full" style={{ top: 0, width: size, height: size, marginLeft: -size / 2, boxShadow: `0 0 0 2px rgba(${skin.selRgb},0.8)`, animation: `tw-pulse 1.8s ease-out ${i * 0.9}s infinite` }} />
          ))}
          <span className="tw-anim absolute -top-[26px] left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ animation: 'tw-bob 2.4s ease-in-out infinite', color: skin.sel }}>
            <IconFigure size={16} />
          </span>
        </>
      )}
      {/* 能去的：一圈慢慢转的虚线环 */}
      {live && !selected && (
        <svg aria-hidden className="tw-anim pointer-events-none absolute left-1/2" width={size + 22} height={size + 22} style={{ top: -11, marginLeft: -(size + 22) / 2, animation: 'tw-spin 7s linear infinite' }}>
          <circle cx={(size + 22) / 2} cy={(size + 22) / 2} r={(size + 18) / 2} fill="none" stroke={`rgba(${skin.selRgb},0.7)`} strokeWidth="1.5" strokeDasharray="5 6" />
        </svg>
      )}
      {/* 选中：四角锁定框 */}
      {selected && (
        <span aria-hidden className="tw-anim pointer-events-none absolute left-1/2 block" style={{ top: -13, width: outer + 26, height: size + 26, marginLeft: -(outer + 26) / 2, animation: 'tw-lock 1.2s ease-in-out infinite', zIndex: 8 }}>
          {[['left-0 top-0', 'border-l-[3px] border-t-[3px]'], ['right-0 top-0', 'border-r-[3px] border-t-[3px]'], ['left-0 bottom-0', 'border-l-[3px] border-b-[3px]'], ['right-0 bottom-0', 'border-r-[3px] border-b-[3px]']].map(([pos, b]) => (
            <span key={pos} className={`absolute h-4 w-4 ${pos} ${b}`} style={{ borderColor: skin.sel, filter: `drop-shadow(0 0 4px rgba(${skin.selRgb},0.9))` }} />
          ))}
        </span>
      )}
      <motion.button
        type="button"
        onClick={onPick}
        disabled={!live}
        whileTap={live ? { scale: 0.92 } : undefined}
        aria-label={fog ? '迷雾里的房间' : `${t.label}${name ? ` · ${name}` : ''}${live ? '（可以去，点一下先侦察）' : state === 'done' ? '（走过了）' : ''}`}
        className={`relative mx-auto flex items-center justify-center ${live && !selected ? 'tw-anim' : ''}`}
        style={{
          width: outer, height: size,
          background: fill,
          boxShadow: skin.ch === 'p4'
            ? `0 0 0 2px ${fog ? 'rgba(255,255,255,0.12)' : ring}, ${live || selected ? `0 0 16px rgba(${skin.selRgb},0.6)` : '3px 3px 0 0 rgba(0,0,0,0.55)'}`
            : `inset 0 0 0 ${selected || live ? 2 : 1.5}px ${fog ? 'rgba(255,255,255,0.14)' : ring}${live || selected ? `, 0 0 18px rgba(${skin.selRgb},0.55)` : ''}`,
          animation: live && !selected ? 'tw-breathe 1.8s ease-in-out infinite' : undefined,
          outline: fog ? '1px dashed rgba(255,255,255,0.14)' : undefined,
          outlineOffset: -4,
          ...shape,
        }}
      >
        <span style={{ color: glyphColor }}>{fog ? <span className="text-[16px] font-black">?</span> : <NodeGlyph type={node.type} size={20} />}</span>
        {state === 'done' && (
          <span aria-hidden className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black" style={{ background: skin.sel, color: skin.onSel }}>✓</span>
        )}
      </motion.button>
      {!fog && state !== 'skipped' && (
        <div className="relative mt-1.5 flex flex-col items-center leading-tight">
          <span className="whitespace-nowrap rounded px-1.5 py-[1px] text-[10px] font-black" style={{ background: 'rgba(5,8,26,0.82)', color: selected || live ? '#fff' : `rgba(255,255,255,${state === 'dim' || state === 'done' ? 0.4 : 0.65})` }}>{t.label}</span>
          {(live || selected) && name && <span className="mt-[2px] max-w-[104px] truncate whitespace-nowrap rounded px-1.5 text-[9px] font-bold text-white/70" style={{ background: 'rgba(5,8,26,0.82)' }}>{name}</span>}
        </div>
      )}
    </div>
  );
}

function BossNode({ skin, x, y, pct, name, moon, live, selected, onPick }: { skin: TowerSkin; x: number; y: number; pct: number | null; name: string; moon: boolean; live: boolean; selected: boolean; onPick: () => void }) {
  const size = 66;
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="absolute" style={{ left: x - 64, top: y - size / 2 - 64, width: 128, zIndex: 6 }}>
      <div className="mb-2 text-center leading-tight text-white">
        <div className="text-[10px] font-black tracking-[0.3em]" style={{ color: TOWER_NODE.boss.color }}>{moon ? '满月心魔 · TOP' : '心魔 · TOP'}</div>
        <div className="truncate text-[14px] font-black" style={{ fontFamily: skin.titleFont }}>{name}</div>
        {pct !== null && (
          <div className="mx-auto mt-1 h-[4px] w-[84px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)', clipPath: twSlant(3) }}>
            <div className="h-full" style={{ width: `${pct}%`, background: TOWER_NODE.boss.color, boxShadow: `0 0 8px ${TOWER_NODE.boss.color}` }} />
          </div>
        )}
      </div>
      <motion.button
        type="button"
        onClick={onPick}
        disabled={!live}
        whileTap={live ? { scale: 0.94 } : undefined}
        aria-label={`心魔 · ${name}${pct !== null ? `，还剩 ${pct}%` : ''}${live ? '（可以挑战，点一下先侦察）' : ''}`}
        className="relative mx-auto block"
        style={{ width: size + 24, height: size + 24 }}
      >
        <svg className="absolute inset-0" viewBox="0 0 90 90" aria-hidden>
          <circle cx="45" cy="45" r={r} fill="none" stroke="rgba(255,61,99,0.18)" strokeWidth="3" />
          {pct !== null && <circle cx="45" cy="45" r={r} fill="none" stroke={TOWER_NODE.boss.color} strokeWidth="3" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 45 45)" strokeLinecap="round" />}
        </svg>
        <span aria-hidden className="tw-anim absolute left-1/2 top-1/2 block rounded-full" style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, boxShadow: `0 0 0 2px ${selected || live ? `rgba(${skin.selRgb},0.8)` : 'rgba(255,61,99,0.6)'}`, animation: 'tw-pulse 2.6s ease-out infinite' }} />
        <span className="absolute left-1/2 top-1/2 flex items-center justify-center" style={{ width: size - 12, height: size - 12, marginLeft: -(size - 12) / 2, marginTop: -(size - 12) / 2, transform: 'rotate(45deg)', background: 'radial-gradient(circle, rgba(255,61,99,0.35), rgba(30,4,16,0.95))', boxShadow: `0 0 26px rgba(255,61,99,0.6), inset 0 0 0 2px ${selected ? skin.sel : 'rgba(255,61,99,0.85)'}`, borderRadius: skin.ch === 'p4' || skin.ch === 'neutral' ? 10 : 0 }}>
          <span style={{ transform: 'rotate(-45deg)', color: '#ffd1da' }}><IconEvilEye size={28} /></span>
        </span>
      </motion.button>
    </div>
  );
}

// ── 侦察卡 ───────────────────────────────────────────────────────────────────

/** 打赢的收获：照真实的发奖规则（层段区间 × 区层系数 × 异变加深；金色 ×1.5；深渊厚甲 ×1.5；贪婪 ×1.5；罗盘遗物 +%）算一个区间 */
export function scoutReward(stratum: TowerStratum, node: StratumNode, shadow: Shadow | null, relics: RelicInstance[] | undefined): string {
  const { nodeSpPct } = towerRelicBonus(relics);
  const affixes = node.type === 'boss' ? shadow?.affixes : node.mob?.affixes;
  const mult = (v: number) => {
    let x = v;
    if (stratum.abyssRing && stratum.abyssRuleId === 'thick_armor') x = Math.round(x * ABYSS_RULE_THICK_SP);
    if (affixes?.includes('greedy')) x = Math.round(x * 1.5);
    if (nodeSpPct > 0) x = Math.round(x * (1 + nodeSpPct));
    return x;
  };
  if (node.type === 'boss') {
    const base = mult(bossSpReward(stratum.level, stratum.deepenCount));
    return `+${base} SP${shadow?.moonSlot ? ` · 满月 +${MOON_BOSS_SP} SP` : ''}`;
  }
  if (node.type === 'chest') return `+${node.lootSp ?? 0} SP · 必得战利品`;
  const band = FLOOR_SP_BANDS[node.floor <= 4 ? 0 : node.floor <= 8 ? 1 : 2];
  const coef = STRATUM_SP_COEF[Math.min(4, Math.max(0, stratum.level - 1))] * Math.pow(DEEPEN_SP_MULT, stratum.deepenCount);
  const g = node.type === 'golden' ? GOLDEN_SP_MULT : 1;
  const lo = mult(Math.max(1, Math.round(Math.max(1, Math.round(band[0] * coef)) * g)));
  const hi = mult(Math.max(1, Math.round(Math.max(1, Math.round(band[1] * coef)) * g)));
  const sp = lo === hi ? `+${lo} SP` : `+${lo}～${hi} SP`;
  if (node.type === 'elite') return `${sp} · ${Math.round(ELITE_LOOT_RATE * 100)}% 掉战利品`;
  if (node.type === 'golden') return `${sp} · 必掉满月品质`;
  return sp;
}

export function TowerScoutCard({ skin, stratum, node, shadow, relics, echoHealPct, attrNames, interactive, onEnter, onBack }: {
  skin: TowerSkin;
  stratum: TowerStratum;
  node: StratumNode;
  shadow: Shadow | null;
  relics: RelicInstance[] | undefined;
  /** 回响回复比例（含遗物加成） */
  echoHealPct: number;
  attrNames: Record<AttributeId, string>;
  interactive: boolean;
  onEnter: () => void;
  onBack: () => void;
}) {
  const t = TOWER_NODE[node.type];
  const isBoss = node.type === 'boss';
  const mob = node.mob;
  const fight = node.type === 'mob' || node.type === 'elite' || node.type === 'golden' || isBoss;
  const pending = isBoss && !!stratum.moonBossPending;
  const affixes = isBoss ? shadow?.affixes ?? [] : mob?.affixes ?? [];
  const hidden = weakHidden(stratum, affixes);
  const weak = isBoss ? shadow?.weakAttribute : mob?.weakAttribute;
  const attr = isBoss ? undefined : mob?.attribute;
  const hp = isBoss ? (shadow ? shadow.maxHp + (shadow.maxHp2 ?? 0) + (shadow.maxHp3 ?? 0) : null) : mob?.maxHp ?? null;
  const phases = isBoss && shadow ? 1 + (shadow.maxHp2 ? 1 : 0) + (shadow.maxHp3 ? 1 : 0) : 1;
  const danger = isBoss ? 3 : node.type === 'elite' ? 3 : node.type === 'golden' ? 2 : node.type === 'mob' ? 1 : 0;
  const name = isBoss ? (pending ? '月度心魔显形中' : shadow?.name ?? '心魔') : mob?.name;
  const toBoss = stratum.floors - node.floor;
  const shell: CSSProperties = skin.ch === 'p4'
    ? { background: '#14110a', borderRadius: 18, boxShadow: `0 0 0 2.5px ${skin.accent}, 6px 6px 0 0 rgba(0,0,0,0.7)` }
    : skin.ch === 'p5'
      ? { background: '#050505', clipPath: skin.shape(node.floor + 0.77, 6), boxShadow: 'inset 0 0 0 2.5px #f8f8f6' }
      : skin.ch === 'p3'
        ? { background: 'linear-gradient(160deg, rgba(10,26,60,0.97), rgba(6,12,34,0.97))', clipPath: twSlant(16), boxShadow: `inset 0 0 0 1.5px rgba(${skin.accentRgb},0.55)` }
        : { background: 'rgba(20,12,44,0.97)', borderRadius: 20, boxShadow: `inset 0 0 0 1.5px rgba(${skin.accentRgb},0.45), 0 -10px 40px rgba(0,0,0,0.5)` };
  const enterLabel = !interactive ? '今晚已结束' : pending ? '显形中，稍后再来' : isBoss ? '挑战心魔' : fight ? '进入战斗' : node.type === 'chest' ? '开匣' : node.type === 'echo' ? '进去看看' : '进去看看';
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className="relative overflow-hidden px-4 pb-4 pt-3.5 text-white"
      style={shell}
      role="dialog"
      aria-label={`侦察：${t.label}${name ? ` ${name}` : ''}`}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: t.color }} />
      <div aria-hidden className="tw-anim absolute inset-y-0 left-0 w-1/3" style={{ background: `linear-gradient(90deg, transparent, rgba(${t.rgb},0.08), transparent)`, animation: 'tw-sheen 3.2s ease-in-out infinite' }} />
      {skin.ch === 'p3' && <div aria-hidden className="absolute right-6 top-0 h-[5px] w-10" style={{ background: skin.hot, clipPath: twSlant(3) }} />}

      <div className="relative flex items-center gap-2">
        <span className="flex items-center gap-1 px-2 py-[3px] text-[11px] font-black" style={{ background: t.color, color: '#12091c', ...twShape(skin, 2.2, 5, 999) }}>
          <NodeGlyph type={node.type} size={12} />{t.label}
        </span>
        <span className="text-[11px] font-black tabular-nums text-white/60">{isBoss ? 'TOP' : `${absoluteFloor(stratum, node.floor)}F`}</span>
        {!isBoss && <span className="text-[10px] font-bold text-white/40">· 离心魔还有 {toBoss} 层</span>}
        <span className="ml-auto text-[10px] font-black tracking-[0.25em] text-white/35">SCOUT</span>
      </div>

      {fight ? (
        <>
          <div className="relative mt-2 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[22px] font-black leading-tight" style={{ fontFamily: skin.titleFont }}>{name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] font-bold text-white/50">
                {isBoss ? `区层之主${phases > 1 ? ` · ${phases} 段血` : ''}` : mob?.tier === 'elite' ? '强敌 · 带词缀' : node.type === 'golden' ? '稀有影 · 打赢必掉满月品质' : '小影'}
                <span className="flex items-center gap-[3px]" aria-label={`危险度 ${danger} / 3`}>
                  <span className="text-[9px] font-black tracking-[0.15em] text-white/40">危险</span>
                  {[0, 1, 2].map(i => <span key={i} className="block h-[8px] w-[12px]" style={{ background: i < danger ? '#ff5c5c' : 'rgba(255,255,255,0.12)', clipPath: twSlant(3) }} />)}
                </span>
              </div>
            </div>
            {!pending && (
              <div className="relative -my-4 -mr-2 shrink-0 overflow-hidden" style={{ width: 84, height: 84, flex: '0 0 84px' }}>
                <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, rgba(${t.rgb},0.35), transparent 68%)` }} />
                <div className="absolute left-1/2 top-1/2 flex items-center justify-center" style={{ width: 180, height: 190, marginLeft: -90, marginTop: -95, transform: 'scale(0.48)' }}>
                  <ShadowSVG level={isBoss ? Math.max(3, stratum.level) : mob?.tier === 'elite' ? 3 : 2} isHurt={false} isWeak={false} offBalance={false} damageNumbers={[]} weakAttribute={hidden ? undefined : weak} />
                </div>
              </div>
            )}
          </div>
          {!pending && (
            <div className="relative mt-3 grid grid-cols-3 gap-2">
              <ScoutStat label="HP" value={hp !== null ? String(hp) : '—'} color="#ff9b9b" />
              <ScoutStat label="弱点" value={hidden || !weak ? '？' : attrNames[weak] ?? weak} color="#fca5a5" glyph={!hidden && weak ? <P5AttrGlyph id={weak} size={13} color="#fca5a5" /> : undefined} />
              <ScoutStat label="它的属性" value={attr ? attrNames[attr] ?? attr : isBoss ? '—' : '—'} color="rgba(255,255,255,0.85)" glyph={attr ? <P5AttrGlyph id={attr} size={13} color="rgba(255,255,255,0.85)" /> : undefined} />
            </div>
          )}
          {affixes.length > 0 && !pending && (
            <div className="relative mt-2.5 flex flex-wrap gap-1.5">
              {affixes.map(a => <TowerChip key={a} skin={skin} tone="danger">{AFFIX_POOL[a]?.name ?? a} · {AFFIX_POOL[a]?.desc ?? ''}</TowerChip>)}
            </div>
          )}
          {pending ? (
            <p className="relative mt-2 text-[12px] font-semibold leading-relaxed text-white/70">满月当晚的心魔还在显形，生成好会自动换进塔顶，到时候再来。</p>
          ) : (
            <div className="relative mt-2.5 flex items-center gap-2 text-[11px] font-bold text-white/70">
              <span className="text-white/45">打赢</span><span style={{ color: '#fde68a' }}>{scoutReward(stratum, node, shadow, relics)}</span>
            </div>
          )}
        </>
      ) : (
        <div className="relative mt-2">
          <div className="text-[20px] font-black leading-tight" style={{ fontFamily: skin.titleFont }}>{t.label}</div>
          <p className="mt-1 text-[12px] font-semibold leading-relaxed text-white/70">
            {node.type === 'chest'
              ? `开匣必得一件战利品（遗物 ${Math.round((1 - CHEST_MYTH_RATE) * 100)}% / 迷思 ${Math.round(CHEST_MYTH_RATE * 100)}%），另加 ${node.lootSp ?? 0} SP。`
              : node.type === 'echo'
                ? `二选一：回复 ${Math.round(echoHealPct * 100)}% HP，或者今晚攻击 +6%（月辉）。`
                : '未知的遭遇：可能是一段回忆、一块石碑，也可能是一场遭遇战。'}
          </p>
        </div>
      )}

      <div className="relative mt-3.5 flex gap-2">
        <button type="button" onClick={onBack} className="h-11 px-4 text-[13px] font-black text-white/75" style={{ ...twShape(skin, 9, 8, 12), background: 'rgba(255,255,255,0.08)' }}>再看看</button>
        <motion.button
          type="button"
          whileTap={interactive && !pending ? { scale: 0.97 } : undefined}
          disabled={!interactive || pending}
          onClick={onEnter}
          className="relative h-11 flex-1 overflow-hidden text-[15px] font-black disabled:opacity-50"
          style={{ ...twShape(skin, 11, 10, 12), background: skin.accent, color: skin.onAccent, boxShadow: skin.ch === 'p4' ? '0 0 0 2px #131313, 4px 4px 0 0 rgba(0,0,0,0.7)' : `0 0 22px rgba(${skin.accentRgb},0.45)` }}
        >
          <span aria-hidden className="tw-anim absolute inset-y-0 left-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)', animation: 'tw-sheen 2.4s ease-in-out infinite' }} />
          <span className="relative">{enterLabel}</span>
        </motion.button>
      </div>
    </motion.div>
  );
}

function ScoutStat({ label, value, color, glyph }: { label: string; value: string; color: string; glyph?: ReactNode }) {
  return (
    <div className="min-w-0 px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.05)', clipPath: twSlant(6) }}>
      <div className="text-[9px] font-black tracking-[0.2em] text-white/40">{label}</div>
      <div className="mt-1 flex min-w-0 items-center gap-1 text-[15px] font-black leading-none" style={{ color }}>{glyph}<span className="truncate">{value}</span></div>
    </div>
  );
}

/** 回响的回复比例（含遗物加成），给侦察卡用 */
export const echoHealPctOf = (relics: RelicInstance[] | undefined) => ECHO_HEAL_PCT + towerRelicBonus(relics).echoHealAdd;

