/**
 * NavigatorNotebook — 记事本弹窗（体验优化④）。
 *
 * 两层记忆的可视面：
 *   · 顶部「TA 眼里的你」= AI 维护的用户画像总览（ChatGPT Memory 式：常驻注入、
 *     compact 增量更新、此处可随时手改——改完立即生效，下次 compact 以手改版为基准）。
 *   · 下方原子记忆列表：查看/编辑/删除/置顶（置顶=importance 拉满+免疫遗忘）。
 * 入口：设置→黑猫区按钮 + 对话窗头像菜单。所有内容 local-only。
 */
import { useEffect, useState } from 'react';
import { db } from '@/db';
import { SheetModal } from '@/components/SheetModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getProfile, saveProfile } from '@/utils/navigatorMemory';
import { useUiChannel } from '@/ui/useUiChannel';
import type { NavigatorMemo } from '@/types';

export const NavigatorNotebook = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const p3 = useUiChannel() === 'p3';
  const [profile, setProfile] = useState('');
  const [profileDirty, setProfileDirty] = useState(false);
  const [memos, setMemos] = useState<NavigatorMemo[]>([]);
  const [memoEdit, setMemoEdit] = useState<{ id: string; text: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setProfile(await getProfile());
    setProfileDirty(false);
    const rows = await db.navigatorMemos.orderBy('createdAt').reverse().toArray();
    setMemos(rows.filter((m) => m.status === 'active' && m.source !== 'profile'));
  };
  useEffect(() => { if (isOpen) void load(); }, [isOpen]);

  const commitProfile = async () => {
    if (!profileDirty) return;
    await saveProfile(profile);
    setProfileDirty(false);
  };

  const togglePin = async (m: NavigatorMemo) => {
    await db.navigatorMemos.update(m.id, { pinned: !m.pinned, importance: !m.pinned ? 5 : m.importance });
    await load();
  };
  const saveMemoEdit = async () => {
    if (!memoEdit) return;
    const text = memoEdit.text.trim();
    if (text) await db.navigatorMemos.update(memoEdit.id, { text: text.slice(0, 80) });
    setMemoEdit(null);
    await load();
  };
  const confirmDelete = async () => {
    if (deleteId) { await db.navigatorMemos.delete(deleteId); await load(); }
    setDeleteId(null);
  };

  return (
    <>
      <SheetModal isOpen={isOpen} onClose={() => { void commitProfile(); onClose(); }} position="bottom" title="记事本">
        <div className="relative pb-2">
          {p3 && (
            <>
              {/* MEMORY 竖排幽灵字（整行横排词顺时针 90°，沿左缘自上而下——定稿口径） */}
              <div aria-hidden className="pointer-events-none absolute -left-10 top-8 flex h-[430px] w-[74px] select-none items-center justify-center overflow-hidden">
                <span className="whitespace-nowrap font-black italic leading-none" style={{ fontFamily: 'Arial, sans-serif', fontSize: '4.4rem', color: 'rgba(53,209,232,0.26)', transform: 'rotate(90deg)' }}>
                  MEMORY
                </span>
              </div>
              {/* 保存画像 白斜片（内容区右上，与首行标签同行——p3-modal-13 稿的标题行右钮位） */}
              <button
                type="button"
                onClick={() => void commitProfile()}
                className={`absolute -top-1 right-0 z-10 bg-white px-4 py-1.5 text-[13px] font-black transition ${profileDirty ? '' : 'opacity-60'}`}
                style={{ color: '#1b57ff', clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', boxShadow: '0 8px 20px rgba(7,40,120,.14)' }}
              >
                保存画像
                <span aria-hidden className="absolute bottom-0 right-1 h-[8px] w-[12px]" style={{ background: '#35d1e8', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
              </button>
            </>
          )}

          {/* 画像总览 */}
          <div className="relative">
            <div className={`mb-1.5 flex items-center justify-between ${p3 ? 'pr-[96px]' : ''}`}>
              <span className={p3 ? 'text-[13px] font-black' : 'text-xs font-bold text-gray-500 dark:text-gray-400'} style={p3 ? { color: '#0a1230' } : undefined}>
                TA 眼里的你（长期画像，可直接修改）
              </span>
              {!p3 && profileDirty && (
                <button type="button" onClick={() => void commitProfile()} className="text-xs font-bold text-primary">保存</button>
              )}
            </div>
            {p3 ? (
              <div className="relative">
                <textarea
                  value={profile}
                  onChange={(e) => { setProfile(e.target.value); setProfileDirty(true); }}
                  onBlur={() => void commitProfile()}
                  placeholder="还没有画像——多聊几天，它会写下对你的整体印象；你也可以现在直接写给它。"
                  rows={7}
                  className="w-full resize-none px-4 py-3.5 text-sm font-semibold leading-relaxed outline-none"
                  style={{ background: '#dbeff8', color: '#0a1230', clipPath: 'polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' }}
                />
                <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-1.5 h-[12px] w-[20px]" style={{ background: '#35d1e8', clipPath: 'polygon(35% 0, 100% 0, 65% 100%, 0 100%)' }} />
              </div>
            ) : (
              <textarea
                value={profile}
                onChange={(e) => { setProfile(e.target.value); setProfileDirty(true); }}
                onBlur={() => void commitProfile()}
                placeholder="还没有画像——多聊几天，它会写下对你的整体印象；你也可以现在直接写给它。"
                rows={4}
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            )}
            <p className={p3 ? 'mt-1.5 text-[11px] font-bold leading-relaxed' : 'mt-1 text-[10px] text-gray-400 dark:text-gray-500'} style={p3 ? { color: '#4b8fd9' } : undefined}>
              每次对话都会带上这段画像；它会在整理对话时自动更新，你的手改优先。
            </p>
          </div>

          {/* 原子记忆 */}
          <div className={p3 ? 'mt-5 text-[13px] font-black' : 'mt-4 text-xs font-bold text-gray-500 dark:text-gray-400'} style={p3 ? { color: '#0a1230' } : undefined}>
            零散记忆（按相关性取用；置顶的永不遗忘）
          </div>
          {memos.length === 0 ? (
            p3 ? (
              <div className="relative mt-2">
                <span aria-hidden className="absolute -top-1.5 left-0 z-10 h-0 w-0 border-r-[18px] border-t-[15px] border-r-transparent" style={{ borderTopColor: '#f0417f' }} />
                <p className="px-5 py-7 text-center text-[13px] font-bold leading-relaxed" style={{ background: '#dbeff8', color: '#4b8fd9', clipPath: 'polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%)' }}>
                  还没有记忆——多聊几天，它会自己记住重要的事。
                </p>
              </div>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-xs text-gray-400 dark:border-gray-600">
                还没有记忆——多聊几天，它会自己记住重要的事。
              </p>
            )
          ) : (
            <div className="mt-2 max-h-[38vh] space-y-2 overflow-y-auto pr-1">
              {memos.map((m) => (
                <div
                  key={m.id}
                  className={p3 ? 'bg-white px-3.5 py-2.5' : 'rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700'}
                  style={p3 ? { clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)', boxShadow: '0 6px 16px rgba(7,40,120,.10)' } : undefined}
                >
                  {memoEdit?.id === m.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={memoEdit.text}
                        onChange={(e) => setMemoEdit({ id: m.id, text: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') void saveMemoEdit(); }}
                        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                      <button type="button" onClick={() => void saveMemoEdit()} className="shrink-0 text-xs font-bold text-primary">存</button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className={p3 ? 'text-sm font-semibold leading-relaxed' : 'text-sm leading-relaxed text-gray-700 dark:text-gray-200'} style={p3 ? { color: '#0a1230' } : undefined}>
                          {m.pinned && <span className="mr-1 text-primary" aria-hidden>📌</span>}
                          {m.text}
                        </p>
                        <p className={p3 ? 'mt-0.5 text-[10px] font-bold' : 'mt-0.5 text-[10px] text-gray-400 dark:text-gray-500'} style={p3 ? { color: '#6a7ba3' } : undefined}>
                          {new Date(m.createdAt).toLocaleDateString()} · 重要度 {m.importance}{m.followUp ? ' · 有待追问话头' : ''}
                        </p>
                      </div>
                      <button type="button" onClick={() => void togglePin(m)} aria-label={m.pinned ? '取消置顶' : '置顶'}
                        className={`shrink-0 rounded p-1 text-xs ${m.pinned ? 'text-primary' : 'text-gray-300 hover:text-primary dark:text-gray-600'}`}>📌</button>
                      <button type="button" onClick={() => setMemoEdit({ id: m.id, text: m.text })} aria-label="编辑记忆"
                        className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-primary">改</button>
                      <button type="button" onClick={() => setDeleteId(m.id)} aria-label="删除记忆"
                        className={`shrink-0 rounded p-1 text-xs ${p3 ? 'text-gray-400 hover:text-[#f0417f]' : 'text-gray-400 hover:text-red-400'}`}>删</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetModal>
      <ConfirmDialog
        isOpen={!!deleteId}
        tone="danger"
        title="删除这条记忆？"
        description="它会忘掉这件事。"
        confirmText="删除"
        cancelText="取消"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
};
