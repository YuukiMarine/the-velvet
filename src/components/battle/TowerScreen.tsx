/**
 * 影时间高塔 · 塔内界面（批2 验收反馈 #4：爬塔独立成屏）
 *
 * 全屏承载：区层头部 / HP·SP·增益状态 / 塔层攀升图 / 节点交互（事件·回响·月匣）/ 下塔结算。
 * 战斗（Shadow/强敌/心魔）通过 onRequestBattle 委托给 BattleArena（BattleModal z-50 叠于本屏之上）。
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore, toLocalDateKey } from '@/store';
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
import { TowerMap, TowerMapMini } from '@/components/battle/TowerMap';
import { useBoldness } from '@/utils/boldness';
import { TowerEventModal, TowerEchoModal, TowerQuizModal } from '@/components/battle/TowerModals';
import { IconTower, IconEvilEye, slantPoly, NoiseLayer, paletteFor, ABYSS_PALETTE, SlantGauge, NodeGlyph } from '@/components/battle/warKit';

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

/**
 * 「选择前路」旁的旋转 3D 角标（FS6 §2）。
 *
 * 形是一枚地图标记（菱形罗盘 + 中心孔），绕 Y 轴匀速缓转。
 * 侧面用一片同形的暗色板撑出厚度——只转一个平面的话，转到侧脸会瞬间消失，
 * 那就不是 3D 是"闪烁"。
 * D0 直接出静态终帧（红线：装饰动效在 D0 全部静默）。
 */
function TowerCompass3D({ accent, accentRgb }: { accent: string; accentRgb: string }) {
  const anim = useBoldness();
  const Face = ({ back = false }: { back?: boolean }) => (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        transform: back ? 'rotateY(180deg) translateZ(2px)' : 'translateZ(2px)',
        backfaceVisibility: 'hidden',
      }}
    >
      <polygon points="12,1.5 22.5,12 12,22.5 1.5,12" fill={`rgba(${accentRgb}, 0.24)`} stroke={accent} strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke={accent} strokeWidth="1.6" />
    </svg>
  );

  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0"
      style={{ width: 18, height: 18, perspective: 90 }}
    >
      <motion.span
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        animate={anim ? { rotateY: 360 } : undefined}
        transition={anim ? { duration: 5.5, repeat: Infinity, ease: 'linear' } : undefined}
      >
        <Face />
        <Face back />
        {/* 厚度：夹在两面中间的一片暗板，转到侧脸时它顶住，不至于整枚消失 */}
        <span
          className="absolute inset-0"
          style={{
            background: `rgba(${accentRgb}, 0.5)`,
            clipPath: 'polygon(50% 4%, 96% 50%, 50% 96%, 4% 50%)',
            transform: 'translateZ(0px)',
          }}
        />
      </motion.span>
    </span>
  );
}

export function TowerScreen({ open, onClose, onDescend, onRequestBattle, onToast, interactive }: Props) {
  const {
    stratum, battleState, shadow,
    moveToTowerNode, completeTowerNode, towerAdjust, towerSkipNextFloor, towerRerollNextFloor,
  } = useAppStore();

  const [eventNode, setEventNode] = useState<StratumNode | null>(null);
  const [echoNode, setEchoNode] = useState<StratumNode | null>(null);
  const [quiz, setQuiz] = useState<{ questions: MirrorQuestion[]; reward: number } | null>(null);
  // R17 #2：月匣从 toast 升格为开匣抽取仪式
  const [chestReveal, setChestReveal] = useState<{ drops: LootDrop[]; sp: number } | null>(null);
  // R18 #1（A 案）：状态胶囊点开的作战简报抽屉（buff/弹药/光辉/下塔收进来）
  const [briefOpen, setBriefOpen] = useState(false);
  // FS6 §1：塔图默认收起（缩略台阶 + 钉住的心魔层），点「展开」才出完整长卷
  const [mapOpen, setMapOpen] = useState(false);
  const eventPostRef = useRef<{ skip?: boolean; reroll?: boolean; fight?: boolean; quizReward?: number }>({});

  useBackHandler(open, () => {
    if (eventNode || echoNode || quiz) return; // 节点弹窗处理中不响应
    onClose();
  });

  if (!open || !stratum || !battleState) return null;
  // R18：portal 到 body——塔屏原在页面内容层（z-10 语境）里，fixed z 再高也压不过
  // 底部导航（z-40），导航会悬在行动条上（分辨率适配上报的元凶之一）

  const ts = battleState.towerSession;
  const buffs = ts?.buffs ?? [];
  const curFloor = stratum.nodes.find(n => n.id === stratum.currentNodeId)?.floor ?? 0;
  const pal = stratum.abyssRing ? ABYSS_PALETTE : paletteFor(stratum.level); // ⑩ 区层色温（批5：深渊暗金）
  // 批4：弹药匣（今日记录 → 属性加算）与勤勉的光辉
  const attrNames = useAppStore.getState().settings.attributeNames as Record<AttributeId, string>;
  const ammo = ammoFromActivities(useAppStore.getState().activities, toLocalDateKey());
  const diligence = battleState.diligenceCharges ?? 0;

  // R18 #1（B 案）：下一步可走节点提级成底部房间卡——「选路」从地图点击挪进拇指区，
  // 塔图退回空间叙事（仍可点，但不再是唯一交互面）
  const reachable = new Set(reachableNodeIds(stratum));
  const nextNodes = [...stratum.nodes].filter(n => reachable.has(n.id)).sort((a, b) => a.lane - b.lane).slice(0, 3);
  const NODE_TITLE: Record<StratumNode['type'], string> = {
    mob: 'Shadow', elite: '强敌', event: '异变', echo: '回响', chest: '月匣', boss: '心魔', golden: '金色回响',
  };
  const previewOf = (n: StratumNode): string => {
    switch (n.type) {
      case 'mob': case 'elite': case 'golden':
        return n.mob ? `${n.mob.name.slice(0, 5)} · 弱${attrNames[n.mob.weakAttribute ?? 'knowledge']?.slice(0, 2) ?? '?'}` : '未知的敌影';
      case 'chest': return '开匣 · 必得战利品';
      case 'echo': return '回响 · 回复或月辉';
      case 'event': return '未知的遭遇';
      case 'boss': return shadow ? shadow.name.slice(0, 6) : '决战';
    }
  };

  const handleSelectNode = async (node: StratumNode) => {
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

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[45] flex flex-col overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${pal.deep} 0%, #0a1030 46%, #060a24 100%)` }}
    >
      <NoiseLayer opacity={0.05} />
      {/* ── 顶部（R18 A 案）：一条状态胶囊——HP 斜节槽 + SP 大数字 + 心魔残量 + 层数。
          点开 = 作战简报抽屉（区层详情/buff/弹药/光辉/下塔全收进来），
          旧三层 9px chips 流退役——常态只留「还能打多久」这一件事。 ── */}
      <div className="flex-shrink-0 px-3 pb-1.5" style={{ paddingTop: 'calc(0.9rem + env(safe-area-inset-top))' }}>
        <div className="flex items-stretch gap-2">
          <button
            onClick={onClose}
            aria-label="暂离（进度保留）"
            className="w-9 flex-shrink-0 text-sm font-black text-gray-300"
            style={{ clipPath: slantPoly(8), background: 'rgba(255,255,255,0.09)' }}
          >
            ✕
          </button>
          <button
            onClick={() => setBriefOpen(v => !v)}
            aria-expanded={briefOpen}
            aria-label="作战简报"
            className="min-w-0 flex-1 px-3 py-1.5"
            style={{ clipPath: slantPoly(10), background: 'rgba(255,255,255,0.07)', boxShadow: `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.3)` }}
          >
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <SlantGauge
                  value={battleState.playerHp}
                  max={Math.max(1, battleState.playerMaxHp)}
                  segments={12}
                  height={8}
                  onColor="#f97316"
                  glow="rgba(249,115,22,0.5)"
                />
                <span className="mt-0.5 block text-left text-[9px] font-bold tabular-nums text-white/60">
                  HP {battleState.playerHp}/{battleState.playerMaxHp}
                </span>
              </div>
              <span className="flex-shrink-0 text-right leading-none">
                <span className="block text-[8px] font-bold tracking-[0.2em] text-yellow-200/50">SP</span>
                <span className="text-[22px] font-black tabular-nums text-yellow-300" style={{ letterSpacing: '-0.02em' }}>{battleState.sp}</span>
              </span>
              {shadow && (
                <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-bold tabular-nums text-red-200/80">
                  <IconEvilEye size={12} />
                  {Math.round(((shadow.currentHp + (shadow.currentHp2 ?? 0)) / Math.max(1, shadow.maxHp + (shadow.maxHp2 ?? 0))) * 100)}%
                </span>
              )}
              <span className="flex-shrink-0 text-[10px] font-black text-indigo-200/60">{briefOpen ? '▴' : '▾'}</span>
            </div>
          </button>
          <span className="flex-shrink-0 self-center text-xs font-bold tabular-nums text-indigo-200/70">
            {absoluteFloor(stratum, curFloor)}F<span className="opacity-50">/{absoluteFloor(stratum, stratum.floors)}F</span>
          </span>
        </div>

        {/* 作战简报抽屉 */}
        <AnimatePresence initial={false}>
          {briefOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-1.5 space-y-2 px-3 py-2.5" style={{ clipPath: slantPoly(10), background: 'rgba(8,10,34,0.92)', boxShadow: `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.22)` }}>
                <p className="inline-flex items-center gap-1.5 text-[12px] font-black text-white">
                  <IconTower size={12} className="text-indigo-300" />
                  {stratum.name}
                  <span className="text-[10px] font-bold text-indigo-200/60">第{stratum.level}区层{stratum.deepenCount > 0 ? ` · 异变×${stratum.deepenCount}` : ''}</span>
                </p>
                {(buffs.length > 0 || Object.keys(ammo).length > 0) && (
                  <div className="flex flex-wrap items-center gap-1">
                    {buffs.map(b => (
                      <span key={b.id} className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
                            style={{ background: 'rgba(53,209,232,0.14)', color: '#7dd3fc', border: '1px solid rgba(53,209,232,0.35)', lineHeight: 1.2 }}>
                        ✦ {b.label}
                      </span>
                    ))}
                    {(Object.entries(ammo) as Array<[AttributeId, number]>).map(([attr, pct]) => (
                      <span key={attr} className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
                            style={{ background: 'rgba(250,204,21,0.12)', color: '#fde047', border: '1px solid rgba(250,204,21,0.35)', lineHeight: 1.2 }}>
                        🔸 {attrNames[attr]}弹药 +{Math.round(pct * 100)}%
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  {diligence > 0 && interactive && (
                    <button
                      onClick={() => {
                        void useAppStore.getState().claimDiligence().then(ok => {
                          if (ok) { playSound('/battle-fanfare.mp3', 0.45); onToast('✨ 勤勉的光辉——体力完全恢复！'); }
                        });
                      }}
                      className="flex-1 py-1.5 text-[11px] font-black"
                      style={{ clipPath: slantPoly(8), background: 'rgba(253,224,71,0.2)', color: '#fef08a', border: '1px solid rgba(253,224,71,0.55)' }}
                    >
                      ✨ 光辉 ×{diligence} · 全恢复
                    </button>
                  )}
                  {interactive && (
                    <button
                      onClick={onDescend}
                      className="flex-1 py-1.5 text-[11px] font-bold text-indigo-100/80"
                      style={{ clipPath: slantPoly(8), background: 'rgba(255,255,255,0.08)' }}
                    >
                      🌙 下塔结算（保留进度）
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 塔图（FS6 §1：默认收起，点开才是完整长卷）──
          收起态一屏答完两个问题：我在哪（台阶三层）、顶在哪（钉住的心魔层）。
          全图仍在，只是从"唯一形态"降级成"二级展开态"。 */}
      <div className={`min-h-0 px-4 ${mapOpen ? 'flex-1' : 'flex-shrink-0'}`}>
        {mapOpen ? (
          <TowerMap stratum={stratum} interactive={interactive} onSelectNode={handleSelectNode} fill />
        ) : (
          <TowerMapMini
            stratum={stratum}
            interactive={interactive}
            onSelectNode={handleSelectNode}
            onExpand={() => { setMapOpen(true); playSound('/ui-menu.mp3', 0.4); }}
          />
        )}
      </div>
      {mapOpen && (
        <div className="flex-shrink-0 px-4 pt-1.5">
          <button
            type="button"
            onClick={() => { setMapOpen(false); playSound('/ui-menu.mp3', 0.4); }}
            className="w-full py-1.5 text-[10px] font-black tracking-[0.22em]"
            style={{
              clipPath: slantPoly(8),
              background: `rgba(${pal.accentRgb}, 0.1)`,
              color: `rgba(${pal.accentRgb}, 0.85)`,
              boxShadow: `inset 0 0 0 1px rgba(${pal.accentRgb}, 0.34)`,
            }}
          >
            收起塔图 ▴
          </button>
        </div>
      )}

      {/* ── 底部（R18 B 案）：房间卡行动条——下一层的选择摆在拇指区 ── */}
      <div className="flex-shrink-0 px-3 pt-1.5" style={{ paddingBottom: 'calc(0.8rem + env(safe-area-inset-bottom))' }}>
        {interactive ? (
          nextNodes.length > 0 ? (
            <>
              {/* FS6 §2：标题居中 + 旁边一枚持续缓转的 3D 角标（地图符号语义）。
                  透视放在外层、rotateY 放在内层——两者同层的话浏览器会把
                  perspective 当成"每帧重算的父级变换"，转起来会抖。 */}
              <div className="mb-1.5 flex items-center justify-center gap-2">
                <TowerCompass3D accent={pal.accent} accentRgb={pal.accentRgb} />
                <p className="text-[9px] font-black tracking-[0.34em] text-indigo-200/60">选 择 前 路</p>
              </div>
              <div className="flex gap-2">
                {nextNodes.map(node => {
                  const danger = node.type === 'boss';
                  const gold = node.type === 'golden' || node.type === 'chest';
                  return (
                    <motion.button
                      key={node.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void handleSelectNode(node)}
                      className="min-w-0 flex-1 px-2 py-2.5 text-center"
                      style={{
                        clipPath: slantPoly(10),
                        background: danger ? 'rgba(190,18,60,0.24)' : gold ? 'rgba(250,204,21,0.13)' : `rgba(${pal.accentRgb}, 0.15)`,
                        boxShadow: `inset 0 0 0 1px ${danger ? 'rgba(248,113,113,0.6)' : gold ? 'rgba(250,204,21,0.5)' : `rgba(${pal.accentRgb}, 0.45)`}`,
                      }}
                    >
                      <span className="inline-block" style={{ color: danger ? '#ff8fa3' : gold ? '#fcd34d' : 'rgba(222,232,255,0.92)' }}>
                        <NodeGlyph type={node.type} size={18} />
                      </span>
                      <span className="mt-0.5 block text-[12px] font-black leading-tight text-white">{NODE_TITLE[node.type]}</span>
                      <span className="block truncate text-[9px] font-semibold leading-tight text-white/55">{previewOf(node)}</span>
                    </motion.button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="py-2 text-center text-xs text-indigo-200/50">前路已尽——本区层的黑暗到头了</p>
          )
        ) : (
          <p className="py-2 text-center text-xs text-indigo-200/50">今晚的攀登已结束——进度已保留</p>
        )}
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
