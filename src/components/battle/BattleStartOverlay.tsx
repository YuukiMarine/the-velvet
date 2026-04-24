import { motion } from 'framer-motion';

/**
 * BATTLE START —— 神秘 / 老式钟表风
 * 总时长 ~2.5s：墨色晕染浮现 → 罗马数字钟盘具现 → 秒针加速 → 裂纹蔓延 → 钟盘碎裂成片飞散 → 标题从烛光中浮出
 * 色调：深夜靛蓝 + 古铜琥珀 + 烛光黄 + 墨黑；serif 字体。
 */

/** 缓慢膨胀的墨色光晕 */
function InkBloom() {
  return (
    <>
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0.7, 0.5] }}
        transition={{ duration: 2.5, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
        style={{
          background:
            'radial-gradient(ellipse at 50% 55%, rgba(56,32,90,0.9) 0%, rgba(16,8,36,0.94) 45%, rgba(0,0,0,0.98) 100%)',
        }}
      />
      {/* 烛光从底部透出 */}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.55, 0.35] }}
        transition={{ duration: 2.5, times: [0, 0.4, 1] }}
        style={{
          background:
            'radial-gradient(ellipse at 50% 110%, rgba(251,191,36,0.35) 0%, rgba(193,94,34,0.2) 30%, transparent 70%)',
        }}
      />
    </>
  );
}

/** 缓慢上升的烟/尘粒 */
function EmberMotes() {
  const motes = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    leftPct: 5 + Math.random() * 90,
    size: 1.5 + Math.random() * 2.2,
    delay: -Math.random() * 3,
    duration: 5 + Math.random() * 5,
    drift: (Math.random() - 0.5) * 40,
    tint: i % 3 === 0 ? '#fde68a' : '#c4b5fd',
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {motes.map(m => (
        <motion.div
          key={m.id}
          className="absolute rounded-full"
          style={{
            left: `${m.leftPct}%`,
            bottom: -10,
            width: m.size,
            height: m.size,
            background: m.tint,
            boxShadow: `0 0 ${m.size * 3}px ${m.tint}`,
            opacity: 0.6,
          }}
          animate={{
            y: [0, -260 - Math.random() * 80],
            x: [0, m.drift],
            opacity: [0, 0.6, 0.45, 0],
          }}
          transition={{
            duration: m.duration,
            delay: m.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
}

/** 围绕钟盘的古旧占星纹（双圈虚线 + 四道镇压符） */
function ArcaneRings() {
  return (
    <motion.svg
      viewBox="0 0 260 260"
      className="absolute pointer-events-none"
      style={{ top: '50%', left: '50%', width: 260, height: 260, transform: 'translate(-50%, -50%)' }}
      initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
      animate={{
        opacity: [0, 0.55, 0.45, 0.25],
        scale: [0.8, 1.02, 1, 1],
        rotate: [-20, 0, 10, 18],
      }}
      transition={{ duration: 2.2, times: [0, 0.35, 0.7, 1], ease: 'easeOut' }}
    >
      <g fill="none" stroke="#e7d7a7" strokeOpacity="0.65" strokeWidth="0.8" style={{ filter: 'drop-shadow(0 0 2px rgba(251,191,36,0.6))' }}>
        <circle cx="130" cy="130" r="122" strokeDasharray="3 5" />
        <circle cx="130" cy="130" r="108" strokeDasharray="1 3" />
        <circle cx="130" cy="130" r="95" strokeDasharray="6 4" strokeOpacity="0.4" />
      </g>
      {/* 四方镇压符（极简花纹） */}
      {[0, 90, 180, 270].map(a => (
        <g key={a} transform={`rotate(${a} 130 130)`}>
          <path
            d="M130,12 L126,22 L130,18 L134,22 Z"
            fill="#e7d7a7"
            fillOpacity="0.55"
            style={{ filter: 'drop-shadow(0 0 3px rgba(251,191,36,0.7))' }}
          />
        </g>
      ))}
    </motion.svg>
  );
}

/** 罗马数字钟盘 — 缓慢具现 → 秒针加速 → 裂纹蔓延 → 碎片飞散 */
function RomanClockShatter() {
  const ROMAN = ['Ⅻ', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ'];
  // 12 块扇形碎片
  const shards = Array.from({ length: 12 }, (_, i) => {
    const angleCenter = (i / 12) * 360 - 90;
    const flyAngle = angleCenter + (Math.random() - 0.5) * 25;
    const dist = 200 + Math.random() * 120;
    const a1 = (angleCenter - 15) * Math.PI / 180;
    const a2 = (angleCenter + 15) * Math.PI / 180;
    return {
      id: i,
      tx: Math.cos(flyAngle * Math.PI / 180) * dist,
      ty: Math.sin(flyAngle * Math.PI / 180) * dist,
      rot: (Math.random() - 0.5) * 420,
      clip: `polygon(50% 50%, ${50 + 50 * Math.cos(a1)}% ${50 + 50 * Math.sin(a1)}%, ${50 + 50 * Math.cos(a2)}% ${50 + 50 * Math.sin(a2)}%)`,
    };
  });

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        top: '50%',
        left: '50%',
        width: 200,
        height: 200,
        transform: 'translate(-50%, -50%)',
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: [0, 1, 1, 1, 1], scale: [0.6, 1, 1, 1, 1] }}
      transition={{ duration: 1.8, times: [0, 0.35, 0.55, 0.8, 1], ease: 'easeOut' }}
    >
      {/* 钟盘底（羊皮纸质感） */}
      <motion.div
        className="absolute inset-0 rounded-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.95, 0.95, 0.95, 0] }}
        transition={{ duration: 2.1, delay: 0.05, times: [0, 0.25, 0.55, 0.82, 1] }}
        style={{
          background:
            'radial-gradient(circle, rgba(244,224,180,0.14) 0%, rgba(214,179,120,0.07) 55%, rgba(0,0,0,0.2) 100%)',
          border: '1.5px solid rgba(231,215,167,0.75)',
          boxShadow:
            'inset 0 0 30px rgba(231,215,167,0.25), 0 0 28px rgba(251,191,36,0.35), 0 0 60px rgba(139,92,246,0.25)',
        }}
      />
      {/* 12 碎片 — 一开始组成完整钟盘，后飞散 */}
      {shards.map(s => (
        <motion.div
          key={s.id}
          className="absolute inset-0 rounded-full"
          style={{
            clipPath: s.clip,
            WebkitClipPath: s.clip,
            border: '1px solid rgba(231,215,167,0.55)',
            background: 'rgba(231,215,167,0.05)',
            boxShadow: 'inset 0 0 14px rgba(251,191,36,0.25)',
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
          animate={{
            x: [0, 0, 0, 0, s.tx],
            y: [0, 0, 0, 0, s.ty],
            rotate: [0, 0, 0, 0, s.rot],
            opacity: [0, 0.9, 0.9, 0.9, 0],
          }}
          transition={{
            duration: 2,
            delay: 0.1,
            times: [0, 0.3, 0.55, 0.75, 1],
            ease: [0.2, 0.8, 0.3, 1],
          }}
        />
      ))}

      {/* 12 刻度 — 罗马数字 */}
      {ROMAN.map((num, i) => {
        const deg = (i / 12) * 360;
        return (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2"
            style={{
              transform: `rotate(${deg}deg) translateY(-78px) rotate(${-deg}deg)`,
              transformOrigin: '0 0',
              fontFamily: '"Cinzel", "Times New Roman", "Noto Serif SC", serif',
              fontSize: 13,
              fontWeight: 700,
              color: '#f0dfae',
              textShadow: '0 0 6px rgba(251,191,36,0.6)',
              whiteSpace: 'nowrap',
              marginLeft: -6,
              marginTop: -8,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.8, delay: 0.15, times: [0, 0.3, 0.7, 0.95] }}
          >
            {num}
          </motion.div>
        );
      })}

      {/* 时针 — 优雅静置 */}
      <motion.div
        className="absolute left-1/2 top-1/2 origin-top"
        style={{
          width: 2.5,
          height: 54,
          background: 'linear-gradient(180deg, #f4e0b4, #8a6a2a)',
          transform: 'translate(-50%, 0) rotate(-60deg)',
          borderRadius: 2,
          boxShadow: '0 0 5px rgba(231,215,167,0.6)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.8, delay: 0.2, times: [0, 0.3, 0.7, 0.92] }}
      />
      {/* 分针 */}
      <motion.div
        className="absolute left-1/2 top-1/2 origin-top"
        style={{
          width: 2,
          height: 72,
          background: 'linear-gradient(180deg, #e7d7a7, #6a5220)',
          transform: 'translate(-50%, 0) rotate(30deg)',
          borderRadius: 2,
          boxShadow: '0 0 4px rgba(231,215,167,0.55)',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.8, delay: 0.2, times: [0, 0.3, 0.7, 0.92] }}
      />

      {/* 秒针 —— 先缓慢，再骤然加速后定格 */}
      <motion.div
        className="absolute left-1/2 top-1/2 origin-top"
        style={{
          width: 1.6,
          height: 82,
          background: '#c94b2f',
          transform: 'translate(-50%, 0)',
          borderRadius: 1.5,
          boxShadow: '0 0 6px rgba(201,75,47,0.75), 0 0 12px rgba(239,68,68,0.4)',
        }}
        initial={{ rotate: 0, opacity: 0 }}
        animate={{
          rotate: [0, 30, 60, 240, 900, 2160, 2160],
          opacity: [0, 1, 1, 1, 1, 1, 0],
        }}
        transition={{
          duration: 1.8,
          delay: 0.2,
          times: [0, 0.1, 0.2, 0.35, 0.55, 0.8, 0.95],
        }}
      />

      {/* 中心宝石 */}
      <motion.div
        className="absolute top-1/2 left-1/2 rounded-full"
        style={{
          width: 10,
          height: 10,
          background: 'radial-gradient(circle, #f4e0b4 0%, #8a5a2a 80%)',
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 8px #f4e0b4, 0 0 16px rgba(251,191,36,0.6)',
        }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 1, 1, 1, 0], scale: [0, 1, 1, 1, 2.4] }}
        transition={{ duration: 1.9, delay: 0.2, times: [0, 0.2, 0.55, 0.8, 1] }}
      />

      {/* 裂纹 — 钟面裂开 */}
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0, 1, 1, 0] }}
        transition={{ duration: 1.8, delay: 0.2, times: [0, 0.4, 0.55, 0.68, 0.8, 0.95] }}
      >
        <g
          fill="none"
          stroke="#f4e0b4"
          strokeWidth="1"
          strokeOpacity="0.9"
          style={{ filter: 'drop-shadow(0 0 4px rgba(231,215,167,0.9))' }}
        >
          <path d="M100,100 L30,35 L10,20" />
          <path d="M100,100 L180,48 L196,28" />
          <path d="M100,100 L182,172 L198,192" />
          <path d="M100,100 L22,170 L6,190" />
          <path d="M100,100 L110,10" strokeWidth="0.8" />
          <path d="M100,100 L195,112" strokeWidth="0.8" />
          {/* 支裂 */}
          <path d="M55,55 L42,48" />
          <path d="M150,60 L165,42" />
          <path d="M148,150 L166,165" />
          <path d="M52,148 L38,158" />
        </g>
      </motion.svg>
    </motion.div>
  );
}

/** 径向白-琥珀闪光（钟盘碎裂瞬间） */
function AuraPulse() {
  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0, 0.75, 0.3, 0] }}
      transition={{ duration: 0.8, delay: 1.25, times: [0, 0.25, 0.5, 0.75, 1] }}
      style={{
        background:
          'radial-gradient(circle at center, rgba(255,245,210,0.85) 0%, rgba(251,191,36,0.4) 25%, rgba(139,92,246,0.15) 55%, transparent 78%)',
      }}
    />
  );
}

/** 古旧飘落花瓣 / 羽毛（点缀） */
function FloatingPetals() {
  const petals = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    leftPct: 10 + Math.random() * 80,
    startY: -20 - Math.random() * 80,
    delay: 0.6 + i * 0.18,
    duration: 3.2 + Math.random() * 1.5,
    rot: (Math.random() - 0.5) * 320,
    size: 7 + Math.random() * 5,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {petals.map(p => (
        <motion.div
          key={p.id}
          className="absolute"
          style={{ left: `${p.leftPct}%`, top: p.startY, width: p.size, height: p.size * 1.6 }}
          initial={{ opacity: 0, rotate: 0, y: 0 }}
          animate={{
            opacity: [0, 0.7, 0.55, 0],
            y: [0, 160 + Math.random() * 60],
            x: [0, (Math.random() - 0.5) * 40],
            rotate: [0, p.rot],
          }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
        >
          <svg viewBox="0 0 10 16" width="100%" height="100%">
            <path
              d="M5,0 C9,4 9,10 5,16 C1,10 1,4 5,0 Z"
              fill="#e7d7a7"
              fillOpacity="0.8"
              style={{ filter: 'drop-shadow(0 0 3px rgba(251,191,36,0.6))' }}
            />
          </svg>
        </motion.div>
      ))}
    </div>
  );
}

export function BattleStartOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at center, #0b0720 0%, #03010a 100%)',
      }}
    >
      <InkBloom />
      <EmberMotes />
      <ArcaneRings />
      <RomanClockShatter />
      <AuraPulse />
      <FloatingPetals />

      {/* 拉丁铭文 —— 从钟盘处缓慢显现 */}
      <motion.div
        className="absolute pointer-events-none select-none text-center"
        style={{ top: '18%', left: 0, right: 0 }}
        initial={{ opacity: 0, y: -6, letterSpacing: '0.5em' }}
        animate={{
          opacity: [0, 0.65, 0.5, 0],
          y: [-6, 0, 0, 0],
          letterSpacing: ['0.5em', '0.4em', '0.4em', '0.4em'],
        }}
        transition={{ duration: 2.4, times: [0, 0.35, 0.75, 1], delay: 0.2 }}
      >
        <p
          style={{
            color: '#e7d7a7',
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontSize: 10,
            fontStyle: 'italic',
            textShadow: '0 0 8px rgba(251,191,36,0.5)',
          }}
        >
          TEMPUS · FRANGITUR
        </p>
      </motion.div>

      {/* 主标题：战斗 / BATTLE */}
      <motion.div
        className="relative z-10 pointer-events-none select-none text-center"
        style={{ marginTop: 210 }}
        initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
        animate={{ opacity: [0, 1, 1], y: [10, 0, 0], filter: ['blur(6px)', 'blur(0px)', 'blur(0px)'] }}
        transition={{ duration: 1.2, delay: 1.45, times: [0, 0.55, 1], ease: 'easeOut' }}
      >
        <p
          style={{
            fontFamily: '"Noto Serif SC", "Songti SC", "Source Han Serif", serif',
            fontSize: 'clamp(2.4rem, 11vw, 3.8rem)',
            fontWeight: 800,
            color: '#f4e0b4',
            letterSpacing: '0.55em',
            textShadow:
              '0 0 16px rgba(251,191,36,0.55), 0 0 36px rgba(139,92,246,0.4), 0 2px 0 rgba(0,0,0,0.8)',
            lineHeight: 1.1,
            marginRight: '-0.55em', // 抵消 letter-spacing 末尾偏移
          }}
        >
          战 斗
        </p>
      </motion.div>

      {/* 副标题：开始 / BATTLE START 英文小字 */}
      <motion.div
        className="relative z-10 pointer-events-none select-none text-center"
        style={{ marginTop: 16 }}
        initial={{ opacity: 0, letterSpacing: '1em' }}
        animate={{ opacity: [0, 0.8, 0.65], letterSpacing: ['1em', '0.65em', '0.65em'] }}
        transition={{ duration: 1, delay: 1.75 }}
      >
        <p
          style={{
            fontFamily: '"Cinzel", "Times New Roman", serif',
            fontSize: 11,
            color: '#e7d7a7',
            textShadow: '0 0 10px rgba(251,191,36,0.55)',
          }}
        >
          battle engaged
        </p>
        <motion.div
          className="mx-auto mt-3"
          style={{ width: 120, height: 1, background: 'linear-gradient(90deg, transparent, rgba(231,215,167,0.7), transparent)' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.7, delay: 1.9 }}
        />
      </motion.div>
    </motion.div>
  );
}
