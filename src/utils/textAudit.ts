/**
 * 屏蔽词筛查（v2.7.0.6 第 6 项）：给会挂到名片上、给好友看的文字过一道——目标那一句、
 * 挂上去的宣告卡标题，顺带一起进步的约定标题和留言。
 *
 * 只做「一层词库」：先把文本归一（全角转半角、大小写、去空白与标点、去零宽字符），
 * 再看有没有包含词表里的任何一条。不试图穷举，挡住最明显的脏话、色情赌毒、诈骗引流和联系方式就够；
 * 内容只有互相加了好友的人看得到，真出问题还有「解除好友」。
 */

/** 链接 / 联系方式 / 引流：提示语单独一档 */
const CONTACT: readonly string[] = [
  'http://', 'https://', 'www.', '.com', '.cn/', '加微信', '微信号', '加v', 'v信', 'vx:', 'vx：', 'wechat',
  'qq群', 'q群', 'qq:', 'qq：', 'telegram', '电报群', 'whatsapp', 'line:', '加群', '进群', '免费领', '领红包',
  '点击链接', '扫码', '二维码', '私聊我', '私信我', '手机号',
];

/** 明显不该出现在名片上的：脏话 / 色情 / 赌博 / 毒品 / 枪爆 / 诈骗 */
const BLOCKED: readonly string[] = [
  '傻逼', '傻b', 'sb', '妈的', '他妈', '你妈', '尼玛', '操你', '草泥马', '艹你', '滚你', '狗屎', '贱人', '婊子', '去死',
  '妓女', '卖淫', '嫖娼', '色情', '裸聊', '约炮', '一夜情', '援交', '黄片', 'av女', '成人片',
  '赌博', '博彩', '六合彩', '赌场', '押注', '网赌',
  '毒品', '冰毒', '大麻', '海洛因', '摇头丸', '吸毒', '贩毒',
  '枪支', '买枪', '炸弹', '炸药',
  '代孕', '开发票', '刷单', '兼职刷', '高利贷', '裸贷', '传销', '洗钱', '套现', '代考', '枪手',
];

const PUNCT = /[\s​-‏⁠﻿\p{P}\p{S}]/gu;

/** 归一：全角→半角（NFKC）、小写、去空白 / 标点 / 零宽字符 */
export function normalizeForAudit(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(PUNCT, '');
}

/** 词表里的 http:// 这类本身带标点：也归一一遍再比 */
const CONTACT_N = CONTACT.map(normalizeForAudit).filter(Boolean);
const BLOCKED_N = BLOCKED.map(normalizeForAudit).filter(Boolean);

export type AuditResult = { ok: true } | { ok: false; reason: string };

/** 过一道词库。空文本算通过（长度另外限） */
export function auditText(text: string): AuditResult {
  const n = normalizeForAudit(text);
  if (!n) return { ok: true };
  if (CONTACT_N.some(w => n.includes(w))) return { ok: false, reason: '不能放链接、联系方式或引流内容' };
  if (BLOCKED_N.some(w => n.includes(w))) return { ok: false, reason: '含有不允许的内容，换个说法吧' };
  return { ok: true };
}
