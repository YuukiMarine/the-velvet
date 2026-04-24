/**
 * 羁绊之影 胜利 / 撤退结算屏
 *
 * 在攻击封印的瞬间 / loadSocial 发现对方击败的瞬间弹出。
 * 展示：
 *   - Boss 名 / 弱点属性
 *   - 奖励分解（属性 +N / 亲密度 +4 / SP +10）
 *   - 一枚纪念图章（可以点击进入 CoopMemorialPanel）
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { CoopShadow } from '@/types';
import { archetypeById } from '@/constants/coopShadowPool';
import {
  REWARD_ATTR_CAP,
  REWARD_INTIMACY_CAP,
  REWARD_SP_VICTORY,
  REWARD_SP_FINISHER,
  REWARD_SP_RETREAT,
} from '@/services/coopShadows';
import { useAppStore } from '@/store';
import { playSound } from '@/utils/feedback';

interface Props {
  isOpen: boolean;
  shadow: CoopShadow | null;
  partnerName: string;
  /** 当前用户的 PB id，用来判断是不是终结者 */
  selfPbId?: string;
  onClose: () => void;
}

const ATTR_ICON: Record<string, string> = {
  knowledge: '📘',
  guts: '🔥',
  dexterity: '🎯',
  kindness: '🌿',
  charm: '✨',
};

export function CoopVictoryScreen({ isOpen, shadow, partnerName, selfPbId, onClose }: Props) {
  const settings = useAppStore(s => s.settings);
  const playedForRef = useRef<string | null>(null);

  // 入场时播一次音（同一只 shadow 只播一次，避免 rerender 重播）
  useEffect(() => {
    if (!isOpen || !shadow) return;
    if (playedForRef.current === shadow.id) return;
    playedForRef.current = shadow.id;
    if (shadow.status === 'defeated') {
      playSound('/battle-fanfare.mp3', 0.7);
    }
  }, [isOpen, shadow?.id, shadow?.status]);

  if (!isOpen || !shadow) return null;

  const isVictory = shadow.status === 'defeated';
  const isRetreat = shadow.status === 'retreated';
  if (!isVictory && !isRetreat) return null;

  const archetype = archetypeById(shadow.shadowId);
  const shadowName = shadow.nameOverride || archetype?.names?.[0] || '羁绊之影';
  const weakAttr = shadow.weaknessAttribute;
  const attrName = settings.attributeNames[weakAttr] || weakAttr;
  const isFinisher = isVictory && shadow.resonanceBy === selfPbId;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="coop-victory-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="coop-victory-modal"
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 260 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-3xl overflow-hidden border"
          style={{
            background: isVictory
              ? 'linear-gradient(180deg, #1a0b2e 0%, #0f0a1f 100%)'
              : 'linear-gradient(180deg, #231217 0%, #0f0a11 100%)',
            borderColor: isVictory ? 'rgba(251,191,36,0.35)' : 'rgba(148,163,184,0.25)',
            boxShadow: isVictory
              ? '0 0 60px -10px rgba(251,191,36,0.35)'
              : '0 0 40px -10px rgba(148,163,184,0.25)',
          }}
        >
          {/* 顶部标识 */}
          <div className="text-center pt-6 px-5">
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1, rotate: [0, -5, 5, 0] }}
              transition={{ duration: 0.7 }}
              className="text-5xl mb-2"
            >
              {isVictory ? '✨' : '🌑'}
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={`text-[11px] font-black tracking-[0.4em] ${
                isVictory ? 'text-amber-300' : 'text-gray-300'
              }`}
            >
              {isVictory ? 'COOP VICTORY' : 'SHADOW RETREATED'}
            </motion.div>
            <motion.h3
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-xl font-black text-white mt-1"
            >
              {isVictory ? (
                <>你们封印了《<span className="text-amber-200">{shadowName}</span>》</>
              ) : (
                <>《{shadowName}》悄然离去</>
              )}
            </motion.h3>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-[11px] text-purple-200/60 mt-1"
            >
              与 @{partnerName} 的共战记录
            </motion.p>
          </div>

          {/* 奖励分解 */}
          <div className="px-5 py-5">
            <div
              className="rounded-2xl p-4 space-y-2.5 border"
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(196,181,253,0.2)',
              }}
            >
              {isVictory ? (
                <>
                  <RewardRow
                    icon={ATTR_ICON[weakAttr]}
                    label={`${attrName}（弱点属性）`}
                    value={`+${REWARD_ATTR_CAP}`}
                    valueColor="#fcd34d"
                  />
                  <RewardRow
                    icon="♡"
                    label={`与 @${partnerName} 的羁绊`}
                    value={`+${REWARD_INTIMACY_CAP} 亲密度`}
                    valueColor="#f9a8d4"
                  />
                  <RewardRow
                    icon="✦"
                    label="SP · 战斗点数"
                    value={`+${REWARD_SP_VICTORY}${isFinisher ? ` +${REWARD_SP_FINISHER} 终结者` : ''}`}
                    valueColor="#67e8f9"
                  />
                  <RewardRow
                    icon="📿"
                    label="羁绊纪念"
                    value="已刻入"
                    valueColor="#d8b4fe"
                  />
                </>
              ) : (
                <>
                  <RewardRow
                    icon="♡"
                    label="虽然没封印，但我们都在。"
                    value="+1 亲密度"
                    valueColor="#f9a8d4"
                  />
                  <RewardRow
                    icon="✦"
                    label="慰问 SP"
                    value={`+${REWARD_SP_RETREAT}`}
                    valueColor="#67e8f9"
                  />
                </>
              )}
            </div>

            {isVictory && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-4 p-3 rounded-xl border text-center text-[11px]"
                style={{
                  background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(168,85,247,0.06))',
                  borderColor: 'rgba(251,191,36,0.2)',
                }}
              >
                <div className="text-[9px] tracking-[0.3em] font-bold text-amber-300/80 mb-1">
                  MEMORIAL · 共战纪念
                </div>
                <div className="text-purple-100 leading-relaxed">
                  "{new Date(shadow.defeatedAt ?? Date.now()).toLocaleDateString('zh-CN')} · 与 @{partnerName} 共击 {shadowName}"
                </div>
                <div className="text-[10px] text-purple-200/60 mt-1.5">
                  在同伴详情页「共战纪念」中查看所有图章
                </div>
              </motion.div>
            )}
          </div>

          {/* 关闭按钮 */}
          <div className="px-5 pb-5">
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-bold text-white transition-all active:scale-95"
              style={{
                background: isVictory
                  ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                  : 'linear-gradient(135deg, #475569, #334155)',
              }}
            >
              {isVictory ? '不负相见' : '下次再战'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function RewardRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-base flex-shrink-0">{icon}</span>
      <span className="flex-1 text-[12px] text-purple-100/85">{label}</span>
      <span className="text-[13px] font-black tabular-nums" style={{ color: valueColor }}>
        {value}
      </span>
    </div>
  );
}

