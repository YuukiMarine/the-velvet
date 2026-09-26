/**
 * 屏蔽词筛查（v2.7.0.6 第 6 项；第 7 轮重写）：给会挂到名片上、给好友看的文字过一道——
 * 目标那一句、挂上去的宣告卡标题，顺带一起进步的约定标题和留言。
 *
 * 只做「一层词库」：挡住最明显的脏话、色情赌毒、诈骗引流和联系方式就够；
 * 内容只有互相加了好友的人看得到，真出问题还有「解除好友」。
 *
 * 第一版把标点和空白全去掉再做子串匹配，误杀一片：`.com` 变成 com 命中「commit」，`line:` 变成 line
 * 命中「online」「deadline」，`他妈` 命中「其他妈妈们」，`大麻` 命中「大麻烦」，`刷单` 命中「刷单词」。
 * 现在分两路：
 *   · 链接 / 联系方式：在保留标点的文本上用正则判断，拉丁词加词边界；
 *   · 中文脏话等：在去掉空白标点的文本上做子串匹配（「傻 逼」也要拦），但每个词可带前后字例外。
 * 命中的提示语以「稍微调整下措辞吧」开头，调用方直接显示即可；不在后台静默处理。
 */

/** 去空白 / 标点 / 零宽字符（中文词表用）；全角→半角、小写 */
const PUNCT = /[\s​-‏⁠﻿\p{P}\p{S}]/gu;

/** 归一：全角→半角（NFKC）、小写、去空白 / 标点 / 零宽字符 */
export function normalizeForAudit(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(PUNCT, '');
}

/** 只做全角→半角与小写，标点留着（链接和联系方式要靠标点认） */
const fold = (text: string): string => text.normalize('NFKC').toLowerCase();

/**
 * 链接 / 联系方式 / 引流。iOS 15 不支持后行断言，所以「数字前不能是数字」用 (^|\D) 写。
 * 域名后缀要求前面有点、后面是结尾 / 空白 / 斜杠 / 问号，「commit」「community」都不会命中。
 */
const CONTACT_PATTERNS: readonly RegExp[] = [
  /https?:\/\//,
  /\bwww\./,
  /\.(com|cn|net|org|xyz|top|cc|me|io|co|vip|club|site|link|shop)(?=[\s/?#]|$)/,
  /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/,
  /(^|\D)1[3-9]\d{9}(?!\d)/,          // 大陆手机号
  /(^|\D)\d{9,}(?!\d)/,               // 九位以上的数字串（QQ 号之类）
  /\b(wechat|telegram|whatsapp)\b/,
  /\bvx\s*[:：]/,
  /\bqq\s*[:：]\s*\d/,
  /\bline\s*[:：]\s*\S/,              // 「line: xxx」；「online」「deadline」没有冒号
  /加v(?![a-z])/,
];

/** 中文引流词：在去标点文本上做子串 */
const CONTACT_WORDS: readonly string[] = [
  '加微信', '微信号', '微信群', 'v信', 'qq群', 'q群', '电报群', '加群', '进群',
  '免费领', '领红包', '点击链接', '扫码', '二维码', '私聊我', '私信我', '手机号',
];

/**
 * 明显不该出现在名片上的：脏话 / 色情 / 赌博 / 毒品 / 枪爆 / 诈骗。
 * notBefore / notAfter：命中处前一个字 / 后一个字是这些时不算（都是已知的正常词）。
 */
interface BlockedRule { w: string; notBefore?: string; notAfter?: string }
const BLOCKED_RULES: readonly BlockedRule[] = [
  { w: '傻逼' },
  { w: '妈的', notBefore: '妈' },       // 妈妈的手
  { w: '他妈', notBefore: '其', notAfter: '妈' }, // 其他妈妈们
  { w: '你妈', notAfter: '妈' },        // 你妈妈
  { w: '尼玛' }, { w: '操你' }, { w: '草泥马' }, { w: '艹你' }, { w: '滚你' }, { w: '狗屎' },
  { w: '贱人' }, { w: '婊子' }, { w: '去死', notAfter: '亡' }, // 去死亡谷
  { w: '妓女' }, { w: '卖淫' }, { w: '嫖娼' }, { w: '色情' }, { w: '裸聊' }, { w: '约炮' },
  { w: '一夜情' }, { w: '援交' }, { w: '黄片' }, { w: 'av女' }, { w: '成人片' },
  { w: '赌博' }, { w: '博彩' }, { w: '六合彩' }, { w: '赌场' }, { w: '网赌' },
  { w: '毒品' }, { w: '冰毒' }, { w: '大麻', notAfter: '烦' }, // 大麻烦
  { w: '海洛因' }, { w: '摇头丸' }, { w: '吸毒' }, { w: '贩毒' },
  { w: '枪支' }, { w: '买枪' }, { w: '炸弹' }, { w: '炸药' },
  { w: '代孕' }, { w: '开发票' }, { w: '刷单', notAfter: '词' }, // 刷单词
  { w: '兼职刷' }, { w: '高利贷' }, { w: '裸贷' }, { w: '传销' }, { w: '洗钱' }, { w: '套现' }, { w: '代考' },
];

/** 拉丁字母的脏话要词边界：sb 不能命中「妈妈们」里的任何东西，也不能命中「absb」 */
const BLOCKED_PATTERNS: readonly RegExp[] = [
  /\bsb\b/,
  /傻b(?![a-z])/,
];

/** 中文词在去标点文本里的命中（带前后字例外）；一个词可能出现多次，任一处成立即命中 */
function hitsRule(n: string, r: BlockedRule): boolean {
  let from = 0;
  for (;;) {
    const i = n.indexOf(r.w, from);
    if (i < 0) return false;
    const before = i > 0 ? n[i - 1] : '';
    const after = n[i + r.w.length] ?? '';
    const excused = (!!r.notBefore && before === r.notBefore) || (!!r.notAfter && after === r.notAfter);
    if (!excused) return true;
    from = i + 1;
  }
}

export type AuditKind = 'contact' | 'blocked';
export type AuditResult = { ok: true } | { ok: false; kind: AuditKind; reason: string };

export const AUDIT_REASON: Record<AuditKind, string> = {
  contact: '稍微调整下措辞吧：这里不能放链接、联系方式或引流内容',
  blocked: '稍微调整下措辞吧：有个词放在名片上不太合适',
};

/** 过一道词库。空文本算通过（长度另外限） */
export function auditText(text: string): AuditResult {
  const f = fold(text);
  if (!f.trim()) return { ok: true };
  if (CONTACT_PATTERNS.some(re => re.test(f))) return { ok: false, kind: 'contact', reason: AUDIT_REASON.contact };
  const n = normalizeForAudit(text);
  if (CONTACT_WORDS.some(w => n.includes(w))) return { ok: false, kind: 'contact', reason: AUDIT_REASON.contact };
  if (BLOCKED_PATTERNS.some(re => re.test(f))) return { ok: false, kind: 'blocked', reason: AUDIT_REASON.blocked };
  if (BLOCKED_RULES.some(r => hitsRule(n, r))) return { ok: false, kind: 'blocked', reason: AUDIT_REASON.blocked };
  return { ok: true };
}
