import { motion } from 'framer-motion';
import { useAppStore } from '@/store';

/**
 * Theme-aware musical note that bounces then flies away.
 * Uses external SVG assets per theme:
 *   blue/pink/custom → m3.svg,  yellow → m4.svg,  red → m5.svg
 *
 *  count: number of notes (clamped 1-4)
 *  delay: base delay before notes start
 */

const NOTE_SVG: Record<string, string> = {
  blue: '/m3.svg',
  pink: '/m3.svg',
  yellow: '/m4.svg',
  red: '/m5.svg',
};

function useNoteSrc(): string {
  const theme = useAppStore(s => s.user?.theme);
  const customScheme = useAppStore(s => s.settings.customSoundScheme);
  const effective = theme === 'custom' ? (customScheme || 'blue') : (theme || 'blue');
  return NOTE_SVG[effective] || NOTE_SVG.blue;
}

export function MusicalNotes({ count, delay: _delay = 0.3 }: { count: number; delay?: number }) {
  const n = Math.min(4, Math.max(1, count));
  const noteSrc = useNoteSrc();

  // Spread toward upper-right so notes fan out
  const xOffsets = [-20, 30, 80, 130];
  const yOffsets = [5, -15, -35, -55];

  /*
   * Phase 1 (t 0–0.225 = 0.45s): pop + 2 bounces upper-right + drift + squash-stretch
   * Pause  (t 0.225–0.325 = 0.2s): hold position
   * Phase 2 (t 0.325–1.0 = 1.35s):
   *   launch right-up curving to right-down
   *   accelerating sweep to lower-left, fly off screen (strong ease-in end)
   *   scale +150% slow→fast (end at 2.5×), rotate 0→15° clockwise
   */

  // 11 keyframes: 4 bounce + pause + 6 arc
  const times = [
    0, 0.038, 0.09, 0.15, 0.225, 0.325,  // Phase 1 (0.45s) + pause (0.2s)
    0.43, 0.58,                            // right-down arc
    0.73, 0.87, 1.0,                       // left-down sweep, fast end
  ];

  // Arc waypoints — 5 waypoints (launch from held position)
  const baseArcX = [170, 230, 100, -260, -800];
  const baseArcY = [-5, 80, 300, 550, 1100];
  const arcMult = [0.85, 1.0, 0.92, 1.08];

  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const noteDelay = i * 0.25;
        const m = arcMult[i];
        // rotate arc path i*4° counter-clockwise (screen space, y-down)
        const rad = (i * 4 * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const ax = baseArcX.map((bx, j) => (bx * m) * cos + (baseArcY[j] * m) * sin);
        const ay = baseArcY.map((by, j) => -(baseArcX[j] * m) * sin + (by * m) * cos);
        return (
          <motion.div
            key={i}
            className="absolute pointer-events-none z-[60]"
            style={{ left: '50%', top: '35%', marginLeft: xOffsets[i], marginTop: yOffsets[i] }}
            initial={{ scale: 0, opacity: 0, y: 0, x: 0, rotate: 0 }}
            animate={{
              scale: [
                // Phase 1: pop + 2 bounces
                0, 1.3, 1, 1, 1,
                // Pause hold, then Phase 2: +150% slow→fast (end 2.5×)
                1, 1.08, 1.18, 1.38, 1.68, 2.5,
              ],
              opacity: [
                0, 1, 1, 1, 1,
                1, 1, 1, 1, 1, 0,
              ],
              y: [
                0, -40, -5, -30, -12,
                -12, ay[0], ay[1], ay[2], ay[3], ay[4],
              ],
              x: [
                0, 22, 42, 65, 82,
                82, ax[0], ax[1], ax[2], ax[3], ax[4],
              ],
              rotate: [
                0, -8, 0, -3, 0,
                0, 1, 2, 6, 10, 15,
              ],
            }}
            transition={{
              duration: 2.0,
              delay: noteDelay,
              ease: [
                'easeOut', 'easeOut', 'easeOut', 'easeOut',  // bounce (4 segs)
                'linear',                                      // pause hold
                'easeIn', 'easeIn', 'easeIn', 'easeIn', 'easeIn', // arc sweep (5 segs, uniform)
              ],
              times,
            }}
          >
            {/* Squash & stretch — ±20% at 2Hz, 2 cycles, rate unchanged */}
            <motion.div
              initial={{ scaleX: 1, scaleY: 1 }}
              animate={{
                scaleX: [1, 1.2, 1, 0.8, 1],
                scaleY: [1, 0.8, 1, 1.2, 1],
              }}
              transition={{
                duration: 0.5,
                delay: noteDelay,
                repeat: 1,
                ease: 'easeInOut',
              }}
            >
              <img
                src={noteSrc}
                alt=""
                width="212"
                height="119"
                draggable={false}
                style={{ filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.35))' }}
              />
            </motion.div>
          </motion.div>
        );
      })}
    </>
  );
}
