/**
 * 密码重置页 —— PB 发的"重置密码"邮件链接会落到这里。
 *
 * 设计要点：
 *   1. 完全独立于主 App（不依赖 zustand store / IndexedDB / 主题设置），
 *      由 main.tsx 在路径为 /reset-password 时直接渲染，跳过 initializeApp 的整套流程，
 *      保证"邮件点进来"的场景极简、极快、不会污染当前用户的本地状态。
 *   2. Token 从 URL 的 ?token= 读取；无 token / token 空 → 直接展示"链接无效"。
 *   3. 不引入 framer-motion / Recharts 等大型依赖，CSS 过渡即可，保持 chunk 轻量。
 *   4. 视觉风格沿用 velvet 深紫玻璃卡，但不读用户 theme —— 登录前无身份，也不需要。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { pb } from '@/services/pocketbase';

type Phase = 'form' | 'submitting' | 'success' | 'fatal';

interface FatalState {
  title: string;
  detail: string;
  /** 是否显示"回首页"按钮 */
  showHome?: boolean;
}

const MIN_LEN = 8;

/** 将各类错误归一化为用户友好的文案 */
function classifyError(e: unknown): { title: string; detail: string } {
  // PB SDK 抛 ClientResponseError，带 status / response
  const status = (e as { status?: number })?.status;
  if (status === 400) {
    return {
      title: '链接已失效',
      detail: '这封重置邮件已经过期或被使用过。请回到应用重新申请一次，有效期内完成设置即可。',
    };
  }
  if (status === 404) {
    return {
      title: '账号不存在',
      detail: '找不到对应的用户记录。可能账号已被删除，请联系开发者。',
    };
  }
  if (e instanceof TypeError && /failed to fetch|network/i.test(e.message)) {
    return {
      title: '网络连接失败',
      detail: '请检查网络后重试。如果一直失败，可能是服务器暂时不可达。',
    };
  }
  const msg = e instanceof Error ? e.message : String(e);
  return {
    title: '修改失败',
    detail: msg || '发生了未知错误，请稍后重试。',
  };
}

export function ResetPasswordPage() {
  const token = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('token') ?? '';
    } catch {
      return '';
    }
  }, []);

  const [phase, setPhase] = useState<Phase>('form');
  const [fatal, setFatal] = useState<FatalState | null>(null);
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  // Token / 环境前置校验
  useEffect(() => {
    if (!pb) {
      setPhase('fatal');
      setFatal({
        title: '云同步未启用',
        detail: '当前构建未配置 VITE_PB_URL，重置密码需要云端支持。请联系开发者。',
        showHome: true,
      });
      return;
    }
    if (!token) {
      setPhase('fatal');
      setFatal({
        title: '链接无效',
        detail: '这条链接缺少校验令牌。请确认是从完整的重置邮件中点击进来的，或重新申请一次。',
        showHome: true,
      });
    }
  }, [token]);

  // 文档标题（这个页面生命周期短，副作用保留最小）
  useEffect(() => {
    const prev = document.title;
    document.title = '重置密码 · 靛蓝色房间';
    return () => { document.title = prev; };
  }, []);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (phase === 'submitting') return;
    setFormError(null);

    if (pwd.length < MIN_LEN) {
      setFormError(`密码至少 ${MIN_LEN} 位`);
      return;
    }
    if (pwd !== confirm) {
      setFormError('两次输入的密码不一致');
      return;
    }

    setPhase('submitting');
    try {
      await pb!.collection('users').confirmPasswordReset(token, pwd, confirm);
      setPhase('success');
    } catch (err) {
      const { title, detail } = classifyError(err);
      // 400 一类的"token 失效"属于终局错误，不让用户在同一页反复重试
      const status = (err as { status?: number })?.status;
      if (status === 400 || status === 404) {
        setPhase('fatal');
        setFatal({ title, detail, showHome: true });
      } else {
        setPhase('form');
        setFormError(`${title}：${detail}`);
      }
    }
  }, [phase, pwd, confirm, token]);

  const goHome = () => { window.location.href = '/'; };

  return (
    <div
      style={{ background: 'linear-gradient(160deg, #0a0626 0%, #1a0b3d 55%, #06061a 100%)' }}
      className="min-h-screen w-full flex items-center justify-center p-4 text-gray-100"
    >
      <div
        role="main"
        aria-label="重置密码"
        className="w-full max-w-md rounded-3xl p-7 sm:p-8 shadow-2xl"
        style={{
          background: 'rgba(10, 6, 38, 0.82)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 0 80px rgba(109,40,217,0.22), 0 25px 60px rgba(0,0,0,0.70)',
        }}
      >
        {/* 头部 */}
        <div className="mb-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(99,102,241,0.2))',
              border: '1px solid rgba(167,139,250,0.35)',
            }}>
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-violet-200" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a2 2 0 100-4 2 2 0 000 4zm6-4V8a6 6 0 10-12 0v3M5 11h14a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1v-7a1 1 0 011-1z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-wide">
            {phase === 'success' ? '密码已更新' : phase === 'fatal' ? (fatal?.title ?? '出错了') : '重置密码'}
          </h1>
          <p className="mt-1 text-xs text-violet-200/60">靛蓝色房间 · The Velvet Room</p>
        </div>

        {/* 主体 */}
        {phase === 'fatal' && fatal && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-gray-300">{fatal.detail}</p>
            {fatal.showHome && (
              <button
                onClick={goHome}
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-colors"
                style={{
                  background: 'linear-gradient(135deg, #6d28d9, #4f46e5)',
                  boxShadow: '0 8px 24px rgba(109,40,217,0.35)',
                }}
              >
                回到主站
              </button>
            )}
          </div>
        )}

        {phase === 'success' && (
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-gray-300">
              新密码已生效。你现在可以回到应用，用这个密码登录了。
            </p>
            <button
              onClick={goHome}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-colors"
              style={{
                background: 'linear-gradient(135deg, #059669, #065f46)',
                boxShadow: '0 8px 24px rgba(5,150,105,0.35)',
              }}
            >
              回到主站登录
            </button>
          </div>
        )}

        {(phase === 'form' || phase === 'submitting') && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-pwd" className="block text-xs font-semibold tracking-widest uppercase text-violet-200/70">
                新密码
              </label>
              <div className="relative">
                <input
                  id="new-pwd"
                  type={showPwd ? 'text' : 'password'}
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                  minLength={MIN_LEN}
                  required
                  disabled={phase === 'submitting'}
                  className="w-full px-4 py-2.5 pr-20 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-400/60 focus:bg-black/50 disabled:opacity-60"
                  placeholder={`至少 ${MIN_LEN} 位`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  tabIndex={-1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] rounded-md text-violet-200/70 hover:text-violet-100 hover:bg-white/5"
                >
                  {showPwd ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-pwd" className="block text-xs font-semibold tracking-widest uppercase text-violet-200/70">
                确认密码
              </label>
              <input
                id="confirm-pwd"
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={MIN_LEN}
                required
                disabled={phase === 'submitting'}
                className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-400/60 focus:bg-black/50 disabled:opacity-60"
                placeholder="再输一遍"
              />
            </div>

            {formError && (
              <div
                role="alert"
                className="text-xs leading-relaxed px-3 py-2 rounded-lg text-red-300 border border-red-500/30 bg-red-900/20"
              >
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={phase === 'submitting' || !pwd || !confirm}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: phase === 'submitting'
                  ? 'rgba(109,40,217,0.45)'
                  : 'linear-gradient(135deg, #6d28d9, #4f46e5)',
                boxShadow: '0 8px 24px rgba(109,40,217,0.35)',
              }}
            >
              {phase === 'submitting' ? '正在修改…' : '确认修改'}
            </button>

            <p className="text-[11px] text-center text-violet-200/40 leading-relaxed pt-1">
              提交后立即生效。如果你没有申请过重置密码，可以直接关闭此页面 —— 旧密码不会被改动。
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
