/**
 * PersonaButton —— 全站按钮原语（PERSONA_UI_REWRITE_GUIDE §8.4 / §17.1）。
 *
 * 三频道三轮廓：
 *   P5 = 厚黑边 + 硬影 + 压下位移（贴纸猛推）；P4 = 胶囊黑边 + 底部厚影（节目按钮）；
 *   P3 = 斜切平行四边形 + 青色底线（战术条）；neutral = 现有圆角风格，旧页面零违和。
 * 频道来源：显式 channel prop > html[data-ui-channel]（useUiChannel 自动继承）。
 *
 * 铁律：P3 的 skew 只作用在容器，文字层反向回正（guide §22.3 字恒水平）；
 * hit area 始终是完整矩形（不用 clip-path 裁按钮本体）。
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'motion/react';
import type { UIChannel } from '../channel';
import { useUiChannel } from '../useUiChannel';
import { channelMotion } from '../motion';
import { P4Flower, P4Sparkle } from '../p4Kit';

export type PersonaButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon';
export type PersonaButtonSize = 'sm' | 'md' | 'lg';

export interface PersonaButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    // onAnimationStart/onDrag* 与 framer HTMLMotionProps 同名不同型，剔除以免类型冲突
    'children' | 'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'
  > {
  channel?: UIChannel;
  variant?: PersonaButtonVariant;
  size?: PersonaButtonSize;
  active?: boolean;
  busy?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children?: ReactNode;
}

/** 尺寸表（guide §17.1）：高度 / 横向 padding / 字号 */
const SIZE: Record<PersonaButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-[42px] px-4 text-sm',
  lg: 'h-[52px] px-[22px] text-base',
};
const ICON_SIZE = 'h-10 w-10 text-xl';

/** 频道 × 变体 → 样式类 + 内联。集中在原语内部（guide §12.3：业务侧禁止拼主题长串） */
const skin = (ch: UIChannel, v: PersonaButtonVariant, active: boolean): { cls: string; style: React.CSSProperties; skew: boolean } => {
  if (ch === 'p5') {
    const base = { skew: false, style: {} as React.CSSProperties };
    switch (v) {
      case 'primary':
        return { ...base, cls: 'font-black tracking-wider text-white border-[3px] border-black rounded-[3px]', style: { background: 'var(--ui-accent)', boxShadow: 'var(--ui-shadow-hard)', textShadow: '1.5px 1.5px 0 #000' } };
      case 'danger':
        return { ...base, cls: 'font-black tracking-wider border-[3px] border-[var(--ui-danger)] rounded-[3px] text-[var(--ui-danger)] bg-black', style: { boxShadow: 'var(--ui-shadow-hard)' } };
      case 'secondary':
        return { ...base, cls: 'font-bold tracking-wide text-[var(--ui-paper)] border-[3px] border-[var(--ui-paper)] rounded-[3px] bg-black', style: { boxShadow: '4px 4px 0 rgba(0,0,0,0.55)' } };
      case 'ghost':
        // 注意：`text-[var(--ui-paper)]/85` 这类 var+透明度修饰符是无效类（Tailwind 仅支持
        // 三元组变量的 / 语法），会静默回落继承色——p5 纸面近白，直接用 white 系
        return { ...base, cls: 'font-bold text-white/85 border-2 border-transparent hover:border-white/40 rounded-[3px]', style: {} };
      case 'icon':
        return { ...base, cls: 'font-black text-white border-[3px] border-black rounded-[3px]', style: { background: 'var(--ui-accent)', boxShadow: '3px 3px 0 #000' } };
    }
  }
  if (ch === 'p4') {
    // p4-redraw 定稿：斜切胶囊（skew + 大圆角），无描边实色块。
    // primary=黑板黄字（active 时橙板黑字=「确认」形态）/ danger=红板白字 / secondary=奶油纸黑字。
    const skewed = { skew: true };
    switch (v) {
      case 'primary':
        return active
          ? { ...skewed, cls: 'font-black tracking-wide text-[#131313] rounded-2xl', style: { background: 'var(--p4-orange, #f9a11b)', boxShadow: '0 3px 0 rgba(19,19,19,0.25)' } }
          : { ...skewed, cls: 'font-black tracking-wide text-[var(--ui-bg)] rounded-2xl', style: { background: '#131313', boxShadow: '0 3px 0 rgba(19,19,19,0.3)' } };
      case 'danger':
        return { ...skewed, cls: 'font-black tracking-wide text-white rounded-2xl', style: { background: 'var(--ui-danger)', boxShadow: '0 3px 0 rgba(19,19,19,0.25)' } };
      case 'secondary':
        return { ...skewed, cls: 'font-black tracking-wide text-[#131313] rounded-2xl', style: { background: 'var(--ui-paper)', boxShadow: '0 3px 0 rgba(19,19,19,0.16)' } };
      case 'ghost':
        return { skew: false, cls: 'font-bold text-[#131313]/80 rounded-full hover:bg-black/5', style: {} };
      case 'icon':
        return { skew: false, cls: 'font-black text-[#131313] rounded-full', style: { background: 'var(--ui-paper)', boxShadow: '0 3px 0 rgba(19,19,19,0.2)' } };
    }
  }
  if (ch === 'p3') {
    const skewed = { skew: true };
    switch (v) {
      case 'primary':
        return { ...skewed, cls: 'font-bold tracking-wide text-[#05070d] border-b-2', style: { background: 'var(--ui-paper)', borderBottomColor: 'var(--ui-accent)', boxShadow: 'var(--ui-shadow-hard)' } };
      case 'danger':
        return { ...skewed, cls: 'font-bold tracking-wide text-white border-b-2', style: { background: '#05070d', borderBottomColor: 'var(--ui-danger)', boxShadow: '3px 3px 0 rgba(255,61,170,0.35)' } };
      case 'secondary':
        return { ...skewed, cls: 'font-bold tracking-wide text-[var(--ui-ink)] border-b-2', style: { background: '#05070d', borderBottomColor: 'rgba(0,216,255,0.4)', boxShadow: '3px 3px 0 rgba(5,7,13,0.6)' } };
      case 'ghost':
        return { skew: false, cls: 'font-semibold text-white/80 border-b border-transparent', style: {} };
      case 'icon':
        return { skew: false, cls: 'font-bold text-[#05070d]', style: { background: 'var(--ui-paper)', boxShadow: '2px 2px 0 rgba(5,7,13,0.6)', borderBottom: '2px solid var(--ui-accent)' } };
    }
  }
  // neutral —— 现状风格
  switch (v) {
    case 'primary':
      return { skew: false, cls: 'font-semibold text-white rounded-xl shadow-md shadow-primary/25', style: { background: 'var(--color-primary)' } };
    case 'danger':
      return { skew: false, cls: 'font-semibold text-white rounded-xl bg-red-500', style: {} };
    case 'secondary':
      return { skew: false, cls: `font-medium rounded-xl bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200 ${active ? 'ring-2 ring-primary/50' : ''}`, style: {} };
    case 'ghost':
      return { skew: false, cls: 'font-medium rounded-xl text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800', style: {} };
    case 'icon':
      return { skew: false, cls: 'font-medium rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', style: {} };
  }
};

const Spinner = () => (
  <span
    aria-hidden
    className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
  />
);

export const PersonaButton = ({
  channel,
  variant = 'primary',
  size = 'md',
  active = false,
  busy = false,
  leadingIcon,
  trailingIcon,
  children,
  className,
  disabled,
  ...rest
}: PersonaButtonProps) => {
  const inherited = useUiChannel();
  const ch = channel ?? inherited;
  const s = skin(ch, variant, active);
  const hit = channelMotion(ch).hit;
  const dead = disabled || busy;

  // p4-redraw：主/危/次按钮自带签名符号（黑黄板=花、红板=白花、奶油=蓝星闪），
  // 调用方显式给 leadingIcon（含 null）即覆盖
  const p4AutoIcon =
    ch === 'p4' && leadingIcon === undefined && variant !== 'ghost' && variant !== 'icon'
      ? variant === 'secondary'
        ? <P4Sparkle size={13} color="var(--ui-accent)" />
        : <P4Flower size={15} />
      : undefined;

  return (
    <motion.button
      type="button"
      whileTap={dead ? undefined : hit}
      disabled={dead}
      aria-busy={busy || undefined}
      className={`relative inline-flex select-none items-center justify-center gap-2 cursor-pointer transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ui-accent)] focus-visible:ring-offset-1 ${variant === 'icon' ? ICON_SIZE : SIZE[size]} ${s.cls} ${className ?? ''}`}
      // skewX 走 motion 独立 transform 通道：whileTap 的 x/y/scale 与之独立合成，
      // 写进 CSS transform 会在按压瞬间被 motion 接管覆盖（Navigation.tsx 同款教训）
      style={{ ...s.style, skewX: s.skew ? -8 : undefined }}
      {...rest}
    >
      {/* P3 斜切容器内文字反向回正（字恒水平） */}
      <span className={`inline-flex items-center gap-2 ${s.skew ? 'skew-x-[8deg]' : ''}`}>
        {busy ? <Spinner /> : leadingIcon ?? p4AutoIcon}
        {children}
        {trailingIcon}
      </span>
    </motion.button>
  );
};
