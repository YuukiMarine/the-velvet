/**
 * stagnationHint — 黑猫「递刀」的客户端停滞检测（TASKS_MERGE_PRD §4.4 / D6）。
 *
 * 纯关键词命中，零 LLM 参与：猫的聊天/倾诉能力不背任何新职责，
 * 命中只负责在聊天下方亮一枚本地 chip（「要吾辈把它拆成小步吗？」），
 * 点击才走确定性拆解管线（decomposeWishAI → BIG DEAL 确认卡）。
 * 词表移植自原 F3 终端四型停滞诊断（inferDiagnosis）。
 */

const hasAny = (text: string, words: string[]) => words.some((w) => text.includes(w));

const EXHAUSTED = ['没力气', '没劲', '动不了', '不想动', '疲惫', '好累', '很累', '麻木', '崩溃', '撑不住'];
const LOST = ['不知道先', '不知道要', '不知道该', '不知道做', '选哪个', '太多了', '很乱', '脑子乱', '无从下手'];
const PRESSURE = ['截止', 'ddl', 'deadline', '汇报', '作业', '考试', '来不及', '好急', '压力好大', '写不下去', '做不下去', '卡住'];
const LONGTERM = ['一直想', '想学', '想开始', '停了很久', '坚持不下', '拖了'];

/** 是否像一句「卡住了」的话（够长 + 命中任一族） */
export const detectStagnation = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (t.length < 4) return false;
  return hasAny(t, EXHAUSTED) || hasAny(t, LOST) || hasAny(t, PRESSURE) || hasAny(t, LONGTERM);
};

/** 从倾诉原文里切出一个可用的大事标题（首个分句，截 24 字） */
export const stagnationTitle = (text: string): string => {
  const first = text.trim().replace(/\s+/g, ' ').split(/[。！？!?；;\n，,]/)[0] ?? text;
  return first.slice(0, 24) || '一件卡住的事';
};
