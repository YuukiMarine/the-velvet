import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/store';
import { isInShadowTime } from '@/constants';

export const BattleDashboardWidget = () => {
  const { persona, shadow, battleState, settings, setCurrentPage } = useAppStore();

  const [inShadowTime, setInShadowTime] = useState(false);

  useEffect(() => {
    const check = () => {
      setInShadowTime(
        isInShadowTime(
          settings.battleShadowTimeDays ?? [5, 6, 0],
          settings.battleShadowTimeStart ?? 20,
          settings.battleShadowTimeEnd ?? 7
        )
      );
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [settings.battleShadowTimeDays, settings.battleShadowTimeStart, settings.battleShadowTimeEnd]);

  if (settings.battleEnabled === false) return null;

  const shadowHpPct = shadow
    ? Math.min(100, (shadow.currentHp / shadow.maxHp) * 100)
    : 0;

  // Text colour helpers — swap between dark-bg (shadow time) and light/dark-aware (non-shadow)
  const labelCls  = inShadowTime ? 'text-purple-400/70'      : 'text-purple-500 dark:text-purple-400';
  const mainCls   = inShadowTime ? 'text-white/80'            : 'text-gray-800 dark:text-gray-100';
  const subCls    = inShadowTime ? 'text-white/50'            : 'text-gray-500 dark:text-gray-400';
  const dimCls    = inShadowTime ? 'text-white/40'            : 'text-gray-400 dark:text-gray-500';
  const smallCls  = inShadowTime ? 'text-white/60'            : 'text-gray-600 dark:text-gray-300';
  const spBg      = inShadowTime ? 'rgba(139,92,246,0.3)'     : 'rgba(124,58,237,0.15)';
  const spColor   = inShadowTime ? '#c4b5fd'                   : '#7c3aed';
  const hpTrack   = inShadowTime ? 'rgba(255,255,255,0.1)'    : 'rgba(0,0,0,0.08)';

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => setCurrentPage('battle')}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
        inShadowTime
          ? ''
          : 'bg-gray-100 dark:bg-gray-800/80 border-2 border-purple-200/70 dark:border-purple-800/50'
      }`}
      style={inShadowTime ? {
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        boxShadow: '0 0 20px rgba(139, 92, 246, 0.4)',
        border: '1px solid rgba(139,92,246,0.4)',
      } : {}}
    >
      {/* Left icon */}
      <span className="text-2xl flex-shrink-0">⚔️</span>

      {/* Label + status */}
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] font-bold tracking-widest uppercase mb-0.5 ${labelCls}`}>
          逆影战场
        </p>

        {/* Status line */}
        <div className="flex items-center gap-2 min-w-0">
          {!persona ? (
            <span className={`text-sm truncate ${subCls}`}>唤醒 Persona →</span>
          ) : !shadow ? (
            <>
              <span className={`text-sm font-semibold truncate ${mainCls}`}>
                {persona.equippedMaskAttribute
                  ? (persona.attributePersonas?.[persona.equippedMaskAttribute]?.name ?? '反抗者')
                  : '反抗者'}
              </span>
              <span className={`text-sm flex-shrink-0 ${subCls}`}>· 识破暗影 →</span>
            </>
          ) : (
            <>
              <span className={`text-sm font-semibold truncate ${mainCls}`}>
                {persona.equippedMaskAttribute
                  ? (persona.attributePersonas?.[persona.equippedMaskAttribute]?.name ?? '反抗者')
                  : '反抗者'}
              </span>
              {battleState && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: spBg, color: spColor }}
                >
                  SP {battleState.sp}
                </span>
              )}
              <span className={`flex-shrink-0 ${dimCls}`}>·</span>
              <span className={`text-xs truncate ${smallCls}`}>{shadow.name}</span>
              <span
                className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ background: 'rgba(220,38,38,0.2)', color: '#dc2626' }}
              >
                Lv.{shadow.level}
              </span>

              {/* Mini HP bar */}
              <div
                className="flex-shrink-0 h-1.5 rounded-full overflow-hidden"
                style={{ width: 40, background: hpTrack }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${shadowHpPct}%`, background: 'linear-gradient(to right, #dc2626, #ef4444)' }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: shadow time badge */}
      {inShadowTime && (
        <motion.span
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex-shrink-0 text-xs font-black px-2 py-1 rounded-lg"
          style={{ background: 'rgba(139,92,246,0.4)', color: '#c4b5fd' }}
        >
          影
        </motion.span>
      )}
    </motion.button>
  );
};
