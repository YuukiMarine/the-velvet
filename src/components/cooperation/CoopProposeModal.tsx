/**
 * COOP 契约 —— 提议 modal。
 *
 * 场景：从 OnlineConfidantProfileCard 里点"邀请 COOP"进来。
 * 用户为对方挑一张塔罗（代表"Ta 在我眼中的样子"）+ 写几句话 → 发出提议。
 *
 * 发送成功后 bond.status = pending，对方会收到 coop_proposal 通知。
 */

import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import { useCloudSocialStore } from '@/store/cloudSocial';
import { proposeCoopBond } from '@/services/coopBonds';
import { loadSocial } from '@/services/social';
import { ArcanaPickerForm, type ArcanaPickerValue } from './ArcanaPickerForm';
import { CoopAiMatchModal } from './CoopAiMatchModal';
import type { CloudProfile } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  target: CloudProfile | null;
}

export function CoopProposeModal({ isOpen, onClose, target }: Props) {
  const confidants = useAppStore(s => s.confidants);
  const attributeNames = useAppStore(s => s.settings.attributeNames);
  const addCoopBond = useCloudSocialStore(s => s.addCoopBond);

  const [value, setValue] = useState<ArcanaPickerValue>({
    arcanaId: '',
    orientation: 'upright',
    intimacyLevel: 1,
    skillAttribute: 'knowledge',
    message: '',
  });
  const [valid, setValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // choice = 入口选择页（手动 / 星象）；manual = 手动表单；ai = AI 流程（CoopAiMatchModal 覆盖）；success = 提议已送出
  const [phase, setPhase] = useState<'choice' | 'manual' | 'ai' | 'success'>('choice');
  // AI 失败回落到 manual 时，用这个让 ArcanaPickerForm 带着 AI 结果重新 mount
  const [formInitial, setFormInitial] = useState<Partial<ArcanaPickerValue> | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);

  const takenArcanaIds = useMemo(
    () => confidants.filter(c => !c.archivedAt).map(c => c.arcanaId),
    [confidants],
  );

  useEffect(() => {
    if (!isOpen) return;
    setValue({ arcanaId: '', orientation: 'upright', intimacyLevel: 1, skillAttribute: 'knowledge', message: '' });
    setValid(false);
    setSubmitting(false);
    setError('');
    setPhase('choice');
    setFormInitial(undefined);
    setFormKey(k => k + 1);
  }, [isOpen]);

  const handleChange = useCallback((v: ArcanaPickerValue, isValid: boolean) => {
    setValue(v);
    setValid(isValid);
  }, []);

  /** 真正发起提议 —— 抽成独立函数，供"手动提交"和"AI 结果直接确认"共用。
   *  phase 切换由调用方管理，这里只处理异步结果 */
  const submitProposal = async (v: ArcanaPickerValue) => {
    if (!target || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const bond = await proposeCoopBond({
        targetUserId: target.id,
        arcanaId: v.arcanaId,
        orientation: v.orientation,
        intimacyLevel: v.intimacyLevel,
        skillAttribute: v.skillAttribute,
        message: v.message,
      });
      addCoopBond(bond);
      setPhase('success');
      void loadSocial({ force: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
      // 失败时把数据留在表单上让用户改
      setValue(v);
      setValid(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!valid) return;
    void submitProposal(value);
  };

  /** AI 匹配完成 → 切到 manual（AI modal 自动关）+ 把 AI 结果带过去做一次提交。
   *  成功直接进 success；失败停在 manual 让用户看到报错 / 数据并可改 */
  const handleAiComplete = (v: ArcanaPickerValue) => {
    setValue(v);
    setValid(true);
    // 把 AI 结果塞进 form 的 initial，失败回落时手动表单就有预填数据
    setFormInitial(v);
    setFormKey(k => k + 1);
    setPhase('manual');
    void submitProposal(v);
  };

  if (!isOpen || !target) return null;

  const targetName = target.nickname || target.userId || '未命名客人';

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
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.04))',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] tracking-[0.4em] font-bold text-indigo-500">
                COOP · PROPOSAL
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
                和 {targetName} 缔结契约
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                挑一张塔罗代表 Ta 在你眼里的样子。Ta 接受后，你们的在线同伴卡会自动建立。
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center"
              aria-label="关闭"
            >✕</button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {phase === 'choice' ? (
              <div className="space-y-3">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  选一种方式为 {targetName} 挑一张塔罗 —— 两种方式最终都会发出提议，对方接受后建立 COOP 契约。
                </p>

                {/* 星象匹配卡片 */}
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
                        星象从 22 张里推演一张。结果页可改加成属性和留言。
                      </p>
                    </div>
                    <span className="text-gray-400 mt-0.5">›</span>
                  </div>
                </motion.button>

                {/* 手动输入卡片 */}
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
                        自己挑塔罗、正逆位、等级、加成属性，写一句想说的话。契约建立时默认仍由 AI 生成解读，可用下方开关关闭。
                      </p>
                    </div>
                    <span className="text-gray-400 mt-0.5">›</span>
                  </div>
                </motion.button>
              </div>
            ) : phase === 'manual' ? (
              <>
                <button
                  type="button"
                  onClick={() => setPhase('choice')}
                  className="mb-3 text-[11px] text-gray-500 dark:text-gray-400 hover:text-indigo-500 transition-colors"
                >
                  ‹ 换一种方式
                </button>
                <ArcanaPickerForm
                  key={formKey}
                  takenArcanaIds={takenArcanaIds}
                  attributeNames={attributeNames}
                  initial={formInitial}
                  onChange={handleChange}
                  hint="从下方 22 张大阿卡纳中挑一张"
                  messagePlaceholder={`对 ${targetName} 说点什么（可选）`}
                />
                {error && (
                  <p className="mt-3 text-[11px] text-rose-500">{error}</p>
                )}
              </>
            ) : phase === 'ai' ? (
              <div className="text-center py-10 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
                星象匹配进行中……<br />
                在弹出的窗口里完成几个小问题即可返回。
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">✦</div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">
                  提议已送出
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  {targetName} 收到后会挑一张自己的塔罗。<br />
                  接受后，你们的在线同伴卡会自动建立。14 天未响应会自动过期。
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {phase === 'manual' ? (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-40"
              >
                再想想
              </button>
              <motion.button
                whileTap={{ scale: valid && !submitting ? 0.97 : 1 }}
                onClick={handleSubmit}
                disabled={!valid || submitting}
                className="py-2.5 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-40"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                }}
              >
                {submitting ? '发送中…' : '发出提议'}
              </motion.button>
            </div>
          ) : phase === 'success' ? (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
              >
                好的
              </button>
            </div>
          ) : null}
        </motion.div>
      </motion.div>

      <CoopAiMatchModal
        isOpen={phase === 'ai'}
        onClose={() => { if (phase === 'ai') setPhase('choice'); }}
        targetName={targetName}
        takenArcanaIds={takenArcanaIds}
        attributeNames={attributeNames}
        onApply={handleAiComplete}
      />
    </AnimatePresence>,
    document.body,
  );
}
