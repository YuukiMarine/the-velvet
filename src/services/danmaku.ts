/**
 * 治疗终端 · 在线弹幕（F3.5，先审后发）。
 *
 * 设计：
 *   - 展示：终端漂浮其他用户的鼓励语（官方精选种子池 + 云端已过审弹幕）。
 *   - 投稿：完成终端任务攒到「鼓励机会」(settings.terminalDanmakuTokens) 才能发；
 *     新投稿 status='pending'，经 PB Admin 人工过审 → 'approved' 才公开。
 *   - 匿名：⚠️ PocketBase 的 List/View 规则是「记录级」不是「字段级」——能读这条记录就能读它
 *     的全部非隐藏字段（含 createdBy，还能 expand 出用户名）。所以匿名**不能靠前端不显示**，
 *     必须把 createdBy 设为 PB 的 **Hidden field**（仅 superuser/Admin 可见，API 不返回给普通客户端）。
 *   - 离线兜底：无云 / 集合未建 / 出错 → 返回空，由 DanmakuField 退回种子池。
 *
 * ── PocketBase 集合 `danmaku` schema（在 PB Admin 手动建立）──
 *   text        text     required, max 30
 *   theme       select   (blue / yellow / red)
 *   status      select   (pending / approved / rejected)   default pending
 *   isSeed      bool
 *   reportCount number
 *   createdBy   relation → users   (cascade delete) ★必须勾 Hidden（否则去匿名）
 *   approvedAt  date     optional（过审时间，可人工或 hook 填）
 *
 *   API 规则（纯规则即可实现「先审后发」，无需 hook）。
 *   ⚠️ 字段引用语法随 PB 版本不同：v0.23+ 用 @request.body.*，v0.22 及更早用 @request.data.*。
 *      （报错 failed to resolve field "@request.data.status" = 你在 v0.23+，改用 @request.body）
 *     List/View rule : status = "approved"
 *     Create rule    : @request.auth.id != "" && @request.body.status = "pending" && @request.body.createdBy = @request.auth.id
 *     Update/Delete  : （锁定 = 仅 Admin；过审在后台点 approved）
 *   ⚠️ PB 规则三态：锁定(null)=仅 Admin（安全）；空字符串("")=对所有人公开无过滤（会泄漏
 *      pending/rejected + createdBy！）；表达式=按条件。务必让 List/View 是 status="approved" 而非空。
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
export const DANMAKU_MAX_LEN = 30;

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

/** 主题 → 弹幕频道标签（蓝=blue / 黄=yellow / 红·粉·自定义=red，与终端频道分桶一致） */
export const danmakuThemeOf = (theme?: ThemeType): DanmakuTheme =>
  theme === 'blue' ? 'blue' : theme === 'yellow' ? 'yellow' : 'red';

/**
 * 拉取已过审弹幕文本。无云 / 集合未建 / 权限未配 / 出错 → 返回空（由 UI 退回种子池）。
 */
export const listApprovedDanmaku = async (limit = 60): Promise<string[]> => {
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

/**
 * 投稿一条弹幕。需登录。status 由 Create 规则强制为 pending（先审后发），
 * createdBy 绑定当前用户（规则校验，防伪冒）。抛错由调用方提示、且不消费 token。
 */
export const submitDanmaku = async (text: string, theme: DanmakuTheme): Promise<void> => {
  if (!pb || !pb.authStore.isValid) throw new Error('登录后才能把鼓励发给其他人');
  const me = getUserId();
  if (!me) throw new Error('用户信息缺失');
  const v = validateDanmaku(text);
  if (!v.ok) throw new Error(v.reason ?? '内容不合法');
  await pb.collection('danmaku').create({
    text: text.trim(),
    theme,
    status: 'pending',
    isSeed: false,
    reportCount: 0,
    createdBy: me,
  });
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
