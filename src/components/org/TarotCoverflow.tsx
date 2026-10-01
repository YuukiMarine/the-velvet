/**
 * 选代表牌（第 7 轮验收：改成和同伴「专辑墙」一样的滑动选牌，仪式感更足）。
 *   · 中央一张大牌正对，两侧透视斜排渐暗；横向拖一张张跟手切，点两侧的牌切过去，←/→ 键也行；
 *   · 牌下是编号 · 英文名、牌名、正位关键词和一句牌意；
 *   · 底部刻度条：22 格，点 / 拖快速跳；别人已持有的牌灰掉、跳不过去（滑到它也会写「已有人持有」）。
 * 尺寸按屏幕高宽算，整块连同按钮尽量一屏放下；动画只走 transform / opacity，粗犷度关掉时不做 3D。
 */
import { useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'motion/react';
import { MAJOR_ARCANA } from '@/constants/tarot';
import { tarotArtUrl } from '@/constants/tarotArt';
import { useTarotArtSet } from '@/ui/useTarotArtSet';
import { useBoldness } from '@/utils/boldness';
import { playSound, triggerLightHaptic } from '@/utils/feedback';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, roughQuad } from '@/components/p5r/kit';
import { useOrgTone } from './orgUi';

const subscribe = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const getSize = () => `${window.innerWidth}x${window.innerHeight}`;

/** 中央牌宽：弹层高度扣掉标题 / 牌意 / 刻度条 / 按钮之后剩下的，宽度不超过屏宽的 44%，夹在 96–176 之间（矮屏上提示那一行也收起来） */
function useCardWidth(): number {
  const size = useSyncExternalStore(subscribe, getSize, () => '390x844');
  const [w, h] = size.split('x').map(Number);
  return Math.round(Math.max(96, Math.min(176, (h * 0.88 - 400) / 1.6, w * 0.44)));
}

/** 翻牌音的最小间隔（ms），同专辑墙：快速划过不糊成一片 */
const FLIP_SFX_GAP = 90;

export function TarotCoverflow({ index, onIndex, taken }: { index: number; onIndex: (i: number) => void; taken: Set<string> }) {
  const tone = useOrgTone();
  const set = useTarotArtSet();
  const bold = useBoldness();
  const cardW = useCardWidth();
  const cardH = Math.round(cardW * 1.6);
  const count = MAJOR_ARCANA.length;
  const card = MAJOR_ARCANA[index];
  const off = taken.has(card.id);
  const lastSfx = useRef(0);

  const go = (next: number) => {
    const i = Math.max(0, Math.min(count - 1, next));
    if (i === index) return;
    triggerLightHaptic();
    const now = performance.now();
    if (now - lastSfx.current >= FLIP_SFX_GAP) {
      lastSfx.current = now;
      playSound('/tarots.mp3', 0.6);
    }
    onIndex(i);
  };

  // 横拖：跟手一张张切（每走 step 像素切一张），松手就停在当前那张。
  // 容器抓了指针，点击事件落不到牌上：没拖动的一下按压在松手时自己判断点的是哪张
  const drag = useRef<{ x: number; start: number; moved: boolean; idx: number | null } | null>(null);
  const handledAt = useRef(0);
  const step = cardW * 0.42;
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = (e.target as HTMLElement).closest('[data-idx]');
    drag.current = { x: e.clientX, start: index, moved: false, idx: el ? Number(el.getAttribute('data-idx')) : null };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 6) d.moved = true;
    if (d.moved) go(d.start - Math.round(dx / step));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    handledAt.current = performance.now();
    if (d && !d.moved && d.idx !== null && d.idx !== index) go(d.idx);
  };

  // 刻度条：点 / 拖跳到对应那张（别人持有的跳不过去）
  const bar = useRef<HTMLDivElement>(null);
  const barJump = (clientX: number) => {
    const el = bar.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.max(0, Math.min(count - 1, Math.floor(((clientX - r.left) / r.width) * count)));
    if (!taken.has(MAJOR_ARCANA[i].id)) go(i);
  };

  const accent = tone.channel === 'p5' ? P5R.red : tone.accent;
  const up = card.upright;

  return (
    <div className="select-none">
      <div
        role="listbox"
        aria-label="代表牌"
        aria-activedescendant={`tarot-opt-${card.id}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative mx-auto w-full touch-pan-y outline-none"
        style={{ height: cardH + 16, perspective: bold ? 900 : undefined }}
      >
        {MAJOR_ARCANA.map((c, i) => {
          const d = i - index;
          const ad = Math.abs(d);
          if (ad > 2) return null;
          const sign = Math.sign(d);
          const x = ad === 0 ? 0 : sign * (cardW * 0.62 + (ad - 1) * cardW * 0.36);
          const isTaken = taken.has(c.id);
          const url = tarotArtUrl(c.id, set);
          const radius = tone.channel === 'p4' ? 14 : tone.channel === 'neutral' ? 12 : 0;
          return (
            <motion.button
              key={c.id}
              id={`tarot-opt-${c.id}`}
              type="button"
              role="option"
              aria-selected={d === 0}
              aria-label={`${c.name}${isTaken ? '（已有人持有）' : ''}`}
              tabIndex={-1}
              data-idx={i}
              // 读屏 / 键盘点到的时候走这里；手指点的已经在松手时处理过了
              onClick={() => { if (performance.now() - handledAt.current > 400 && d !== 0) go(i); }}
              className="absolute left-1/2 top-2"
              style={{ width: cardW, height: cardH, marginLeft: -cardW / 2, zIndex: 10 - ad }}
              initial={false}
              animate={{
                x,
                scale: 1 - ad * 0.14,
                rotateY: bold ? -sign * 32 : 0,
                opacity: ad === 2 ? 0.55 : 1,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.7 }}
            >
              <span
                className="absolute inset-0 overflow-hidden"
                style={{
                  borderRadius: radius,
                  clipPath: tone.channel === 'p5' ? roughQuad(i + 0.37, 3) : tone.channel === 'p3' ? slantClip(10) : undefined,
                  background: c.accent,
                  boxShadow: d === 0
                    ? (tone.channel === 'p4' ? '0 0 0 3px #131313, 0 8px 0 3px rgba(19,19,19,0.25)' : tone.channel === 'neutral' ? '0 18px 38px -18px rgba(0,0,0,0.6)' : undefined)
                    : undefined,
                }}
              >
                {url && <img src={url} alt="" draggable={false} loading={ad <= 1 ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full object-cover" />}
                {/* 两侧压暗；别人持有的牌灰掉 */}
                <span aria-hidden className="absolute inset-0 bg-black transition-opacity duration-200" style={{ opacity: isTaken ? 0.62 : ad === 0 ? 0 : 0.3 }} />
                {isTaken && (
                  <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[12px] font-black text-white" style={{ letterSpacing: '0.1em' }}>已有人持有</span>
                )}
              </span>
              {d === 0 && tone.channel === 'p3' && <span aria-hidden className="absolute -bottom-1 right-3 h-[6px] w-[26px]" style={{ background: P3R.magenta, clipPath: 'polygon(30% 0, 100% 0, 70% 100%, 0 100%)' }} />}
            </motion.button>
          );
        })}
      </div>

      {/* 牌名与牌意 */}
      <div className="mt-2 text-center">
        <div className="text-[11px] font-black tracking-[0.18em] text-gray-400">{card.roman} · {card.nameEn.toUpperCase()}</div>
        <div className="mt-0.5 text-[24px] font-black leading-tight text-gray-900 dark:text-white" style={{ fontFamily: tone.titleFont }}>{card.name}</div>
        <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
          {up.keywords.slice(0, 4).map(k => (
            <span
              key={k}
              className="whitespace-nowrap px-2 py-[3px] text-[11px] font-black leading-none"
              style={{
                color: tone.channel === 'p4' ? '#131313' : '#ffffff',
                background: off ? 'rgba(127,127,127,0.55)' : accent,
                borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0,
                clipPath: tone.channel === 'p3' ? slantClip(4) : tone.channel === 'p5' ? roughQuad(k.length + 0.6, 1.5) : undefined,
              }}
            >
              {k}
            </span>
          ))}
        </div>
        <p className="mx-auto mt-2 min-h-[2.9em] max-w-[22em] text-[13px] font-semibold leading-relaxed text-gray-600 dark:text-gray-300">
          {off ? '这张已经有人持有了，滑到别的牌看看。' : up.meaning}
        </p>
      </div>

      {/* 刻度条 */}
      <div
        ref={bar}
        className="relative mx-auto mt-1 flex h-7 w-full max-w-[360px] items-end gap-[2px] touch-none"
        onPointerDown={(e) => { try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ } barJump(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons) barJump(e.clientX); }}
      >
        {MAJOR_ARCANA.map((c, i) => {
          const on = i === index;
          const isTaken = taken.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              disabled={isTaken}
              onClick={() => go(i)}
              aria-label={`${c.name}${isTaken ? '（已有人持有）' : ''}`}
              className="flex h-full flex-1 items-end justify-center disabled:cursor-not-allowed"
            >
              <span
                aria-hidden
                className="block w-full transition-all duration-150"
                style={{
                  height: on ? 22 : 10,
                  background: on ? accent : isTaken ? 'rgba(127,127,127,0.25)' : 'rgba(127,127,127,0.55)',
                  borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 3 : 0,
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 从某张牌开始（没有就从第一张没人持有的开始） */
export const coverflowStart = (tarotId: string | undefined, taken: Set<string>): number => {
  const cur = tarotId ? MAJOR_ARCANA.findIndex(c => c.id === tarotId) : -1;
  if (cur >= 0) return cur;
  const free = MAJOR_ARCANA.findIndex(c => !taken.has(c.id));
  return free >= 0 ? free : 0;
};
