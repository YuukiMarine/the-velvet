/**
 * 共战纪念册
 *
 * 展示某一对 COOP 曾共同击败的全部羁绊之影（纪念图章）。
 * 数据来源：Confidant.coopMemorials（本地 Dexie 持久化，由 settleFinishedShadows 维护）
 */

import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Confidant, CoopMemorialStamp } from '@/types';
import { archetypeById } from '@/constants/coopShadowPool';
import { useAppStore } from '@/store';

interface Props {
  isOpen: boolean;
  confidant: Confidant | null;
  onClose: () => void;
}

const ATTR_ICON: Record<string, string> = {
  knowledge: '📘',
  guts: '🔥',
  dexterity: '🎯',
  kindness: '🌿',
  charm: '✨',
};

export function CoopMemorialPanel({ isOpen, confidant, onClose }: Props) {
  const settings = useAppStore(s => s.settings);
  if (!isOpen || !confidant) return null;

  // 仅展示胜利图章；撤退 stamp 只用作去重（shadowId 以 'retreat-' 开头）
  const memorials = (confidant.coopMemorials ?? []).filter(
    m => !m.shadowId.startsWith('retreat-'),
  );

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="coop-memorial-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[195] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="coop-memorial-modal"
          initial={{ scale: 0.96, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, y: 12, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-2xl"
          style={{ maxHeight: '85vh' }}
        >
          {/* 顶部 */}
          <div
            className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800"
            style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(168,85,247,0.06))',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl">📿</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-gray-900 dark:text-white">共战纪念</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  与 <span className="font-semibold">{confidant.name}</span> 共击暗影的全部记录
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 图章列表 */}
          <div className="p-4 space-y-2.5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
            {memorials.length === 0 ? (
              <div className="text-center py-10 text-[12px] text-gray-400 dark:text-gray-500 italic">
                还没有共战记录。<br />
                下一次月相之夜，等待羁绊之影的降临。
              </div>
            ) : (
              memorials
                .sort((a, b) => new Date(b.defeatedAt).getTime() - new Date(a.defeatedAt).getTime())
                .map((m, i) => <MemorialStampCard key={`${m.shadowId}-${m.defeatedAt}-${i}`} stamp={m} settings={settings} />)
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function MemorialStampCard({
  stamp,
  settings,
}: {
  stamp: CoopMemorialStamp;
  settings: { attributeNames: Record<string, string> };
}) {
  const archetype = archetypeById(stamp.shadowId);
  const name = stamp.shadowName || archetype?.names?.[0] || '羁绊之影';
  const attrName = settings.attributeNames[stamp.weaknessAttribute] || stamp.weaknessAttribute;
  const date = new Date(stamp.defeatedAt);
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const contribution = stamp.myDamage && stamp.totalDamage
    ? Math.round((stamp.myDamage / stamp.totalDamage) * 100)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl overflow-hidden border"
      style={{
        background: 'linear-gradient(135deg, rgba(251,191,36,0.06), rgba(168,85,247,0.04))',
        borderColor: 'rgba(251,191,36,0.25)',
      }}
    >
      {/* 左侧大图章 */}
      <div className="flex items-start gap-3 p-3.5">
        <div
          className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(251,191,36,0.35), rgba(168,85,247,0.2))',
            border: '1px solid rgba(251,191,36,0.4)',
            boxShadow: '0 0 16px -4px rgba(251,191,36,0.5)',
          }}
        >
          🌑
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-black text-gray-900 dark:text-white truncate">
              {name}
            </span>
            <span
              className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full"
              style={{
                background: 'rgba(251,191,36,0.15)',
                color: '#ca8a04',
              }}
            >
              {ATTR_ICON[stamp.weaknessAttribute]} {attrName}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <span>{dateStr}</span>
            {contribution !== null && (
              <>
                <span>·</span>
                <span>你的贡献 <span className="font-semibold text-gray-700 dark:text-gray-300">{contribution}%</span></span>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
