import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAppStore } from '@/store';
import { isInShadowTime } from '@/constants';
import { useUiChannel } from '@/ui/useUiChannel';
import { P4Flower, P4Sparkle } from '@/ui/p4Kit';
import { P5R, P5_FONT, P5_TITLE_FONT, roughQuad, roughBanner, P5Star, P5Dots } from '@/components/p5r/kit';

/** 影时间扫描线：CRT 横纹叠层（只在暗底上叠，靠 mix-blend 压出微亮/微暗交替） */
const ScanLines = ({ opacity = 0.5 }: { opacity?: number }) => (
  <span
    aria-hidden
    className="pointer-events-none absolute inset-0"
    style={{
      opacity,
      background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.09) 0 1px, transparent 1px 3px)',
      mixBlendMode: 'screen',
    }}
  />
);

export const BattleDashboardWidget = () => {
  // 逐字段订阅（A2）：首页常驻件，别让每次 store 写入都把它重算一遍
  const persona = useAppStore(s => s.persona);
  const shadow = useAppStore(s => s.shadow);
  const battleState = useAppStore(s => s.battleState);
  const settings = useAppStore(s => s.settings);
  const stratum = useAppStore(s => s.stratum);
  const setCurrentPage = useAppStore(s => s.setCurrentPage);
  const channel = useUiChannel();
  const isP4 = channel === 'p4';
  // P5R：首页「今日仪式」横滑组里的其他卡都是撕边红幅，这张过去还留着圆角灰卡，
  // 在红频道里非常出戏——换成同一张 roughBanner 幅面（影/暗红衬/红面三层）
  const isP5 = channel === 'p5';

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

  if (isP5) {
    const personaName = persona?.equippedMaskAttribute
      ? (persona.attributePersonas?.[persona.equippedMaskAttribute]?.name ?? '反抗者')
      : '反抗者';
    const status = !persona
      ? '唤醒 Persona →'
      : !shadow
        ? `${personaName} · 识破暗影 →`
        : stratum
          ? `${personaName} · ${stratum.name} ${stratum.baseFloor + (stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0)}F`
          : `${personaName} · ${shadow.name} Lv.${shadow.level}`;
    return (
      <motion.button
        type="button"
        whileTap={{ x: 2, y: 3 }}
        onClick={() => setCurrentPage('battle')}
        aria-label={inShadowTime ? '逆影战场：影时间进行中' : '逆影战场'}
        className="relative block h-full min-h-[86px] w-full cursor-pointer select-none text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c00008]"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ transform: 'translate(5px, 6px)', background: P5R.ink, clipPath: roughBanner(47.7) }} />
        <span aria-hidden className="pointer-events-none absolute -inset-x-1 -top-1 bottom-1" style={{ background: inShadowTime ? P5R.ink : P5R.redDeep, clipPath: roughBanner(47.4) }} />
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: inShadowTime ? '#5c0004' : P5R.red, clipPath: roughBanner(47) }} />
        {/* 影时间：幅面上洒一层黑网点当「夜」 */}
        {inShadowTime && (
          <P5Dots className="pointer-events-none absolute inset-0" style={{ clipPath: roughBanner(47) }} dot={1.4} gap={9} color="#2a0002" />
        )}
        <span className="relative flex h-full min-h-[86px] items-center gap-3.5 py-3 pl-3 pr-4">
          <span aria-hidden className="relative flex h-14 w-14 shrink-0 items-center justify-center" style={{ background: P5R.ink, clipPath: roughQuad(48.3, 6), boxShadow: `0 0 0 2.5px ${P5R.paper}` }}>
            <svg viewBox="0 0 24 24" width={28} height={28}>
              <path d="M13.6 1.5 L5.2 13.4 h5.1 l-2 9.1 L17.1 10 h-5.2 Z" fill={P5R.paper} />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-black leading-tight" style={{ color: P5R.white, fontFamily: P5_TITLE_FONT, textShadow: '2px 2px 0 #000000' }}>
              逆影战场
            </span>
            <span className="mt-1 block truncate text-[12px] font-bold" style={{ color: P5R.white }}>{status}</span>
          </span>
          {inShadowTime ? (
            <motion.span
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              className="relative flex shrink-0 items-center gap-1 px-2 py-1 text-[12px] font-black leading-none"
              style={{ color: P5R.ink, fontFamily: P5_FONT }}
            >
              <span aria-hidden className="absolute inset-0" style={{ background: P5R.paper, clipPath: roughQuad(48.9, 3) }} />
              <span className="relative flex items-center gap-1">
                <P5Star size={12} fill={P5R.red} />
                影时间
              </span>
            </motion.span>
          ) : (
            <span className="shrink-0 text-[10px] font-black leading-none" style={{ color: P5R.white }}>
              {settings.battleShadowTimeStart ?? 20}:00 显形
            </span>
          )}
        </span>
      </motion.button>
    );
  }

  // Text colour helpers — swap between dark-bg (shadow time) and light/dark-aware (non-shadow)
  // P4：非影时间走奶油纸卡 + 墨字（黄舞台语汇）；影时间仍是暗底，字色沿用亮系。
  const p4Day = isP4 && !inShadowTime;
  const labelCls  = p4Day ? 'text-[#131313]/70' : inShadowTime ? 'text-purple-400/70' : 'text-purple-500 dark:text-purple-400';
  const mainCls   = p4Day ? 'text-[#131313]'    : inShadowTime ? 'text-white/80'      : 'text-gray-800 dark:text-gray-100';
  const subCls    = p4Day ? 'text-[#131313]/65' : inShadowTime ? 'text-white/50'      : 'text-gray-500 dark:text-gray-400';
  const dimCls    = p4Day ? 'text-[#131313]/45' : inShadowTime ? 'text-white/40'      : 'text-gray-400 dark:text-gray-500';
  const smallCls  = p4Day ? 'text-[#131313]/70' : inShadowTime ? 'text-white/60'      : 'text-gray-600 dark:text-gray-300';
  const spBg      = p4Day ? 'var(--p4-orange, #f9a11b)' : inShadowTime ? 'rgb(var(--color-battle-bright-rgb) / 0.3)' : 'rgb(var(--color-battle-rgb) / 0.15)';
  const spColor   = p4Day ? '#131313'           : inShadowTime ? '#c4b5fd'            : 'rgb(var(--color-battle-rgb))';
  const statusSize = isP4 ? 'text-[12px]' : 'text-sm';
  const hpTrack   = p4Day ? 'rgba(19,19,19,0.12)' : inShadowTime ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  // 卡壳皮肤：P4 白昼=奶油纸 + 墨色硬阴影；P4 影时间=近黑靛底 + 橙描边（黄舞台上的"夜"）
  const shellClass = isP4
    ? 'relative w-full overflow-hidden flex items-center gap-3 px-4 py-3 rounded-[18px] text-left'
    : `w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors ${
        inShadowTime ? '' : 'bg-gray-100 dark:bg-gray-800/80 border-2 border-purple-200/70 dark:border-purple-800/50'
      }`;
  const shellStyle = isP4
    ? inShadowTime
      ? {
          background: 'linear-gradient(150deg, #10101c 0%, #1d1533 55%, #0d0d16 100%)',
          boxShadow: '0 4px 0 rgba(19,19,19,0.35), 0 0 22px rgba(249,161,27,0.35)',
          border: '2px solid var(--p4-orange, #f9a11b)',
        }
      // 白昼：与同组的星象入口卡同制式——直接坐在奶油仪式卡上，不再套一层卡壳
      : { background: 'transparent' }
    : inShadowTime
      ? {
          background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
          boxShadow: '0 0 20px rgb(var(--color-battle-bright-rgb) / 0.4)',
          border: '1px solid rgb(var(--color-battle-bright-rgb) / 0.4)',
        }
      : {};

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => setCurrentPage('battle')}
      className={shellClass}
      style={shellStyle}
    >
      {/* 影时间扫描线（用户口径）：P4 影时间在暗底上叠 CRT 横纹；非 P4 也顺带受益 */}
      {inShadowTime && <ScanLines opacity={isP4 ? 0.65 : 0.4} />}
      {/* P4 白昼：奶油卡右上角压一朵橙花当"战场徽" */}
      {p4Day && <P4Flower size={34} color="rgba(249,161,27,0.18)" className="pointer-events-none absolute right-0 top-0" />}

      {/* Left icon */}
      {isP4 ? (
        <span
          className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center self-start rounded-full text-base"
          style={{
            background: inShadowTime ? 'var(--p4-orange, #f9a11b)' : '#131313',
            color: inShadowTime ? '#131313' : 'var(--ui-bg)',
          }}
        >
          ⚔
        </span>
      ) : (
        <span className="text-2xl flex-shrink-0">⚔️</span>
      )}

      {/* Label + status */}
      <div className="relative flex-1 min-w-0">
        {/* P4 的仪式卡只有半栏宽：眉标行把「影 / 显形时刻」收进来，右侧不再单开一列，
            省下的横向空间全给状态文案（否则"唤醒 Persona →"会被截成"唤…"）。 */}
        <p className={`flex items-center gap-1 whitespace-nowrap font-black uppercase mb-0.5 ${isP4 ? 'text-[10px]' : 'text-[10px] tracking-widest'} ${isP4 && inShadowTime ? 'text-[var(--p4-orange,#f9a11b)]' : labelCls}`}>
          逆影战场
          {isP4 && <P4Sparkle size={9} color={inShadowTime ? 'var(--p4-orange,#f9a11b)' : 'var(--ui-accent)'} />}
          {isP4 && (inShadowTime ? (
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="ml-auto shrink-0 rounded-full px-1.5 py-[2px] text-[10px] leading-none"
              style={{ background: 'var(--p4-orange, #f9a11b)', color: '#131313' }}
            >
              影
            </motion.span>
          ) : (
            <span className={`ml-auto shrink-0 text-[9px] ${dimCls}`}>{settings.battleShadowTimeStart ?? 20}:00 显形</span>
          ))}
        </p>

        {/* Status line */}
        <div className="flex items-center gap-2 min-w-0">
          {!persona ? (
            <span className={`${statusSize} truncate ${subCls}`}>唤醒 Persona →</span>
          ) : !shadow ? (
            <>
              <span className={`${statusSize} font-semibold truncate ${mainCls}`}>
                {persona.equippedMaskAttribute
                  ? (persona.attributePersonas?.[persona.equippedMaskAttribute]?.name ?? '反抗者')
                  : '反抗者'}
              </span>
              <span className={`${statusSize} flex-shrink-0 ${subCls}`}>· 识破暗影 →</span>
            </>
          ) : (
            <>
              <span className={`${statusSize} font-semibold truncate ${mainCls}`}>
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
              {stratum ? (
                <>
                  <span className={`text-xs truncate ${smallCls}`}>{stratum.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 tabular-nums"
                    style={{ background: 'rgba(220,38,38,0.2)', color: '#dc2626' }}
                  >
                    {stratum.baseFloor + (stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0)}F
                  </span>
                </>
              ) : (
                <>
                  <span className={`text-xs truncate ${smallCls}`}>{shadow.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'rgba(220,38,38,0.2)', color: '#dc2626' }}
                  >
                    Lv.{shadow.level}
                  </span>
                </>
              )}

              {/* Mini HP bar（主影） */}
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

      {/* Right: shadow time badge / 开启时刻 */}
      {/* 非 P4 保持右侧独立徽标列；P4 已把它并进眉标行（见上） */}
      {!isP4 && (inShadowTime ? (
        <motion.span
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="flex-shrink-0 text-xs font-black px-2 py-1 rounded-lg"
          style={{ background: 'rgb(var(--color-battle-bright-rgb) / 0.4)', color: '#c4b5fd' }}
        >
          影
        </motion.span>
      ) : (
        <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-1 rounded-lg ${dimCls}`}>
          {settings.battleShadowTimeStart ?? 20}:00 显形
        </span>
      ))}
    </motion.button>
  );
};
