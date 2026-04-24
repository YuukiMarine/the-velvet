/**
 * COOP 契约 —— 接受 / 拒绝 modal。
 *
 * 场景：通知面板点击 coop_proposal 通知 → 打开本 modal。
 * 展示对方挑的塔罗 + 留言，用户为对方挑自己的那张塔罗 → "接受"。
 * 也可拒绝（3 天冷却）。
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { acceptCoopBond, rejectCoopBond, viewFromMySide } from '@/services/coopBonds';
import { loadSocial } from '@/services/social';
import { getUserId } from '@/services/pocketbase';
import { TAROT_BY_ID } from '@/constants/tarot';
import { TarotCardSVG } from '@/components/astrology/TarotCardSVG';
import { ArcanaPickerForm, type ArcanaPickerValue } from './ArcanaPickerForm';
import { CoopAiMatchModal } from './CoopAiMatchModal';
import type { CoopBond } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bond: CoopBond | null;
}

export function CoopAcceptModal({ isOpen, onClose, bond }: Props) {
  const confidants = useAppStore(s => s.confidants);
  const attributeNames = useAppStore(s => s.settings.attributeNames);
  const updateCoopBond = useCloudSocialStore(s => s.updateCoopBond);

  const [value, setValue] = useState<ArcanaPickerValue>({
    arcanaId: '',
    orientation: 'upright',
    intimacyLevel: 1,
    skillAttribute: 'knowledge',
    message: '',
  });
  const [valid, setValid] = useState(false);
  const [submitting, setSubmitting] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState('');
  // choice = 入口选择页（手动 / 星象）；manual = 手动表单；ai = AI 流程（CoopAiMatchModal 覆盖）
  const [phase, setPhase] = useState<'choice' | 'manual' | 'ai'>('choice');
  const [formInitial, setFormInitial] = useState<Partial<ArcanaPickerValue> | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  const takenArcanaIds = useMemo(
    () => confidants.filter(c => !c.archivedAt).map(c => c.arcanaId),
    [confidants],
  );

  const me = getUserId();
  const theirSide = useMemo(() => {
    if (!bond || !me) return null;
    const v = viewFromMySide(bond, me);
    if (!v.theirArcanaId) return null;
    const card = TAROT_BY_ID[v.theirArcanaId];
    if (!card) return null;
    return {
      card,
      orientation: v.theirArcanaOrientation ?? 'upright',
      message: v.theirMessage,
      intimacy: v.theirIntimacy,
      skillAttribute: v.theirSkillAttribute,
    };
  }, [bond, me]);

  useEffect(() => {
    if (!isOpen) return;
    setValue({ arcanaId: '', orientation: 'upright', intimacyLevel: 1, skillAttribute: 'knowledge', message: '' });
    setValid(false);
    setSubmitting(null);
    setError('');
    setPhase('choice');
    setFormInitial(undefined);
    setFormKey(k => k + 1);
  }, [isOpen]);

  const handleChange = useCallback((v: ArcanaPickerValue, isValid: boolean) => {
    setValue(v);
    setValid(isValid);
  }, []);

  /** 真正接受 —— 抽成独立函数，手动 / AI 两条路径共用 */
  const acceptWith = async (v: ArcanaPickerValue) => {
    if (!bond || submitting) return;
    setSubmitting('accept');
    setError('');
    try {
      const updated = await acceptCoopBond({
        bondId: bond.id,
        arcanaId: v.arcanaId,
        orientation: v.orientation,
        intimacyLevel: v.intimacyLevel,
        skillAttribute: v.skillAttribute,
        message: v.message,
      });
      updateCoopBond(bond.id, updated);
      // 让 loadSocial 拿最新 bond 并触发 materializeCoopBonds
      void loadSocial({ force: true });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '接受失败');
      // 失败时把数据留在表单上让用户改
      setValue(v);
      setValid(true);
    } finally {
      setSubmitting(null);
    }
  };

  const handleAccept = () => {
    if (!valid) return;
    void acceptWith(value);
  };

  /** AI 匹配完成 → 切到 manual（AI modal 自动关）+ 尝试直接接受。
   *  失败回落到 manual 预填数据 */
  const handleAiComplete = (v: ArcanaPickerValue) => {
    setValue(v);
    setValid(true);
    setFormInitial(v);
    setFormKey(k => k + 1);
    setPhase('manual');
    void acceptWith(v);
  };

  const handleReject = async () => {
    if (!bond || submitting) return;
    setSubmitting('reject');
    setError('');
    try {
      const updated = await rejectCoopBond(bond.id);
      updateCoopBond(bond.id, updated);
      void loadSocial({ force: true });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '拒绝失败');
    } finally {
      setSubmitting(null);
    }
  };

  if (!isOpen || !bond) return null;

  const proposerName = bond.otherProfile?.nickname || bond.otherProfile?.userId || '对方';
  const accent = theirSide?.card.accent ?? '#6366f1';
  const bondStillPending = bond.status === 'pending';
  const staleHint = bondStillPending ? null
    : bond.status === 'linked' ? '此 COOP 已缔结，无需再响应。'
    : bond.status === 'rejected' ? '此提议已被拒绝。'
    : bond.status === 'expired' ? '此提议已过期。'
    : '此 COOP 已解除。';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[92vh] bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div
            className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(99,102,241,0.04))',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.4em] font-bold text-pink-500">
                COOP · INVITATION
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                {proposerName} 想与你缔结契约
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Ta 为你选了一张塔罗。看看代表你的这张牌 —— 然后挑一张代表 Ta。
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center"
              aria-label="关闭"
            >✕</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* 对方给我选的那张 —— 故意不暴露 orientation；
                牌面用 upright 渲染，meaning 也只看正位（含蓄一点，谁都不想看到自己被对方贴成"逆位"） */}
            {theirSide ? (
              <div
                className="p-4 rounded-2xl flex items-center gap-4"
                style={{
                  background: `linear-gradient(135deg, ${accent}15, ${accent}05)`,
                  border: `1px solid ${accent}44`,
                }}
              >
                <TarotCardSVG
                  card={theirSide.card}
                  orientation="upright"
                  width={70}
                  staticCard
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] tracking-widest font-bold" style={{ color: accent }}>
                    Ta 眼里的你
                  </div>
                  <div className="font-bold text-gray-900 dark:text-white text-sm mt-0.5">
                    《{theirSide.card.name}》
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed line-clamp-3">
                    {theirSide.card.upright.meaning}
                  </div>
                  {theirSide.message && (
                    <div
                      className="mt-2 px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed"
                      style={{
                        background: 'rgba(255,255,255,0.6)',
                        color: '#4b5563',
                        border: '1px solid rgba(148,163,184,0.2)',
                      }}
                    >
                      "{theirSide.message}"
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-[10px] flex-wrap">
                    {theirSide.intimacy && (
                      <span
                        className="px-1.5 py-0.5 rounded font-bold"
                        style={{ background: `${accent}22`, color: accent }}
                      >
                        Ta 希望起点 Lv.{theirSide.intimacy}
                      </span>
                    )}
                    {theirSide.skillAttribute && (
                      <span
                        className="px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'rgba(148,163,184,0.15)', color: '#64748b' }}
                      >
                        能力倾向「{attributeNames[theirSide.skillAttribute] || theirSide.skillAttribute}」
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-gray-500 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                对方尚未挑选塔罗。
              </div>
            )}

            {/* 我给 Ta 选 —— 按 phase 切换：入口选择 / 手动表单 / AI 占位 */}
            {bondStillPending && phase === 'choice' && (
              <div className="space-y-3">
                <div className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                  在你眼里的 {proposerName}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  选一种方式回应 —— 两种方式最终都会完成接受。
                </p>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPhase('ai')}
                  className="w-full text-left rounded-2xl px-4 py-4 border-2 transition-all active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, rgba(168,85,247,0.12), rgba(99,102,241,0.06))',
                    borderColor: 'rgba(168,85,247,0.45)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl leading-none flex-shrink-0 mt-0.5">✨</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-purple-700 dark:text-purple-300">
                        星象匹配
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        星象推演一张塔罗。结果页可改加成属性和留言。
                      </p>
                    </div>
                    <span className="text-gray-400 mt-0.5">›</span>
                  </div>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPhase('manual')}
                  className="w-full text-left rounded-2xl px-4 py-4 border-2 transition-all active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(168,85,247,0.05))',
                    borderColor: 'rgba(99,102,241,0.4)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl leading-none flex-shrink-0 mt-0.5">📝</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-indigo-700 dark:text-indigo-300">
                        手动输入
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        自己挑塔罗、正逆位、等级、加成属性，写一句回给 Ta 的话。
                      </p>
                    </div>
                    <span className="text-gray-400 mt-0.5">›</span>
                  </div>
                </motion.button>
              </div>
            )}

            {bondStillPending && phase === 'manual' && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button"
                    onClick={() => setPhase('choice')}
                    className="text-[11px] text-gray-500 dark:text-gray-400 hover:text-indigo-500 transition-colors"
                  >
                    ‹ 换一种方式
                  </button>
                  <div className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                    在你眼里的 {proposerName}
                  </div>
                </div>
                <ArcanaPickerForm
                  key={formKey}
                  takenArcanaIds={takenArcanaIds}
                  attributeNames={attributeNames}
                  recommendedArcanaId={theirSide?.card.id}
                  initial={formInitial}
                  onChange={handleChange}
                  hint="挑一张塔罗代表 Ta（已为你预选 Ta 那张）"
                  messagePlaceholder={`回给 ${proposerName} 的一句话（可选）`}
                />
              </div>
            )}

            {bondStillPending && phase === 'ai' && (
              <div className="text-center py-10 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                星象匹配进行中……<br />
                在弹出的窗口里完成几个小问题即可返回。
              </div>
            )}

            {staleHint && (
              <p className="text-[11px] text-gray-500 bg-gray-100 dark:bg-gray-800 p-3 rounded-lg leading-relaxed">
                {staleHint}
              </p>
            )}
            {error && (
              <p className="text-[11px] text-rose-500 leading-relaxed">{error}</p>
            )}
          </div>

          {/* Footer */}
          {bondStillPending && phase === 'manual' ? (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2">
              <button
                onClick={handleReject}
                disabled={!!submitting}
                className="py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/30 disabled:opacity-40"
              >
                {submitting === 'reject' ? '处理中…' : '拒绝（3 天冷却）'}
              </button>
              <motion.button
                whileTap={{ scale: valid && !submitting ? 0.97 : 1 }}
                onClick={handleAccept}
                disabled={!valid || !!submitting}
                className="py-2.5 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                }}
              >
                {submitting === 'accept' ? '缔结中…' : '接受 & 缔结'}
              </motion.button>
            </div>
          ) : bondStillPending && phase === 'choice' ? (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={handleReject}
                disabled={!!submitting}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/30 disabled:opacity-40"
              >
                {submitting === 'reject' ? '处理中…' : '拒绝这次提议（3 天冷却）'}
              </button>
            </div>
          ) : !bondStillPending ? (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
              >
                知道了
              </button>
            </div>
          ) : null}
        </motion.div>
      </motion.div>

      <CoopAiMatchModal
        isOpen={phase === 'ai'}
        onClose={() => { if (phase === 'ai') setPhase('choice'); }}
        targetName={proposerName}
        takenArcanaIds={takenArcanaIds}
        attributeNames={attributeNames}
        onApply={handleAiComplete}
      />
    </AnimatePresence>,
    document.body,
  );
}
