import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import { MAJOR_ARCANA, TAROT_BY_ID, type TarotCardData } from '@/constants/tarot';
import { toLocalDateKey } from '@/store';
import { useUiChannel } from '@/ui/useUiChannel';
import { SEASON_ORDER, seasonOfDate } from '@/utils/calendar';
import { triggerNavFeedback } from '@/utils/feedback';
import { useSeasonCollection, useTarotCollection, type CollectedMark } from './codexData';
import { FlipBackPanel, FlipCardView } from './FlipCardView';
import { SeasonCardSVG, seasonCardEn } from './SeasonCard';
import { TarotFlipView } from './TarotFlipView';

/**
 * 图鉴（第 6 轮，用户拍板：放在「技能与成就」页里，不单开页）。两本册子：
 *   · 塔罗册：22 张大阿卡纳 × 正 / 逆 = 44 格，每日抽牌与中长期占卜抽到都算收录（小阿卡纳不展示）。
 *   · 岁时册：一年 24 节气 + 节日，按春夏秋冬四页左右翻，每枚是一张塔罗式的岁时卡（当天有记录才收）。
 * 影子档案留在战场的「阴影档案馆」。完成度全部来自已有行为，不发奖励——它是长尾目标，不是经济。
 */

type Book = 'tarot' | 'season';

const useTone = () => {
  const channel = useUiChannel();
  return useMemo(() => {
    switch (channel) {
      case 'p3': return { accent: '#1b57ff', ink: '#0a1230', sub: '#3d4a66', panel: '#ffffff', soft: '#e2f2fa', chip: '#cfeaf6', dark: false, radius: 6 };
      case 'p4': return { accent: 'var(--ui-accent, #ff8a2b)', ink: '#131313', sub: 'rgba(19,19,19,0.62)', panel: '#fff6d0', soft: 'rgba(19,19,19,0.06)', chip: 'rgba(19,19,19,0.09)', dark: false, radius: 16 };
      case 'p5': return { accent: '#c00008', ink: '#f0e9df', sub: '#b8b0a4', panel: '#161412', soft: '#2a2724', chip: '#3a3631', dark: true, radius: 4 };
      default: return { accent: 'var(--color-primary)', ink: 'var(--ui-ink, #111827)', sub: 'var(--ui-muted, #6b7280)', panel: 'var(--ui-paper, #ffffff)', soft: 'rgba(0,0,0,0.05)', chip: 'rgba(0,0,0,0.07)', dark: false, radius: 14 };
    }
  }, [channel]);
};
type Tone = ReturnType<typeof useTone>;

const Section = ({ title, aside, children, tone }: { title: string; aside?: ReactNode; children: ReactNode; tone: Tone }) => (
  <section className="p-4" style={{ background: tone.panel, borderRadius: tone.radius, color: tone.ink, boxShadow: tone.dark ? 'none' : '0 1px 0 rgba(0,0,0,0.04)' }}>
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h3 className="text-[15px] font-black">{title}</h3>
      {aside && <span className="text-[11px] font-bold tabular-nums" style={{ color: tone.sub }}>{aside}</span>}
    </div>
    {children}
  </section>
);

const Progress = ({ value, max, tone }: { value: number; max: number; tone: Tone }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: tone.soft }}>
    <motion.div className="h-full rounded-full" style={{ background: tone.accent }} initial={{ width: 0 }} animate={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} transition={{ duration: 0.6, ease: 'easeOut' }} />
  </div>
);

// ── 塔罗册 ──────────────────────────────────────────────────────────────

const TarotBook = ({ tone }: { tone: Tone }) => {
  const col = useTarotCollection();
  const [openId, setOpenId] = useState<string | null>(null);
  const openCard: TarotCardData | null = openId ? TAROT_BY_ID[openId] ?? null : null;
  return (
    <div className="space-y-4">
      <Section title="大阿卡纳" aside={`${col.majorCollected} / 44 · 正逆各算一格`} tone={tone}>
        <Progress value={col.majorCollected} max={44} tone={tone} />
        <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3">
          {MAJOR_ARCANA.map((card) => {
            const e = col.entries.get(card.id);
            const up = !!e?.upright.count, rev = !!e?.reversed.count;
            const any = up || rev;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => { triggerNavFeedback(); setOpenId(card.id); }}
                className="group flex flex-col items-center gap-1 text-center focus-visible:outline-none"
                aria-label={`${card.name}${any ? '' : '（未收录）'}`}
              >
                <span className="relative block overflow-hidden rounded-md" style={{ width: 68, height: 109, filter: any ? undefined : 'grayscale(1) brightness(0.55)', opacity: any ? 1 : 0.55 }}>
                  <TarotCardSVG card={card} orientation="upright" width={68} staticCard showOrientationTag={false} />
                  {!any && card.roman && (
                    <span className="absolute inset-0 flex items-center justify-center text-[22px] font-black text-white/85 drop-shadow">{card.roman}</span>
                  )}
                </span>
                <span className="text-[11px] font-black leading-tight" style={{ color: any ? tone.ink : tone.sub }}>{card.name}</span>
                <span className="flex gap-1 text-[9px] font-black leading-none">
                  <span className="rounded px-1 py-0.5" style={{ background: up ? tone.accent : tone.chip, color: up ? '#fff' : tone.sub }}>正{up ? ` ${e!.upright.count}` : ''}</span>
                  <span className="rounded px-1 py-0.5" style={{ background: rev ? tone.accent : tone.chip, color: rev ? '#fff' : tone.sub }}>逆{rev ? ` ${e!.reversed.count}` : ''}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      <TarotFlipView card={openCard} entry={openId ? col.entries.get(openId) : undefined} open={!!openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

// ── 岁时册 ──────────────────────────────────────────────────────────────

const SeasonFlipView = ({ mark, open, onClose, todayKey }: { mark: CollectedMark | null; open: boolean; onClose: () => void; todayKey: string }) => {
  if (!mark) return null;
  const en = seasonCardEn(mark);
  const status = mark.collected
    ? `已收录 · ${(mark.collectedAt ?? mark.date).slice(0, 10)}`
    : mark.date === todayKey ? '今天记一条，就收进岁时册'
    : mark.date < todayKey ? '那天没有记录，这一枚空着了'
    : `${mark.date.slice(5).replace('-', '/')} 那天记一条就能收`;
  return (
    <FlipCardView
      open={open}
      onClose={onClose}
      label={`${mark.name} · 岁时册`}
      resetKey={mark.key}
      hint="点一下或左右拖动翻面 · 背面是小注"
      front={(w) => <SeasonCardSVG mark={mark} collected={mark.collected} width={w} />}
      back={() => (
        <FlipBackPanel>
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[24px] font-black leading-none">{mark.name}</div>
              <div className="mt-1 text-[11px] font-bold tracking-[0.2em] opacity-60">{en.toUpperCase()}</div>
            </div>
            <div className="text-[12px] font-black opacity-50">{mark.kind === 'term' ? '节气' : '节日'} · {mark.date.slice(5).replace('-', '/')}</div>
          </div>
          <p className="mt-5 text-[15px] font-bold leading-relaxed">{mark.note}</p>
          <div className="mt-5 border-t border-black/10 pt-3 text-[11px] font-bold opacity-70">{status}</div>
        </FlipBackPanel>
      )}
    />
  );
};

const SeasonBook = ({ tone }: { tone: Tone }) => {
  const col = useSeasonCollection();
  const todayKey = toLocalDateKey(new Date());
  const thisYear = Number(todayKey.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const pages = useMemo(() => col.pagesOf(year), [col, year]);
  const all = useMemo(() => pages.flatMap((p) => p.marks), [pages]);
  const collected = all.filter((m) => m.collected).length;
  // 起始页：今年停在当季，往年停在春
  const [page, setPage] = useState(() => SEASON_ORDER.indexOf(seasonOfDate(todayKey)));
  const pagerRef = useRef<HTMLDivElement>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openMark = openKey ? all.find((m) => m.key === openKey) ?? null : null;
  const kindLabel: Record<string, string> = { moon: '月相', quest: '委托' };

  const goTo = (i: number) => {
    setPage(i);
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const el = pagerRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== page) setPage(i);
  };
  // 首次挂载 / 换年时把翻页器停到当前页（不带动画）
  useEffect(() => {
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: page * el.clientWidth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  return (
    <div className="space-y-4">
      <Section
        title={`岁时 · ${year}`}
        aside={(
          <span className="flex items-center gap-2">
            {col.years.map((y) => (
              <button key={y} type="button" onClick={() => { setYear(y); setPage(y === thisYear ? SEASON_ORDER.indexOf(seasonOfDate(todayKey)) : 0); }} className="rounded px-1.5 py-0.5 text-[11px] font-black" style={{ background: y === year ? tone.accent : tone.chip, color: y === year ? '#fff' : tone.sub }}>{y}</button>
            ))}
          </span>
        )}
        tone={tone}
      >
        <div className="mb-1 text-[11px] font-bold tabular-nums" style={{ color: tone.sub }}>{collected} / {all.length} · 节气或节日当天记一条就收一枚</div>
        <Progress value={collected} max={all.length} tone={tone} />

        {/* 春夏秋冬页签 */}
        <div className="mt-3 grid grid-cols-4 gap-1">
          {pages.map((p, i) => {
            const n = p.marks.filter((m) => m.collected).length;
            const on = i === page;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => { triggerNavFeedback(); goTo(i); }}
                aria-label={`${p.name} ${n} / ${p.marks.length}`}
                aria-pressed={on}
                className="flex flex-col items-center py-1.5 transition-colors"
                style={{ background: on ? tone.accent : tone.chip, color: on ? '#fff' : tone.sub, borderRadius: Math.max(4, tone.radius - 6) }}
              >
                <span className="text-[14px] font-black leading-none">{p.name}</span>
                <span className="mt-1 text-[9px] font-bold tabular-nums opacity-80">{n} / {p.marks.length}</span>
              </button>
            );
          })}
        </div>

        {/* 左右翻页：一季一页 */}
        <div
          ref={pagerRef}
          onScroll={onScroll}
          className="-mx-4 mt-3 flex snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
          data-season-pager
        >
          {pages.map((p) => (
            <div key={p.key} className="w-full shrink-0 snap-center px-4" data-season-page={p.key}>
              <div className="grid grid-cols-3 gap-2">
                {p.marks.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => { triggerNavFeedback(); setOpenKey(m.key); }}
                    aria-label={`${m.name}${m.collected ? '' : '（未收录）'}`}
                    className="rounded-lg transition-transform active:scale-95 focus-visible:outline-none"
                  >
                    <SeasonCardSVG mark={m} collected={m.collected} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {pages.map((p, i) => (
            <span key={p.key} className="h-1.5 rounded-full transition-all" style={{ width: i === page ? 16 : 6, background: i === page ? tone.accent : tone.chip }} />
          ))}
        </div>
      </Section>

      {col.extras.length > 0 && (
        <Section title="印记" aside={`${col.extras.length} 枚`} tone={tone}>
          <div className="flex flex-wrap gap-2">
            {col.extras.map((s) => (
              <span key={s.id} className="rounded px-2 py-1 text-[11px] font-black" style={{ background: tone.accent, color: '#fff' }}>{kindLabel[s.kind] ?? s.kind} · {s.name} · {s.date}</span>
            ))}
          </div>
        </Section>
      )}

      <SeasonFlipView mark={openMark} open={!!openKey} onClose={() => setOpenKey(null)} todayKey={todayKey} />
    </div>
  );
};

// ── 页签 ────────────────────────────────────────────────────────────────

export const CodexTab = () => {
  const tone = useTone();
  const [book, setBook] = useState<Book>('tarot');
  const books: Array<{ key: Book; label: string }> = [
    { key: 'tarot', label: '塔罗' },
    { key: 'season', label: '岁时' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1" style={{ background: tone.soft, borderRadius: tone.radius }}>
        {books.map((b) => {
          const on = book === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => { triggerNavFeedback(); setBook(b.key); }}
              className="relative flex-1 py-2 text-[13px] font-black transition-colors"
              style={{ background: on ? tone.accent : 'transparent', color: on ? '#fff' : tone.sub, borderRadius: Math.max(4, tone.radius - 4) }}
            >
              {b.label}
            </button>
          );
        })}
      </div>
      {book === 'tarot' && <TarotBook tone={tone} />}
      {book === 'season' && <SeasonBook tone={tone} />}
    </div>
  );
};
