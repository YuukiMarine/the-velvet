/**
 * 影时间高塔 · 塔层攀升图（批2 §2.5）
 *
 * 纵向自下而上：顶层=区层主影，每层 2-3 节点选一；层号全塔累计。
 * 蓝频道精装（P3R 语言）在批2c 换装；本版为可玩的结构化底稿。
 */
import { motion } from 'motion/react';
import { StratumNode, TowerStratum } from '@/types';
import { reachableNodeIds, absoluteFloor } from '@/battle/tower';

const NODE_ICON: Record<StratumNode['type'], string> = {
  mob: '⚔️', elite: '👹', event: '❓', echo: '🌙', chest: '📦', boss: '👁️',
};
const NODE_LABEL: Record<StratumNode['type'], string> = {
  mob: 'Shadow', elite: '强敌', event: '异变', echo: '回响', chest: '月匣', boss: '心魔',
};

interface Props {
  stratum: TowerStratum;
  /** 今晚已登塔且 session 未结束时可交互 */
  interactive: boolean;
  onSelectNode: (node: StratumNode) => void;
  /** 独立塔界面内铺满可用高度 */
  fill?: boolean;
}

export function TowerMap({ stratum, interactive, onSelectNode, fill }: Props) {
  const reachable = new Set(reachableNodeIds(stratum));
  const floors: StratumNode[][] = [];
  for (const n of stratum.nodes) {
    (floors[n.floor] ??= []).push(n);
  }

  return (
    <div
      className="rounded-2xl p-3 overflow-y-auto"
      style={{
        maxHeight: fill ? undefined : 420,
        height: fill ? '100%' : undefined,
        background: 'linear-gradient(180deg, rgba(10,4,40,0.92) 0%, rgba(16,10,52,0.92) 45%, rgba(8,10,36,0.95) 100%)',
        border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.25)',
      }}
    >
      {/* 顶部：月与区层名（越往上越接近月光） */}
      <div className="text-center pb-2">
        <span className="text-lg" aria-hidden>🌙</span>
        <p className="text-[10px] tracking-[0.3em] text-indigo-200/50 uppercase">higher · stronger</p>
      </div>

      <div className="flex flex-col-reverse gap-1.5">
        {floors.map((row, floor) => {
          if (!row) return null;
          return (
            <div key={floor} className="flex items-center gap-2">
              {/* 累计层号 */}
              <span className="w-9 flex-shrink-0 text-right text-[10px] font-bold tabular-nums text-indigo-200/40">
                {absoluteFloor(stratum, floor)}F
              </span>
              <div className="flex-1 grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map(lane => {
                  const node = row.find(n => n.lane === lane);
                  if (!node) return <span key={lane} />;
                  const isCurrent = stratum.currentNodeId === node.id;
                  const canGo = interactive && reachable.has(node.id);
                  const locked = !node.cleared && !canGo && !isCurrent;
                  return (
                    <motion.button
                      key={node.id}
                      whileTap={canGo ? { scale: 0.94 } : undefined}
                      onClick={() => canGo && onSelectNode(node)}
                      disabled={!canGo}
                      className="relative flex flex-col items-center justify-center rounded-xl py-1.5 transition-all"
                      style={{
                        gridColumnStart: lane + 1,
                        background: node.cleared
                          ? 'rgba(255,255,255,0.04)'
                          : isCurrent
                            ? 'rgb(var(--color-battle-bright-rgb) / 0.3)'
                            : canGo
                              ? 'rgb(var(--color-battle-bright-rgb) / 0.16)'
                              : 'rgba(255,255,255,0.05)',
                        border: isCurrent
                          ? '1px solid rgb(var(--color-battle-bright-rgb) / 0.8)'
                          : canGo
                            ? '1px solid rgb(var(--color-battle-bright-rgb) / 0.5)'
                            : '1px solid rgba(255,255,255,0.08)',
                        opacity: node.cleared ? 0.45 : locked ? 0.35 : 1,
                        boxShadow: canGo ? '0 0 10px rgb(var(--color-battle-bright-rgb) / 0.35)' : 'none',
                      }}
                    >
                      {canGo && (
                        <motion.span
                          className="absolute inset-0 rounded-xl pointer-events-none"
                          animate={{ opacity: [0.25, 0.6, 0.25] }}
                          transition={{ duration: 1.4, repeat: Infinity }}
                          style={{ border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.7)' }}
                        />
                      )}
                      <span className="text-base leading-none">{node.cleared ? '✓' : NODE_ICON[node.type]}</span>
                      <span className="text-[9px] mt-0.5 font-semibold" style={{ color: node.cleared ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)' }}>
                        {NODE_LABEL[node.type]}
                        {(node.type === 'mob' || node.type === 'elite') && node.mob && !node.cleared && (
                          <span className="opacity-60"> · {node.mob.name.slice(0, 4)}</span>
                        )}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 塔基：水面 */}
      <div className="pt-2 text-center">
        <p className="text-[10px] tracking-[0.3em] text-cyan-200/40 uppercase">～ 水面 · 塔基 ～</p>
      </div>
    </div>
  );
}
