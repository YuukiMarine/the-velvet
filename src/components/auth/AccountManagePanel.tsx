/**
 * 账号管理面板 —— 从"云同步"卡片右侧齿轮进入
 *
 * 功能：
 *  - 设置 / 修改 UserID（之前只用邮箱 OTP 注册的账号，需要补一个 UserID 才能用好友系统）
 *  - 设置 / 修改密码：
 *    · 邮件重置（推荐，适用于"不知道旧密码"的 OTP 注册用户）
 *    · 输入旧密码直接改（适用于已经设过密码的用户）
 *  - 只读展示当前邮箱
 *
 * 关闭：右上 ✕ 或点蒙层外（这里允许蒙层关，因为不是首次登录流程）
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useCloudStore } from '@/store/cloud';
import {
  setOrChangeUserId,
  changePasswordWithOld,
  requestPasswordReset,
  isValidUserId,
} from '@/services/auth';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type View = 'home' | 'userid' | 'password_change' | 'password_reset';

export function AccountManagePanel({ isOpen, onClose }: Props) {
  const cloudUser = useCloudStore(s => s.cloudUser);

  const [view, setView] = useState<View>('home');

  // UserID 表单
  const [newUserId, setNewUserId] = useState('');

  // 改密表单
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setView('home');
    setNewUserId('');
    setOldPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setError('');
    setInfo('');
    setLoading(false);
  }, [isOpen]);

  useEffect(() => {
    setError('');
    setInfo('');
  }, [view]);

  if (!isOpen) return null;

  const currentUserId = (cloudUser?.username as string | undefined) || '';
  const currentEmail = (cloudUser?.email as string | undefined) || '';

  const handleSetUserId = async () => {
    setError('');
    setInfo('');
    if (!isValidUserId(newUserId)) {
      setError('UserID 应为 3-18 位小写字母 / 数字 / ._-');
      return;
    }
    setLoading(true);
    try {
      await setOrChangeUserId(newUserId);
      setInfo(currentUserId ? 'UserID 已更新' : 'UserID 已设置。好友系统现在可用了');
      setTimeout(() => setView('home'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setInfo('');
    if (!oldPassword) { setError('请输入当前密码'); return; }
    setLoading(true);
    try {
      await changePasswordWithOld(oldPassword, newPassword, newPasswordConfirm);
      setInfo('密码已更新');
      setTimeout(() => setView('home'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
    setError('');
    setInfo('');
    if (!currentEmail) { setError('没有绑定邮箱'); return; }
    setLoading(true);
    try {
      await requestPasswordReset(currentEmail);
      setInfo(`重置密码链接已发到 ${currentEmail}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="bg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[170] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
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
              background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.04))',
            }}
          >
            <div className="flex-1">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="text-indigo-500">⚙</span>
                账号管理
              </h3>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {view === 'home' ? '修改 UserID / 密码等账号信息'
                  : view === 'userid' ? (currentUserId ? '修改 UserID' : '设置 UserID')
                  : view === 'password_change' ? '修改密码'
                  : '邮件链接重置密码'}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 text-gray-500 flex items-center justify-center"
              aria-label="关闭"
            >✕</button>
          </div>

          <div className="p-5">
            {view === 'home' ? (
              <div className="space-y-3">
                {/* 邮箱（只读） */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1">邮箱</div>
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{currentEmail || '—'}</div>
                </div>

                {/* UserID */}
                <button
                  onClick={() => { setNewUserId(currentUserId); setView('userid'); }}
                  className={`w-full p-3 rounded-xl text-left transition-colors border ${
                    currentUserId
                      ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                      : 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/15'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase">UserID</span>
                    {!currentUserId && (
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">· 未设置</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100 font-mono truncate">
                      {currentUserId ? `@${currentUserId}` : '还没设置'}
                    </div>
                    <span className="text-[11px] text-indigo-500 flex-shrink-0">
                      {currentUserId ? '修改 →' : '设置 →'}
                    </span>
                  </div>
                  {!currentUserId && (
                    <div className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                      需要它才能让其他客人通过 UserID 找到你、发起好友申请。
                    </div>
                  )}
                </button>

                {/* 密码 */}
                <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 space-y-2">
                  <div className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase">密码</div>
                  <button
                    onClick={() => setView('password_reset')}
                    className="w-full text-left py-2 px-2.5 rounded-lg text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 transition-colors flex items-center justify-between gap-2"
                  >
                    <span>📨 用邮件链接设置 / 重置密码</span>
                    <span className="text-[10px] text-gray-400">→</span>
                  </button>
                  <button
                    onClick={() => setView('password_change')}
                    className="w-full text-left py-2 px-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-2"
                  >
                    <span>🔑 我知道旧密码，直接改</span>
                    <span className="text-[10px] text-gray-400">→</span>
                  </button>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed px-2.5">
                    仅用邮箱验证码登录过的老账号，旧密码是随机生成的——请用"邮件链接"那条设一个。
                  </p>
                </div>
              </div>
            ) : view === 'userid' ? (
              <>
                <label className="block text-[11px] font-bold tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  {currentUserId ? '新的 UserID' : 'UserID'}
                </label>
                <input
                  type="text"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 18))}
                  placeholder="alice_in_velvet"
                  autoComplete="username"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSetUserId(); }}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
                <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  3-18 位小写字母 / 数字 / ._-；注册后仍可修改，但要注意好友会通过它找你。
                </p>

                {error && <p className="mt-3 text-[11px] text-rose-500 leading-relaxed whitespace-pre-wrap">{error}</p>}
                {info && <p className="mt-3 text-[11px] text-emerald-600 leading-relaxed">{info}</p>}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setView('home')}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-40"
                  >
                    取消
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSetUserId}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                    }}
                  >
                    {loading ? '保存中…' : (currentUserId ? '保存新的 UserID' : '设置 UserID')}
                  </motion.button>
                </div>
              </>
            ) : view === 'password_change' ? (
              <>
                <PwLabel>当前密码</PwLabel>
                <PwInput value={oldPassword} onChange={setOldPassword} autoComplete="current-password" />
                <div className="h-3" />
                <PwLabel>新密码 <span className="text-gray-400 text-[10px] ml-1">(至少 8 位)</span></PwLabel>
                <PwInput value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
                <div className="h-3" />
                <PwLabel>再次输入新密码</PwLabel>
                <PwInput value={newPasswordConfirm} onChange={setNewPasswordConfirm} autoComplete="new-password" onEnter={handleChangePassword} />

                {error && <p className="mt-3 text-[11px] text-rose-500 leading-relaxed whitespace-pre-wrap">{error}</p>}
                {info && <p className="mt-3 text-[11px] text-emerald-600 leading-relaxed">{info}</p>}

                <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  如果忘记了旧密码，请回上一步选"用邮件链接"。
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setView('home')}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-40"
                  >
                    取消
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleChangePassword}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                    }}
                  >
                    {loading ? '保存中…' : '确认修改'}
                  </motion.button>
                </div>
              </>
            ) : view === 'password_reset' ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                  点击下方按钮，我们会给 <span className="font-semibold">{currentEmail || '你的邮箱'}</span> 发一条重置链接，
                  在链接里设置新密码即可。
                </p>
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  没登录过密码的老账号（OTP 注册），这是最稳的设密码方式。
                </p>

                {error && <p className="mt-3 text-[11px] text-rose-500 leading-relaxed whitespace-pre-wrap">{error}</p>}
                {info && <p className="mt-3 text-[11px] text-emerald-600 leading-relaxed">{info}</p>}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setView('home')}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 disabled:opacity-40"
                  >
                    返回
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSendResetEmail}
                    disabled={loading}
                    className="py-2.5 rounded-xl text-sm font-bold text-white shadow-md disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                    }}
                  >
                    {loading ? '发送中…' : '发送重置邮件'}
                  </motion.button>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

const PwLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[11px] font-bold tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
    {children}
  </label>
);

const PwInput = ({
  value,
  onChange,
  autoComplete,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  onEnter?: () => void;
}) => (
  <input
    type="password"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
    autoComplete={autoComplete}
    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
  />
);
