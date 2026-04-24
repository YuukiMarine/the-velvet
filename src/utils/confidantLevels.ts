/**
 * 同伴（Confidant）等级 & 能力定义
 *
 * - 22 张大阿卡纳，每位用户每张牌只能绑定一人
 * - 亲密度 0–10，每级解锁不同能力
 * - 能力与牌面的 relatedAttribute 绑定
 *
 * 等级阈值（点数，升到该等级所需累计点数）：
 *   Lv 1: 0      Lv 6:  25
 *   Lv 2: 3      Lv 7:  35
 *   Lv 3: 7      Lv 8:  50
 *   Lv 4: 12     Lv 9:  70
 *   Lv 5: 18     Lv 10: 100
 */

import type { AttributeId, AttributeNames, ConfidantBuff, ConfidantBuffKind } from '@/types';
import { MAJOR_ARCANA, TAROT_BY_ID } from '@/constants/tarot';

/** 同伴战斗道具的数值常量（供 UI 与 buff 生成共用） */
export const CONFIDANT_HEAL_HP = 5;
export const CONFIDANT_RESTORE_SP = 5;
/** 同伴战斗道具的冷却（天）——上次使用后需要等 N 天才能再次使用 */
export const CONFIDANT_ITEM_CD_DAYS = 2;

/**
 * 判断道具是否仍在冷却中。
 * - itemUsedDate === undefined → 可用
 * - 上次使用距今 < CD 天数 → 冷却中（不可用）
 */
export function isItemOnCooldown(
  itemUsedDate: string | undefined,
  today: string,
  cooldownDays: number = CONFIDANT_ITEM_CD_DAYS,
): boolean {
  if (!itemUsedDate) return false;
  const last = new Date(itemUsedDate + 'T00:00:00').getTime();
  const now = new Date(today + 'T00:00:00').getTime();
  if (isNaN(last) || isNaN(now)) return false;
  const days = Math.floor((now - last) / 86400000);
  return days < cooldownDays;
}

/**
 * 每级累计所需点数（index = 目标等级）
 * v1 → 2026-04-20 上调：让升级更能承载时间 / 互动量
 *   旧： [0, 3, 7, 12, 18, 25, 35, 50, 70, 100, 100]
 *   新： [0, 4, 9, 16, 25, 36, 50, 70, 95, 125, 160]
 * 老档案的 intimacy 字段仍按存储值呈现，只是后续升级需要更多点。
 */
export const INTIMACY_THRESHOLDS = [0, 4, 9, 16, 25, 36, 50, 70, 95, 125, 160] as const;
export const MAX_INTIMACY = 10;

/** 等级称谓 */
export const INTIMACY_LABELS: Record<number, string> = {
  0: '初见',
  1: '初识',
  2: '熟面孔',
  3: '伙伴',
  4: '友人',
  5: '挚友',
  6: '知己',
  7: '羁绊',
  8: '共鸣',
  9: '灵魂伙伴',
  10: '圆满',
};

/** 22 张大阿卡纳中的有效 ID 列表（用于唯一性校验） */
export const MAJOR_ARCANA_IDS: string[] = MAJOR_ARCANA.map(c => c.id);

/** 由 arcanaId 获取对应属性（兜底 knowledge） */
export function getArcanaAttribute(arcanaId: string): AttributeId {
  const card = TAROT_BY_ID[arcanaId];
  return (card?.relatedAttribute ?? 'knowledge') as AttributeId;
}

/** 累计点数换算为等级（0..MAX_INTIMACY） */
export function pointsToLevel(totalPoints: number): number {
  let lv = 0;
  for (let i = 1; i <= MAX_INTIMACY; i++) {
    if (totalPoints >= INTIMACY_THRESHOLDS[i]) lv = i;
    else break;
  }
  return lv;
}

/** 当前等级距下一级所需累计点数；已满级返回 null */
export function pointsToNextLevel(totalPoints: number): { next: number; gap: number } | null {
  const lv = pointsToLevel(totalPoints);
  if (lv >= MAX_INTIMACY) return null;
  const next = INTIMACY_THRESHOLDS[lv + 1];
  return { next, gap: next - totalPoints };
}

/** 当前等级起点累计点数 */
export function levelBasePoints(lv: number): number {
  return INTIMACY_THRESHOLDS[Math.max(0, Math.min(lv, MAX_INTIMACY))];
}

/**
 * 依据 arcanaId / attribute / 亲密等级生成解锁的能力列表。
 * 每级追加时幂等（同 kind 只会有一份，按当前最高等级的数值计算）。
 *
 * title/description 会使用 attributeNames 生成用户命名的属性文本；
 * 如果未传入 attributeNames，则退化为默认中文名。
 */
const DEFAULT_ATTR_NAMES: AttributeNames = {
  knowledge: '知识',
  guts: '胆量',
  dexterity: '灵巧',
  kindness: '温柔',
  charm: '魅力',
};

export function buffsForLevel(
  arcanaId: string,
  intimacy: number,
  attributeNames?: AttributeNames,
  /** 可选：用户自选的能力属性；未传则退化为塔罗 relatedAttribute */
  skillAttribute?: AttributeId,
): ConfidantBuff[] {
  const attr = skillAttribute ?? getArcanaAttribute(arcanaId);
  const names = attributeNames ?? DEFAULT_ATTR_NAMES;
  const attrLabel = names[attr] ?? DEFAULT_ATTR_NAMES[attr];
  const card = TAROT_BY_ID[arcanaId];
  const name = card?.name ?? '同伴';
  const out: ConfidantBuff[] = [];

  // Lv 2：日常加点额外 +1（乘区外，每日仅生效一次）
  if (intimacy >= 2) {
    const v = intimacy >= 10 ? 2 : 1;
    out.push({
      id: 'daily_plus',
      kind: 'daily_plus',
      attribute: attr,
      value: v,
      unlockAtLevel: 2,
      title: `${name}的指引`,
      description: `每天首次为「${attrLabel}」加点时，额外 +${v} 点（乘区外，每日一次）`,
    });
  }
  // Lv 4：战斗回复道具 —— HP 回复
  if (intimacy >= 4) {
    out.push({
      id: 'battle_heal',
      kind: 'battle_heal',
      attribute: attr,
      value: CONFIDANT_HEAL_HP,
      unlockAtLevel: 4,
      title: `${name}的慰藉`,
      description: `战斗中使用一次，恢复 ${CONFIDANT_HEAL_HP} 点 HP（每 ${CONFIDANT_ITEM_CD_DAYS} 天限一次）`,
    });
  }
  // Lv 7：永久战斗伤害 +1（此属性技能）
  if (intimacy >= 7) {
    const v = intimacy >= 10 ? 2 : 1;
    out.push({
      id: 'damage_plus',
      kind: 'damage_plus',
      attribute: attr,
      value: v,
      unlockAtLevel: 7,
      title: `${name}的共鸣`,
      description: `「${attrLabel}」属性技能永久 +${v} 点固定伤害`,
    });
  }
  // Lv 10：额外 SP 恢复道具
  if (intimacy >= 10) {
    out.push({
      id: 'battle_sp',
      kind: 'battle_sp',
      attribute: attr,
      value: CONFIDANT_RESTORE_SP,
      unlockAtLevel: 10,
      title: `${name}的余韵`,
      description: `战斗中使用一次，恢复 ${CONFIDANT_RESTORE_SP} 点 SP（每 ${CONFIDANT_ITEM_CD_DAYS} 天限一次）`,
    });
  }

  return out;
}

/**
 * 实时根据当前 attributeNames 生成可展示的 title/description。
 * 用于 UI 层，保证用户重命名属性后 buff 文本同步更新（不用重写 DB）。
 */
export function formatBuffDisplay(
  buff: ConfidantBuff,
  arcanaId: string,
  attributeNames?: AttributeNames,
): { title: string; description: string } {
  const names = attributeNames ?? DEFAULT_ATTR_NAMES;
  const attr = buff.attribute;
  const attrLabel = attr ? (names[attr] ?? DEFAULT_ATTR_NAMES[attr]) : '';
  const card = TAROT_BY_ID[arcanaId];
  const name = card?.name ?? '同伴';

  switch (buff.kind) {
    case 'daily_plus':
      return {
        title: `${name}的指引`,
        description: `每天首次为「${attrLabel}」加点时，额外 +${buff.value} 点（乘区外，每日一次）`,
      };
    case 'battle_heal':
      return {
        title: `${name}的慰藉`,
        description: `战斗中使用一次，恢复 ${buff.value} 点 HP（每 ${CONFIDANT_ITEM_CD_DAYS} 天限一次）`,
      };
    case 'damage_plus':
      return {
        title: `${name}的共鸣`,
        description: `「${attrLabel}」属性技能永久 +${buff.value} 点固定伤害`,
      };
    case 'battle_sp':
      return {
        title: `${name}的余韵`,
        description: `战斗中使用一次，恢复 ${buff.value} 点 SP（每 ${CONFIDANT_ITEM_CD_DAYS} 天限一次）`,
      };
    default:
      return { title: buff.title || '同伴能力', description: buff.description || '' };
  }
}

/**
 * 聚合多个同伴的 daily_plus buff，返回 {attributeId → 额外点数} 映射。
 * 用于 applySkillBonus 计算乘区外 flat bonus。
 * 仅未归档、有对应 buff 的同伴参与。
 */
export function sumDailyPlus(
  confidants: Array<{ buffs?: ConfidantBuff[]; archivedAt?: Date | null }>
): Partial<Record<AttributeId, number>> {
  const out: Partial<Record<AttributeId, number>> = {};
  for (const c of confidants) {
    if (c.archivedAt) continue;
    for (const b of c.buffs ?? []) {
      if (b.kind !== 'daily_plus' || !b.attribute) continue;
      out[b.attribute] = (out[b.attribute] ?? 0) + b.value;
    }
  }
  return out;
}

/** 聚合 damage_plus buff（战斗伤害 flat 加成） */
export function sumDamagePlus(
  confidants: Array<{ buffs?: ConfidantBuff[]; archivedAt?: Date | null }>
): Partial<Record<AttributeId, number>> {
  const out: Partial<Record<AttributeId, number>> = {};
  for (const c of confidants) {
    if (c.archivedAt) continue;
    for (const b of c.buffs ?? []) {
      if (b.kind !== 'damage_plus' || !b.attribute) continue;
      out[b.attribute] = (out[b.attribute] ?? 0) + b.value;
    }
  }
  return out;
}

/** 获取指定类型的可用道具列表（今日未使用） */
export function availableItems(
  confidants: Array<Pick<import('@/types').Confidant, 'id' | 'name' | 'arcanaId' | 'intimacy' | 'buffs' | 'itemUsedDate' | 'archivedAt'>>,
  kind: Extract<ConfidantBuffKind, 'battle_heal' | 'battle_sp'>,
  todayKey: string,
): Array<{
  confidantId: string;
  confidantName: string;
  arcanaId: string;
  buff: ConfidantBuff;
}> {
  const out: ReturnType<typeof availableItems> = [];
  for (const c of confidants) {
    if (c.archivedAt) continue;
    if (isItemOnCooldown(c.itemUsedDate, todayKey)) continue;
    const b = (c.buffs ?? []).find(x => x.kind === kind);
    if (b) {
      out.push({ confidantId: c.id, confidantName: c.name, arcanaId: c.arcanaId, buff: b });
    }
  }
  return out;
}
