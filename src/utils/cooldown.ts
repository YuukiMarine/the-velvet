/**
 * 羁绊里的冷却（第 32 批 · 10-26 用户拍板缩短）：COOP 被拒 / 解除、好友被拒 / 解除。
 *
 * 冷却到期时间是当时按旧天数算好写进记录里的（re_request_after / re_link_after）。
 * 天数缩短以后，按「拒绝 / 解除的那一刻（responded_at）+ 现在的天数」再算一遍、和写着的取早的——
 * 已经在冷却里的人也马上按新规则来，不用等旧的那一周。记录里没写冷却 = 没有冷却。
 */
export const effectiveCooldownUntil = (
  stored: Date | string | null | undefined,
  respondedAt: Date | string | null | undefined,
  days: number,
): Date | null => {
  const s = stored ? new Date(stored).getTime() : NaN;
  if (!Number.isFinite(s)) return null;
  const r = respondedAt ? new Date(respondedAt).getTime() + days * 86400000 : NaN;
  return new Date(Number.isFinite(r) ? Math.min(s, r) : s);
};

/** 「还要多久」：一天以上写天，一天以内写小时（报错文案用：「请 5 小时后再试」） */
export const waitText = (until: Date, now: number = Date.now()): string => {
  const ms = Math.max(0, until.getTime() - now);
  if (ms >= 86400000) return `${Math.ceil(ms / 86400000)} 天后`;
  return `${Math.max(1, Math.ceil(ms / 3600000))} 小时后`;
};
