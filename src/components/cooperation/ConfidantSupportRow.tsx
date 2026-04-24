import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/store';
import { TAROT_BY_ID } from '@/constants/tarot';

interface Props {
  /** 点击治疗道具成功后的回调，参数为恢复的 HP 值 */
  onHealHp?: (amount: number, confidantName: string) => void;
  /** 点击 SP 道具成功后的回调 */
  onRestoreSp?: (amount: number, confidantName: string) => void;
  /** 禁用（战斗动画中等场景） */
  disabled?: boolean;
}

/**
 * 战斗中使用同伴能力条：展示当日可用的 battle_heal / battle_sp 道具。
 * 无可用道具时不渲染任何东西。
 */
export function ConfidantSupportRow({ onHealHp, onRestoreSp, disabled }: Props) {
  const { getAvailableConfidantItems, useConfidantBattleItem } = useAppStore();
  const [expanded, setExpanded] = useState<'battle_heal' | 'battle_sp' | null>(null);

  const healItems = useMemo(() => getAvailableConfidantItems('battle_heal'), [getAvailableConfidantItems]);
  const spItems = useMemo(() => getAvailableConfidantItems('battle_sp'), [getAvailableConfidantItems]);

  if (healItems.length === 0 && spItems.length === 0) return null;

  const handleUse = async (confidantId: string, kind: 'battle_heal' | 'battle_sp') => {
    if (disabled) return;
    const buff = await useConfidantBattleItem(confidantId, kind);
    if (!buff) return;
    const item = [...healItems, ...spItems].find(it => it.confidantId === confidantId);
    const name = item?.confidantName ?? '同伴';
    if (kind === 'battle_heal') onHealHp?.(buff.value, name);
    else onRestoreSp?.(buff.value, name);
    setExpanded(null);
  };

  return (
    <div className="mb-3">
      <div className="flex gap-2">
        {healItems.length > 0 && (
          <motion.button
            whileTap={disabled ? undefined : { scale: 0.96 }}
            onClick={() => setExpanded(expanded === 'battle_heal' ? null : 'battle_heal')}
            disabled={disabled}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
            style={{
              background: 'rgba(16,185,129,0.18)',
              border: '1px solid rgba(16,185,129,0.4)',
              color: '#6ee7b7',
            }}
          >
            💚 同伴援助 · HP
            <span className="block text-[9px] opacity-70 mt-0.5">
              {healItems.length} 位可回应
            </span>
          </motion.button>
        )}
        {spItems.length > 0 && (
          <motion.button
            whileTap={disabled ? undefined : { scale: 0.96 }}
            onClick={() => setExpanded(expanded === 'battle_sp' ? null : 'battle_sp')}
            disabled={disabled}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
            style={{
              background: 'rgba(168,85,247,0.18)',
              border: '1px solid rgba(168,85,247,0.4)',
              color: '#d8b4fe',
            }}
          >
            ✨ 同伴援助 · SP
            <span className="block text-[9px] opacity-70 mt-0.5">
              {spItems.length} 位可回应
            </span>
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 rounded-xl bg-white/5 space-y-1.5">
              {(expanded === 'battle_heal' ? healItems : spItems).map(it => {
                const card = TAROT_BY_ID[it.arcanaId];
                const accent = card?.accent || '#10b981';
                return (
                  <button
                    key={it.confidantId}
                    onClick={() => handleUse(it.confidantId, expanded)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-white/10 text-left"
                  >
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center text-lg"
                      style={{ background: `${accent}33`, color: accent, border: `1px solid ${accent}55` }}
                    >
                      {expanded === 'battle_heal' ? '💚' : '✨'}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-white">
                        {it.confidantName}
                      </div>
                      <div className="text-[10px] text-white/60">
                        《{card?.name}》 · {it.buff.title}
                      </div>
                    </div>
                    <div
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: `${accent}33`, color: accent }}
                    >
                      {expanded === 'battle_heal' ? `+${it.buff.value} HP` : `+${it.buff.value} SP`}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
