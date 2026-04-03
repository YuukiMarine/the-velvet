import { motion } from 'framer-motion';
import { useAppStore } from '@/store';
import { isInShadowTime } from '@/constants';
import { useEffect, useState } from 'react';

interface Props {
  onOpenPersonaCreate: () => void;
  onOpenShadowCreate: () => void;
  onOpenBattle: () => void;
}

export function BattleStatusCard({ onOpenPersonaCreate, onOpenShadowCreate, onOpenBattle }: Props) {
  const { persona, shadow, battleState, settings, checkShadowHpRegen } = useAppStore();
  const [shadowTime, setShadowTime] = useState(false);

  useEffect(() => {
    const check = () => setShadowTime(isInShadowTime(
      settings.battleShadowTimeDays ?? [5, 6, 0],
      settings.battleShadowTimeStart ?? 20,
      settings.battleShadowTimeEnd ?? 7
    ));
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [settings]);

  useEffect(() => {
    checkShadowHpRegen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (settings.battleEnabled === false) return null;

  const sp = battleState?.sp ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-6 rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        boxShadow: shadowTime ? '0 0 30px rgba(139, 92, 246, 0.5)' : '0 4px 20px rgba(0,0,0,0.3)',
        border: shadowTime ? '1px solid rgba(139, 92, 246, 0.6)' : '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Shadow Time glow effect */}
      {shadowTime && (
        <motion.div
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.2) 0%, transparent 70%)' }}
        />
      )}

      <div className="relative p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚔️</span>
            <span className="font-bold text-white text-sm">逆影战场</span>
          </div>
          {shadowTime ? (
            <motion.span
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(139,92,246,0.4)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.6)' }}
            >
              ✦ 影时间
            </motion.span>
          ) : (
            <span className="text-xs text-gray-400">周末20:00-07:00</span>
          )}
        </div>

        {/* Content */}
        {!persona ? (
          <div className="text-center py-3">
            <p className="text-gray-300 text-sm mb-3">唤醒你内心的Persona，踏上征途</p>
            <button
              onClick={onOpenPersonaCreate}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5)' }}
            >
              召唤 Persona
            </button>
          </div>
        ) : !shadow ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-purple-600 dark:text-purple-300 text-sm font-medium">Persona: 反抗者</span>
              <span className="text-yellow-600 dark:text-yellow-300 text-sm">SP: {sp}</span>
            </div>
            <div className="text-center py-2">
              <p className="text-gray-400 text-xs mb-2">召唤一个心魔，开始战斗</p>
              <button
                onClick={onOpenShadowCreate}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(90deg, #dc2626, #7c3aed)' }}
              >
                召唤心魔
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Persona & SP */}
            <div className="flex items-center justify-between">
              <span className="text-purple-600 dark:text-purple-300 text-sm font-medium">✦ 反抗者</span>
              <span className="text-yellow-600 dark:text-yellow-300 text-sm font-bold">SP {sp}</span>
            </div>

            {/* Shadow info */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-red-400 text-sm font-medium">👁 {shadow.name}</span>
                <span className="text-gray-400 text-xs">Lv{shadow.level}</span>
              </div>
              {/* HP Bar 1 */}
              <div className="relative">
                <div className="text-xs text-gray-400 mb-0.5">HP {shadow.currentHp}/{shadow.maxHp}</div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #ef4444, #dc2626)' }}
                    animate={{ width: `${(shadow.currentHp / shadow.maxHp) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              {/* HP Bar 2 (lv3+) */}
              {shadow.maxHp2 !== undefined && (
                <div className="relative">
                  <div className="text-xs text-gray-400 mb-0.5">
                    HP2 {shadow.currentHp2 ?? shadow.maxHp2}/{shadow.maxHp2}
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, #f97316, #ef4444)',
                        width: `${((shadow.currentHp2 ?? shadow.maxHp2) / shadow.maxHp2) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Battle Button */}
            <button
              onClick={onOpenBattle}
              disabled={!shadowTime && battleState?.status !== 'victory'}
              className="w-full py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50"
              style={{ background: shadowTime ? 'linear-gradient(90deg, #7c3aed, #dc2626)' : 'rgba(255,255,255,0.1)' }}
            >
              {shadowTime ? '⚔️ 进入战斗' : '🌙 等待影时间'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
