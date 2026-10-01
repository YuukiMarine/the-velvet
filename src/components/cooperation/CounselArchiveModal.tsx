/**
 * 谏言归档库：浏览过往被归档的 100 字摘要（2026-10-02 翻新：跟谏言窗口同一套四频道皮；挂弹层暂停；返回键关闭）
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import { useShallow } from 'zustand/react/shallow';
import { TAROT_BY_ID } from '@/constants/tarot';
import { useOverlayPresence } from '@/ui/overlayPause';
import { useUiChannel } from '@/ui/useUiChannel';
import { useBackHandler } from '@/utils/useBackHandler';
import { counselSkinOf, type CounselCh } from '@/components/cooperation/counselSkin';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CounselArchiveModal({ isOpen, onClose }: Props) {
  const { counselArchives, confidants, deleteCounselArchive } = useAppStore(useShallow(s => ({ counselArchives: s.counselArchives, confidants: s.confidants, deleteCounselArchive: s.deleteCounselArchive })));
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const uiCh = useUiChannel();
  const ch: CounselCh = uiCh === 'p3' || uiCh === 'p4' || uiCh === 'p5' ? uiCh : 'neutral';
  const sk = useMemo(() => counselSkinOf(ch), [ch]);
  useOverlayPresence(isOpen);
  useBackHandler(isOpen, () => { if (confirmId) setConfirmId(null); else onClose(); });

  const sorted = useMemo(
    () => [...counselArchives].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [counselArchives],
  );

  if (!isOpen) return null;

  const confidantById = (id: string) => confidants.find(c => c.id === id);
  const formatDate = (d: Date | string) => {
    const dt = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="archive-bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[180] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          key="archive-modal"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="谏言归档库"
          data-counsel-archive={ch}
          className={`relative flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-3xl shadow-2xl ${sk.root}`}
          style={sk.rootStyle}
        >
          <div className="p-3">
            <div className={`flex items-center gap-3 px-4 py-3 ${sk.header}`} style={sk.headerStyle}>
              <div className="min-w-0 flex-1">
                <h3 className={`flex items-center gap-2 ${sk.title}`} style={sk.titleStyle}>
                  <span style={sk.star} aria-hidden>✧</span>谏言归档库
                </h3>
                <div className={`mt-0.5 ${sk.sub}`} style={sk.subStyle}>{sorted.length} 次被你亲手存下的谈话</div>
              </div>
              <button type="button" onClick={onClose} aria-label="关闭" className={`flex h-8 w-8 shrink-0 items-center justify-center text-base font-black opacity-70 transition hover:opacity-100 ${sk.icon}`} style={{ color: sk.titleStyle?.color }}>✕</button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {sorted.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mb-3 text-5xl opacity-30" style={sk.star} aria-hidden>✧</div>
                <p className={sk.muted} style={sk.mutedStyle}>
                  归档库还是空的。<br />聊完之后点「归档」，这次谈话的摘要会留在这里。
                </p>
              </div>
            ) : (
              sorted.map(a => {
                const mentioned = a.mentionedConfidantIds.map(confidantById).filter(Boolean);
                return (
                  <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className={sk.dialog} style={sk.dialogStyle} data-counsel-archive-item>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className={`tracking-widest ${sk.meta}`} style={sk.metaStyle}>{formatDate(a.createdAt)} · {a.messageCount} 条</div>
                      <button type="button" onClick={() => setConfirmId(a.id)} className={sk.link} style={sk.linkStyle} aria-label={`删除 ${formatDate(a.createdAt)} 的归档`}>删除</button>
                    </div>
                    {mentioned.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {mentioned.map(c => c && (
                          <span key={c.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1'}22`, color: TAROT_BY_ID[c.arcanaId]?.accent ?? '#6366f1' }}>
                            @{c.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className={`whitespace-pre-wrap text-[13px] font-semibold leading-relaxed ${sk.dialogTitle.replace(/text-base|font-black|font-bold/g, '')}`} style={sk.dialogTitleStyle}>{a.summary}</p>
                  </motion.div>
                );
              })
            )}
          </div>

          <AnimatePresence>
            {confirmId && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm" onClick={() => setConfirmId(null)}>
                <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-label="删除这条归档" className={`w-full max-w-xs ${sk.dialog}`} style={sk.dialogStyle}>
                  <h4 className={`mb-2 ${sk.dialogTitle}`} style={sk.dialogTitleStyle}>删除这条归档？</h4>
                  <p className={sk.muted} style={sk.mutedStyle}>删除后不可恢复。</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setConfirmId(null)} className={sk.ghost} style={sk.ghostStyle}>再想想</button>
                    <button type="button" onClick={async () => { await deleteCounselArchive(confirmId); setConfirmId(null); }} className={sk.danger} style={sk.dangerStyle}>删除</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
