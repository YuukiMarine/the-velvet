/**
 * Lv6 · 终局演出（PRD_FINAL_BOSS §5）
 *
 * 八段：吃惊 → 挑衅 → 禁忌回满 → 碾压 → 玩家反应 → 援军上阵 →
 *       最终觉醒（长按）→ 十八张记录卡 → 总攻击（长按）→ 掉落。
 *
 * 三条硬约束（改的时候别丢）：
 *  ① 阶段推进用显式 phase 并落库，不是一串 setTimeout —— 杀进程重入回到当前段，
 *     不会从头再演一遍，也不会跳过奖励
 *  ② 不提供「跳过演出」：一生一次。D0 只退化动效，流程一步不少
 *  ③ 渲染归 BattleArena（不是 BattleModal）：战斗窗已经关了，这是战斗之后的事
 *
 * 台词来源：伪神的 18 条挑衅在显形时随本体一起生成（shadow.responseLines）；
 * 援军鼓励语取该同伴自己的 aiAdvice 首句，没有则按属性走模板——
 * 演出中途不发网络请求，宁可句子朴素也不能卡在最动情的那一段。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { RelicInstance, FinalePhase } from '@/types';
import { RELIC_POOL, relicEntryText } from '@/battle/loot';
import {
  pickFinaleRecords, pickFinaleAllies, splitRounds,
  FINALE_ROOM_SP, FINALE_ALLY_SP_CAP, type FinaleCard,
} from '@/utils/finaleRecords';
import { playSound } from '@/utils/feedback';
import { useBoldness } from '@/utils/boldness';
import { HoldButton } from '@/components/battle/HoldButton';
import { CardArena, StarFlash } from '@/components/battle/finaleCards';

interface Props {
  isOpen: boolean;
  onDone: () => void;
}

const GOLD = '#e8b64c';

/** 段①的吃惊 + 段②的挑衅：伪神在这里还没输，语气要撑住 */
const SHOCK_LINE = '……三层。你把三层都打穿了。';
const TAUNT_LINES = (flaw: string) => [
  '不过——你以为这样就结束了？',
  '我是你写出来的。你写下多少，我就有多少。',
  `而你最擅长的事，叫「${flaw}」。它是你亲手交给我的。`,
];
/** 段⑤玩家反应：第一人称，从「认了」翻到「不对」 */
const RESOLVE_LINES = (flaw: string, name: string) => [
  '……起不来了。手在抖。',
  `它说得对。「${flaw}」——这四个字我自己也想过很多次。`,
  '……不对。',
  '不是我没走到过。是我一直忘了自己走到过。',
  `我不是空的。${name}走过的每一天，都还在。`,
];

export function FinalBossFinale({ isOpen, onDone }: Props) {
  const bold = useBoldness();
  const shadow = useAppStore(s => s.shadow);
  const battleState = useAppStore(s => s.battleState);
  const user = useAppStore(s => s.user);
  const activities = useAppStore(s => s.activities);
  const confidants = useAppStore(s => s.confidants);
  const saveFinaleProgress = useAppStore(s => s.saveFinaleProgress);
  const defeatFinalBoss = useAppStore(s => s.defeatFinalBoss);

  const flaw = battleState?.finalBossFlaw;
  const flawTitle = flaw?.title ?? '未竟';
  const userName = user?.name ?? '你';

  const [phase, setPhase] = useState<FinalePhase>(battleState?.finalePhase ?? 'shock');
  const [step, setStep] = useState(0);            // 段内行号 / 援军序号
  const [hits, setHits] = useState(battleState?.finaleHits ?? 0);
  const [allySp, setAllySp] = useState(battleState?.finaleAllySp ?? 0);
  const [relic, setRelic] = useState<RelicInstance | null>(null);
  const [flash, setFlash] = useState<'red' | 'white' | null>(null);
  const [bossLine, setBossLine] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const settledRef = useRef(false);
  const hitsRef = useRef(hits);
  const consumedRef = useRef<Set<string>>(new Set());

  // 落库的阶段是唯一事实源，本地 state 只是它的镜像。
  // go() 先改本地再落库，所以这个 effect 在自己触发的那一次上是 no-op；
  // 它真正管的是「重入」——杀进程后 store 里那一段把 UI 拉回去。
  useEffect(() => {
    if (!isOpen) return;
    const p = battleState?.finalePhase;
    if (p && p !== phase) { setPhase(p); setStep(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, battleState?.finalePhase]);

  const go = useCallback((next: FinalePhase, extra?: { hits?: number; allySp?: number; playerHp?: number; sp?: number }) => {
    setPhase(next);
    setStep(0);
    void saveFinaleProgress({ phase: next, ...extra });
  }, [saveFinaleProgress]);

  // ── 取数（纯函数，重入后算出同一副牌） ──
  const cards = useMemo(() => pickFinaleRecords(activities), [activities]);
  const rounds = useMemo(() => splitRounds(cards.length), [cards.length]);
  const allies = useMemo(() => pickFinaleAllies(confidants), [confidants]);
  const taunts = shadow?.responseLines ?? [];

  const roundOf = (h: number) => {
    let acc = 0;
    for (let r = 0; r < rounds.length; r++) { acc += rounds[r]; if (h < acc) return r; }
    return rounds.length - 1;
  };
  const roundStart = (r: number) => rounds.slice(0, r).reduce((s, v) => s + v, 0);
  const curRound = roundOf(hits);
  const roundCards = cards.slice(roundStart(curRound), roundStart(curRound) + rounds[curRound]);
  const shownCards = roundCards.slice(hits - roundStart(curRound));

  // ── 段①→②→③→④ 的自动推进（每段有停留，D0 也不跳） ──
  useEffect(() => {
    if (!isOpen) return;
    if (phase === 'shock') {
      playSound('/battle-impact.mp3', 0.5);
      const t = setTimeout(() => go('taunt'), 2100);
      return () => clearTimeout(t);
    }
    if (phase === 'forbidden') {
      playSound('/battle-seal.mp3', 0.9);
      setFlash('red');
      const t1 = setTimeout(() => setFlash(null), 700);
      const t2 = setTimeout(() => go('crush'), 2600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    if (phase === 'crush') {
      playSound('/battle-impact.mp3', 1);
      setFlash('white');
      const t1 = setTimeout(() => setFlash(null), 420);
      // HP 与 SP 强制到 1：这一下是碾压，不是击败
      const t2 = setTimeout(() => go('resolve', { playerHp: 1, sp: 1 }), 2600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    if (phase === 'awaken') {
      playSound('/battle-mask-swap.mp3', 0.9);
      setFlash('white');
      const t1 = setTimeout(() => setFlash(null), 620);
      // 一条记录都没有的账号打不到这里，但真到了就别把人卡在空牌桌上
      const t2 = setTimeout(() => go(cards.length > 0 ? 'cards' : 'finish'), 1700);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    // 重入时牌已经打完（杀进程正好卡在最后一张之后）→ 直接收线
    if (phase === 'cards' && cards.length > 0 && hits >= cards.length) {
      const t = setTimeout(() => go('finish'), 600);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isOpen]);

  // ── 段⑥ 援军：逐位上阵，最后一位说完给总额 ──
  const allyList = allies.length > 0 ? allies : null;
  const allyTotal = allyList ? allyList.reduce((s, a) => s + a.sp, 0) : FINALE_ROOM_SP;

  const nextAlly = () => {
    playSound('/dd.mp3', 0.4);
    const n = allyList?.length ?? 1;
    if (step < n - 1) { setStep(step + 1); return; }
    const total = Math.min(FINALE_ALLY_SP_CAP, allyTotal);
    setAllySp(total);
    playSound('/battle-seal.mp3', 0.8);
    go('awaken', { allySp: total, sp: 1 + total });
  };

  // ── 段⑧ 记录卡命中 ──
  // 计数走 ref 不走闭包里的 hits：退场动画那 0.4 秒里旧节点还挂在 DOM 上，
  // 连点会拿到同一份 hits 算出同一个 next，增量就丢了。consumed 再兜一层，
  // 保证同一张牌只算一次。
  const hitCard = (card: FinaleCard) => {
    if (consumedRef.current.has(card.id)) return;
    consumedRef.current.add(card.id);
    const next = hitsRef.current + 1;
    hitsRef.current = next;
    setHits(next);
    setBossLine(taunts[Math.min(next - 1, Math.max(0, taunts.length - 1))] ?? null);
    playSound('/battle-impact.mp3', 0.55);
    void saveFinaleProgress({ hits: next });
    if (next >= cards.length) {
      setTimeout(() => go('finish', { hits: next }), 900);
    }
  };

  const doFinish = async () => {
    if (settling || settledRef.current) return;
    settledRef.current = true;
    setSettling(true);
    setFlash('white');
    playSound('/battle-fanfare.mp3');
    const got = await defeatFinalBoss();
    setRelic(got);
    setFlash(null);
    setPhase('reward');
  };

  if (!isOpen) return null;

  const bossHpBars = rounds.map((n, r) => {
    const done = Math.max(0, Math.min(n, hits - roundStart(r)));
    return phase === 'cards' || phase === 'finish' ? 1 - done / Math.max(1, n) : 1;
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex flex-col overflow-y-auto"
        // 不留半透明：底下战场页的大字会透出来，一生一次的收尾不该看见上一屏
        style={{ background: '#040300' }}
      >
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0"
          style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(232,182,76,0.05) 3px, rgba(232,182,76,0.05) 4px)' }}
        />
        {/* 全屏闪：禁忌之力泛红 / 碾压与觉醒的白 */}
        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash}
              initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: flash === 'red' ? 0.7 : 0.45 }}
              className="pointer-events-none fixed inset-0 z-[2]"
              style={{ background: flash === 'red' ? '#8b0f1a' : '#ffffff' }}
            />
          )}
        </AnimatePresence>

        <div className="relative z-[1] mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
          {/* ── 伪神与三条血 ── */}
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.5em]" style={{ color: GOLD }}>
              {phase === 'reward' ? 'hidden relic' : 'the false god'}
            </p>
            <motion.h2
              animate={phase === 'forbidden' && bold ? { x: [0, -6, 5, -3, 0] } : {}}
              transition={{ duration: 0.45, repeat: phase === 'forbidden' ? 3 : 0 }}
              className="mt-1 text-2xl font-black text-white"
              style={{ fontFamily: '"Noto Serif SC", "Songti SC", serif' }}
            >
              {shadow?.name ?? '伪神'}
            </motion.h2>
            {phase !== 'reward' && (
              <div className="mt-2.5 flex gap-1.5">
                {bossHpBars.map((f, i) => (
                  <div key={i} className="h-[6px] flex-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <motion.div
                      className="h-full origin-left"
                      animate={{ scaleX: f }}
                      transition={{ duration: bold ? 0.45 : 0 }}
                      style={{ background: `linear-gradient(90deg, ${GOLD}, #ef4444)` }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-center py-5">
            {/* ── ① 吃惊 ── */}
            {phase === 'shock' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                <div className="relative mx-auto h-24 w-24">
                  <StarFlash size={80} ink="#ef4444" />
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-white/90">「{SHOCK_LINE}」</p>
                <p className="mt-2 text-[11px] text-white/35">它的轮廓上裂开了一道缝。</p>
              </motion.div>
            )}

            {/* ── ② 挑衅（逐条点击推进） ── */}
            {phase === 'taunt' && (
              <button
                type="button"
                onClick={() => {
                  playSound('/dd.mp3', 0.4);
                  const lines = TAUNT_LINES(flawTitle);
                  if (step < lines.length - 1) setStep(step + 1);
                  else go('forbidden');
                }}
                className="w-full text-left"
              >
                <AnimatePresence mode="wait">
                  <motion.p
                    key={step}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="px-1 text-[16px] leading-relaxed text-white/95"
                  >
                    「{TAUNT_LINES(flawTitle)[step]}」
                  </motion.p>
                </AnimatePresence>
                <p className="mt-4 text-center text-[11px] text-white/30">▾ 点击继续</p>
              </button>
            )}

            {/* ── ③ 禁忌之力 ── */}
            {phase === 'forbidden' && (
              <div className="text-center">
                <motion.p
                  initial={{ letterSpacing: '0.6em', opacity: 0 }}
                  animate={{ letterSpacing: '0.22em', opacity: 1 }}
                  transition={{ duration: 0.6 }}
                  className="text-2xl font-black"
                  style={{ color: '#ff5b5b' }}
                >
                  禁 忌 之 力
                </motion.p>
                <p className="mt-3 text-[14px] leading-relaxed text-white/80">
                  三条血——全部回满了。
                </p>
                <p className="mt-1.5 text-[12px] text-white/40">「我不需要赢。我只需要你停下。」</p>
              </div>
            )}

            {/* ── ④ 碾压 ── */}
            {phase === 'crush' && (
              <div className="text-center">
                <motion.p
                  initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.35 }}
                  className="text-5xl font-black"
                  style={{ color: '#ff5b5b', fontFamily: '"Impact", "Arial Black", sans-serif' }}
                >
                  1
                </motion.p>
                <p className="mt-3 text-[14px] leading-relaxed text-white/85">
                  一击。体力剩 1，SP 剩 1。
                </p>
                <p className="mt-1.5 text-[12px] text-white/40">它没有杀你——它要你看着自己站不起来。</p>
              </div>
            )}

            {/* ── ⑤ 玩家反应 ── */}
            {phase === 'resolve' && (
              <button
                type="button"
                onClick={() => {
                  playSound('/dd.mp3', 0.4);
                  const lines = RESOLVE_LINES(flawTitle, userName);
                  if (step < lines.length - 1) setStep(step + 1);
                  else go('allies');
                }}
                className="w-full text-left"
              >
                <AnimatePresence mode="wait">
                  <motion.p
                    key={step}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                    className="px-1 text-[16px] leading-relaxed"
                    style={{ color: step >= 2 ? '#fff' : 'rgba(255,255,255,0.6)' }}
                  >
                    {RESOLVE_LINES(flawTitle, userName)[step]}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-4 text-center text-[11px] text-white/30">▾ 点击继续</p>
              </button>
            )}

            {/* ── ⑥ 援军上阵 ── */}
            {phase === 'allies' && (
              <button type="button" onClick={nextAlly} className="w-full text-left">
                <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.4em]" style={{ color: GOLD }}>
                  they stand with you
                </p>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                    className="px-1"
                  >
                    <p className="text-[13px] font-black" style={{ color: GOLD }}>
                      {allyList ? allyList[step].name : '靛蓝色房间'}
                      {allyList && <span className="ml-2 text-[10px] font-bold text-white/35">羁绊 Lv{allyList[step].intimacy}</span>}
                    </p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-white/95">
                      「{allyList
                        ? allyList[step].line
                        : '你一个人爬完了整座塔。房间记得每一晚——现在换它借你力气。'}」
                    </p>
                    <p className="mt-2 text-[12px] font-bold" style={{ color: GOLD }}>
                      + {allyList ? allyList[step].sp : FINALE_ROOM_SP} SP
                    </p>
                  </motion.div>
                </AnimatePresence>
                <p className="mt-5 text-center text-[11px] text-white/30">
                  ▾ {allyList ? `${step + 1} / ${allyList.length}` : '点击继续'}
                </p>
              </button>
            )}

            {/* ── ⑦ 最终觉醒（长按） ── */}
            {phase === 'awaken' && (
              <div className="text-center">
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-2xl font-black" style={{ color: GOLD }}
                >
                  觉 醒
                </motion.p>
                <p className="mt-3 text-[13px] leading-relaxed text-white/70">
                  SP 回到了 {1 + allySp}。<br />你身后站了一排人。
                </p>
              </div>
            )}

            {/* ── ⑧ 记录卡 ── */}
            {phase === 'cards' && (
              <div>
                <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.4em]" style={{ color: GOLD }}>
                  round {curRound + 1} / {rounds.length}
                </p>
                <p className="mb-3 text-center text-[11px] text-white/40">
                  点一张记录——它挡不住自己写下的东西（{hits} / {cards.length}）
                </p>
                {bossLine && (
                  <motion.p
                    key={bossLine}
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="mb-3 text-center text-[13px] font-bold text-red-300/90"
                  >
                    「{bossLine}」
                  </motion.p>
                )}
                {shownCards.length > 0 ? (
                  <CardArena cards={shownCards} onHit={hitCard} />
                ) : (
                  <p className="text-center text-[12px] text-white/40">这一轮打空了……</p>
                )}
              </div>
            )}

            {/* ── 总攻击 ── */}
            {phase === 'finish' && (
              <div className="space-y-5 text-center">
                {flaw && (
                  <p className="px-2 text-[13px] leading-relaxed text-white/55">
                    它写给你的结论是「{flaw.title}」——<br />「{flaw.verdict}」
                  </p>
                )}
                <p className="px-2 text-[15px] leading-relaxed text-white/95">
                  三条血都空了。它跪在那里，还在张嘴。<br />
                  该由你来结束这句话了。
                </p>
                <HoldButton label="总 攻 击" holdMs={1400} disabled={settling} onComplete={() => void doFinish()} />
              </div>
            )}

            {/* ── 掉落 ── */}
            {phase === 'reward' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="space-y-5 text-center"
              >
                <motion.div
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="mx-auto px-5 py-6"
                  style={{
                    maxWidth: 320,
                    background: 'linear-gradient(165deg, #1a1204 0%, #2e1d04 55%, #120c02 100%)',
                    border: `1px solid ${GOLD}8c`,
                    borderRadius: 14,
                  }}
                >
                  <p className="text-3xl">✦</p>
                  <p className="mt-2 text-xl font-black" style={{ color: GOLD }}>{RELIC_POOL.heroproof.name}</p>
                  <p className="mt-1.5 text-[13px] text-amber-100/75">
                    {relic ? relicEntryText(relic) : 'SP 消耗 −5 · 攻击 +20%'}
                  </p>
                  <p className="mt-3 text-[11px] leading-relaxed text-amber-200/45">
                    它不是从伪神身上掉下来的。<br />是你走到这里的那些天，自己攒出来的。
                  </p>
                </motion.div>
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
                  className="text-[11px] text-amber-200/40"
                >
                  去「战备 → 遗物」里把它装上。
                </motion.p>
                <motion.button
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
                  onClick={onDone}
                  className="w-full py-3.5 text-[15px] font-black"
                  style={{
                    clipPath: 'polygon(5% 0, 100% 0, 95% 100%, 0 100%)',
                    background: `linear-gradient(135deg, #92610e, ${GOLD})`,
                    color: '#160d02',
                  }}
                >
                  收下
                </motion.button>
              </motion.div>
            )}
          </div>

          {/* ── 玩家条（被碾压之后才有意义，掉落屏收起） ── */}
          {phase !== 'reward' && (
            <div className="flex items-center justify-between text-[10px] font-bold tabular-nums text-white/40">
              <span>{userName} · HP {battleState?.playerHp ?? 0}</span>
              <span>SP {battleState?.sp ?? 0}</span>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
