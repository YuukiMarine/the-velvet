/**
 * 治疗终端 · 在线弹幕（F3.5，先审后发）。
 *
 * 设计：
 *   - 展示：终端漂浮其他用户的鼓励语（官方精选种子池 + 云端已过审弹幕）。
 *   - 投稿：完成终端任务攒到「鼓励机会」(settings.terminalDanmakuTokens) 才能发；
 *     新投稿 status='pending'，经 PB Admin 人工过审 → 'approved' 才公开。
 *   - 匿名：**不存作者**最简单也最彻底——danmaku 集合不含任何指向用户的字段，天然匿名。
 *     （不要把 createdBy 设 Hidden 又在规则里引用它：PB 已知 bug #6201，规则引用 Hidden 字段会失效报 400。
 *      若日后要做按作者防滥用，应由 pb_hook 服务端写 createdBy，且规则不引用它。）
 *   - 离线兜底：无云 / 集合未建 / 出错 → 返回空，由 DanmakuField 退回种子池。
 *
 * ── PocketBase 集合 `danmaku` schema（在 PB Admin 手动建立）──
 *   text        text     required, max 30
 *   theme       select   (blue / yellow / red)
 *   status      select   (pending / approved / rejected)   default pending
 *   isSeed      bool
 *   reportCount number
 *   approvedAt  date     optional（过审时间，可人工填）
 *   （不需要 createdBy；匿名靠「不存作者」实现）
 *
 *   API 规则（纯规则即可实现「先审后发」，无需 hook）。
 *   ⚠️ 字段引用语法随 PB 版本不同：v0.23+ 用 @request.body.*，v0.22 及更早用 @request.data.*。
 *     List/View rule : status = "approved"
 *     Create rule    : @request.auth.id != "" && @request.body.status = "pending"
 *     Update/Delete  : （锁定 = 仅 Admin；过审在后台点 approved）
 *   ⚠️ PB 规则三态：锁定(null)=仅 Admin（安全）；空字符串("")=对所有人公开无过滤（会泄漏
 *      pending/rejected！）；表达式=按条件。务必让 List/View 是 status="approved" 而非空。
 *
 * ── 可选集合 `danmaku_reports`（举报兜底，配合 pb_hooks/danmaku.pb.js）──
 *   danmaku     relation → danmaku   required
 *   reason      text
 *   reporterId  relation → users
 *   唯一索引(unique): (danmaku, reporterId) —— ★必须，否则单人可刷多条举报强制下架任意内容
 *   Create rule : @request.auth.id != "" && @request.body.reporterId = @request.auth.id  (v0.22-: @request.data)
 */

import { pb, getUserId } from './pocketbase';
import type { ThemeType } from '@/types';

export type DanmakuTheme = 'blue' | 'yellow' | 'red';

/** 弹幕内容上限（短句，飘得动、读得完） */
export const DANMAKU_MAX_LEN = 20;
/** 同屏最大密度：再多就糊成一片，读不成句子 */
export const DANMAKU_MAX_ON_SCREEN = 50;
/** 投稿冷却：三天一条。与「有几次机会」是两个独立闸门 */
export const DANMAKU_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * 客户端轻量预过滤——真正的审核走 PB Admin「先审后发」，这里只挡掉最明显的脏内容、
 * 减少过审队列噪声。故意保持极简、不试图穷举。
 */
const BANNED = ['http://', 'https://', 'www.', '加微信', '加群', '免费领'];

export const validateDanmaku = (text: string): { ok: boolean; reason?: string } => {
  const t = text.trim();
  if (!t) return { ok: false, reason: '写点什么吧' };
  if ([...t].length > DANMAKU_MAX_LEN) return { ok: false, reason: `最多 ${DANMAKU_MAX_LEN} 字` };
  const lower = t.toLowerCase();
  if (BANNED.some(w => lower.includes(w.toLowerCase()))) return { ok: false, reason: '含有不允许的内容（链接 / 引流等）' };
  return { ok: true };
};

/** 主题 → 弹幕频道标签（蓝·粉=blue / 黄=yellow / 红·自定义=red，与频道分桶一致；
 *  粉自 FS2 起是 P3 的换色皮，弹幕跟着走蓝桶） */
export const danmakuThemeOf = (theme?: ThemeType): DanmakuTheme =>
  theme === 'blue' || theme === 'pink' ? 'blue' : theme === 'yellow' ? 'yellow' : 'red';

/**
 * 拉取已过审弹幕文本。无云 / 集合未建 / 权限未配 / 出错 → 返回空（由 UI 退回种子池）。
 */
export const listApprovedDanmaku = async (limit = DANMAKU_MAX_ON_SCREEN): Promise<string[]> => {
  if (!pb) return [];
  try {
    const res = await pb.collection('danmaku').getList(1, limit, {
      filter: 'status = "approved"',
      sort: '-created',
      requestKey: null,
    });
    return res.items
      .map(r => String((r as { text?: unknown }).text ?? '').trim())
      .filter(Boolean);
  } catch (err) {
    console.warn('[velvet-danmaku] listApproved failed', err);
    return [];
  }
};

/** 把 PocketBase 的 ClientResponseError 拆成可读的字段级原因，便于定位规则/字段没配对 */
const describePbError = (err: unknown): string => {
  const e = err as { status?: number; response?: { message?: string; data?: Record<string, { message?: string }> }; message?: string };
  const data = e?.response?.data;
  if (data && typeof data === 'object') {
    const parts = Object.entries(data).map(([k, v]) => (v?.message ? `${k}：${v.message}` : '')).filter(Boolean);
    if (parts.length) return parts.join('；');
  }
  if (e?.status === 403 || e?.status === 400) {
    return e?.response?.message || '后端拒绝了提交（多半是 danmaku 集合的 Create 规则或字段没配对）';
  }
  return e?.response?.message || e?.message || '发送失败';
};

/**
 * 投稿一条弹幕。需登录。**不存作者**（匿名：不写 createdBy），status='pending' 由 Create 规则
 * 强制（先审后发）。抛出可读的字段级错误，由调用方提示、且不消费 token。
 */
export const submitDanmaku = async (text: string, theme: DanmakuTheme): Promise<void> => {
  if (!pb || !pb.authStore.isValid) throw new Error('登录后才能把鼓励发给其他人');
  if (!getUserId()) throw new Error('用户信息缺失');
  const v = validateDanmaku(text);
  if (!v.ok) throw new Error(v.reason ?? '内容不合法');
  try {
    await pb.collection('danmaku').create({ text: text.trim(), theme, status: 'pending', isSeed: false, reportCount: 0 });
  } catch (err) {
    throw new Error(describePbError(err));
  }
};

/** 举报一条弹幕（兜底已通过内容；失败静默）。报表 UI 后续接，服务先就绪。 */
export const reportDanmaku = async (danmakuId: string, reason = ''): Promise<void> => {
  if (!pb || !pb.authStore.isValid) return;
  const me = getUserId();
  try {
    await pb.collection('danmaku_reports').create({ danmaku: danmakuId, reason, reporterId: me });
  } catch (err) {
    console.warn('[velvet-danmaku] report failed', err);
  }
};
