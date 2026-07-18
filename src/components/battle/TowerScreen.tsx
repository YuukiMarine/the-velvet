/**
 * 影时间高塔 · 塔内界面（批2 验收反馈 #4：爬塔独立成屏）
 *
 * 全屏承载：区层头部 / HP·SP·增益状态 / 塔层攀升图 / 节点交互（事件·回响·月匣）/ 下塔结算。
 * 战斗（Shadow/强敌/心魔）通过 onRequestBattle 委托给 BattleArena（BattleModal z-50 叠于本屏之上）。
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '@/store';
import { AttributeId, MobSpec, StratumNode } from '@/types';
import { rollMobSpec, absoluteFloor } from '@/battle/tower';
import { getTowerEvent, TowerEventEffect } from '@/battle/events';
import { ECHO_HEAL_PCT } from '@/battle/numbers';
import { lootLabel, towerRelicBonus } from '@/battle/loot';
import { buildMirrorQuiz, type MirrorQuestion } from '@/battle/quiz';
import { playSound } from '@/utils/feedback';
import { useBackHandler } from '@/utils/useBackHandler';
import { TowerMap } from '@/components/battle/TowerMap';
import { TowerEventModal, TowerEchoModal, TowerQuizModal } from '@/components/battle/TowerModals';
import { IconTower, IconEvilEye, slantPoly, NoiseLayer, paletteFor } from '@/components/battle/warKit';

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
}

export function TowerScreen({ open, onClose, onDescend, onRequestBattle, onToast, interactive }: Props) {
  const {
    stratum, battleState, shadow,
    moveToTowerNode, completeTowerNode, towerAdjust, towerSkipNextFloor, towerRerollNextFloor,
  } = useAppStore();

  const [eventNode, setEventNode] = useState<StratumNode | null>(null);
  const [echoNode, setEchoNode] = useState<StratumNode | null>(null);
  const [quiz, setQuiz] = useState<{ questions: MirrorQuestion[]; reward: number } | null>(null);
  const eventPostRef = useRef<{ skip?: boolean; reroll?: boolean; fight?: boolean; quizReward?: number }>({});

  useBackHandler(open, () => {
    if (eventNode || echoNode || quiz) return; // 节点弹窗处理中不响应
    onClose();
  });

  if (!open || !stratum || !battleState) return null;

  const ts = battleState.towerSession;
  const buffs = ts?.buffs ?? [];
  const curFloor = stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0;
  const pal = paletteFor(stratum.level); // ⑩ 区层色温

  const handleSelectNode = async (node: StratumNode) => {
    const moved = await moveToTowerNode(node.id);
    if (!moved) return;
    playSound('/ui-menu.mp3', 0.5);
    if (moved.type === 'mob' || moved.type === 'elite' || moved.type === 'boss') {
      onRequestBattle(moved);
    } else if (moved.type === 'event') {
      setEventNode(moved);
    } else if (moved.type === 'echo') {
      setEchoNode(moved);
    } else if (moved.type === 'chest') {
      const sp = await completeTowerNode(moved.id);
      // 批3：月匣必得战利品（70% 遗物 / 30% 迷思）
      const drops = await useAppStore.getState().rollTowerLoot('chest', moved.floor / Math.max(1, stratum.floors));
      playSound('/battle-seal.mp3', 0.5);
      const lootText = drops.map(lootLabel).join(' · ');
      onToast(`📦 月匣开启${sp > 0 ? ` · +${sp} SP` : ''}${lootText ? ` · ${lootText}` : ''}`);
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
        case 'echoLine': case 'nothing': break;
      }
    }
  };

  const materializeEventText = (text: string): string => {
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

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${pal.deep} 0%, #0a1030 46%, #060a24 100%)` }}
    >
      <NoiseLayer opacity={0.05} />
      {/* ── 头部 ── */}
      <div className="flex-shrink-0 px-4 pb-2 space-y-2" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="text-gray-400 text-sm px-2 py-1 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            ✕ 暂离
          </button>
          <div className="text-center min-w-0">
            <p className="text-white font-black text-sm truncate inline-flex items-center gap-1">
              <IconTower size={13} className="text-indigo-300 flex-shrink-0" />
              {stratum.name}
            </p>
            <p className="text-[10px] text-indigo-200/60">
              第{stratum.level}区层{stratum.deepenCount > 0 ? ` · 异变×${stratum.deepenCount}` : ''}
            </p>
          </div>
          <span className="flex-shrink-0 text-xs font-bold tabular-nums text-indigo-200/70">
            {absoluteFloor(stratum, curFloor)}F<span className="opacity-50">/{absoluteFloor(stratum, stratum.floors)}F</span>
          </span>
        </div>

        {/* HP / SP / 心魔残量 / 登塔增益 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="text-[10px] font-bold text-red-300/80 flex-shrink-0">HP</span>
            <div className="h-2 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <motion.div
                className="h-full rounded-full"
                animate={{ width: `${(battleState.playerHp / Math.max(1, battleState.playerMaxHp)) * 100}%` }}
                style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-white/70 flex-shrink-0">{battleState.playerHp}/{battleState.playerMaxHp}</span>
          </div>
          <span className="flex-shrink-0 text-[11px] font-bold text-yellow-300">SP {battleState.sp}</span>
          {shadow && (
            <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] tabular-nums text-red-200/70">
              <IconEvilEye size={11} />
              {Math.round(((shadow.currentHp + (shadow.currentHp2 ?? 0)) / Math.max(1, shadow.maxHp + (shadow.maxHp2 ?? 0))) * 100)}%
            </span>
          )}
        </div>
        {buffs.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {buffs.map(b => (
              <span key={b.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ background: 'rgba(53,209,232,0.14)', color: '#7dd3fc', border: '1px solid rgba(53,209,232,0.35)', lineHeight: 1.2 }}>
                ✦ {b.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── 塔图 ── */}
      <div className="flex-1 min-h-0 px-4">
        <TowerMap stratum={stratum} interactive={interactive} onSelectNode={handleSelectNode} fill />
      </div>

      {/* ── 底部 ── */}
      <div className="flex-shrink-0 px-4 pt-2" style={{ paddingBottom: 'calc(0.9rem + env(safe-area-inset-bottom))' }}>
        {interactive ? (
          <button
            onClick={onDescend}
            className="w-full py-2.5 text-sm font-bold text-indigo-100/80"
            style={{ clipPath: slantPoly(12), background: 'rgba(255,255,255,0.08)' }}
          >
            🌙 下塔结算（保留进度）
          </button>
        ) : (
          <p className="text-center text-xs text-indigo-200/50 py-2">今晚的攀登已结束——进度已保留</p>
        )}
      </div>

      {/* ── 节点弹窗 ── */}
      <AnimatePresence>
        {eventNode?.eventPoolId && (() => {
          const ev = getTowerEvent(eventNode.eventPoolId!);
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
    </motion.div>
  );
}
