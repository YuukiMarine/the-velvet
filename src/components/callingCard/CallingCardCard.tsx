import { motion } from 'framer-motion';
import { useAppStore } from '@/store';
import type { CallingCard } from '@/types';

/**
 * 宣告卡 / 倒计时 视觉组件（v2 lite 版）。
 *
 * 三种 variant：
 *   - 'inline'：极紧凑横条。Dashboard 的问候卡内部使用，1 行标题 + 1 条细进度条
 *   - 'list'：任务页列表里的小卡。比 inline 高一些、有 tone 底纹，但不再用大 cut-in 风格
 *   - 'mini'：保留给后续（结算屏 / picker），与 inline 类似但不响应点击
 *
 * 设计变更说明：上一版（hero / 大号）反馈"过大、压主页",
 * 现在主页只放一条横条，不抢视觉；任务页保留 tone 调色但整体瘦身。
 *
 * 强调色：var(--color-primary) 跟主题；tone 决定背景情绪色。
 */

export interface CallingCardCardProps {
  card: CallingCard;
  variant?: 'inline' | 'list' | 'mini';
  /** 点击整张卡（list 上常用，比如点击进入编辑） */
  onClick?: () => void;
  /** 进度条点击：inline 上用来跳转到 Tasks 页 calling-card 区 */
  onProgressClick?: () => void;
  /** 右上角 ⋯ 菜单内容（list 用） */
  menuSlot?: React.ReactNode;
}

// ── 卡片底色：一律用主题 primary 微染的深色渐变（不再按 tone 分色） ──
// 颜色完全跟随 var(--color-primary)；tone 字段现在只决定纹理形态。
const cardBgStyle = `linear-gradient(135deg, color-mix(in hsl, var(--color-primary) 10%, #0d0d10), color-mix(in hsl, var(--color-primary) 22%, #1a1a20))`;

const SUBTLE_INK = 'rgba(255,255,255,0.55)';

export function CallingCardCard({
  card, variant = 'list', onClick, onProgressClick, menuSlot,
}: CallingCardCardProps) {
  const { getCallingCardProgress } = useAppStore();
  const prog = getCallingCardProgress(card.id);

  const overall = Math.round((prog?.overallProgress ?? 0) * 100);
  const daysLeft = prog?.daysLeft;
  const isUrgent = !card.archived && card.targetDate && daysLeft !== undefined && daysLeft <= 7 && daysLeft > 0;
  const isInlineUrgent = !card.archived && card.targetDate && daysLeft !== undefined && daysLeft <= 3 && daysLeft > 0;
  const isToday = !card.archived && card.targetDate && daysLeft === 0;

  // 主信息文字：用一句话概括"还差多少"
  const summaryText = (() => {
    if (card.archived) {
      return card.archiveReason === 'auto_todos' ? '已达成'
           : card.archiveReason === 'auto_date' ? '已至期'
           : '已收存';
    }
    if (card.mode === 'todos') {
      return prog ? `已完成 ${prog.todosDone ?? 0}/${prog.todosTotal ?? 0} 项` : '';
    }
    if (isToday) return '就是今天';
    if (daysLeft !== undefined) return `还剩 ${daysLeft} 天`;
    return '';
  })();

  // ── inline 变体：极简横条（Dashboard 问候卡内嵌） ─────
  if (variant === 'inline') {
    return (
      <motion.button
        type="button"
        onClick={onProgressClick ?? onClick}
        whileTap={{ scale: 0.99 }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="w-full text-left"
        aria-label={`倒计时：${card.title}，${summaryText}，${overall}%`}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="text-sm flex-shrink-0">{card.icon || '✦'}</span>
            <span className="text-sm font-bold truncate text-current">
              {card.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span
              className={`text-xs font-bold tabular-nums ${isInlineUrgent ? 'px-2 py-0.5 rounded-lg text-white' : ''}`}
              style={isInlineUrgent
                ? {
                    background: '#dc2626',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 8px 18px rgba(220,38,38,0.32)',
                  }
                : undefined}
            >
              {summaryText}
            </span>
            {isInlineUrgent && (
              <motion.span
                aria-hidden
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: '#ef4444', boxShadow: '0 0 6px #ef4444' }}
              />
            )}
            <span className="text-[10px] tabular-nums opacity-60">{overall}%</span>
          </div>
        </div>
        <div className="relative h-1 rounded-full overflow-hidden bg-current/15">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${overall}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute top-0 left-0 h-full rounded-full"
            style={{ background: 'currentColor', opacity: 0.85 }}
          />
        </div>
      </motion.button>
    );
  }

  // ── list / mini 变体：任务页的小卡 ─────────────────────
  // ⚠️ 结构说明（修复"⋯ 菜单不弹出 / 无法删除"的关键）：
  //   外层 motion.div 不再使用 overflow-hidden —— 否则下拉菜单会被矩形 clip。
  //   把"需要被圆角裁剪的视觉层"（背景渐变 + SVG 条纹）放到一个 inset-0 的子层，
  //   它单独 overflow-hidden + rounded-xl，content 与下拉菜单走另一层不被裁。
  const isMini = variant === 'mini';

  return (
    <motion.div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`relative rounded-xl shadow-sm ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* —— 视觉裁剪层：背景渐变 + 纹理 SVG 都关在这里，rounded-xl 圆角生效 —— */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
        style={{ background: cardBgStyle }}
      >
        <TexturePattern card={card} />
      </div>

      {/* —— 内容层：相对定位让子元素的 absolute 都基于这层 ——
          单行结构 = 极致紧凑：icon + 标题 + 状态文字 + 百分比 + ⋯
          进度条单独一行紧贴在下面（高度 4px） */}
      <div className={`relative ${isMini ? 'p-2' : 'px-3 py-2.5'}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-sm flex-shrink-0">{card.icon || '✦'}</span>
          <span
            className="font-bold truncate text-sm flex-1 min-w-0"
            style={{ color: 'var(--color-primary)' }}
          >
            {card.title}
          </span>
          {card.pinned && !card.archived && (
            <span className="text-[9px] px-1 rounded font-bold flex-shrink-0" style={{
              background: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.6)',
            }}>📌</span>
          )}
          {/* 状态文字（仅活跃卡显示，归档卡留给红章） */}
          {!card.archived && summaryText && (
            <span
              className="text-[11px] tabular-nums flex-shrink-0 flex items-center gap-1"
              style={{ color: isUrgent ? '#fca5a5' : SUBTLE_INK }}
            >
              {summaryText}
              {isUrgent && (
                <motion.span
                  aria-hidden
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#ef4444', boxShadow: '0 0 6px #ef4444' }}
                />
              )}
            </span>
          )}
          <span className="text-[10px] tabular-nums font-bold flex-shrink-0" style={{ color: SUBTLE_INK }}>
            {overall}%
          </span>
          {menuSlot}
        </div>

        {/* 进度条 */}
        <div className="relative w-full overflow-hidden rounded-full" style={{ height: 4, background: 'rgba(255,255,255,0.10)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${overall}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="absolute top-0 left-0 h-full rounded-full"
            style={{ background: 'var(--color-primary)' }}
          />
        </div>

        {/* 归档时叠红章 */}
        {card.archived && (
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{ top: '50%', right: 12, transform: 'translateY(-50%) rotate(-10deg)', opacity: 0.85 }}
          >
            <div
              className="px-1.5 py-0.5 rounded text-[9px] font-black tracking-[2px]"
              style={{
                color: 'var(--color-primary)',
                border: `1.5px solid var(--color-primary)`,
                background: 'rgba(0,0,0,0.20)',
              }}
            >
              {card.archiveReason === 'auto_todos' ? 'CLEARED'
               : card.archiveReason === 'auto_date' ? 'EXPIRED'
               : 'ARCHIVED'}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── 纹理图案：tone 字段现在控制"纹理"而非颜色 ───────────────
//   lines  - 斜纹（默认 / 经典）
//   grid   - 网格 / 方格本
//   dots   - 点阵
//   plain  - 纯净（无纹理，只剩底色）
//
// 所有纹理颜色统一使用 var(--color-primary)，opacity 0.10，
// 这样换主题色时整张卡片自动变色，但纹理形态保留用户选择。
//
// 兼容老数据：'red' / 'blue' / 'gold' 三个旧 tone 值映射到 lines / grid / dots
// （即默认"纹理感觉差不多"的视觉迁移）。
function TexturePattern({ card }: { card: CallingCard }) {
  const tone = card.tone;
  const t: 'lines' | 'grid' | 'dots' | 'plain' =
    tone === 'red' ? 'lines'
    : tone === 'blue' ? 'grid'
    : tone === 'gold' ? 'dots'
    : tone;

  if (t === 'plain') return null;

  const stroke = 'color-mix(in hsl, var(--color-primary) 70%, transparent)';

  return (
    <svg className="absolute inset-0 w-full h-full" aria-hidden>
      <defs>
        {t === 'lines' && (
          <pattern id={`tex-${card.id}`} patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke={stroke} strokeWidth="5" opacity="0.14" />
          </pattern>
        )}
        {t === 'grid' && (
          <pattern id={`tex-${card.id}`} patternUnits="userSpaceOnUse" width="14" height="14">
            <path d="M 14 0 L 0 0 0 14" fill="none" stroke={stroke} strokeWidth="0.6" opacity="0.20" />
          </pattern>
        )}
        {t === 'dots' && (
          <pattern id={`tex-${card.id}`} patternUnits="userSpaceOnUse" width="12" height="12">
            <circle cx="2" cy="2" r="1.1" fill={stroke} opacity="0.28" />
          </pattern>
        )}
      </defs>
      <rect width="100%" height="100%" fill={`url(#tex-${card.id})`} />
    </svg>
  );
}
