/**
 * 名册 · 专辑墙样式（验收：点「名册」标题在格子 / 专辑墙之间切换，记在设置里，下次打开还是这个样式）。
 * 手感照搬同伴页的专辑墙：
 *   · 中央一张正对放大，两侧透视斜排渐暗；横向拖一张张跟手切，点两侧的牌切过去，←/→ 键也行；
 *   · 点中央那张翻面——背面就是成员牌背面（展示的面具、本周目标、加入日期）；右上角「⇄」在代表牌 / 头像之间换（本机偏好）；
 *   · 下面是铭牌：牌名、代号 + LV、名片状态、本周出勤 + 连续天数、称号，「同调」和「⋯」；翻到背面先看「五维」那一页；
 *   · 铭牌背后那枚背景件跟着翻牌动（和同伴专辑墙同一个：红星转 60° / 黄星转 90° / 蓝水波；中性多一圈虚线环）；
 *   · 有空座位时最后一张是空白牌，点一下发邀请码。
 * 只渲染中央 ±2 张；动画只走 transform / opacity；粗犷度关掉时不做 3D、不转背景件。
 */
import { useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useBoldness } from '@/utils/boldness';
import { playSound, triggerLightHaptic } from '@/utils/feedback';
import { P3R, slantClip } from '@/components/p3r/kit';
import { P5R, P5_TITLE_FONT, roughQuad } from '@/components/p5r/kit';
import { WallSpinBackdrop } from '@/components/cooperation/WallSpinBackdrop';
import { toggleMemberFace } from '@/services/orgSync';
import { shownPersonas } from '@/utils/orgLogic';
import { LvTag, MemberCardBack, fitFont, memberFacts, memberHonors, useMemberFace } from './MemberCard';
import { OrgButton, WeekDots, useOrgTone, type OrgTone } from './orgUi';
import type { OrgMember, OrgMinutesSnapshot, OrgView } from '@/types';

const subscribe = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const getWidth = () => window.innerWidth;

/** 中央牌宽：屏宽的 46%，夹在 140–196 之间（名册在页面里，不能像弹层那样吃满一屏） */
function useCardWidth(): number {
  const w = useSyncExternalStore(subscribe, getWidth, () => 390);
  return Math.round(Math.max(140, Math.min(196, Math.min(w, 672) * 0.46)));
}

/** 翻牌音的最小间隔（ms），同专辑墙：快速划过不糊成一片 */
const FLIP_SFX_GAP = 90;
const seatNo = (n: number) => String(n).padStart(2, '0');

type Item = OrgMember | 'invite';
const idOf = (it: Item) => (it === 'invite' ? 'invite' : it.id);

export function RosterWall({ view, minutes, blocked, onMore, onSync, onInvite }: {
  view: OrgView;
  minutes?: OrgMinutesSnapshot | null;
  blocked: Set<string>;
  /** 「⋯」：查看大牌 / 同调 / 屏蔽 / 转让…（和格子样式同一个菜单） */
  onMore: (m: OrgMember) => void;
  /** 「同调」：打开借面具弹层 */
  onSync: (m: OrgMember) => void;
  /** 空白牌：发邀请码 */
  onInvite: () => void;
}) {
  const tone = useOrgTone();
  const bold = useBoldness();
  const cw = useCardWidth();
  const ch = Math.round(cw * 1.6);
  const empty = Math.max(0, 7 - view.members.length);
  const items: Item[] = [...view.members, ...(empty > 0 ? ['invite' as const] : [])];
  const count = items.length;
  // 中央卡按 id 锚定（有人加入 / 退出时不会「指到别人」）；锚的人不在了就回到第一张
  const [centerId, setCenterId] = useState<string | null>(null);
  const anchored = centerId ? items.findIndex(it => idOf(it) === centerId) : 0;
  const index = anchored === -1 ? 0 : anchored;
  const current = items[index];
  const [flipped, setFlipped] = useState(false);
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
    setFlipped(false);
    setCenterId(idOf(items[i]));
  };

  const tapCenter = () => {
    if (current === 'invite') { onInvite(); return; }
    setFlipped(f => !f);
    triggerLightHaptic();
  };

  // 手势：横拖跟手一张张切（每走 step 像素切一张）；没拖动的一下按压在松手时判断点的是哪张。
  // 拖动开始之后才抓指针——按在牌面上的小按钮（⇄）还能收到自己的点击
  const drag = useRef<{ x: number; y: number; start: number; moved: boolean; idx: number | null; onBtn: boolean } | null>(null);
  const handledAt = useRef(0);
  const step = cw * 0.42;
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    const el = target.closest('[data-idx]');
    drag.current = { x: e.clientX, y: e.clientY, start: index, moved: false, idx: el ? Number(el.getAttribute('data-idx')) : null, onBtn: !!target.closest('button') };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
      d.moved = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    }
    if (d.moved) go(d.start - Math.round(dx / step));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.onBtn) return;
    handledAt.current = performance.now();
    if (d.idx === null) return;
    if (d.idx === index) tapCenter();
    else go(d.idx);
  };

  const accent = tone.channel === 'p5' ? P5R.red : tone.channel === 'p4' ? 'var(--p4-orange, #f9a11b)' : tone.accent;
  const radius = tone.channel === 'p4' ? 14 : tone.channel === 'neutral' ? 12 : 0;

  return (
    <div className="relative isolate select-none">
      <div
        role="listbox"
        aria-label="名册"
        aria-activedescendant={`roster-wall-${idOf(current)}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapCenter(); }
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { drag.current = null; }}
        className="relative mx-auto w-full touch-pan-y outline-none"
        style={{ height: ch + 20, perspective: bold ? 1000 : undefined }}
      >
        {items.map((it, i) => {
          const d = i - index;
          const ad = Math.abs(d);
          if (ad > 2) return null;
          const sign = Math.sign(d);
          const isCenter = d === 0;
          const x = ad === 0 ? 0 : sign * (cw * 0.66 + (ad - 1) * cw * 0.38);
          const rotY = isCenter ? (flipped && bold ? 180 : 0) : (bold ? -sign * 34 : 0);
          const id = idOf(it);
          return (
            <motion.div
              key={id}
              id={`roster-wall-${id}`}
              role="option"
              aria-selected={isCenter}
              aria-label={it === 'invite' ? `还有 ${empty} 个空座位，点一下发邀请码` : `${seatNo(it.seat)} 号 ${memberFacts(view, it).codename}${isCenter ? (flipped ? '（背面）' : '（点一下翻面）') : ''}`}
              data-idx={i}
              // 读屏 / 键盘点到的时候走这里；手指点的已经在松手时处理过了
              onClick={() => { if (performance.now() - handledAt.current > 400) { if (isCenter) tapCenter(); else go(i); } }}
              className="absolute left-1/2 top-2 cursor-pointer"
              style={{ width: cw, height: ch, marginLeft: -cw / 2, zIndex: 10 - ad, transformStyle: bold ? 'preserve-3d' : undefined }}
              initial={false}
              animate={{ x, rotateY: rotY, scale: 1 - ad * 0.15, opacity: ad === 2 ? 0.5 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
            >
              {it === 'invite' ? (
                <InviteCard tone={tone} empty={empty} radius={radius} />
              ) : (
                <>
                  <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', visibility: !bold && isCenter && flipped ? 'hidden' : undefined }}>
                    <WallFace view={view} member={it} tone={tone} radius={radius} center={isCenter} blocked={blocked.has(it.userId)} />
                    {/* 两侧压暗 */}
                    <span aria-hidden className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-200" style={{ opacity: isCenter ? 0 : 0.18 + ad * 0.14, borderRadius: radius, clipPath: shapeClip(tone, it.seat) }} />
                  </div>
                  {isCenter && (
                    <div
                      className="absolute inset-0"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: bold ? 'rotateY(180deg)' : undefined, visibility: !bold && !flipped ? 'hidden' : undefined }}
                    >
                      <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius, clipPath: shapeClip(tone, it.seat), boxShadow: tone.channel === 'neutral' ? '0 18px 38px -18px rgba(0,0,0,0.6)' : undefined }}>
                        <MemberCardBack view={view} member={it} width={cw} height={ch} />
                        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ boxShadow: backFrame(tone) }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* 铭牌 + 背景件 */}
      <div className="relative mx-auto mt-3 max-w-sm px-3 text-center">
        <WallSpinBackdrop channel={tone.channel} index={bold ? index : 0} neutralRing ringColor="rgba(99,102,241,0.2)" />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={idOf(current)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            {current === 'invite'
              ? <InvitePlate tone={tone} empty={empty} onInvite={onInvite} />
              : <MemberPlate view={view} member={current} minutes={minutes} tone={tone} accent={accent} blocked={blocked.has(current.userId)} onMore={() => onMore(current)} onSync={() => onSync(current)} />}
          </motion.div>
        </AnimatePresence>

        {/* 跳卡刻度：一人一根，空白牌是一个圈；当前那根拉长、上主题色 */}
        {count > 1 && (
          <div className="mx-auto mt-3 flex h-7 max-w-[240px] items-center justify-center gap-[6px]" role="group" aria-label="快速跳到某个人">
            {items.map((it, i) => {
              const on = i === index;
              return (
                <button
                  key={idOf(it)}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={it === 'invite' ? '空座位' : `${seatNo(it.seat)} 号 ${memberFacts(view, it).codename}`}
                  aria-current={on}
                  className="flex h-full w-5 items-center justify-center"
                >
                  {it === 'invite' ? (
                    <motion.span aria-hidden className="block rounded-full" style={{ border: `2px solid ${on ? accent : 'rgba(127,127,127,0.5)'}` }} animate={{ width: on ? 12 : 8, height: on ? 12 : 8 }} />
                  ) : (
                    <motion.span
                      aria-hidden
                      className="block"
                      style={{ borderRadius: tone.channel === 'p3' || tone.channel === 'p5' ? 0 : 999, background: on ? accent : 'rgba(127,127,127,0.5)' }}
                      animate={{ width: on ? 6 : 3, height: on ? 24 : 10 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-1 text-[10px] font-bold" style={{ color: tone.stageSub }}>左右切换 · 点中间那张翻面</div>
      </div>
    </div>
  );
}

/** 背面的边框（和正面同一套颜色，不分是不是我） */
const backFrame = (tone: OrgTone): string =>
  tone.channel === 'p3' ? `inset 0 0 0 4px ${P3R.blue}`
    : tone.channel === 'p4' ? 'inset 0 0 0 5px #131313'
      : tone.channel === 'p5' ? `inset 0 0 0 4px ${P5R.ink}, inset 0 0 0 7px ${P5R.red}`
        : 'inset 0 0 0 1px rgba(255,255,255,0.18)';

/** 牌的外形：蓝斜切 / 红不规则四边 / 黄、中性圆角（圆角走 borderRadius，这里返回 undefined） */
const shapeClip = (tone: OrgTone, seat: number): string | undefined =>
  tone.channel === 'p3' ? slantClip(12) : tone.channel === 'p5' ? roughQuad(seat + 0.37, 3) : undefined;

// ── 牌面 ─────────────────────────────────────────────────────────────────────

function WallFace({ view, member, tone, radius, center, blocked }: { view: OrgView; member: OrgMember; tone: OrgTone; radius: number; center: boolean; blocked: boolean }) {
  const face = useMemberFace(member);
  const f = memberFacts(view, member);
  const frame: CSSProperties = tone.channel === 'p3'
    ? { boxShadow: `inset 0 0 0 4px ${f.mine ? P3R.magenta : P3R.blue}` }
    : tone.channel === 'p4'
      ? { boxShadow: `inset 0 0 0 5px #131313, inset 0 0 0 8px ${f.mine ? 'var(--p4-orange, #f9a11b)' : '#fff6d0'}` }
      : tone.channel === 'p5'
        ? { boxShadow: `inset 0 0 0 4px ${P5R.ink}, inset 0 0 0 7px ${f.mine ? P5R.red : P5R.paper}` }
        : { boxShadow: `inset 0 0 0 ${f.mine ? 3 : 1}px ${f.mine ? 'var(--ui-accent, #6366f1)' : 'rgba(255,255,255,0.25)'}` };
  const chipSkin: CSSProperties = tone.channel === 'p3'
    ? { background: P3R.blue, color: '#ffffff', clipPath: slantClip(4) }
    : tone.channel === 'p4'
      ? { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1.5px #131313' }
      : tone.channel === 'p5'
        ? { background: P5R.red, color: P5R.white, clipPath: roughQuad(member.seat + 1.1, 1.6), fontFamily: P5_TITLE_FONT }
        : { background: 'rgba(0,0,0,0.55)', color: '#ffffff', borderRadius: 6 };
  return (
    <div
      className="absolute inset-0 overflow-hidden text-white"
      style={{
        borderRadius: radius,
        clipPath: shapeClip(tone, member.seat),
        background: f.card?.accent ?? '#1f2937',
        boxShadow: center && tone.channel === 'neutral' ? '0 18px 38px -18px rgba(0,0,0,0.6)' : undefined,
        opacity: blocked ? 0.6 : 1,
      }}
    >
      {face.url
        ? <img src={face.url} alt="" draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        : <div className="absolute inset-0 flex items-center justify-center text-center text-[12px] font-black leading-tight opacity-70">还没选<br />代表牌</div>}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black/75 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={frame} />
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1">
        <span className="px-1.5 py-[2px] text-[10px] font-black leading-none tracking-[0.12em]" style={chipSkin}>{seatNo(member.seat)}</span>
        {f.leader && <span aria-label="队长" className="text-[13px] leading-none">👑</span>}
      </div>
      {f.streak > 0 && (
        <div className="absolute inset-x-0 bottom-2 text-center text-[11px] font-black tabular-nums text-white/90">连续 {f.streak} 天</div>
      )}
      {center && face.canToggle && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleMemberFace(member.userId); }}
          aria-label={face.avatar ? '牌面换回代表牌' : '牌面换成头像'}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-[12px] font-black leading-none text-white"
        >
          ⇄
        </button>
      )}
      {blocked && <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[12px] font-black">已屏蔽</div>}
    </div>
  );
}

function InviteCard({ tone, empty, radius }: { tone: OrgTone; empty: number; radius: number }) {
  const line = tone.channel === 'p5' ? 'rgba(240,233,223,0.55)' : tone.channel === 'p3' ? 'rgba(27,87,255,0.45)' : tone.line;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center"
      style={{ border: `2px dashed ${line}`, borderRadius: radius, color: tone.stageSub, background: tone.channel === 'p3' ? 'rgba(226,243,250,0.6)' : tone.channel === 'p5' ? 'rgba(0,0,0,0.35)' : 'rgba(127,127,127,0.06)' }}
    >
      <span className="text-[30px] font-black leading-none">＋</span>
      <span className="text-[12px] font-black">{empty} 个空座位</span>
    </div>
  );
}

// ── 铭牌 ─────────────────────────────────────────────────────────────────────

function MemberPlate({ view, member, minutes, tone, accent, blocked, onMore, onSync }: {
  view: OrgView; member: OrgMember; minutes?: OrgMinutesSnapshot | null; tone: OrgTone; accent: string; blocked: boolean;
  onMore: () => void; onSync: () => void;
}) {
  const f = memberFacts(view, member);
  const honors = memberHonors(minutes, member.userId);
  const canSync = !f.mine && shownPersonas(member.card).length > 0;
  const weekOn = tone.channel === 'p3' ? P3R.blue : tone.channel === 'p4' ? 'var(--ui-ink, #131313)' : tone.channel === 'p5' ? P5R.red : 'var(--ui-accent, #6366f1)';
  const weekOff = tone.channel === 'p5' ? 'rgba(240,233,223,0.25)' : 'rgba(127,127,127,0.28)';
  const nameColor = tone.channel === 'p5' ? P5R.white : tone.channel === 'p3' ? P3R.ink : tone.stageInk;
  return (
    <div>
      <div className={`text-[12px] font-black tracking-[0.14em] ${tone.channel === 'p3' ? 'italic' : ''}`} style={{ color: tone.channel === 'p5' ? '#d90008' : accent }}>
        {f.card ? `${f.card.roman ?? ''} · ${f.card.name}`.replace(/^ · /, '') : '还没选代表牌'}
        {f.mine && <span className="ml-1.5">· 我</span>}
        {blocked && <span className="ml-1.5">· 已屏蔽</span>}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <h3
          className={`min-w-0 truncate font-black leading-tight ${tone.channel === 'p3' ? 'italic pr-[0.18em]' : ''}`}
          style={{ color: nameColor, fontFamily: tone.channel === 'p4' ? 'var(--p4-display-font, serif)' : tone.channel === 'p3' ? '"Noto Sans SC Black", "Velvet Sans SC", sans-serif' : tone.titleFont, fontSize: fitFont(f.codename, 220, 32, 20) }}
        >
          {f.codename}
        </h3>
        {f.lv && <LvTag tone={tone} lv={f.lv} size="lg" />}
      </div>
      {f.status && <div className="mt-1 text-[13px] font-bold" style={{ color: tone.stageSub }}>{f.status.emoji} {f.status.label}</div>}
      <div className="mt-2 flex items-center justify-center gap-3">
        <WeekDots days={f.week} today={f.today} on={weekOn} off={weekOff} size={10} labels />
        <div className="text-left leading-none">
          <div className="text-[20px] font-black tabular-nums" style={{ color: nameColor, fontFamily: tone.titleFont }}>{f.streak}</div>
          <div className="mt-0.5 text-[9px] font-bold" style={{ color: tone.stageSub }}>连续天数</div>
        </div>
      </div>
      {(honors.titles.length > 0 || honors.absent) && (
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {honors.titles.slice(0, 4).map(t => <PlateChip key={t} tone={tone}>{t}</PlateChip>)}
          {honors.titles.length > 4 && <PlateChip tone={tone} muted>{`+${honors.titles.length - 4}`}</PlateChip>}
          {honors.absent && <PlateChip tone={tone} muted>本周缺席</PlateChip>}
        </div>
      )}
      <div className="mt-3 flex items-center justify-center gap-2">
        {canSync && <OrgButton small onClick={onSync}>同调</OrgButton>}
        <OrgButton small tone="ghost" onClick={onMore} ariaLabel={`${f.codename} 的更多操作`}>⋯ 更多</OrgButton>
      </div>
    </div>
  );
}

function InvitePlate({ tone, empty, onInvite }: { tone: OrgTone; empty: number; onInvite: () => void }) {
  return (
    <div>
      <div className="text-[22px] font-black leading-tight" style={{ color: tone.channel === 'p5' ? P5R.white : tone.stageInk, fontFamily: tone.titleFont }}>还有 {empty} 个空座位</div>
      <div className="mt-1 text-[12px] font-bold" style={{ color: tone.stageSub }}>点空白牌或下面的按钮，把邀请码发给朋友</div>
      <div className="mt-3 flex justify-center"><OrgButton small onClick={onInvite}>发邀请码</OrgButton></div>
    </div>
  );
}

function PlateChip({ tone, muted = false, children }: { tone: OrgTone; muted?: boolean; children: string }) {
  const style: CSSProperties = muted
    ? { color: tone.stageSub, boxShadow: `inset 0 0 0 1px ${tone.channel === 'p5' ? 'rgba(240,233,223,0.45)' : 'rgba(127,127,127,0.45)'}`, borderRadius: tone.channel === 'p4' || tone.channel === 'neutral' ? 999 : 0 }
    : tone.channel === 'p3'
      ? { background: P3R.magenta, color: '#ffffff', clipPath: slantClip(3) }
      : tone.channel === 'p4'
        ? { background: 'var(--p4-orange, #f9a11b)', color: '#131313', borderRadius: 999, boxShadow: '0 0 0 1px #131313' }
        : tone.channel === 'p5'
          ? { background: P5R.red, color: P5R.white, clipPath: roughQuad(children.length + 0.7, 1.2), fontFamily: P5_TITLE_FONT }
          : { background: 'var(--ui-accent, #6366f1)', color: '#ffffff', borderRadius: 999 };
  return <span className="inline-flex items-center whitespace-nowrap px-2 py-[3px] text-[10px] font-black leading-none" style={style}>{children}</span>;
}
