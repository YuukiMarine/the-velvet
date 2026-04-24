/**
 * 添加在线同伴 —— 通过 UserID 搜对方账号，发起好友申请。
 *
 * 流程：
 *   1. 输入对方 UserID → 搜索按钮
 *   2. 找到后显示小卡片（昵称 / LV / 头像）
 *   3. 可选留言（≤200 字）
 *   4. "发送申请" → POST friendships + notification
 *
 * 未登录 / 没配置云端：UI 禁用并提示"先去登录"。
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useCloudStore } from '@/store/cloud';
import { searchUserByUserId, sendFriendRequest } from '@/services/friends';
import { loadSocial } from '@/services/social';
import { isValidUserId } from '@/services/auth';
import type { CloudProfile } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'search' | 'preview' | 'success';

export function AddOnlineConfidantModal({ isOpen, onClose }: Props) {
  const cloudUser = useCloudStore(s => s.cloudUser);

  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<Phase>('search');
  const [found, setFound] = useState<CloudProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setUserId('');
    setMessage('');
    setPhase('search');
    setFound(null);
    setLoading(false);
    setError('');
  }, [isOpen]);

  const handleSearch = async () => {
    setError('');
    const normalized = userId.trim().toLowerCase();
    if (!isValidUserId(normalized)) {
      setError('UserID 应为 3-18 位小写字母 / 数字 / ._-');
      return;
    }
    if (cloudUser && normalized === (cloudUser.username as string | undefined)) {
      setError('不能加自己为好友');
      return;
    }
    setLoading(true);
    try {
      const profile = await searchUserByUserId(normalized);
      if (!profile) {
        setError('没找到这个 UserID');
        return;
      }
      if (cloudUser && profile.id === cloudUser.id) {
        setError('不能加自己为好友');
        return;
      }
      setFound(profile);
      setPhase('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!found) return;
    setError('');
    setLoading(true);
    try {
      await sendFriendRequest({ targetUserId: found.id, message });
      setPhase('success');
      void loadSocial({ force: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[185] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', damping: 24, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden"
        >
          <div
            className="px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(99,102,241,0.04))',
            }}
          >
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="text-emerald-500">✦</span>
                邀请在线同伴
              </h3>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                输入对方的 UserID 来发起好友申请
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center"
              aria-label="关闭"
            >✕</button>
          </div>

          <div className="p-5">
            {!cloudUser ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                  邀请在线同伴之前，请先在设置页登录云端账号。
                </p>
              </div>
            ) : phase === 'search' ? (
              <>
                <label className="block text-[11px] font-bold tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  对方的 UserID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 18))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                    placeholder="alice_in_velvet"
                    className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={handleSearch}
                    disabled={loading || !userId.trim()}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                    }}
                  >
                    {loading ? '查找中…' : '搜索'}
                  </motion.button>
                </div>
                {error && (
                  <p className="mt-3 text-[11px] text-rose-500 leading-relaxed">{error}</p>
                )}
                <p className="mt-4 text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  UserID 是对方在注册时选的唯一标识（3-18 位小写字母/数字/._-），
                  <br />不区分大小写，精确匹配后才能找到。
                </p>
              </>
            ) : phase === 'preview' && found ? (
              <>
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-emerald-500/20 text-emerald-600 font-black text-xl flex items-center justify-center flex-shrink-0">
                    {found.avatarUrl ? (
                      <img src={found.avatarUrl} alt={found.nickname ?? found.userId} className="w-full h-full object-cover" />
                    ) : (
                      (found.nickname?.[0] ?? found.userId?.[0] ?? '?').toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                      {found.nickname || found.userId}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      @{found.userId}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      LV {found.totalLv ?? 0}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-[11px] font-bold tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                    留言（可选，≤ 200 字）
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                    rows={3}
                    placeholder="嗨，是我……"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                  />
                  <div className="text-right text-[10px] text-gray-400 mt-1">
                    {message.length} / 200
                  </div>
                </div>

                {error && (
                  <p className="mt-2 text-[11px] text-rose-500 leading-relaxed">{error}</p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPhase('search')}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-40"
                  >
                    返回搜索
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSend}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-xs font-bold text-white shadow-md disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                    }}
                  >
                    {loading ? '发送中…' : '发送申请'}
                  </motion.button>
                </div>
              </>
            ) : phase === 'success' ? (
              <div className="text-center py-6">
                <div className="text-4xl mb-3">🤝</div>
                <p className="text-sm font-semibold text-gray-800 dark:text-white mb-1">
                  申请已送出
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  对方接受后，你们会在各自的同伴列表顶部出现。
                  <br />21 天未响应，申请会自动作废。
                </p>
                <button
                  onClick={onClose}
                  className="mt-5 px-5 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                >
                  好的
                </button>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
