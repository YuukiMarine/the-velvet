import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ForwardedRef, KeyboardEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  loginWithPassword,
  requestLoginOrSignupOTP,
  verifyOTP,
  requestPasswordReset,
  requestOTP as requestOTPByEmail,
} from '@/services/auth';
import { useBackHandler } from '@/utils/useBackHandler';
import type { RecordModel } from 'pocketbase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (record: RecordModel) => void;
  /** 入口位置：'welcome' 来自欢迎页，'settings' 来自设置页 */
  origin?: 'welcome' | 'settings';
}

type AuthMode = 'otp' | 'password';

const RESEND_COOLDOWN = 60;

export const LoginModal = ({ isOpen, onClose, onSuccess, origin = 'settings' }: Props) => {
  const [mode, setMode] = useState<AuthMode>('otp');

  // 输入
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');

  // OTP 流程
  const [otpId, setOtpId] = useState('');
  const [code, setCode] = useState('');
  const [otpStep, setOtpStep] = useState<'input' | 'code'>('input');
  const [cooldown, setCooldown] = useState(0);
  /** 本次发码是否附带了"新客人首次登记"的自动创建 —— 用来切文案 */
  const [signupInProgress, setSignupInProgress] = useState(false);

  // 状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode('otp');
    setIdentity('');
    setPassword('');
    setOtpId('');
    setCode('');
    setOtpStep('input');
    setCooldown(0);
    setSignupInProgress(false);
    setError('');
    setInfo('');
    setLoading(false);
    const t = setTimeout(() => firstInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    setError('');
    setInfo('');
  }, [mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Android 返回键：
  //   - OTP 已进到验证码输入步骤（code）→ 先回到邮箱输入步骤（匹配组件内"返回"按钮）
  //   - 其他情况 → 关闭整个登录弹窗（匹配"稍后再说"按钮）
  //   注意：login 流程 loading 期间，"稍后再说"按钮本就没 disabled，因此 back 同样允许
  useBackHandler(isOpen, () => {
    if (mode === 'otp' && otpStep === 'code') {
      setOtpStep('input');
      setError('');
      setInfo('');
      setSignupInProgress(false);
    } else {
      onClose();
    }
  });

  // ── 登录 · 密码 ──────────────────────────────────
  const handlePasswordLogin = async () => {
    setError(''); setInfo('');
    if (!identity.trim()) { setError('请输入 UserID 或邮箱'); return; }
    if (!password) { setError('请输入密码'); return; }
    setLoading(true);
    try {
      const record = await loginWithPassword(identity, password);
      onSuccess?.(record);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  // ── 登录或登记 · 验证码（一条路径） ──────────────
  const handleSendOTP = async () => {
    setError(''); setInfo('');
    if (cooldown > 0) { setError(`请稍后再试（还有 ${cooldown}s）`); return; }
    if (!identity.trim()) { setError('请输入 UserID 或邮箱'); return; }
    setLoading(true);
    try {
      const { otpId, wasSignup } = await requestLoginOrSignupOTP(identity);
      setOtpId(otpId);
      setOtpStep('code');
      setCooldown(RESEND_COOLDOWN);
      setSignupInProgress(wasSignup);
      setInfo(
        wasSignup
          ? `新客人登记中 —— 验证码已发到 ${identity.trim().toLowerCase()}`
          : '验证码已发送',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setError('');
    if (code.trim().length < 4) { setError('请输入完整的验证码'); return; }
    setLoading(true);
    try {
      const record = await verifyOTP(otpId, code);
      if (signupInProgress) {
        setInfo('登记完成 · 接下来完成房间初始化');
      }
      onSuccess?.(record);
      setTimeout(() => onClose(), signupInProgress ? 900 : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码错误或已过期');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (cooldown > 0) return;
    setError(''); setInfo('');
    setLoading(true);
    try {
      // 重发时账号已确认存在（上一次要么找到了要么刚建完）→ 直接按邮箱发
      // 这里 identity 可能是 UserID；但 requestLoginOrSignupOTP 会再次解析
      const { otpId, wasSignup } = await requestLoginOrSignupOTP(identity);
      setOtpId(otpId);
      setCode('');
      setCooldown(RESEND_COOLDOWN);
      setInfo(wasSignup ? '新客人登记验证码已重发' : '已重新发送');
    } catch (err) {
      setError(err instanceof Error ? err.message : '重发失败');
    } finally {
      setLoading(false);
    }
  };

  // ── 忘记密码 ──────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!identity.trim()) { setError('请先填上邮箱或 UserID'); return; }
    setError(''); setInfo('');
    setLoading(true);
    try {
      await requestPasswordReset(identity);
      setInfo(`重置密码链接已发送`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  };

  const title =
    origin === 'welcome'
      ? '欢迎归来，客人'
      : '登录靛蓝色房间';
  const subtitle = '验证码最省心——没登记过的邮箱也能直接进';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(30,20,60,0.85) 0%, rgba(8,6,20,0.96) 100%)',
            backdropFilter: 'blur(8px)',
          }}
          // 不在蒙层点击时关闭——用底部"稍后再说"按钮或右上关闭；避免误触丢掉输入
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            onClick={e => e.stopPropagation()}
            className="relative w-full max-w-md rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #1a1a3e 0%, #0f0f2e 100%)',
              border: '1px solid rgba(196, 181, 253, 0.25)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 40px rgba(124,58,237,0.25)',
            }}
          >
            <div className="px-7 pt-7 pb-2 text-center">
              <div className="text-[11px] tracking-[0.5em] font-semibold" style={{ color: '#a78bfa' }}>
                THE VELVET
              </div>
              <div className="text-lg leading-none my-2" style={{ color: '#6b7ca8' }}>◆</div>
              <h2 className="text-xl font-serif" style={{ color: '#f5e6ff' }}>{title}</h2>
              <p className="text-xs mt-2 leading-relaxed" style={{ color: '#a89dc0' }}>{subtitle}</p>
            </div>

            <div
              className="mx-7 my-4 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(196,181,253,0.4), transparent)',
              }}
            />

            <div className="px-7 pb-6">
              {/* 两个 Tab：验证码（默认） / 密码 */}
              <div
                className="grid grid-cols-2 gap-1 p-1 rounded-lg mb-5"
                style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(196,181,253,0.15)' }}
              >
                {([
                  { id: 'otp', label: '验证码' },
                  { id: 'password', label: '密码' },
                ] as Array<{ id: AuthMode; label: string }>).map(t => {
                  const active = mode === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setMode(t.id)}
                      className="py-1.5 rounded-md text-[11px] font-semibold tracking-wider transition-all"
                      style={{
                        background: active ? 'rgba(167,139,250,0.25)' : 'transparent',
                        color: active ? '#f5e6ff' : '#a89dc0',
                        border: active ? '1px solid rgba(196,181,253,0.4)' : '1px solid transparent',
                      }}
                    >
                      {t.label}
                      {t.id === 'otp' && <span className="ml-1 text-[9px]" style={{ color: '#86efac' }}>· 推荐</span>}
                    </button>
                  );
                })}
              </div>

              {mode === 'otp' ? (
                otpStep === 'input' ? (
                  <>
                    <Label>UserID 或邮箱</Label>
                    <TextInput
                      ref={firstInputRef}
                      type="text"
                      value={identity}
                      onChange={v => setIdentity(v.toLowerCase())}
                      placeholder="alice_in_velvet 或 your@email.com"
                      autoComplete="username email"
                      onEnter={handleSendOTP}
                    />
                    <p className="mt-2 text-[10px] leading-relaxed" style={{ color: '#8b7ca8' }}>
                      新客人直接填邮箱——第一次验证就相当于登记。
                    </p>
                    {error && <ErrorText>{error}</ErrorText>}
                    {info && <InfoText>{info}</InfoText>}
                    <div className="mt-6">
                      <PrimaryButton loading={loading} onClick={handleSendOTP}>
                        {loading ? '发送中…' : '发送验证码'}
                      </PrimaryButton>
                    </div>
                  </>
                ) : (
                  <OTPCodeStep
                    code={code}
                    setCode={setCode}
                    error={error}
                    info={info}
                    loading={loading}
                    cooldown={cooldown}
                    signupInProgress={signupInProgress}
                    onBack={() => { setOtpStep('input'); setError(''); setInfo(''); setSignupInProgress(false); }}
                    onVerify={handleVerifyOTP}
                    onResend={handleResendOTP}
                    firstInputRef={firstInputRef}
                  />
                )
              ) : (
                <>
                  <Label>UserID 或邮箱</Label>
                  <TextInput
                    ref={firstInputRef}
                    type="text"
                    value={identity}
                    onChange={v => setIdentity(v.toLowerCase())}
                    placeholder="alice_in_velvet 或 your@email.com"
                    autoComplete="username email"
                    onEnter={handlePasswordLogin}
                  />
                  <div className="h-4" />
                  <Label>密码</Label>
                  <TextInput
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="•••••••••"
                    autoComplete="current-password"
                    onEnter={handlePasswordLogin}
                  />
                  {error && <ErrorText>{error}</ErrorText>}
                  {info && <InfoText>{info}</InfoText>}
                  <div className="mt-6">
                    <PrimaryButton loading={loading} onClick={handlePasswordLogin}>
                      {loading ? '登录中…' : '进入房间'}
                    </PrimaryButton>
                  </div>
                </>
              )}

              {/* 忘记密码（仅密码 Tab 可见） */}
              {mode === 'password' && (
                <div className="mt-5 text-right">
                  <button
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-[11px] hover:opacity-80 transition-opacity disabled:opacity-40"
                    style={{ color: '#8b7ca8' }}
                  >
                    忘记密码？
                  </button>
                </div>
              )}

              <div
                className="mt-5 pt-4 border-t text-[10px] text-center leading-relaxed"
                style={{ borderColor: 'rgba(196,181,253,0.15)', color: '#6b7ca8' }}
              >
                新客人也可以直接填邮箱，第一次验证就等于登记
              </div>

              <div className="mt-3 text-center">
                <button
                  onClick={onClose}
                  className="text-xs hover:opacity-80 transition-opacity"
                  style={{ color: '#6b7ca8' }}
                >
                  稍后再说
                </button>
              </div>
            </div>

            <div
              className="pb-5 pt-1 text-center text-[10px] tracking-[0.3em]"
              style={{ color: '#4c4878' }}
            >
              —— THE VELVET ——
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── OTP 验证码输入步骤 ─────────────────────────────────────

function OTPCodeStep({
  code, setCode, error, info, loading, cooldown, signupInProgress,
  onBack, onVerify, onResend, firstInputRef,
}: {
  code: string;
  setCode: (v: string) => void;
  error: string;
  info: string;
  loading: boolean;
  cooldown: number;
  signupInProgress: boolean;
  onBack: () => void;
  onVerify: () => void;
  onResend: () => void;
  firstInputRef: React.RefObject<HTMLInputElement>;
}) {
  useEffect(() => {
    const t = setTimeout(() => firstInputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [firstInputRef]);

  return (
    <>
      {signupInProgress && (
        <div
          className="mb-3 px-3 py-2 rounded-lg text-[11px] leading-relaxed"
          style={{
            background: 'rgba(16,185,129,0.12)',
            border: '1px solid rgba(16,185,129,0.35)',
            color: '#86efac',
          }}
        >
          新客人登记中——输入验证码即为你开一个房间。UserID 可以稍后在设置里补。
        </div>
      )}
      <Label>验证码</Label>
      <TextInput
        ref={firstInputRef}
        type="text"
        inputMode="numeric"
        value={code}
        onChange={v => setCode(v.replace(/\D/g, '').slice(0, 8))}
        placeholder="----"
        autoComplete="one-time-code"
        onEnter={onVerify}
        centered
        mono
      />
      {error && <ErrorText>{error}</ErrorText>}
      {info && <InfoText>{info}</InfoText>}
      <div className="mt-6">
        <PrimaryButton loading={loading} onClick={onVerify}>
          {loading ? '验证中…' : (signupInProgress ? '完成登记 · 进入房间' : '进入房间')}
        </PrimaryButton>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <button
          onClick={onBack}
          className="hover:opacity-80 transition-opacity"
          style={{ color: '#6b7ca8' }}
        >
          ← 换个身份
        </button>
        <button
          onClick={onResend}
          disabled={cooldown > 0 || loading}
          className="transition-opacity disabled:opacity-40"
          style={{ color: cooldown > 0 ? '#4c4878' : '#a78bfa' }}
        >
          {cooldown > 0 ? `重发 (${cooldown}s)` : '重新发送'}
        </button>
      </div>
    </>
  );
}

// 保留 requestOTPByEmail 以备后续使用（当前 UI 未直接调用）
void requestOTPByEmail;

// ── 共享小组件 ─────────────────────────────────────────────

const Label = ({ children }: { children: ReactNode }) => (
  <label className="block text-xs mb-2 tracking-wider" style={{ color: '#c8c2e0' }}>
    {children}
  </label>
);

interface TextInputProps {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'email';
  onEnter?: () => void;
  centered?: boolean;
  mono?: boolean;
}

const TextInput = forwardRef(
  (
    { type, value, onChange, placeholder, autoComplete, inputMode, onEnter, centered, mono }: TextInputProps,
    ref: ForwardedRef<HTMLInputElement>
  ) => {
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter();
      }
    };
    const className = [
      'w-full px-4 py-3 rounded-lg text-sm outline-none transition-colors',
      'focus:border-violet-400',
      centered ? 'text-center' : '',
      mono ? 'font-mono tracking-[0.4em] text-lg' : '',
    ].join(' ');
    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={className}
        style={{
          background: 'rgba(124,58,237,0.08)',
          border: '1px solid rgba(196,181,253,0.22)',
          color: '#f5e6ff',
        }}
      />
    );
  }
);
TextInput.displayName = 'LoginTextInput';

const ErrorText = ({ children }: { children: ReactNode }) => (
  <motion.p
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    className="mt-3 text-xs leading-relaxed whitespace-pre-wrap"
    style={{ color: '#fca5a5' }}
  >
    {children}
  </motion.p>
);

const InfoText = ({ children }: { children: ReactNode }) => (
  <motion.p
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    className="mt-3 text-xs leading-relaxed"
    style={{ color: '#86efac' }}
  >
    {children}
  </motion.p>
);

const PrimaryButton = ({
  loading,
  onClick,
  children,
}: {
  loading: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <motion.button
    whileHover={{ scale: loading ? 1 : 1.01 }}
    whileTap={{ scale: loading ? 1 : 0.98 }}
    disabled={loading}
    onClick={onClick}
    className="w-full py-3 rounded-lg text-sm font-medium disabled:opacity-60 transition-opacity"
    style={{
      background: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4f46e5)',
      boxShadow: '0 4px 22px rgba(124,58,237,0.38)',
      color: '#fff',
    }}
  >
    {children}
  </motion.button>
);
