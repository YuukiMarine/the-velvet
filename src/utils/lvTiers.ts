/**
 * LV Tag 阶位系统
 *
 * 用户的"总等级"（五项属性等级之和）映射到不同的视觉阶位，
 * 每 5 级一档，越高越华丽。阶位名称取自 Persona 系列的主题词，
 * 传递从"旅人初醒"到"愚者之旅"的成长叙事。
 */

export type TierId =
  | 'novice'
  | 'seeker'
  | 'wanderer'
  | 'awakened'
  | 'arcana'
  | 'trickster'
  | 'foolsJourney';

export interface Tier {
  id: TierId;
  /** 触发该阶位的最小 total_lv */
  minLv: number;
  /** 英文称谓（tag 上显示） */
  label: string;
  /** 中文称谓（次要展示） */
  labelZh: string;
  /** 渐变色序列（至少两色；trickster/foolsJourney 用于流动动画） */
  gradient: string[];
  /** 文字颜色 */
  textColor: string;
  /** 是否使用流动动画（25+ 启用） */
  animated: boolean;
  /** 是否有发光描边 */
  glow: boolean;
  /** 发光色（用于 boxShadow） */
  glowColor?: string;
}

const TIERS: Tier[] = [
  {
    id: 'novice',
    minLv: 0,
    label: 'Novice',
    labelZh: '初遇',
    gradient: ['#e5e7eb', '#d1d5db'],
    textColor: '#4b5563',
    animated: false,
    glow: false,
  },
  {
    id: 'seeker',
    minLv: 5,
    label: 'Seeker',
    labelZh: '寻觅者',
    gradient: ['#bfdbfe', '#60a5fa'],
    textColor: '#1e3a8a',
    animated: false,
    glow: true,
    glowColor: 'rgba(96,165,250,0.4)',
  },
  {
    id: 'wanderer',
    minLv: 10,
    label: 'Wanderer',
    labelZh: '漫游者',
    gradient: ['#a7f3d0', '#10b981'],
    textColor: '#064e3b',
    animated: false,
    glow: true,
    glowColor: 'rgba(16,185,129,0.4)',
  },
  {
    id: 'awakened',
    minLv: 15,
    label: 'Awakened',
    labelZh: '觉醒',
    gradient: ['#c4b5fd', '#7c3aed'],
    textColor: '#ffffff',
    animated: false,
    glow: true,
    glowColor: 'rgba(124,58,237,0.5)',
  },
  {
    id: 'arcana',
    minLv: 20,
    label: 'Arcana',
    labelZh: '奥义',
    gradient: ['#fcd34d', '#f59e0b', '#dc2626'],
    textColor: '#ffffff',
    animated: false,
    glow: true,
    glowColor: 'rgba(245,158,11,0.6)',
  },
  {
    id: 'trickster',
    minLv: 25,
    label: 'Trickster',
    labelZh: '怪盗',
    gradient: ['#ec4899', '#a78bfa', '#60a5fa', '#2dd4bf', '#ec4899'],
    textColor: '#ffffff',
    animated: true,
    glow: true,
    glowColor: 'rgba(167,139,250,0.7)',
  },
  {
    id: 'foolsJourney',
    minLv: 30,
    label: "Fool's Journey",
    labelZh: '愚者',
    gradient: [
      '#ef4444',
      '#f59e0b',
      '#eab308',
      '#22c55e',
      '#06b6d4',
      '#6366f1',
      '#a855f7',
      '#ef4444',
    ],
    textColor: '#ffffff',
    animated: true,
    glow: true,
    glowColor: 'rgba(255,255,255,0.6)',
  },
];

/** 按 total_lv 解析应用的阶位 */
export const resolveTier = (totalLv: number): Tier => {
  const lv = Math.max(0, Math.floor(totalLv));
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (lv >= TIERS[i].minLv) return TIERS[i];
  }
  return TIERS[0];
};

/** 距下一阶位还差多少级，已是顶阶则返回 null */
export const lvToNextTier = (totalLv: number): number | null => {
  const current = resolveTier(totalLv);
  const nextIdx = TIERS.findIndex(t => t.id === current.id) + 1;
  if (nextIdx >= TIERS.length) return null;
  return TIERS[nextIdx].minLv - totalLv;
};

/** 由 attributes 数组计算总等级（供 store / sync 复用） */
export const computeTotalLv = (
  attributes: Array<{ level: number; unlocked?: boolean }>
): number => {
  return attributes.reduce((sum, a) => sum + (a.unlocked === false ? 0 : a.level || 0), 0);
};
