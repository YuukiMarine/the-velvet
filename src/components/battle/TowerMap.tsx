/**
 * 影时间高塔 · 塔层攀升图（批2c-iii 潜入感精装）
 *
 * ⑧ 垂直视差（月亮/雾层随滚动慢速位移）+ 战争迷雾（上方未达层只见剪影与浓雾）
 * ⑨ 悬浮月台（节点台沿）+ SVG 光轨连线（走过亮 / 可达半亮 / 未知虚线）+ 当前位置人物剪影
 * ⑩ 区层色温递进（STRATUM_PALETTE：月白→青→靛→紫→绯）
 * 打开时自动定位到当前所在层。
 */
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { StratumNode, TowerStratum } from '@/types';
import { reachableNodeIds, absoluteFloor } from '@/battle/tower';
import { NodeGlyph, IconFigure, IconEvilEye, paletteFor, ABYSS_PALETTE, WarGhost, slantPoly } from '@/components/battle/warKit';
import { useBoldness } from '@/utils/boldness';

const NODE_LABEL: Record<StratumNode['type'], string> = {
  mob: 'Shadow', elite: '强敌', event: '异变', echo: '回响', chest: '月匣', boss: '心魔', golden: '金色回响',
};

type Visibility = 'full' | 'dim' | 'silhouette' | 'fog';

interface Props {
  stratum: TowerStratum;
  /** 今晚已登塔且 session 未结束时可交互 */
  interactive: boolean;
  onSelectNode: (node: StratumNode) => void;
  /** 独立塔界面内铺满可用高度 */
  fill?: boolean;
}

const laneCenter = (lane: number) => ((lane + 0.5) / 3) * 100;

type Pal = ReturnType<typeof paletteFor>;

/**
 * 单个节点方块。抽出来是因为 FS6 的收起态要复用同一套视觉——
 * 两处各画一遍的话，改一次节点样式就会漏掉另一处（塔图/迷你图看着像两个游戏）。
 */
function TowerNodeButton({
  node, pal, isCurrent, canGo, locked, hideDetail, onSelect, compact = false, gridColumnStart,
}: {
  node: StratumNode;
  pal: Pal;
  isCurrent: boolean;
  canGo: boolean;
  locked: boolean;
  hideDetail: boolean;
  onSelect: (n: StratumNode) => void;
  /** 迷你图里字号/内距收一档 */
  compact?: boolean;
  /** 三栏网格里的列位（1..3）；不传则由外层布局决定 */
  gridColumnStart?: number;
}) {
  return (
    <motion.button
      whileTap={canGo ? { scale: 0.94 } : undefined}
      onClick={() => canGo && onSelect(node)}
      disabled={!canGo}
      className={`relative flex flex-col items-center justify-center transition-all ${compact ? 'pb-1.5 pt-1' : 'pb-2 pt-1.5'}`}
      style={{
        gridColumnStart,
        clipPath: slantPoly(8),
        background: node.cleared
          ? 'rgba(255,255,255,0.035)'
          : isCurrent
            ? `rgba(${pal.accentRgb}, 0.28)`
            : canGo
              ? `rgba(${pal.accentRgb}, 0.15)`
              : 'rgba(255,255,255,0.045)',
        boxShadow: isCurrent
          ? `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.85), 0 0 12px rgba(${pal.accentRgb}, 0.35)`
          : canGo
            ? `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.5), 0 0 10px rgba(${pal.accentRgb}, 0.28)`
            : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
        opacity: node.cleared ? 0.5 : locked ? 0.45 : 1,
      }}
    >
      {canGo && (
        <motion.span
          className="pointer-events-none absolute inset-0"
          animate={{ opacity: [0.2, 0.55, 0.2] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          style={{ clipPath: slantPoly(8), boxShadow: `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.8)` }}
        />
      )}
      {/* ⑨ 当前位置人物剪影 */}
      {isCurrent && (
        <motion.span
          className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2"
          animate={{ y: [0, -2.5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ color: pal.accent, filter: `drop-shadow(0 0 5px rgba(${pal.accentRgb}, 0.9))` }}
        >
          <IconFigure size={13} />
        </motion.span>
      )}
      <span
        className="leading-none"
        style={{
          color: node.cleared
            ? 'rgba(255,255,255,0.32)'
            : node.type === 'boss' ? '#ff8fa3'
            : node.type === 'golden' ? '#fcd34d'
            : 'rgba(222,232,255,0.92)',
        }}
      >
        {hideDetail
          ? (node.type === 'boss' ? <IconEvilEye size={15} /> : <span className="text-sm font-black opacity-70">?</span>)
          : node.cleared
            ? <span className="text-xs font-black">✓</span>
            : <NodeGlyph type={node.type} size={compact ? 15 : 16} />}
      </span>
      <span
        className={`mt-0.5 font-semibold leading-none ${compact ? 'text-[8.5px]' : 'text-[9px]'}`}
        style={{ color: node.cleared ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.7)' }}
      >
        {hideDetail
          ? (node.type === 'boss' ? '心魔' : '???')
          : (
            <>
              {NODE_LABEL[node.type]}
              {(node.type === 'mob' || node.type === 'elite' || node.type === 'golden') && node.mob && !node.cleared && (
                <span className="opacity-60"> · {node.mob.name.slice(0, 4)}</span>
              )}
            </>
          )}
      </span>
      {/* ⑨ 月台台沿 */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-2 right-2"
        style={{
          height: 2.5,
          background: node.cleared
            ? 'rgba(255,255,255,0.1)'
            : `linear-gradient(90deg, transparent, rgba(${pal.accentRgb}, ${canGo || isCurrent ? 0.75 : 0.3}), transparent)`,
        }}
      />
    </motion.button>
  );
}

export function TowerMap({ stratum, interactive, onSelectNode, fill }: Props) {
  const pal = stratum.abyssRing ? ABYSS_PALETTE : paletteFor(stratum.level); // 批5：深渊暗金
  const reachable = new Set(reachableNodeIds(stratum));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentRowRef = useRef<HTMLDivElement | null>(null);
  const [scrollY, setScrollY] = useState(0);

  const byFloor: StratumNode[][] = [];
  for (const n of stratum.nodes) {
    (byFloor[n.floor] ??= []).push(n);
  }
  const curFloor = stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0;
  const maxReached = Math.max(curFloor, ...stratum.nodes.filter(n => n.cleared).map(n => n.floor), 0);

  // ⑧ 战争迷雾：相对已达高度的可见度衰减；心魔层保底剪影（目标恒可见）
  const visibilityOf = (floor: number): Visibility => {
    if (stratum.status === 'cleared') return 'full';
    const d = floor - maxReached;
    let v: Visibility;
    if (d <= 1) v = 'full';
    else if (d === 2) v = 'dim';
    else if (d <= 4) v = 'silhouette';
    else v = 'fog';
    if (floor === stratum.floors && (v === 'fog')) v = 'silhouette';
    return v;
  };

  // 打开时定位到当前层
  useEffect(() => {
    const container = scrollRef.current;
    const row = currentRowRef.current;
    if (!container || !row) return;
    container.scrollTop = Math.max(0, row.offsetTop - container.clientHeight * 0.55);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratum.id]);

  // 顶层（高层）在上：floor 从 floors → 1 渲染，层间插入光轨连接行
  const rows: Array<{ kind: 'floor'; floor: number } | { kind: 'link'; lower: number }> = [];
  for (let floor = stratum.floors; floor >= 1; floor--) {
    rows.push({ kind: 'floor', floor });
    if (floor > 1) rows.push({ kind: 'link', lower: floor - 1 });
  }

  const vStyle = (v: Visibility): { opacity: number; filter?: string } => {
    switch (v) {
      case 'full': return { opacity: 1 };
      case 'dim': return { opacity: 0.6 };
      case 'silhouette': return { opacity: 0.32, filter: 'blur(0.4px)' };
      case 'fog': return { opacity: 0.1, filter: 'blur(1.2px)' };
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={e => setScrollY(e.currentTarget.scrollTop)}
      className="relative rounded-none p-3 overflow-y-auto overflow-x-hidden"
      style={{
        maxHeight: fill ? undefined : 420,
        height: fill ? '100%' : undefined,
        clipPath: slantPoly(14),
        background: `linear-gradient(180deg, ${pal.deep} 0%, rgba(10,12,40,0.96) 55%, rgba(5,8,30,0.98) 100%)`,
        boxShadow: `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.28)`,
      }}
    >
      {/* ⑧ 视差层：月亮 + 雾带（sticky h-0 锚定视口） */}
      <div className="sticky top-0 h-0 z-[3] pointer-events-none">
        <motion.div
          aria-hidden
          className="absolute right-4"
          animate={{ y: scrollY * 0.22 - 6 }}
          transition={{ type: 'tween', duration: 0.1 }}
          style={{ filter: `drop-shadow(0 0 14px rgba(${pal.accentRgb}, 0.5))` }}
        >
          <div
            className="rounded-full"
            style={{
              width: 34, height: 34,
              background: `radial-gradient(circle at 38% 34%, #fdfbf4, rgba(${pal.accentRgb}, 0.85) 68%, transparent 72%)`,
              opacity: 0.9,
            }}
          />
        </motion.div>
        <motion.div
          aria-hidden
          className="absolute left-0 right-0"
          animate={{ y: scrollY * 0.1 }}
          transition={{ type: 'tween', duration: 0.1 }}
          style={{ top: 26, height: 60, background: `linear-gradient(180deg, ${pal.mist}, transparent)` }}
        />
      </div>

      {/* ③ 幽灵层号：当前累计层高 */}
      <div className="sticky top-8 h-0 z-0 pointer-events-none">
        <WarGhost
          text={`${absoluteFloor(stratum, curFloor)}F`}
          style={{ right: -4, top: 0, fontSize: 74, color: `rgba(${pal.accentRgb}, 0.07)` }}
        />
      </div>

      {/* 顶部：higher · stronger */}
      <div className="relative text-center pb-3 pt-1 z-[1]">
        <p className="text-[10px] tracking-[0.34em] uppercase font-bold" style={{ color: `rgba(${pal.accentRgb}, 0.5)` }}>
          higher · stronger
        </p>
      </div>

      <div className="relative z-[1] flex flex-col gap-0">
        {rows.map(row => {
          if (row.kind === 'link') {
            // ⑨ 光轨连线：下层节点 → 上层节点
            const lowerRow = byFloor[row.lower] ?? [];
            const upperRow = byFloor[row.lower + 1] ?? [];
            const v = visibilityOf(row.lower + 1);
            return (
              <div key={`link-${row.lower}`} className="flex items-stretch" style={vStyle(v)}>
                <span className="w-9 flex-shrink-0" />
                <div className="relative flex-1" style={{ height: 14 }}>
                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden>
                    {lowerRow.flatMap(ln =>
                      ln.edges.map(eid => {
                        const un = upperRow.find(u => u.id === eid);
                        if (!un) return null;
                        const walked = ln.cleared && (un.cleared || stratum.currentNodeId === un.id);
                        const open = ln.cleared && reachable.has(un.id);
                        return (
                          <line
                            key={`${ln.id}-${eid}`}
                            x1={laneCenter(ln.lane)} y1={14}
                            x2={laneCenter(un.lane)} y2={0}
                            stroke={walked ? `rgba(${pal.accentRgb}, 0.85)` : open ? `rgba(${pal.accentRgb}, 0.45)` : 'rgba(255,255,255,0.12)'}
                            strokeWidth={walked ? 1.6 : 1}
                            strokeDasharray={walked || open ? undefined : '2.5 3'}
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })
                    )}
                  </svg>
                </div>
              </div>
            );
          }

          const floor = row.floor;
          const nodesRow = byFloor[floor];
          if (!nodesRow) return null;
          const v = visibilityOf(floor);
          const hideDetail = v === 'silhouette' || v === 'fog';
          const isCurRow = floor === curFloor;
          return (
            <div
              key={`floor-${floor}`}
              ref={isCurRow ? currentRowRef : undefined}
              className="flex items-center gap-2 py-[3px]"
              style={vStyle(v)}
            >
              {/* 累计层号 */}
              <span
                className="w-9 flex-shrink-0 text-right text-[10px] font-black tabular-nums"
                style={{ color: isCurRow ? pal.accent : 'rgba(190,205,255,0.35)' }}
              >
                {absoluteFloor(stratum, floor)}F
              </span>
              <div className="flex-1 grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map(lane => {
                  const node = nodesRow.find(n => n.lane === lane);
                  if (!node) return <span key={lane} />;
                  const isCurrent = stratum.currentNodeId === node.id;
                  const canGo = interactive && reachable.has(node.id) && !hideDetail;
                  const locked = !node.cleared && !canGo && !isCurrent;
                  return (
                    <TowerNodeButton
                      key={node.id}
                      node={node} pal={pal} isCurrent={isCurrent} canGo={canGo}
                      locked={locked} hideDetail={hideDetail} onSelect={onSelectNode}
                      gridColumnStart={lane + 1}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 塔基：水面 */}
      <div className="relative z-[1] pt-3 text-center">
        <p className="text-[10px] tracking-[0.34em] uppercase font-bold text-cyan-200/40">～ 水面 · 塔基 ～</p>
      </div>
    </div>
  );
}

/**
 * 收起态塔图（FS6 §1 / §3）。
 *
 * 【为什么要有它】
 * 全图是一条竖着的长卷，在拇指区之上只能露出几层，用户得先滚一段才知道"我在哪"，
 * 更看不到"顶在哪"。收起态把两个问题压进一屏回答完：
 *   · 顶部钉住**关底心魔**那一行（顶在哪）；
 *   · 中间三层台阶：下一层 / 当前层 / 上一层（我在哪、下一步往哪走）。
 *
 * 【台阶怎么做】
 * 三行各自横向错开一档（下层左移、上层右移）+ 非当前层轻微缩小。
 * 空间隐喻是"向上爬"，所以偏移必须**上下反向**——同向偏移只会读成排版没对齐。
 * 全部走 transform（红线：transform-only），不动布局。
 */
export function TowerMapMini({
  stratum, interactive, onSelectNode, onExpand,
}: {
  stratum: TowerStratum;
  interactive: boolean;
  onSelectNode: (node: StratumNode) => void;
  onExpand: () => void;
}) {
  const pal = stratum.abyssRing ? ABYSS_PALETTE : paletteFor(stratum.level);
  const reachable = new Set(reachableNodeIds(stratum));
  const anim = useBoldness();

  const byFloor: StratumNode[][] = [];
  for (const n of stratum.nodes) (byFloor[n.floor] ??= []).push(n);
  const curFloor = stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0;
  const topFloor = stratum.floors;

  // 台阶三层：下 / 当前 / 上。越界的那一档不渲染（塔底/塔顶时自然只剩两层）
  const steps = [curFloor + 1, curFloor, curFloor - 1]
    .filter(f => f >= 1 && f <= topFloor && byFloor[f]);
  // 顶部钉住的心魔层；若它已经在台阶里就不重复钉
  const showBossRow = topFloor > (curFloor + 1) && !!byFloor[topFloor];
  const gap = showBossRow ? topFloor - (curFloor + 1) : 0;

  // 爬层特效（FS6 §4）：curFloor 变化时整组台阶从下方推上来 + 当前行亮一下。
  // key 挂在 curFloor 上，让 motion 把它当成"新的一组"重新入场。
  const climbInit = anim ? { y: 26, opacity: 0 } : false as const;

  const renderRow = (floor: number, offsetIdx: number) => {
    const nodesRow = byFloor[floor] ?? [];
    const isCur = floor === curFloor;
    const isAbove = floor > curFloor;
    return (
      <div
        key={`step-${floor}`}
        className="flex items-center gap-2"
        style={{
          // 台阶错落：下层左、上层右；当前层归零居中
          transform: `translateX(${offsetIdx * 14}px) scale(${isCur ? 1 : 0.93})`,
          transformOrigin: isAbove ? 'left center' : 'right center',
          // 上方未至层压暗（FS6 §3「上方灰色未至态」）
          filter: isAbove ? 'grayscale(0.7) brightness(0.72)' : undefined,
        }}
      >
        <span
          className="w-8 flex-shrink-0 text-right text-[10px] font-black tabular-nums"
          style={{ color: isCur ? pal.accent : 'rgba(190,205,255,0.35)' }}
        >
          {absoluteFloor(stratum, floor)}F
        </span>
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {[0, 1, 2].map(lane => {
            const node = nodesRow.find(n => n.lane === lane);
            if (!node) return <span key={lane} />;
            const isCurrent = stratum.currentNodeId === node.id;
            const canGo = interactive && reachable.has(node.id);
            return (
              <TowerNodeButton
                key={node.id}
                node={node} pal={pal} isCurrent={isCurrent} canGo={canGo}
                locked={!node.cleared && !canGo && !isCurrent}
                hideDetail={false} onSelect={onSelectNode}
                compact gridColumnStart={lane + 1}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="relative overflow-hidden p-3"
      style={{
        clipPath: slantPoly(14),
        background: `linear-gradient(180deg, ${pal.deep} 0%, rgba(10,12,40,0.96) 60%, rgba(5,8,30,0.98) 100%)`,
        boxShadow: `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.28)`,
      }}
    >
      {/* 幽灵层号 */}
      <WarGhost
        text={`${absoluteFloor(stratum, curFloor)}F`}
        style={{ right: -2, top: 2, fontSize: 56, color: `rgba(${pal.accentRgb}, 0.07)` }}
      />

      {/* 顶部钉住的心魔层：一眼看到「顶在哪」 */}
      {showBossRow && (
        <div className="relative z-[1] mb-1">
          <div style={{ filter: 'grayscale(0.85) brightness(0.6)' }}>
            {renderRow(topFloor, 2)}
          </div>
          {/* 断层：还差几层。虚线 + 数字，比一串省略号说得清楚 */}
          <div className="mt-1 flex items-center gap-2 pl-8">
            <span className="h-px flex-1" style={{ background: `repeating-linear-gradient(90deg, rgba(${pal.accentRgb},0.35) 0 4px, transparent 4px 9px)` }} />
            <span className="text-[9px] font-black tracking-wider" style={{ color: `rgba(${pal.accentRgb}, 0.55)` }}>
              还有 {gap} 层
            </span>
            <span className="h-px flex-1" style={{ background: `repeating-linear-gradient(90deg, rgba(${pal.accentRgb},0.35) 0 4px, transparent 4px 9px)` }} />
          </div>
        </div>
      )}

      {/* 台阶三层。key 随 curFloor 变 → 过层时整组重新入场 = 爬升特效 */}
      <motion.div
        key={`climb-${curFloor}`}
        className="relative z-[1] flex flex-col gap-1.5"
        initial={climbInit}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {steps.map((f, i) => renderRow(f, steps.length === 3 ? 1 - i : (f > curFloor ? 1 : 0)))}
      </motion.div>

      {/* 展开完整塔图 */}
      <button
        type="button"
        onClick={onExpand}
        className="relative z-[1] mt-2 w-full py-1.5 text-[10px] font-black tracking-[0.22em]"
        style={{
          clipPath: slantPoly(8),
          background: `rgba(${pal.accentRgb}, 0.12)`,
          color: `rgba(${pal.accentRgb}, 0.9)`,
          boxShadow: `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.4)`,
        }}
      >
        展开完整塔图 ▾
      </button>
    </div>
  );
}
