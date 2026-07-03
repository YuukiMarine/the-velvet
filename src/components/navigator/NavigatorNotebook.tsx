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
import type { NavigatorMemo } from '@/types';

export const NavigatorNotebook = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
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
        <div className="space-y-4 pb-2">
          {/* 画像总览 */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">TA 眼里的你（长期画像，可直接修改）</span>
              {profileDirty && (
                <button type="button" onClick={() => void commitProfile()} className="text-xs font-bold text-primary">保存</button>
              )}
            </div>
            <textarea
              value={profile}
              onChange={(e) => { setProfile(e.target.value); setProfileDirty(true); }}
              onBlur={() => void commitProfile()}
              placeholder="还没有画像——多聊几天，它会写下对你的整体印象；你也可以现在直接写给它。"
              rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-primary dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">每次对话都会带上这段画像；它会在整理对话时自动更新，你的手改优先。</p>
          </div>

          {/* 原子记忆 */}
          <div className="text-xs font-bold text-gray-500 dark:text-gray-400">零散记忆（按相关性取用；置顶的永不遗忘）</div>
          {memos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-xs text-gray-400 dark:border-gray-600">
              还没有记忆——多聊几天，它会自己记住重要的事。
            </p>
          ) : (
            <div className="max-h-[38vh] space-y-2 overflow-y-auto pr-1">
              {memos.map((m) => (
                <div key={m.id} className="rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-700">
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
                        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                          {m.pinned && <span className="mr-1 text-primary" aria-hidden>📌</span>}
                          {m.text}
                        </p>
                        <p className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                          {new Date(m.createdAt).toLocaleDateString()} · 重要度 {m.importance}{m.followUp ? ' · 有待追问话头' : ''}
                        </p>
                      </div>
                      <button type="button" onClick={() => void togglePin(m)} aria-label={m.pinned ? '取消置顶' : '置顶'}
                        className={`shrink-0 rounded p-1 text-xs ${m.pinned ? 'text-primary' : 'text-gray-300 hover:text-primary dark:text-gray-600'}`}>📌</button>
                      <button type="button" onClick={() => setMemoEdit({ id: m.id, text: m.text })} aria-label="编辑记忆"
                        className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-primary">改</button>
                      <button type="button" onClick={() => setDeleteId(m.id)} aria-label="删除记忆"
                        className="shrink-0 rounded p-1 text-xs text-gray-400 hover:text-red-400">删</button>
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
