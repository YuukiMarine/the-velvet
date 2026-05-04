import { pb, cloudEnabled, getUserId } from './pocketbase';
import type { RecordModel } from 'pocketbase';

/** 简单的邮箱格式校验 */
export const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

/** UserID 格式校验：3-18 位小写字母 / 数字 / 首尾字母数字，中间允许 ._- */
export const isValidUserId = (userId: string): boolean => {
  const v = userId.trim();
  if (v.length < 3 || v.length > 18) return false;
  return /^[a-z0-9]([a-z0-9._-]{1,16})[a-z0-9]$/.test(v);
};

/** 判断输入是邮箱还是 UserID */
export const looksLikeEmail = (identity: string): boolean => identity.includes('@');

/**
 * 从 PocketBase ClientResponseError 中检查字段级错误码。
 */
export const hasErrorCode = (err: unknown, ...codes: string[]): boolean => {
  const anyErr = err as {
    status?: number;
    data?: unknown;
    response?: { data?: unknown };
  };
  if (anyErr?.status !== 400) return false;

  const candidates: unknown[] = [
    (anyErr?.data as { data?: unknown })?.data,
    anyErr?.response?.data,
    anyErr?.data,
  ];

  for (const block of candidates) {
    if (!block || typeof block !== 'object') continue;
    for (const v of Object.values(block as Record<string, unknown>)) {
      if (v && typeof v === 'object' && 'code' in v) {
        const code = (v as { code?: unknown }).code;
        if (typeof code === 'string' && codes.includes(code)) return true;
      }
    }
  }
  return false;
};

/** 读取 PB 错误里第一条字段级 message，用于 UI 友好提示。会带上字段名提示用户 */
export const firstFieldMessage = (err: unknown): string | null => {
  const anyErr = err as { data?: unknown; response?: { data?: unknown } };
  const candidates: unknown[] = [
    (anyErr?.data as { data?: unknown })?.data,
    anyErr?.response?.data,
    anyErr?.data,
  ];
  for (const block of candidates) {
    if (!block || typeof block !== 'object') continue;
    for (const [fieldName, v] of Object.entries(block as Record<string, unknown>)) {
      if (v && typeof v === 'object' && 'message' in v) {
        const message = (v as { message?: unknown }).message;
        if (typeof message === 'string' && message) {
          // 带上字段名，方便用户知道是哪一项超限
          return `[${fieldName}] ${message}`;
        }
      }
    }
  }
  return null;
};

// ── SDK 方法调用的 fallback（兼容 SDK 安装后可能被 PWA 缓存 / 类型与运行时错配） ──

/** 发起 OTP：优先用 SDK 方法，缺失时回落到 raw HTTP */
const callRequestOTP = async (email: string): Promise<string> => {
  if (!pb) throw new Error('云同步未配置');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = pb.collection('users') as any;
  if (typeof svc.requestOTP === 'function') {
    const result = await svc.requestOTP(email);
    const otpId = (result as { otpId?: string })?.otpId;
    if (!otpId) throw new Error('服务器未返回 OTP id');
    return otpId;
  }
  // 回落：直接调 PB 的 HTTP 端点
  const result = await pb.send<{ otpId: string }>(
    '/api/collections/users/request-otp',
    { method: 'POST', body: { email } },
  );
  if (!result?.otpId) throw new Error('服务器未返回 OTP id');
  return result.otpId;
};

/** OTP 登录：同上，SDK 缺失时回落到 raw HTTP */
const callAuthWithOTP = async (otpId: string, code: string): Promise<RecordModel> => {
  if (!pb) throw new Error('云同步未配置');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = pb.collection('users') as any;
  if (typeof svc.authWithOTP === 'function') {
    const authData = await svc.authWithOTP(otpId, code);
    return (authData as { record: RecordModel }).record;
  }
  const result = await pb.send<{ token: string; record: RecordModel }>(
    '/api/collections/users/auth-with-otp',
    { method: 'POST', body: { otpId, password: code } },
  );
  pb.authStore.save(result.token, result.record);
  return result.record;
};

const escapePbString = (s: string): string => s.replace(/"/g, '\\"');

/**
 * 生成随机密码（用于 OTP 注册时填充 password 字段——用户永远不会感知）。
 * 长度 16 字符：大小写字母 / 数字 / 后缀 `Aa1!`。
 * 在 8-72 的 PB 默认限额内，同时避开个别用户把 max 设小（比如 20）的情况。
 */
const generateRandomPassword = (): string => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
  return out + 'Aa1!';
};

/**
 * 把 UserID 解析为 email（用于 OTP 登录时，允许用户输入 UserID）。
 *
 * 解析策略（依次尝试）：
 *  1. 输入含 `@` → 直接当邮箱
 *  2. 调 PB JSVM 自定义端点 `/api/velvet/resolve-email`（由 pb_hooks 提供，
 *     无视 List Rule 限制直接按 username 查 email）—— 推荐部署方式
 *  3. 回落：调 users 集合的 getList（若已登录，或 List Rule 对匿名开放才能成功）
 *  4. 全部失败 → 抛出引导错误，让用户改用邮箱或切到「密码」Tab
 */
export const resolveIdentityToEmail = async (identity: string): Promise<string> => {
  const normalized = identity.trim().toLowerCase();
  if (!normalized) throw new Error('请输入 UserID 或邮箱');
  if (looksLikeEmail(normalized)) {
    if (!isValidEmail(normalized)) throw new Error('邮箱格式不正确');
    return normalized;
  }
  if (!isValidUserId(normalized)) {
    throw new Error('UserID 格式不正确（3-18 位小写字母 / 数字 / ._-）');
  }
  if (!pb) throw new Error('云同步未配置');

  // 优先走自定义 hook 端点
  try {
    const result = await pb.send<{ email?: string }>('/api/velvet/resolve-email', {
      method: 'POST',
      body: { identity: normalized },
    });
    if (result?.email) return result.email;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) {
      // 明确"查过确实没这人" —— 直接告诉用户
      throw new Error('没找到这个 UserID');
    }
    // 404 以外（比如 404 hook 本身没部署时 PB 会返回什么？实际是 404，
    // 所以走不到这里。这里留作"网络 / 服务器错误"兜底）
    console.warn('[velvet-auth] /api/velvet/resolve-email failed, falling back', err);
  }

  // 回落：List 查询（仅在 List Rule 公开 或 当前已登录时成功）
  try {
    const result = await pb.collection('users').getList(1, 1, {
      filter: `username = "${escapePbString(normalized)}"`,
      fields: 'email,username',
      skipTotal: true,
    });
    const rec = result.items?.[0];
    const email = rec ? (rec as unknown as { email?: string }).email : undefined;
    if (email) return email;
  } catch (err) {
    console.warn('[velvet-auth] list fallback failed', err);
  }

  throw new Error('验证码登录请填邮箱；或切到「密码」Tab 用 UserID 登录（需要 PB 端部署 resolve-email hook 才能支持 UserID 收码）');
};

// ── 登记（仅"验证码"一个路径，UserID 是可选项） ───────────────

export interface SignupWithOTPInput {
  email: string;
  /** 可选：传入则写进 username 字段；不传则留空等用户稍后在设置里补 */
  userId?: string;
}

/**
 * 创建一条 users 记录 + 发 OTP，底层工具函数。
 * - 用户永远不会接触到那串随机密码；后续可在「账号管理 → 邮件重置」里设一个真密码
 * - userId 可省略：验证码流程允许"先登记、后补 UserID"
 */
export const signUpWithOTP = async (input: SignupWithOTPInput): Promise<{ otpId: string }> => {
  if (!cloudEnabled || !pb) throw new Error('云同步未配置');
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error('邮箱格式不正确');

  const pwd = generateRandomPassword();
  const payload: Record<string, unknown> = {
    email,
    password: pwd,
    passwordConfirm: pwd,
    emailVisibility: false,
    total_lv: 0,
  };

  if (input.userId) {
    const username = input.userId.trim().toLowerCase();
    if (!isValidUserId(username)) throw new Error('UserID 应为 3-18 位小写字母 / 数字 / ._-');
    payload.username = username;
  }

  try {
    await pb.collection('users').create(payload);
  } catch (err) {
    if (hasErrorCode(err, 'validation_not_unique')) {
      throw new Error('邮箱或 UserID 已被占用');
    }
    if (hasErrorCode(err, 'validation_invalid_email')) {
      throw new Error('邮箱格式不正确');
    }
    const msg = firstFieldMessage(err);
    throw new Error(msg || (err instanceof Error ? err.message : '登记失败'));
  }

  // 发验证码（带 SDK fallback，见 callRequestOTP）
  try {
    const otpId = await callRequestOTP(email);
    return { otpId };
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : '验证码发送失败');
  }
};

/**
 * 一步式"登录或登记"：把登录/注册合一。
 *
 *  · 输入邮箱：先尝试 signUpWithOTP 建新账号；若邮箱已存在（validation_not_unique）
 *              则回落到 requestOTP 给老用户发码。
 *  · 输入 UserID：必须解析为已存在的邮箱（否则抛"没找到这个 UserID"）
 *
 * ⚠️ 历史坑：之前版本依赖 `requestOTP` 对不存在邮箱返回 404 来触发 signUp，
 *    但 PB 为了防止邮箱枚举攻击，对不存在邮箱**返回 200**（假装成功），
 *    导致新用户流程完全断了（0 个新 user 记录）。
 *    现在用 `create` 的 `validation_not_unique` 作为"邮箱是否已存在"的判据
 *    —— 这是 PB 的确定性行为，可靠得多。
 *
 * 老的 `requestLoginOTP` 保留给不需要自动登记的路径。
 */
export const requestLoginOrSignupOTP = async (
  identity: string,
): Promise<{ otpId: string; wasSignup: boolean }> => {
  if (!cloudEnabled || !pb) throw new Error('云同步未配置');
  const normalized = identity.trim().toLowerCase();
  if (!normalized) throw new Error('请输入 UserID 或邮箱');

  const isEmailInput = looksLikeEmail(normalized);
  if (!isEmailInput && !isValidUserId(normalized)) {
    throw new Error('UserID 格式不正确（3-18 位小写字母 / 数字 / ._-）');
  }
  if (isEmailInput && !isValidEmail(normalized)) {
    throw new Error('邮箱格式不正确');
  }

  // UserID 输入：只可能是老用户，解析到邮箱后直接走 requestOTP
  if (!isEmailInput) {
    const email = await resolveIdentityToEmail(normalized);
    const otpId = await callRequestOTP(email);
    return { otpId, wasSignup: false };
  }

  // 邮箱输入：先试注册；邮箱已存在 → 回落给老用户发 OTP
  try {
    const { otpId } = await signUpWithOTP({ email: normalized });
    return { otpId, wasSignup: true };
  } catch (err) {
    // signUpWithOTP 在邮箱重复时会抛 Error('邮箱或 UserID 已被占用')（见其内部实现）
    if (err instanceof Error && /已被占用|not.?unique/i.test(err.message)) {
      // 邮箱已注册 → 老用户登录
      const otpId = await callRequestOTP(normalized);
      return { otpId, wasSignup: false };
    }
    throw err;
  }
};

// ── 注册 · 密码（备选） ─────────────────────────────────────

export interface SignupWithPasswordInput {
  email: string;
  userId: string;
  password: string;
  passwordConfirm: string;
}

/**
 * 用"密码"方式注册：创建 users 记录 → 立即用密码登录 → 顺便发一封验证邮件。
 */
export const signUpWithPassword = async (input: SignupWithPasswordInput): Promise<RecordModel> => {
  if (!cloudEnabled || !pb) throw new Error('云同步未配置');
  const email = input.email.trim().toLowerCase();
  const username = input.userId.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error('邮箱格式不正确');
  if (!isValidUserId(username)) throw new Error('UserID 应为 3-18 位小写字母 / 数字 / ._-');
  if (input.password.length < 8) throw new Error('密码至少 8 位');
  if (input.password !== input.passwordConfirm) throw new Error('两次密码不一致');

  try {
    await pb.collection('users').create({
      email,
      username,
      password: input.password,
      passwordConfirm: input.passwordConfirm,
      emailVisibility: false,
      total_lv: 0,
    });
  } catch (err) {
    if (hasErrorCode(err, 'validation_not_unique')) {
      throw new Error('邮箱或 UserID 已被占用');
    }
    const msg = firstFieldMessage(err);
    throw new Error(msg || (err instanceof Error ? err.message : '注册失败'));
  }

  const authData = await pb.collection('users').authWithPassword(email, input.password);
  try {
    await pb.collection('users').requestVerification(email);
  } catch (err) {
    console.warn('[velvet-auth] signUpWithPassword: requestVerification failed (not fatal)', err);
  }
  return authData.record;
};

/** 给某邮箱重新发一封验证邮件 */
export const requestVerification = async (email: string): Promise<void> => {
  if (!pb) throw new Error('云同步未配置');
  await pb.collection('users').requestVerification(email.trim().toLowerCase());
};

// ── 登录 · 密码（identity 可为 UserID 或 Email） ─────────────

/**
 * 密码登录。identity 会按 `unique identity fields` 自动匹配（email / username）。
 *
 * 常见错误的友好提示：
 *  - 旧用户用邮箱 OTP 注册的，密码是随机生成的——他们应该走"验证码"Tab，
 *    或先用"忘记密码"重置，才能用密码登录。下面的错误文案会提示这一点。
 */
export const loginWithPassword = async (
  identity: string,
  password: string,
): Promise<RecordModel> => {
  if (!cloudEnabled || !pb) throw new Error('云同步未配置');
  const id = identity.trim().toLowerCase();
  if (!id) throw new Error('请输入 UserID 或邮箱');
  if (!password) throw new Error('请输入密码');
  try {
    const authData = await pb.collection('users').authWithPassword(id, password);
    return authData.record;
  } catch (err) {
    if ((err as { status?: number })?.status === 400) {
      throw new Error('账号或密码不正确。\n若你之前仅用过邮箱验证码登录，密码是系统随机生成的——请切到「验证码」Tab，或用"忘记密码"先重置。');
    }
    throw err;
  }
};

// ── 登录 · 验证码 ─────────────────────────────────────────

/**
 * 请求登录验证码。identity 可以是邮箱或 UserID（会尝试 UserID→email 解析）。
 * 若 UserID 解析失败（PB List Rule 不允许公开搜索），会抛带有引导的错误。
 */
export const requestLoginOTP = async (identity: string): Promise<string> => {
  const email = await resolveIdentityToEmail(identity);
  return await requestOTPByEmail(email);
};

/** 邮箱 OTP 发送（内部工具，识别 404 = 未注册） */
const requestOTPByEmail = async (email: string): Promise<string> => {
  if (!cloudEnabled || !pb) throw new Error('云同步未配置');
  try {
    return await callRequestOTP(email);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) {
      throw new Error('该账号尚未注册，请先"新客人登记"');
    }
    throw err;
  }
};

/** 兼容旧 import 名（注册流程用） */
export const requestOTP = requestOTPByEmail;

/** 提交验证码完成登录 */
export const verifyOTP = async (otpId: string, code: string): Promise<RecordModel> => {
  if (!cloudEnabled || !pb) throw new Error('云同步未配置');
  const trimmed = code.trim();
  if (!trimmed) throw new Error('请输入验证码');
  try {
    return await callAuthWithOTP(otpId, trimmed);
  } catch (err) {
    if ((err as { status?: number })?.status === 400) {
      throw new Error('验证码不正确或已过期');
    }
    throw err;
  }
};

// ── 忘记密码 ────────────────────────────────────────────────

/** 向邮箱发送"重置密码"链接 */
export const requestPasswordReset = async (identity: string): Promise<void> => {
  if (!pb) throw new Error('云同步未配置');
  const email = await resolveIdentityToEmail(identity);
  await pb.collection('users').requestPasswordReset(email);
};

// ── 注销 / profile 更新 ──────────────────────────────────────

/** 登出（清除本地 token，不调用远程） */
export const logout = (): void => {
  pb?.authStore.clear();
};

/** 更新当前用户的 profile 字段 */
export const updateProfile = async (
  patch: Partial<{
    nickname: string;
    total_lv: number;
    attribute_names: Record<string, string>;
    attribute_levels: Record<string, number>;
    attribute_level_titles: Record<string, string[]>;
    attribute_points: Record<string, number>;
  }>,
): Promise<RecordModel | null> => {
  if (!pb || !pb.authStore.isValid) return null;
  const userId = getUserId();
  if (!userId) return null;
  return await pb.collection('users').update(userId, patch);
};

/**
 * 首次设置 / 修改 UserID（PB 的 username 字段）。
 * 冷却：PB 默认不给同一 username 加锁，但建议业务上只做 1 次。
 * 若撞到重复，会抛 "UserID 已被占用"。
 */
export const setOrChangeUserId = async (newUserId: string): Promise<RecordModel> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const id = getUserId();
  if (!id) throw new Error('用户信息缺失');
  const normalized = newUserId.trim().toLowerCase();
  if (!isValidUserId(normalized)) throw new Error('UserID 应为 3-18 位小写字母 / 数字 / ._-');
  try {
    const updated = await pb.collection('users').update(id, { username: normalized });
    pb.authStore.save(pb.authStore.token, updated);
    return updated;
  } catch (err) {
    if (hasErrorCode(err, 'validation_not_unique')) {
      throw new Error('这个 UserID 已被占用');
    }
    const msg = firstFieldMessage(err);
    throw new Error(msg || (err instanceof Error ? err.message : '更新失败'));
  }
};

/**
 * 修改密码（需要旧密码）。用于"我知道当前密码，直接改"场景。
 * 旧密码未知（例如 OTP 注册的老账号）请走 `requestPasswordReset`。
 */
export const changePasswordWithOld = async (
  oldPassword: string,
  newPassword: string,
  newPasswordConfirm: string,
): Promise<RecordModel> => {
  if (!pb || !pb.authStore.isValid) throw new Error('未登录');
  const id = getUserId();
  if (!id) throw new Error('用户信息缺失');
  if (newPassword.length < 8) throw new Error('新密码至少 8 位');
  if (newPassword !== newPasswordConfirm) throw new Error('两次新密码不一致');
  try {
    const updated = await pb.collection('users').update(id, {
      oldPassword,
      password: newPassword,
      passwordConfirm: newPasswordConfirm,
    });
    return updated;
  } catch (err) {
    if ((err as { status?: number })?.status === 400) {
      const msg = firstFieldMessage(err);
      throw new Error(msg || '旧密码不正确');
    }
    throw err;
  }
};
