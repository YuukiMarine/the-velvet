import { motion, AnimatePresence } from 'framer-motion';

interface DamageNumber {
  id: number;
  value: number;
  isWeak: boolean;
}

interface Props {
  level: number;
  isHurt: boolean;
  isWeak: boolean;
  offBalance: boolean;
  damageNumbers: DamageNumber[];
}

function Lv1Path() {
  return (
    <g>
      {/* head */}
      <ellipse cx="100" cy="55" rx="25" ry="28" fill="#111"/>
      {/* left horn */}
      <polygon points="82,35 75,5 90,30" fill="#111"/>
      {/* right horn */}
      <polygon points="118,35 125,5 110,30" fill="#111"/>
      {/* body */}
      <rect x="78" y="82" width="44" height="55" rx="6" fill="#111"/>
      {/* left arm */}
      <rect x="54" y="85" width="26" height="12" rx="6" transform="rotate(10,67,91)" fill="#111"/>
      {/* right arm */}
      <rect x="120" y="85" width="26" height="12" rx="6" transform="rotate(-10,133,91)" fill="#111"/>
      {/* legs */}
      <rect x="80" y="134" width="16" height="35" rx="6" fill="#111"/>
      <rect x="104" y="134" width="16" height="35" rx="6" fill="#111"/>
      {/* eyes (glowing red) */}
      <circle cx="91" cy="52" r="5" fill="#ef4444" opacity="0.9"/>
      <circle cx="109" cy="52" r="5" fill="#ef4444" opacity="0.9"/>
    </g>
  );
}

function Lv3Path() {
  return (
    <g>
      {/* wings */}
      <path d="M100,90 Q55,60 20,85 Q45,75 70,95 Q50,110 30,140 Q55,115 80,105Z" fill="#111"/>
      <path d="M100,90 Q145,60 180,85 Q155,75 130,95 Q150,110 170,140 Q145,115 120,105Z" fill="#111"/>
      {/* body */}
      <ellipse cx="100" cy="105" rx="30" ry="38" fill="#1a0020"/>
      {/* chest spine/armored plates */}
      <rect x="93" y="82" width="14" height="48" rx="4" fill="#0d0010"/>
      {/* head */}
      <ellipse cx="100" cy="58" rx="28" ry="30" fill="#111"/>
      {/* 4 horns */}
      <polygon points="82,38 73,5 88,35" fill="#111"/>
      <polygon points="118,38 127,5 112,35" fill="#111"/>
      <polygon points="90,34 84,12 95,32" fill="#0d0010"/>
      <polygon points="110,34 116,12 105,32" fill="#0d0010"/>
      {/* 3 eyes */}
      <circle cx="89" cy="54" r="6" fill="#ef4444" opacity="0.95"/>
      <circle cx="111" cy="54" r="6" fill="#ef4444" opacity="0.95"/>
      <circle cx="100" cy="68" r="4" fill="#dc2626" opacity="0.7"/>
      {/* claws on body sides */}
      <path d="M70,120 Q55,115 50,130 Q60,125 70,135Z" fill="#111"/>
      <path d="M130,120 Q145,115 150,130 Q140,125 130,135Z" fill="#111"/>
      {/* tail hint */}
      <path d="M95,140 Q85,155 90,170 Q100,160 110,165 Q105,150 105,140Z" fill="#111"/>
    </g>
  );
}

function Lv5Path() {
  return (
    <g>
      {/* outer aura/tentacles */}
      <path d="M100,100 Q40,50 10,60 Q35,80 55,85Z" fill="#0d0010" opacity="0.7"/>
      <path d="M100,100 Q160,50 190,60 Q165,80 145,85Z" fill="#0d0010" opacity="0.7"/>
      <path d="M100,100 Q30,130 15,155 Q45,135 65,120Z" fill="#0d0010" opacity="0.7"/>
      <path d="M100,100 Q170,130 185,155 Q155,135 135,120Z" fill="#0d0010" opacity="0.7"/>
      <path d="M100,110 Q60,175 55,195 Q80,170 92,155Z" fill="#0d0010" opacity="0.7"/>
      <path d="M100,110 Q140,175 145,195 Q120,170 108,155Z" fill="#0d0010" opacity="0.7"/>
      {/* main body - massive oval */}
      <ellipse cx="100" cy="105" rx="42" ry="50" fill="#111"/>
      {/* crown of horns (many) */}
      <polygon points="100,42 94,10 100,38" fill="#111"/>
      <polygon points="86,45 72,15 84,42" fill="#111"/>
      <polygon points="114,45 128,15 116,42" fill="#111"/>
      <polygon points="74,55 52,28 72,52" fill="#0d0010"/>
      <polygon points="126,55 148,28 128,52" fill="#0d0010"/>
      <polygon points="62,68 35,50 60,65" fill="#0d0010"/>
      <polygon points="138,68 165,50 140,65" fill="#0d0010"/>
      {/* head (large, merged with body) */}
      <ellipse cx="100" cy="68" rx="32" ry="34" fill="#111"/>
      {/* 5 eyes */}
      <circle cx="86" cy="60" r="7" fill="#ef4444"/>
      <circle cx="114" cy="60" r="7" fill="#ef4444"/>
      <circle cx="100" cy="75" r="5" fill="#dc2626"/>
      <circle cx="80" cy="80" r="3" fill="#991b1b" opacity="0.6"/>
      <circle cx="120" cy="80" r="3" fill="#991b1b" opacity="0.6"/>
      {/* armor plating */}
      <path d="M80,90 Q100,82 120,90 Q115,100 100,97 Q85,100 80,90Z" fill="#0d0010"/>
      {/* lower body with spikes */}
      <path d="M68,120 Q63,108 58,118 Q62,116 66,126Z" fill="#111"/>
      <path d="M132,120 Q137,108 142,118 Q138,116 134,126Z" fill="#111"/>
      <path d="M72,135 Q65,125 60,137 Q65,133 69,143Z" fill="#111"/>
      <path d="M128,135 Q135,125 140,137 Q135,133 131,143Z" fill="#111"/>
    </g>
  );
}

export function ShadowSVG({ level, isHurt, isWeak, offBalance, damageNumbers }: Props) {
  const svgSize = level >= 5 ? 180 : level >= 3 ? 160 : 140;

  const svgPaths = level <= 2
    ? <Lv1Path />
    : level <= 4
    ? <Lv3Path />
    : <Lv5Path />;

  return (
    <div className="relative flex flex-col items-center justify-center h-full">
      <style>{`
        @keyframes glitch-1 {
          0%,100%{clip-path:none;transform:none}
          8%{clip-path:polygon(0 30%,100% 30%,100% 50%,0 50%);transform:translate(-3px,0)}
          10%{clip-path:none;transform:translate(2px,0)}
          12%{transform:none}
          80%{clip-path:none;transform:none}
          82%{clip-path:polygon(0 60%,100% 60%,100% 80%,0 80%);transform:translate(3px,0)}
          85%{clip-path:none;transform:none}
        }
        @keyframes glitch-2 {
          0%,100%{transform:none;opacity:0}
          8%{transform:translate(3px,0);opacity:0.4}
          10%{transform:translate(-2px,0);opacity:0.3}
          12%{opacity:0}
          80%{opacity:0}
          82%{transform:translate(-3px,0);opacity:0.4}
          85%{opacity:0}
        }
        @keyframes shadow-hurt {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)}
          60%{transform:translateX(-4px)}
          80%{transform:translateX(4px)}
        }
        @keyframes float-idle {
          0%,100%{transform:translateY(0)}
          50%{transform:translateY(-6px)}
        }
        @keyframes glitch-color-shift {
          0%,100%{filter:none}
          8%{filter:hue-rotate(180deg) saturate(3)}
          12%{filter:none}
          82%{filter:hue-rotate(90deg) saturate(2)}
          85%{filter:none}
        }
      `}</style>

      {/* Main shadow sprite */}
      <div
        style={{
          animation: isHurt
            ? 'shadow-hurt 0.4s ease, glitch-color-shift 4s infinite'
            : 'float-idle 3s ease-in-out infinite, glitch-color-shift 4s infinite',
          position: 'relative',
        }}
      >
        {/* Primary SVG layer */}
        <div style={{ animation: 'glitch-1 4s infinite', position: 'relative', zIndex: 2 }}>
          <svg
            viewBox="0 0 200 200"
            width={svgSize}
            height={svgSize}
            style={{
              filter: isHurt
                ? 'drop-shadow(0 0 8px rgba(239,68,68,0.4)) brightness(2.5) saturate(0.3)'
                : 'drop-shadow(0 0 8px rgba(239,68,68,0.4))',
              transition: 'filter 0.08s ease-out',
            }}
          >
            {svgPaths}
          </svg>
        </div>

        {/* Glitch duplicate (red-shifted) */}
        <div style={{
          position: 'absolute', inset: 0, animation: 'glitch-2 4s infinite',
          zIndex: 1, filter: 'drop-shadow(2px 0 0 rgba(239,68,68,0.6)) hue-rotate(180deg)',
        }}>
          <svg
            viewBox="0 0 200 200"
            width={svgSize}
            height={svgSize}
          >
            {svgPaths}
          </svg>
        </div>

        {/* Scanline overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3,
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
          borderRadius: 8,
        }}/>
      </div>

      {/* Off-balance badge */}
      <AnimatePresence>
        {offBalance && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: [0.7, 1, 0.7], y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1 }}
            style={{
              position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.6)',
              color: '#fbbf24', borderRadius: 9999, padding: '2px 8px', fontSize: 11, fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            ⚡ 失衡
          </motion.div>
        )}
      </AnimatePresence>

      {/* WEAK!! flash */}
      <AnimatePresence>
        {isWeak && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: [0.5, 1.4, 1.1] }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#ef4444', fontWeight: 900, fontSize: 28,
              textShadow: '0 0 20px #ef4444, 0 0 40px #ef4444',
              zIndex: 10, pointerEvents: 'none', whiteSpace: 'nowrap',
            }}
          >
            WEAK!!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating damage numbers */}
      <AnimatePresence>
        {damageNumbers.map(dn => (
          <motion.div
            key={dn.id}
            initial={{ opacity: 1, y: 0, x: (Math.random() - 0.5) * 40 }}
            animate={{ opacity: 0, y: -60 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: '40%', left: `${45 + (Math.random() - 0.5) * 20}%`,
              color: dn.isWeak ? '#ef4444' : '#fbbf24',
              fontWeight: 900,
              fontSize: dn.isWeak ? 28 : 22,
              textShadow: dn.isWeak ? '0 0 12px #ef4444' : '0 0 8px #f59e0b',
              pointerEvents: 'none', zIndex: 10,
              letterSpacing: '-0.02em',
            }}
          >
            -{dn.value}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
