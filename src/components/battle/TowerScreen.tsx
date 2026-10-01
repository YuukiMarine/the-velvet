/**
 * 影时间高塔 · 塔内界面（批2 验收反馈 #4：爬塔独立成屏；第 9 轮 9a 按预览重做，PRD §14.7）
 *
 * 全屏承载：
 *   · 顶部：暂离 / 区层名（第几区层 · 现在几层 · 今晚爬了几层）/ 下塔结算；HP（青绿）、SP（金）两根条带数字；
 *     今晚的增益、弹药、勤勉的光辉（点了全恢复）、心魔还剩多少；满月心魔 / 深渊周常各一行字。
 *   · 中间：常驻整屏的塔图（RouteMap）：走过的实线、能去的流动光轨、远处虚线、三层以外压雾、心魔钉在塔顶。
 *   · 底部：「选择前路」能去的房间一字排开；点房间（地图上或下面）先弹侦察卡，确认了才进。
 * 战斗（Shadow / 强敌 / 心魔）通过 onRequestBattle 委托给 BattleArena（BattleModal z-50 叠于本屏之上，盖着时动画定格）。
 * 配色：底色是区层色温（深渊暗金），强调色跟频道（towerKit）。
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { AttributeId, MobSpec, StratumNode } from '@/types';
import { ammoFromActivities } from '@/battle/preparation';
import { rollMobSpec, absoluteFloor, reachableNodeIds } from '@/battle/tower';
import { getTowerEvent, TOWER_EVENTS, TowerEvent, TowerEventEffect } from '@/battle/events';
import { ECHO_HEAL_PCT } from '@/battle/numbers';
import { towerRelicBonus, AFFIX_POOL, type LootDrop } from '@/battle/loot';
import { LootReveal } from '@/components/battle/LootReveal';
import { rollPrepDraw } from '@/battle/preparation';
import { buildMirrorQuiz, type MirrorQuestion } from '@/battle/quiz';
import { playSound } from '@/utils/feedback';
import { useBackHandler } from '@/utils/useBackHandler';
import { useBoldness } from '@/utils/boldness';
import { useUiChannel } from '@/ui/useUiChannel';
import { TowerEventModal, TowerEchoModal, TowerQuizModal } from '@/components/battle/TowerModals';
import { abyssRuleById, abyssRuleLabel, abyssWeeklyWeakAttribute } from '@/battle/abyssRules';
import { weekKeyOf } from '@/battle/tower';
import { memoryEchoCandidates, memoryEchoText, pickMemoryEcho } from '@/utils/towerMemory';
import { IconTower, IconEvilEye, NoiseLayer, paletteFor, ABYSS_PALETTE, NodeGlyph } from '@/components/battle/warKit';
import { P5AttrGlyph } from '@/components/p5r/kit';
import { RouteMap, TowerScoutCard, TOWER_LEGEND, TOWER_NODE, bossHpPct, echoHealPctOf } from '@/components/battle/RouteMap';
import { TOWER_SKINS, TW_HP, TW_SP, TowerBar, TowerChip, TowerDeco, twShape, type TowerSkin } from '@/components/battle/towerKit';

interface Props {
  open: boolean;
  /** 暂离（仅关闭视图，session 继续） */
  onClose: () => void;
  /** 下塔结算（结束今晚 session） */
  onDescend: () => void;
  /** 请求开战：Shadow/强敌节点（或事件遭遇战 eventMob） */
  onRequestBattle: (node: StratumNode, eventMob?: MobSpec) => void;
  onToast: (text: string) => void;
  interactive: boolean;
  /** 战斗 / 结算 / 掉落盖在上面：装饰动画定格 */
  covered?: boolean;
}

/** 增益小签前面的几何图标（不用 emoji） */
function BuffGlyph({ kind }: { kind: 'moon' | 'ammo' | 'spark' }) {
  if (kind === 'ammo') return <svg viewBox="0 0 24 24" width={10} height={10} aria-hidden><path d="M8 3h8v4l-2 2v12h-4V9L8 7z" fill="currentColor" /></svg>;
  if (kind === 'spark') return <svg viewBox="0 0 24 24" width={10} height={10} aria-hidden><path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="currentColor" /></svg>;
  return <svg viewBox="0 0 24 24" width={10} height={10} aria-hidden><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="currentColor" /></svg>;
}

const roomShape = (skin: TowerSkin, seed: number) => twShape(skin, seed + 7.1, 10, 14);

export function TowerScreen({ open, onClose, onDescend, onRequestBattle, onToast, interactive, covered = false }: Props) {
  const {
    stratum, battleState, shadow,
    moveToTowerNode, completeTowerNode, towerAdjust, towerSkipNextFloor, towerRerollNextFloor,
  } = useAppStore(useShallow(s => ({ stratum: s.stratum, battleState: s.battleState, shadow: s.shadow, moveToTowerNode: s.moveToTowerNode, completeTowerNode: s.completeTowerNode, towerAdjust: s.towerAdjust, towerSkipNextFloor: s.towerSkipNextFloor, towerRerollNextFloor: s.towerRerollNextFloor })));
  const channel = useUiChannel();
  const bold = useBoldness();

  const [eventNode, setEventNode] = useState<StratumNode | null>(null);
  const [echoNode, setEchoNode] = useState<StratumNode | null>(null);
  const [quiz, setQuiz] = useState<{ questions: MirrorQuestion[]; reward: number } | null>(null);
  // R17 #2：月匣从 toast 升格为开匣抽取仪式
  const [chestReveal, setChestReveal] = useState<{ drops: LootDrop[]; sp: number } | null>(null);
  // 第 9 轮：点了哪个房间（侦察卡）；位置变了 / 这一层走完了就收起来
  const [selected, setSelected] = useState<string | null>(null);
  const eventPostRef = useRef<{ skip?: boolean; reroll?: boolean; fight?: boolean; quizReward?: number }>({});
  const currentNodeId = stratum?.currentNodeId ?? null;
  useEffect(() => { setSelected(null); }, [currentNodeId, interactive]);

  useBackHandler(open, () => {
    if (eventNode || echoNode || quiz) return; // 节点弹窗处理中不响应
    if (selected) { setSelected(null); return; } // 侦察卡开着：先收起来
    onClose();
  });

  if (!open || !stratum || !battleState) return null;
  // R18：portal 到 body——塔屏原在页面内容层（z-10 语境）里，fixed z 再高也压不过
  // 底部导航（z-40），导航会悬在行动条上（分辨率适配上报的元凶之一）

  const ts = battleState.towerSession;
  const buffs = ts?.buffs ?? [];
  const climbed = ts && ts.dateKey === toLocalDateKey() ? ts.floorsClimbed : 0;
  const curFloor = stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0;
  const pal = stratum.abyssRing ? ABYSS_PALETTE : paletteFor(stratum.level); // ⑩ 区层色温（批5：深渊暗金）
  const skin = TOWER_SKINS[channel];
  // 批4：弹药匣（今日记录 → 属性加算）与勤勉的光辉
  const attrNames = useAppStore.getState().settings.attributeNames as Record<AttributeId, string>;
  const ammo = ammoFromActivities(useAppStore.getState().activities, toLocalDateKey());
  const diligence = battleState.diligenceCharges ?? 0;
  const pct = bossHpPct(shadow);

  // 下一步能去的房间（底部「选择前路」；地图上同样能点）
  const reachable = new Set(reachableNodeIds(stratum));
  const nextNodes = [...stratum.nodes].filter(n => reachable.has(n.id)).sort((a, b) => a.lane - b.lane).slice(0, 3);
  const selNode = selected ? stratum.nodes.find(n => n.id === selected && reachable.has(n.id)) ?? null : null;
  const pick = (n: StratumNode) => {
    if (!interactive || !reachable.has(n.id)) return;
    playSound('/ui-menu.mp3', 0.4);
    setSelected(n.id);
  };

  const handleSelectNode = async (node: StratumNode) => {
    // 满月心魔还在显形：顶层先锁着（生成完会自动换进来）
    if (node.type === 'boss' && stratum.moonBossPending) {
      onToast('🌕 月度心魔还在显形——稍等片刻再来');
      return;
    }
    const moved = await moveToTowerNode(node.id);
    if (!moved) return;
    playSound('/ui-menu.mp3', 0.5);
    if (moved.type === 'mob' || moved.type === 'elite' || moved.type === 'boss' || moved.type === 'golden') {
      onRequestBattle(moved);
    } else if (moved.type === 'event') {
      setEventNode(moved);
    } else if (moved.type === 'echo') {
      setEchoNode(moved);
    } else if (moved.type === 'chest') {
      const sp = await completeTowerNode(moved.id);
      // 批3：月匣必得战利品（70% 遗物 / 30% 迷思）→ R17 #2：开匣抽取仪式（音效在仪式内）
      const drops = await useAppStore.getState().rollTowerLoot('chest', moved.floor / Math.max(1, stratum.floors));
      setChestReveal({ drops, sp });
    }
  };

  const applyEventEffects = async (effects: TowerEventEffect[]) => {
    for (const eff of effects) {
      switch (eff.kind) {
        case 'sessionBuff': await towerAdjust({ buff: { id: eff.id, label: eff.label, addPct: eff.addPct } }); break;
        case 'hpLossPct': await towerAdjust({ hpDeltaPct: -eff.pct }); break;
        case 'hpHealPct': await towerAdjust({ hpDeltaPct: eff.pct }); break;
        case 'sp': await towerAdjust({ spDelta: eff.amount }); break;
        case 'stealFirstStrike': await towerAdjust({ stealFirstStrike: true }); break;
        case 'quiz': eventPostRef.current.quizReward = eff.reward; break; // 批3：真实两题问答（finishEvent 后弹出）
        case 'skipNextFloor': eventPostRef.current.skip = true; break;
        case 'rerollFloor': eventPostRef.current.reroll = true; break;
        case 'mobFight': eventPostRef.current.fight = true; break;
        // 批3：事件战利品直接入包（toast 报名字）
        case 'relicWaning': {
          const label = await useAppStore.getState().grantEventLoot('relicWaning');
          if (label) onToast(`🎁 ${label}`);
          break;
        }
        case 'randomMyth': {
          const label = await useAppStore.getState().grantEventLoot('randomMyth');
          if (label) onToast(`🎁 ${label}`);
          break;
        }
        // 批4：勤勉的试炼——今日待办 ≥3 领备战 buff；本次登塔已抽过 → +8 SP；不足 → 无奖
        case 'prepBuff': {
          const st = useAppStore.getState();
          const todayDone = st.todoCompletions
            .filter(tc => tc.date === toLocalDateKey())
            .reduce((s, tc) => s + (tc.count ?? 1), 0);
          if (todayDone < 3) {
            onToast('📜 白昼的勤勉不足——石碑没有回应（今日完成待办 ≥3 后再来）');
          } else if (battleState.towerSession?.prepDrawnId) {
            await towerAdjust({ spDelta: 8 });
            onToast('📜 试炼通过——备战已满，转化 +8 SP');
          } else {
            const [buff] = rollPrepDraw(1);
            if (buff) {
              await st.applyPrepBuff(buff);
              onToast(`📜 试炼通过 · ${buff.label}`);
            }
          }
          break;
        }
        // 批4：月相祭坛——移除主影随机一条词缀
        case 'removeAffix': {
          const removed = await useAppStore.getState().removeRandomShadowAffix();
          onToast(removed
            ? `🌗 烙印剥落——【${AFFIX_POOL[removed].name}】从心魔身上消散了`
            : '🌗 祭坛沉默——心魔身上已无烙印可洗');
          break;
        }
        case 'echoLine': case 'nothing': break;
      }
    }
  };

  const materializeEventText = (text: string): string => {
    // 回忆之光（第 6 轮）：{date} / {title} = 最近 14 天里的一条记录，同一节点每次都是同一条
    if (text.includes('{title}') || text.includes('{date}')) {
      const pick = pickMemoryEcho(memoryEchoCandidates(useAppStore.getState().activities), eventNode?.id ?? '');
      return memoryEchoText(text, pick);
    }
    if (!text.includes('{echo}')) return text;
    const acts = useAppStore.getState().activities;
    const pick = [...acts].reverse().find(a => a.important) ?? acts[acts.length - 1];
    return text.replace('{echo}', (pick?.description ?? '继续向上，别停下').slice(0, 24));
  };

  const finishEvent = async () => {
    const node = eventNode;
    setEventNode(null);
    if (!node) return;
    const post = eventPostRef.current;
    eventPostRef.current = {};
    if (post.fight) {
      // 事件遭遇战：胜利后由 Arena 补记该事件节点完成
      onRequestBattle(node, rollMobSpec(stratum.level, 'mob', Math.random));
      return;
    }
    await completeTowerNode(node.id);
    if (post.skip) await towerSkipNextFloor();
    if (post.reroll) await towerRerollNextFloor();
    if (post.quizReward) {
      // 批3 镜之自问：从真实记录出 2 题；素材不足（新用户）回落直接发奖
      const acts = useAppStore.getState().activities;
      const attrNames = useAppStore.getState().settings.attributeNames as Record<AttributeId, string>;
      const questions = buildMirrorQuiz(acts, attrNames);
      if (questions) {
        setQuiz({ questions, reward: post.quizReward });
      } else {
        await towerAdjust({ spDelta: post.quizReward });
        onToast(`🪞 镜子沉默地注视你 · +${post.quizReward} SP`);
      }
    }
  };

  // 旧存档里的事件池 id 已经不存在（事件池改版）：弹层出不来、节点却一直是 current → 按「已完成」收掉
  useEffect(() => {
    if (!eventNode?.eventPoolId || getTowerEvent(eventNode.eventPoolId)) return;
    void finishEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventNode?.id]);

  const handleQuizDone = async (allCorrect: boolean) => {
    const reward = quiz?.reward ?? 0;
    setQuiz(null);
    if (allCorrect && reward > 0) {
      await towerAdjust({ spDelta: reward });
      playSound('/battle-seal.mp3', 0.5);
      onToast(`🪞 镜中的你微微一笑 · +${reward} SP`);
    } else {
      onToast('🪞 镜面暗了下去——但它记住了你诚实的样子');
    }
  };

  const handleEchoChoose = async (choice: 'heal' | 'buff') => {
    const node = echoNode;
    setEchoNode(null);
    if (!node) return;
    if (choice === 'heal') {
      // 批3：影之怀炉遗物 → 回响回复比例提升
      const { echoHealAdd } = towerRelicBonus(battleState?.arsenal?.relics);
      await towerAdjust({ hpDeltaPct: ECHO_HEAL_PCT + echoHealAdd });
    } else {
      await towerAdjust({ buff: { id: `echo-${node.id}`, label: '月辉 +6%', addPct: 0.06 } });
    }
    await completeTowerNode(node.id);
  };

  const enter = async (node: StratumNode) => {
    setSelected(null);
    await handleSelectNode(node);
  };
  const weakHiddenRing = !!stratum.abyssRing && stratum.abyssRuleId === 'eclipse';
  const panelSkin = skin.ch === 'p4'
    ? { background: 'rgba(12,10,6,0.86)', borderRadius: 14, boxShadow: `0 0 0 2px ${skin.accent}, 4px 4px 0 0 rgba(0,0,0,0.6)` }
    : skin.ch === 'p5'
      ? { background: 'rgba(0,0,0,0.88)', clipPath: skin.shape(31, 4), boxShadow: 'inset 0 0 0 2px rgba(248,248,246,0.85)' }
      : skin.ch === 'p3'
        ? { background: 'rgba(6,16,40,0.78)', clipPath: skin.shape(0, 12), boxShadow: `inset 0 0 0 1px rgba(${skin.accentRgb},0.35)` }
        : { background: 'rgba(16,10,36,0.78)', borderRadius: 16, boxShadow: `inset 0 0 0 1px rgba(${skin.accentRgb},0.3)` };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className={`fixed inset-0 z-[45] flex flex-col overflow-hidden text-white ${bold ? '' : 'tw-still'} ${covered ? 'tw-paused' : ''}`}
      style={{ background: `linear-gradient(180deg, ${pal.deep} 0%, #0a1030 46%, #060a22 100%)` }}
    >
      <TowerDeco skin={skin} />
      <NoiseLayer opacity={0.05} />
      {/* 上浮的光点 */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} className="tw-anim absolute block rounded-full" style={{ left: `${(i * 37) % 100}%`, bottom: `${(i * 23) % 40}%`, width: i % 3 ? 2 : 3, height: i % 3 ? 2 : 3, background: `rgba(${skin.accentRgb},0.7)`, animation: `tw-rise ${7 + (i % 5)}s linear ${i * 0.7}s infinite`, opacity: 0 }} />
        ))}
      </div>

      {/* ── 顶部状态 ── */}
      <div className="relative z-20 flex-shrink-0 px-3 pb-2" style={{ paddingTop: 'calc(10px + env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="暂离（进度保留）"
            className="flex h-9 shrink-0 items-center gap-1 px-2.5 text-[12px] font-black text-white/80"
            style={{ ...twShape(skin, 3.4, 8, 10), background: 'rgba(255,255,255,0.08)' }}
          >
            <span aria-hidden className="text-[13px]">✕</span>暂离
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <IconTower size={14} className="shrink-0" />
              <span className="truncate text-[17px] font-black leading-tight" style={{ fontFamily: skin.titleFont }}>{stratum.name}</span>
            </div>
            <div className="mt-0.5 whitespace-nowrap text-[10px] font-bold tracking-[0.12em] text-white/55">
              {stratum.abyssRing ? `深渊 第 ${stratum.abyssRing} 环` : stratum.revisit ? '重游' : `第 ${stratum.level} 区层`}
              {stratum.deepenCount > 0 && <span className="hidden min-[360px]:inline"> · 异变×{stratum.deepenCount}</span>}
              {' · '}{absoluteFloor(stratum, curFloor)}F / {absoluteFloor(stratum, stratum.floors)}F
              {climbed > 0 && <span className="hidden min-[380px]:inline"> · 今晚 +{climbed} 层</span>}
            </div>
          </div>
          {interactive ? (
            <button
              type="button"
              onClick={onDescend}
              aria-label="下塔结算（保留进度）"
              className="h-9 shrink-0 px-3 text-[12px] font-black"
              style={{ ...twShape(skin, 4.4, 8, 10), background: `rgba(${skin.accentRgb},0.14)`, color: skin.ch === 'p5' ? '#fff' : skin.accent, boxShadow: skin.ch === 'p4' ? `0 0 0 1.5px ${skin.accent}` : `inset 0 0 0 1px rgba(${skin.accentRgb},0.5)` }}
            >
              下塔结算
            </button>
          ) : <span aria-hidden className="w-[62px] shrink-0" />}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-x-4 px-3 py-2.5" style={panelSkin}>
          <TowerBar label="HP" value={battleState.playerHp} max={Math.max(1, battleState.playerMaxHp)} color={TW_HP.c} rgb={TW_HP.rgb} segments={10} />
          <TowerBar label="SP" value={battleState.sp} scale={200} color={TW_SP.c} rgb={TW_SP.rgb} />
        </div>
        <div className="mt-2 flex items-start gap-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {buffs.map((b, i) => (
              <TowerChip key={b.id} skin={skin} seed={i}><BuffGlyph kind="moon" />{b.label}</TowerChip>
            ))}
            {(Object.entries(ammo) as Array<[AttributeId, number]>).map(([attr, v], i) => (
              <TowerChip key={attr} skin={skin} seed={i + 5} tone="gold"><BuffGlyph kind="ammo" />{attrNames[attr]}弹药 +{Math.round(v * 100)}%</TowerChip>
            ))}
            {diligence > 0 && interactive && (
              <TowerChip
                skin={skin}
                seed={9}
                tone="gold"
                ariaLabel={`勤勉的光辉 ${diligence} 次，点一下体力全恢复`}
                onClick={() => {
                  void useAppStore.getState().claimDiligence().then(ok => {
                    if (ok) { playSound('/battle-fanfare.mp3', 0.45); onToast('✨ 勤勉的光辉——体力完全恢复！'); }
                  });
                }}
              >
                <BuffGlyph kind="spark" />光辉 ×{diligence} · 全恢复
              </TowerChip>
            )}
          </div>
          {pct !== null && (
            <span className="flex shrink-0 items-center gap-1 pt-[2px] text-[11px] font-black tabular-nums" style={{ color: TOWER_NODE.boss.color }}>
              <IconEvilEye size={13} />心魔 {pct}%
            </span>
          )}
        </div>
        {/* 满月心魔（第 6 轮）：本环守卫是它 / 它还在显形 */}
        {stratum.abyssRing && (stratum.moonBossPending || shadow?.moonSlot) && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-amber-100/85" data-moon-guard>
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black" style={{ background: 'rgba(253,230,138,0.14)', color: '#fde68a', boxShadow: 'inset 0 0 0 1px rgba(253,230,138,0.4)', ...twShape(skin, 1.3, 4, 6), lineHeight: 1.2 }}>
              <BuffGlyph kind="moon" />满月
            </span>
            {stratum.moonBossPending ? '月度心魔显形中——顶层稍后开放' : `本环守卫是月度心魔「${shadow?.name}」`}
          </p>
        )}
        {/* 深渊周常（第 6 轮）：本环规则 + 本周最好 */}
        {stratum.abyssRing && stratum.abyssRuleId && (() => {
          // 规则是这一环生成那周定的：跨周还在爬时，名字里的 X 也按那一周（新环直接记在环上）
          const weekKey = weekKeyOf(new Date());
          const ruleAttr = stratum.abyssRuleAttr ?? abyssWeeklyWeakAttribute(stratum.createdWeekKey);
          const lbl = abyssRuleLabel(abyssRuleById(stratum.abyssRuleId), attrNames[ruleAttr] ?? '');
          // 「本周最好」只认这一周的纪录（上周的不带过来）
          const best = battleState.abyssWeekly?.weekKey === weekKey ? battleState.abyssWeekly.bestRing : 0;
          return (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-amber-100/80" data-abyss-rule={stratum.abyssRuleId}>
              <span className="px-1.5 py-0.5 text-[9px] font-black" style={{ background: 'rgba(250,204,21,0.14)', color: '#fde047', boxShadow: 'inset 0 0 0 1px rgba(250,204,21,0.35)', ...twShape(skin, 2.3, 4, 6), lineHeight: 1.2 }}>本周回廊 · {lbl.name}</span>
              <span>{lbl.text}</span>
              <span className="text-amber-100/50">{best > 0 ? `· 本周最好 第${best}环` : '· 本周还没破过环'}</span>
            </p>
          );
        })()}
      </div>

      {/* ── 塔图（常驻整屏） ── */}
      <RouteMap stratum={stratum} shadow={shadow} skin={skin} reachable={reachable} selected={selNode?.id ?? null} interactive={interactive} still={!bold} onPick={pick} />

      {/* ── 图例 ── */}
      <div className="relative z-20 flex flex-shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-3 py-1.5" style={{ background: 'linear-gradient(0deg, rgba(5,8,26,0.9), rgba(5,8,26,0))' }} aria-label="图例">
        {TOWER_LEGEND.map(t => (
          <span key={t} className="flex items-center gap-1 text-[10px] font-bold text-white/60">
            <span style={{ color: TOWER_NODE[t].color }}><NodeGlyph type={t} size={12} /></span>{TOWER_NODE[t].label}
          </span>
        ))}
      </div>

      {/* ── 底部：选择前路 / 侦察卡 ── */}
      <div className="relative z-30 flex-shrink-0 px-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <AnimatePresence mode="wait" initial={false}>
          {selNode ? (
            <TowerScoutCard
              key={selNode.id}
              skin={skin}
              stratum={stratum}
              node={selNode}
              shadow={shadow}
              relics={battleState.arsenal?.relics}
              echoHealPct={echoHealPctOf(battleState.arsenal?.relics)}
              attrNames={attrNames}
              interactive={interactive}
              onEnter={() => void enter(selNode)}
              onBack={() => setSelected(null)}
            />
          ) : interactive ? (
            nextNodes.length > 0 ? (
              <motion.div key="pick" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.18 }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-black tracking-[0.3em]" style={{ color: skin.ch === 'p5' ? '#fff' : skin.accent }}>选择前路</span>
                  <span className="text-[10px] font-bold text-white/45">点房间先看侦察，再决定进不进</span>
                </div>
                <div className="flex gap-2">
                  {nextNodes.map((n, i) => {
                    const t = TOWER_NODE[n.type];
                    const hidden = weakHiddenRing || !!n.mob?.affixes?.includes('eclipse');
                    const title = n.type === 'boss' ? (stratum.moonBossPending ? '显形中…' : shadow?.name ?? '决战') : n.mob?.name ?? (n.type === 'chest' ? '开匣 · 必得战利品' : n.type === 'echo' ? '回复，或者今晚更强' : '未知的遭遇');
                    return (
                      <motion.button
                        key={n.id}
                        type="button"
                        data-room={n.type}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => pick(n)}
                        aria-label={`${t.label} · ${title}，点一下先侦察`}
                        className="relative min-w-0 flex-1 px-2 pb-2.5 pt-2 text-left"
                        style={{ ...roomShape(skin, i), background: `rgba(${t.rgb},0.1)`, boxShadow: skin.ch === 'p4' ? `0 0 0 2px ${t.color}` : `inset 0 0 0 1px rgba(${t.rgb},0.55)` }}
                      >
                        <span className="flex items-center gap-1.5" style={{ color: t.color }}>
                          <NodeGlyph type={n.type} size={16} />
                          <span className="text-[13px] font-black">{t.label}</span>
                        </span>
                        <span className="mt-1 block truncate text-[12px] font-bold text-white/90">{title}</span>
                        {n.mob && (
                          <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-white/55">
                            弱 {hidden ? '？' : <><P5AttrGlyph id={n.mob.weakAttribute} size={11} color="#fca5a5" /> {attrNames[n.mob.weakAttribute]}</>}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <p key="end" className="py-2 text-center text-xs text-white/50">前路已尽——本区层的黑暗到头了</p>
            )
          ) : (
            <p key="over" className="py-2 text-center text-xs text-white/50">今晚的攀登已结束——进度已保留</p>
          )}
        </AnimatePresence>
      </div>

      {/* ── 节点弹窗 ── */}
      <AnimatePresence>
        {eventNode?.eventPoolId && (() => {
          let ev: TowerEvent | undefined = getTowerEvent(eventNode.eventPoolId!);
          // 批4：月相祭坛仅在「已加深且主影带词缀」时有意义——否则就地换成一个无条件事件
          if (ev?.id === 'moon-altar' && (stratum.deepenCount === 0 || (shadow?.affixes?.length ?? 0) === 0)) {
            const pool = TOWER_EVENTS.filter(e => e.id !== 'moon-altar' && e.id !== 'diligence-trial');
            ev = pool[Math.abs(eventNode.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)) % pool.length];
          }
          return ev ? (
            <TowerEventModal
              event={ev}
              materialize={materializeEventText}
              onResolve={(effects) => void applyEventEffects(effects)}
              onFinish={() => void finishEvent()}
              playerSp={battleState.sp}
            />
          ) : null;
        })()}
      </AnimatePresence>
      <AnimatePresence>
        {echoNode && <TowerEchoModal onChoose={(c) => void handleEchoChoose(c)} />}
      </AnimatePresence>
      <AnimatePresence>
        {quiz && <TowerQuizModal questions={quiz.questions} reward={quiz.reward} onDone={(ok) => void handleQuizDone(ok)} />}
      </AnimatePresence>
      <AnimatePresence>
        {chestReveal && (
          <LootReveal
            open
            source="chest"
            drops={chestReveal.drops}
            sp={chestReveal.sp}
            onClose={() => setChestReveal(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
